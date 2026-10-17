/**
 * "Stop and clear" as a state machine (PRD-001.R38, ADR-018 Stop and clear;
 * DES-002 Stop and clear): events in, actions out, nothing else.
 * `tab/clear-flow` feeds it the CLI's task messages, the turn's start and end,
 * the process's exit and its timer, and carries out the actions. When nothing
 * seems to run it asks for one last look (`settle`), and clears only if that
 * look, taken from the tab just before the clear, still finds the process
 * alive, no turn, no queued message and every task ended, by a status known to
 * be terminal. A reply to a stop request is no such report, nor is a task
 * missing from a list, an unknown status or an exit. Tested in plain Node
 * (tests/state-stop-operation.test.mjs).
 */

import type { BackgroundTask, StreamMessage } from "../protocol/types";
import { taskEvent, type TaskEvent } from "./stream";

/** How long the CLI has to report every task ended, counted from the first stop request. */
export const STOP_MS = 15_000;

/** A `task_notification` status that says the task ended. */
const NOTIFIED_ENDED = new Set(["stopped", "completed", "failed"]);
/** A `task_updated` status that says the task ended. */
const UPDATED_ENDED = new Set(["killed", "completed", "failed"]);

/** A task message as the stop reads it. */
export type TaskSignal =
	/** These tasks exist or run: `task_started`, `background_tasks_changed`, a status that is no end. */
	| { kind: "seen"; tasks: BackgroundTask[] }
	/** This task ended, by a status that says so. */
	| { kind: "ended"; taskId: string };

const bare = (taskId: string): BackgroundTask => ({ taskId, status: "running" });

/** The stop's reading of a parsed task message (`state/stream`); null when it names no task. */
export function signalOf(event: TaskEvent): TaskSignal | null {
	switch (event.type) {
		case "started":
			return { kind: "seen", tasks: [event.task] };
		case "running":
			return event.tasks.length > 0 ? { kind: "seen", tasks: event.tasks } : null;
		case "updated":
			if (event.status && UPDATED_ENDED.has(event.status)) return { kind: "ended", taskId: event.taskId };
			// Any other status, known or not, is a task that runs.
			return event.status ? { kind: "seen", tasks: [bare(event.taskId)] } : null;
		case "ended": {
			if (!event.taskId) return null;
			const status = event.report.status;
			return status && NOTIFIED_ENDED.has(status) ? { kind: "ended", taskId: event.taskId } : { kind: "seen", tasks: [bare(event.taskId)] };
		}
	}
}

/** The stop's reading of a stream message; null for a message that names no task. */
export function taskSignal(message: StreamMessage | null | undefined): TaskSignal | null {
	if (!message || typeof message !== "object") return null;
	const raw = message as Record<string, unknown>;
	if (raw.type !== "system") return null;
	const event = taskEvent(raw.subtype, raw);
	return event && event !== "skip" ? signalOf(event) : null;
}

/** A task the CLI process named: running until a message ends it, with what was last known of it. */
export interface LedgerEntry {
	state: "running" | "ended";
	task: BackgroundTask;
}

/** Every task a CLI process named, by id (a Map, so an id such as "constructor" or "__proto__" is a task like any other); an end is final. */
export type TaskLedger = ReadonlyMap<string, LedgerEntry>;

export const emptyLedger = (): TaskLedger => new Map();

const sameTask = (known: BackgroundTask, task: BackgroundTask): boolean =>
	(Object.keys(task) as (keyof BackgroundTask)[]).every((key) => known[key] === task[key]);

/** The ledger after one task message. */
export function ledgerAfter(ledger: TaskLedger, signal: TaskSignal): TaskLedger {
	if (signal.kind === "ended") {
		const known = ledger.get(signal.taskId);
		if (known?.state === "ended") return ledger;
		return new Map(ledger).set(signal.taskId, { state: "ended", task: known?.task ?? bare(signal.taskId) });
	}
	let next: Map<string, LedgerEntry> | null = null;
	for (const task of signal.tasks) {
		const known = (next ?? ledger).get(task.taskId);
		// An end is final; what is known of a running task grows.
		if (known?.state === "ended") continue;
		if (known && sameTask(known.task, task)) continue;
		next ??= new Map(ledger);
		next.set(task.taskId, { state: "running", task: known ? { ...known.task, ...task } : task });
	}
	return next ?? ledger;
}

/** The ids the ledger holds as running. */
export function runningIn(ledger: TaskLedger): string[] {
	return [...ledger].filter(([, entry]) => entry.state === "running").map(([taskId]) => taskId);
}

/**
 * The tasks a `/clear` must stop: those the ledger holds running, with what
 * was last known of each (so an agent the run bar dropped still counts as
 * one), updated by the run bar's row while it has one.
 */
export function unfinishedTasks(ledger: TaskLedger, shown: readonly BackgroundTask[]): BackgroundTask[] {
	return [...ledger]
		.filter(([, entry]) => entry.state === "running")
		.map(([taskId, entry]) => ({ ...entry.task, ...shown.find((task) => task.taskId === taskId) }));
}

export interface StopState {
	phase: "idle" | "stopping";
	/** The process the stop belongs to. */
	generation: number;
	/** Every task the stop knows, by id. */
	tasks: TaskLedger;
	/** A turn runs. */
	turn: boolean;
	/** The turn ended with a message queued behind it, which will run next. */
	queued: boolean;
	/** The last look was asked for and has not come back. */
	pending: boolean;
	/** The armed timer's id, 0 when none. */
	timer: number;
	/** The last timer id handed out. */
	seq: number;
}

export type StopInput =
	/** `taskIds`: the tasks the tab holds running; `turn`: a turn runs; `queued`: a message queued behind a turn that ended will run next. */
	| { type: "begin"; generation: number; taskIds: readonly string[]; turn: boolean; queued?: boolean }
	| { type: "message"; generation: number; signal: TaskSignal }
	/** The tab's turn started or ended (`queued`: a message queued behind it runs next). */
	| { type: "turn"; running: boolean; queued?: boolean }
	/** The last look: whether the stop's process still runs as it did, whether a turn or a queued message exists, the tasks the tab holds running. */
	| { type: "looked"; alive: boolean; turn: boolean; taskIds: readonly string[] }
	/** The process ended. */
	| { type: "closed"; generation: number }
	| { type: "timeout"; timer: number }
	/** The tab closes: nothing more happens. */
	| { type: "stop" };

export type StopAction =
	/** Deny every open permission request of the tab and drop its late answers. */
	| { type: "deny" }
	| { type: "stopTask"; taskId: string }
	| { type: "interrupt" }
	| { type: "arm"; timer: number; ms: number }
	| { type: "disarm" }
	/** Nothing seems to run: take the last look and send it as `looked`. */
	| { type: "settle" }
	/** The last look found nothing running: clear. */
	| { type: "clear" }
	/** The stop did not finish: nothing is cleared. */
	| { type: "fail" };

export function idleStop(): StopState {
	return { phase: "idle", generation: 0, tasks: emptyLedger(), turn: false, queued: false, pending: false, timer: 0, seq: 0 };
}

interface Step {
	state: StopState;
	actions: StopAction[];
}

const same = (state: StopState): Step => ({ state, actions: [] });
const done = (state: StopState, actions: StopAction[]): Step => ({
	state: { ...state, phase: "idle", timer: 0, tasks: emptyLedger(), turn: false, queued: false, pending: false },
	actions,
});

/** Whether nothing the stop waits for remains. */
function quiet(state: StopState): boolean {
	return !state.turn && !state.queued && runningIn(state.tasks).length === 0;
}

/** Asks for the last look once the state is quiet; otherwise the stop goes on. */
function settle(state: StopState, before: StopAction[]): Step {
	if (!quiet(state) || state.pending) return { state, actions: before };
	return { state: { ...state, pending: true }, actions: [...before, { type: "settle" }] };
}

export function reduceStop(state: StopState, input: StopInput): Step {
	if (input.type === "begin") {
		if (state.phase !== "idle") return same(state);
		const tasks = ledgerAfter(emptyLedger(), { kind: "seen", tasks: input.taskIds.map(bare) });
		const timer = state.seq + 1;
		const next: StopState = { ...idleStop(), phase: "stopping", generation: input.generation, tasks, turn: input.turn, queued: input.queued === true, timer, seq: timer };
		// Every stop goes before the interrupt, so an interrupt that ends a subagent cannot race its stop.
		return settle(next, [
			{ type: "deny" },
			...runningIn(tasks).map((taskId): StopAction => ({ type: "stopTask", taskId })),
			{ type: "interrupt" },
			{ type: "arm", timer, ms: STOP_MS },
		]);
	}
	if (state.phase === "idle") return same(state);
	switch (input.type) {
		case "stop":
			return done(state, [{ type: "disarm" }]);
		case "timeout":
			return input.timer === state.timer ? done(state, [{ type: "fail" }]) : same(state);
		case "closed":
			return input.generation === state.generation ? done(state, [{ type: "disarm" }, { type: "fail" }]) : same(state);
		case "turn": {
			const queued = !input.running && input.queued === true;
			if (input.running === state.turn && queued === state.queued) return same(state);
			// A turn that starts meanwhile is interrupted too.
			return settle({ ...state, turn: input.running, queued }, input.running && !state.turn ? [{ type: "interrupt" }] : []);
		}
		case "looked": {
			if (!state.pending) return same(state);
			if (!input.alive) return done(state, [{ type: "disarm" }, { type: "fail" }]);
			// What the tab holds running and the stop did not know is stopped too; an end stays final.
			const tasks = new Map(state.tasks);
			const actions: StopAction[] = [];
			for (const taskId of input.taskIds) {
				if (tasks.has(taskId)) continue;
				tasks.set(taskId, { state: "running", task: bare(taskId) });
				actions.push({ type: "stopTask", taskId });
			}
			if (input.turn && !state.turn) actions.push({ type: "interrupt" });
			const next: StopState = { ...state, tasks, turn: input.turn, pending: false };
			if (quiet(next)) return done(next, [{ type: "disarm" }, { type: "clear" }]);
			return { state: next, actions };
		}
		case "message": {
			if (input.generation !== state.generation) return same(state);
			const signal = input.signal;
			const tasks = ledgerAfter(state.tasks, signal);
			if (tasks === state.tasks) return same(state);
			// An end is final; a task that starts meanwhile is stopped too.
			if (signal.kind === "ended") return settle({ ...state, tasks }, []);
			const fresh = signal.tasks.filter((task) => !state.tasks.has(task.taskId));
			return { state: { ...state, tasks }, actions: fresh.map((task): StopAction => ({ type: "stopTask", taskId: task.taskId })) };
		}
	}
}
