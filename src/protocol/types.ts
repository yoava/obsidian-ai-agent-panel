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

export type PermissionMode =
	| "default"
	| "acceptEdits"
	| "plan"
	| "bypassPermissions";

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
	agentId?: string;
}

/** Reply to a `rewind_conversation` control request. */
export interface RewindResult {
	rewound: boolean;
	/** Why not, when `rewound` is false ("target not found", "turn running", …). */
	error?: string;
	/** The rewound-away prompt, which the CLI offers back for re-editing. */
	prefillText?: string;
}

/** Reply to a `get_context_usage` control request, reduced to what the UI needs. */
export interface ContextUsage {
	totalTokens: number;
	maxTokens: number;
	percentage: number;
	/** `name` is normalized in `getContextUsage`: any "(deferred)" the CLI
	 *  embedded in the label is stripped off and folded into `deferred`, so
	 *  renderers own the suffix and it can never appear twice. */
	categories: Array<{ name: string; tokens: number; deferred: boolean }>;
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
