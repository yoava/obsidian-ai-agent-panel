import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { clearTimer, setTimer, type TimerHandle } from "../timers";
import type {
	ContentBlock,
	ContextUsage,
	ControlRequestEnvelope,
	ControlResponseEnvelope,
	PermissionMode,
	PermissionRequest,
	PermissionResult,
	RewindResult,
	StreamMessage,
} from "./types";

export interface ClaudeClientOptions {
	/** Path to the claude executable (or the command name inside WSL). */
	cliPath: string;
	/** Working directory for the CLI - normally the vault root. */
	cwd: string;
	/** Windows only: run the CLI inside WSL (`wsl.exe --cd <cwd> -- claude …`). */
	useWsl?: boolean;
	model?: string;
	/** Reasoning effort (low|medium|high|xhigh|max). Spawn-time only. */
	effort?: string;
	permissionMode?: PermissionMode;
	/** Resume an existing CLI session by id. */
	resumeSessionId?: string;
	/**
	 * With `resumeSessionId`, branch instead of continuing: the CLI assigns a new
	 * session id and the original transcript is left untouched.
	 */
	forkSession?: boolean;
	/**
	 * Ask the CLI to echo our own user turns back on stdout. Without it their
	 * `uuid`s are never reported, and the rewind controls key off those.
	 */
	replayUserMessages?: boolean;
	/** Extra system-prompt text, applied via the initialize handshake. */
	appendSystemPrompt?: string;
	/**
	 * In-process MCP servers to register on the initialize handshake. The CLI
	 * then drives each one over `mcp_message` control requests, answered by
	 * `onMcpMessage`. Requires Claude Code 2.1.210+; older versions ignore it.
	 */
	sdkMcpServers?: string[];
	/** Permit switching into bypassPermissions at runtime. */
	allowBypassPermissions?: boolean;
	env?: Record<string, string>;
}

export interface ClaudeClientCallbacks {
	onStreamMessage(msg: StreamMessage): void;
	/** Resolve with the user's decision. Rejections are reported to the CLI as errors. */
	onPermissionRequest(req: PermissionRequest): Promise<PermissionResult>;
	/** The CLI withdrew a pending permission prompt (e.g. after an interrupt). */
	onPermissionCancelled(requestId: string): void;
	/**
	 * One JSON-RPC message for an in-process MCP server. Resolve with the
	 * JSON-RPC reply, or null for a notification.
	 */
	onMcpMessage?(serverName: string, message: unknown): Promise<unknown>;
	/**
	 * The initialize handshake's response - carries the CLI's command list and
	 * the models this install + account accept. Not called when the handshake
	 * fails (that surfaces via onClose).
	 */
	onInitInfo?(info: Record<string, unknown>): void;
	onClose(info: { code: number | null; error?: string; stderrTail: string }): void;
}

interface PendingRequest {
	resolve(value: unknown): void;
	reject(err: Error): void;
	timer?: TimerHandle;
}

const STDERR_TAIL_LINES = 40;

export interface CliSpawnSpec {
	command: string;
	args: string[];
	cwd?: string;
	shell: boolean;
}

/**
 * How the CLI process is launched. Pure, so tests can assert the shape.
 *
 * On Windows an npm install provides `claude.cmd`, a batch shim, and Node
 * (since its CVE-2024-27980 hardening) throws EINVAL when spawning .cmd/.bat
 * without a shell. Those run through cmd.exe via `shell: true`, where Node
 * joins command and args verbatim - so anything that may contain whitespace
 * (the path; defensively every arg) is quoted here. The args carry no
 * model-controlled text: fixed flags, the configured model/effort, and a
 * session uuid.
 */
export function cliSpawnSpec(
	options: Pick<ClaudeClientOptions, "cliPath" | "cwd" | "useWsl">,
	args: string[],
	platform: NodeJS.Platform = process.platform
): CliSpawnSpec {
	if (options.useWsl) {
		// wsl.exe translates the Windows --cd path into the distro's mount.
		return {
			command: "wsl.exe",
			args: ["--cd", options.cwd, "--", options.cliPath, ...args],
			shell: false,
		};
	}
	if (platform === "win32" && /\.(cmd|bat)$/i.test(options.cliPath)) {
		const quote = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
		return {
			command: quote(options.cliPath),
			args: args.map(quote),
			cwd: options.cwd,
			shell: true,
		};
	}
	return { command: options.cliPath, args, cwd: options.cwd, shell: false };
}

/**
 * A minimal client for one `claude` CLI process speaking stream-JSON over
 * stdio. The process stays alive across turns; each user message continues
 * the same conversation.
 */
export class ClaudeClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private stdoutBuffer = "";
	private stderrTail: string[] = [];
	private nextRequestId = 0;
	private pendingRequests = new Map<string, PendingRequest>();
	private cancelledPermissions = new Set<string>();
	private closed = false;

	constructor(
		private readonly options: ClaudeClientOptions,
		private readonly callbacks: ClaudeClientCallbacks
	) {}

	get running(): boolean {
		return this.proc !== null && !this.closed;
	}

	start(): void {
		if (this.proc) throw new Error("ClaudeClient already started");

		const args = [
			"--output-format",
			"stream-json",
			"--input-format",
			"stream-json",
			"--verbose",
			"--include-partial-messages",
			"--permission-prompt-tool",
			"stdio",
		];
		const {
			model,
			effort,
			permissionMode,
			resumeSessionId,
			allowBypassPermissions,
			forkSession,
			replayUserMessages,
		} = this.options;
		if (model) args.push("--model", model);
		if (effort) args.push("--effort", effort);
		if (permissionMode && permissionMode !== "default")
			args.push("--permission-mode", permissionMode);
		if (allowBypassPermissions) args.push("--allow-dangerously-skip-permissions");
		if (replayUserMessages) args.push("--replay-user-messages");
		if (resumeSessionId) args.push("--resume", resumeSessionId);
		// Only meaningful alongside --resume; the CLI rejects it on its own.
		if (forkSession && resumeSessionId) args.push("--fork-session");

		const spec = cliSpawnSpec(this.options, args);

		const proc = spawn(spec.command, spec.args, {
			cwd: spec.cwd,
			env: { ...process.env, ...this.options.env },
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
			shell: spec.shell,
		});
		this.proc = proc;

		proc.stdout.setEncoding("utf8");
		proc.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
		proc.stderr.setEncoding("utf8");
		proc.stderr.on("data", (chunk: string) => {
			for (const line of chunk.split("\n")) {
				if (!line.trim()) continue;
				this.stderrTail.push(line);
				if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
			}
		});
		// stdin errors (EPIPE / write-after-end once the CLI dies) arrive
		// asynchronously - the try/catch around write() can't see them, so an
		// unhandled 'error' here would crash the whole plugin. Swallow it; the
		// real failure surfaces through 'close'.
		proc.stdin.on("error", () => {});
		proc.on("error", (err) => this.finish(null, err.message));
		proc.on("close", (code) => this.finish(code));

		// Handshake. Also carries the optional system-prompt suffix and registers
		// our in-process MCP servers.
		const init: Record<string, unknown> = { subtype: "initialize" };
		if (this.options.appendSystemPrompt)
			init.appendSystemPrompt = this.options.appendSystemPrompt;
		if (this.options.sdkMcpServers?.length)
			init.sdkMcpServers = this.options.sdkMcpServers;
		this.request(init, 120_000)
			.then((response) => {
				if (response && typeof response === "object")
					this.callbacks.onInitInfo?.(response as Record<string, unknown>);
			})
			.catch(() => {
				// Initialization errors surface via stderr/close; nothing to do here.
			});
	}

	/**
	 * Send one user turn. A plain string is the common case (it may include
	 * slash commands); an array carries content blocks, e.g. pasted images
	 * alongside the text.
	 */
	sendUserMessage(content: string | ContentBlock[], sessionId?: string): void {
		this.write({
			type: "user",
			session_id: sessionId ?? "",
			message: {
				role: "user",
				content: typeof content === "string" ? [{ type: "text", text: content }] : content,
			},
			parent_tool_use_id: null,
		});
	}

	async interrupt(): Promise<void> {
		await this.request({ subtype: "interrupt" }, 15_000);
	}

	async setPermissionMode(mode: PermissionMode): Promise<void> {
		await this.request({ subtype: "set_permission_mode", mode }, 15_000);
	}

	async setModel(model: string | undefined): Promise<void> {
		await this.request({ subtype: "set_model", model: model ?? null }, 15_000);
	}

	/**
	 * Truncate the conversation back to a user message, dropping everything after
	 * it. This edits the live session in place - to branch instead, resume with
	 * `forkSession` and rewind the fork.
	 */
	async rewindConversation(userMessageUuid: string): Promise<RewindResult> {
		const raw = await this.request(
			{
				subtype: "rewind_conversation",
				target_message_uuid: userMessageUuid,
				interrupt_if_running: true,
			},
			30_000
		);
		const result = (raw ?? {}) as Record<string, unknown>;
		return {
			rewound: result.rewound === true,
			error: typeof result.error === "string" ? result.error : undefined,
			prefillText: typeof result.prefillText === "string" ? result.prefillText : undefined,
		};
	}

	/** Cancel one background task. Unknown or already-stopped ids succeed. */
	async stopTask(taskId: string): Promise<void> {
		await this.request({ subtype: "stop_task", task_id: taskId }, 15_000);
	}

	/**
	 * Structured plan-usage for the account this session is logged in as - the
	 * same numbers `/usage` prints. The CLI makes the authenticated call with
	 * its own credentials, so the plugin never reads or holds one.
	 *
	 * Anthropic marks this control request experimental and free to change or
	 * vanish in any release, so callers must treat a failure as "no usage
	 * available" rather than something worth reporting as broken.
	 */
	async getPlanUsage(): Promise<Record<string, unknown> | null> {
		const raw = await this.request({ subtype: "get_usage" }, 15_000);
		return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
	}

	/**
	 * Context-window occupancy for this session. Fails with "no turn received
	 * yet" before the first turn, so only call it once a turn has finished.
	 */
	async getContextUsage(): Promise<ContextUsage | null> {
		const raw = await this.request({ subtype: "get_context_usage" }, 15_000);
		if (raw === null || typeof raw !== "object") return null;
		const usage = raw as Record<string, unknown>;
		const total = usage.totalTokens;
		const max = usage.maxTokens;
		if (typeof total !== "number" || typeof max !== "number") return null;
		const categories = Array.isArray(usage.categories)
			? usage.categories
					.map((entry) => entry as Record<string, unknown>)
					.filter(
						(entry) =>
							typeof entry.name === "string" && typeof entry.tokens === "number"
					)
					.map((entry) => {
						// The CLI reports deferred tool categories twice over: the
						// marker is baked into the display name ("MCP tools
						// (deferred)") *and* set as `isDeferred`. Nothing documents
						// the shape of `name` - this reply is an untyped control
						// -protocol payload, not an SDK type - so treat an embedded
						// marker as incidental: strip it here and let the renderer
						// add exactly one back from the flag. A name-only marker
						// still counts as deferred, so stripping never drops the
						// label if the CLI stops sending the flag.
						const rawName = entry.name as string;
						const embedded = /\s*\(deferred\)\s*$/i.test(rawName);
						return {
							name: embedded
								? rawName.replace(/\s*\(deferred\)\s*$/i, "").trim()
								: rawName,
							tokens: entry.tokens as number,
							deferred: entry.isDeferred === true || embedded,
						};
					})
			: [];
		return {
			totalTokens: total,
			maxTokens: max,
			percentage:
				typeof usage.percentage === "number"
					? usage.percentage
					: Math.round((total / Math.max(1, max)) * 100),
			categories,
		};
	}

	/** Terminate the process. Safe to call repeatedly. */
	stop(): void {
		const proc = this.proc;
		if (!proc || this.closed) return;
		try {
			proc.stdin.end();
		} catch {
			// stdin may already be gone
		}
		const killTimer = setTimer(() => {
			try {
				proc.kill("SIGKILL");
			} catch {
				// already exited
			}
		}, 3000);
		proc.once("close", () => clearTimer(killTimer));
		try {
			proc.kill("SIGTERM");
		} catch {
			clearTimer(killTimer);
		}
	}

	// -----------------------------------------------------------------------

	private finish(code: number | null, error?: string): void {
		if (this.closed) return;
		this.closed = true;
		for (const [, pending] of this.pendingRequests) {
			clearTimer(pending.timer);
			pending.reject(new Error("Claude process exited"));
		}
		this.pendingRequests.clear();
		this.callbacks.onClose({
			code,
			error,
			stderrTail: this.stderrTail.join("\n"),
		});
	}

	private handleStdout(chunk: string): void {
		this.stdoutBuffer += chunk;
		// Split once per chunk instead of repeatedly slicing the front off the
		// buffer (which reallocated it for every complete line in a burst). The
		// last element is the not-yet-terminated remainder, kept for next time.
		const parts = this.stdoutBuffer.split("\n");
		this.stdoutBuffer = parts.pop() ?? "";
		for (const part of parts) {
			const line = part.trim();
			if (!line) continue;
			let msg: StreamMessage;
			try {
				msg = JSON.parse(line) as StreamMessage;
			} catch {
				continue; // non-JSON noise on stdout
			}
			this.route(msg);
		}
	}

	private route(msg: StreamMessage): void {
		switch (msg.type) {
			case "control_response": {
				const payload = (msg as unknown as ControlResponseEnvelope).response;
				const pending = this.pendingRequests.get(payload.request_id);
				if (!pending) return;
				this.pendingRequests.delete(payload.request_id);
				clearTimer(pending.timer);
				if (payload.subtype === "success") pending.resolve(payload.response);
				else pending.reject(new Error(payload.error));
				return;
			}
			case "control_request":
				void this.handleControlRequest(msg as unknown as ControlRequestEnvelope);
				return;
			case "control_cancel_request": {
				const requestId = (msg as { request_id?: string }).request_id;
				if (requestId) {
					this.cancelledPermissions.add(requestId);
					this.callbacks.onPermissionCancelled(requestId);
				}
				return;
			}
			default:
				this.callbacks.onStreamMessage(msg);
		}
	}

	private async handleControlRequest(env: ControlRequestEnvelope): Promise<void> {
		if (env.request.subtype === "mcp_message") {
			await this.handleMcpMessage(env);
			return;
		}
		if (env.request.subtype !== "can_use_tool") {
			this.writeControlResponse({
				subtype: "error",
				request_id: env.request_id,
				error: `Unsupported control request: ${env.request.subtype}`,
			});
			return;
		}

		const request = env.request as Record<string, unknown>;
		const permissionRequest: PermissionRequest = {
			requestId: env.request_id,
			toolName: String(request.tool_name ?? "unknown"),
			input: (request.input as Record<string, unknown>) ?? {},
			suggestions: request.permission_suggestions as unknown[] | undefined,
			title: request.title as string | undefined,
			description: request.description as string | undefined,
			toolUseId: request.tool_use_id as string | undefined,
			agentId: request.agent_id as string | undefined,
		};

		let result: PermissionResult;
		try {
			result = await this.callbacks.onPermissionRequest(permissionRequest);
		} catch (err) {
			if (!this.cancelledPermissions.delete(env.request_id)) {
				this.writeControlResponse({
					subtype: "error",
					request_id: env.request_id,
					error: err instanceof Error ? err.message : String(err),
				});
			}
			return;
		}
		if (this.cancelledPermissions.delete(env.request_id)) return;
		this.writeControlResponse({
			subtype: "success",
			request_id: env.request_id,
			response: result,
		});
	}

	/**
	 * Route one JSON-RPC message to an in-process MCP server. The CLI's transport
	 * feeds whatever comes back straight into its MCP client, so `mcp_response`
	 * must be the reply to exactly this message - null for a notification.
	 */
	private async handleMcpMessage(env: ControlRequestEnvelope): Promise<void> {
		const request = env.request as { server_name?: string; message?: unknown };
		const handler = this.callbacks.onMcpMessage;
		if (!handler) {
			this.writeControlResponse({
				subtype: "error",
				request_id: env.request_id,
				error: "No in-process MCP server is registered",
			});
			return;
		}
		try {
			const response = await handler(String(request.server_name ?? ""), request.message);
			this.writeControlResponse({
				subtype: "success",
				request_id: env.request_id,
				response: { mcp_response: response ?? null },
			});
		} catch (err) {
			this.writeControlResponse({
				subtype: "error",
				request_id: env.request_id,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	private request(
		request: Record<string, unknown>,
		timeoutMs: number
	): Promise<unknown> {
		if (!this.running) return Promise.reject(new Error("Claude is not running"));
		const requestId = `obs_${++this.nextRequestId}`;
		return new Promise((resolve, reject) => {
			const timer = setTimer(() => {
				this.pendingRequests.delete(requestId);
				reject(new Error(`Control request timed out: ${String(request.subtype)}`));
			}, timeoutMs);
			this.pendingRequests.set(requestId, { resolve, reject, timer });
			this.write({ type: "control_request", request_id: requestId, request });
		});
	}

	private writeControlResponse(payload: ControlResponseEnvelope["response"]): void {
		this.write({ type: "control_response", response: payload });
	}

	private write(value: unknown): void {
		if (!this.proc || this.closed) return;
		try {
			this.proc.stdin.write(JSON.stringify(value) + "\n");
		} catch {
			// Broken pipe surfaces via the close handler.
		}
	}
}
