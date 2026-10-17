import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { isJsonObject } from "../json";
import { clearTimer, setTimer, type TimerHandle } from "../timers";
import { isCliId, PROCESS_EXITED } from "./types";
import type {
	ContentBlock,
	ContextUsage,
	ControlRequestEnvelope,
	ControlResponseEnvelope,
	PermissionFlags,
	PermissionMode,
	PermissionRequest,
	PermissionResult,
	RewindFilesResult,
	RewindResult,
	StreamMessage,
} from "./types";

export interface ClaudeClientOptions {
	/** Path to the claude executable (or the command name inside WSL). */
	cliPath: string;
	/** Working directory for the CLI - normally the vault root. */
	cwd: string;
	/**
	 * Windows only: run the CLI inside WSL, as
	 * `wsl.exe --cd <cwd> --exec sh -lc 'exec "<cli>" "$@"' sh ...` (see `cliSpawnSpec`).
	 */
	useWsl?: boolean;
	model?: string;
	/** Reasoning effort (low|medium|high|xhigh|max). Spawn-time only. */
	effort?: string;
	/** Unset lets the CLI start in the mode its own settings configure. */
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
	/** The CLI profile's own arguments (see profileLaunchArgs), appended last. */
	extraArgs?: string[];
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

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === "boolean";
}

/**
 * The decision-reason flags of a `can_use_tool` request (PRD-002.R9). A flag
 * of the wrong type stays out of its typed field and is named in
 * `mistypedFlags`, which flags the request too; null counts as absent. A
 * tool name that is not a string is named there as well.
 */
function permissionFlags(request: Record<string, unknown>): PermissionFlags {
	const flags: PermissionFlags = {};
	const mistyped: string[] = [];
	if (typeof request.tool_name !== "string") mistyped.push("tool_name");
	const read = <T>(name: string, ok: (value: unknown) => value is T): T | undefined => {
		const value = request[name];
		if (value === undefined || value === null) return undefined;
		if (ok(value)) return value;
		mistyped.push(name);
		return undefined;
	};
	const type = read("decision_reason_type", isString);
	if (type !== undefined) flags.decisionReasonType = type;
	const code = read("decision_reason_code", isString);
	if (code !== undefined) flags.decisionReasonCode = code;
	const approvable = read("classifier_approvable", isBoolean);
	if (approvable !== undefined) flags.classifierApprovable = approvable;
	const interaction = read("requires_user_interaction", isBoolean);
	if (interaction !== undefined) flags.requiresUserInteraction = interaction;
	// Only its presence counts: an ask rule forced the prompt.
	if (read("matched_ask_rule", isJsonObject) !== undefined) flags.matchedAskRule = true;
	if (mistyped.length > 0) flags.mistypedFlags = mistyped;
	return flags;
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
	env: NodeJS.ProcessEnv;
}

/** Turns on the CLI's file checkpoints under stream-JSON, which Restore files rewinds (ADR-006). */
const CHECKPOINTING = "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING";

/** True when the CLI is a Windows batch shim, which only runs through cmd.exe. */
export function isCmdShim(cliPath: string, platform: NodeJS.Platform = process.platform): boolean {
	return platform === "win32" && /\.(cmd|bat)$/i.test(cliPath);
}

/**
 * Characters cmd.exe acts on even in an argument the spawn quotes - `%` (and
 * `!`, under delayed expansion) expand inside quotes, and a stray `"` ends the
 * quoting that guards the rest.
 */
export const CMD_UNSAFE = /["%!&|<>^\r\n]/;

/** One argument in the quoting Windows programs parse - the same rules Node's spawn uses. */
function windowsQuote(arg: string): string {
	if (arg && !/[\s"]/.test(arg)) return arg;
	return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
}

/**
 * The CLI path as one word of an `sh -c` script, still expanding a leading
 * `~/` and plain `$NAME` / `${NAME}` the way a configured path would in a
 * terminal, but never running a command: every other `$` (`$(`, `${X:=...}`,
 * `$((`) is escaped, as are `"`, backslash and backtick.
 */
function shellPath(cliPath: string): string {
	const tilde = cliPath.startsWith("~/") ? "~/" : "";
	return `${tilde}"${cliPath.slice(tilde.length).replace(/["\\`]|\$(?![A-Za-z_]\w*|\{[A-Za-z_]\w*\})/g, "\\$&")}"`;
}

/**
 * How the CLI process is launched. Pure, so tests can assert the shape.
 *
 * WSL: `wsl.exe -- …` would hand the rest of its command line to the distro's
 * default shell to re-parse - bash, zsh and fish each reading a quoted
 * argument differently. `--exec` skips that shell: a login `sh` (the one
 * detection uses, so the same PATH) runs the CLI with the arguments as its
 * positional parameters, which no shell ever parses.
 *
 * On Windows an npm install provides `claude.cmd`, a batch shim, and Node
 * (since its CVE-2024-27980 hardening) throws EINVAL when spawning .cmd/.bat
 * without a shell. Those run through cmd.exe via `shell: true`, where Node
 * joins command and args verbatim - so the path and every arg are quoted here,
 * and an argument cmd.exe would still interpret is refused rather than passed.
 */
export function cliSpawnSpec(
	options: Pick<ClaudeClientOptions, "cliPath" | "cwd" | "useWsl" | "env">,
	args: string[],
	platform: NodeJS.Platform = process.platform,
	baseEnv: NodeJS.ProcessEnv = process.env
): CliSpawnSpec {
	const env: NodeJS.ProcessEnv = { ...baseEnv, ...options.env, [CHECKPOINTING]: "true" };
	if (options.useWsl) {
		// WSL passes only the variables WSLENV names into the distro; the
		// user's own entries stay.
		env.WSLENV = env.WSLENV ? `${env.WSLENV}:${CHECKPOINTING}` : CHECKPOINTING;
		// wsl.exe translates the Windows --cd path into the distro's mount.
		return {
			env,
			command: "wsl.exe",
			args: [
				"--cd",
				options.cwd,
				"--exec",
				"sh",
				"-lc",
				`exec ${shellPath(options.cliPath)} "$@"`,
				"sh",
				...args,
			],
			shell: false,
		};
	}
	if (isCmdShim(options.cliPath, platform)) {
		// npm's shim reads its own directory unquoted (`SET dp0=%~dp0`), so the
		// path is screened like an argument, not only for what quotes protect.
		if (CMD_UNSAFE.test(options.cliPath))
			throw new Error(
				`Cannot launch ${options.cliPath}: cmd.exe would interpret a character in the path. ` +
					"Move the shim to a path without & ^ % ! quotes or similar, or install Claude Code's native build."
			);
		const unsafe = args.find((arg) => CMD_UNSAFE.test(arg));
		if (unsafe !== undefined)
			throw new Error(
				`Cannot pass ${unsafe} to ${options.cliPath}: cmd.exe would interpret it. ` +
					"Remove it from the profile's additional arguments, or install Claude Code's native build."
			);
		return {
			// Always quoted: windowsQuote leaves a whitespace-free path bare.
			command: `"${options.cliPath}"`,
			args: args.map(windowsQuote),
			cwd: options.cwd,
			shell: true,
			env,
		};
	}
	return { command: options.cliPath, args, cwd: options.cwd, shell: false, env };
}

/**
 * A `rewind_files` reply: `canRewind` a boolean, `filesChanged` an array of
 * strings (other entries dropped) or absent, the counts numbers or absent.
 */
function parseRewindFiles(raw: unknown): RewindFilesResult {
	const reply = (raw ?? {}) as Record<string, unknown>;
	const count = (value: unknown) => value === undefined || typeof value === "number";
	const files = reply.filesChanged;
	if (
		typeof reply.canRewind !== "boolean" ||
		(files !== undefined && !Array.isArray(files)) ||
		!count(reply.insertions) ||
		!count(reply.deletions)
	)
		throw new Error("Unexpected rewind_files reply");
	const result: RewindFilesResult = { canRewind: reply.canRewind };
	if (Array.isArray(files)) result.filesChanged = files.filter((file): file is string => typeof file === "string");
	if (typeof reply.error === "string") result.error = reply.error;
	if (typeof reply.insertions === "number") result.insertions = reply.insertions;
	if (typeof reply.deletions === "number") result.deletions = reply.deletions;
	return result;
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
	private stopped: Promise<void> | null = null;

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
		if (permissionMode) args.push("--permission-mode", permissionMode);
		if (allowBypassPermissions) args.push("--allow-dangerously-skip-permissions");
		if (replayUserMessages) args.push("--replay-user-messages");
		// The last guard before a stored id reaches the command line (ADR-018 Decision 1): the link has vetted it already.
		if (resumeSessionId !== undefined && !isCliId(resumeSessionId))
			throw new Error("Claude Code was not started: the session to resume is not a lowercase UUID.");
		if (resumeSessionId) args.push("--resume", resumeSessionId);
		// Only meaningful alongside --resume; the CLI rejects it on its own.
		if (forkSession && resumeSessionId) args.push("--fork-session");
		if (this.options.extraArgs) args.push(...this.options.extraArgs);

		const spec = cliSpawnSpec(this.options, args);

		const proc = spawn(spec.command, spec.args, {
			cwd: spec.cwd,
			env: spec.env,
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
	 * `forkSession` and rewind the fork. `lastSeen` is the session's latest user
	 * message as the caller knows it: Claude Code refuses a target that later
	 * prompts follow unless it names the one the CLI holds ("stale target"
	 * without one, "unseen later turn" with another).
	 */
	async rewindConversation(userMessageUuid: string, lastSeen: string | null): Promise<RewindResult> {
		const request: Record<string, unknown> = {
			subtype: "rewind_conversation",
			target_message_uuid: userMessageUuid,
			interrupt_if_running: true,
		};
		if (lastSeen !== null) request.last_seen_user_message_uuid = lastSeen;
		const raw = await this.request(request, 30_000);
		const result = (raw ?? {}) as Record<string, unknown>;
		return {
			rewound: result.rewound === true,
			error: typeof result.error === "string" ? result.error : undefined,
			reason: typeof result.reason === "string" ? result.reason : undefined,
			prefillText: typeof result.prefillText === "string" ? result.prefillText : undefined,
		};
	}

	/**
	 * Return the files the CLI's checkpoints track to their state at a user
	 * message, or with `dryRun` only report what that would change (ADR-006).
	 */
	async rewindFiles(userMessageId: string, dryRun: boolean): Promise<RewindFilesResult> {
		const request: Record<string, unknown> = { subtype: "rewind_files", user_message_id: userMessageId };
		if (dryRun) request.dry_run = true;
		return parseRewindFiles(await this.request(request, 30_000));
	}

	/**
	 * Any other control request - the read-only ones behind the panel's own
	 * slash commands (src/commands.ts). The reply is untyped; callers check it.
	 */
	controlRequest(
		request: { subtype: string; [key: string]: unknown },
		timeoutMs = 30_000
	): Promise<unknown> {
		return this.request(request, timeoutMs);
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
	 * yet" before the first turn, so only call it once a turn has finished;
	 * a process that resumed a session answers at once. With `strict`, a reply
	 * without the categories list is none.
	 */
	async getContextUsage(strict = false): Promise<ContextUsage | null> {
		const raw = await this.request({ subtype: "get_context_usage" }, 15_000);
		if (raw === null || typeof raw !== "object") return null;
		const usage = raw as Record<string, unknown>;
		const total = usage.totalTokens;
		const max = usage.maxTokens;
		if (typeof total !== "number" || typeof max !== "number") return null;
		// An Undo takes a reply for the resumed session only if it has the report's shape (PRD-001.R38).
		if (strict && !Array.isArray(usage.categories)) return null;
		const categories = Array.isArray(usage.categories)
			? usage.categories
					.filter(isJsonObject)
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
							deferred: entry.isDeferred === true || embedded || entry.kind === "deferred",
							kind: typeof entry.kind === "string" ? entry.kind : "",
						};
					})
			: [];
		const threshold = usage.autoCompactThreshold;
		return {
			totalTokens: total,
			maxTokens: max,
			percentage:
				typeof usage.percentage === "number"
					? usage.percentage
					: Math.round((total / Math.max(1, max)) * 100),
			model: typeof usage.model === "string" && usage.model ? usage.model : null,
			autoCompactAt: usage.isAutoCompactEnabled === true && typeof threshold === "number" ? threshold : null,
			categories,
		};
	}

	/**
	 * Terminate the process: SIGTERM, then SIGKILL 3 s later unless it closed.
	 * Resolves on the close, or at the SIGKILL, so a process that never closes
	 * cannot hold its caller. Safe to call repeatedly.
	 */
	stop(): Promise<void> {
		const proc = this.proc;
		if (this.stopped) return this.stopped;
		if (!proc || this.closed) return Promise.resolve();
		this.stopped = new Promise((resolve) => {
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
				resolve();
			}, 3000);
			proc.once("close", () => {
				clearTimer(killTimer);
				resolve();
			});
			try {
				proc.kill("SIGTERM");
			} catch {
				clearTimer(killTimer);
				resolve();
			}
		});
		return this.stopped;
	}

	// -----------------------------------------------------------------------

	private finish(code: number | null, error?: string): void {
		if (this.closed) return;
		this.closed = true;
		for (const [, pending] of this.pendingRequests) {
			clearTimer(pending.timer);
			pending.reject(new Error(PROCESS_EXITED));
		}
		this.pendingRequests.clear();
		this.callbacks.onClose({
			code,
			error,
			stderrTail: this.stderrTail.join("\n"),
		});
	}

	private handleStdout(chunk: string): void {
		// Only the new chunk is searched for a line end, so a long line arriving
		// in small pieces is not rescanned for each one. What follows the last
		// line end waits for the next chunk.
		const lastEnd = chunk.lastIndexOf("\n");
		if (lastEnd === -1) {
			this.stdoutBuffer += chunk;
			return;
		}
		// Split once instead of repeatedly slicing the front off the text (which
		// reallocated it for every complete line in a burst).
		const lines = (this.stdoutBuffer + chunk.slice(0, lastEnd)).split("\n");
		this.stdoutBuffer = chunk.slice(lastEnd + 1);
		for (const part of lines) {
			const line = part.trim();
			if (!line) continue;
			let msg: unknown;
			try {
				msg = JSON.parse(line);
			} catch {
				continue; // non-JSON noise on stdout
			}
			if (isJsonObject(msg)) this.route(msg as unknown as StreamMessage);
		}
	}

	private route(msg: StreamMessage): void {
		switch (msg.type) {
			case "control_response": {
				const payload = (msg as unknown as ControlResponseEnvelope).response;
				if (!isJsonObject(payload)) return;
				const pending = this.pendingRequests.get(payload.request_id);
				if (!pending) return;
				this.pendingRequests.delete(payload.request_id);
				clearTimer(pending.timer);
				if (payload.subtype === "success") pending.resolve(payload.response);
				else
					pending.reject(
						new Error(
							typeof payload.error === "string" && payload.error
								? payload.error
								: "Claude Code refused the request."
						)
					);
				return;
			}
			case "control_request":
				// Without a request object there is nothing to answer.
				if (!isJsonObject((msg as { request?: unknown }).request)) return;
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
			// Anything but a string is the CLI speaking a protocol we don't know;
			// String() would turn an object into "[object Object]" and show that
			// as the tool name on the permission card.
			toolName: typeof request.tool_name === "string" ? request.tool_name : "unknown",
			input: (request.input as Record<string, unknown>) ?? {},
			suggestions: request.permission_suggestions as unknown[] | undefined,
			title: request.title as string | undefined,
			description: request.description as string | undefined,
			toolUseId: request.tool_use_id as string | undefined,
			agentId: request.agent_id as string | undefined,
		};
		// Auto-approve shows a card for a flagged request (PRD-002.R9).
		Object.assign(permissionRequest, permissionFlags(request));
		if (typeof request.decision_reason === "string")
			permissionRequest.decisionReason = request.decision_reason;

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
		if (!this.callbacks.onMcpMessage) {
			this.writeControlResponse({
				subtype: "error",
				request_id: env.request_id,
				error: "No in-process MCP server is registered",
			});
			return;
		}
		try {
			// Called on `this.callbacks` rather than through a local, so a
			// callback implemented as a method keeps its receiver.
			const response = await this.callbacks.onMcpMessage(
				request.server_name ?? "",
				request.message
			);
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

	/** Nothing reaches a stopped process: an answer given after `stop` could still run a tool. */
	private write(value: unknown): void {
		if (!this.proc || this.closed || this.stopped) return;
		try {
			this.proc.stdin.write(JSON.stringify(value) + "\n");
		} catch {
			// Broken pipe surfaces via the close handler.
		}
	}
}
