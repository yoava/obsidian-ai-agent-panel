import { Events, type TAbstractFile } from "obsidian";
import { planSend, type PendingImage } from "../attachments";
import { conversationCost, isBareMessage, parsePanelCommand } from "../commands";
import type { SendContext } from "../context-format";
import type { LandedEdit } from "../edit-tracker";
import type { StoredConversation, StoredMessage } from "../history";
import type {
	AssistantMessage,
	BackgroundTask,
	ContentBlock,
	ContextUsage,
	ResultMessage,
	StreamMessage,
	UserMessage,
} from "../protocol/types";
import { isCheckpointedTool } from "../restore";
import type { BranchFailure, TurnEnd } from "../session";
import { branchFailureText } from "../state/branch-failure";
import { branchRecord, withBranch } from "../state/branch-history";
import type { Clear } from "../state/clear-divider";
import type { StopAnswer } from "../state/clear-dialog";
import { declineNote, type ClearBlock, type Declined, type HeldNote } from "../state/held-rows";
import { contextFor, imagesAfterKeep, imagesAfterSend, pendingImages, returnsClear, routeAfter, sendGate, submitRoute, type Delivery, type HeldSend } from "../state/held-send";
import { latestClearId } from "../state/segments";
import type { Card } from "../state/permission";
import {
	addAgentMessage,
	addCardForCall,
	addToolResults,
	addToolUse,
	closeGroup,
	endProcess,
	landEdit,
	reportAgent,
	RESULT_CHARS,
	rowEdit,
	settleCardCall,
	settleTurnCalls,
} from "../state/step-groups";
import {
	NO_COMPACTION,
	nextTurn,
	queueSend,
	reduceCompaction,
	settleCompaction,
	startsCompaction,
	type SendQueue,
	type CompactionContext,
	type CompactionRecord,
	type CompactionState,
	type CompactionStep,
} from "../state/compaction";
import { cacheAfter, cacheIdle, coldCache, type PromptCache } from "../state/prompt-cache";
import { emptyLedger, ledgerAfter, signalOf, unfinishedTasks, type TaskLedger } from "../state/stop-operation";
import { finishStream, reduceStream, STREAM_IDLE, type StreamChange, type StreamState, type TaskEvent, type ToolOutcome } from "../state/stream";
import {
	activity,
	EMPTY_MODEL,
	modelFromStored,
	newTabData,
	nextTasks,
	withItem,
	withTurnUsage,
	type Activity,
	type ChipKind,
	type CompactionItem,
	type ComposerData,
	type HeldCall,
	type MessageItem,
	type MessagesModel,
	type MetaRecord,
	type ModeState,
	type NewPrompt,
	type NewTabSettings,
	type PromptItem,
	type ReportItem,
	type ScrollPosition,
	type ShellItem,
	type StatusData,
	type Step,
} from "../state/tab";
import {
	addBlock,
	addClear,
	addCompaction,
	addError,
	addNote,
	addReport,
	addShell,
	addUserMessage,
	closeTurn,
	EMPTY_FOOTER,
	footerOf,
	lastTurnPrompts,
	markNotSent,
	openTurn,
	patchBlock,
	patchCard,
	removeBlock,
	removeClear,
	thinkingExpandable,
	turnEndRecord,
	updateItem,
	type ItemRef,
	type NewBlock,
} from "../state/turn";
import type { ForkBase } from "../state/fork-base";
import { turnCosts, turnTokens } from "../state/turn-cost";
import type { Recorder } from "./recorder";
import type { SessionLink } from "./session-link";

/** Where a streaming block's deltas go: `ui/turn`, bypassing events (ADR-016 State and updates). */
export interface DeltaSink {
	appendDelta(blockId: number, text: string): void;
}

/** The tab's pre-edit reads (`tab/edit-tracker`), for the main agent's and subagents' edits alike (DES-004 Diff sources). */
export interface ChatTabEdits {
	noteAssistant(message: AssistantMessage): void;
	/** The edits a message reports landed, by tool-use id. */
	noteResults(message: UserMessage): Map<string, Promise<LandedEdit>>;
}

/** A main-thread tool call's record, changed in place by its result and its edit. */
type ToolRecord = Extract<StoredMessage, { kind: "tool" }>;

/** What the send path and the turn's end reach outside the tab's state (DES-003 Composer). */
export interface ChatTabHost {
	link: SessionLink;
	recorder: Recorder;
	edits: ChatTabEdits;
	/** A restore of this tab is between its preview and its end (PRD-002.R14). */
	restoring: () => boolean;
	conversation: () => StoredConversation | null;
	/** Step 3: a panel command, which `tab/panel-commands` runs. */
	runPanelCommand: (text: string, name: string, args: string) => void;
	/** Step 4: the `!` escape, which `tab/shell-escape` runs; false when it does not apply. */
	runShell: (text: string) => boolean;
	/** Step 7: the context block from `context-builder`; none when `withContext` is false. */
	context: (text: string, withContext: boolean) => SendContext;
	/** Step 8: the composer's text was taken. */
	takeText: (text: string) => void;
	/** A turn ended at its `result`: plan usage refetched (DES-007). */
	onTurnFinished: () => void;
	/** A clear or an Undo is open, or a `/clear` is held: a send waits (PRD-001.R38). */
	blocked: () => boolean;
	/** A send made now is held: something blocks it, or earlier held messages go first. */
	holds: () => boolean;
	/** Keeps a message sent behind a hold, with its images, in its place. */
	hold: (text: string, images: readonly PendingImage[], context: SendContext | null) => void;
	/** A replayed held `/clear` did not run (a restore, or a Cancel): it and the messages behind it go back to the composer (`ChatTab.clearDeclined`). */
	declineClear: (cause: Declined, text: string) => void;
	/** Agents or background tasks run: asks whether to stop them and clear (PRD-001.R38); "clear" when nothing runs any more. */
	confirmStop: () => Promise<StopAnswer>;
	/** A `/clear` submission starts: false while another is under way, its question open included. `leaveClear` ends it. */
	enterClear: () => boolean;
	leaveClear: () => void;
	/** "Stop and clear" was pressed: `tab/clear-flow` stops the tasks and the turn, then clears; false when something is under way already. */
	stopAndClear: (text: string) => boolean;
	/** `/clear` alone was sent while a turn runs: held until it ends; false when something blocks it already. */
	holdClear: (text: string) => boolean;
	/** The turn started, or ended (`queued`: a message queued behind it may run next): the held `/clear` follows. */
	turnChanged: (running: boolean, queued: boolean) => void;
	/** The tab's message box, or its draft when switched away, holds no text. */
	composerEmpty: () => boolean;
	/** Unsent text goes back after what the composer holds. */
	returnText: (text: string) => void;
	/** `/clear` alone was sent and its composer text taken: `tab/clear-flow` runs it. */
	requestClear: () => void;
	/** Text follows `/clear`: asks whether to clear without it (PRD-001.R38). */
	confirmClear: () => Promise<boolean>;
}

const CHIP_FIELD = { note: "includeNote", folder: "includeFolder", links: "includeLinks" } as const;

/** The open text or thinking block: its item and id. */
interface OpenBlockRef {
	item: number;
	id: number;
}

/**
 * One conversation tab's state owner (ADR-016): the messages model and the
 * data its activity, composer, status line and run bar read, each written
 * through a setter that fires `items`, `item:<id>`, `activity`, `composer`,
 * `status`, `card`, `turn` or `tasks` (DES-003 Events); the send path; the
 * stream reduced by `state/stream` and applied to the model (tool steps,
 * agent rows and threads by `state/step-groups`), deltas going straight to
 * `ui/turn`; tool calls recorded; and a turn's record, footer and usage at
 * its end.
 */
export class ChatTab extends Events {
	private running = false;
	private textBlockOpen = false;
	/** From a thinking block's `content_block_start` to its `content_block_stop` (DES-003 Turn). */
	private thinkingOpen = false;
	/** Each card or form by its flow key: where it sits in the model, and whether it waits (DES-003 Tab activity). */
	private readonly cards = new Map<number, { ref: ItemRef; waiting: boolean }>();
	private waitingCards = 0;
	private shown: Activity = "idle";
	private readonly composerData: ComposerData<TAbstractFile>;
	private readonly statusData: StatusData;
	private scrollData: ScrollPosition;
	private model: MessagesModel = EMPTY_MODEL;
	private stream: StreamState = STREAM_IDLE;
	private textBlock: OpenBlockRef | null = null;
	private thinkingBlock: OpenBlockRef | null = null;
	private readonly sinks = new Map<number, DeltaSink>();
	/** The running turn's user-message uuid, once the CLI echoed it (DES-004). */
	private turnUuid: string | null = null;
	/** The running turn's last prompt the CLI echoed, queued and steered ones included (PRD-002.R15). */
	private lastEcho: string | null = null;
	/** The running turn called a tool the CLI's file checkpoints track. */
	private turnEdited = false;
	/** The running turn was started with `/compact` (PRD-001.R37). */
	private manualTurn = false;
	/** Sends made while a turn runs, one flag each: whether it is `/compact`; each result takes the first. */
	private queuedSends: SendQueue = [];
	/** The turn's compaction: what it showed, its divider and its stored record. */
	private compaction: CompactionState = NO_COMPACTION;
	private compactionItem: CompactionItem | null = null;
	private compactionRecord: CompactionRecord | null = null;
	/** A reopened conversation left this turn open; its end is recorded before the next prompt. */
	private unclosed: { turn: number; conversation: StoredConversation | null } | null = null;
	/** The background tasks the CLI reports running (DES-003 Agent rows and run bar); live only. */
	private taskList: readonly BackgroundTask[] = [];
	/** Every task the CLI process named, ended only by a terminal status: what a `/clear` must stop, whatever the run bar shows. */
	private ledger: TaskLedger = emptyLedger();
	/** Main-thread tool calls recorded, by tool-use id, until their result. */
	private readonly toolRecords = new Map<string, ToolRecord>();
	private host: ChatTabHost | null = null;

	constructor(settings: NewTabSettings) {
		super();
		const data = newTabData<TAbstractFile>(settings);
		this.composerData = data.composer;
		this.statusData = data.status;
		this.scrollData = data.scroll;
	}

	/** The tab's other parts, built after it. */
	connect(host: ChatTabHost): void {
		this.host = host;
	}

	get activity(): Activity {
		return this.shown;
	}

	get turnRunning(): boolean {
		return this.running;
	}

	/** A turn, an agent or a background task runs: a CLI swap would end it. */
	get working(): boolean {
		return this.running || this.taskList.length > 0;
	}

	/** A thinking block of the running turn streams; `thinking` fires when it changes. */
	get thinking(): boolean {
		return this.thinkingOpen;
	}

	/** When the running turn opened, for the tab hover card; null when none runs. */
	get workingSince(): number | null {
		return this.model.open?.startedAt ?? null;
	}

	get composer(): Readonly<ComposerData<TAbstractFile>> {
		return this.composerData;
	}

	get status(): Readonly<StatusData> {
		return this.statusData;
	}

	/** The unsettled permission cards and question forms. */
	get pendingCount(): number {
		return this.waitingCards;
	}

	/** The background tasks still running, for the run bar. */
	get tasks(): readonly BackgroundTask[] {
		return this.taskList;
	}

	/** The tasks no terminal status has ended: what a `/clear` asks about and stops. */
	get unfinished(): readonly BackgroundTask[] {
		return unfinishedTasks(this.ledger, this.taskList);
	}

	/** Where the messages were scrolled when another tab was shown. */
	get scroll(): Readonly<ScrollPosition> {
		return this.scrollData;
	}

	/** Kept while hidden, where the messages cannot be read; no component draws it. */
	setScroll(scroll: ScrollPosition): void {
		this.scrollData = scroll;
	}

	// --- The messages model (DES-003 Messages) ---------------------------------

	get items(): readonly MessageItem[] {
		return this.model.items;
	}

	/** The whole model from a reopened conversation's messages, which `items` hands over as a reset (DES-003 Reopen). */
	loadStored(messages: readonly StoredMessage[], forkBase?: ForkBase): void {
		const model = modelFromStored(messages, forkBase);
		this.model = model;
		this.unclosed = model.unclosed === null ? null : { turn: model.unclosed, conversation: this.host?.conversation() ?? null };
		this.stream = STREAM_IDLE;
		this.textBlock = null;
		this.thinkingBlock = null;
		this.thinkingOpen = false;
		this.turnUuid = null;
		this.lastEcho = null;
		this.turnEdited = false;
		this.manualTurn = false;
		this.queuedSends = [];
		this.compaction = NO_COMPACTION;
		this.syncCompacting();
		this.compactionItem = null;
		this.compactionRecord = null;
		this.toolRecords.clear();
		// Cards are live only; a reopen reuses no tab with one waiting (`reopenReusesTab`).
		this.cards.clear();
		this.waitingCards = 0;
		this.setHasMessages(this.model.items.some((item) => item.kind === "prompt"));
		this.trigger("items", { type: "reset" });
	}

	/** A panel command or a `!` run at the end, compact and unnumbered. */
	addPrompt(prompt: NewPrompt): PromptItem {
		const step = addUserMessage(this.model, prompt, Date.now());
		this.apply(step);
		this.setHasMessages(true);
		return step.item;
	}

	/** The branch note (PRD-002.R15) at the end. */
	addNote(text: string): void {
		this.apply(addNote(this.model, text));
	}

	/** A panel command's card at the end, loading (DES-003 Panel commands). */
	addReport(command: string): ReportItem {
		const step = addReport(this.model, command);
		this.apply(step);
		return step.item;
	}

	/** A `!` run's card at the end, running (PRD-002.R16). */
	addShell(command: string): ShellItem {
		const step = addShell(this.model, command);
		this.apply(step);
		return step.item;
	}

	/** A card changed: `item:<id>` carries it; nothing when the model no longer holds it. */
	updateItem(item: ReportItem | ShellItem | CompactionItem): void {
		this.apply(updateItem(this.model, item));
	}

	/** The card with `id`, or null when the model no longer holds one. */
	card<K extends "report" | "shell">(id: number, kind: K): Extract<MessageItem, { kind: K }> | null {
		const item = this.model.items.find((entry) => entry.id === id);
		return item?.kind === kind ? (item as Extract<MessageItem, { kind: K }>) : null;
	}

	/** An error outside a turn, `role="alert"`. */
	addError(text: string): void {
		this.apply(addError(this.model, text));
	}

	/** One prompt changed: `item:<id>` carries it. */
	updatePrompt(id: number, patch: Partial<Omit<PromptItem, "kind" | "id">>): void {
		const items = withItem(this.model.items, id, patch);
		if (items === this.model.items) return;
		this.model = { ...this.model, items };
		this.trigger(`item:${id}`, items.find((item) => item.id === id));
	}

	/** `ui/turn` takes the deltas of its item's streaming blocks. */
	setDeltaSink(itemId: number, sink: DeltaSink | null): void {
		if (sink) this.sinks.set(itemId, sink);
		else this.sinks.delete(itemId);
	}

	/** What a streaming block holds so far, for a turn drawn mid-stream. */
	streamed(blockId: number): string {
		if (this.textBlock?.id === blockId) return this.stream.text?.buffer ?? "";
		if (this.thinkingBlock?.id === blockId) return this.stream.thinking?.buffer ?? "";
		return "";
	}

	/** The new model, then its events: an item changed more than once in the step fires once, with its last state. */
	private apply(step: Step): void {
		this.model = step.model;
		step.changes.forEach((change, at) => {
			if (change.type !== "changed") this.trigger("items", change);
			else if (!step.changes.slice(at + 1).some((later) => later.type === "changed" && later.item.id === change.item.id))
				this.trigger(`item:${change.item.id}`, change.item);
		});
	}

	// --- The stream (DES-003 Stream to messages) ---------------------------------

	/**
	 * One message of the main thread or a subagent, reduced and applied to
	 * the model; an edit's pre-edit read starts first, and an edit that
	 * landed gives its row `+x -y` once the file is read again (PRD-002.R6).
	 * Returns what the view handles: `system/init` and other system messages.
	 */
	applyStream(message: StreamMessage): StreamChange[] {
		const edits = this.host?.edits;
		this.setCache(cacheAfter(this.statusData.cache, message, Date.now()));
		let landed: Map<string, Promise<LandedEdit>> | null = null;
		if (message.type === "assistant") edits?.noteAssistant(message as AssistantMessage);
		else if (message.type === "user") landed = edits?.noteResults(message as UserMessage) ?? null;
		// Their records, before the results release them.
		const landing = [...(landed ?? [])].map(([id, edit]) => ({ id, edit, record: this.toolRecords.get(id) ?? null }));
		const step = reduceStream(this.stream, message);
		this.stream = step.state;
		const rest = step.changes.filter((change) => !this.applyChange(change));
		for (const { id, edit, record } of landing)
			void edit.then(
				({ pre, after }) => this.landEdit(id, record, pre.before, after),
				() => undefined
			);
		return rest;
	}

	/** Applies a change to the model; false for one the view handles (`system` messages). */
	private applyChange(change: StreamChange): boolean {
		const now = Date.now();
		switch (change.type) {
			case "text-open":
				this.textBlock = this.addBlock({ kind: "text", text: "", streaming: true }, now);
				this.setTextBlockOpen(true);
				return true;
			case "text-delta":
				if (this.textBlock) this.sinks.get(this.textBlock.item)?.appendDelta(this.textBlock.id, change.text);
				return true;
			case "text-stop":
				this.setTextBlockOpen(false);
				return true;
			case "text-done":
				this.finishText(change.text, now);
				return true;
			case "thinking-open":
				this.thinkingBlock = this.addBlock({ kind: "thinking", text: "", streaming: true, startedAt: now, endedAt: null }, now);
				this.setThinkingOpen(true);
				return true;
			case "thinking-delta":
				if (this.thinkingBlock) this.sinks.get(this.thinkingBlock.item)?.appendDelta(this.thinkingBlock.id, change.text);
				return true;
			case "thinking-stop":
				if (this.thinkingBlock) this.apply(patchBlock(this.model, this.thinkingBlock.id, { endedAt: now }));
				this.setThinkingOpen(false);
				return true;
			case "thinking-done":
				this.finishThinking(change.text, now);
				return true;
			case "uuid":
				if (change.first) this.turnUuid = change.uuid;
				this.lastEcho = change.uuid;
				return true;
			case "result":
				this.finishTurn(change.message);
				return true;
			case "tool-use":
				this.addCall(change.block.id, change.block.name, change.block.input, now);
				return true;
			case "tool-results":
				this.addResults(change.parent, change.results, now);
				return true;
			case "agent-message":
				this.apply(addAgentMessage(this.model, change.parent, change.message, now));
				return true;
			case "task":
				this.applyTask(change.event, now);
				return true;
			case "compaction":
				// The one compaction path: a boundary leaves the prompt cache cold (PRD-005.R11).
				if (change.signal.type === "boundary") this.setCache(coldCache(this.statusData.cache));
				this.applyCompaction(reduceCompaction(this.compaction, change.signal, this.compactionContext()));
				return true;
			default:
				return false;
		}
	}

	private compactionContext(): CompactionContext {
		return { manualTurn: this.manualTurn, percent: this.statusData.usage.context?.percentage ?? null, now: Date.now() };
	}

	/** A compaction step (PRD-001.R37): its divider shown or changed at the end, its record written or completed (ADR-018). */
	private applyCompaction(step: CompactionStep): void {
		this.compaction = step.state;
		this.syncCompacting();
		const show = step.show;
		if (show) {
			if (show.isNew || !this.compactionItem) {
				const added = addCompaction(this.model, show.data);
				this.apply(added);
				this.compactionItem = added.item;
				this.compactionRecord = null;
			} else {
				this.compactionItem = { ...this.compactionItem, ...show.data };
				this.apply(updateItem(this.model, this.compactionItem));
			}
		}
		const op = step.record;
		const host = this.host;
		if (!op || !host) return;
		if (op.type === "add") {
			this.compactionRecord = op.record;
			host.recorder.record(op.record);
		} else if (this.compactionRecord) {
			Object.assign(this.compactionRecord, op.patch);
			host.recorder.changed(this.compactionRecord);
		}
	}

	/** The status line's compacting tint follows the compaction state (PRD-005.R8). */
	private syncCompacting(): void {
		const compacting = this.compaction.current?.phase === "compacting";
		if (compacting === this.statusData.compacting) return;
		this.statusData.compacting = compacting;
		this.trigger("status");
	}

	/** The turn ends: a compaction still running did not finish, and its summary can no longer join its record. */
	private settleCompaction(sessionEnded = false): void {
		const percent = this.statusData.usage.context?.percentage ?? null;
		this.applyCompaction(settleCompaction(this.compaction, { manualTurn: this.manualTurn, percent }));
		this.compactionItem = null;
		this.compactionRecord = null;
		// The CLI runs the next queued send as the next turn; a session that ended runs none.
		const next = nextTurn(sessionEnded ? [] : this.queuedSends);
		this.manualTurn = next.manual;
		this.queuedSends = next.queue;
	}

	/** Reply text or thinking: the open tool-step group closes first (DES-003 Tool-step group). */
	private addBlock(block: NewBlock, now: number): OpenBlockRef {
		this.apply(closeGroup(this.model, null));
		const step = addBlock(this.model, block, now);
		this.apply(step);
		return { item: step.item, id: step.id };
	}

	/** A main-thread tool call: its step row or agent row, and its record (DES-005). */
	private addCall(id: unknown, name: unknown, raw: unknown, now: number): void {
		// The CLI's JSON, read with care: a call without an id or a name is not drawn.
		if (typeof id !== "string" || typeof name !== "string") return;
		const input = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
		if (isCheckpointedTool(name)) this.turnEdited = true;
		// Recorded once, should the CLI repeat a call.
		if (!this.toolRecords.has(id)) {
			const record: ToolRecord = { kind: "tool", name, input };
			this.host?.recorder.record(record);
			this.toolRecords.set(id, record);
		}
		this.apply(addToolUse(this.model, { id, name, input }, null, now));
	}

	/**
	 * Tool results settle their rows; an agent's call ends it unless its task
	 * runs in the background. A main-thread call's record takes its outcome,
	 * the result cut to 1500 characters (PRD-003.R3).
	 */
	private addResults(parent: string | null, results: readonly ToolOutcome[], now: number): void {
		this.apply(addToolResults(this.model, results, now, (toolUseId) => this.runsInBackground(toolUseId)));
		if (parent !== null) return;
		for (const result of results) {
			const record = this.toolRecords.get(result.toolUseId);
			if (!record) continue;
			this.toolRecords.delete(result.toolUseId);
			record.isError = result.isError;
			if (result.text) record.result = result.text.slice(0, RESULT_CHARS);
			this.host?.recorder.changed(record);
		}
	}

	/** A succeeded edit landed: its row's `+x -y` and diff, and the counts into its record (PRD-002.R6). */
	private landEdit(id: string, record: ToolRecord | null, before: string | null, after: string | null): void {
		this.apply(landEdit(this.model, id, before, after));
		const edit = rowEdit(this.model, id);
		if (!record || !edit) return;
		record.added = edit.added;
		record.removed = edit.removed;
		this.host?.recorder.changed(record);
	}

	/** The turn ends: its calls that will not report end, its background agents run on (`settleTurnCalls`). */
	private settleCalls(): void {
		this.apply(settleTurnCalls(this.model, (toolUseId) => this.runsInBackground(toolUseId), Date.now()));
	}

	/** A call whose background task still runs. */
	private runsInBackground(toolUseId: string): boolean {
		return this.taskList.some((task) => task.toolUseId === toolUseId);
	}

	/** A background-task message: the run bar's list, and a finished agent's totals (PRD-001.R18). */
	private applyTask(event: TaskEvent, now: number): void {
		const signal = signalOf(event);
		if (signal) this.ledger = ledgerAfter(this.ledger, signal);
		const tasks = nextTasks(this.taskList, event);
		if (tasks !== this.taskList) {
			this.taskList = tasks;
			this.trigger("tasks");
		}
		if (event.type === "ended" && event.toolUseId) this.apply(reportAgent(this.model, event.toolUseId, event.report, now));
	}

	/**
	 * The CLI process ended or a restart replaced it: its background tasks
	 * went with it, and nothing it ran will report (`endProcess`).
	 */
	processEnded(): void {
		this.ledger = emptyLedger();
		if (this.taskList.length > 0) {
			this.taskList = [];
			this.trigger("tasks");
		}
		this.apply(endProcess(this.model, Date.now()));
	}

	/** A reply block is complete: rendered from its whole text, or gone when empty (PRD-001.R15); recorded. */
	private finishText(text: string, now: number): void {
		const open = this.textBlock;
		this.textBlock = null;
		this.setTextBlockOpen(false);
		const empty = !text.trim();
		if (open) this.apply(empty ? removeBlock(this.model, open.id) : patchBlock(this.model, open.id, { text, streaming: false }));
		else if (!empty) this.addBlock({ kind: "text", text, streaming: false }, now);
		if (!empty) this.host?.recorder.record({ kind: "assistant", text });
	}

	/** A thinking block is complete; recorded when it holds text. */
	private finishThinking(text: string, now: number): void {
		const open = this.thinkingBlock;
		this.thinkingBlock = null;
		this.setThinkingOpen(false);
		if (open) {
			const block = this.blockOf(open);
			const endedAt = block?.kind === "thinking" && block.endedAt !== null ? block.endedAt : now;
			this.apply(patchBlock(this.model, open.id, { text, streaming: false, endedAt }));
		} else if (thinkingExpandable(text)) this.addBlock({ kind: "thinking", text, streaming: false, startedAt: null, endedAt: null }, now);
		if (thinkingExpandable(text)) this.host?.recorder.record({ kind: "thinking", text });
	}

	private blockOf(ref: OpenBlockRef) {
		const item = this.model.items.find((entry) => entry.id === ref.item);
		return item?.kind === "turn" ? (item.blocks.find((block) => block.id === ref.id) ?? null) : null;
	}

	/**
	 * The turn's `result` (DES-003 Stream to messages): its record (DES-004),
	 * its footer with the duration and this turn's cost from the recorded
	 * totals (PRD-005.R7) or its error, the tokens for the footer's hover
	 * card, the conversation's totals, and the context lookup (DES-007).
	 */
	private finishTurn(message: ResultMessage): void {
		const host = this.host;
		if (!host) return;
		// An error result still reports the session's running total, recorded for the cost.
		const meta: MetaRecord = message.is_error
			? { kind: "meta", error: message.result?.slice(0, 500) ?? "Turn failed", costUsd: message.total_cost_usd }
			: { kind: "meta", durationMs: message.duration_ms, costUsd: message.total_cost_usd };
		// A message queued behind this turn may run next (a held `/clear` waits for it).
		const queuedBehind = this.queuedSends.length > 0;
		meta.turn = this.model.open?.turn ?? this.model.turns + 1;
		if (this.turnUuid) meta.rewindUuid = this.turnUuid;
		if (this.lastEcho && this.lastEcho !== this.turnUuid) meta.lastPromptUuid = this.lastEcho;
		if (message.session_id) meta.sessionId = message.session_id;
		const session = host.link.session;
		if (session) meta.profileId = session.profileId;
		if (this.turnEdited) meta.edited = true;
		// A turn the CLI starts from a queued message must not inherit these.
		this.turnUuid = null;
		this.lastEcho = null;
		this.turnEdited = false;
		this.settleCompaction();
		host.recorder.record(meta);
		const messages = host.conversation()?.messages ?? [];
		const forkBase = host.conversation()?.forkBase;
		const cost = turnCosts(messages, forkBase)[messages.lastIndexOf(meta)] ?? null;
		this.settleCalls();
		this.apply(closeTurn(this.model, footerOf(meta, cost, turnTokens(message.usage)), Date.now()));
		// After the record: the conversation's cost is read from the saved turn records.
		this.addTurnUsage(message.usage, conversationCost(messages, forkBase));
		// The window's fill only the CLI knows; it refuses before the first turn.
		void session?.contextUsage().then((context) => {
			if (context) this.setContext(context);
		});
		host.onTurnFinished();
		this.announceEnd(queuedBehind);
	}

	/**
	 * The turn ends without a `result` (the CLI exited, a send failed):
	 * open blocks finalized, then closed with an empty footer, and its end
	 * recorded, so a reopen does not take the next prompt as sent mid-turn;
	 * with the last prompt the CLI echoed in it, which a branch names.
	 */
	private endTurn(): void {
		const open = this.model.open;
		this.setCache(cacheIdle(this.statusData.cache));
		const step = finishStream(this.stream);
		this.stream = step.state;
		for (const change of step.changes) this.applyChange(change);
		const echo = this.lastEcho;
		this.turnUuid = null;
		this.lastEcho = null;
		this.turnEdited = false;
		this.settleCompaction(true);
		this.settleCalls();
		this.apply(closeTurn(this.model, EMPTY_FOOTER, Date.now()));
		const host = this.host;
		if (open && host?.conversation()) {
			const record = turnEndRecord(open.turn, echo ? { uuid: echo, sessionId: host.link.session?.sessionId ?? null } : null);
			// Ended before the branch's rewind succeeded: the turn's prompts were never sent (PRD-002.R15).
			const branch = host.link.pendingBranch();
			host.recorder.record(branch ? withBranch(record, branch) : record);
		}
	}

	/** The tab closes, or the view, with a turn running: its end is recorded before the conversation is flushed. */
	endRunningTurn(): void {
		if (this.model.open) this.endTurn();
	}

	/**
	 * The CLI ended with an error (DES-002 Session end): recorded with the
	 * conversation (500 characters), so its note does not just stop, and shown
	 * as an error block.
	 */
	sessionEnded(message: string): void {
		this.endTurn();
		if (this.host?.conversation()) this.host.recorder.record({ kind: "meta", error: message.slice(0, 500) });
		this.addError(message);
	}

	/**
	 * The branch's rewind failed (PRD-002.R15): the turn, already ended, sent
	 * nothing. Shown and recorded as a session error, with the branch still to
	 * make when the session kept it, so a reopen makes it; its images go back
	 * to the composer, and its text is returned for the view to put back.
	 */
	branchFailed(failure: BranchFailure): string {
		const prompts = lastTurnPrompts(this.model);
		const message = branchFailureText(failure);
		this.endTurn();
		this.apply(markNotSent(this.model));
		if (this.host?.conversation()) {
			const retry = failure.retry;
			const record: MetaRecord = retry ? branchRecord(retry, message) : { kind: "meta", error: message };
			this.host.recorder.record(record);
		}
		this.addError(message);
		const images = prompts.flatMap((prompt) => (typeof prompt.images === "number" ? [] : prompt.images));
		if (images.length) this.setImages([...images, ...this.composerData.images]);
		return prompts
			.map((prompt) => prompt.text)
			.filter((text) => text)
			.join("\n\n");
	}

	// --- The send path (DES-003 Composer) ------------------------------------------

	/**
	 * The composer's text, in DES-003's order; `takeText` clears what it took.
	 * While a clear or an Undo is open, a `/clear` is held, or earlier messages
	 * are held, the message is held with its images, in order, and the
	 * composer is free again (PRD-001.R38).
	 */
	async send(text: string): Promise<void> {
		const host = this.host;
		if (!host) return;
		// 1. From a restore's preview to its end the tab sends nothing (PRD-002.R14).
		if (host.restoring()) return;
		// 2.
		if (!text && this.composerData.images.length === 0) return;
		if (submitRoute(host.holds()) === "hold") return this.hold(text);
		if (routeAfter(await this.deliver(text, null)) === "hold") this.hold(text);
	}

	/** A message sent behind a hold leaves the composer, with its images and the context it was sent with, to be sent in its turn. */
	private hold(text: string): void {
		const host = this.host;
		if (!host) return;
		const images = this.composerData.images;
		const context = isBareMessage(text) ? null : host.context(text, true);
		this.setImages([]);
		host.takeText(text);
		host.hold(text, images, context);
	}

	/** A held message's turn: the send path with the images and context it was held with; never rejects. */
	async deliverHeld(held: HeldSend): Promise<Delivery> {
		try {
			return await this.deliver(held.text, held);
		} catch (err) {
			this.addError(err instanceof Error ? err.message : String(err));
			return this.keep(held);
		}
	}

	/** A held message that did not go: its text and images are back in the composer, in order. */
	private keep(held: HeldSend | null): Delivery {
		if (held) this.putBack(held);
		return "kept";
	}

	private putBack(held: HeldSend): void {
		this.host?.returnText(held.text);
		if (held.images.length) this.setImages(imagesAfterKeep(this.composerData.images, held.images));
	}

	/**
	 * Steps 3 to 9 of the send path. `held` is a held message in its turn: its
	 * images and context are its own, the composer's text is not taken, and
	 * what does not go comes back to the composer.
	 */
	private async deliver(text: string, held: HeldSend | null): Promise<Delivery> {
		const host = this.host;
		if (!host) return "kept";
		if (host.restoring()) return this.keep(held);
		// 3. Commands the panel answers itself: over stream-JSON the CLI would
		// answer them in plain text, refuse them, or spend tokens on them.
		const command = parsePanelCommand(text);
		if (command?.name === "clear") {
			const result = await this.clear(text, command.args, held);
			return result === "kept" ? this.keep(held) : result;
		}
		if (command) {
			// Before it runs: /clear switches tabs.
			if (!held) host.takeText(text);
			host.runPanelCommand(text, command.name, command.args);
			return "sent";
		}
		// 4. The `!` escape, the user's own command, run locally.
		if (host.runShell(text)) return "sent";
		// 5. Mid-turn sends go straight to the CLI, which steers the running turn
		// with them or queues them for the next, depending on its version.
		const queued = host.link.busy;
		// 6.
		const session = await host.link.ensure();
		// A pending resume (ADR-018 Decision 1) sends nothing and keeps the text and images in the composer.
		const refusal = { message: null as string | null };
		const gate = sendGate({
			restoring: host.restoring(),
			session: session !== null,
			// A hold that began while the session was being made keeps this message in its place (PRD-001.R38).
			blocked: host.blocked(),
			resumeRefused: () => {
				try {
					session?.checkResume();
					return false;
				} catch (err) {
					refusal.message = err instanceof Error ? err.message : String(err);
					return true;
				}
			},
		});
		if (gate === "again") return "again";
		if (gate === "kept" || !session) {
			if (refusal.message !== null) this.addError(refusal.message);
			return this.keep(held);
		}
		// 7. No context block for a message sent mid-turn or a bare command, and
		// the images wait behind a command (PRD-001.R12).
		const pending = pendingImages(held ? held.images : null, this.composerData.images);
		const plan = planSend(text, queued, pending);
		const context = contextFor(held, plan.withContext, () => host.context(text, plan.withContext));
		const fullText = context.block ? `${context.block}\n\n${text}` : text;
		const attachments = plan.send;
		// A held message's images that wait behind its command go back to the composer; the composer's own stay.
		this.setImages(imagesAfterSend(held !== null, this.composerData.images, plan.keep));
		// 8. Unless queued, the prompt opens a turn; queued, it continues the running one.
		const sentAt = Date.now();
		this.apply(
			addUserMessage(
				this.model,
				{ type: "prompt", text, contextName: context.block ? context.label : null, images: attachments, sentAt },
				sentAt
			)
		);
		this.setHasMessages(true);
		// A reopened file left its last turn open: its end goes first (DES-005).
		const unclosed = this.unclosed;
		this.unclosed = null;
		if (unclosed && unclosed.conversation === host.conversation() && unclosed.conversation)
			host.recorder.record(turnEndRecord(unclosed.turn));
		host.recorder.recordPrompt({
			kind: "user",
			text,
			contextName: (context.block ? context.label : null) ?? undefined,
			contextPaths: context.paths.length ? context.paths : undefined,
			images: attachments.length || undefined,
			sentAt,
		});
		// A message to Claude Code ends the latest clear's Undo (PRD-001.R38).
		this.refreshClears();
		if (!held) host.takeText(text);
		if (queued) this.queuedSends = queueSend(this.queuedSends, text);
		else this.manualTurn = startsCompaction(text);
		// 9. Images lead, text last: the shape the CLI passes to the API.
		const content: ContentBlock[] = [
			...attachments.map((image) => ({
				type: "image",
				source: { type: "base64", media_type: image.mediaType, data: image.base64 },
			})),
			...(fullText ? [{ type: "text", text: fullText }] : []),
		];
		try {
			session.send(attachments.length ? content : fullText);
		} catch (err) {
			this.endTurn();
			this.addError(err instanceof Error ? err.message : String(err));
		}
		return "sent";
	}

	/** What keeps a `/clear` from running now: a background task or an agent runs (it asks first), or a restore is under way. */
	clearBlock(): ClearBlock | null {
		return this.unfinished.length > 0 ? "tasks" : this.host?.restoring() ? "restore" : null;
	}

	/**
	 * `/clear` (PRD-001.R38). While a restore is under way it is not run, and
	 * says why: typed now, it stays in the composer; replayed from the held
	 * messages, it goes back to the composer with the messages behind it, never
	 * on into the old context. While an agent or a background task runs, it
	 * asks first: "Stop and clear" stops them and the turn, then clears
	 * (`tab/clear-flow`); "Cancel" leaves the text in the composer, or returns
	 * the replayed `/clear` and the messages behind it. Otherwise, while a turn
	 * runs it is held until the turn ends, the composer free meanwhile.
	 */
	private async clear(text: string, args: string, held: HeldSend | null): Promise<Delivery> {
		const host = this.host;
		if (!host) return "kept";
		// A second /clear while one asks is answered no, whatever the tasks did meanwhile.
		if (!host.enterClear()) return held ? "again" : "kept";
		try {
			return await this.submitClear(host, text, args, held);
		} finally {
			host.leaveClear();
		}
	}

	private async submitClear(host: ChatTabHost, text: string, args: string, held: HeldSend | null): Promise<Delivery> {
		const declined = (cause: Declined): Delivery => {
			if (!held) {
				const note = declineNote(cause);
				if (note) this.addNote(note.text);
				return "kept";
			}
			host.declineClear(cause, text);
			return "sent";
		};
		if (this.clearBlock() === "restore") return declined("restore");
		if (args && !(await host.confirmClear())) return "kept";
		let block = this.clearBlock();
		if (block === "restore") return declined("restore");
		if (block === "tasks") {
			const answer = await host.confirmStop();
			if (answer === "cancel") return declined("cancelled");
			block = this.clearBlock();
			// Tasks that began while the question was open were not asked about.
			if (block === "tasks" && answer !== "stop") return declined("cancelled");
			if (block === "restore") return declined("restore");
		}
		// A hold that began while a dialog was open keeps the clear in its place.
		if (host.blocked()) return "again";
		if (!held) host.takeText(text);
		if (block === "tasks") return host.stopAndClear(text) ? "sent" : "again";
		if (this.running || host.link.busy) return host.holdClear("/clear") ? "sent" : "again";
		host.requestClear();
		return "sent";
	}

	/** The turn's end reaches the held `/clear` once its `result` is recorded, or at once when no `result` comes (PRD-001.R38). */
	private announceEnd(queued: boolean): void {
		if (!this.running) this.host?.turnChanged(false, queued);
	}

	/**
	 * A clear completed (PRD-001.R38): its divider at the end, the context
	 * segment hidden until the next finished turn (PRD-005.R8) and the prompt
	 * cache cold (PRD-005.R11).
	 */
	addClear(clear: Clear): void {
		this.addPrompt({ type: "command", text: "/clear", contextName: null, images: 0, sentAt: null });
		this.apply(addClear(this.model, clear));
		this.statusData.usage = { ...this.statusData.usage, context: null };
		this.statusData.contextHidden = true;
		this.statusData.cache = coldCache(this.statusData.cache);
		this.trigger("status");
	}

	/**
	 * A clear was undone (PRD-001.R38): the latest divider goes and with it the
	 * dimming, and the resumed session's context usage shows again.
	 */
	removeClear(usage: ContextUsage | null): void {
		const id = latestClearId(this.model.items);
		if (id !== null) this.apply(removeClear(this.model, id));
		this.statusData.contextHidden = false;
		if (usage) this.statusData.usage = { ...this.statusData.usage, context: usage };
		this.trigger("status");
	}

	/** The clear dividers draw again: which one offers Undo, and in what state, may have changed. */
	refreshClears(): void {
		const id = latestClearId(this.model.items);
		const latest = id === null ? undefined : this.model.items.find((item) => item.id === id);
		if (latest) this.trigger(`item:${latest.id}`, latest);
	}

	/** The held `/clear` or the held messages changed: the tray draws again, and the live region says `note` (`held`). */
	refreshHeld(note?: HeldNote): void {
		this.trigger("held", { note });
	}

	/**
	 * A held `/clear` could not run: it and the messages held behind it are back
	 * in the composer, in order with their images, and the note says why
	 * (PRD-001.R38). They are never sent into the context the clear was to end.
	 */
	clearDeclined(cause: Declined, text: string, sends: readonly HeldSend[]): void {
		for (const send of sends) this.putBack(send);
		if (this.host && returnsClear(sends.length, this.host.composerEmpty())) this.host.returnText(text);
		const note = declineNote(cause);
		if (note?.error) this.addError(note.text);
		else if (note) this.addNote(note.text);
	}

	// --- Activity, cards and turns ---------------------------------------------

	/**
	 * The session's turn starts or ends; `ended` says how. Claude's output
	 * while no turn is open opens one; an end other than `result` closes the
	 * turn at once, while a `result` closes it with its footer as it is applied.
	 */
	setTurnRunning(running: boolean, ended: TurnEnd | undefined): void {
		if (running === this.running) return;
		this.running = running;
		if (running && !this.model.open) this.apply(openTurn(this.model, Date.now()));
		if (!running) {
			this.textBlockOpen = false;
			this.setThinkingOpen(false);
			if (ended !== "result") this.endTurn();
		}
		const changed = this.updateActivity();
		this.trigger("turn", running ? { open: true } : { open: false, ended });
		if (changed) this.trigger("activity", this.shown);
		// A `result` is announced once recorded (`finishTurn`); any other end has nothing more to record.
		if (running) this.host?.turnChanged(true, false);
		else if (ended !== "result") this.announceEnd(false);
	}

	/** From a text block's `content_block_start` to its `content_block_stop`. */
	private setTextBlockOpen(open: boolean): void {
		if (open === this.textBlockOpen) return;
		this.textBlockOpen = open;
		if (this.updateActivity()) this.trigger("activity", this.shown);
	}

	/** From a thinking block's `content_block_start` to its `content_block_stop`. */
	private setThinkingOpen(open: boolean): void {
		if (open === this.thinkingOpen) return;
		this.thinkingOpen = open;
		this.trigger("thinking", open);
	}

	/**
	 * A card or form starts waiting (`tab/permission-flow`): in the running
	 * turn, else at the end; `card` fires, and `activity` with it.
	 */
	addCard(key: number, card: Card): void {
		if (this.cards.has(key)) return;
		// Its call's row waits on the card, which closes the open group (DES-003 Tool-step group).
		const step = addCardForCall(this.model, card, Date.now());
		const waiting = card.phase !== "settled";
		this.cards.set(key, { ref: step.ref, waiting });
		if (waiting) this.waitingCards++;
		const changed = this.updateActivity();
		this.apply(step);
		if (waiting) this.trigger("card", { requestId: card.requestId, waiting: true });
		if (changed) this.trigger("activity", this.shown);
	}

	/** A card or form changed where it is; `card` fires when it settles. */
	setCard(key: number, card: Card): void {
		const entry = this.cards.get(key);
		if (!entry) return;
		const waiting = card.phase !== "settled";
		const settles = entry.waiting && !waiting;
		if (settles) {
			entry.waiting = false;
			this.waitingCards--;
		}
		const changed = this.updateActivity();
		// Settled, the card lets its call's row go: back as the first of a new group when answered.
		const held = settles ? this.heldAt(entry.ref) : null;
		this.apply(patchCard(this.model, entry.ref, card, settles ? null : undefined));
		if (settles) this.apply(settleCardCall(this.model, card, held, Date.now()));
		if (settles) this.trigger("card", { requestId: card.requestId, waiting: false });
		if (changed) this.trigger("activity", this.shown);
	}

	/** The row a card holds for its call. */
	private heldAt(ref: ItemRef): HeldCall | null {
		const item = this.model.items.find((entry) => entry.id === ref.item);
		if (ref.block === null) return item?.kind === "card" ? item.held : null;
		const block = item?.kind === "turn" ? item.blocks.find((entry) => entry.id === ref.block) : undefined;
		return block?.kind === "card" ? block.held : null;
	}

	/**
	 * Recompute the activity before any event fires, so every handler reads
	 * the new state; true when it changed.
	 */
	private updateActivity(): boolean {
		const next = activity(this.running, this.waitingCards, this.textBlockOpen);
		if (next === this.shown) return false;
		this.shown = next;
		return true;
	}

	// --- Composer ----------------------------------------------------------------

	setDraft(draft: string): void {
		this.composerData.draft = draft;
		this.trigger("composer");
	}

	toggleChip(kind: ChipKind): void {
		const field = CHIP_FIELD[kind];
		this.composerData[field] = !this.composerData[field];
		this.trigger("composer");
	}

	attach(item: TAbstractFile): void {
		if (this.composerData.attached.includes(item)) return;
		this.composerData.attached = [...this.composerData.attached, item];
		this.trigger("composer");
	}

	detach(item: TAbstractFile): void {
		this.composerData.attached = this.composerData.attached.filter((entry) => entry !== item);
		this.trigger("composer");
	}

	addImages(images: readonly PendingImage[]): void {
		if (images.length === 0) return;
		this.composerData.images = [...this.composerData.images, ...images];
		this.trigger("composer");
	}

	setImages(images: readonly PendingImage[]): void {
		this.composerData.images = [...images];
		this.trigger("composer");
	}

	setHasMessages(hasMessages: boolean): void {
		if (hasMessages === this.composerData.hasMessages) return;
		this.composerData.hasMessages = hasMessages;
		this.trigger("composer");
	}

	// --- Status ------------------------------------------------------------------

	/** A model pick; a different model makes the prompt cache cold (PRD-005.R11). */
	setModel(model: string): void {
		if (model !== this.statusData.model) this.statusData.cache = coldCache(this.statusData.cache);
		this.statusData.model = model;
		this.trigger("status");
	}

	setEffort(effort: string): void {
		this.statusData.effort = effort;
		this.trigger("status");
	}

	setProfile(profileId: string): void {
		this.statusData.profileId = profileId;
		this.trigger("status");
	}

	setMode(mode: Partial<ModeState>): void {
		Object.assign(this.statusData, mode);
		this.trigger("status");
	}

	/** The model id the CLI reported; "" until it reports again. Another model than the last reported makes the prompt cache cold. */
	setReportedModel(id: string): void {
		const last = this.statusData.reportedModel;
		if (last && id && id !== last) this.statusData.cache = coldCache(this.statusData.cache);
		this.statusData.reportedModel = id;
		this.trigger("status");
	}

	/** The prompt cache after a stream message, a turn's end or a change; `status` fires when it changed. */
	private setCache(cache: PromptCache): void {
		if (cache === this.statusData.cache) return;
		this.statusData.cache = cache;
		this.trigger("status");
	}

	/** A `result`: its tokens join the totals, and the conversation's cost is now `costUsd`. */
	private addTurnUsage(usage: Record<string, unknown> | undefined, costUsd: number): void {
		this.statusData.usage = withTurnUsage(this.statusData.usage, usage);
		this.statusData.contextHidden = false;
		this.statusData.costUsd = costUsd;
		this.trigger("status");
	}

	setContext(context: ContextUsage): void {
		this.statusData.usage = { ...this.statusData.usage, context };
		this.trigger("status");
	}

	setCost(costUsd: number): void {
		this.statusData.costUsd = costUsd;
		this.trigger("status");
	}
}
