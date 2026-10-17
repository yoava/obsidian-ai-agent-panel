/**
 * Types for the Claude Code CLI stream-JSON protocol.
 *
 * These are original type definitions for the
 * `--input-format stream-json --output-format stream-json` interface of the
 * Claude Code CLI, documented at
 * https://docs.claude.com/en/docs/agent-sdk/headless, with the control-request
 * subtypes as published in the public type definitions of
 * @anthropic-ai/claude-agent-sdk. The plugin talks to the locally installed
 * CLI over stdio; no Anthropic code is bundled or redistributed.
 */

/** The CLI's permission modes the panel knows. */
export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

// ---------------------------------------------------------------------------
// Anthropic API content blocks (subset the UI cares about)
// ---------------------------------------------------------------------------

export interface TextBlock {
	type: "text";
	text: string;
}

export interface ThinkingBlock {
	type: "thinking";
	thinking: string;
}

export interface ToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface ToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content?: string | Array<Record<string, unknown>>;
	is_error?: boolean;
}

export type ContentBlock =
	| TextBlock
	| ThinkingBlock
	| ToolUseBlock
	| ToolResultBlock
	| { type: string; [key: string]: unknown };

export interface ApiMessage {
	role: "user" | "assistant";
	content: string | ContentBlock[];
	model?: string;
	stop_reason?: string | null;
	usage?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stream messages (CLI stdout, one JSON object per line)
// ---------------------------------------------------------------------------

export interface SystemInitMessage {
	type: "system";
	subtype: "init";
	session_id: string;
	cwd: string;
	model: string;
	tools: string[];
	slash_commands?: string[];
	permissionMode?: string;
	claude_code_version?: string;
}

export interface SystemOtherMessage {
	type: "system";
	subtype: string;
	session_id?: string;
	[key: string]: unknown;
}

export interface AssistantMessage {
	type: "assistant";
	message: ApiMessage;
	session_id: string;
	parent_tool_use_id: string | null;
	uuid?: string;
}

export interface UserMessage {
	type: "user";
	message: ApiMessage;
	session_id: string;
	parent_tool_use_id: string | null;
	uuid?: string;
}

/**
 * The CLI's answer to `/clear`, before the new session's `system/init`
 * (docs/records/verification/2026-10-13-real-cli-clear-undo.md).
 */
export interface ConversationResetMessage {
	type: "conversation_reset";
	trigger: string;
	session_id?: string;
	new_conversation_id?: string;
}

export interface ResultMessage {
	type: "result";
	subtype: string; // "success" | "error_during_execution" | ...
	is_error: boolean;
	result?: string;
	session_id: string;
	duration_ms?: number;
	num_turns?: number;
	total_cost_usd?: number;
	permission_denials?: unknown[];
	usage?: Record<string, unknown>;
}

/** Raw Anthropic streaming event, forwarded when --include-partial-messages is on. */
export interface StreamEventMessage {
	type: "stream_event";
	event: {
		type: string;
		index?: number;
		content_block?: ContentBlock;
		delta?: {
			type?: string;
			text?: string;
			thinking?: string;
			partial_json?: string;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
	session_id: string;
	parent_tool_use_id: string | null;
}

export type StreamMessage =
	| SystemInitMessage
	| SystemOtherMessage
	| AssistantMessage
	| UserMessage
	| ResultMessage
	| StreamEventMessage
	| ConversationResetMessage
	| { type: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// Control protocol (bidirectional requests over the same stdio channel)
// ---------------------------------------------------------------------------

export interface ControlRequestEnvelope {
	type: "control_request";
	request_id: string;
	request: { subtype: string; [key: string]: unknown };
}

export interface ControlCancelEnvelope {
	type: "control_cancel_request";
	request_id: string;
}

export type ControlResponsePayload =
	| { subtype: "success"; request_id: string; response?: unknown }
	| { subtype: "error"; request_id: string; error: string };

export interface ControlResponseEnvelope {
	type: "control_response";
	response: ControlResponsePayload;
}

/** CLI → client: ask the user to approve a tool call. */
export interface PermissionRequest {
	/** Correlation id; used to withdraw the prompt if the CLI cancels it. */
	requestId: string;
	toolName: string;
	input: Record<string, unknown>;
	/** Optional persistent-permission rules the CLI suggests offering. */
	suggestions?: unknown[];
	title?: string;
	description?: string;
	toolUseId?: string;
	/** The subagent that asked; unread today, kept for the redesign's per-agent rows. */
	agentId?: string;
	/** Why Claude Code asks: `rule`, `hook`, `safetyCheck`, `mode`, ... (ADR-002). */
	decisionReasonType?: string;
	decisionReason?: string;
	/** A closed-set code beside the type; `org_ask_ceiling` is an organization's MCP ask ceiling. */
	decisionReasonCode?: string;
	/**
	 * Set, either way, only when one of Claude Code's safety checks is in the
	 * reason, also when nested in a compound command's `subcommandResults`.
	 */
	classifierApprovable?: boolean;
	/**
	 * True when Claude Code reports `matched_ask_rule`: an ask rule forced the
	 * prompt, though the reason type is the tool's own.
	 */
	matchedAskRule?: boolean;
	/** Claude Code wants the user to answer this one, whatever the mode. */
	requiresUserInteraction?: boolean;
	/** The flag fields, and a tool name, Claude Code sent with the wrong type, by wire name; each flags the request. */
	mistypedFlags?: string[];
}

/** The fields of a {@link PermissionRequest} that can flag it for a card in Auto-approve (PRD-002.R9). */
export type PermissionFlags = Pick<
	PermissionRequest,
	| "decisionReasonType"
	| "decisionReasonCode"
	| "classifierApprovable"
	| "matchedAskRule"
	| "requiresUserInteraction"
	| "mistypedFlags"
>;

/** Reply to a `rewind_conversation` control request. */
export interface RewindResult {
	rewound: boolean;
	/** Why not, when `rewound` is false ("stale target", …). */
	error?: string;
	/** Its code ("stale_target", "unseen_later_turn", "target_not_found", …). */
	reason?: string;
	/** The rewound-away prompt, which the CLI offers back for re-editing. */
	prefillText?: string;
}

/** How a control request still pending when the CLI process closed is rejected. */
export const PROCESS_EXITED = "Claude process exited";

/** Reply to a `rewind_files` control request (ADR-006). */
export interface RewindFilesResult {
	canRewind: boolean;
	/** Why not, when `canRewind` is false. */
	error?: string;
	/** Paths as the CLI reports them; for a dry run, what the rewind would touch. Absent when the reply has none. */
	filesChanged?: string[];
	insertions?: number;
	deletions?: number;
}

/** Reply to a `get_context_usage` control request, reduced to what the UI needs. */
export interface ContextUsage {
	totalTokens: number;
	maxTokens: number;
	percentage: number;
	/** The model id the reply names, or null. */
	model: string | null;
	/** Where the CLI compacts on its own, in tokens; null when it is off or not reported. */
	autoCompactAt: number | null;
	/** `name` is normalized in `getContextUsage`: any "(deferred)" the CLI
	 *  embedded in the label is stripped off and folded into `deferred`, so
	 *  renderers own the suffix and it can never appear twice. `kind` is the
	 *  reply's ("used", "free", "buffer", "deferred"), or "" when it sent none. */
	categories: Array<{ name: string; tokens: number; deferred: boolean; kind: string }>;
}

/**
 * One background task (a `Task` subagent, or a backgrounded tool), as reported
 * by the `system/task_started` and `system/background_tasks_changed` messages.
 */
export interface BackgroundTask {
	taskId: string;
	description?: string;
	taskType?: string;
	subagentType?: string;
	toolUseId?: string;
	status?: string;
}

export type PermissionResult =
	| {
			behavior: "allow";
			updatedInput: Record<string, unknown>;
			updatedPermissions?: unknown[];
	  }
	| { behavior: "deny"; message: string; interrupt?: boolean };

const CLI_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A user message holding a local command's output (`<local-command-stdout>`),
 * which the CLI replays after a manual `/compact` and on every model change:
 * a chain member with a uuid, but no prompt and no file checkpoint.
 */
export function isLocalCommandOutput(message: UserMessage): boolean {
	const content = message.message.content;
	const first = typeof content === "string" ? content : (content.find((block) => block.type === "text") as TextBlock | undefined)?.text;
	return typeof first === "string" && first.startsWith("<local-command-stdout>");
}

/**
 * The id grammar (ADR-018 Decision 1): a stored session or message id reaches
 * `--resume` and the control requests, so it is used only as a lowercase
 * UUID, which no flag or path matches.
 */
export function isCliId(value: unknown): value is string {
	return typeof value === "string" && CLI_ID.test(value);
}
