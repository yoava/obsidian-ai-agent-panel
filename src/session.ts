import { ClaudeClient, type ClaudeClientOptions } from "./protocol/client";
import type {
	ContentBlock,
	ContextUsage,
	PermissionMode,
	PermissionRequest,
	PermissionResult,
	StreamMessage,
} from "./protocol/types";

export interface SessionEvents {
	onStreamMessage(msg: StreamMessage): void;
	onPermissionRequest(req: PermissionRequest): Promise<PermissionResult>;
	onPermissionCancelled(requestId: string): void;
	onBusyChanged(busy: boolean): void;
	/** The CLI process ended. `error` is set when it died unexpectedly. */
	onEnded(error?: string): void;
	/** JSON-RPC for an in-process MCP server; resolve with its reply. */
	onMcpMessage?(serverName: string, message: unknown): Promise<unknown>;
	/** The initialize handshake's response (command list, supported models). */
	onInitInfo?(info: Record<string, unknown>): void;
}

export type SessionConfig = Omit<ClaudeClientOptions, "permissionMode" | "model"> & {
	permissionMode: PermissionMode;
	model?: string;
};

/**
 * One conversation with Claude Code: owns the CLI process lifecycle, tracks
 * turn state, and forwards protocol events to the view.
 */
export class ClaudeSession {
	private client: ClaudeClient | null = null;
	private disposed = false;
	private busyState = false;
	private restartWhenIdle = false;
	/** A user-message uuid to truncate to on the next spawn (see rewindOnStart). */
	private pendingRewind: string | null = null;
	sessionId: string | null = null;
	totalCostUsd = 0;
	/**
	 * Model the live CLI process was spawned with - `init` reports the id it
	 * resolved to, and a mid-flight setModel() must not be credited with it.
	 */
	private spawnModel: string | undefined;

	constructor(
		private config: SessionConfig,
		private readonly events: SessionEvents
	) {}

	get busy(): boolean {
		return this.busyState;
	}

	get running(): boolean {
		return this.client?.running ?? false;
	}

	get permissionMode(): PermissionMode {
		return this.config.permissionMode;
	}

	get spawnedModel(): string | undefined {
		return this.spawnModel;
	}

	/**
	 * Truncate this conversation back to a user message on the next spawn, before
	 * anything is sent. Used by "branch from here": the fork starts as a copy of
	 * the whole conversation, and this trims it back to the chosen turn.
	 */
	rewindOnStart(userMessageUuid: string): void {
		this.pendingRewind = userMessageUuid;
	}

	/**
	 * The running client, or null when no CLI process is up. Deliberately does
	 * not spawn one: plan usage is worth reporting when a session happens to be
	 * running, never worth starting a process for.
	 */
	get liveClient(): ClaudeClient | null {
		return this.client;
	}

	/** Send a user turn; spawns the CLI process on first use. */
	send(content: string | ContentBlock[]): void {
		if (this.disposed) throw new Error("Session disposed");
		const client = this.ensureClient();
		this.setBusy(true);
		const rewindTo = this.pendingRewind;
		this.pendingRewind = null;
		if (rewindTo === null) {
			client.sendUserMessage(content, this.sessionId ?? undefined);
			return;
		}
		// The rewind has to land before the turn, so the turn continues from the
		// chosen point. A failure is not fatal - the branch simply keeps the full
		// history - so the message goes out either way.
		void client
			.rewindConversation(rewindTo)
			.catch(() => undefined)
			.then(() => {
				if (this.client !== client) return;
				client.sendUserMessage(content, this.sessionId ?? undefined);
			});
	}

	/**
	 * Spawn the CLI without sending anything, so a restart (an effort change) is
	 * absorbed while the user is still typing instead of on their next send.
	 */
	warmUp(): void {
		if (this.disposed) return;
		this.ensureClient();
	}

	private ensureClient(): ClaudeClient {
		if (this.client) return this.client;
		const client = new ClaudeClient(
			{
				...this.config,
				// After a crash or restart, pick the conversation back up.
				resumeSessionId: this.sessionId ?? this.config.resumeSessionId,
			},
			{
				onStreamMessage: (msg) => this.handleStreamMessage(msg),
				onPermissionRequest: (req) => this.events.onPermissionRequest(req),
				onPermissionCancelled: (id) => this.events.onPermissionCancelled(id),
				onMcpMessage: this.events.onMcpMessage
					? (server, message) => this.events.onMcpMessage!(server, message)
					: undefined,
				onInitInfo: this.events.onInitInfo
					? (info) => this.events.onInitInfo!(info)
					: undefined,
				onClose: ({ code, error, stderrTail }) => {
					// Stale close after a deliberate restart - ignore.
					if (this.client !== client) return;
					this.client = null;
					this.setBusy(false);
					if (this.disposed) return;
					const failed = error || (code !== null && code !== 0);
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
		this.spawnModel = this.config.model;
		client.start();
		return client;
	}

	async interrupt(): Promise<void> {
		if (this.client?.running) await this.client.interrupt();
	}

	async setPermissionMode(mode: PermissionMode): Promise<void> {
		this.config = { ...this.config, permissionMode: mode };
		if (this.client?.running) await this.client.setPermissionMode(mode);
	}

	async setModel(model: string | undefined): Promise<void> {
		this.config = { ...this.config, model };
		if (this.client?.running) await this.client.setModel(model);
	}

	async stopTask(taskId: string): Promise<void> {
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
	 * The CLI has no `set_effort` control request, and `--effort` is a
	 * spawn-time flag - so the
	 * process is replaced. That is kept invisible: the restart waits for the
	 * current turn to finish, the stale close is swallowed, and the replacement
	 * is spawned and resumed immediately rather than on the user's next send.
	 */
	setEffort(effort: string | undefined): void {
		if (this.config.effort === effort) return;
		this.config = { ...this.config, effort };
		if (!this.client) return;
		if (this.busyState) this.restartWhenIdle = true;
		else this.restartClient();
	}

	/** Forget a stale resume id so the next send starts a fresh session. */
	clearResume(): void {
		this.config = { ...this.config, resumeSessionId: undefined };
		this.sessionId = null;
	}

	dispose(): void {
		this.disposed = true;
		this.client?.stop();
		this.client = null;
	}

	private handleStreamMessage(msg: StreamMessage): void {
		if (msg.type === "system" && (msg as { subtype?: string }).subtype === "init") {
			this.sessionId = (msg as { session_id?: string }).session_id ?? this.sessionId;
			// The branch now has an identity of its own. Forking again on the next
			// restart would branch off the branch, so the flag is spent here.
			if (this.config.forkSession && this.sessionId)
				this.config = { ...this.config, forkSession: false };
		} else if (msg.type === "result") {
			const cost = (msg as { total_cost_usd?: number }).total_cost_usd;
			if (typeof cost === "number") this.totalCostUsd = cost;
			this.setBusy(false);
		} else if (
			msg.type === "assistant" ||
			msg.type === "user" ||
			msg.type === "stream_event"
		) {
			// A message queued mid-turn may start a new turn after the previous
			// result already cleared busy - re-arm on any turn activity.
			this.setBusy(true);
		}
		this.events.onStreamMessage(msg);
	}

	private setBusy(busy: boolean): void {
		if (this.busyState === busy) return;
		this.busyState = busy;
		this.events.onBusyChanged(busy);
		if (!busy && this.restartWhenIdle) {
			this.restartWhenIdle = false;
			this.restartClient();
		}
	}

	private restartClient(): void {
		const had = this.client !== null;
		this.client?.stop();
		this.client = null;
		// Only warm up a session that was already live, so this never spawns a
		// process for a conversation the user has not started.
		if (had && !this.disposed) this.warmUp();
	}
}
