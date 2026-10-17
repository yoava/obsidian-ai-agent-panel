/**
 * One stream message reduced to changes of the tab's messages model (DES-003
 * Stream to messages). Pure: `tab/chat-tab` applies the changes, stamps the
 * times, and hands `system/init` and the other system messages to the view.
 * The shapes are read as `src/view.ts` read them before DES-003 slices 7
 * and 9, not as captured from a CLI; the compaction messages are the
 * captured ones (E3, V5).
 */

import { API_IMAGE_MEDIA_TYPES } from "../attachments";
import {
	isLocalCommandOutput,
	type AssistantMessage,
	type BackgroundTask,
	type ResultMessage,
	type StreamEventMessage,
	type StreamMessage,
	type ToolResultBlock,
	type ToolUseBlock,
	type UserMessage,
} from "../protocol/types";
import { compactionSignal, type CompactionSignal } from "./compaction";
import type { StepImage } from "./tab";

/** A text or thinking block opened and not yet finalized: what its deltas brought, and whether its start came. */
export interface OpenBlock {
	buffer: string;
	started: boolean;
}

export interface StreamState {
	/** The kind of block between its `content_block_start` and `content_block_stop`. */
	streaming: "text" | "thinking" | "other" | null;
	text: OpenBlock | null;
	thinking: OpenBlock | null;
	/** The turn's uuid came with its first echo. */
	uuid: boolean;
}

export const STREAM_IDLE: StreamState = { streaming: null, text: null, thinking: null, uuid: false };

/** A tool call's `tool_result`: whether it failed, its text blocks joined, and its images of the four allowed types. */
export interface ToolOutcome {
	toolUseId: string;
	isError: boolean;
	text: string | null;
	images: StepImage[];
}

/** What the CLI reports of a finished subagent or background task (`task_notification`). */
export interface TaskReport {
	status: string | null;
	tokens: number | null;
	toolUses: number | null;
	durationMs: number | null;
}

/** A background-task message (DES-003 Agent rows and run bar). */
export type TaskEvent =
	/** `task_started`: a task runs. */
	| { type: "started"; task: BackgroundTask }
	/** `background_tasks_changed`: these run, and no other. */
	| { type: "running"; tasks: BackgroundTask[] }
	/** `task_updated`: its status changed. */
	| { type: "updated"; taskId: string; status: string | null }
	/** `task_notification`: the task ended, and the agent its call started reports its totals. */
	| { type: "ended"; taskId: string | null; toolUseId: string | null; report: TaskReport };

export type StreamChange =
	/** A text block opens: writing, until `text-stop`. */
	| { type: "text-open" }
	| { type: "text-delta"; text: string }
	| { type: "text-stop" }
	/** The open text block finalized with this text, or a finished one added; empty text removes it. */
	| { type: "text-done"; text: string }
	| { type: "thinking-open" }
	| { type: "thinking-delta"; text: string }
	/** Its time ends. */
	| { type: "thinking-stop" }
	/** The open thinking block closed with this text, or a closed one added. */
	| { type: "thinking-done"; text: string }
	/** A tool call of the main thread. */
	| { type: "tool-use"; block: ToolUseBlock; message: AssistantMessage }
	/**
	 * A prompt's echoed uuid: with `first`, the turn's own, for Branch and its
	 * turn record (DES-004); the last one is what a branch names as last seen.
	 */
	| { type: "uuid"; uuid: string; first: boolean }
	/** Tool calls' results, of the main thread (`parent` null) or of the subagent its call started. */
	| { type: "tool-results"; parent: string | null; results: ToolOutcome[] }
	/** A subagent's message, for its agent row and thread. */
	| { type: "agent-message"; parent: string; message: AssistantMessage }
	| { type: "task"; event: TaskEvent }
	/** The CLI compacts the conversation, or says how it went (PRD-001.R37). */
	| { type: "compaction"; signal: CompactionSignal }
	/** After the open blocks are finalized: the turn's end. */
	| { type: "result"; message: ResultMessage }
	| { type: "init"; message: StreamMessage }
	| { type: "system"; subtype: string | undefined; message: Record<string, unknown> };

export interface StreamStep {
	state: StreamState;
	changes: StreamChange[];
}

/** The open thinking, then the open text, finalized from what streamed; the turn's uuid forgotten. */
function finalize(state: StreamState): StreamChange[] {
	const changes: StreamChange[] = [];
	if (state.thinking) changes.push({ type: "thinking-done", text: state.thinking.buffer });
	if (state.text) changes.push({ type: "text-done", text: state.text.buffer });
	return changes;
}

/** The session ended (DES-002 Session end): open blocks are finalized from what streamed, and the next turn starts afresh. */
export function finishStream(state: StreamState): StreamStep {
	return { state: STREAM_IDLE, changes: finalize(state) };
}

/** Reduce one message from the CLI. */
export function reduceStream(state: StreamState, message: StreamMessage): StreamStep {
	switch (message.type) {
		case "system": {
			const subtype = (message as { subtype?: unknown }).subtype;
			if (subtype === "init") return { state, changes: [{ type: "init", message }] };
			const fields = message as Record<string, unknown>;
			const compaction = compactionSignal(fields);
			if (compaction) return { state, changes: [{ type: "compaction", signal: compaction }] };
			const event = taskEvent(subtype, fields);
			if (event) return { state, changes: event === "skip" ? [] : [{ type: "task", event }] };
			return {
				state,
				changes: [{ type: "system", subtype: typeof subtype === "string" ? subtype : undefined, message: fields }],
			};
		}
		case "stream_event": {
			const event = message as StreamEventMessage;
			// A subagent's partial messages: its thread draws whole messages only.
			if (event.parent_tool_use_id) return { state, changes: [] };
			return streamEvent(state, event.event ?? { type: "" });
		}
		case "assistant": {
			const assistant = message as AssistantMessage;
			const parent = assistant.parent_tool_use_id;
			if (parent) return { state, changes: [{ type: "agent-message", parent, message: assistant }] };
			// The CLI's own compaction notices are not Claude's reply (V5).
			const notice = compactionSignal(message as unknown as Record<string, unknown>);
			if (notice) return { state, changes: [{ type: "compaction", signal: notice }] };
			return assistantMessage(state, assistant);
		}
		case "user": {
			const user = message as UserMessage;
			const parent = user.parent_tool_use_id;
			// A subagent's prompt carries no result: its thread shows none.
			if (parent) return { state, changes: hasResults(user) ? [{ type: "tool-results", parent, results: toolOutcomes(user) }] : [] };
			return userMessage(state, user);
		}
		case "result":
			return {
				state: STREAM_IDLE,
				changes: [...finalize(state), { type: "result", message: message as ResultMessage }],
			};
		default:
			// Rate limits, hooks, thinking token counts, …
			return { state, changes: [] };
	}
}

function streamEvent(state: StreamState, event: StreamEventMessage["event"]): StreamStep {
	if (event.type === "content_block_start") {
		const kind = event.content_block?.type;
		if (kind === "text") return startBlock(state, "text");
		if (kind === "thinking") return startBlock(state, "thinking");
		return { state: { ...state, streaming: "other" }, changes: endStreaming(state) };
	}
	if (event.type === "content_block_stop") return { state: { ...state, streaming: null }, changes: endStreaming(state) };
	if (event.type !== "content_block_delta") return { state, changes: [] };
	const delta = event.delta ?? {};
	if (delta.type === "text_delta" && typeof delta.text === "string") return addDelta(state, "text", delta.text);
	if (delta.type === "thinking_delta" && typeof delta.thinking === "string") return addDelta(state, "thinking", delta.thinking);
	return { state, changes: [] };
}

/** A block that was streaming has stopped: writing ends, or thinking's time does. */
function endStreaming(state: StreamState): StreamChange[] {
	if (state.streaming === "text") return [{ type: "text-stop" }];
	if (state.streaming === "thinking") return [{ type: "thinking-stop" }];
	return [];
}

/**
 * A block's start. One its deltas opened before the start arrived is
 * adopted; one still open from before is finalized from what streamed, so
 * no block is left streaming.
 */
function startBlock(state: StreamState, kind: "text" | "thinking"): StreamStep {
	const open = state[kind];
	if (open && !open.started && state.streaming === kind)
		return { state: { ...state, [kind]: { ...open, started: true } }, changes: [] };
	const changes = endStreaming(state);
	if (open) changes.push(kind === "text" ? { type: "text-done", text: open.buffer } : { type: "thinking-done", text: open.buffer });
	changes.push({ type: kind === "text" ? "text-open" : "thinking-open" });
	return { state: { ...state, streaming: kind, [kind]: { buffer: "", started: true } }, changes };
}

/** A delta appended to its open block, opening one when its start has not come. */
function addDelta(state: StreamState, kind: "text" | "thinking", text: string): StreamStep {
	const open = state[kind];
	const changes: StreamChange[] = [];
	let streaming = state.streaming;
	if (!open) {
		changes.push(...endStreaming(state));
		changes.push({ type: kind === "text" ? "text-open" : "thinking-open" });
		streaming = kind;
	}
	changes.push({ type: kind === "text" ? "text-delta" : "thinking-delta", text });
	return {
		state: { ...state, streaming, [kind]: { buffer: (open?.buffer ?? "") + text, started: open?.started ?? false } },
		changes,
	};
}

/** Per block: text finalized, thinking closed, a tool call to its card (DES-003 Stream to messages). */
function assistantMessage(state: StreamState, message: AssistantMessage): StreamStep {
	const content = message.message.content;
	const blocks = typeof content === "string" ? [{ type: "text", text: content }] : content;
	let next = state;
	const changes: StreamChange[] = [];
	for (const block of blocks) {
		if (block.type === "text") {
			const text = typeof block.text === "string" ? block.text : "";
			changes.push({ type: "text-done", text });
			next = { ...next, text: null, streaming: next.streaming === "text" ? null : next.streaming };
		} else if (block.type === "thinking") {
			const full = typeof block.thinking === "string" ? block.thinking : "";
			changes.push({ type: "thinking-done", text: full || next.thinking?.buffer || "" });
			next = { ...next, thinking: null, streaming: next.streaming === "thinking" ? null : next.streaming };
		} else if (block.type === "tool_use") changes.push({ type: "tool-use", block: block as ToolUseBlock, message });
	}
	return { state: next, changes };
}

/**
 * `--replay-user-messages` echoes each prompt with its uuid; tool results
 * come back as `user` messages too, so the turn's uuid is its first echo
 * without a `tool_result` block (DES-004). Later echoes are prompts queued
 * or steered into the turn. A replayed `<local-command-stdout>` message is none of these.
 */
function userMessage(state: StreamState, message: UserMessage): StreamStep {
	if (hasResults(message)) return { state, changes: [{ type: "tool-results", parent: null, results: toolOutcomes(message) }] };
	// The compaction summary is the CLI's own message, not the echo of a prompt (PRD-001.R37).
	if ((message as { isSynthetic?: unknown }).isSynthetic === true) {
		const summary = compactionSignal(message as unknown as Record<string, unknown>);
		return { state, changes: summary ? [{ type: "compaction", signal: summary }] : [] };
	}
	// The CLI replays a local command's output (a manual `/compact`, a model change) as a uuid-bearing user message; it is no prompt and no file checkpoint.
	if (isLocalCommandOutput(message)) return { state, changes: [] };
	if (!message.uuid) return { state, changes: [] };
	const change: StreamChange = { type: "uuid", uuid: message.uuid, first: !state.uuid };
	return { state: state.uuid ? state : { ...state, uuid: true }, changes: [change] };
}

function hasResults(message: UserMessage): boolean {
	const content = message.message.content;
	return Array.isArray(content) && content.some((block) => block.type === "tool_result");
}

/** Each `tool_result` block: its text blocks joined by newlines (null for none), and its base64 images of PNG, JPEG, GIF or WebP. */
export function toolOutcomes(message: UserMessage): ToolOutcome[] {
	const content = message.message.content;
	if (!Array.isArray(content)) return [];
	const outcomes: ToolOutcome[] = [];
	for (const block of content) {
		if (block.type !== "tool_result") continue;
		const result = block as ToolResultBlock;
		if (typeof result.tool_use_id !== "string") continue;
		const body = result.content;
		const parts = typeof body === "string" ? [body] : Array.isArray(body) ? body.map((part) => part.text).filter(isString) : [];
		outcomes.push({
			toolUseId: result.tool_use_id,
			isError: result.is_error === true,
			text: parts.length > 0 ? parts.join("\n") : null,
			images: Array.isArray(body) ? body.flatMap(imageOf) : [],
		});
	}
	return outcomes;
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

/** An image block's base64 data of an allowed type, as `[image]`; else none. */
function imageOf(part: Record<string, unknown>): StepImage[] {
	if (part.type !== "image" || typeof part.source !== "object" || part.source === null) return [];
	const { type, media_type: mediaType, data } = part.source as Record<string, unknown>;
	if (type !== "base64" || typeof data !== "string" || typeof mediaType !== "string" || !API_IMAGE_MEDIA_TYPES.has(mediaType))
		return [];
	return [{ mediaType, data }];
}

export function text(value: unknown): string | null {
	return typeof value === "string" && value !== "" ? value : null;
}

function count(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A task as `task_started` or `background_tasks_changed` names it; null without a task id. */
function taskOf(fields: Record<string, unknown>): BackgroundTask | null {
	const taskId = text(fields.task_id);
	if (!taskId) return null;
	const task: BackgroundTask = { taskId, status: "running" };
	const description = text(fields.description);
	const taskType = text(fields.task_type);
	const subagentType = text(fields.subagent_type);
	const toolUseId = text(fields.tool_use_id);
	if (description) task.description = description;
	if (taskType) task.taskType = taskType;
	if (subagentType) task.subagentType = subagentType;
	if (toolUseId) task.toolUseId = toolUseId;
	return task;
}

/** The background-task messages; "skip" for one without what it needs, null for another subtype. */
export function taskEvent(subtype: unknown, fields: Record<string, unknown>): TaskEvent | "skip" | null {
	switch (subtype) {
		case "task_started": {
			const task = taskOf(fields);
			return task ? { type: "started", task } : "skip";
		}
		case "background_tasks_changed": {
			const listed = Array.isArray(fields.tasks) ? fields.tasks : [];
			const tasks = listed.flatMap((entry) => {
				const task = typeof entry === "object" && entry !== null ? taskOf(entry as Record<string, unknown>) : null;
				return task ? [task] : [];
			});
			return { type: "running", tasks };
		}
		case "task_updated": {
			const taskId = text(fields.task_id);
			if (!taskId) return "skip";
			const patch = typeof fields.patch === "object" && fields.patch !== null ? (fields.patch as Record<string, unknown>) : {};
			return { type: "updated", taskId, status: text(patch.status) };
		}
		case "task_notification": {
			const usage = typeof fields.usage === "object" && fields.usage !== null ? (fields.usage as Record<string, unknown>) : {};
			return {
				type: "ended",
				taskId: text(fields.task_id),
				toolUseId: text(fields.tool_use_id),
				report: {
					status: text(fields.status),
					tokens: count(usage.total_tokens),
					toolUses: count(usage.tool_uses),
					durationMs: count(usage.duration_ms),
				},
			};
		}
		default:
			return null;
	}
}
