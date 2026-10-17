import type { PendingImage } from "../attachments";
import type { SendContext } from "../context-format";
import type { StoredConversation, StoredMessage } from "../history";
import type { ClearGate } from "../session";
import type { ContextUsage, StreamMessage } from "../protocol/types";
import { clearDue, clearRecord } from "../state/boundary-records";
import {
	classify,
	idleClear,
	idleHold,
	idleUndo,
	reduceClear,
	reduceHold,
	reduceUndo,
	undoFailure,
	type ClearAction,
	type ClearInput,
	type ClearState,
	type Effective,
	type HoldAction,
	type HoldInput,
	type HoldState,
	type UndoInput,
	type UndoState,
} from "../state/clear-operation";
import type { StopAnswer } from "../state/clear-dialog";
import type { ClearBlock, Declined, HeldNote } from "../state/held-rows";
import type { Delivery, HeldSend } from "../state/held-send";
import { idleStop, reduceStop, taskSignal, type StopAction, type StopInput, type StopState } from "../state/stop-operation";
import { mayAdopt, undoBlock, undoOffer, undoState, type UndoBlock, type UndoFacts, type UndoOffer, type UndoState as UndoButton } from "../state/segments";
import { clearTimer, setTimer, type TimerHandle, type TimerHost } from "../timers";
import { HeldSends } from "./held-sends";

/** How long the sends wait for an Undo's conversation save before they go regardless. */
const UNDO_SAVE_BOUND_MS = 5_000;

/** What the held tray draws (DES-003 Held messages): the held `/clear`, if any, and the messages behind it, oldest first. */
export interface HeldView {
	clear: string | null;
	sends: readonly HeldSend[];
}

/** The session as the clear reads it: `ClaudeSession`'s process generation, id and the calls a clear makes. */
export interface ClearSession {
	readonly generation: number;
	readonly sessionId: string | null;
	readonly running: boolean;
	/** The mode and model the CLI runs with now. */
	readonly effective: Effective;
	writeClear(): boolean;
	/** Set the mode and model again on the running process; rejects when refused or the process ended. `modeSkipped`: a Bypass mode was not sent because the setting is off. */
	reapply(values: Effective): Promise<{ modeSkipped: boolean } | void>;
	restart(): void;
	abandon(): void;
	/** Ask the CLI to stop a task; the reply is no report that it ended. */
	stopTask(taskId: string): Promise<void>;
	/** Ask the CLI to interrupt, whether or not a turn runs. */
	interrupt(): Promise<void>;
}

/** What the clear reaches outside the machine (DES-002 Clear transaction). */
export interface ClearFlowHost {
	conversation: () => StoredConversation | null;
	session: () => ClearSession | null;
	/** The stored session the next launch resumes, if any. */
	resumeId: () => string | null;
	/** A branch whose first message has not been sent (PRD-001.R38), and dropping its fork and rewind. */
	unstartedBranch: () => boolean;
	dropBranch: () => void;
	/** The session joins this device's record as one the panel began (ADR-018 Decision 1). */
	recordSession: (sessionId: string) => void;
	record: (message: StoredMessage) => void;
	/** The link resumes `sessionId` from now on, or with null starts a new session. */
	cleared: (sessionId: string | null) => void;
	/** The tab shows the clear: divider, Restore, status line. */
	onCleared: (at: number) => void;
	/** The model ids the CLI resolved aliases to. */
	resolvedModels: () => Record<string, string>;
	/** The CLI took the mode and model it lost set again: the tab shows them. */
	reapplied: (values: Effective) => void;
	/** The user's pick of a mode is still waiting for the CLI: it shows the mode, not the clear. */
	picking: () => boolean;
	/** The clear ended: the tab shows the mode the CLI runs. */
	released: (effective: Effective) => void;
	/** `sessionId` is not one this device recorded for the conversation: its clear's Undo shows disabled (PRD-003.R4). */
	foreignSession: (sessionId: string) => boolean;
	/** What the tab is doing: an Undo starts, and its CLI is adopted, only while none of it holds (`undoBlock`). */
	facts: () => Omit<UndoFacts, "clearOpen">;
	/** Bumped by each change of launch settings (the CLI path, WSL, a profile edit); an Undo started before one cannot be adopted after it. */
	launchGeneration: () => number;
	/**
	 * Start a CLI beside the tab's, resuming `sessionId` with the tab's launch
	 * settings, and deliver its messages and its end to `gate`; false when it
	 * cannot be started (an id this device did not record, a profile or CLI
	 * that cannot launch, Bypass no longer allowed).
	 */
	startUndo: (sessionId: string, gate: ClearGate) => Promise<boolean>;
	/** Ask the CLI `startUndo` started for its context usage; rejects when it errors, ends or answers with something else. */
	probeUndo: () => Promise<ContextUsage>;
	/** Stop that CLI, and any still starting; a CLI that was not adopted is always stopped. */
	stopUndo: () => void;
	/** Make that CLI the tab's, which stops the one it replaces; false when the tab's launch settings or profile changed meanwhile. */
	adoptUndo: (sessionId: string) => boolean;
	/** The clear was taken back: the divider and dimming go, the context usage of the resumed session shows; settles when the conversation is saved. */
	undone: (usage: ContextUsage | null) => void | Promise<void>;
	/** "Could not undo the clear." in the messages. */
	undoFailed: () => void;
	/** An Undo started or ended: the dividers draw their button again. */
	undoChanged: () => void;
	/** The held `/clear` or the held messages changed: the tray draws again. */
	heldChanged: (note?: HeldNote) => void;
	/** A held message's turn: through the send path; never rejects. */
	deliver: (send: HeldSend) => Promise<Delivery>;
	/** What keeps a `/clear` from running now: a background task or an agent runs (it asks first), or a restore is under way; null when nothing does. */
	clearBlock: () => ClearBlock | null;
	/** The held `/clear` could not run: the tab puts its text and the held messages behind it back in the composer, in order with their images, and says why. */
	declined: (cause: Declined, text: string, sends: readonly HeldSend[]) => void;
	/** The agents and background tasks the tab shows running. */
	tasks: () => readonly { taskId: string }[];
	/** A turn runs. */
	turnRunning: () => boolean;
	/** Deny every open permission request of the tab and refuse new ones (true), or accept them again (false); late answers to the denied ones are dropped. */
	denyCards: (on: boolean) => void;
	/** Ask whether to stop the agents and background tasks and clear; true on "Stop and clear". */
	confirmStop: () => Promise<StopAnswer>;
	/** An Undo's CLI replaced the tab's process: what the old one ran is gone. */
	processReplaced: () => void;
}

/** The Undo a flow is running: what it started from, and what the CLI reported. */
interface UndoRun {
	conversation: StoredConversation;
	offer: UndoOffer;
	usage: ContextUsage | null;
	/** The launch generation when it began. */
	generation: number;
	/** The save of the conversation after the record's removal; the sends wait for it. */
	saved: Promise<void> | null;
}

/**
 * One tab's `/clear` (DES-002 Clear transaction): decides whether a clear
 * applies, runs `state/clear-operation` with the CLI's messages, exits and
 * two 15 s timers, carries out its actions, and holds the tab's sends while
 * the operation is open. It is the session's {@link ClearGate}.
 */
export class ClearFlow implements ClearGate {
	private state: ClearState = idleClear();
	private session: ClearSession | null = null;
	private timer: TimerHandle | undefined;
	private waiting: { promise: Promise<void>; resolve: () => void } | null = null;
	private undoState: UndoState = idleUndo();
	private undoTimer: TimerHandle | undefined;
	private undoRun: UndoRun | null = null;
	private holdState: HoldState = idleHold();
	private holdTimer: TimerHandle | undefined;
	private stopState: StopState = idleStop();
	private stopTimer: TimerHandle | undefined;
	/** The `/clear` Stop and clear runs for, as typed, and the process it stops. */
	private stopText = "/clear";
	private stopSession: ClearSession | null = null;
	/** The question to stop the agents and tasks is open (a held `/clear` was released). */
	private asking = false;
	/** A `/clear` is being submitted, from its first question to its hold or request. */
	private submitting = false;
	/** The last turn ended with a message queued behind it, which has not started yet. */
	private queuedBehind = false;
	/** The `/clear` held until the turn ends, as it is drawn. */
	private heldClear: string | null = null;
	/** The messages sent behind a hold, oldest first. */
	private readonly sends: HeldSends;
	private disposed = false;

	constructor(
		private readonly host: ClearFlowHost,
		private readonly timers?: TimerHost,
		private readonly now: () => number = Date.now
	) {
		this.sends = new HeldSends({
			deliver: (send) => this.host.deliver(send),
			changed: (note) => this.guarded(() => this.host.heldChanged(note)),
			gate: () => (this.heldClear !== null ? { kind: "halt" } : this.held() ? { kind: "wait", until: this.held() as Promise<void> } : { kind: "free" }),
		});
	}

	/** A written `/clear` has not completed. */
	get open(): boolean {
		return this.state.phase !== "idle";
	}

	/** The CLI's `conversation_reset` came: what it reports from now on belongs to the clear. */
	get resetSeen(): boolean {
		return this.state.phase !== "idle" && this.state.resetSeen;
	}

	/** Stop and clear stops the agents and tasks, or its question is open (PRD-001.R38). */
	get stopping(): boolean {
		return this.stopState.phase !== "idle" || this.asking;
	}

	/** An Undo has not completed or failed (PRD-001.R38). */
	get undoing(): boolean {
		return this.undoState.phase !== "idle";
	}

	/** Settles when the open clear or Undo has, for a send to wait on; null when none is open. */
	held(): Promise<void> | null {
		return this.waiting?.promise ?? null;
	}

	/** A send made now must wait: a clear or an Undo is open, or a `/clear` is held for the turn's end. */
	blocked(): boolean {
		return this.waiting !== null || this.heldClear !== null;
	}

	/** A send made now is held: something blocks it, or messages already held go before it. */
	holds(): boolean {
		return this.blocked() || this.sends.size > 0;
	}

	/** What the held tray draws. */
	heldView(): HeldView {
		return { clear: this.heldClear, sends: this.sends.view() };
	}

	// --- The held /clear and the held messages (PRD-001.R38) --------------------------

	/**
	 * `/clear` was sent while a turn runs: nothing is written to the CLI
	 * meanwhile, and every later message is held behind it. False when a clear
	 * or an Undo is open or one is already held.
	 */
	holdClear(text: string): boolean {
		if (this.blocked()) return false;
		this.heldClear = text;
		this.dispatchHold({ type: "hold" });
		this.guarded(() => this.host.heldChanged("clear"));
		return true;
	}

	/** "Cancel" on the held `/clear`: it is dropped and the messages behind it go in order. */
	cancelHeld(): void {
		if (this.heldClear === null) return;
		this.guarded(() => this.host.heldChanged("cancelled"));
		this.dispatchHold({ type: "cancel" });
	}

	/** A turn started, or ended (`queued`: a message queued behind it may run next). */
	turnChanged(running: boolean, queued = false): void {
		this.queuedBehind = !running && queued;
		this.dispatchHold(running ? { type: "turn", running } : { type: "turn", running, queued });
		this.dispatchStop({ type: "turn", running, queued });
	}

	/** A message sent behind a hold: kept in its place, sent when the holds end. */
	hold(text: string, images: readonly PendingImage[], context: SendContext | null): void {
		this.sends.add(text, images, context);
	}

	private dispatchHold(input: HoldInput): void {
		const step = reduceHold(this.holdState, input);
		this.holdState = step.state;
		for (const action of step.actions) this.carryOutHold(action);
	}

	private carryOutHold(action: HoldAction): void {
		switch (action.type) {
			case "arm":
				clearTimer(this.holdTimer, this.timers);
				this.holdTimer = setTimer(() => this.dispatchHold({ type: "timeout", timer: action.timer }), action.ms, this.timers);
				break;
			case "disarm":
				clearTimer(this.holdTimer, this.timers);
				this.holdTimer = undefined;
				break;
			case "fire":
				// After the handler of the turn's `result`, so a restart it owed runs first.
				void Promise.resolve().then(() => this.fireHeld());
				break;
			case "drop":
				this.heldClear = null;
				this.guarded(() => this.host.heldChanged());
				this.sends.resume();
				break;
		}
	}

	/** A `/clear` held or replayed from the held messages did not run (`cause`): it and the messages behind it go back to the tab, never on into the old context. */
	decline(cause: Declined, text: string): void {
		const sends = this.sends.take();
		this.guarded(() => this.host.declined(cause, text, sends));
		this.guarded(() => this.host.heldChanged());
	}

	/** The turn ended: the held `/clear` runs, or is returned with the messages behind it; either way the queue goes on. */
	private fireHeld(): void {
		const text = this.heldClear;
		if (this.disposed || text === null) return;
		this.heldClear = null;
		try {
			this.guarded(() => this.host.heldChanged());
			const block = this.guarded(() => this.host.clearBlock()) ?? null;
			if (block === "tasks") this.askToStop(text);
			else if (block) this.decline(block, text);
			else this.guarded(() => this.request());
		} finally {
			this.sends.resume();
		}
	}

	// --- Stop and clear (PRD-001.R38, DES-002 Stop and clear) -----------------------------

	/**
	 * "Stop and clear" was pressed for a `/clear` sent now or replayed from the
	 * held messages: the sends are held, the cards denied, every task stopped,
	 * the CLI interrupted, and the clear runs once nothing runs. False when a
	 * clear, an Undo, another stop or a held `/clear` is under way.
	 */
	stopAndClear(text: string): boolean {
		if (this.disposed || this.blocked() || this.open || this.undoing || this.stopping) return false;
		this.beginStop(text);
		return true;
	}

	/** A held `/clear` was released while agents or tasks run: ask first; the messages behind it wait for the answer. */
	private askToStop(text: string): void {
		this.asking = true;
		this.holdSends();
		const answered = (answer: StopAnswer): void => {
			// The tab closed meanwhile.
			if (!this.asking) return;
			this.asking = false;
			if (answer === "stop") return this.beginStop(text);
			if (answer === "clear") return this.plainClear(text);
			this.decline("cancelled", text);
			this.releaseSends();
		};
		let question: Promise<StopAnswer>;
		try {
			question = this.host.confirmStop();
		} catch (err) {
			console.error("AI Agent Panel: a clear's host call failed", err);
			question = Promise.resolve("cancel");
		}
		question.then(answered, () => answered("cancel"));
	}

	/** Nothing is left to stop: the `/clear` takes the plain route, held while a turn runs, else sent; the messages behind it follow it. */
	private plainClear(text: string): void {
		const waiting = this.waiting;
		this.waiting = null;
		try {
			// A turn read that throws is not "idle", and a clear that throws drains nothing: the tail goes back unsent.
			if (this.host.turnRunning()) {
				if (!this.holdClear(text)) this.decline("cancelled", text);
				return;
			}
			this.request();
		} catch (err) {
			console.error("AI Agent Panel: a clear failed to start", err);
			this.decline("stop-failed", text);
		} finally {
			waiting?.resolve();
		}
	}

	/**
	 * A `/clear` submission starts (typed, or replayed from the held messages):
	 * false while another is under way, its question open included, or while a
	 * stop runs, so a second one is answered no even if the tasks finished
	 * meanwhile. `leaveClear` ends it.
	 */
	enterClear(): boolean {
		if (this.disposed || this.submitting || this.stopping) return false;
		this.submitting = true;
		return true;
	}

	leaveClear(): void {
		this.submitting = false;
	}

	/** Stops the tab's CLI's agents and tasks; with no process there is nothing to stop and the clear runs as with none. */
	private beginStop(text: string): void {
		this.holdSends();
		this.stopText = text;
		try {
			const session = this.host.session();
			if (!session?.running) {
				this.runStopClear();
				return;
			}
			this.stopSession = session;
			const taskIds = this.host.tasks().map((task) => task.taskId);
			this.dispatchStop({ type: "begin", generation: session.generation, taskIds, turn: this.host.turnRunning(), queued: this.queuedBehind });
		} catch (err) {
			this.failStop(err);
		}
	}

	/** A host call the stop depends on threw: nothing is cleared, and the held messages go back to the tab. */
	private failStop(err: unknown): void {
		console.error("AI Agent Panel: a stop and clear failed", err);
		this.dispatchStop({ type: "stop" });
		this.endStop();
		this.decline("stop-failed", this.stopText);
		this.releaseSends();
	}

	/**
	 * Nothing seems to run: the last look, taken from the tab itself. The
	 * stop's own process must still run as it began (a CLI exit also ends the
	 * turn, which reads as quiet), and no turn, queued message or task may
	 * have begun since the last message.
	 */
	private look(): void {
		if (this.disposed || this.stopState.phase === "idle") return;
		try {
			const session = this.stopSession;
			const alive = session !== null && session.running && session.generation === this.stopState.generation;
			this.dispatchStop({
				type: "looked",
				alive,
				turn: this.host.turnRunning(),
				taskIds: this.host.tasks().map((task) => task.taskId),
			});
		} catch (err) {
			this.failStop(err);
		}
	}

	private dispatchStop(input: StopInput): void {
		const step = reduceStop(this.stopState, input);
		this.stopState = step.state;
		for (const action of step.actions) this.carryOutStop(action);
	}

	private carryOutStop(action: StopAction): void {
		const session = this.stopSession;
		switch (action.type) {
			case "deny":
				this.guarded(() => this.host.denyCards(true));
				break;
			case "stopTask":
				// The reply is no report that the task ended; the tasks' own messages are.
				this.write(() => session?.stopTask(action.taskId));
				break;
			case "interrupt":
				this.write(() => session?.interrupt());
				break;
			case "arm":
				clearTimer(this.stopTimer, this.timers);
				this.stopTimer = setTimer(() => this.dispatchStop({ type: "timeout", timer: action.timer }), action.ms, this.timers);
				break;
			case "disarm":
				clearTimer(this.stopTimer, this.timers);
				this.stopTimer = undefined;
				break;
			case "settle":
				// After the handler of the turn's `result`, so a restart it owed runs first.
				void Promise.resolve().then(() => this.look());
				break;
			case "clear":
				// The cards stay denied until the clear is under way; nothing runs between the look and the request.
				this.runStopClear();
				this.endStop();
				break;
			case "fail":
				this.endStop();
				this.decline("stop-failed", this.stopText);
				this.releaseSends();
				break;
		}
	}

	/** The write to the CLI is not awaited; a refusal proves nothing and the bound decides. */
	private write(call: () => Promise<void> | undefined): void {
		try {
			call()?.catch(() => undefined);
		} catch {
			// A process that is gone ends the stop through its exit.
		}
	}

	/** The stop is over: new permission requests are taken again. */
	private endStop(): void {
		this.stopSession = null;
		this.guarded(() => this.host.denyCards(false));
	}

	/** Nothing runs: the clear, as for a `/clear` with the CLI idle; the sends go when nothing opened. */
	private runStopClear(): void {
		if (this.disposed) return;
		try {
			this.request();
		} catch (err) {
			// Fail closed: the held messages never drain without a clear.
			console.error("AI Agent Panel: a clear failed to start", err);
			this.decline("stop-failed", this.stopText);
			this.releaseSends();
			return;
		}
		if (!this.open) this.releaseSends();
	}

	/** `/clear` alone was sent (PRD-001.R38). */
	request(): void {
		const host = this.host;
		if (this.open || this.undoing || this.stopping) return;
		if (host.unstartedBranch()) {
			host.dropBranch();
			return;
		}
		const conversation = host.conversation();
		if (!conversation || !clearDue(conversation.messages)) return;
		const session = host.session();
		const oldId = session?.sessionId ?? host.resumeId();
		if (!session?.running) {
			this.complete(oldId, null);
			return;
		}
		this.session = session;
		const heldBefore = this.waiting !== null;
		this.holdSends();
		try {
			this.dispatch({ type: "begin", generation: session.generation, oldId, at: this.now(), resolved: host.resolvedModels() });
		} catch (err) {
			// A clear that threw part-way is dropped whole: the tab is as it was, and a later /clear works.
			clearTimer(this.timer, this.timers);
			this.timer = undefined;
			this.state = idleClear();
			this.session = null;
			if (!heldBefore) this.releaseSends();
			throw err;
		}
	}

	message(generation: number, msg: StreamMessage): "consume" | "pass" {
		// Stop and clear reads the tasks' messages and consumes none of them.
		if (this.stopState.phase !== "idle") {
			const task = taskSignal(msg);
			if (task) this.dispatchStop({ type: "message", generation, signal: task });
		}
		const signal = classify(msg);
		if (!signal) return "pass";
		return this.dispatch({ type: "message", generation, message: signal, at: this.now(), inForce: this.session?.effective }) ? "consume" : "pass";
	}

	closed(generation: number): void {
		// A message queued behind that process's turn went with it.
		this.queuedBehind = false;
		this.dispatch({ type: "closed", generation });
		this.dispatchStop({ type: "closed", generation });
	}

	/** The tab closes: nothing more is recorded, an Undo's CLI is stopped, and a waiting send is let go. */
	dispose(): void {
		this.disposed = true;
		this.dispatchHold({ type: "stop" });
		this.dispatchStop({ type: "stop" });
		this.asking = false;
		this.stopSession = null;
		this.heldClear = null;
		this.sends.dispose();
		this.dispatchUndo({ type: "stop" });
		clearTimer(this.timer, this.timers);
		this.timer = undefined;
		this.state = idleClear();
		this.session = null;
		this.releaseSends();
	}

	/** Feeds one event to the machine and carries out its actions; true when the CLI's message is the clear's own. */
	private dispatch(input: ClearInput): boolean {
		const step = reduceClear(this.state, input);
		this.state = step.state;
		const session = this.session;
		const generation = step.state.generation;
		let consumed = false;
		let unwritten = false;
		// A replacement process or none: its own init shows the mode.
		let replaced = false;
		for (const action of step.actions) {
			switch (action.type) {
				case "write":
					unwritten = !session?.writeClear();
					break;
				case "arm":
					this.arm(action);
					break;
				case "disarm":
					clearTimer(this.timer, this.timers);
					this.timer = undefined;
					break;
				case "consume":
					consumed = true;
					break;
				case "commit":
					this.host.recordSession(action.newId);
					this.complete(action.oldId, action.newId);
					break;
				case "fallback":
					replaced = true;
					session?.abandon();
					this.complete(action.oldId, null);
					break;
				case "reapply":
					this.reapply(session, generation, action);
					break;
				case "applied":
					// A pick still pending shows its own mode when the CLI accepts it.
					this.host.reapplied({ permissionMode: this.host.picking() ? undefined : action.permissionMode, model: action.model });
					break;
				case "restart":
					replaced = true;
					if (session?.generation === generation) session.restart();
					break;
				case "release":
					if (session && !replaced && !this.host.picking()) this.host.released(session.effective);
					this.session = null;
					this.releaseSends();
					// The clear's answer has arrived: its divider may offer Undo now.
					this.guarded(() => this.host.undoChanged());
					break;
			}
		}
		// No process took the write: it ended as an exit would.
		if (unwritten) this.dispatch({ type: "closed", generation });
		return consumed;
	}

	/** The answer, or the failure, comes back as an event of the process it was asked of, never inside the dispatch that asked. */
	private reapply(session: ClearSession | null, generation: number, values: Effective): void {
		const answer = (ok: boolean, modeSkipped = false) => this.dispatch({ type: "reapplied", generation, ok, modeSkipped, at: this.now() });
		// A key present with no value sets Default for the model.
		const keys: Effective = {};
		if ("permissionMode" in values) keys.permissionMode = values.permissionMode;
		if ("model" in values) keys.model = values.model;
		const sent = session ? session.reapply(keys) : Promise.reject(new Error("no session"));
		sent.then(
			(result) => answer(true, !!result?.modeSkipped),
			() => answer(false)
		);
	}

	/** A pick of a mode or model was accepted by the CLI of this process (DES-002 Clear transaction). */
	picked(generation: number, values: Effective): void {
		this.dispatch({ type: "picked", generation, ...values });
	}

	private arm(action: Extract<ClearAction, { type: "arm" }>): void {
		clearTimer(this.timer, this.timers);
		this.timer = setTimer(() => this.dispatch({ type: "timeout", timer: action.timer, at: this.now() }), action.ms, this.timers);
	}

	/** The clear is done: its record, then the resume id with it, together. */
	private complete(oldId: string | null, newId: string | null): void {
		const conversation = this.host.conversation();
		if (!conversation) return;
		const at = this.now();
		// The command as typed, like any panel command's echo, then the boundary.
		this.host.record({ kind: "user", text: "/clear" });
		this.host.record(clearRecord(at, oldId ?? undefined));
		conversation.sessionId = newId;
		this.host.cleared(newId);
		this.host.onCleared(at);
	}

	private holdSends(): void {
		// Stop and clear holds the sends before its clear holds them again: one hold, released once.
		if (this.waiting) return;
		let release!: () => void;
		this.waiting = { promise: new Promise<void>((resolve) => (release = resolve)), resolve: release };
	}

	private releaseSends(): void {
		const waiting = this.waiting;
		this.waiting = null;
		waiting?.resolve();
	}

	// --- Undo (PRD-001.R38, DES-002 Clear transaction) --------------------------------

	/** The Undo the conversation offers now, if any: its latest clear while no message to Claude Code follows it. */
	offer(): UndoOffer | null {
		const conversation = this.host.conversation();
		return conversation ? undoOffer(conversation.messages, this.host.foreignSession) : null;
	}

	/**
	 * "Undo" on the latest clear's divider: a CLI beside the tab's resumes the
	 * session the clear ended and is asked for its context usage; on a parsed
	 * success it becomes the tab's, else the tab, the divider and the clear's
	 * record stay as they were. Sends are held throughout.
	 */
	undo(): void {
		if (this.undoing || this.block() !== null) return;
		const conversation = this.host.conversation();
		const offer = this.offer();
		if (!conversation || !offer || offer.foreign) return;
		this.undoRun = { conversation, offer, usage: null, generation: this.host.launchGeneration(), saved: null };
		this.holdSends();
		this.dispatchUndo({ type: "begin" });
	}

	/** Why an Undo cannot start or be adopted now (`undoBlock`). */
	private block(): UndoBlock | null {
		return undoBlock({ ...this.host.facts(), clearOpen: this.open || this.stopping });
	}

	/** The Undo button's state on the latest clear's divider: null for none, also while the clear is open. */
	undoView(): UndoButton | null {
		return undoState(this.offer(), this.undoing, this.block());
	}

	/** Carries out one host call; a throw is logged, and the actions after it still run, the release above all. */
	private guarded<T>(call: () => T): T | undefined {
		try {
			return call();
		} catch (err) {
			console.error("AI Agent Panel: a clear's host call failed", err);
			return undefined;
		}
	}

	private dispatchUndo(input: UndoInput): void {
		const before = this.undoState.phase;
		const step = reduceUndo(this.undoState, input);
		this.undoState = step.state;
		let adopt: number | null = null;
		for (const action of step.actions) {
			switch (action.type) {
				case "start":
					this.startUndo(action.run);
					break;
				case "arm":
					clearTimer(this.undoTimer, this.timers);
					this.undoTimer = setTimer(() => this.dispatchUndo({ type: "timeout", timer: action.timer }), action.ms, this.timers);
					break;
				case "disarm":
					clearTimer(this.undoTimer, this.timers);
					this.undoTimer = undefined;
					break;
				case "adopt":
					adopt = action.run;
					break;
				case "stop":
					this.guarded(() => this.host.stopUndo());
					break;
				case "complete":
					if (this.undoRun) this.undoRun.saved = Promise.resolve(this.guarded(() => this.finishUndo())).catch((err) => console.error("AI Agent Panel: saving the Undo failed", err));
					break;
				case "fail":
					this.guarded(() => this.host.undoFailed());
					break;
				case "release": {
					// The sends wait for the Undo's save, so a send after it cannot be written before the record is gone.
					// A save that stalls lets them go after UNDO_SAVE_BOUND_MS; either way only this hold is released.
					const saved = this.undoRun?.saved ?? null;
					const hold = this.waiting;
					this.undoRun = null;
					if (saved && hold) {
						let timer: TimerHandle | undefined;
						const free = () => {
							clearTimer(timer, this.timers);
							if (this.waiting === hold) this.waiting = null;
							hold.resolve();
						};
						timer = setTimer(free, UNDO_SAVE_BOUND_MS, this.timers);
						void saved.then(free);
					} else this.releaseSends();
					break;
				}
			}
		}
		// The tab answers at once, outside the step that asked.
		if (adopt !== null) this.dispatchUndo({ type: "adopted", run: adopt, ok: this.guarded(() => this.adopt()) ?? false });
		if ((before === "idle") !== (this.undoState.phase === "idle")) this.guarded(() => this.host.undoChanged());
	}

	/** Start the CLI and, once it runs, ask it; its end before the answer, in any way, is an event of this run. */
	private startUndo(run: number): void {
		const sessionId = this.undoRun?.offer.sessionId;
		if (!sessionId) return;
		const failed = () => this.dispatchUndo({ type: "failed", run });
		const gate: ClearGate = {
			message: (_generation, msg) => {
				if (undoFailure(msg)) failed();
				// Nothing the CLI says reaches the tab before it is the tab's.
				return "consume";
			},
			closed: failed,
			picked: () => {},
		};
		this.host.startUndo(sessionId, gate).then(
			(started) => {
				// An Undo that ended while the CLI was starting stopped it with the run.
				if (!started || this.undoState.run !== run) return failed();
				this.host.probeUndo().then(
					(usage) => {
						if (this.undoState.run === run && this.undoRun) this.undoRun.usage = usage;
						this.dispatchUndo({ type: "replied", run });
					},
					failed
				);
			},
			failed
		);
	}

	/**
	 * The CLI answered: the tab takes it over only if nothing it was started
	 * for has changed: the same conversation, the same latest clear with no
	 * message after it, the session still this device's, and the tab's launch
	 * settings (the host's check).
	 */
	private adopt(): boolean {
		const run = this.undoRun;
		if (!run) return false;
		const offer = this.offer();
		const adoptable = mayAdopt({
			block: this.block(),
			sameConversation: this.host.conversation() === run.conversation,
			sameOffer: !!offer && !offer.foreign && offer.record === run.offer.record && offer.sessionId === run.offer.sessionId,
			launchGeneration: this.host.launchGeneration(),
			startedGeneration: run.generation,
		});
		if (!adoptable || offer === null || !this.host.adoptUndo(offer.sessionId)) return false;
		this.queuedBehind = false;
		this.guarded(() => this.host.processReplaced());
		return true;
	}

	/** The Undo is adopted: the clear's record goes and the ended id becomes the conversation's, together; settles when saved. */
	private finishUndo(): void | Promise<void> {
		const run = this.undoRun;
		if (!run) return;
		const at = run.conversation.messages.lastIndexOf(run.offer.record as StoredMessage);
		if (at >= 0) run.conversation.messages.splice(at, 1);
		run.conversation.sessionId = run.offer.sessionId;
		return this.host.undone(run.usage);
	}
}
