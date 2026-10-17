/**
 * Tool steps and agent rows (DES-003 Tool-step group, Tool steps, Agent rows
 * and run bar): where a tool call's step row or a Task or Agent call's agent
 * row goes in the messages model, the group machine that opens and closes
 * groups in the main turn and in each subagent's thread, the cards that hold
 * a call's row while they wait, each call's outcome, and the view-models the
 * rows draw. Each change returns the new model and the events its owner fires.
 */

import { formatTokens } from "../commands";
import { diffText } from "../diff";
import { planEdit } from "../edits";
import { describeModelId } from "../models";
import type { AssistantMessage, ContentBlock, ToolUseBlock } from "../protocol/types";
import { resultCount } from "../tool-labels";
import { callProceeds, cardToolName, type Card } from "./permission";
import type { TaskReport, ToolOutcome } from "./stream";
import type {
	AgentBlock,
	AgentStatus,
	HeldCall,
	MessageItem,
	MessagesModel,
	Step,
	StepRow,
	StepsBlock,
	StepStatus,
	ThreadBlock,
	TurnBlock,
} from "./tab";
import { addBlock, addCard, formatElapsed, openTurn, type ItemRef } from "./turn";

/** A step row's result is cut to this (PRD-001.R16). */
export const RESULT_CHARS = 1500;
/** An agent row's label and type are cut to this, as a summary is. */
const LABEL_CHARS = 96;

/** A tool call as its `tool_use` block, or its card, names it. */
export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** A Task or Agent call starts a subagent, drawn as an agent row (PRD-001.R18). */
export function isAgentTool(name: string): boolean {
	return name === "Task" || name === "Agent";
}

// --- The model as a tree ---------------------------------------------------------

/** A top-level item or a block at any depth; ids are unique across them. */
type Node = MessageItem | TurnBlock;

/** The blocks a node holds: a turn item's blocks, an agent row's thread. */
function childrenOf(node: Node): readonly TurnBlock[] | null {
	if (node.kind === "turn") return node.blocks;
	if (node.kind === "agent") return node.thread;
	return null;
}

function withChildren(node: Node, children: readonly TurnBlock[]): Node {
	if (node.kind === "turn") return { ...node, blocks: children };
	if (node.kind === "agent") return { ...node, thread: children as readonly ThreadBlock[] };
	return node;
}

/** Depth first, newest first: the ids from a top-level item down to the first node `match` accepts. */
function findPath(items: readonly MessageItem[], match: (node: Node) => boolean): number[] | null {
	const visit = (list: readonly Node[], prefix: readonly number[]): number[] | null => {
		for (let at = list.length - 1; at >= 0; at--) {
			const node = list[at];
			const path = [...prefix, node.id];
			if (match(node)) return path;
			const children = childrenOf(node);
			const found = children ? visit(children, path) : null;
			if (found) return found;
		}
		return null;
	};
	return visit(items, []);
}

/** The node `path` names, or null. */
function nodeAt(items: readonly MessageItem[], path: readonly number[]): Node | null {
	let list: readonly Node[] = items;
	let node: Node | null = null;
	for (const id of path) {
		node = list.find((entry) => entry.id === id) ?? null;
		if (!node) return null;
		list = childrenOf(node) ?? [];
	}
	return node;
}

/** `list` with the node `path` names replaced by `change`'s result, or removed when it gives null; null when missing. */
function replaceAt<T extends Node>(list: readonly T[], path: readonly number[], change: (node: Node) => Node | null): T[] | null {
	const at = list.findIndex((node) => node.id === path[0]);
	if (at < 0) return null;
	const node = list[at];
	let next: Node | null;
	if (path.length === 1) next = change(node);
	else {
		const children = childrenOf(node);
		const replaced = children && replaceAt(children, path.slice(1), change);
		if (!replaced) return null;
		next = withChildren(node, replaced);
	}
	const out = [...list];
	if (next === null) out.splice(at, 1);
	else out[at] = next as T;
	return out;
}

const none = (model: MessagesModel): Step => ({ model, changes: [] });

function chain(first: Step, second: Step): Step {
	return { model: second.model, changes: [...first.changes, ...second.changes] };
}

/** The model with the node at `path` changed; its top-level item fires `item:<id>`, or `items` when removed. */
function changeAt(model: MessagesModel, path: readonly number[], change: (node: Node) => Node | null): Step {
	const items = replaceAt(model.items, path, change);
	if (!items) return none(model);
	const item = items.find((entry) => entry.id === path[0]);
	return {
		model: { ...model, items },
		changes: [item ? { type: "changed", item } : { type: "removed", id: path[0] }],
	};
}

// --- Containers: the main turn, or an agent's thread --------------------------------

/** Where the call's row or agent row is: the path to its group or agent row; null when none. */
function callPath(items: readonly MessageItem[], toolUseId: string): number[] | null {
	return findPath(
		items,
		(node) =>
			(node.kind === "steps" && node.rows.some((row) => row.toolUseId === toolUseId)) ||
			(node.kind === "agent" && node.toolUseId === toolUseId)
	);
}

function agentPath(items: readonly MessageItem[], toolUseId: string): number[] | null {
	return findPath(items, (node) => node.kind === "agent" && node.toolUseId === toolUseId);
}

/** The card or form for a call, newest first, and where it is. */
function cardFor(items: readonly MessageItem[], toolUseId: string): { card: Card; held: HeldCall | null; path: number[] } | null {
	const path = findPath(items, (node) => node.kind === "card" && node.card.toolUseId === toolUseId);
	const node = path && nodeAt(items, path);
	return path && node?.kind === "card" ? { card: node.card, held: node.held, path } : null;
}

/**
 * The path to a container's open group, if any: the last block of the main
 * turn's current item (DES-003: a group opens at the end of the turn's
 * items, or of its last continuation), or of the agent's thread.
 */
function openGroupPath(model: MessagesModel, parent: string | null): number[] | null {
	const container = containerPath(model, parent);
	if (!container) return null;
	const node = nodeAt(model.items, container);
	const children = node ? childrenOf(node) : null;
	const last = children?.[children.length - 1];
	return last?.kind === "steps" && last.open ? [...container, last.id] : null;
}

/** The main turn's current item while one runs, or the agent row of `parent`. */
function containerPath(model: MessagesModel, parent: string | null): number[] | null {
	if (parent !== null) return agentPath(model.items, parent);
	return model.open?.itemId != null ? [model.open.itemId] : null;
}

/** A container's open group closes (DES-003 Tool-step group). */
export function closeGroup(model: MessagesModel, parent: string | null): Step {
	const path = openGroupPath(model, parent);
	return path ? changeAt(model, path, (node) => (node.kind === "steps" ? { ...node, open: false } : node)) : none(model);
}

/** A block before the model gives it an id, kind by kind. */
type NewOf<T> = T extends unknown ? Omit<T, "id"> : never;
type NewThreadBlock = NewOf<ThreadBlock>;

/**
 * A block at the end of a container: the main turn (opening one at the
 * first output, `addBlock`), or an agent row on its own while none runs;
 * the agent's thread.
 */
function append(model: MessagesModel, parent: string | null, block: NewThreadBlock, now: number | null): Step {
	if (parent === null) {
		if (!model.open && block.kind === "agent") {
			const item = { ...block, id: model.lastId + 1 } as AgentBlock;
			return { model: { ...model, items: [...model.items, item], lastId: item.id }, changes: [{ type: "added", item }] };
		}
		return addBlock(model, block, now);
	}
	const path = agentPath(model.items, parent);
	if (!path) return none(model);
	const id = model.lastId + 1;
	const full = { ...block, id };
	const step = changeAt(model, path, (node) => (node.kind === "agent" ? { ...node, thread: [...node.thread, full] } : node));
	return { ...step, model: { ...step.model, lastId: id } };
}

// --- Rows and agent rows -----------------------------------------------------------

function runningRow(call: ToolCall, now: number | null): StepRow {
	return {
		toolUseId: call.id,
		name: call.name,
		input: call.input,
		status: "running",
		startedAt: now,
		endedAt: null,
		count: null,
		result: null,
		edit: null,
		landed: null,
		images: [],
	};
}

function cut(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) return null;
	return value.length > LABEL_CHARS ? value.slice(0, LABEL_CHARS - 3) + "…" : value;
}

function newAgent(toolUseId: string | null, input: Record<string, unknown>, now: number | null, live: boolean): Omit<AgentBlock, "id"> {
	return {
		kind: "agent",
		toolUseId,
		description: cut(input.description),
		subagentType: cut(input.subagent_type),
		background: input.run_in_background === true,
		models: [],
		toolUses: 0,
		tokens: 0,
		reported: false,
		status: live ? "running" : null,
		startedAt: now,
		endedAt: null,
		durationMs: null,
		thread: [],
		live,
	};
}

/**
 * A call in a container, whose thread is made an agent row on its own first
 * when missing: an agent row closes the open group and opens none; a row
 * joins the open group, or, `fresh` or with none open, is first in a new
 * one (DES-003 Tool-step group).
 */
function place(
	model: MessagesModel,
	parent: string | null,
	entry: StepRow | Omit<AgentBlock, "id">,
	fresh: boolean,
	now: number | null
): Step {
	const start = parent === null ? none(model) : ensureAgent(model, parent, now);
	const open = fresh || "kind" in entry ? null : openGroupPath(start.model, parent);
	if (open)
		return chain(
			start,
			changeAt(start.model, open, (node) => (node.kind === "steps" ? { ...node, rows: [...node.rows, entry as StepRow] } : node))
		);
	const closed = chain(start, closeGroup(start.model, parent));
	const block: NewThreadBlock = "kind" in entry ? entry : { kind: "steps", rows: [entry], open: true };
	return chain(closed, append(closed.model, parent, block, now));
}

/**
 * The thread of `parent`, made an agent row on its own (in the running turn,
 * else at the end) when its call is not in the messages (PRD-001.R18).
 */
function ensureAgent(model: MessagesModel, parent: string, now: number | null): Step {
	if (agentPath(model.items, parent)) return none(model);
	return place(model, null, newAgent(parent, {}, now, true), true, now);
}

/**
 * A `tool_use` (DES-003 Tool-step group): a Task or Agent call closes the
 * open group and adds an agent row; another call joins the open group as a
 * running row, opening one if none is open. A call whose card or form waits
 * gets no row: the card holds it, with its thread, unless it holds one
 * already. A call whose card was withdrawn or ended with its session gets
 * none; one whose card was answered before it came is the first row of a
 * new group. A call already placed is not placed again. `parent` names a
 * subagent's thread.
 */
export function addToolUse(model: MessagesModel, call: ToolCall, parent: string | null, now: number | null): Step {
	if (callPath(model.items, call.id)) return none(model);
	const card = cardFor(model.items, call.id);
	const entry = isAgentTool(call.name) ? newAgent(call.id, call.input, now, true) : runningRow(call, now);
	if (card && card.card.phase !== "settled") {
		if (card.held) return none(model);
		const held: HeldCall = "kind" in entry ? { parent, row: null, agent: entry } : { parent, row: entry, agent: null };
		return changeAt(model, card.path, (node) => (node.kind === "card" ? { ...node, held } : node));
	}
	if (card && !callProceeds(card.card)) return none(model);
	return place(model, parent, entry, card !== null, now);
}

/**
 * Tool results: each row done or failed, timed, with its result cut to 1500
 * characters, its images, and for Glob, Grep and `obsidian_search` its count;
 * an agent row's call ending ends the agent, unless it runs in the
 * background (`background` says which calls' tasks still run), its thread's
 * open group closing.
 */
export function addToolResults(
	model: MessagesModel,
	outcomes: readonly ToolOutcome[],
	now: number,
	background: (toolUseId: string) => boolean = () => false
): Step {
	let step = none(model);
	for (const outcome of outcomes) {
		const path = callPath(step.model.items, outcome.toolUseId);
		if (!path) continue;
		const changed = changeAt(step.model, path, (node) => {
			if (node.kind === "steps")
				return { ...node, rows: node.rows.map((row) => (row.toolUseId === outcome.toolUseId ? settled(row, outcome, now) : row)) };
			if (node.kind !== "agent" || node.status !== "running") return node;
			if (outcome.isError) return { ...node, status: "failed", endedAt: now };
			if (node.background || background(outcome.toolUseId)) return node;
			return { ...node, status: "done", endedAt: now };
		});
		step = chain(step, changed);
		const node = nodeAt(step.model.items, path);
		if (node?.kind === "agent" && node.status !== "running") step = chain(step, closeGroup(step.model, outcome.toolUseId));
	}
	return step;
}

function settled(row: StepRow, outcome: ToolOutcome, now: number): StepRow {
	const text = outcome.text;
	return {
		...row,
		status: outcome.isError ? "error" : "done",
		endedAt: now,
		result: text === null ? null : text.slice(0, RESULT_CHARS),
		count: outcome.isError ? null : resultCount(row.name, text),
		images: outcome.images,
	};
}

/**
 * An edit's `+x -y` (PRD-002.R6): the file as read before the call against
 * the file now on disk; outside the vault or with the file gone, the call's
 * own strings applied to what was read (`planEdit`); null when neither gives
 * a diff.
 */
export function editCounts(
	name: string,
	input: Record<string, unknown>,
	before: string | null,
	after: string | null
): { added: number; removed: number } | null {
	if (after !== null) {
		const diff = diffText(before ?? "", after);
		return { added: diff.added, removed: diff.removed };
	}
	const plan = planEdit(name, input, before);
	if (!plan) return null;
	const diff = diffText(plan.before, plan.after);
	return { added: diff.added, removed: diff.removed };
}

/** A succeeded edit landed: its row's `+x -y` and the file before and after, for its diff. */
export function landEdit(model: MessagesModel, toolUseId: string, before: string | null, after: string | null): Step {
	const path = callPath(model.items, toolUseId);
	if (!path) return none(model);
	return changeAt(model, path, (node) => {
		if (node.kind !== "steps") return node;
		const rows = node.rows.map((row) =>
			row.toolUseId === toolUseId ? { ...row, edit: editCounts(row.name, row.input, before, after), landed: { before, after } } : row
		);
		return { ...node, rows };
	});
}

/** The `+x -y` a landed edit's row shows, for its record. */
export function rowEdit(model: MessagesModel, toolUseId: string): { added: number; removed: number } | null {
	const path = callPath(model.items, toolUseId);
	const node = path && nodeAt(model.items, path);
	if (node?.kind !== "steps") return null;
	return node.rows.find((row) => row.toolUseId === toolUseId)?.edit ?? null;
}

// --- Subagents -------------------------------------------------------------------

/** Extras the CLI puts on a subagent's message, read as `src/view.ts` read them. */
interface AgentExtras {
	subagent_type?: unknown;
	task_description?: unknown;
}

/**
 * A subagent's message (PRD-001.R18): its agent row, made on its own when
 * its call is not in the messages, takes the model and the running tokens
 * (input, output and cache-creation) until the CLI reports its totals; in
 * its thread, text and thinking close the open group and are added, each
 * tool call counts and is placed by the same rules as the main turn's.
 */
export function addAgentMessage(model: MessagesModel, parent: string, message: AssistantMessage, now: number): Step {
	let step = ensureAgent(model, parent, now);
	const extras = message as unknown as AgentExtras;
	const usage = message.message.usage ?? {};
	const spent = tokenCount(usage.input_tokens) + tokenCount(usage.output_tokens) + tokenCount(usage.cache_creation_input_tokens);
	const content = message.message.content;
	const blocks: ContentBlock[] = typeof content === "string" ? [{ type: "text", text: content }] : content;
	const calls = blocks.filter((block) => block.type === "tool_use").length;
	const path = agentPath(step.model.items, parent);
	if (path)
		step = chain(
			step,
			changeAt(step.model, path, (node) => {
				if (node.kind !== "agent") return node;
				const model = typeof message.message.model === "string" && message.message.model ? message.message.model : null;
				return {
					...node,
					description: node.description ?? cut(extras.task_description),
					subagentType: node.subagentType ?? cut(extras.subagent_type),
					models: model && !node.models.includes(model) ? [...node.models, model] : node.models,
					tokens: node.reported ? node.tokens : node.tokens + spent,
					toolUses: node.reported ? node.toolUses : node.toolUses + calls,
				};
			})
		);
	for (const block of blocks) {
		if (block.type === "text" || block.type === "thinking") {
			const text = block.type === "text" ? (block as { text?: unknown }).text : (block as { thinking?: unknown }).thinking;
			if (typeof text !== "string" || !text.trim()) continue;
			const closed = closeGroup(step.model, parent);
			const added: NewThreadBlock =
				block.type === "text"
					? { kind: "text", text, streaming: false }
					: { kind: "thinking", text, streaming: false, startedAt: null, endedAt: null };
			step = chain(chain(step, closed), append(closed.model, parent, added, now));
		} else if (block.type === "tool_use") {
			const use = block as ToolUseBlock;
			if (typeof use.id !== "string" || typeof use.name !== "string") continue;
			const input = typeof use.input === "object" && use.input !== null && !Array.isArray(use.input) ? use.input : {};
			step = chain(step, addToolUse(step.model, { id: use.id, name: use.name, input }, parent, now));
		}
	}
	return step;
}

function tokenCount(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** The CLI's status word as an agent row's status: completed is done, failed or error failed, missing done, any other stopped. */
export function agentStatusOf(status: string | null): AgentStatus {
	if (status === null || status === "completed") return "done";
	if (status === "failed" || status === "error") return "failed";
	return "stopped";
}

/**
 * The CLI reports a subagent finished (`task_notification`, same
 * `tool_use_id`): its totals replace the running ones, its status and
 * duration are the CLI's, and its thread's open group closes.
 */
export function reportAgent(model: MessagesModel, toolUseId: string, report: TaskReport, now: number): Step {
	const path = agentPath(model.items, toolUseId);
	if (!path) return none(model);
	const changed = changeAt(model, path, (node) =>
		node.kind === "agent"
			? {
					...node,
					tokens: report.tokens ?? node.tokens,
					toolUses: report.toolUses ?? node.toolUses,
					durationMs: report.durationMs ?? node.durationMs,
					reported: true,
					status: agentStatusOf(report.status),
					endedAt: node.endedAt ?? now,
				}
			: node
	);
	return chain(changed, closeGroup(changed.model, toolUseId));
}

/**
 * Calls that will not report end, from `node` down (G1): a running row ends
 * without an outcome (no mark, no spinner), a running agent is stopped,
 * which ends its elapsed time; with `close`, open groups close too. An
 * agent `keep` accepts goes on running, its thread untouched.
 */
function endCalls(node: Node, now: number, keep: (agent: AgentBlock) => boolean, close: boolean): Node {
	if (node.kind === "agent" && node.status === "running" && keep(node)) return node;
	let out = node;
	if (node.kind === "steps") {
		const running = node.rows.some((row) => row.status === "running");
		if (running || (close && node.open))
			out = {
				...node,
				open: close ? false : node.open,
				rows: running ? node.rows.map((row) => (row.status === "running" ? { ...row, status: "unknown", endedAt: now } : row)) : node.rows,
			};
	}
	if (node.kind === "agent" && node.status === "running") out = { ...node, status: "stopped", endedAt: now };
	const children = childrenOf(out);
	if (children) {
		const next = children.map((child) => endCalls(child, now, keep, close) as TurnBlock);
		if (next.some((child, at) => child !== children[at])) out = withChildren(out, next);
	}
	return out;
}

/** `endCalls` over the items `which` accepts, each changed one firing `item:<id>`. */
function endItems(model: MessagesModel, which: (item: MessageItem) => boolean, change: (item: Node) => Node): Step {
	const changes: Step["changes"] = [];
	const items = model.items.map((item) => {
		if (!which(item)) return item;
		const next = change(item) as MessageItem;
		if (next !== item) changes.push({ type: "changed", item: next });
		return next;
	});
	return { model: changes.length ? { ...model, items } : model, changes };
}

/**
 * The running turn ends, at its `result` or otherwise: in its items, rows
 * still running end without an outcome, agents still running stop and
 * their groups close, except an agent in the background
 * (`run_in_background`, or `background` says its task runs), whose thread
 * goes on (DES-003 Agent rows and run bar).
 */
export function settleTurnCalls(model: MessagesModel, background: (toolUseId: string) => boolean, now: number): Step {
	const open = model.open;
	if (!open) return none(model);
	const keep = (agent: AgentBlock) => agent.background || (agent.toolUseId !== null && background(agent.toolUseId));
	return endItems(
		model,
		(item) => item.kind === "turn" && item.turn === open.turn,
		(item) => endCalls(item, now, keep, true)
	);
}

/**
 * The CLI process ended, or a restart replaced it: nothing it ran will
 * report, so every open group closes, in the main turn and in every thread,
 * every running row ends without an outcome and every running agent stops.
 */
export function endProcess(model: MessagesModel, now: number): Step {
	return endItems(
		model,
		() => true,
		(item) => endCalls(item, now, () => false, true)
	);
}

// --- Cards -----------------------------------------------------------------------

/**
 * A card or form starts waiting (DES-003 Tool-step group): its call's row or
 * agent row is taken out, wherever it is (an emptied group goes), and held
 * on the card; the main turn's open group closes; the card goes into the
 * running turn, or at the end while none runs.
 */
export function addCardForCall(model: MessagesModel, card: Card, now: number | null): Step & { ref: ItemRef } {
	let step = none(model);
	let held: HeldCall | null = null;
	const path = card.toolUseId ? callPath(model.items, card.toolUseId) : null;
	if (card.toolUseId && path) {
		const node = nodeAt(model.items, path);
		const holder = path.length > 1 ? nodeAt(model.items, path.slice(0, -1)) : null;
		const parent = holder?.kind === "agent" ? holder.toolUseId : null;
		if (node?.kind === "agent") {
			held = { parent, row: null, agent: node };
			step = changeAt(model, path, () => null);
		} else if (node?.kind === "steps") {
			const id = card.toolUseId;
			held = { parent, row: node.rows.find((row) => row.toolUseId === id) ?? null, agent: null };
			const rows = node.rows.filter((row) => row.toolUseId !== id);
			step = changeAt(model, path, () => (rows.length > 0 ? { ...node, rows } : null));
		}
	}
	step = chain(step, closeGroup(step.model, null));
	const added = addCard(step.model, card, now, held);
	return { ...chain(step, added), ref: added.ref };
}

/**
 * A card or form settled (DES-003 Tool-step group). Answered: its call's
 * held row returns, to the thread it left, as the first row of a new group
 * (an agent row, opening no group); a main-thread call whose `tool_use` has
 * not come is placed from the card; a subagent's waits for its `tool_use`.
 * Withdrawn, ended with its session or denied by Stop and clear: no row.
 */
export function settleCardCall(model: MessagesModel, card: Card, held: HeldCall | null, now: number): Step {
	const id = card.toolUseId;
	if (!id || !callProceeds(card) || callPath(model.items, id)) return none(model);
	// A new id: the row is drawn afresh where it returns.
	if (held?.agent) return place(model, held.parent, { ...held.agent, startedAt: now }, true, now);
	if (held?.row) return place(model, held.parent, { ...held.row, startedAt: now }, true, now);
	if (card.fromAgent || !model.open) return none(model);
	const name = cardToolName(card);
	return place(model, null, isAgentTool(name) ? newAgent(id, card.input, now, true) : runningRow({ id, name, input: card.input }, now), true, now);
}

// --- Reopen ----------------------------------------------------------------------

/** A stored tool call as `history` keeps it. */
export interface StoredCall {
	name: string;
	input: unknown;
	result?: string;
	isError?: boolean;
	added?: number;
	removed?: number;
}

/**
 * A stored call on reopen (DES-003 Tool-step group, `fromStored`): a Task or
 * Agent call closes the open group and adds its agent row, without a thread;
 * another joins the open group. Marks come from `isError`, a result without
 * it reading done; no times or counts; an edit shows its stored `+x -y`.
 */
export function addStoredCall(model: MessagesModel, call: StoredCall): Step {
	const input = typeof call.input === "object" && call.input !== null ? (call.input as Record<string, unknown>) : {};
	const status: StepStatus = call.isError === true ? "error" : call.isError === false || call.result ? "done" : "unknown";
	if (isAgentTool(call.name)) {
		const agent = newAgent(null, input, null, false);
		// Outside any turn it opens one, as a stored row does (`addBlock`).
		const start = model.open ? none(model) : openTurn(model, null);
		return chain(start, place(start.model, null, { ...agent, status: status === "unknown" ? null : status === "error" ? "failed" : "done" }, true, null));
	}
	const edit =
		typeof call.added === "number" || typeof call.removed === "number" ? { added: call.added ?? 0, removed: call.removed ?? 0 } : null;
	const row: StepRow = {
		toolUseId: null,
		name: call.name,
		input,
		status,
		startedAt: null,
		endedAt: null,
		count: null,
		result: typeof call.result === "string" ? call.result.slice(0, RESULT_CHARS) : null,
		edit,
		landed: null,
		images: [],
	};
	return place(model, null, row, false, null);
}

// --- View-models ---------------------------------------------------------------

export type Mark = "running" | "done" | "error";

/** A mark's accessible label (DES-003 Keyboard and accessibility). */
export const MARK_LABEL: Record<Mark, string> = { running: "Running", done: "Done", error: "Failed" };

/** A row's mark; none for a reopened call without an outcome. */
export function rowMark(row: StepRow): Mark | null {
	return row.status === "unknown" ? null : row.status;
}

/**
 * A group's header (PRD-001.R16): none for one call; else its mark (none
 * when no call has an outcome, as reopened without them), "N steps", and
 * once no row runs and the times are known, its duration.
 */
export interface GroupHeader {
	mark: Mark | null;
	label: string;
	duration: string | null;
}

export function groupHeader(block: StepsBlock): GroupHeader | null {
	const rows = block.rows;
	if (rows.length < 2) return null;
	const running = rows.some((row) => row.status === "running");
	const mark: Mark | null =
		block.open || running
			? "running"
			: rows.some((row) => row.status === "error")
				? "error"
				: rows.some((row) => row.status === "done")
					? "done"
					: null;
	let duration: string | null = null;
	if (!block.open && !running && rows.every((row) => row.startedAt !== null && row.endedAt !== null)) {
		const start = Math.min(...rows.map((row) => row.startedAt ?? 0));
		const end = Math.max(...rows.map((row) => row.endedAt ?? 0));
		duration = formatElapsed(end - start);
	}
	return { mark, label: `${rows.length} steps`, duration };
}

/**
 * Whether a group's header shows (PRD-001.R16): once the group has closed and
 * no row runs; while it works the card is its rows alone. A group never
 * collapses by itself.
 */
export function headShown(header: GroupHeader | null): boolean {
	return header !== null && header.mark !== "running";
}

/** An edit's `+x` and `-y`, each only when not zero. */
export function editStat(row: StepRow): { added: string | null; removed: string | null } {
	return {
		added: row.edit?.added ? `+${row.edit.added}` : null,
		removed: row.edit?.removed ? `-${row.edit.removed}` : null,
	};
}

/** An agent row's status as a mark, an icon shape the UI picks, and its text (PRD-001.R18). */
export const AGENT_STATUS_TEXT: Record<AgentStatus, string> = {
	running: "Running",
	done: "Done",
	failed: "Failed",
	stopped: "Stopped",
};

/** What an agent row shows (PRD-001.R18). */
export interface AgentView {
	label: string;
	/** Type, models, tool count and tokens, each when known. */
	meta: string[];
	/** Elapsed while it runs, its duration once ended; "" when unknown. */
	elapsed: string;
	status: AgentStatus | null;
}

/**
 * The label is the task description, else "<type> agent", else "Subagent";
 * models by their short names; elapsed time from the call while it runs,
 * then the CLI's duration or the call's span.
 */
export function agentView(block: AgentBlock, now: number): AgentView {
	const label = block.description ?? (block.subagentType ? `${block.subagentType} agent` : "Subagent");
	const meta: string[] = [];
	if (block.subagentType) meta.push(block.subagentType);
	for (const model of block.models) meta.push(describeModelId(model)?.short ?? model);
	if (block.toolUses > 0 || block.reported) meta.push(`${block.toolUses} ${block.toolUses === 1 ? "tool" : "tools"}`);
	if (block.tokens > 0) meta.push(`${formatTokens(block.tokens)} tokens`);
	let elapsed = "";
	if (block.status === "running" && block.startedAt !== null) elapsed = formatElapsed(now - block.startedAt);
	else if (block.durationMs !== null) elapsed = formatElapsed(block.durationMs);
	else if (block.startedAt !== null && block.endedAt !== null) elapsed = formatElapsed(block.endedAt - block.startedAt);
	return { label, meta, elapsed, status: block.status };
}
