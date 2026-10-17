/**
 * The in-process `/clear` as a state machine (DES-002 Clear transaction):
 * events in, actions out, nothing else. `tab/clear-flow` feeds it the CLI's
 * messages, its exits and its timers, and carries out the actions. An event
 * of another process generation, or of a timer that is no longer the armed
 * one, changes nothing. Tested in plain Node (tests/state-clear-operation.test.mjs).
 */

import { isLocalCommandOutput, type StreamMessage, type UserMessage } from "../protocol/types";
import { isSessionId } from "./session-id";
import { resolvedId } from "../models";

/** How long the CLI has to start the new session after `/clear` is written, its own turn not counted. */
export const COMMIT_MS = 15_000;
/** How long the CLI has to answer after the new session started. */
export const RESULT_MS = 15_000;
/** How long the CLI has to answer the set-again of a mode or model it did not keep. */
export const REAPPLY_MS = 15_000;
/** How often the picks are sent again because a newer pick was accepted meanwhile. */
const MAX_ROUNDS = 3;

/** The picks a CLI runs with, as it reports them. */
export interface Effective {
	permissionMode?: string;
	model?: string;
}

/** An alias or a model id as the id it names, through what the CLI has resolved aliases to. */
const resolve = (model: string, resolved: Record<string, string>): string => resolvedId(resolved, model) ?? model;

/**
 * What the new session lost of the picks to keep (`target`, PRD-001.R38).
 * The mode is lost unless the session reports exactly it: a missing, empty or
 * other report fails closed. The model is lost when both are known and
 * differ, compared through `resolved` so an alias equals the id it resolved
 * to. Null when nothing was lost.
 */
export function lostPicks(target: Effective, reported: Effective, resolved: Record<string, string> = {}): Effective | null {
	const lost: Effective = {};
	if (target.permissionMode && reported.permissionMode !== target.permissionMode) lost.permissionMode = target.permissionMode;
	if (target.model && reported.model && resolve(target.model, resolved) !== resolve(reported.model, resolved)) lost.model = target.model;
	return lost.permissionMode || lost.model ? lost : null;
}

/** A stream message as the clear reads it; null when it concerns the clear in no way. */
export type ClearSignal =
	| { kind: "reset" }
	| { kind: "init"; sessionId: string | undefined; model?: string; permissionMode?: string }
	| { kind: "result"; sessionId?: string; numTurns?: number }
	/** The CLI reports its permission mode (`system/status`). */
	| { kind: "status"; permissionMode: string }
	| { kind: "activity" };

export function classify(message: StreamMessage | null | undefined): ClearSignal | null {
	if (!message || typeof message !== "object") return null;
	const raw = message as Record<string, unknown>;
	switch (raw.type) {
		case "conversation_reset":
			return raw.trigger === "clear" ? { kind: "reset" } : null;
		case "system": {
			if (raw.subtype === "status") return typeof raw.permissionMode === "string" ? { kind: "status", permissionMode: raw.permissionMode } : null;
			if (raw.subtype !== "init") return null;
			const signal: ClearSignal = { kind: "init", sessionId: typeof raw.session_id === "string" ? raw.session_id : undefined };
			if (typeof raw.model === "string") signal.model = raw.model;
			if (typeof raw.permissionMode === "string") signal.permissionMode = raw.permissionMode;
			return signal;
		}
		case "result": {
			const signal: ClearSignal = { kind: "result" };
			if (typeof raw.session_id === "string") signal.sessionId = raw.session_id;
			if (typeof raw.num_turns === "number") signal.numTurns = raw.num_turns;
			return signal;
		}
		case "assistant":
		case "stream_event":
			return { kind: "activity" };
		case "user":
			return isLocalCommandOutput(raw as unknown as UserMessage) ? null : { kind: "activity" };
		default:
			return null;
	}
}

export interface ClearState {
	/** `committing`: `/clear` is written, the new session not yet; `settling`: it started, its answer is awaited; `reapplying`: the picks it lost are set again. */
	phase: "idle" | "committing" | "settling" | "reapplying";
	generation: number;
	/** The session the clear ends: the last reported, or the launch resume id; null when none is known. */
	oldId: string | null;
	newId: string | null;
	/** The mode and model to keep: in force just before the reset, then each pick accepted after it. */
	target: Effective;
	/** What the CLI has resolved aliases to. */
	resolved: Record<string, string>;
	/** What the new session runs: its init's report, then its status reports and each pick accepted after it. */
	reported: Effective;
	/** The picks being set again, while `reapplying`, and how many times they were sent. */
	applying: Effective | null;
	rounds: number;
	/** The CLI's `conversation_reset` came. */
	resetSeen: boolean;
	/** The CLI runs a turn of its own before it reaches the queued `/clear`; the deadline is paused. */
	ownTurn: boolean;
	/** That turn has not ended yet; its result may still come after the reset, and it is no clear's. */
	turnOpen: boolean;
	/** The clear's own result came while that turn's was still outstanding: sends wait for the turn's. */
	ackSeen: boolean;
	/** Time of the commit window already used. */
	elapsedMs: number;
	armedAt: number;
	/** The armed timer's id, 0 when none. */
	timer: number;
	/** The last timer id handed out. */
	seq: number;
}

export type ClearInput =
	| { type: "begin"; generation: number; oldId: string | null; at: number; resolved?: Record<string, string> }
	/** `inForce` is what the CLI ran with when the message reached the gate, before the session took it in. */
	| { type: "message"; generation: number; message: ClearSignal; at: number; inForce?: Effective }
	/** The user's pick of a mode or model was accepted by the CLI. */
	| { type: "picked"; generation: number; permissionMode?: string; model?: string }
	| { type: "closed"; generation: number }
	| { type: "timeout"; timer: number; at: number }
	/** The CLI's answer to the set-again: taken, or refused or the process ended. */
	/** `modeSkipped`: the mode was not sent (Bypass while its setting is off); the target then follows what the CLI reports. */
	| { type: "reapplied"; generation: number; ok: boolean; modeSkipped?: boolean; at?: number };

export type ClearAction =
	| { type: "write" }
	| { type: "arm"; timer: number; ms: number }
	| { type: "disarm" }
	/** The CLI's own message is the clear's and goes no further. */
	| { type: "consume" }
	| { type: "commit"; oldId: string | null; newId: string; model?: string; permissionMode?: string }
	/** No new session: complete the clear without a process. */
	| { type: "fallback"; oldId: string | null }
	/** Set the mode and model the new session lost again. */
	| { type: "reapply"; permissionMode?: string; model?: string }
	/** The CLI took them: the tab shows them again. */
	| { type: "applied"; permissionMode?: string; model?: string }
	/** Restart the CLI resuming the new session. */
	| { type: "restart"; sessionId: string }
	/** Let the held sends go. */
	| { type: "release" };

export function idleClear(): ClearState {
	return { phase: "idle", generation: 0, oldId: null, newId: null, target: {}, resolved: {}, reported: {}, applying: null, rounds: 0, resetSeen: false, ownTurn: false, turnOpen: false, ackSeen: false, elapsedMs: 0, armedAt: 0, timer: 0, seq: 0 };
}

interface Step {
	state: ClearState;
	actions: ClearAction[];
}

const same = (state: ClearState): Step => ({ state, actions: [] });
const finish = (state: ClearState, actions: ClearAction[]): Step => ({ state: { ...state, phase: "idle", timer: 0, ownTurn: false }, actions });

export function reduceClear(state: ClearState, input: ClearInput): Step {
	if (input.type === "begin") {
		if (state.phase !== "idle") return same(state);
		const timer = state.seq + 1;
		return {
			state: { ...idleClear(), phase: "committing", generation: input.generation, oldId: input.oldId, resolved: input.resolved ?? {}, elapsedMs: 0, armedAt: input.at, timer, seq: timer },
			actions: [{ type: "write" }, { type: "arm", timer, ms: COMMIT_MS }],
		};
	}
	if (state.phase === "idle") return same(state);
	if (input.type === "timeout") {
		if (input.timer !== state.timer) return same(state);
		return finish(state, [end(state), { type: "release" }]);
	}
	if (input.generation !== state.generation) return same(state);
	if (input.type === "closed") return finish(state, [{ type: "disarm" }, end(state), { type: "release" }]);
	if (input.type === "picked") {
		const target = { ...state.target };
		const reported = { ...state.reported };
		// Before the new session's init the pick may be one the reset undid; after it, the session runs it.
		const running = state.phase !== "committing";
		for (const key of ["permissionMode", "model"] as const) {
			// A key present with no value is the Default pick.
			if (!(key in input)) continue;
			const value = input[key];
			target[key] = value;
			if (running) reported[key] = value;
		}
		return same({ ...state, target, reported });
	}
	if (input.type === "reapplied") {
		if (state.phase !== "reapplying" || !state.applying) return same(state);
		if (!input.ok) return finish(state, [{ type: "disarm" }, end(state), { type: "release" }]);
		// The CLI took what was sent; a pick accepted since may be newer than it.
		const sent = { ...state.applying };
		let target = state.target;
		if (input.modeSkipped) {
			delete sent.permissionMode;
			target = { ...target };
			if (state.reported.permissionMode) target.permissionMode = state.reported.permissionMode;
			else delete target.permissionMode;
		}
		const reported = { ...state.reported, ...sent };
		let stale = lostPicks(target, reported, state.resolved);
		// A Default pick since a pinned model was sent: the pinned one is undone.
		if (sent.model !== undefined && "model" in target && target.model === undefined) stale = { ...stale, model: undefined };
		if (stale && state.rounds < MAX_ROUNDS) return reapply({ ...state, reported }, input.at ?? 0, stale, [{ type: "disarm" }]);
		if (stale) return finish(state, [{ type: "disarm" }, end(state), { type: "release" }]);
		const shown: Effective = {};
		if (sent.permissionMode !== undefined) shown.permissionMode = target.permissionMode;
		if (sent.model !== undefined) shown.model = target.model;
		return finish(state, [{ type: "disarm" }, { type: "applied", ...shown }, { type: "release" }]);
	}

	const signal = input.message;
	// Every report of the mode or model, until release, is what the session runs now.
	if (state.phase !== "committing" && (signal.kind === "status" || signal.kind === "init")) {
		const next = { ...state, reported: report(state.reported, signal) };
		// A report newer than the send supersedes what was sent for its keys.
		if (state.applying) {
			const applying = { ...state.applying };
			delete applying.permissionMode;
			if (signal.kind === "init" && signal.model) delete applying.model;
			next.applying = applying;
		}
		return same(next);
	}
	if (state.phase === "reapplying") return same(state);
	if (state.phase === "settling") {
		if (signal.kind !== "result") return same(state);
		// The old turn's result still outstanding is no acknowledgement, unless it is the new session's with no turns.
		const ack = signal.numTurns === 0 && signal.sessionId === state.newId;
		// The clear's result before the old turn's: consumed, but the sends wait for the turn's, which clears busy.
		if (state.turnOpen && ack && !state.ackSeen) return { state: { ...state, ackSeen: true }, actions: [{ type: "consume" }] };
		if (state.turnOpen && state.ackSeen) return settle(state, input.at, []);
		if (state.turnOpen && !ack) return { state: { ...state, turnOpen: false }, actions: [] };
		return settle(state, input.at, [{ type: "consume" }]);
	}
	switch (signal.kind) {
		case "status":
			return same(state);
		case "reset":
			return resume({ ...state, resetSeen: true, target: input.inForce ?? state.target }, input.at, [{ type: "consume" }]);
		case "result":
			if (state.resetSeen) {
				// The result of the turn that was running at the reset ends it for the session; the next one is the clear's.
				if (state.turnOpen) return { state: { ...state, turnOpen: false }, actions: [] };
				return { state, actions: [{ type: "consume" }] };
			}
			// The running turn's own result.
			if (!state.ownTurn) return same(state);
			return resume({ ...state, turnOpen: false }, input.at, []);
		case "init":
			if (state.resetSeen) {
				const id = signal.sessionId;
				if (!isSessionId(id) || id === state.oldId) return same(state);
				const timer = state.seq + 1;
				return {
					state: { ...state, phase: "settling", newId: id, reported: { permissionMode: signal.permissionMode, model: signal.model }, timer, seq: timer },
					actions: [
						{ type: "disarm" },
						{ type: "commit", oldId: state.oldId, newId: id, model: signal.model, permissionMode: signal.permissionMode },
						{ type: "arm", timer, ms: RESULT_MS },
					],
				};
			}
			return pause(state, input.at);
		case "activity":
			return state.resetSeen ? same(state) : pause(state, input.at);
	}
}

/** What a status or init reports: the mode replaces the earlier one, a missing one failing closed; a model only when reported. */
function report(reported: Effective, signal: { kind: "status"; permissionMode: string } | { kind: "init"; model?: string; permissionMode?: string }): Effective {
	const next: Effective = { ...reported, permissionMode: signal.permissionMode };
	if (signal.kind === "init" && signal.model) next.model = signal.model;
	return next;
}

/** The new session answered: the clear is done, once the picks it lost are set again. */
function settle(state: ClearState, at: number, before: ClearAction[]): Step {
	const lost = lostPicks(state.target, state.reported, state.resolved);
	if (!lost) return finish(state, [{ type: "disarm" }, ...before, { type: "release" }]);
	return reapply(state, at, lost, [{ type: "disarm" }, ...before]);
}

/** Send `values` to the CLI and wait for its answer. */
function reapply(state: ClearState, at: number, values: Effective, before: ClearAction[]): Step {
	const timer = state.seq + 1;
	return {
		state: { ...state, phase: "reapplying", applying: values, rounds: state.rounds + 1, timer, seq: timer, armedAt: at },
		actions: [...before, { type: "reapply", ...values }, { type: "arm", timer, ms: REAPPLY_MS }],
	};
}

/** What ends a clear that did not finish: nothing started, or the new session started and is resumed. */
function end(state: ClearState): ClearAction {
	return state.phase !== "committing" && state.newId ? { type: "restart", sessionId: state.newId } : { type: "fallback", oldId: state.oldId };
}

/** The CLI's own turn began: count the time used and stop the clock. */
function pause(state: ClearState, at: number): Step {
	if (state.ownTurn) return same(state);
	return { state: { ...state, ownTurn: true, turnOpen: true, elapsedMs: state.elapsedMs + (at - state.armedAt), timer: 0 }, actions: [{ type: "disarm" }] };
}

/** The CLI's own turn ended (or the reset came): arm what is left of the window. */
function resume(state: ClearState, at: number, before: ClearAction[]): Step {
	if (!state.ownTurn) return { state, actions: before };
	const timer = state.seq + 1;
	return {
		state: { ...state, ownTurn: false, armedAt: at, timer, seq: timer },
		actions: [...before, { type: "arm", timer, ms: Math.max(0, COMMIT_MS - state.elapsedMs) }],
	};
}

// --- Undo (PRD-001.R38, DES-002 Clear transaction) ----------------------------------

/** How long the CLI an Undo started has to answer, counted from the start. */
export const UNDO_MS = 15_000;

/** Whether the CLI an Undo started says something that ends the Undo: an error result (an id it does not hold, V1). */
export function undoFailure(message: StreamMessage | null | undefined): boolean {
	if (!message || typeof message !== "object") return false;
	const raw = message as Record<string, unknown>;
	return raw.type === "result" && (raw.is_error === true || (typeof raw.subtype === "string" && raw.subtype !== "success"));
}

/**
 * An Undo in flight. `pending`: the CLI that resumes the ended session is
 * starting or asked for its context usage; `adopting`: it answered and the tab
 * is taking it over. Events carry the run they belong to and a timer the one
 * armed, so a late one of an earlier run changes nothing.
 */
export interface UndoState {
	phase: "idle" | "pending" | "adopting";
	run: number;
	timer: number;
	/** The last run and timer numbers handed out. */
	runs: number;
	timers: number;
}

export type UndoInput =
	| { type: "begin" }
	/** The CLI answered the context request with a parsed success. */
	| { type: "replied"; run: number }
	/** An error reply or result, an exit, or a CLI that could not start. */
	| { type: "failed"; run: number }
	| { type: "timeout"; timer: number }
	/** The tab took the CLI over, or refused (its launch settings changed, the tab closed, a message followed the clear). */
	| { type: "adopted"; run: number; ok: boolean }
	/** The tab closes or the flow is torn down. */
	| { type: "stop" };

export type UndoAction =
	/** Start the CLI resuming the ended session and ask for its context usage. */
	| { type: "start"; run: number }
	| { type: "arm"; timer: number; ms: number }
	| { type: "disarm" }
	/** Make that CLI the tab's, stopping the one it replaces. */
	| { type: "adopt"; run: number }
	/** Stop the Undo's CLI: it is never the tab's. */
	| { type: "stop" }
	/** The clear is taken back. */
	| { type: "complete" }
	/** "Could not undo the clear." */
	| { type: "fail" }
	/** Let the held sends go. */
	| { type: "release" };

export function idleUndo(): UndoState {
	return { phase: "idle", run: 0, timer: 0, runs: 0, timers: 0 };
}

interface UndoStep {
	state: UndoState;
	actions: UndoAction[];
}

export function reduceUndo(state: UndoState, input: UndoInput): UndoStep {
	if (input.type === "begin") {
		if (state.phase !== "idle") return { state, actions: [] };
		const run = state.runs + 1;
		const timer = state.timers + 1;
		return {
			state: { phase: "pending", run, timer, runs: run, timers: timer },
			actions: [{ type: "start", run }, { type: "arm", timer, ms: UNDO_MS }],
		};
	}
	if (state.phase === "idle") return { state, actions: [] };
	const idle: UndoState = { ...state, phase: "idle", run: 0, timer: 0 };
	if (input.type === "stop") return { state: idle, actions: [{ type: "disarm" }, { type: "stop" }, { type: "release" }] };
	if (input.type === "timeout") {
		if (input.timer !== state.timer || state.phase !== "pending") return { state, actions: [] };
		return { state: idle, actions: [{ type: "stop" }, { type: "fail" }, { type: "release" }] };
	}
	if (input.run !== state.run) return { state, actions: [] };
	if (input.type === "replied") {
		if (state.phase !== "pending") return { state, actions: [] };
		return { state: { ...state, phase: "adopting", timer: 0 }, actions: [{ type: "disarm" }, { type: "adopt", run: state.run }] };
	}
	if (input.type === "failed") {
		if (state.phase !== "pending") return { state, actions: [] };
		return { state: idle, actions: [{ type: "disarm" }, { type: "stop" }, { type: "fail" }, { type: "release" }] };
	}
	if (state.phase !== "adopting") return { state, actions: [] };
	// Adopted: the CLI is the tab's now and is not stopped. Refused: it is stopped and the tab is as it was.
	return {
		state: idle,
		actions: input.ok ? [{ type: "complete" }, { type: "release" }] : [{ type: "stop" }, { type: "fail" }, { type: "release" }],
	};
}

// --- The held /clear (PRD-001.R38, DES-002 Clear transaction) ------------------------

/** How long a `/clear` waits, after a result with a message queued behind it, for that message's turn to start; then the CLI runs it first and the clear is written regardless. */
export const HOLD_GRACE_MS = 3_000;

/**
 * A `/clear` sent while a turn runs. `waiting`: the turn runs; `grace`: its
 * result came with a message queued behind it, and that message's turn has
 * not started yet. Only timing lives here; the held text and the held
 * messages are `tab/clear-flow`'s.
 */
export interface HoldState {
	phase: "idle" | "waiting" | "grace";
	/** The armed grace timer's id, 0 when none. */
	timer: number;
	/** The last timer id handed out. */
	seq: number;
}

export type HoldInput =
	| { type: "hold" }
	/** "Cancel" on the held `/clear`. */
	| { type: "cancel" }
	/** A turn started, or ended with `queued` set when a message queued behind it may run next. */
	| { type: "turn"; running: true }
	| { type: "turn"; running: false; queued: boolean }
	| { type: "timeout"; timer: number }
	/** The tab closes. */
	| { type: "stop" };

export type HoldAction =
	| { type: "arm"; timer: number; ms: number }
	| { type: "disarm" }
	/** The turn ended: the held `/clear` runs now. */
	| { type: "fire" }
	/** Cancelled: it is dropped. */
	| { type: "drop" };

export function idleHold(): HoldState {
	return { phase: "idle", timer: 0, seq: 0 };
}

interface HoldStep {
	state: HoldState;
	actions: HoldAction[];
}

export function reduceHold(state: HoldState, input: HoldInput): HoldStep {
	const idle: HoldState = { ...state, phase: "idle", timer: 0 };
	if (input.type === "hold") return state.phase === "idle" ? { state: { ...state, phase: "waiting" }, actions: [] } : { state, actions: [] };
	if (state.phase === "idle") return { state, actions: [] };
	switch (input.type) {
		case "cancel":
			return { state: idle, actions: [{ type: "disarm" }, { type: "drop" }] };
		case "stop":
			return { state: idle, actions: [{ type: "disarm" }] };
		case "timeout":
			return input.timer === state.timer && state.phase === "grace" ? { state: idle, actions: [{ type: "fire" }] } : { state, actions: [] };
		case "turn": {
			if (input.running) return state.phase === "grace" ? { state: { ...state, phase: "waiting", timer: 0 }, actions: [{ type: "disarm" }] } : { state, actions: [] };
			if (!input.queued) return { state: idle, actions: [{ type: "disarm" }, { type: "fire" }] };
			// A message queued behind the turn runs next, unless the CLI steered the turn with it.
			if (state.phase === "grace") return { state, actions: [] };
			const timer = state.seq + 1;
			return { state: { phase: "grace", timer, seq: timer }, actions: [{ type: "arm", timer, ms: HOLD_GRACE_MS }] };
		}
	}
}
