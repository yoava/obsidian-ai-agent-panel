import { ClaudeClient, type ClaudeClientOptions } from "./protocol/client";
import {
	isCliId,
	isLocalCommandOutput,
	PROCESS_EXITED,
	type ContentBlock,
	type ContextUsage,
	type PermissionMode,
	type PermissionRequest,
	type PermissionResult,
	type RewindFilesResult,
	PERMISSION_MODES,
	type StreamMessage,
	type UserMessage,
} from "./protocol/types";
import type { BranchFailureReason } from "./state/branch-failure";

/** How a turn ended: its `result`, or the CLI process exiting. */
export type TurnEnd = "result" | "exit";

export interface SessionEvents {
	onStreamMessage(msg: StreamMessage): void;
	onPermissionRequest(req: PermissionRequest): Promise<PermissionResult>;
	onPermissionCancelled(requestId: string): void;
	/** A turn starts or ends; an ending says how: its `result`, or the process exiting. */
	onBusyChanged(busy: boolean, ended: TurnEnd | undefined): void;
	/** The CLI process ended. `error` is set when it died unexpectedly. */
	onEnded(error?: string): void;
	/** A deliberate restart replaced the process; nothing the old one ran will report. */
	onRestarted?(): void;
	/**
	 * A branch's rewind was refused, failed, or its process ended first: the
	 * turns held behind it were not sent, their turn has ended (`exit`), and
	 * the forked process is stopped. With `retry`, the next send forks again
	 * and retries the rewind.
	 */
	onBranchFailed?(failure: BranchFailure): void;
	/** A fork of session `source` starts: the branch's first message, or the retry after a refused rewind (PRD-005.R7). */
	onForkStart?(source: string): void;
	/** The rewound fork reported its session (`system/init`, else the first `result`): the branch is cut, and nothing holds its rewind any longer. */
	onBranchCut?(sessionId: string): void;
	/** JSON-RPC for an in-process MCP server; resolve with its reply. */
	onMcpMessage?(serverName: string, message: unknown): Promise<unknown>;
	/** The initialize handshake's response (command list, supported models). */
	onInitInfo?(info: Record<string, unknown>): void;
	/**
	 * A process is about to start with `--resume sessionId` (the first one, a
	 * restart or a respawn after a crash), forked when a branch (ADR-018
	 * Decision 1): `trusted` resumes it, `foreign` starts that process fresh,
	 * `pending` starts nothing and keeps the resume, the fork, the rewind and
	 * the turn (the launch throws {@link RESUME_PENDING}).
	 */
	mayResume?(sessionId: string): ResumeVerdict;
	/** A process started fresh because `mayResume` refused `sessionId`. */
	onResumeRefused?(sessionId: string): void;
	/** A process reported `system/init`: its CLI exists (DES-002 Missing CLI). */
	onReached?(): void;
	/** A process ended before it reported `system/init`, with its exit code and whether it ran through WSL; before `onEnded`. */
	onExitBeforeInit?(info: { code: number | null; useWsl: boolean }): void;
}

/** A branch's rewind (PRD-002.R15): the user message to cut back to, and the source's latest one, read when sent. */
export interface BranchRewind {
	target: string;
	/** The source session's latest user message as recorded; null when unknown. */
	latest: () => string | null;
}

/** Why a branch's rewind failed, and what the next send retries. */
export interface BranchFailure extends BranchFailureReason {
	/** The fork and rewind the next send makes (`latest` as last sent); null when the resume was dropped. */
	retry: { source: string; target: string; latest: string | null } | null;
}

/**
 * Sees every message and every end of the process a `/clear` is written to
 * (DES-002 Clear transaction) before the session does, keyed to the process
 * generation (`ClaudeSession.generation`). A message it consumes goes no
 * further; `closed` says a process ended, was replaced, or the session was
 * disposed.
 */
export interface ClearGate {
	message(generation: number, msg: StreamMessage): "consume" | "pass";
	closed(generation: number): void;
	/** The user's pick of a mode or model was accepted by the CLI of that process; an open clear keeps it. */
	picked(generation: number, values: { permissionMode?: string; model?: string }): void;
}

/** The answer for a session id a process is to resume (ADR-018 Decision 1). */
export type ResumeVerdict = "trusted" | "pending" | "foreign";

/** The launch error while the device's session record is not migrated yet and does not hold the id. */
export const RESUME_PENDING =
	"The history folder could not be read, so this conversation's Claude Code session cannot be checked yet. Your message is still in the message box; send it again in a moment.";

/** Counts every process any session started, so a process number names one process across sessions. */
let processes = 0;

/** What a replaced process is told when it still asks for something. */
const REPLACED = "Claude Code was restarted.";

export type SessionConfig = Omit<ClaudeClientOptions, "model"> & {
	model?: string;
};

/** Spawn-time options a settings change reaches an open conversation with (DES-002). */
export type LaunchOptions = Partial<
	Pick<SessionConfig, "extraArgs" | "allowBypassPermissions" | "appendSystemPrompt" | "sdkMcpServers">
>;

/**
 * What a launch is, apart from the session it resumes: two configs with the
 * same key start the same process. An Undo compares its key with the tab's at
 * the time it would adopt the process (PRD-001.R38).
 */
export function launchKey(config: SessionConfig): string {
	return JSON.stringify({ ...config, resumeSessionId: undefined, forkSession: undefined, env: undefined });
}

/** Absent, false, empty text and an empty list are the same launch. */
function sameOption(a: unknown, b: unknown): boolean {
	if (Array.isArray(a) || Array.isArray(b)) {
		const x = (a ?? []) as unknown[];
		const y = (b ?? []) as unknown[];
		return x.length === y.length && x.every((item, i) => item === y[i]);
	}
	return (a || false) === (b || false);
}

const CLI_MODES: ReadonlySet<string> = new Set(PERMISSION_MODES);

/**
 * One conversation with Claude Code: owns the CLI process lifecycle, tracks
 * turn state, and forwards protocol events to the view.
 */
export class ClaudeSession {
	private client: ClaudeClient | null = null;
	private disposed = false;
	private busyState = false;
	private restartWhenIdle = false;
	private holds = 0;
	private restartHeld = false;
	/**
	 * Set while a restart waits for the old process to close (PRD-001.R5):
	 * resolves once the replacement has spawned. No client runs meanwhile.
	 */
	private replacing: Promise<void> | null = null;
	/** Turns sent during that wait, for the replacement. */
	private waitingSends: (string | ContentBlock[])[] = [];
	/** Set while turns wait behind a branch rewind; later writes go after them. */
	private delivering: Promise<void> | null = null;
	/**
	 * Permission prompts of the current client still open in the view, each
	 * request by itself; a restart cancels their ids. One set per client, and
	 * no delete by id: a new process numbers its requests afresh, and an answer
	 * to one request must not drop another open under the same id.
	 */
	private openPrompts = new Set<PermissionRequest>();
	/** The current process's number (see {@link processes}); the clear gate keys its events on it. */
	private clientGeneration = 0;
	private gate: ClearGate | null = null;
	private sentTurn = false;
	/**
	 * A branch's rewind, sent before the next turn written (see rewindOnStart),
	 * kept until the fork has a session of its own, so a fork that fails or
	 * dies before then is forked and rewound again.
	 */
	private pendingRewind: BranchRewind | null = null;
	/** The process the pending rewind went to, so a later send on it does not resend it. */
	private rewindSentTo: ClaudeClient | null = null;
	/** The process whose rewind Claude Code made: its `init` gives the fork its session. */
	private rewoundOn: ClaudeClient | null = null;
	sessionId: string | null = null;
	/**
	 * Model the live CLI process was spawned with - `init` reports the id it
	 * resolved to, and a mid-flight setModel() must not be credited with it.
	 */
	private spawnModel: string | undefined;
	private spawnPermissionMode: PermissionMode | undefined;
	/** Counts mode changes; a switch at or below `leftBypassAt` was overtaken by leaving Bypass. */
	private modeGeneration = 0;
	private leftBypassAt = 0;
	/** Counts model picks, so an answer from a replaced process knows whether a newer pick exists. */
	private modelGeneration = 0;
	/** See {@link effective}. */
	private inForce: { permissionMode?: string; model?: string } = {};

	constructor(
		private config: SessionConfig,
		private readonly events: SessionEvents,
		/** The CLI profile this session was launched from. */
		readonly profileId: string
	) {}

	get busy(): boolean {
		return this.busyState;
	}

	get running(): boolean {
		return this.client?.running ?? false;
	}

	/** The current process's number, 0 before one started: an event of a replaced process is told apart by it. */
	get generation(): number {
		return this.clientGeneration;
	}

	/** A turn was sent on this session. */
	get sent(): boolean {
		return this.sentTurn;
	}

	setClearGate(gate: ClearGate | null): void {
		this.gate = gate;
	}

	/**
	 * Write `/clear` to the running process (PRD-001.R38). Sets no busy: the
	 * CLI's answer is no turn. False when no process runs.
	 */
	writeClear(): boolean {
		const client = this.client;
		if (!client?.running || this.replacing) return false;
		client.sendUserMessage("/clear", this.sessionId ?? undefined);
		return true;
	}

	/** Replace the running process, which resumes `sessionId` as it is now; nothing when none runs. */
	restart(): void {
		this.restartClient();
	}

	/** Stop the running process and spawn none; later sends start one. A clear that got no answer ends this way. */
	abandon(): void {
		const client = this.client;
		if (!client) return;
		this.replaceAfter(client, false);
		this.events.onRestarted?.();
	}

	/**
	 * A resumed session whose CLI never reported a session id has probably
	 * lost its transcript. Not while a branch's rewind is pending: its fork is
	 * forked and rewound again, and a failure says so itself (PRD-002.R15).
	 */
	get resumeLost(): boolean {
		return !!this.config.resumeSessionId && this.sessionId === null && this.pendingRewind === null;
	}

	/** The mode passed at launch; undefined while the CLI picks its own default. */
	get permissionMode(): PermissionMode | undefined {
		return this.config.permissionMode;
	}

	/** The mode the running process was launched with; undefined = the CLI's default. */
	get spawnedPermissionMode(): PermissionMode | undefined {
		return this.spawnPermissionMode;
	}

	get spawnedModel(): string | undefined {
		return this.spawnModel;
	}

	/** The model later launches use: the last one the CLI accepted. */
	get model(): string | undefined {
		return this.config.model;
	}

	/** Where this session's CLI runs; a respawn always reuses it. */
	get launchTarget(): { cliPath: string; useWsl: boolean } {
		return { cliPath: this.config.cliPath, useWsl: this.config.useWsl === true };
	}

	/**
	 * Truncate this conversation back to a user message before the next turn is
	 * written. Used by "branch from here": the fork starts as a copy of the
	 * whole conversation, and this trims it back to the chosen turn. `latest`
	 * is read when the rewind is sent.
	 */
	rewindOnStart(target: string, latest: () => string | null): void {
		this.pendingRewind = { target, latest };
		this.rewindSentTo = null;
		this.rewoundOn = null;
	}

	/**
	 * The running client, or null when no CLI process is up. Deliberately does
	 * not spawn one: plan usage is worth reporting when a session happens to be
	 * running, never worth starting a process for.
	 */
	get liveClient(): ClaudeClient | null {
		return this.client;
	}

	/**
	 * Throws {@link RESUME_PENDING} when a send now would launch a process
	 * whose resume cannot be judged yet; changes nothing. Asked before the
	 * caller consumes the message, so the throw loses none of it.
	 */
	checkResume(): void {
		if (this.disposed || (this.client && !this.replacing)) return;
		const resume = this.sessionId ?? this.config.resumeSessionId;
		if (resume !== undefined && this.events.mayResume?.(resume) === "pending") throw new Error(RESUME_PENDING);
	}

	/** Send a user turn; spawns the CLI process on first use. */
	send(content: string | ContentBlock[]): void {
		if (this.disposed) throw new Error("Session disposed");
		this.sentTurn = true;
		// A turn never runs on a process the held changes have outdated.
		if (this.restartHeld && this.client && !this.busyState) this.restartClient();
		// Nor on the process a restart is ending: it waits for the replacement.
		if (this.replacing) {
			this.waitingSends.push(content);
			this.setBusy(true);
			return;
		}
		const client = this.ensureClient();
		this.setBusy(true);
		// Turns a pending resume held back go first.
		this.deliver(client, [...this.waitingSends.splice(0), content]);
	}

	/** Write user turns in order, behind the pending rewind and any turns already waiting for it. */
	private deliver(client: ClaudeClient, contents: (string | ContentBlock[])[]): void {
		// A client no longer current (exited, replaced, or ended by a failed
		// rewind) gets nothing, the turns behind that rewind included.
		const write = () => {
			if (this.client !== client) return;
			for (const content of contents) client.sendUserMessage(content, this.sessionId ?? undefined);
		};
		const rewind = this.rewindSentTo === client ? null : this.pendingRewind;
		if (rewind) {
			this.rewindSentTo = client;
			// The fork starts here, at the branch's first message and again at each retry (PRD-005.R7).
			const source = this.config.resumeSessionId;
			if (this.config.forkSession && source) this.events.onForkStart?.(source);
		}
		// The rewind has to land before the turn, so the turn continues from the chosen point.
		const before = rewind === null ? this.delivering : this.rewindBranch(client, rewind);
		if (!before) {
			write();
			return;
		}
		const done = before.then(write);
		this.delivering = done;
		const clear = () => {
			if (this.delivering === done) this.delivering = null;
		};
		done.then(clear, clear);
	}

	/**
	 * A branch's rewind on `client` (PRD-002.R15). Refused or failed, or the
	 * process ended first: no turn is written, a current fork is stopped
	 * through the restart's wait (so a send meanwhile waits for it to close),
	 * the rewind stays armed for the next send, which forks the source
	 * afresh, and `onBranchFailed` says why. Never rejects, since later writes
	 * wait on it.
	 */
	private async rewindBranch(client: ClaudeClient, rewind: BranchRewind): Promise<void> {
		const latest = rewind.latest();
		let failure: BranchFailureReason;
		try {
			// Stored ids come from files the user may edit: only lowercase UUIDs (ADR-018 Decision 1) are sent.
			if (!isCliId(rewind.target) || (latest !== null && !isCliId(latest)))
				throw new Error("The stored message to branch from is not a valid message id");
			const result = await client.rewindConversation(rewind.target, latest);
			if (result.rewound) {
				this.rewoundOn = client;
				return;
			}
			failure = { reason: result.reason ?? null, detail: result.error || "Claude Code did not rewind the conversation" };
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			failure = { reason: detail === PROCESS_EXITED ? "exited" : null, detail };
		}
		if (this.disposed) return;
		const current = this.client === client;
		// An exited fork ended its turn and reported its end already.
		if (!current && this.client !== null) return;
		if (current) this.replaceAfter(client, false);
		const source = this.sessionId === null ? this.config.resumeSessionId : undefined;
		const retry =
			this.pendingRewind === rewind && source ? { source, target: rewind.target, latest } : null;
		try {
			try {
				if (current) this.setBusy(false, "exit");
			} finally {
				this.events.onBranchFailed?.({ ...failure, retry });
			}
		} catch (err) {
			console.error("AI Agent Panel: reporting a failed branch rewind failed", err);
		}
	}

	/**
	 * Spawn the CLI without sending anything, so a restart (an effort change) is
	 * absorbed while the user is still typing instead of on their next send.
	 * During a restart's wait the replacement spawns anyway, so nothing does.
	 */
	warmUp(): void {
		if (this.disposed || this.replacing) return;
		try {
			this.ensureClient();
		} catch (err) {
			this.events.onEnded(err instanceof Error ? err.message : String(err));
		}
	}

	private ensureClient(): ClaudeClient {
		if (this.client) return this.client;
		// A process a restart replaced (or a disposed session's) reaches nothing:
		// its late messages, requests and close are dropped, its prompts denied.
		const current = () => this.client === client;
		const generation = (this.clientGeneration = ++processes);
		const prompts = new Set<PermissionRequest>();
		let reached = false;
		let resume = this.sessionId ?? this.config.resumeSessionId;
		const verdict = resume !== undefined && this.events.mayResume ? this.events.mayResume(resume) : "trusted";
		// Nothing starts and nothing is dropped: the next attempt judges again.
		if (verdict === "pending") throw new Error(RESUME_PENDING);
		if (resume !== undefined && verdict === "foreign") {
			// The session is not one this device recorded: neither it nor a fork of it, nor a rewind.
			const refused = resume;
			resume = undefined;
			this.clearResume();
			this.config = { ...this.config, forkSession: false };
			this.events.onResumeRefused?.(refused);
		}
		const client: ClaudeClient = new ClaudeClient(
			{
				...this.config,
				// After a crash or restart, pick the conversation back up.
				resumeSessionId: resume,
			},
			{
				onStreamMessage: (msg) => {
					if (!current()) return;
					if (!reached && msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
						reached = true;
						this.events.onReached?.();
					}
					if (this.gate?.message(generation, msg) === "consume") return;
					this.handleStreamMessage(msg);
				},
				onPermissionRequest: (req) => {
					if (!current()) return Promise.resolve({ behavior: "deny", message: REPLACED });
					prompts.add(req);
					return this.events.onPermissionRequest(req).finally(() => prompts.delete(req));
				},
				onPermissionCancelled: (id) => {
					if (current()) this.events.onPermissionCancelled(id);
				},
				onMcpMessage: this.events.onMcpMessage
					? (server, message) =>
							current() ? this.events.onMcpMessage!(server, message) : Promise.reject(new Error(REPLACED))
					: undefined,
				onInitInfo: this.events.onInitInfo
					? (info) => {
							if (current()) this.events.onInitInfo!(info);
						}
					: undefined,
				onClose: ({ code, error, stderrTail }) => {
					// Stale close after a deliberate restart - ignore.
					if (!current()) return;
					// Ended while its branch rewind was out: the branch failure is the report.
					const rewinding = this.pendingRewind !== null && this.rewindSentTo === client && this.rewoundOn !== client;
					this.client = null;
					this.setBusy(false, "exit");
					this.gate?.closed(generation);
					if (this.disposed) return;
					if (!reached) this.events.onExitBeforeInit?.({ code, useWsl: this.config.useWsl === true });
					const failed = !rewinding && (error || (code !== null && code !== 0));
					this.events.onEnded(
						failed
							? error ??
									`Claude exited with code ${code}${stderrTail ? `\n${stderrTail}` : ""}`
							: undefined
					);
				},
			}
		);
		this.client = client;
		this.openPrompts = prompts;
		this.noRestartOwed();
		this.spawnModel = this.config.model;
		this.spawnPermissionMode = this.config.permissionMode;
		this.inForce = { permissionMode: this.config.permissionMode, model: this.config.model };
		try {
			client.start();
		} catch (err) {
			// A client that never started must not stay current, or every later
			// send would be written to a process that does not exist.
			this.client = null;
			throw err;
		}
		return client;
	}

	/**
	 * A control request outside any turn, for the panel's own slash commands.
	 * Spawns the CLI when it is not running; that costs no tokens.
	 */
	async control(
		request: { subtype: string; [key: string]: unknown },
		timeoutMs?: number
	): Promise<unknown> {
		return this.withClient((client) => client.controlRequest(request, timeoutMs));
	}

	/**
	 * Rewind the files the CLI's checkpoints track to a user message, or with
	 * `dryRun` only preview it. Spawns the CLI without a prompt when none runs.
	 */
	async rewindFiles(userMessageId: string, dryRun: boolean): Promise<RewindFilesResult> {
		const result = await this.withClient((client) => client.rewindFiles(userMessageId, dryRun));
		// A reply that can rewind came from the resumed session's checkpoints, so
		// the resume worked though no turn has reported the session id yet. A
		// fork gets its own id only from its first turn.
		if (result.canRewind && !this.config.forkSession) this.sessionId ??= this.config.resumeSessionId ?? null;
		return result;
	}

	/** A turn sent during a restart's wait, or behind a rewind, is written first, so its Stop reaches it. */
	async interrupt(): Promise<void> {
		while (this.pending) await this.pending;
		if (this.client?.running) await this.client.interrupt();
	}

	/**
	 * A restart's wait, else turns waiting behind a rewind; null when neither.
	 * Callers loop `while (this.pending) await this.pending;` and act in the
	 * same step as the last check, so a restart that started while they
	 * waited is never missed.
	 */
	private get pending(): Promise<void> | null {
		return this.replacing ?? this.delivering;
	}

	/**
	 * Run `use` on the client, spawned if none runs, after any restart's wait
	 * (so it never spawns a second process) and queued turns; in the same step
	 * as the last check, so a restart cannot slip between choosing the client
	 * and writing to it.
	 */
	private async withClient<T>(use: (client: ClaudeClient) => Promise<T>): Promise<T> {
		if (this.disposed) throw new Error("Session disposed");
		while (this.pending) {
			await this.pending;
			if (this.disposed) throw new Error("Session disposed");
		}
		return use(this.ensureClient());
	}

	/**
	 * Switch the running CLI; later launches use the mode only once it took.
	 * The CLI answers in order, so the last switch it accepted is its mode.
	 * False when leaving Bypass came after this switch was sent: the switch is
	 * then dropped, and a refusal of it is not an error.
	 */
	async setPermissionMode(mode: PermissionMode): Promise<boolean> {
		const generation = ++this.modeGeneration;
		const taken = await this.switchLive(
			(client) => client.setPermissionMode(mode),
			() => generation <= this.leftBypassAt,
			() => generation < this.modeGeneration
		);
		if (!taken) return false;
		this.config = { ...this.config, permissionMode: mode };
		this.inForce.permissionMode = mode;
		this.gate?.picked(this.clientGeneration, { permissionMode: mode });
		return true;
	}

	/**
	 * Send a runtime switch to the running CLI; false when `superseded` says
	 * something overtook it. The config takes a switch only once the CLI
	 * accepted it, or at once when no process runs (as during a restart's
	 * wait, so the replacement spawns with it). A process a restart replaced
	 * answers too late to count when `newer` says a later pick exists; else
	 * the replacement, spawned without the switch, is sent it too, so process,
	 * config and view agree. A refusal, or a process that ended with no
	 * replacement, is thrown.
	 */
	private async switchLive(
		send: (client: ClaudeClient) => Promise<void>,
		superseded: () => boolean,
		newer: () => boolean
	): Promise<boolean> {
		let client = this.client?.running ? this.client : null;
		while (client) {
			try {
				await send(client);
			} catch (err) {
				if (superseded()) return false;
				if (!(err instanceof Error && err.message === PROCESS_EXITED)) throw err;
				while (this.pending) await this.pending;
				if (superseded() || newer()) return false;
				const replacement = this.client !== client && this.client?.running ? this.client : null;
				if (!replacement) throw err;
				client = replacement;
				continue;
			}
			if (superseded()) return false;
			const current: ClaudeClient | null = this.client;
			if (current === client) break;
			if (newer()) return false;
			if (!current?.running) break;
			client = current;
		}
		return !superseded();
	}

	/**
	 * The mode the handshake reply reports fills `effective` when the launch
	 * passed none and no accepted pick or report has set a mode since: a launch with
	 * no mode flag runs the CLI's configured default, which only this reply
	 * names (PRD-001.R38). It never replaces a pick, a report or the launch's
	 * mode, and a value that is not one of the CLI's modes is not taken.
	 */
	noteHandshakeMode(mode: unknown): void {
		if (typeof mode !== "string" || !CLI_MODES.has(mode)) return;
		// A CLI that starts in Bypass with the setting off is never a mode to keep.
		if (mode === "bypassPermissions" && !this.config.allowBypassPermissions) return;
		if (this.inForce.permissionMode !== undefined) return;
		this.inForce.permissionMode = mode;
	}

	/**
	 * The CLI changed mode on its own (e.g. an approved plan left plan mode).
	 * Later launches continue in it rather than in the startup default.
	 */
	adoptPermissionMode(mode: PermissionMode): void {
		// A report from before leaving Bypass must not bring it back.
		if (mode === "bypassPermissions" && !this.config.allowBypassPermissions) return;
		this.config = { ...this.config, permissionMode: mode };
	}

	/**
	 * Switch the running CLI; later launches use the model only once it took.
	 * The CLI answers in order, so the last switch it accepted is its model.
	 * False when a replaced process answered after a newer pick: dropped.
	 */
	async setModel(model: string | undefined): Promise<boolean> {
		const generation = ++this.modelGeneration;
		const taken = await this.switchLive(
			(client) => client.setModel(model),
			() => false,
			() => generation < this.modelGeneration
		);
		if (!taken) return false;
		this.config = { ...this.config, model };
		// Default (undefined) is whatever the CLI picks; it reports it at the next init.
		this.inForce.model = model;
		this.gate?.picked(this.clientGeneration, { model });
		return true;
	}

	async stopTask(taskId: string): Promise<void> {
		while (this.pending) await this.pending;
		if (this.client?.running) await this.client.stopTask(taskId);
	}

	/**
	 * Context-window occupancy, or null when it cannot be had - the CLI rejects
	 * this before the session's first turn, and the process may have exited.
	 */
	async contextUsage(): Promise<ContextUsage | null> {
		if (!this.client?.running) return null;
		try {
			return await this.client.getContextUsage();
		} catch {
			return null;
		}
	}

	/**
	 * The first call of a process that resumes a session and is sent no prompt
	 * (an Undo, PRD-001.R38): its context usage, which only a process that holds
	 * the session answers (V1). Spawns the process. Rejects with the reason when
	 * the CLI answers with an error, the reply is not a usage report (no total, no
	 * categories list), or the process ends first.
	 */
	async probe(): Promise<ContextUsage> {
		const usage = await this.withClient((client) => client.getContextUsage(true));
		if (!usage) throw new Error("Claude Code did not report the session's context usage");
		return usage;
	}

	/**
	 * This session, started by an Undo, becomes a tab's: it runs the session it
	 * resumed, which it reports no id for until a turn (V1).
	 */
	adopt(sessionId: string): void {
		this.sessionId = sessionId;
	}

	/**
	 * The CLI has no `set_effort` control request, and `--effort` is a
	 * spawn-time flag - so the
	 * process is replaced. That is kept invisible: the restart waits for the
	 * current turn to finish, the stale close is swallowed, and the replacement
	 * is spawned and resumed as soon as the old process has closed rather than
	 * on the user's next send.
	 */
	setEffort(effort: string | undefined): void {
		if (this.config.effort === effort) return;
		this.config = { ...this.config, effort };
		this.respawn();
	}

	/** Profile arguments, vault instructions, vault tools and the bypass flag are spawn-time too; same swap as setEffort. */
	setLaunchOptions(options: LaunchOptions): void {
		if (this.updateLaunchOptions(options)) this.respawn();
	}

	/**
	 * The bypass setting went off (PRD-002.R10): later launches lose the flag,
	 * and with `toAsk` the session leaves Bypass for Ask. A running turn is
	 * switched at once; the restart waits for it to end.
	 */
	leaveBypass(toAsk: boolean): void {
		let changed = this.updateLaunchOptions({ allowBypassPermissions: false });
		// A pending switch, Bypass perhaps, must not land after this one.
		if (toAsk) this.leftBypassAt = ++this.modeGeneration;
		if (toAsk && this.config.permissionMode !== "default") {
			this.config = { ...this.config, permissionMode: "default" };
			changed = true;
			// An open clear keeps this mode, not the one before.
			this.gate?.picked(this.clientGeneration, { permissionMode: "default" });
		}
		if (toAsk && this.busyState && this.client?.running)
			void this.client.setPermissionMode("default").catch(() => undefined);
		if (changed) this.respawn();
	}

	/** True when an option differed from the config. */
	private updateLaunchOptions(options: LaunchOptions): boolean {
		const changed = (Object.keys(options) as (keyof LaunchOptions)[]).filter(
			(key) => !sameOption(this.config[key], options[key])
		);
		if (changed.length === 0) return false;
		this.config = { ...this.config, ...options };
		return true;
	}

	/**
	 * Hold restarts until the returned release runs: launch changes made
	 * meanwhile cost one restart, carrying all of them. A held restart still
	 * waits for the turn to end, and a send meanwhile applies it first, so a
	 * turn never runs on a process the held changes made outdated.
	 */
	hold(): () => void {
		this.holds++;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			if (--this.holds === 0 && this.restartHeld) {
				this.restartHeld = false;
				this.respawn();
			}
		};
	}

	private respawn(): void {
		if (!this.client) return;
		if (this.holds > 0) {
			this.restartHeld = true;
			return;
		}
		if (this.busyState) this.restartWhenIdle = true;
		else this.restartClient();
	}

	/** Forget a stale resume id so the next send starts a fresh session, with no branch's rewind. */
	clearResume(): void {
		this.config = { ...this.config, resumeSessionId: undefined };
		this.sessionId = null;
		this.dropRewind();
	}

	private dropRewind(): void {
		this.pendingRewind = null;
		this.rewindSentTo = null;
		this.rewoundOn = null;
	}

	dispose(): void {
		this.disposed = true;
		const stops: Promise<unknown>[] = [];
		// A fork a failed rewind is stopping is still closing.
		if (this.replacing) stops.push(this.replacing);
		if (this.client) stops.push(this.client.stop());
		this.client = null;
		this.gate?.closed(this.clientGeneration);
		this.disposal = Promise.all(stops).then(
			() => undefined,
			() => undefined
		);
	}

	/** Resolves once every process this session started has closed; after `dispose`, so a successor does not overlap it. */
	private disposal: Promise<void> = Promise.resolve();

	get closed(): Promise<void> {
		return this.disposal;
	}

	private handleStreamMessage(msg: StreamMessage): void {
		// A result reaches the view whole before the restart it owes, so the old
		// turn is recorded before anything the restart's exit completes (a clear).
		try {
			this.applyStreamMessage(msg);
		} finally {
			if (msg.type === "result" && !this.busyState && this.restartWhenIdle) this.restartClient();
		}
	}

	private applyStreamMessage(msg: StreamMessage): void {
		let failure: { err: unknown } | null = null;
		this.noteEffective(msg);
		if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
			this.sessionId = (msg as { session_id?: string }).session_id ?? this.sessionId;
			this.adoptBranchSession();
		} else if (msg.type === "result") {
			// A fork whose turn ends without an init (an empty /compact) still names its session here.
			const id = (msg as { session_id?: unknown }).session_id;
			if (this.rewoundOn !== null && this.rewoundOn === this.client && typeof id === "string" && id)
				this.sessionId = id;
			this.adoptBranchSession();
			// The result reaches the view even when the busy callback throws, which is then logged.
			try {
				this.setBusy(false, "result", false);
			} catch (err) {
				failure = { err };
			}
		} else if (
			msg.type === "assistant" ||
			(msg.type === "user" && !isLocalCommandOutput(msg as UserMessage)) ||
			msg.type === "stream_event"
		) {
			// A message queued mid-turn may start a new turn after the previous
			// result already cleared busy - re-arm on any turn activity. A local
			// command's replayed output (an idle model change) is none.
			this.setBusy(true);
		}
		this.events.onStreamMessage(msg);
		// Contained, so the client's line loop goes on with the rest of the chunk.
		if (failure) console.error("AI Agent Panel: the busy callback failed at a turn's end", failure.err);
	}

	/** What the CLI reports of its mode and model, init and status alike, is what it runs with. */
	private noteEffective(msg: StreamMessage): void {
		const raw = msg as { type?: string; subtype?: string; model?: unknown; permissionMode?: unknown };
		if (raw.type !== "system" || (raw.subtype !== "init" && raw.subtype !== "status")) return;
		if (typeof raw.permissionMode === "string" && raw.permissionMode) this.inForce.permissionMode = raw.permissionMode;
		if (raw.subtype === "init" && typeof raw.model === "string" && raw.model) this.inForce.model = raw.model;
	}

	/**
	 * The CLI's mode and model as it runs them now (PRD-001.R38): what the
	 * launch asked for until it reports, then its last report, then each
	 * switch it accepted. Compared with a new session's report after a clear.
	 */
	get effective(): { permissionMode?: string; model?: string } {
		return { ...this.inForce };
	}

	/**
	 * Set the mode and model again on the running process, which a clear's new
	 * session did not keep (PRD-001.R38). A mode that took is also the launch
	 * config's, so a restart carries it; the model config is left as it is.
	 * Rejects when the CLI refuses either or the process is gone or replaced.
	 */
	async reapply(values: { permissionMode?: string; model?: string }): Promise<{ modeSkipped: boolean }> {
		const client = this.client;
		if (!client?.running || this.replacing) throw new Error(PROCESS_EXITED);
		const taken = this.modeGeneration;
		// Nothing is written once the process is no longer the current one.
		const same = () => {
			if (this.client !== client) throw new Error(PROCESS_EXITED);
		};
		// Bypass is never sent once the setting is off; the caller is told it was skipped.
		const modeSkipped = values.permissionMode === "bypassPermissions" && !this.config.allowBypassPermissions;
		if (values.permissionMode !== undefined && !modeSkipped) {
			await client.setPermissionMode(values.permissionMode as PermissionMode);
			same();
			// A pick or leaving Bypass since this began is newer.
			const overtaken = taken !== this.modeGeneration || (values.permissionMode === "bypassPermissions" && !this.config.allowBypassPermissions);
			if (!overtaken) {
				this.inForce.permissionMode = values.permissionMode;
				this.config = { ...this.config, permissionMode: values.permissionMode as PermissionMode };
			}
		}
		// A model key with no value sets Default, as `setModel(undefined)` does.
		if ("model" in values) {
			await client.setModel(values.model);
			same();
			this.inForce.model = values.model;
		}
		return { modeSkipped };
	}

	/**
	 * The branch now has an identity of its own: forking again on the next
	 * restart would branch off the branch, so the flag is spent. Once its
	 * rewind succeeded on this process the history was cut, so a restart
	 * resumes it as it is, and the rewind is released with the session id;
	 * never without one.
	 */
	private adoptBranchSession(): void {
		if (!this.sessionId) return;
		if (this.config.forkSession) this.config = { ...this.config, forkSession: false };
		if (this.rewoundOn !== null && this.rewoundOn === this.client) {
			this.dropRewind();
			this.events.onBranchCut?.(this.sessionId);
		}
	}

	/** A turn starts, or ends with its reason: never an end without one. */
	private setBusy(busy: true): void;
	private setBusy(busy: false, ended: TurnEnd, restart?: boolean): void;
	private setBusy(busy: boolean, ended?: TurnEnd, restart = true): void {
		if (this.busyState === busy) return;
		this.busyState = busy;
		// The owed restart first: a throwing callback must not strand it.
		try {
			if (!busy && restart && this.restartWhenIdle) this.restartClient();
		} finally {
			this.events.onBusyChanged(busy, busy ? undefined : ended);
		}
	}

	/** A process starting now is built from the whole config, so no restart is owed. */
	private noRestartOwed(): void {
		this.restartHeld = false;
		this.restartWhenIdle = false;
	}

	/**
	 * Replace a live process. The replacement spawns once the old one has
	 * closed, or at its SIGKILL, so one process runs per conversation
	 * (PRD-001.R5). It is built from the config as it is then, so a change
	 * made during the wait (leaving Bypass included) is in it. A session with
	 * no process gets none, so this never spawns one for a conversation the
	 * user has not started.
	 */
	private restartClient(): void {
		this.noRestartOwed();
		const old = this.client;
		if (!old) return;
		this.replaceAfter(old, true);
		this.events.onRestarted?.();
	}

	/**
	 * Stop the current process `old`; turns sent meanwhile wait for it to
	 * close and go to the next one, which spawns then, or with `warm` even
	 * when none waits. Its open prompts are cancelled.
	 */
	private replaceAfter(old: ClaudeClient, warm: boolean): void {
		const generation = this.clientGeneration;
		this.client = null;
		this.gate?.closed(generation);
		// Its open prompts can no longer be answered; the view settles them as cancelled.
		const prompts = new Set([...this.openPrompts].map((req) => req.requestId));
		this.openPrompts = new Set();
		this.replacing = old
			.stop()
			.then(() => this.spawnReplacement(warm))
			.catch((err) => console.error("AI Agent Panel: starting the replacement Claude Code process failed", err));
		for (const id of prompts) this.events.onPermissionCancelled(id);
	}

	/** The old process closed: spawn the replacement and send the turns that waited for it. */
	private spawnReplacement(warm: boolean): void {
		this.replacing = null;
		const sends = this.waitingSends.splice(0);
		if (this.disposed) return;
		if (sends.length === 0) {
			if (warm) this.warmUp();
			return;
		}
		try {
			const client = this.ensureClient();
			this.setBusy(true);
			this.deliver(client, sends);
		} catch (err) {
			// A pending resume loses nothing: the turns wait for the next send.
			if (err instanceof Error && err.message === RESUME_PENDING) this.waitingSends = sends;
			// The replacement did not start; the waiting turns end with it.
			try {
				this.setBusy(false, "exit");
			} finally {
				this.events.onEnded(err instanceof Error ? err.message : String(err));
			}
		}
	}
}

/**
 * Hold every given session (a null is skipped); the one release lets them all
 * go, a throwing one not keeping the rest held, and rethrows the first error.
 */
export function holdAll(sessions: Iterable<ClaudeSession | null | undefined>): () => void {
	const releases: (() => void)[] = [];
	for (const session of sessions) if (session) releases.push(session.hold());
	return () => {
		let failure: unknown;
		let failed = false;
		for (const release of releases) {
			try {
				release();
			} catch (err) {
				if (!failed) failure = err;
				failed = true;
			}
		}
		if (failed) throw failure;
	};
}
