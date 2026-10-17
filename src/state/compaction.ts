/**
 * Compaction markers (PRD-001.R37; DES-003 Compaction dividers): the CLI's
 * compaction messages read as signals, the divider's data as they change it,
 * the record they write (PRD-003.R1) and the texts the divider and the
 * exported note show. Pure: `tab/chat-tab` applies the steps to the messages
 * model and the recorder.
 */

import type { StoredMessage } from "../history";
import { shortTokens } from "../commands";
import { formatClock } from "./usage-segment";
import type { EventView, SubPart } from "./event-view";

export type CompactTrigger = "auto" | "manual";

/** A compaction as the messages draw it: in progress, finished, or not finished. */
export interface Compaction {
	phase: "compacting" | "compacted" | "failed";
	trigger: CompactTrigger;
	/** The context percentage known when it began; null when none was. */
	percent: number | null;
	/** When it was reported done; null while it is not, and for a record without a time. */
	at: number | null;
	preTokens: number | null;
	postTokens: number | null;
	/** The CLI's summary of what it kept; null when none came. */
	summary: string | null;
}

/** The conversation file's record of a finished compaction (ADR-018). */
export type CompactionRecord = Extract<StoredMessage, { kind: "compaction" }>;

/** What the CLI reported (E3, V5), told apart from its other messages. */
export type CompactionSignal =
	| { type: "compacting" }
	| { type: "success" }
	| { type: "failed" }
	| { type: "boundary"; trigger: CompactTrigger | null; preTokens: number | null; postTokens: number | null }
	| { type: "summary"; text: string }
	/** The CLI's own notice, sent as a synthetic `assistant` message and not a reply of Claude's (V5). */
	| { type: "notice"; notice: "empty" | "canceled" };

function count(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The text of a user message's content: a string, or its text blocks joined by newlines. */
function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.flatMap((block: unknown) => {
			const part = typeof block === "object" && block !== null ? (block as { type?: unknown; text?: unknown }) : {};
			return part.type === "text" && typeof part.text === "string" ? [part.text] : [];
		})
		.join("\n");
}

/**
 * The compaction signal a stream message carries, or null for any other:
 * `system/status` with `compacting`, or with a null status and a
 * `compact_result` (`success`, else a failure); `compact_boundary`; and the
 * synthetic user message that holds the summary.
 */
export function compactionSignal(message: Record<string, unknown>): CompactionSignal | null {
	if (message.type === "assistant") return noticeSignal(message);
	if (message.type === "system") {
		if (message.subtype === "compact_boundary") {
			const meta = typeof message.compact_metadata === "object" && message.compact_metadata !== null ? (message.compact_metadata as Record<string, unknown>) : {};
			const trigger = meta.trigger === "auto" || meta.trigger === "manual" ? meta.trigger : null;
			return { type: "boundary", trigger, preTokens: count(meta.pre_tokens), postTokens: count(meta.post_tokens) };
		}
		if (message.subtype !== "status") return null;
		if (message.status === "compacting") return { type: "compacting" };
		if (message.status === null && typeof message.compact_result === "string")
			return { type: message.compact_result === "success" ? "success" : "failed" };
		return null;
	}
	if (message.type !== "user" || message.isSynthetic !== true) return null;
	const body = message.message as { content?: unknown } | undefined;
	const content = body?.content;
	if (Array.isArray(content) && content.some((block) => (block as { type?: unknown } | null)?.type === "tool_result")) return null;
	const text = contentText(content);
	return text ? { type: "summary", text } : null;
}

const NOTICES: Readonly<Record<string, "empty" | "canceled">> = {
	"Error: No messages to compact": "empty",
	"Compaction canceled.": "canceled",
};

/** The CLI's two compaction notices: a `<synthetic>` assistant message holding only that text (V5). */
function noticeSignal(message: Record<string, unknown>): CompactionSignal | null {
	const body = message.message as { model?: unknown; content?: unknown } | undefined;
	if (body?.model !== "<synthetic>") return null;
	const notice = NOTICES[contentText(body.content).trim()];
	return notice ? { type: "notice", notice } : null;
}

/** Whether a message sent to Claude Code is `/compact`, with instructions or without (PRD-001.R37). */
export function startsCompaction(text: string): boolean {
	return /^\/compact(?:\s|$)/.test(text);
}

// --- The machine --------------------------------------------------------------

/** What a turn has shown of its compaction. */
export interface CompactionState {
	/** The divider the turn's latest compaction draws; null before one. */
	current: Compaction | null;
	/** Its boundary came (the counts are in). */
	boundary: boolean;
	/** Any compaction message came in this turn, a failed one included. */
	seen: boolean;
}

/**
 * The `/compact` sends made while a turn runs, oldest first, one flag per
 * queued send; the CLI runs each as the next turn, so each result takes the
 * first (PRD-001.R37).
 */
export type SendQueue = readonly boolean[];

export function queueSend(queue: SendQueue, text: string): SendQueue {
	return [...queue, startsCompaction(text)];
}

/** A turn ends: whether the next one, taken from the queue, is a `/compact`. */
export function nextTurn(queue: SendQueue): { manual: boolean; queue: SendQueue } {
	return { manual: queue[0] ?? false, queue: queue.slice(1) };
}

export const NO_COMPACTION: CompactionState = { current: null, boundary: false, seen: false };

/** What the tab knows when a message comes. */
export interface CompactionContext {
	/** The running turn was started with `/compact`. */
	manualTurn: boolean;
	/** The last known context percentage; null for none. */
	percent: number | null;
	now: number;
}

/** The record changes a step asks for: a new record, or fields of the last one. */
export type CompactionRecordOp = { type: "add"; record: CompactionRecord } | { type: "patch"; patch: Partial<Omit<CompactionRecord, "kind">> };

export interface CompactionStep {
	state: CompactionState;
	/** The divider's data now: a new divider (`isNew`), or the latest one changed; null for no change. */
	show: { data: Compaction; isNew: boolean } | null;
	record: CompactionRecordOp | null;
}

function begin(context: CompactionContext): Compaction {
	return {
		phase: "compacting",
		trigger: context.manualTurn ? "manual" : "auto",
		percent: context.percent,
		at: null,
		preTokens: null,
		postTokens: null,
		summary: null,
	};
}

function stepOf(state: CompactionState, data: Compaction, isNew: boolean, record: CompactionRecordOp | null): CompactionStep {
	return { state: { ...state, current: data, seen: true }, show: { data, isNew }, record };
}

/**
 * One signal applied (PRD-001.R37). `compacting` starts a divider; `success`
 * and `boundary` finish it and write the record, whichever comes first (E3,
 * V5: the status ends, then the boundary), the other filling in the counts;
 * `failed` ends it unfinished. The summary joins the finished divider once,
 * and only while the turn runs (ADR-018).
 */
export function reduceCompaction(state: CompactionState, signal: CompactionSignal, context: CompactionContext): CompactionStep {
	const current = state.current;
	const idle: CompactionStep = { state, show: null, record: null };
	switch (signal.type) {
		case "compacting":
			if (current?.phase === "compacting") return idle;
			return stepOf({ ...NO_COMPACTION }, begin(context), true, null);
		case "success": {
			// The record waits for the boundary (ADR-018): a success alone only ends the divider.
			if (current?.phase === "compacted") return idle;
			const base = current?.phase === "compacting" ? current : begin(context);
			return stepOf(state, { ...base, phase: "compacted", at: context.now }, current?.phase !== "compacting", null);
		}
		case "boundary": {
			if (state.boundary) return idle;
			const counts = { preTokens: signal.preTokens, postTokens: signal.postTokens };
			const base = current?.phase === "compacting" || current?.phase === "compacted" ? current : begin(context);
			const data: Compaction = { ...base, phase: "compacted", trigger: signal.trigger ?? base.trigger, at: base.at ?? context.now, ...counts };
			const record: CompactionRecord = {
				kind: "compaction",
				at: data.at ?? context.now,
				trigger: data.trigger,
				...(counts.preTokens !== null && { preTokens: counts.preTokens }),
				...(counts.postTokens !== null && { postTokens: counts.postTokens }),
			};
			return stepOf({ ...state, boundary: true }, data, current === null || current.phase === "failed", { type: "add", record });
		}
		case "failed":
			if (current?.phase === "compacting") return stepOf(state, { ...current, phase: "failed" }, false, null);
			return stepOf(state, { ...begin(context), phase: "failed" }, true, null);
		case "notice": {
			// "Compaction canceled." follows a failure the divider already shows; the empty session has no other sign.
			if (signal.notice === "canceled" && current?.phase === "failed") return { state: { ...state, seen: true }, show: null, record: null };
			if (current?.phase === "compacting") return stepOf(state, { ...current, phase: "failed" }, false, null);
			return stepOf(state, { ...begin(context), phase: "failed" }, true, null);
		}
		case "summary":
			if (current?.phase !== "compacted" || current.summary !== null) return idle;
			return stepOf(state, { ...current, summary: signal.text }, false, { type: "patch", patch: { summary: signal.text } });
	}
}

/**
 * The turn ends (PRD-001.R37): a divider still compacting did not finish,
 * and so did the compaction of a `/compact` turn that reported none. The
 * state starts over, so a late summary is dropped.
 */
export function settleCompaction(state: CompactionState, context: Pick<CompactionContext, "manualTurn" | "percent">): CompactionStep {
	const ended: CompactionState = NO_COMPACTION;
	if (state.current?.phase === "compacting")
		return { state: ended, show: { data: { ...state.current, phase: "failed" }, isNew: false }, record: null };
	if (!state.seen && context.manualTurn)
		return { state: ended, show: { data: { ...begin({ ...context, now: 0 }), phase: "failed" }, isNew: true }, record: null };
	return { state: ended, show: null, record: null };
}

/** A stored compaction as the divider draws it (PRD-003.R9). */
export function compactionFromRecord(record: CompactionRecord): Compaction {
	return {
		phase: "compacted",
		trigger: record.trigger === "manual" ? "manual" : "auto",
		percent: null,
		at: record.at ?? null,
		preTokens: record.preTokens ?? null,
		postTokens: record.postTokens ?? null,
		summary: record.summary ?? null,
	};
}

// --- Texts --------------------------------------------------------------------

export const COMPACTION_FAILED = "Compaction did not finish.";

/** "Compacted at 14:20, 131k to 18k tokens": the separator's name and the exported note (PRD-001.R28, PRD-003.R13); a count not reported is left out. */
export function compactedLine(at: number | null, preTokens: number | null, postTokens: number | null, clock: (time: number) => string): string {
	const head = at === null ? "Compacted" : `Compacted at ${clock(at)}`;
	if (preTokens !== null && postTokens !== null) return `${head}, ${shortTokens(preTokens)} to ${shortTokens(postTokens)} tokens`;
	const only = preTokens ?? postTokens;
	return only === null ? head : `${head}, ${shortTokens(only)} tokens`;
}

/** The divider's pill, sub-line and name for a compaction (PRD-001.R37, PRD-001.R28). */
export function compactionView(compaction: Compaction): EventView {
	const phase = compaction.phase;
	if (compaction.phase === "failed")
		return { phase, role: "status", tone: "warning", icon: ["circle-alert", "alert-circle"], spinning: false, label: COMPACTION_FAILED, sub: [], aria: COMPACTION_FAILED.replace(/\.$/, ""), summary: false, summaryText: null };
	if (compaction.phase === "compacting") {
		const auto = compaction.trigger === "auto";
		const sub: SubPart[] = [];
		if (compaction.percent !== null) sub.push({ text: `Context ${Math.round(compaction.percent)}% full` });
		sub.push({ text: "Claude picks up where it left off", ...(sub.length > 0 && { dot: true }) });
		return {
			phase,
			role: "status",
			tone: "accent",
			icon: ["loader-circle", "loader-2"],
			spinning: true,
			label: auto ? "Compacting automatically…" : "Compacting…",
			sub,
			aria: auto ? "Compacting automatically" : "Compacting",
			summary: false,
			summaryText: null,
		};
	}
	const sub: SubPart[] = [];
	if (compaction.at !== null) sub.push({ text: formatClock(compaction.at) });
	const { preTokens, postTokens } = compaction;
	const figure =
		preTokens !== null && postTokens !== null
			? `${shortTokens(preTokens)} → ${shortTokens(postTokens)}`
			: preTokens !== null || postTokens !== null
				? shortTokens(preTokens ?? postTokens ?? 0)
				: null;
	if (figure !== null) sub.push({ text: figure, mono: true, ...(sub.length > 0 && { dot: true }) }, { text: "tokens" });
	return {
		phase,
		role: "separator",
		tone: "accent",
		icon: ["fold-vertical", "chevrons-down-up"],
		spinning: false,
		label: "Compacted",
		sub,
		aria: compactedLine(compaction.at, preTokens, postTokens, formatClock),
		summary: compaction.summary !== null && compaction.summary !== "",
		summaryText: compaction.summary,
	};
}
