import { Notice } from "obsidian";
import { profileLaunchArgs, relaunchOptions } from "../cli-args";
import type { StoredConversation } from "../history";
import type { ContextUsage } from "../protocol/types";
import {
	ClaudeSession,
	holdAll,
	launchKey,
	RESUME_PENDING,
	type BranchRewind,
	type ClearGate,
	type ResumeVerdict,
	type SessionConfig,
	type SessionEvents,
} from "../session";
import {
	cliPermissionMode,
	defaultProfile,
	profileById,
	profileLabel,
	reportedModeEntry,
	settingsLaunchOptions,
	type AgentPanelSettings,
	type ChatPermissionMode,
	type CliProfile,
} from "../settings-core";
import { unadoptedMcp } from "../mcp/replies";
import { freshStartDue } from "../state/boundary-records";
import { stripBranch, type PendingBranch } from "../state/branch-history";
import type { CliConfig, CliStartReports } from "../state/cli-missing";
import { BranchHold, BranchIntent } from "../state/branch-hold";
import { isSessionId } from "../state/session-id";
import type { ModeState, StatusData } from "../state/tab";

/** `vetResume` could not judge yet. */
const PENDING = Symbol("pending");

/** The tab as its session link reads and sets it: the status line's picks and mode. */
export interface LinkedTab {
	readonly status: Readonly<StatusData>;
	setMode(mode: Partial<ModeState>): void;
}

/** What a session link needs of the plugin and its tab. */
export interface SessionLinkHost {
	tab: LinkedTab;
	settings: () => AgentPanelSettings;
	/** Where the profile's CLI is, and the configuration that answer belongs to (DES-002 Missing CLI). */
	resolveCli: (profile: CliProfile) => Promise<{ cliPath: string; useWsl: boolean; checked?: CliConfig | null } | null>;
	vaultPath: () => string;
	/** The tab's conversation, and a save of it (DES-005). */
	conversation: () => StoredConversation | null;
	save: (conversation: StoredConversation) => void;
	/** The session's events, routed by the tab (DES-002); `onInitInfo` reaches `onInit` first. */
	events: Omit<SessionEvents, "onInitInfo" | "onBranchCut" | "mayResume" | "onResumeRefused" | "onReached" | "onExitBeforeInit">;
	/** The initialize reply: models and commands for the plugin (DES-002). */
	onInit: (profileId: string, info: Record<string, unknown>) => void;
	/** Launched without a mode, the CLI reported its configured default. */
	rememberStartupMode: (profileId: string, mode: string) => void;
	/** What a start tells the plugin about the profile's CLI being there or not (DES-002 Missing CLI). */
	cli?: CliStartReports;
	/** An error outside a turn (CLI not found, a profile that cannot launch). */
	showError: (message: string) => void;
	/** A restore of this tab is between its preview and its end (DES-004). */
	restoring: () => boolean;
	/** Whether Restore files shows changed: the session or its stored id. */
	onSessionChanged: () => void;
	/**
	 * The one decision for a stored session id (ADR-018 Decision 1): `trusted`
	 * when this device recorded it for the tab's conversation and `profileId`
	 * (known without a scan), `pending` when the record is not migrated yet and
	 * lacks it, else `foreign`. Asked at every process start.
	 */
	decide: (sessionId: string, profileId: string) => ResumeVerdict;
	/**
	 * Wait for the first history scan, and look again when it left the
	 * migration pending (a failed listing), so `decide` can answer.
	 */
	resolve: () => Promise<void>;
	/** A session the CLI is to start joins the device's record: the fork that was cut, `started` (ADR-018). */
	recordSession: (sessionId: string, profileId: string, started: boolean) => void;
	/**
	 * A session starts without `--resume` in a conversation (ADR-018): the
	 * fresh-start record when `record`, with the id not resumed if any, and
	 * the notice when a stored session was refused.
	 */
	onFreshStart: (start: { record: boolean; sessionId?: string; notice: boolean }) => void;
	/** Sees each session's messages and ends before the session does: the tab's clear (PRD-001.R38). */
	clearGate: ClearGate;
}

/**
 * One tab's CLI session (ADR-016 `tab/session-link`; DES-002): created on
 * first use with the launch options a new conversation gets, resumed or
 * forked, relaunched when the launch settings change, left in Ask when
 * Bypass is turned off, and the model, effort and mode calls with their
 * rollback.
 */
export class SessionLink {
	private current: ClaudeSession | null = null;
	/** In-flight creation, so concurrent sends do not spawn duplicates. */
	private init: Promise<boolean> | null = null;
	private closed = false;
	/** The stored session the next launch resumes, if any; a string failing the grammar is kept to be refused (ADR-018). */
	private resumeId: string | null = null;
	/** A fresh start was recorded when the resume was lost, so the next session's launch records none. */
	private bounded = false;
	/** The current session was launched without `--resume`: its id is one this panel began (ADR-018). */
	private launchedFresh = false;
	/** Launch the next session as a branch of `resumeId` rather than continuing it. */
	private fork = false;
	/**
	 * A branch's rewind, held until one succeeds: each session this link
	 * creates meanwhile gets it, so a session dropped after a failed rewind
	 * (a profile change) does not leave the next fork uncut.
	 */
	private readonly rewind = new BranchHold<BranchRewind, ClaudeSession>();
	/** A branch not yet recorded: its first send records it, before the rewind is written. */
	private readonly unrecorded = new BranchIntent<{ source: string; target: string; latest: () => string | null }>();
	/** The CLI an Undo started beside the session, until it is adopted or stopped (PRD-001.R38). */
	private undoSession: {
		session: ClaudeSession;
		/** Its events reach the tab only once it is the tab's. */
		live: { on: boolean };
		profile: CliProfile;
		cli: { cliPath: string; useWsl: boolean };
		/** What it was launched with, to compare at adoption. */
		key: string;
		id: string;
	} | null = null;
	/** Bumped by every start and stop of an Undo's CLI, so one still being created is discarded. */
	private undoRun = 0;
	/** Resolves once every session this link dropped has closed its processes. */
	private closing: Promise<void> = Promise.resolve();
	/** Bumped by each mode pick and by leaving Bypass; only the latest pick rolls back on a refusal. */
	private modeGeneration = 0;
	/** Mode picks still waiting for the CLI's answer. */
	private pendingPicks = 0;
	/** Model picks still waiting for the CLI's answer. */
	private pendingModels = 0;
	/** See `launchGeneration`. */
	private launchChanges = 0;
	/** While picks are pending, the mode the CLI last accepted, which a refused latest pick goes back to. */
	private confirmedMode: ModeState | null = null;

	constructor(private readonly host: SessionLinkHost) {}

	get session(): ClaudeSession | null {
		return this.current;
	}

	/** Its CLI is starting: a send or a command waits on it. */
	get starting(): boolean {
		return this.init !== null;
	}

	/** A turn runs on the session. */
	get busy(): boolean {
		return this.current?.busy === true;
	}

	get resumeSessionId(): string | null {
		return this.resumeId;
	}

	/** The session was launched without `--resume`, so the id it reports is one this panel began. */
	get startedFresh(): boolean {
		return this.launchedFresh;
	}

	/** The profile the session runs, or the one its next launch takes. */
	get profileId(): string {
		const settings = this.host.settings();
		return this.current?.profileId ?? (profileById(settings, this.host.tab.status.profileId) ?? defaultProfile(settings)).id;
	}

	/** The next launch resumes a stored session (DES-002). */
	resumeFrom(sessionId: string | null): void {
		this.resumeId = sessionId;
		this.bounded = false;
	}

	/**
	 * A branch (DES-004): the next launch forks `sessionId` and rewinds to
	 * `uuid` before its first message, naming `latest()`, the source's latest
	 * user message, as the last one seen.
	 */
	branchFrom(sessionId: string, uuid: string, latest: () => string | null, recorded = false): void {
		this.unrecorded.set(recorded ? null : { source: sessionId, target: uuid, latest });
		this.resumeId = sessionId;
		this.fork = true;
		this.rewind.set({ target: uuid, latest });
	}

	/**
	 * The branch to record with the conversation, once: the send that first
	 * writes its rewind takes it (PRD-002.R15). Null when none, or taken.
	 */
	takeBranchIntent(): PendingBranch | null {
		const intent = this.unrecorded.take();
		return intent && { source: intent.source, target: intent.target, latest: intent.latest() };
	}

	/** The branch whose rewind has not succeeded yet, as a reopen would make it; null when none. */
	pendingBranch(): PendingBranch | null {
		const rewind = this.rewind.held;
		if (!rewind || !this.resumeId) return null;
		return { source: this.resumeId, target: rewind.target, latest: rewind.latest() };
	}

	/** The next launch no longer forks: the pending fork, its rewind and its base go (ADR-018 Decision 1). */
	private dropFork(): void {
		this.fork = false;
		this.unrecorded.set(null);
		this.rewind.clear();
		this.abandonForkBase();
	}

	/** A branch whose first message has not been sent: the next launch would fork and rewind (PRD-001.R38). */
	get unstartedBranch(): boolean {
		return this.fork && this.rewind.held !== null && !this.current?.sent;
	}

	/** A clear in a branch before its first message: the fork and the rewind are dropped and the tab carries on as a new conversation. */
	dropBranch(): void {
		this.resumeId = null;
		this.dropFork();
		// A promptless fork a panel command started would take the next prompt uncut: end it, the next send spawns a fresh session.
		this.drop();
		// The recorded intent would fork again on reopen.
		const conversation = this.host.conversation();
		if (conversation) stripBranch(conversation.messages);
		this.host.onSessionChanged();
	}

	/** The id the session being cleared goes by: its own, else the one it continues; never the source of a fork it has not left. */
	get clearOldId(): string | null {
		return this.current?.sessionId ?? (this.fork ? null : this.resumeId);
	}

	/**
	 * A clear completed (PRD-001.R38): the next launch resumes `sessionId`, the
	 * session the CLI began, or with null starts a new one. Whatever fork was
	 * pending is spent, and the session id is one this panel began.
	 */
	cleared(sessionId: string | null): void {
		this.dropFork();
		this.bounded = false;
		this.resumeId = sessionId;
		this.launchedFresh = true;
		if (sessionId === null) this.current?.clearResume();
		this.host.onSessionChanged();
	}

	/** The fork was dropped without a session of its own: its base no longer applies to anything (PRD-005.R7). */
	abandonForkBase(): void {
		const conversation = this.host.conversation();
		if (conversation?.forkBase && !conversation.forkBase.sessionId) delete conversation.forkBase;
	}

	/** The conversation was deleted: nothing resumes it. */
	forgetResume(): void {
		this.resumeId = null;
		this.unrecorded.set(null);
		this.rewind.clear();
		this.current?.clearResume();
	}

	/** The session, created if the tab has none (the CLI spawns on first use); null when it cannot be, the tab showing why. */
	async ensure(): Promise<ClaudeSession | null> {
		if (this.closed) return null;
		if (!this.current) {
			// One creation for concurrent callers (a double Enter while the CLI path
			// resolves): a second would spawn an orphaned process.
			const created = await (this.init ??= this.create());
			this.init = null;
			if (!created) return null;
			// Closed while the CLI path resolved: nothing would ever dispose it.
			if (this.closed) {
				this.drop();
				return null;
			}
		}
		const session = this.current;
		// A branch's rewind goes to each session this tab gets until one cuts it.
		if (session) this.rewind.give(session, (rewind) => session.rewindOnStart(rewind.target, rewind.latest));
		return session;
	}

	private async create(): Promise<boolean> {
		await this.closing;
		const settings = this.host.settings();
		const status = this.host.tab.status;
		const requested = profileById(settings, status.profileId);
		const profile = requested ?? defaultProfile(settings);
		const cli = await this.host.resolveCli(profile);
		if (!cli) {
			this.host.showError(
				"Claude Code CLI not found. Install it from https://code.claude.com, or set the path in Settings → AI Agent Panel."
			);
			return false;
		}
		// A configured native path that is not there: no session, and the page learns of it.
		const absent = this.host.cli?.absent(profile, cli.checked ?? null);
		if (absent) {
			this.host.showError(absent);
			return false;
		}
		const launch = profileLaunchArgs(profile, cli);
		if (launch.error) {
			this.host.showError(`${launch.error}\n\nFix the "${profileLabel(profile)}" profile in Settings → AI Agent Panel.`);
			return false;
		}
		// A branch of a profile this device lacks is judged foreign, never on the default profile.
		const resumeId = await this.vetResume(profile.id, requested !== undefined || !this.fork);
		if (resumeId === PENDING) {
			this.host.showError(RESUME_PENDING);
			return false;
		}
		if (this.closed) return false;
		this.launchedFresh = resumeId === null;
		this.current = new ClaudeSession(this.launchConfig(profile, cli, launch.args, resumeId, this.fork), this.sessionEvents(profile, cli.checked ?? null), profile.id);
		this.current.setClearGate(this.host.clearGate);
		return true;
	}

	/** The launch of a tab's session under the settings and picks now (DES-002). */
	private launchConfig(
		profile: CliProfile,
		cli: { cliPath: string; useWsl: boolean },
		args: string[],
		resumeId: string | null,
		fork: boolean
	): SessionConfig {
		const status = this.host.tab.status;
		return {
			cliPath: cli.cliPath,
			cwd: this.host.vaultPath(),
			useWsl: cli.useWsl && process.platform === "win32",
			model: status.model || undefined,
			effort: status.effort || undefined,
			// "auto" is ours, not the CLI's: it launches in the normal mode and the
			// tab answers every prompt (DES-004).
			permissionMode: status.inheritMode ? undefined : cliPermissionMode(status.selectedMode),
			resumeSessionId: resumeId ?? undefined,
			...settingsLaunchOptions(this.host.settings()),
			forkSession: fork,
			// Our own turns are echoed back with their uuids only when this is on,
			// and Restore files and Branch key off those uuids.
			replayUserMessages: true,
			extraArgs: args,
		};
	}

	/** What the tab does with a session's events; `checked` is the configuration its CLI was resolved under, which its reports are about. */
	private sessionEvents(profile: CliProfile, checked: CliConfig | null): SessionEvents {
		let notFound: string | null = null;
		return {
			...this.host.events,
			onReached: () => this.host.cli?.reached(profile, checked),
			// A WSL launch the distro's shell could not find ends with the missing-CLI message rather than "exited with code 127".
			onExitBeforeInit: (info) => {
				notFound = this.host.cli?.exitedBeforeInit(profile, checked, info) ?? null;
			},
			onEnded: (error) => {
				const message = error === undefined ? null : notFound;
				notFound = null;
				this.host.events.onEnded(message ?? error);
			},
			// Each process that resumes or forks, a respawn after a crash or an effort change included (ADR-018 Decision 1).
			mayResume: (sessionId) =>
				// A profile this device no longer has is foreign, also for a cached session.
				isSessionId(sessionId) && profileById(this.host.settings(), profile.id)
					? this.host.decide(sessionId, profile.id)
					: "foreign",
			onResumeRefused: (sessionId) => this.resumeRefused(sessionId),
			onBranchCut: (sessionId) => {
				this.rewind.cut();
				// The branch has its own session now: later launches resume it, without forking again.
				this.resumeId = sessionId;
				this.fork = false;
				this.host.recordSession(sessionId, profile.id, true);
				// Its init may never come (a turn that ends at once): the conversation takes the id here.
				const conversation = this.host.conversation();
				if (conversation) {
					conversation.sessionId = sessionId;
					// The fork's first reported session names the session the base comes off (PRD-005.R7).
					if (conversation.forkBase) conversation.forkBase.sessionId = sessionId;
					if (this.current) conversation.profileId = this.current.profileId;
					this.host.save(conversation);
				}
				this.host.onSessionChanged();
			},
			onInitInfo: (info) => {
				this.bounded = false;
				this.host.onInit(profile.id, info);
				const mode = info.current_permission_mode;
				const session = this.current;
				// A mode picked while this reply was in flight is newer than it.
				if (typeof mode !== "string" || !session) return;
				if (session.permissionMode !== session.spawnedPermissionMode) return;
				session.noteHandshakeMode(mode);
				// Launched without a mode, the CLI reports its configured default, worth
				// remembering for conversations that have not started yet.
				if (session.spawnedPermissionMode === undefined) this.host.rememberStartupMode(profile.id, mode);
				this.noteCliMode(mode, false);
			},
		};
	}

	// --- Undo of a clear (PRD-001.R38, DES-002 Clear transaction) ---------------------

	/**
	 * Start a CLI beside the tab's that resumes `sessionId` and is sent no
	 * prompt, with the launch the tab's session would get now. Until it is
	 * adopted nothing it does reaches the tab, but the vault tools it asks for.
	 * False when it cannot start or `stopUndo` came first.
	 */
	async startUndo(sessionId: string, gate: ClearGate): Promise<boolean> {
		this.stopUndo();
		const run = this.undoRun;
		// A candidate stopped just before, or the CLI an adoption replaced, is gone before this one starts.
		await this.closing;
		if (run !== this.undoRun || this.closed) return false;
		const settings = this.host.settings();
		const profile = profileById(settings, this.profileId);
		if (this.closed || !profile || !isSessionId(sessionId)) return false;
		const cli = await this.host.resolveCli(profile).catch(() => null);
		if (!cli || run !== this.undoRun || this.closed) return false;
		const launch = profileLaunchArgs(profile, cli);
		if (launch.error) return false;
		let verdict = this.host.decide(sessionId, profile.id);
		if (verdict === "pending") {
			await this.host.resolve();
			verdict = this.host.decide(sessionId, profile.id);
		}
		if (verdict !== "trusted" || run !== this.undoRun || this.closed) return false;
		const live = { on: false };
		const full = this.sessionEvents(profile, cli.checked ?? null);
		const quiet: SessionEvents = {
			onStreamMessage: (msg) => live.on && full.onStreamMessage(msg),
			onPermissionRequest: (req) =>
				live.on ? full.onPermissionRequest(req) : Promise.resolve({ behavior: "deny", message: "The clear is being undone." }),
			onPermissionCancelled: (id) => live.on && full.onPermissionCancelled(id),
			onBusyChanged: (busy, ended) => live.on && full.onBusyChanged(busy, ended),
			onEnded: (error) => live.on && full.onEnded(error),
			onRestarted: () => live.on && full.onRestarted?.(),
			onBranchFailed: (failure) => live.on && full.onBranchFailed?.(failure),
			onForkStart: (source) => live.on && full.onForkStart?.(source),
			// Until it is the tab's, only the handshake and tool discovery reach the vault server (`unadoptedMcp`).
			onMcpMessage: (server, message) => {
				if (live.on) return full.onMcpMessage!(server, message);
				const gate = unadoptedMcp(message);
				return gate.allow ? full.onMcpMessage!(server, message) : Promise.resolve(gate.reply);
			},
			onInitInfo: (info) => live.on && full.onInitInfo?.(info),
			// Whether the CLI is there is the plugin's to know, adopted or not; the message waits for `onEnded`.
			onReached: () => full.onReached?.(),
			onExitBeforeInit: (info) => full.onExitBeforeInit?.(info),
			mayResume: (id) => full.mayResume!(id),
			onResumeRefused: (id) => live.on && full.onResumeRefused?.(id),
		};
		const config = this.launchConfig(profile, cli, launch.args, sessionId, false);
		const session = new ClaudeSession(config, quiet, profile.id);
		session.setClearGate(gate);
		this.undoSession = { session, live, profile, cli, key: launchKey(config), id: sessionId };
		return true;
	}

	/** Ask the Undo's CLI for the context usage of the session it resumed. */
	probeUndo(): Promise<ContextUsage> {
		return this.undoSession ? this.undoSession.session.probe() : Promise.reject(new Error("The Undo's CLI is not running"));
	}

	/** Stop the Undo's CLI, and any still being created. */
	stopUndo(): void {
		this.undoRun++;
		const undo = this.undoSession;
		this.undoSession = null;
		if (!undo) return;
		undo.session.dispose();
		this.closing = Promise.all([this.closing, undo.session.closed]).then(() => undefined);
	}

	/**
	 * The Undo's CLI becomes the tab's, the one it replaces is stopped. False
	 * when the launch the tab would make now differs from the one the CLI was
	 * started with: another profile, settings, mode, model or effort.
	 */
	adoptUndo(sessionId: string): boolean {
		const undo = this.undoSession;
		if (!undo || this.closed || undo.id !== sessionId) return false;
		const profile = profileById(this.host.settings(), undo.profile.id);
		if (!profile || profile.id !== this.profileId) return false;
		const launch = profileLaunchArgs(profile, undo.cli);
		if (launch.error || launchKey(this.launchConfig(profile, undo.cli, launch.args, sessionId, false)) !== undo.key) return false;
		const old = this.current;
		this.undoSession = null;
		this.current = undo.session;
		undo.live.on = true;
		undo.session.setClearGate(this.host.clearGate);
		undo.session.adopt(sessionId);
		this.dropFork();
		this.bounded = false;
		this.resumeId = sessionId;
		this.launchedFresh = false;
		if (old) {
			old.dispose();
			this.closing = Promise.all([this.closing, old.closed]).then(() => undefined);
		}
		// The swap is done: a failing listener cannot make the Undo fail halfway.
		try {
			this.host.onSessionChanged();
		} catch (err) {
			console.error("AI Agent Panel: session change listener failed", err);
		}
		return true;
	}

	/**
	 * The stored session this launch may resume, or null (ADR-018 Decision 1).
	 * A stored id is used only if it passes the grammar and this device
	 * recorded it for the conversation and the profile that runs it, judged
	 * once the first history scan has ended; otherwise the launch is fresh,
	 * with the notice, and no branch's fork or rewind goes with it. A launch
	 * without `--resume` in a conversation that had turns records a fresh start,
	 * with the id it refused or whose resume failed.
	 */
	private async vetResume(profileId: string, profileKnown: boolean): Promise<string | null | typeof PENDING> {
		const stored = this.resumeId;
		let refused: string | null = null;
		if (stored !== null) {
			let verdict: ResumeVerdict = isSessionId(stored) && profileKnown ? this.host.decide(stored, profileId) : "foreign";
			if (verdict === "pending") {
				await this.host.resolve();
				verdict = this.host.decide(stored, profileId);
			}
			// Still pending: nothing starts, and the stored id, the fork and the rewind stay.
			if (verdict === "pending") return PENDING;
			if (verdict === "trusted") return stored;
			// Kept as stored, a malformed one included, in the boundary.
			refused = stored;
			this.resumeId = null;
			this.dropFork();
		}
		const bounded = this.bounded;
		this.bounded = false;
		const conversation = this.host.conversation();
		const record = !bounded && !!conversation && !this.host.restoring() && freshStartDue(conversation.messages);
		if (record || refused !== null) this.host.onFreshStart({ record, sessionId: refused ?? undefined, notice: refused !== null });
		return null;
	}

	/** A process was to resume `sessionId` and this device did not record it: it started fresh instead (ADR-018 Decision 1). */
	private resumeRefused(sessionId: string): void {
		this.resumeId = null;
		this.dropFork();
		this.launchedFresh = true;
		const conversation = this.host.conversation();
		const record = !!conversation && !this.host.restoring() && freshStartDue(conversation.messages);
		this.host.onFreshStart({ record, sessionId, notice: !!conversation });
	}

	/**
	 * The CLI ended with `error`. A session that lost its resume
	 * (`ClaudeSession.resumeLost`) starts a fresh one on the next message,
	 * said in the returned text. Not while a restore starts the CLI: its point
	 * lives in the stored session (DES-004).
	 */
	endedWith(error: string): string {
		// A launch held back while the record is unmigrated lost no resume.
		if (error === RESUME_PENDING) return error;
		const session = this.current;
		if (!this.resumeId || !session?.resumeLost || this.host.restoring()) return error;
		const conversation = this.host.conversation();
		// The boundary is written now, with the id that was lost, so closing before the next message loses nothing.
		if (conversation && freshStartDue(conversation.messages)) {
			this.host.onFreshStart({ record: true, sessionId: this.resumeId, notice: false });
			this.bounded = true;
		}
		this.resumeId = null;
		this.dropFork();
		session.clearResume();
		this.launchedFresh = true;
		if (conversation) conversation.sessionId = null;
		this.host.onSessionChanged();
		return `${error}\n\nCould not resume the original session - your next message starts a fresh one (the restored transcript above is kept).`;
	}

	/** A profile switch onto a session only a panel command started: the next send starts over. */
	drop(): void {
		const session = this.current;
		if (!session) return;
		session.dispose();
		this.current = null;
		// A fork a failed rewind is stopping, or a process still closing, must be gone before the next session starts.
		this.closing = Promise.all([this.closing, session.closed]).then(() => undefined);
	}

	/** The tab closed. */
	dispose(): void {
		this.closed = true;
		this.stopUndo();
		this.drop();
	}

	/**
	 * Launch settings changed (DES-002): the session swaps its process once
	 * idle, with the options a new conversation would get. One whose CLI moved
	 * (a new path, WSL toggled) keeps its process, as a profile switch does,
	 * and so does one its profile can no longer launch.
	 */
	async relaunch(): Promise<void> {
		const settings = this.host.settings();
		const session = this.current;
		const profile = session && profileById(settings, session.profileId);
		if (!session || !profile) return;
		// A failed lookup keeps the process.
		const cli = await this.host.resolveCli(profile).catch(() => null);
		if (this.current !== session) return;
		const options = relaunchOptions(settings, profile, cli, session.launchTarget);
		if (options) session.setLaunchOptions(options);
	}

	/**
	 * The bypass setting is off (PRD-002.R10): a tab in Bypass switches to
	 * Ask as a pick, and the session drops the bypass flag, whether or not its
	 * CLI can still be resolved.
	 */
	leaveBypass(): void {
		const status = this.host.tab.status;
		const inBypass =
			status.selectedMode === "bypassPermissions" ||
			status.cliMode === "bypassPermissions" ||
			this.current?.permissionMode === "bypassPermissions";
		if (inBypass) {
			// A pick still waiting for the CLI, Bypass perhaps, is neither stored
			// nor rolled back to, and a later refused pick comes back to Ask.
			this.modeGeneration++;
			if (this.confirmedMode) this.confirmedMode = { selectedMode: "default", inheritMode: false, cliMode: null };
			this.host.tab.setMode({ selectedMode: "default", inheritMode: false, cliMode: null });
			const conversation = this.host.conversation();
			if (conversation) {
				conversation.permissionMode = "default";
				conversation.permissionModePicked = true;
				this.host.save(conversation);
			}
		}
		this.current?.leaveBypass(inBypass);
	}

	/** A mode pick waits for the CLI's answer; the tab already shows it. */
	get picking(): boolean {
		return this.pendingPicks > 0;
	}

	/** A mode or model pick waits for the CLI's answer: a swap of the CLI now could be followed by its refusal (PRD-001.R38). */
	get pickPending(): boolean {
		return this.pendingPicks > 0 || this.pendingModels > 0;
	}

	/** Bumped by each launch-settings change, so an Undo started before one is not adopted after it. */
	get launchGeneration(): number {
		return this.launchChanges;
	}

	/** Launch settings changed: called for every tab before any `relaunch` awaits, so none adopts with the old ones meanwhile. */
	invalidateLaunch(): void {
		this.launchChanges++;
	}

	/**
	 * The CLI reported its permission mode: at startup, or (`changed`) on a
	 * switch such as an approved plan leaving plan mode. A mode the popover
	 * offers becomes the tab's selection; a switch is also what later launches
	 * resume in, since a fresh process would start in the configured default.
	 */
	noteCliMode(mode: unknown, changed: boolean): void {
		const tab = this.host.tab;
		if (typeof mode !== "string" || !mode || tab.status.selectedMode === "auto") return;
		const offered = reportedModeEntry(mode).value;
		if (!offered) tab.setMode({ cliMode: mode });
		else if (!changed) tab.setMode({ cliMode: mode, selectedMode: offered });
		else {
			tab.setMode({ cliMode: mode, selectedMode: offered, inheritMode: false });
			this.current?.adoptPermissionMode(cliPermissionMode(offered));
		}
	}

	/**
	 * A mode pick (PRD-002.R8), passed on every later launch, Ask included, so
	 * a respawn or reopen cannot fall back to the CLI default. A switch the CLI
	 * refused puts the previous state back, so the control never claims it.
	 */
	async pickMode(mode: ChatPermissionMode): Promise<void> {
		const tab = this.host.tab;
		const generation = ++this.modeGeneration;
		// With no pick pending, the state shown is the one the CLI is in.
		this.confirmedMode ??= {
			selectedMode: tab.status.selectedMode,
			inheritMode: tab.status.inheritMode,
			cliMode: tab.status.cliMode,
		};
		this.pendingPicks++;
		tab.setMode({ selectedMode: mode, inheritMode: false, cliMode: null });
		try {
			let accepted: boolean;
			try {
				accepted = (await this.current?.setPermissionMode(cliPermissionMode(mode))) ?? true;
			} catch (err) {
				// Only the latest pick rolls back, and to what the CLI last accepted,
				// not to an earlier pick still waiting; leaving Bypass set the tab itself.
				if (generation !== this.modeGeneration) return;
				const confirmed = this.confirmedMode;
				if (confirmed) tab.setMode(confirmed);
				new Notice(`Could not switch mode: ${err instanceof Error ? err.message : String(err)}`);
				return;
			}
			// Dropped: leaving Bypass or a newer pick overtook it.
			if (!accepted) return;
			this.confirmedMode = { selectedMode: mode, inheritMode: false, cliMode: null };
			const conversation = this.host.conversation();
			if (conversation) {
				conversation.permissionMode = mode;
				conversation.permissionModePicked = true;
				this.host.save(conversation);
			}
		} finally {
			if (--this.pendingPicks === 0) this.confirmedMode = null;
		}
	}

	/** A model pick for the running CLI; false when it refused, so the caller rolls back. "" is Default. */
	async applyModel(model: string): Promise<boolean> {
		let taken: boolean | undefined;
		this.pendingModels++;
		try {
			taken = await this.current?.setModel(model || undefined);
		} catch (err) {
			if (!this.closed) new Notice(`Could not switch model: ${err instanceof Error ? err.message : String(err)}`);
			return false;
		} finally {
			this.pendingModels--;
		}
		// Dropped: a newer pick overtook it, and owns what is stored.
		if (taken === false) return true;
		// Stored only once the CLI took it, as the mode is.
		const conversation = this.host.conversation();
		if (conversation) {
			conversation.model = model;
			this.host.save(conversation);
		}
		return true;
	}

	/**
	 * Effort has no runtime control request, so the session swaps its process
	 * after the running turn and resumes; nothing to tell the user (DES-002).
	 */
	applyEffort(effort: string): void {
		const conversation = this.host.conversation();
		if (conversation) conversation.effort = effort;
		this.current?.setEffort(effort || undefined);
	}
}

/** Hold every link's session through a launch-settings change: one restart each, carrying every change (DES-002). */
export function holdSessions(links: readonly SessionLink[]): () => void {
	return holdAll(links.map((link) => link.session));
}
