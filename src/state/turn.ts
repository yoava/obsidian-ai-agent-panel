/**
 * The turn (DES-003 Turn): where a turn opens, continues and closes in the
 * messages model, its head and thinking labels, the elapsed time, the text
 * its footer copies, and the prompts it was sent with. Each change returns
 * the new model and the events its owner fires.
 */

import type {
	Activity,
	AgentBlock,
	CardBlock,
	CardItem,
	ClearItem,
	CompactionItem,
	ErrorItem,
	HeldCall,
	MessageItem,
	MessagesModel,
	MetaRecord,
	NewPrompt,
	NoteItem,
	PromptItem,
	ReportItem,
	ShellItem,
	Step,
	StepsBlock,
	TextBlock,
	ThinkingBlock,
	TurnBlock,
	TurnFooter,
	TurnItem,
} from "./tab";
import type { Clear } from "./clear-divider";
import type { Compaction } from "./compaction";
import type { Card } from "./permission";
import type { TurnTokens } from "./turn-cost";

/** A block before the model gives it an id. */
export type NewBlock =
	| Omit<TextBlock, "id">
	| Omit<ThinkingBlock, "id">
	| Omit<CardBlock, "id">
	| Omit<StepsBlock, "id">
	| Omit<AgentBlock, "id">;

/** Where an item lives: a top-level item, or a block of a turn item. */
export interface ItemRef {
	item: number;
	block: number | null;
}

/** A footer with nothing to show but its copy button: a turn the session ended (DES-003 Turn). */
export const EMPTY_FOOTER: TurnFooter = { record: null, durationMs: null, costUsd: null, error: null, tokens: null };

/** "42s", "3m 05s", "1h 12m": the head, the tab hover card and agent rows (DES-003 Turn). */
export function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	if (total < 60) return `${total}s`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
	return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "3.2s": a turn's duration on its footer, a `!` run's on its card. */
export function formatSeconds(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The head's state (PRD-001.R15) while its turn runs: "Waiting for you"
 * while a card waits, "Writing" while reply text streams, else "Working",
 * with the elapsed time ("" when the start is unknown); null once closed.
 */
export function headView(
	item: Pick<TurnItem, "running" | "startedAt">,
	activity: Activity,
	now: number
): { label: string; elapsed: string } | null {
	if (!item.running) return null;
	const label = activity === "waiting" ? "Waiting for you" : activity === "writing" ? "Writing" : "Working";
	return { label, elapsed: item.startedAt === null ? "" : formatElapsed(now - item.startedAt) };
}

/**
 * A thinking toggle's label (PRD-001.R15): "Thinking…" while it streams,
 * "Thought for Ns" once timed (N whole seconds, at least 1), "Thought
 * process" when the time is unknown, as after a reopen.
 */
export function thinkingLabel(block: Pick<ThinkingBlock, "streaming" | "startedAt" | "endedAt">): string {
	if (block.streaming) return "Thinking…";
	if (block.startedAt === null || block.endedAt === null) return "Thought process";
	return `Thought for ${Math.max(1, Math.floor((block.endedAt - block.startedAt) / 1000))}s`;
}

/** Whether a thinking block has anything to show behind its toggle (PRD-001.R15): text beyond whitespace; a redacted or not yet streamed block is its label alone. */
export function thinkingExpandable(text: string): boolean {
	return /\S/.test(text);
}

/**
 * The prompts the last turn was sent with, oldest first: the one that opened
 * it and those queued into it; panel commands and `!` runs left out. A
 * branch whose rewind failed puts them back in the composer (PRD-002.R15).
 */
export function lastTurnPrompts(model: MessagesModel): PromptItem[] {
	const prompts: PromptItem[] = [];
	for (let at = model.items.length - 1; at >= 0; at--) {
		const item = model.items[at];
		if (item.kind !== "prompt" || item.type !== "prompt") continue;
		prompts.unshift(item);
		if (!item.queued) break;
	}
	return prompts;
}

/** The last turn's prompts marked "Not sent": a branch whose rewind failed sent none of them (PRD-002.R15). */
export function markNotSent(model: MessagesModel): Step {
	const marked = new Map(lastTurnPrompts(model).map((item): [number, PromptItem] => [item.id, { ...item, notSent: true }]));
	if (marked.size === 0) return { model, changes: [] };
	return {
		model: { ...model, items: model.items.map((item) => marked.get(item.id) ?? item) },
		changes: [...marked.values()].map((item) => ({ type: "changed", item })),
	};
}

/** What a turn's copy button copies (PRD-001.R15): its finished reply text blocks, continuations included, joined by blank lines. */
export function turnCopyText(items: readonly MessageItem[], turn: number): string {
	const texts: string[] = [];
	for (const item of items) {
		if (item.kind !== "turn" || item.turn !== turn) continue;
		for (const block of item.blocks) if (block.kind === "text" && !block.streaming && block.text.trim()) texts.push(block.text);
	}
	return texts.join("\n\n");
}

/** A turn record's footer: the error, else the duration and the turn's cost (PRD-005.R7); tokens only when live. */
export function footerOf(record: MetaRecord, costUsd: number | null, tokens: TurnTokens | null): TurnFooter {
	if (record.error !== undefined) return { record, durationMs: null, costUsd: null, error: record.error, tokens: null };
	return { record, durationMs: record.durationMs ?? null, costUsd, error: null, tokens };
}

/**
 * The record of a turn that ended without a `result` (the CLI exited, the
 * tab closed, Obsidian quit): its number, so a reopen closes the turn there
 * and the next prompt opens a turn of its own (DES-005), and the last prompt
 * the CLI echoed in it with its session, which a branch names as last seen
 * (PRD-002.R15).
 */
export function turnEndRecord(turn: number, lastPrompt: { uuid: string; sessionId: string | null } | null = null): MetaRecord {
	const record: MetaRecord = { kind: "meta", turn };
	if (lastPrompt) {
		record.lastPromptUuid = lastPrompt.uuid;
		if (lastPrompt.sessionId) record.sessionId = lastPrompt.sessionId;
	}
	return record;
}

/**
 * Whether a `meta` record is the error a session ended with (DES-002
 * Session end) rather than a turn's `result` or end: it carries the error alone.
 */
export function endedSession(record: MetaRecord): boolean {
	return (
		record.error !== undefined &&
		record.costUsd === undefined &&
		record.durationMs === undefined &&
		record.turn === undefined &&
		record.sessionId === undefined
	);
}

// --- The machine --------------------------------------------------------------

/** One item replaced through `change`; null when no turn item has the id. */
function replaceTurn(
	items: readonly MessageItem[],
	id: number,
	change: (turn: TurnItem) => TurnItem
): { items: MessageItem[]; item: TurnItem } | null {
	const at = items.findIndex((item) => item.id === id);
	const found = items[at];
	if (!found || found.kind !== "turn") return null;
	const item = change(found);
	const next = [...items];
	next[at] = item;
	return { items: next, item };
}

function chain(first: Step, second: Step): Step {
	return { model: second.model, changes: [...first.changes, ...second.changes] };
}

/**
 * An item at the end, outside any turn. While a turn runs, its next block
 * then starts a continuation after it, so the messages stay in order.
 */
function appendTop(model: MessagesModel, item: MessageItem, counts: Partial<MessagesModel> = {}): Step {
	const left = leaveItem(model);
	const open = left.model.open ? { ...left.model.open, itemId: null } : null;
	return chain(left, {
		model: { ...left.model, ...counts, items: [...left.model.items, item], lastId: item.id, open },
		changes: [{ type: "added", item }],
	});
}

/**
 * The running turn's blocks leave its current item for a continuation after
 * a message: the item's open tool-step groups close (DES-003 Tool-step group).
 */
function leaveItem(model: MessagesModel): Step {
	const id = model.open?.itemId;
	if (id === null || id === undefined) return { model, changes: [] };
	const replaced = replaceTurn(model.items, id, (turn) => {
		const blocks = closedGroups(turn.blocks);
		return blocks === turn.blocks ? turn : { ...turn, blocks };
	});
	const found = model.items.find((item) => item.id === id);
	if (!replaced || replaced.item === found) return { model, changes: [] };
	return { model: { ...model, items: replaced.items }, changes: [{ type: "changed", item: replaced.item }] };
}

/**
 * A turn opens (DES-003 Turn): at a message sent to Claude while none runs,
 * or at Claude's first output while none runs; the tab's turn counter goes
 * up. `now` is null for a reopened turn, which has no timing.
 */
export function openTurn(model: MessagesModel, now: number | null): Step {
	const id = model.lastId + 1;
	const turn = model.turns + 1;
	const head: TurnItem = {
		kind: "turn",
		id,
		turn,
		continuation: false,
		startedAt: now,
		running: true,
		blocks: [],
		footer: null,
	};
	return {
		model: {
			...model,
			items: [...model.items, head],
			lastId: id,
			turns: turn,
			open: { turn, startedAt: now, headId: id, itemId: id, lastId: id },
		},
		changes: [{ type: "added", item: head }],
	};
}

/** The running turn's body continued at the end, without a head. */
function continueTurn(model: MessagesModel): Step {
	const open = model.open;
	if (!open) return { model, changes: [] };
	const id = model.lastId + 1;
	const item: TurnItem = {
		kind: "turn",
		id,
		turn: open.turn,
		continuation: true,
		startedAt: null,
		running: false,
		blocks: [],
		footer: null,
	};
	return {
		model: { ...model, items: [...model.items, item], lastId: id, open: { ...open, itemId: id, lastId: id } },
		changes: [{ type: "added", item }],
	};
}

/**
 * A user message at the end (PRD-001.R33): a prompt to Claude is numbered;
 * sent while no turn runs it opens one, sent while one runs it is queued and
 * starts the turn's continuation. A panel command or a `!` run sends the
 * running turn's next block to a continuation after it.
 */
export function addUserMessage(model: MessagesModel, prompt: NewPrompt, now: number | null = null): Step & { item: PromptItem } {
	const sent = prompt.type === "prompt";
	const item: PromptItem = {
		kind: "prompt",
		id: model.lastId + 1,
		number: sent ? model.prompts + 1 : null,
		...prompt,
		queued: sent && model.open !== null,
	};
	if (!sent) return { ...appendTop(model, item), item };
	const left = leaveItem(model);
	const added: Step = chain(left, {
		model: { ...left.model, items: [...left.model.items, item], lastId: item.id, prompts: model.prompts + 1 },
		changes: [{ type: "added", item }],
	});
	const turn = added.model.open ? continueTurn(added.model) : openTurn(added.model, now);
	return { ...chain(added, turn), item };
}

/**
 * A block of Claude's at the end of the running turn: in the item its blocks
 * go to, or a continuation when a user message came after it; the first
 * output while no turn runs opens one.
 */
export function addBlock(model: MessagesModel, block: NewBlock, now: number | null): Step & { id: number; item: number } {
	let step: Step = model.open ? { model, changes: [] } : openTurn(model, now);
	if (step.model.open?.itemId === null) step = chain(step, continueTurn(step.model));
	const target = step.model.open?.itemId ?? -1;
	const id = step.model.lastId + 1;
	const full: TurnBlock = { ...block, id };
	const replaced = replaceTurn(step.model.items, target, (turn) => ({ ...turn, blocks: [...turn.blocks, full] }));
	if (!replaced) return { ...step, id, item: target };
	return {
		model: { ...step.model, items: replaced.items, lastId: id },
		changes: [...step.changes, { type: "changed", item: replaced.item }],
		id,
		item: target,
	};
}

/** The turn item holding block `id`, newest first. */
function holderOf(items: readonly MessageItem[], id: number): TurnItem | null {
	for (let at = items.length - 1; at >= 0; at--) {
		const item = items[at];
		if (item.kind === "turn" && item.blocks.some((block) => block.id === id)) return item;
	}
	return null;
}

/** Block `id` changed where it is, a later continuation notwithstanding; an unknown id changes nothing. */
export function patchBlock(model: MessagesModel, id: number, patch: Partial<Omit<TurnBlock, "id" | "kind">>): Step {
	const holder = holderOf(model.items, id);
	const replaced =
		holder &&
		replaceTurn(model.items, holder.id, (turn) => ({
			...turn,
			blocks: turn.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
		}));
	if (!replaced) return { model, changes: [] };
	return { model: { ...model, items: replaced.items }, changes: [{ type: "changed", item: replaced.item }] };
}

/** Block `id` gone: a reply that ended empty (PRD-001.R15). */
export function removeBlock(model: MessagesModel, id: number): Step {
	const holder = holderOf(model.items, id);
	const replaced =
		holder && replaceTurn(model.items, holder.id, (turn) => ({ ...turn, blocks: turn.blocks.filter((block) => block.id !== id) }));
	if (!replaced) return { model, changes: [] };
	return { model: { ...model, items: replaced.items }, changes: [{ type: "changed", item: replaced.item }] };
}

/** The blocks with every open tool-step group closed; the same list when none is open. */
function closedGroups(blocks: readonly TurnBlock[]): readonly TurnBlock[] {
	if (!blocks.some((block) => block.kind === "steps" && block.open)) return blocks;
	return blocks.map((block) => (block.kind === "steps" && block.open ? { ...block, open: false } : block));
}

/**
 * The running turn closes, at its `result` or the session's end: its head
 * stops, its open tool-step groups close (DES-003 Tool-step group), and
 * `footer` goes at the end of its last continuation. A turn record with no
 * turn running (one with no output) opens one to close; a session ending
 * with none running closes nothing.
 */
export function closeTurn(model: MessagesModel, footer: TurnFooter, now: number | null): Step {
	let step: Step = { model, changes: [] };
	if (!model.open) {
		if (footer.record === null) return step;
		step = openTurn(model, now);
	}
	const open = step.model.open;
	if (!open) return step;
	const changes = [...step.changes];
	const bare = compactionOnly(step.model.items, open.turn, footer);
	if (bare.length > 0) {
		// A turn that held only a compaction (a `/compact`): no head and no footer; its record still counts (PRD-005.R7).
		const gone = new Set(bare.map((item) => item.id));
		for (const item of bare) changes.push({ type: "removed", id: item.id });
		return { model: { ...step.model, items: step.model.items.filter((item) => !gone.has(item.id)), open: null }, changes };
	}
	const items = step.model.items.map((item) => {
		if (item.kind !== "turn" || item.turn !== open.turn) return item;
		let next: TurnItem = item;
		if (item.id === open.headId) next = { ...next, running: false };
		if (item.id === open.lastId) next = { ...next, footer };
		const blocks = closedGroups(next.blocks);
		if (blocks !== next.blocks) next = { ...next, blocks };
		if (next !== item) changes.push({ type: "changed", item: next });
		return next;
	});
	return { model: { ...step.model, items, open: null }, changes };
}

/** The items of turn `turn` when it holds no block and follows a compaction divider (and ends without an error); else none. */
function compactionOnly(items: readonly MessageItem[], turn: number, footer: TurnFooter): TurnItem[] {
	if (footer.error !== null) return [];
	const own = items.filter((item): item is TurnItem => item.kind === "turn" && item.turn === turn);
	if (own.length === 0 || own.some((item) => item.blocks.length > 0)) return [];
	const head = items.indexOf(own[0]);
	return items[head - 1]?.kind === "compaction" ? own : [];
}

/** The branch note (PRD-002.R15): an item at the end, outside any turn, which continues after it. */
export function addNote(model: MessagesModel, text: string): Step & { item: NoteItem } {
	const item: NoteItem = { kind: "note", id: model.lastId + 1, text };
	return { ...appendTop(model, item), item };
}

/** Errors outside a turn (DES-003 Stream to messages): an error block of up to 2000 characters. */
export function addError(model: MessagesModel, text: string): Step & { item: ErrorItem } {
	const item: ErrorItem = { kind: "error", id: model.lastId + 1, text: text.slice(0, 2000) };
	return { ...appendTop(model, item), item };
}

/**
 * A permission card or question form (DES-003 Cards): a block of the running
 * turn, or, while no turn runs (a background agent's request), an item at
 * the end.
 */
export function addCard(model: MessagesModel, card: Card, now: number | null, held: HeldCall | null = null): Step & { ref: ItemRef } {
	if (model.open) {
		const step = addBlock(model, { kind: "card", card, held }, now);
		return { ...step, ref: { item: step.item, block: step.id } };
	}
	const item: CardItem = { kind: "card", id: model.lastId + 1, card, held };
	return { ...appendTop(model, item), ref: { item: item.id, block: null } };
}

/** The card at `ref` changed where it is, and with `held` the row it holds; a ref that holds no card changes nothing. */
export function patchCard(model: MessagesModel, ref: ItemRef, card: Card, held?: HeldCall | null): Step {
	const patch = held === undefined ? { card } : { card, held };
	if (ref.block !== null) {
		const holder = holderOf(model.items, ref.block);
		if (!holder?.blocks.some((block) => block.id === ref.block && block.kind === "card")) return { model, changes: [] };
		return patchBlock(model, ref.block, patch);
	}
	const at = model.items.findIndex((entry) => entry.id === ref.item);
	const found = model.items[at];
	if (!found || found.kind !== "card") return { model, changes: [] };
	const item: CardItem = { ...found, ...patch };
	const items = [...model.items];
	items[at] = item;
	return { model: { ...model, items }, changes: [{ type: "changed", item }] };
}

/**
 * A panel command's card at the end, loading (DES-003 Panel commands):
 * outside any turn, which continues after it, as a `!` run's card does.
 */
export function addReport(model: MessagesModel, command: string): Step & { item: ReportItem } {
	const item: ReportItem = {
		kind: "report",
		id: model.lastId + 1,
		command,
		state: "loading",
		report: null,
		error: null,
		markdown: null,
	};
	return { ...appendTop(model, item), item };
}

/** A `!` run's card at the end, running (PRD-002.R16). */
export function addShell(model: MessagesModel, command: string): Step & { item: ShellItem } {
	const item: ShellItem = { kind: "shell", id: model.lastId + 1, command, result: null };
	return { ...appendTop(model, item), item };
}

/**
 * A compaction's divider (PRD-001.R37). Outside any turn at the end, so the
 * running turn's next block continues after it, as after a `!` run's card;
 * but while the running turn has no block yet it goes before that turn's
 * item, so the divider follows the prompt and the reply (or nothing) follows it.
 */
export function addCompaction(model: MessagesModel, compaction: Compaction): Step & { item: CompactionItem } {
	const item: CompactionItem = { kind: "compaction", id: model.lastId + 1, ...compaction };
	const open = model.open;
	const last = model.items[model.items.length - 1];
	if (open && open.itemId !== null && last?.kind === "turn" && last.id === open.itemId && last.blocks.length === 0) {
		return {
			model: { ...model, items: [...model.items.slice(0, -1), item, last], lastId: item.id },
			changes: [{ type: "removed", id: last.id }, { type: "added", item }, { type: "added", item: last }],
			item,
		};
	}
	return { ...appendTop(model, item), item };
}

/** A completed clear's divider (PRD-001.R38), at the end, outside any turn. */
export function addClear(model: MessagesModel, clear: Clear): Step & { item: ClearItem } {
	const item: ClearItem = { kind: "clear", id: model.lastId + 1, ...clear };
	return { ...appendTop(model, item), item };
}

/** The clear item `id` taken away (an Undo, PRD-001.R38); nothing when the model holds no clear with it. */
export function removeClear(model: MessagesModel, id: number): Step {
	if (!model.items.some((item) => item.id === id && item.kind === "clear")) return { model, changes: [] };
	return { model: { ...model, items: model.items.filter((item) => item.id !== id) }, changes: [{ type: "removed", id }] };
}

/** A report, `!`, compaction or clear item replaced where it is by `item`, as `item:<id>`; nothing when no item of its kind has its id. */
export function updateItem(model: MessagesModel, item: ReportItem | ShellItem | CompactionItem | ClearItem): Step {
	const at = model.items.findIndex((entry) => entry.id === item.id);
	if (at === -1 || model.items[at].kind !== item.kind) return { model, changes: [] };
	const items = [...model.items];
	items[at] = item;
	return { model: { ...model, items }, changes: [{ type: "changed", item }] };
}
