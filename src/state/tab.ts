/**
 * One tab's data and its activity (DES-003 Tab activity): the messages model,
 * what the composer and the status line draw, owned by `tab/chat-tab`, which
 * fires an event for each change.
 */

import type { PendingImage } from "../attachments";
import type { ShellResult } from "../bash";
import type { StoredMessage } from "../history";
import type { BackgroundTask, ContextUsage } from "../protocol/types";
import { parseCardCommand, parsePanelCommand, type CommandReport, type ReportState } from "../commands";
import {
	addBlock,
	addClear,
	addCompaction,
	addError,
	addReport,
	addShell,
	addUserMessage,
	closeTurn,
	EMPTY_FOOTER,
	endedSession,
	footerOf,
	formatSeconds,
	markNotSent,
	updateItem,
} from "./turn";
import { isBranchIntent } from "./branch-history";
import type { Card } from "./permission";
import { clearFromRecord, isClearEcho, type Clear } from "./clear-divider";
import { compactionFromRecord, type Compaction } from "./compaction";
import { emptyCache, type PromptCache } from "./prompt-cache";
import { addStoredCall, closeGroup } from "./step-groups";
import type { TaskEvent } from "./stream";
import type { ForkBase } from "./fork-base";
import { turnCosts, type TurnTokens } from "./turn-cost";
import {
	validDefaultPermissionMode,
	type AgentPanelSettings,
	type ChatPermissionMode,
} from "../settings-core";

export type Activity = "idle" | "working" | "writing" | "waiting";

/** The events a tab's owner fires (DES-003 Events): `item:<id>` besides these. */
export type TabEvent = "activity" | "thinking" | "composer" | "status" | "card" | "turn" | "items" | "tasks";

/** A context chip a click turns on or off (PRD-001.R12). */
export type ChipKind = "note" | "folder" | "links";

/** First match: a waiting card, then an open text block in a running turn, then the turn. */
export function activity(turnRunning: boolean, pendingCards: number, textBlockOpen: boolean): Activity {
	if (pendingCards > 0) return "waiting";
	if (turnRunning && textBlockOpen) return "writing";
	if (turnRunning) return "working";
	return "idle";
}

/** The composer's per-tab state; `Item` is a vault file or folder, kept opaque here. */
export interface ComposerData<Item> {
	/** The textarea's text while another tab is shown. */
	draft: string;
	/** The note, folder and "links & properties" chips (PRD-001.R12). */
	includeNote: boolean;
	includeFolder: boolean;
	includeLinks: boolean;
	attached: readonly Item[];
	images: readonly PendingImage[];
	hasMessages: boolean;
}

/** A tab's permission mode (DES-004 Mode state). */
export interface ModeState {
	selectedMode: ChatPermissionMode;
	/** Launch without --permission-mode, so the CLI takes its own default. */
	inheritMode: boolean;
	/** The mode the CLI last reported, or null. */
	cliMode: string | null;
}

/** Token totals since the tab opened the conversation (DES-007 Cost and tokens). */
export interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	cacheWriteTokens: number;
	cacheReadTokens: number;
	turns: number;
	context: ContextUsage | null;
}

/** What the status line draws for a tab. */
export interface StatusData extends ModeState {
	/** The picked model alias; "" is Default. */
	model: string;
	effort: string;
	profileId: string;
	/** The model id the CLI last reported, or "" before it has. */
	reportedModel: string;
	usage: Readonly<UsageTotals>;
	/** The prompt cache countdown estimate; live only, empty after a reload (PRD-005.R11). */
	cache: Readonly<PromptCache>;
	/** The conversation's cost from its turn records (`conversationCost`). */
	costUsd: number;
	/** The CLI reports that it is compacting (`system/status`); live only (PRD-005.R8). */
	compacting: boolean;
	/** A clear completed and no turn has finished since: the context segment is hidden; live only (PRD-005.R8). */
	contextHidden: boolean;
}

export type NewTabSettings = Pick<
	AgentPanelSettings,
	| "defaultPermissionMode"
	| "model"
	| "effort"
	| "lastModel"
	| "lastEffort"
	| "defaultProfileId"
	| "includeContextByDefault"
>;

/** Within this many pixels of the end, the messages count as followed (PRD-001.R7). */
export const FOLLOW_BOTTOM_PX = 120;

/** Where a tab's messages were scrolled when another tab was shown. */
export interface ScrollPosition {
	top: number;
	/** Within `FOLLOW_BOTTOM_PX` of the end: the tab follows new content. */
	nearBottom: boolean;
}

export function scrollPosition(scrollTop: number, scrollHeight: number, clientHeight: number): ScrollPosition {
	return { top: scrollTop, nearBottom: scrollHeight - scrollTop - clientHeight < FOLLOW_BOTTOM_PX };
}

/** Whether the messages follow their end, and the scroll position that was decided at. */
export interface FollowState {
	following: boolean;
	lastTop: number;
}

/**
 * The follow state after a scroll event at `top`, `distance` from the end
 * (PRD-001.R29). A scroll up of more than 1 px from where it was last
 * decided leaves the end when the user made it (`byUser`), however near; one
 * nobody made (the end coming up as content shrank) keeps it while within
 * `FOLLOW_BOTTOM_PX`. A scroll down (scroll anchoring for content drawn
 * above, or toward the end) keeps it or, within that distance, rejoins it.
 * Content growing below the view scrolls nothing and moves no view off its
 * end; smaller moves keep the reference, so slow steps add up. The panel's
 * own jumps decide the state themselves.
 */
export function followsEnd(state: FollowState, top: number, distance: number, byUser = false): FollowState {
	const near = distance < FOLLOW_BOTTOM_PX;
	if (top < state.lastTop - 1) return { following: !byUser && state.following && near, lastTop: top };
	if (top > state.lastTop + 1) return { following: state.following || near, lastTop: top };
	return state;
}

/** An input that may scroll the messages: a wheel, a key outside a text field, a press on the scroll bar. */
export type ScrollInput = { kind: "wheel"; deltaY: number } | { kind: "key"; key: string; inField: boolean } | { kind: "scrollbar" };

const UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"]);

/** Whether the next scroll up is the user's (PRD-001.R29): a wheel up, PageUp, ArrowUp or Home outside a field, the scroll bar. */
export function scrollsUpByHand(input: ScrollInput): boolean {
	if (input.kind === "wheel") return input.deltaY < 0;
	if (input.kind === "key") return !input.inField && UP_KEYS.has(input.key);
	return true;
}

/** Where a shown tab scrolls to: the end when it was near it, else where it was. */
export function restoredScrollTop(position: ScrollPosition, scrollHeight: number): number {
	return position.nearBottom ? scrollHeight : position.top;
}

/** Closing a tab asks first while its turn runs or a card in it waits (PRD-001.R7). */
export function closeNeedsConfirmation(turnRunning: boolean, pendingCards: number): boolean {
	return turnRunning || pendingCards > 0;
}

/** What the active tab holds and runs, as a reopen into it reads it. */
export interface ReuseCheck {
	hasConversation: boolean;
	hasSession: boolean;
	/** Its CLI is starting (a send or a command waits on it). */
	starting: boolean;
	turnRunning: boolean;
	/** `!` runs and usage commands still to finish, which record when they do. */
	localRuns: number;
	pendingCards: number;
}

/**
 * Whether opening a stored conversation reuses the active tab (PRD-003.R9):
 * only when it has no conversation and no session and nothing is in flight,
 * since whatever finishes there afterwards would be drawn and recorded into
 * the reopened conversation. Otherwise it opens in a new tab.
 */
export function reopenReusesTab(tab: ReuseCheck | null): boolean {
	return (
		tab !== null &&
		!tab.hasConversation &&
		!tab.hasSession &&
		!tab.starting &&
		!tab.turnRunning &&
		tab.localRuns === 0 &&
		tab.pendingCards === 0
	);
}

export function emptyUsage(): UsageTotals {
	return { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, turns: 0, context: null };
}

/**
 * A new tab: mode from the default setting, never Bypass (PRD-002.R10);
 * model and effort from the last pick, else the settings; the default
 * profile; the note chip per "Include note context by default".
 */
export function newTabData<Item>(settings: NewTabSettings): {
	composer: ComposerData<Item>;
	status: StatusData;
	scroll: ScrollPosition;
} {
	const mode = validDefaultPermissionMode(settings.defaultPermissionMode);
	return {
		composer: {
			draft: "",
			includeNote: settings.includeContextByDefault,
			includeFolder: false,
			includeLinks: false,
			attached: [],
			images: [],
			hasMessages: false,
		},
		status: {
			selectedMode: mode,
			inheritMode: mode === "default",
			cliMode: null,
			model: settings.lastModel ?? settings.model,
			effort: settings.lastEffort ?? settings.effort,
			profileId: settings.defaultProfileId,
			reportedModel: "",
			usage: emptyUsage(),
			cache: emptyCache(),
			costUsd: 0,
			compacting: false,
			contextHidden: false,
		},
		scroll: { top: 0, nearBottom: true },
	};
}

function count(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The totals after one `result`, whose `usage` the CLI may send malformed or not at all. */
export function withTurnUsage(totals: Readonly<UsageTotals>, usage: Record<string, unknown> | undefined): UsageTotals {
	const reported = usage ?? {};
	return {
		...totals,
		inputTokens: totals.inputTokens + count(reported.input_tokens),
		outputTokens: totals.outputTokens + count(reported.output_tokens),
		cacheWriteTokens: totals.cacheWriteTokens + count(reported.cache_creation_input_tokens),
		cacheReadTokens: totals.cacheReadTokens + count(reported.cache_read_input_tokens),
		turns: totals.turns + 1,
	};
}

// --- The messages model (DES-003 Messages) ----------------------------------

/**
 * A user message (PRD-001.R33): a `prompt` sent to Claude, numbered across
 * the conversation; a panel `command` or a `shell` (`!`) run, compact and
 * unnumbered.
 */
export interface PromptItem {
	kind: "prompt";
	id: number;
	type: "prompt" | "command" | "shell";
	number: number | null;
	text: string;
	contextName: string | null;
	/** The images sent: their bytes while live, their count once reopened. */
	images: readonly PendingImage[] | number;
	/** When it was sent; null when the file recorded none (PRD-003.R1). */
	sentAt: number | null;
	/** Sent while a turn ran. */
	queued: boolean;
	/** Never reached Claude: a branch's rewind failed first (PRD-002.R15). */
	notSent?: true;
}

/** A user message as the send path, a panel command or a `!` run adds it; numbering and `queued` are the model's. */
export type NewPrompt = Pick<PromptItem, "type" | "text" | "contextName" | "images" | "sentAt">;

/** A line the panel adds, not Claude: the branch note (PRD-002.R15); live only. */
export interface NoteItem {
	kind: "note";
	id: number;
	text: string;
}

/** A turn record (DES-004): duration, the session's total cost, the error, the restore point. */
export type MetaRecord = Extract<StoredMessage, { kind: "meta" }>;

/** Reply text: plain with a caret while it streams, then rendered Markdown (PRD-001.R15). */
export interface TextBlock {
	kind: "text";
	id: number;
	text: string;
	streaming: boolean;
}

/** Thinking, timed from its block's start to its stop; no times once reopened. */
export interface ThinkingBlock {
	kind: "thinking";
	id: number;
	text: string;
	streaming: boolean;
	startedAt: number | null;
	endedAt: number | null;
}

/** A tool call's step row: done or failed, running, or reopened without an outcome. */
export type StepStatus = "running" | "done" | "error" | "unknown";

/** A PNG, JPEG, GIF or WebP image a tool returned, as base64; live only (PRD-001.R16). */
export interface StepImage {
	mediaType: string;
	data: string;
}

/** One tool call's step row (DES-003 Tool steps); every text in it is the model's or the tool's. */
export interface StepRow {
	/** The call's `tool_use` id; null once reopened. */
	toolUseId: string | null;
	name: string;
	input: Record<string, unknown>;
	status: StepStatus;
	/** From its `tool_use` (or its card's answer) to its result; null once reopened. */
	startedAt: number | null;
	endedAt: number | null;
	/** "N files", "N results" or "N notes" (`resultCount`); live only. */
	count: string | null;
	/** The result, up to 1500 characters; null for none. */
	result: string | null;
	/** A succeeded edit's lines added and removed, live or stored (PRD-002.R6). */
	edit: { added: number; removed: number } | null;
	/** A succeeded live edit: the file as read before it ran and as now on disk, for its diff. */
	landed: { before: string | null; after: string | null } | null;
	images: readonly StepImage[];
}

/** A group of tool calls (DES-003 Tool-step group): open while calls can join it. */
export interface StepsBlock {
	kind: "steps";
	id: number;
	rows: readonly StepRow[];
	open: boolean;
}

export type AgentStatus = "running" | "done" | "failed" | "stopped";

/**
 * A Task or Agent call's agent row and its subagent's thread (DES-003 Agent
 * rows and run bar). Running totals come from the subagent's messages until
 * `task_notification` replaces them; threads are live only (PRD-003.R3).
 */
export interface AgentBlock {
	kind: "agent";
	id: number;
	/** The call's `tool_use` id, which the subagent's messages name; null once reopened. */
	toolUseId: string | null;
	description: string | null;
	subagentType: string | null;
	/** Launched with `run_in_background`: its call's result does not end it. */
	background: boolean;
	/** Every model the subagent's messages named, in order. */
	models: readonly string[];
	toolUses: number;
	tokens: number;
	/** The CLI's totals replaced the running ones. */
	reported: boolean;
	/** Null once reopened without an outcome. */
	status: AgentStatus | null;
	startedAt: number | null;
	endedAt: number | null;
	/** The CLI's duration, once reported. */
	durationMs: number | null;
	thread: readonly ThreadBlock[];
	/** Live: its thread is drawn; a reopened row keeps none. */
	live: boolean;
}

/** What a subagent's thread holds: its replies, thinking, groups and agent rows. */
export type ThreadBlock = TextBlock | ThinkingBlock | StepsBlock | AgentBlock;

/** A call's row or agent row held while its card waits, and the thread it belongs to (null: the main turn). */
export interface HeldCall {
	parent: string | null;
	row: StepRow | null;
	agent: Omit<AgentBlock, "id"> | null;
}

/** A permission card or question form in the running turn (DES-003 Cards); live only. */
export interface CardBlock {
	kind: "card";
	id: number;
	card: Card;
	/** The call's row, back once the card is answered (DES-003 Tool-step group). */
	held: HeldCall | null;
}

export type TurnBlock = TextBlock | ThinkingBlock | CardBlock | StepsBlock | AgentBlock;

/** A closed turn's footer (PRD-001.R15, PRD-005.R7). */
export interface TurnFooter {
	/** The turn record, for Restore files and Branch; null when the session ended first. */
	record: MetaRecord | null;
	durationMs: number | null;
	/** This turn's cost (`turnCosts`). */
	costUsd: number | null;
	error: string | null;
	/** Live only: for a turn finished since the conversation was opened. */
	tokens: TurnTokens | null;
}

/**
 * One turn of Claude's (DES-003 Turn): the head item, or a continuation of it
 * in a later section, sharing its `turn`. The head's `running` is true while
 * the turn runs; the last item takes the footer when it closes.
 */
export interface TurnItem {
	kind: "turn";
	id: number;
	turn: number;
	continuation: boolean;
	/** When it opened; null for a continuation and once reopened. */
	startedAt: number | null;
	running: boolean;
	blocks: readonly TurnBlock[];
	footer: TurnFooter | null;
}

/** An error outside a turn: CLI not found, spawn failure, exit (DES-003 Stream to messages). */
export interface ErrorItem {
	kind: "error";
	id: number;
	text: string;
}

/** A card or form that arrived while no turn ran, as a background agent's request does. */
export interface CardItem {
	kind: "card";
	id: number;
	card: Card;
	held: HeldCall | null;
}

/**
 * A panel command's card (DES-003 Report cards): live, its state and its
 * report or failure text; reopened, the Markdown recorded for it.
 */
export interface ReportItem {
	kind: "report";
	id: number;
	/** The panel command, lower case, which names the card. */
	command: string;
	state: ReportState;
	/** Once answered. */
	report: CommandReport | null;
	/** Once failed: the text the card shows. */
	error: string | null;
	/** A reopened card's recorded Markdown; null while live. */
	markdown: string | null;
}

/** A `!` run (PRD-002.R16): its command, and its result once it has ended. */
export interface ShellItem {
	kind: "shell";
	id: number;
	command: string;
	result: ShellResult | null;
}

/** An agent row on its own: a subagent whose call is not in the messages, while no turn runs. */
export type AgentItem = AgentBlock;

/** A completed clear's divider (PRD-001.R38): at the end, outside any turn; an Undo takes it away. */
export interface ClearItem extends Clear {
	kind: "clear";
	id: number;
}

/** A compaction's divider (PRD-001.R37): at the end, outside any turn, as the turn it happened in continues after it. */
export interface CompactionItem extends Compaction {
	kind: "compaction";
	id: number;
}

export type MessageItem =
	| PromptItem
	| NoteItem
	| TurnItem
	| ErrorItem
	| CardItem
	| ReportItem
	| ShellItem
	| CompactionItem
	| ClearItem
	| AgentItem;

/**
 * A `!` run's status on its card (PRD-002.R16): "running" until it ends, then
 * "timed out", "failed" (it could not start, or was killed with no exit
 * code), `exit N`, every outcome but `exit 0` a failure; and its
 * elapsed time once ended.
 */
export function shellStatus(result: ShellResult | null): { label: string; failed: boolean; duration: string } {
	if (!result) return { label: "running", failed: false, duration: "" };
	const duration = formatSeconds(result.durationMs);
	if (result.timedOut) return { label: "timed out", failed: true, duration };
	if (result.error !== undefined || result.code === null) return { label: "failed", failed: true, duration };
	if (result.code === 0) return { label: "exit 0", failed: false, duration };
	return { label: `exit ${result.code}`, failed: true, duration };
}

/** A stored `!` run as the result its card draws; its streams are the first 1500 characters kept (DES-005). */
function storedShellResult(message: Extract<StoredMessage, { kind: "bash" }>): ShellResult {
	return {
		command: message.command,
		stdout: message.stdout ?? "",
		stderr: message.stderr ?? "",
		code: message.code ?? null,
		timedOut: message.timedOut === true,
		durationMs: message.durationMs ?? 0,
		truncated: false,
	};
}

/** The turn running: its number, start, head, the item its blocks go to (null after a user message), and its last item. */
export interface OpenTurn {
	turn: number;
	startedAt: number | null;
	headId: number;
	itemId: number | null;
	lastId: number;
}

/** A tab's messages model: its items, the last id given (items and blocks alike), prompt and turn counts, the turn running. */
export interface MessagesModel {
	items: readonly MessageItem[];
	lastId: number;
	prompts: number;
	turns: number;
	open: OpenTurn | null;
}

export const EMPTY_MODEL: MessagesModel = { items: [], lastId: 0, prompts: 0, turns: 0, open: null };

/** A reopened conversation's model, and the turn its file leaves open (no record of its end), or null. */
export interface StoredModel extends MessagesModel {
	unclosed: number | null;
}

/** What an `items` event carries: the whole model replaced, one item appended at the end, or one removed. */
export type ItemsChange =
	| { type: "reset" }
	| { type: "added"; item: MessageItem }
	| { type: "removed"; id: number };

/** A model change as its owner fires it: `items`, or `item:<id>` for one changed item. */
export type ModelChange = ItemsChange | { type: "changed"; item: MessageItem };

/** A new model and the changes that made it. */
export interface Step {
	model: MessagesModel;
	changes: ModelChange[];
}

/** The kinds of stored message the panel draws; another kind is a newer version's and is skipped (DES-005). */
const DRAWN_KINDS = new Set(["user", "bash", "assistant", "thinking", "tool", "meta", "compaction", "clear"]);

/**
 * The whole messages model from a conversation's stored messages (DES-003
 * Reopen), through the same turn rules as live, with no timing, tokens or
 * recording: prompts numbered, each turn's text, thinking, tool-step
 * groups and agent rows with its footer and its cost from the recorded totals (PRD-005.R7), a
 * panel command's card and a `!` run outside any turn, the error a session
 * ended with as an error block, a branch failure's prompts marked not
 * sent. A turn the file leaves open (one from before
 * turn ends were recorded, or cut off by a crash) is closed and named. The
 * turn counter continues from the highest recorded turn.
 */
export function modelFromStored(messages: readonly StoredMessage[], forkBase?: ForkBase): StoredModel {
	const kept = messages.filter((message) => DRAWN_KINDS.has(message.kind));
	const costs = turnCosts(kept, forkBase);
	let model = EMPTY_MODEL;
	const apply = (step: Step): void => {
		model = step.model;
	};
	/** Panel commands whose card is still to come, as the next `assistant` messages. */
	const cards: string[] = [];
	let highest = 0;
	kept.forEach((message, at) => {
		switch (message.kind) {
			case "user": {
				const command = parsePanelCommand(message.text);
				const card = parseCardCommand(message.text);
				if (card) cards.push(card.name);
				apply(
					addUserMessage(model, {
						type: command ? "command" : "prompt",
						text: message.text,
						contextName: message.contextName ?? null,
						images: message.images ?? 0,
						sentAt: message.sentAt ?? null,
					})
				);
				return;
			}
			case "bash": {
				apply(addUserMessage(model, { type: "shell", text: `!${message.command}`, contextName: null, images: 0, sentAt: null }));
				const shell = addShell(model, message.command);
				apply(shell);
				apply(updateItem(model, { ...shell.item, result: storedShellResult(message) }));
				return;
			}
			case "assistant": {
				const command = cards.shift();
				if (command !== undefined) {
					const card = addReport(model, command);
					apply(card);
					apply(updateItem(model, { ...card.item, state: "answered", markdown: message.text }));
					return;
				}
				// Stored text, thinking and Task or Agent calls close a group (DES-003 Tool-step group).
				apply(closeGroup(model, null));
				apply(addBlock(model, { kind: "text", text: message.text, streaming: false }, null));
				return;
			}
			case "compaction":
				apply(closeGroup(model, null));
				apply(addCompaction(model, compactionFromRecord(message)));
				return;
			case "clear":
				apply(closeGroup(model, null));
				apply(addClear(model, clearFromRecord(message)));
				return;
			case "thinking":
				apply(closeGroup(model, null));
				apply(addBlock(model, { kind: "thinking", text: message.text, streaming: false, startedAt: null, endedAt: null }, null));
				return;
			case "tool":
				apply(addStoredCall(model, message));
				return;
			case "meta":
				if (isBranchIntent(message)) return;
				if (typeof message.turn === "number") highest = Math.max(highest, message.turn);
				if (endedSession(message)) {
					apply(closeTurn(model, EMPTY_FOOTER, null));
					// A branch failure (its fork kept) sent none of its turn's prompts.
					if (message.branchTarget !== undefined) apply(markNotSent(model));
					apply(addError(model, message.error ?? ""));
				} else {
					apply(closeTurn(model, footerOf(message, costs[at], null), null));
					// A turn that ended before its branch's rewind succeeded sent none of its prompts.
					if (message.branchTarget !== undefined) apply(markNotSent(model));
				}
				return;
		}
	});
	const unclosed = model.open?.turn ?? null;
	apply(closeTurn(model, EMPTY_FOOTER, null));
	return { ...model, turns: Math.max(model.turns, highest), unclosed };
}

/** How many stored messages an item stands for, which a reopen's idle chunks count (DES-003 Reopen): a group, one per call. */
export function storedCount(item: MessageItem): number {
	if (item.kind !== "turn") return 1;
	const blocks = item.blocks.reduce((sum, block) => sum + (block.kind === "steps" ? block.rows.length : 1), 0);
	return blocks + (item.footer?.record ? 1 : 0);
}

/**
 * Whether `item` opens a section after `previous` (DES-003 Prompts): a user
 * message does; so does a clear's divider, unless the `/clear` message just
 * before it (which opened its own section) goes with it.
 */
export function opensSection(item: MessageItem, previous: MessageItem | null | undefined): boolean {
	return item.kind === "prompt" || (item.kind === "clear" && !isClearEcho(previous));
}

/** The model in sections: each user message starts one, and a clear without its `/clear` message; items before the first form their own (DES-003 Prompts). */
export function sectionsOf(items: readonly MessageItem[]): MessageItem[][] {
	const sections: MessageItem[][] = [];
	let previous: MessageItem | undefined;
	for (const item of items) {
		if (sections.length === 0 || opensSection(item, previous)) sections.push([]);
		sections[sections.length - 1].push(item);
		previous = item;
	}
	return sections;
}

/** The model with one prompt item changed; the same list when no item has the id. */
export function withItem(
	items: readonly MessageItem[],
	id: number,
	patch: Partial<Omit<PromptItem, "kind" | "id">>
): readonly MessageItem[] {
	const at = items.findIndex((item) => item.id === id);
	const item = items[at];
	if (!item || item.kind !== "prompt") return items;
	const next = [...items];
	next[at] = { ...item, ...patch };
	return next;
}

/** The first screen of a reopen is drawn once the messages hold two view heights (DES-003 Reopen). */
export function firstScreenDone(scrollHeight: number, clientHeight: number): boolean {
	return scrollHeight >= 2 * clientHeight;
}

/** Messages an idle chunk draws before it yields, and the idle time it leaves (DES-003 Reopen). */
export const REOPEN_CHUNK_MESSAGES = 20;
export const REOPEN_IDLE_FLOOR_MS = 4;

/** An idle chunk of whole sections ends at 20 messages drawn or under 4 ms left. */
export function chunkDone(drawn: number, timeLeft: number): boolean {
	return drawn >= REOPEN_CHUNK_MESSAGES || timeLeft < REOPEN_IDLE_FLOOR_MS;
}

// --- Background tasks (DES-003 Agent rows and run bar) -----------------------------

/**
 * The tab's background tasks after one task message: `task_started` adds,
 * `background_tasks_changed` decides which still run (keeping what was known
 * of each), `task_updated` patches the status, `task_notification` removes.
 */
export function nextTasks(tasks: readonly BackgroundTask[], event: TaskEvent): readonly BackgroundTask[] {
	switch (event.type) {
		case "started":
			return [...tasks.filter((task) => task.taskId !== event.task.taskId), event.task];
		case "running":
			return event.tasks.map((task) => {
				const known = tasks.find((entry) => entry.taskId === task.taskId);
				return known ? { ...known, ...task } : task;
			});
		case "updated":
			if (!event.status || !tasks.some((task) => task.taskId === event.taskId)) return tasks;
			return tasks.map((task) => (task.taskId === event.taskId ? { ...task, status: event.status ?? task.status } : task));
		case "ended":
			return event.taskId ? tasks.filter((task) => task.taskId !== event.taskId) : tasks;
	}
}

/** A background task's label in the run bar: its description, else its subagent type, else "Background task". */
export function taskLabel(task: BackgroundTask): string {
	return task.description ?? task.subagentType ?? "Background task";
}
