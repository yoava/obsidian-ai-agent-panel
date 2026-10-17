import test from "node:test";
import assert from "node:assert/strict";

const { classify, idleClear, idleUndo, lostPicks, reduceClear, reduceUndo, undoFailure, COMMIT_MS, REAPPLY_MS, RESULT_MS, UNDO_MS } = await import("./.build/state/clear-operation.mjs");

const OLD = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
const NEW = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const G = 3;

const RESET = { kind: "reset" };
const initOf = (sessionId, extra = {}) => ({ kind: "init", sessionId, ...extra });
const RESULT = { kind: "result" };
const ACTIVITY = { kind: "activity" };

/** Feed events to the machine, collecting the actions of every step. */
function run(inputs, from = idleClear()) {
	let state = from;
	const actions = [];
	const steps = [];
	for (const input of inputs) {
		const step = reduceClear(state, input);
		state = step.state;
		steps.push(step.actions);
		actions.push(...step.actions);
	}
	return { state, actions, steps, types: actions.map((action) => action.type) };
}
const begin = (at = 0, generation = G, oldId = OLD) => ({ type: "begin", generation, oldId, at });
const message = (msg, at = 0, generation = G) => ({ type: "message", generation, message: msg, at });
const closed = (generation = G) => ({ type: "closed", generation });
const timeout = (timer, at = 0) => ({ type: "timeout", timer, at });

test("PRD-001.R38: classify reads the CLI's clear events, a turn's activity and its end", () => {
	assert.deepEqual(classify({ type: "conversation_reset", trigger: "clear", session_id: OLD }), RESET);
	assert.equal(classify({ type: "conversation_reset", trigger: "other" }), null);
	assert.deepEqual(classify({ type: "system", subtype: "init", session_id: NEW, model: "m", permissionMode: "plan" }), initOf(NEW, { model: "m", permissionMode: "plan" }));
	assert.deepEqual(classify({ type: "system", subtype: "init" }), initOf(undefined));
	assert.deepEqual(classify({ type: "result", subtype: "success" }), RESULT);
	for (const type of ["assistant", "stream_event"]) assert.deepEqual(classify({ type, message: {} }), ACTIVITY);
	assert.deepEqual(classify({ type: "user", message: { role: "user", content: "hi" } }), ACTIVITY);
	// A replayed local command's output is no turn (as the session reads it).
	assert.equal(classify({ type: "user", message: { role: "user", content: "<local-command-stdout>Set model</local-command-stdout>" } }), null);
	assert.equal(classify({ type: "system", subtype: "status" }), null);
	assert.equal(classify({ type: "rate_limit_event" }), null);
	assert.equal(classify(null), null);
});

test("PRD-001.R38: a result after the reset that ends the CLI's own turn passes, so busy clears; the clear's own result is still consumed", () => {
	const { steps, state } = run([begin(), message(ACTIVITY), message(RESET), message(RESULT), message(initOf(NEW)), message(RESULT)]);
	assert.deepEqual(steps[3], [], "the old turn's result goes on to the session");
	assert.deepEqual(steps[5].map((action) => action.type), ["disarm", "consume", "release"]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: the old turn's result after the new init passes; the clear's zero result is consumed and never a turn end", () => {
	const old = { kind: "result", sessionId: OLD, numTurns: 2 };
	const zero = { kind: "result", sessionId: NEW, numTurns: 0 };
	assert.deepEqual(classify({ type: "result", session_id: NEW, num_turns: 0 }), zero);
	const { steps, state } = run([begin(), message(ACTIVITY), message(RESET), message(initOf(NEW)), message(old), message(zero)]);
	assert.deepEqual(steps[4], [], "the old turn's result goes on to the session");
	assert.deepEqual(steps[5].map((action) => action.type), ["disarm", "consume", "release"]);
	assert.equal(state.phase, "idle");
	// Reordered: the clear's zero result first is still the clear's.
	const first = run([begin(), message(ACTIVITY), message(RESET), message(initOf(NEW)), message(zero)]);
	assert.deepEqual(first.steps[4], [{ type: "consume" }], "the ack is consumed, the sends keep waiting for the old turn");
	assert.equal(first.state.phase, "settling");
	const after = run([message(old)], first.state);
	assert.deepEqual(after.steps[0].map((action) => action.type), ["disarm", "release"], "the old result passes (it clears busy), then the sends go");
	assert.equal(after.state.phase, "idle");
});

test("PRD-001.R38: a clear writes /clear and waits 15 s for the new session", () => {
	assert.equal(COMMIT_MS, 15_000);
	const { state, actions } = run([begin(100)]);
	assert.equal(state.phase, "committing");
	assert.deepEqual(actions, [{ type: "write" }, { type: "arm", timer: 1, ms: 15_000 }]);
});

test("PRD-001.R38: reset, then an init with a new valid id commits; the init itself is left to the session", () => {
	const { state, steps, types } = run([begin(), message(RESET, 40), message(initOf(NEW, { model: "m", permissionMode: "default" }), 60)]);
	assert.deepEqual(steps[1], [{ type: "consume" }]);
	assert.deepEqual(steps[2], [
		{ type: "disarm" },
		{ type: "commit", oldId: OLD, newId: NEW, model: "m", permissionMode: "default" },
		{ type: "arm", timer: 2, ms: RESULT_MS },
	]);
	assert.equal(RESULT_MS, 15_000);
	assert.equal(state.phase, "settling");
	assert.equal(types.includes("consume"), true);
});

test("PRD-001.R38: an init with the old id, an invalid id, or none is not a commit", () => {
	for (const bad of [OLD, "--resume", "", undefined, null, 7, NEW.toUpperCase()]) {
		const { state, actions } = run([begin(), message(RESET), message(initOf(bad))]);
		assert.equal(state.phase, "committing", String(bad));
		assert.equal(actions.some((action) => action.type === "commit"), false);
	}
});

test("PRD-001.R38: an init before the reset is the CLI's own turn, never a commit, whatever its id", () => {
	const { state, actions } = run([begin(0), message(initOf(NEW), 10)]);
	assert.equal(state.phase, "committing");
	assert.equal(state.ownTurn, true);
	assert.equal(actions.some((action) => action.type === "commit"), false);
});

test("PRD-001.R38: the trailing result is consumed and closes the clear, releasing the sends", () => {
	const { state, steps } = run([begin(), message(RESET), message(initOf(NEW)), message(RESULT, 300)]);
	assert.deepEqual(steps[3], [{ type: "disarm" }, { type: "consume" }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: a result before the reset is the running turn's and is not consumed", () => {
	const { state, steps } = run([begin(), message(ACTIVITY, 5), message(RESULT, 50)]);
	assert.deepEqual(steps[2].map((action) => action.type), ["arm"]);
	assert.equal(state.phase, "committing");
	assert.equal(steps.flat().some((action) => action.type === "consume"), false);
});

test("PRD-001.R38: a result after the reset but before any init is the clear's answer and is consumed", () => {
	const { steps, state } = run([begin(), message(RESET), message(RESULT)]);
	assert.deepEqual(steps[2], [{ type: "consume" }]);
	// No new session yet: the clear still waits for its commit.
	assert.equal(state.phase, "committing");
});

test("PRD-001.R38: a stray result after the clear closed passes, as does one with no clear open", () => {
	const closedClear = run([begin(), message(RESET), message(initOf(NEW)), message(RESULT), message(RESULT)]);
	assert.deepEqual(closedClear.steps[4], []);
	assert.deepEqual(run([message(RESULT)]).actions, []);
});

test("PRD-001.R38: a turn of the CLI's own before the reset is not counted against the 15 s", () => {
	// Armed at 0 (timer 1); the turn starts at 4 s, so 4 s are counted and the clock stops.
	const turn = run([begin(0), message(initOf(OLD), 4_000)]);
	assert.deepEqual(turn.steps[1], [{ type: "disarm" }]);
	assert.equal(turn.state.ownTurn, true);
	// Its timer, firing late, is ignored.
	assert.deepEqual(run([timeout(1, 15_000)], turn.state).actions, []);
	// The turn ends at 60 s: the 11 s left are armed afresh.
	const ended = run([message(RESULT, 60_000)], turn.state);
	assert.deepEqual(ended.actions, [{ type: "arm", timer: 2, ms: 11_000 }]);
	assert.equal(ended.state.ownTurn, false);
	// 11 s later with no reset the clear falls back.
	assert.deepEqual(run([timeout(2, 71_000)], ended.state).types, ["fallback", "release"]);
});

test("PRD-001.R38: activity with no init starts the CLI's own turn too, and several messages pause the clock once", () => {
	const turn = run([begin(0), message(ACTIVITY, 1_000), message(ACTIVITY, 2_000), message(ACTIVITY, 3_000)]);
	assert.deepEqual(turn.actions.filter((action) => action.type === "disarm").length, 1);
	assert.equal(turn.state.elapsedMs, 1_000);
});

test("PRD-001.R38: the CLI's own turn then the reset and the new session commit", () => {
	const { state, types } = run([begin(0), message(initOf(OLD), 100), message(ACTIVITY, 200), message(RESULT, 900), message(RESET, 910), message(initOf(NEW), 930), message(RESULT, 940)]);
	assert.equal(state.phase, "idle");
	assert.equal(types.includes("commit"), true);
	assert.equal(types.filter((type) => type === "release").length, 1);
});

test("PRD-001.R38: no new session within 15 s of the write completes the clear without a process", () => {
	const { state, actions } = run([begin(0), timeout(1, 15_000)]);
	assert.deepEqual(actions.slice(2), [{ type: "fallback", oldId: OLD }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: the reset without an init falls back at the deadline", () => {
	const { types } = run([begin(0), message(RESET, 100), timeout(1, 15_000)]);
	assert.deepEqual(types.slice(-2), ["fallback", "release"]);
});

test("PRD-001.R38: the process exiting before the commit falls back at once", () => {
	const { state, actions } = run([begin(), message(RESET), closed()]);
	assert.deepEqual(actions.slice(-3), [{ type: "disarm" }, { type: "fallback", oldId: OLD }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: no answer within 15 s of the commit restarts the CLI on the new session", () => {
	const { state, actions } = run([begin(), message(RESET), message(initOf(NEW)), timeout(2, 15_300)]);
	assert.deepEqual(actions.slice(-2), [{ type: "restart", sessionId: NEW }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: the process exiting after the commit keeps the clear and restarts on the new session", () => {
	const { actions } = run([begin(), message(RESET), message(initOf(NEW)), closed()]);
	assert.deepEqual(actions.slice(-3), [{ type: "disarm" }, { type: "restart", sessionId: NEW }, { type: "release" }]);
});

test("ADR-018: events of another process generation are ignored, a crash respawn included", () => {
	const open = run([begin(0)]).state;
	for (const input of [message(RESET, 0, G + 1), message(initOf(NEW), 0, G - 1), message(RESULT, 0, G + 1), closed(G + 1), closed(G - 1)])
		assert.deepEqual(run([input], open).actions, []);
	// The process crashes; the respawn's events do not touch the finished fallback.
	const crashed = run([begin(), closed(), message(RESET, 5, G + 1), message(initOf(NEW), 6, G + 1), message(RESULT, 7, G + 1)]);
	assert.equal(crashed.state.phase, "idle");
	assert.deepEqual(crashed.steps.slice(2), [[], [], []]);
});

test("ADR-018: events after the operation closed are ignored, and so are old timers", () => {
	const done = run([begin(), message(RESET), message(initOf(NEW)), message(RESULT)]).state;
	for (const input of [message(RESET), message(initOf(NEW)), closed(), timeout(1), timeout(2), timeout(3)])
		assert.deepEqual(run([input], done).actions, []);
	// A timer other than the one armed is stale.
	const waiting = run([begin()]).state;
	assert.deepEqual(run([timeout(7, 15_000)], waiting).actions, []);
});

test("ADR-018: a second clear cannot begin while one is open", () => {
	const open = run([begin()]).state;
	assert.deepEqual(run([begin(5, G + 1, NEW)], open).actions, []);
	assert.equal(run([begin(5, G + 1, NEW)], open).state, open);
});

test("PRD-001.R38: a clear with no known old id commits on any valid new id", () => {
	const { types } = run([begin(0, G, null), message(RESET), message(initOf(NEW))]);
	assert.equal(types.includes("commit"), true);
});

test("ADR-018: the operation is reusable once closed", () => {
	const first = run([begin(), message(RESET), message(initOf(NEW)), message(RESULT)]).state;
	const second = run([begin(10, G, NEW)], first);
	assert.equal(second.state.phase, "committing");
	assert.deepEqual(second.actions[1], { type: "arm", timer: 3, ms: 15_000 });
});

const CLEAN = "claude-opus-5-5";
const BEFORE = { permissionMode: "acceptEdits", model: "claude-sonnet-5" };

/** A clear begun with the picks in force before it, then the reset and `inputs`. */
function withPicks(before, resolved = {}, ...inputs) {
	return run([{ ...begin(0), resolved }, { ...message(RESET, 10), inForce: before }, ...inputs]);
}
const LOST = [message(initOf(NEW, { permissionMode: "default", model: CLEAN }), 20), message(RESULT, 30)];

test("PRD-003.R4: lostPicks reads a resolution by its own key, so a model named like an object member compares as itself", () => {
	assert.equal(lostPicks({ model: "constructor" }, { model: "constructor" }, {}), null);
	assert.deepEqual(lostPicks({ model: "constructor" }, { model: "claude-opus-5" }, {}), { model: "constructor" });
	assert.equal(lostPicks({ model: "constructor" }, { model: "claude-opus-5" }, { constructor: "claude-opus-5" }), null);
});

test("PRD-001.R38: lostPicks names the mode or model the new session does not report as before", () => {
	assert.deepEqual(lostPicks({ permissionMode: "acceptEdits", model: "m1" }, { permissionMode: "default", model: "m2" }), { permissionMode: "acceptEdits", model: "m1" });
	assert.deepEqual(lostPicks({ permissionMode: "acceptEdits", model: "m1" }, { permissionMode: "default", model: "m1" }), { permissionMode: "acceptEdits" });
	assert.deepEqual(lostPicks({ permissionMode: "plan", model: "m1" }, { permissionMode: "plan", model: "m2" }), { model: "m1" });
	assert.equal(lostPicks({ permissionMode: "plan", model: "m1" }, { permissionMode: "plan", model: "m1" }), null);
});

test("PRD-001.R38: a mode known only from the handshake is kept, and a new session reporting none loses it", () => {
	const { state, steps } = withPicks({ permissionMode: "plan" }, {}, message(initOf(NEW, {}), 20), message(RESULT, 30));
	assert.deepEqual(steps[3].find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "plan" });
	assert.equal(state.phase, "reapplying");
});

test("PRD-001.R38: nothing is lost when there is nothing to keep, or the model was not reported", () => {
	assert.equal(lostPicks({}, { permissionMode: "default", model: "m" }), null);
	assert.equal(lostPicks({ model: "m" }, { permissionMode: "default" }), null);
	assert.equal(lostPicks({ permissionMode: "plan", model: "m" }, { permissionMode: "plan" }), null);
});

test("PRD-001.R38: a mode to keep that the new session does not report, or reports empty or unrecognised, is lost", () => {
	assert.deepEqual(lostPicks({ permissionMode: "plan" }, {}), { permissionMode: "plan" });
	assert.deepEqual(lostPicks({ permissionMode: "plan" }, { permissionMode: "" }), { permissionMode: "plan" });
	assert.deepEqual(lostPicks({ permissionMode: "plan" }, { permissionMode: "yolo" }), { permissionMode: "plan" });
});

test("PRD-001.R38: models are compared through what the aliases resolved to", () => {
	const resolved = { sonnet: "claude-sonnet-5" };
	assert.equal(lostPicks({ model: "sonnet" }, { model: "claude-sonnet-5" }, resolved), null);
	assert.equal(lostPicks({ model: "claude-sonnet-5" }, { model: "sonnet" }, resolved), null);
	assert.deepEqual(lostPicks({ model: "sonnet" }, { model: CLEAN }, resolved), { model: "sonnet" });
	assert.deepEqual(lostPicks({ model: "sonnet" }, { model: "claude-sonnet-5" }), { model: "sonnet" }, "an alias not yet resolved is a difference");
});

test("PRD-001.R38: the answer to a clear that kept the picks releases the sends with no set-again", () => {
	const { state, types } = withPicks(BEFORE, {}, message(initOf(NEW, BEFORE), 20), message(RESULT, 30));
	assert.equal(types.includes("reapply"), false);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: the answer to a clear that lost the picks sets them again and holds the sends for 15 s", () => {
	assert.equal(REAPPLY_MS, 15_000);
	const { state, steps } = withPicks(BEFORE, {}, ...LOST);
	assert.deepEqual(steps[3], [
		{ type: "disarm" },
		{ type: "consume" },
		{ type: "reapply", permissionMode: "acceptEdits", model: "claude-sonnet-5" },
		{ type: "arm", timer: 3, ms: 15_000 },
	]);
	assert.equal(state.phase, "reapplying");
});

test("PRD-001.R38: a set-again that took releases the sends and shows the picks", () => {
	const { state, steps } = withPicks(BEFORE, {}, ...LOST, { type: "reapplied", generation: G, ok: true });
	assert.deepEqual(steps[4], [{ type: "disarm" }, { type: "applied", permissionMode: "acceptEdits", model: "claude-sonnet-5" }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: a Bypass set-again skipped because the setting is off is never recorded as applied; the target follows what the CLI reports", () => {
	const lost = [message(initOf(NEW, { permissionMode: "default" }), 20), message(RESULT, 30)];
	const first = withPicks({ permissionMode: "bypassPermissions" }, {}, ...lost);
	assert.equal(first.state.phase, "reapplying");
	const done = run([{ type: "reapplied", generation: G, ok: true, modeSkipped: true, at: 40 }], first.state);
	assert.equal(done.state.phase, "idle");
	assert.deepEqual(done.actions.map((action) => action.type), ["disarm", "applied", "release"]);
	assert.equal(done.actions.some((action) => action.permissionMode === "bypassPermissions"), false);
	assert.equal(done.actions.find((action) => action.type === "applied").permissionMode, undefined);
});

test("PRD-001.R38: a refused set-again restarts the CLI resuming the new session and releases the sends", () => {
	const { state, steps } = withPicks(BEFORE, {}, ...LOST, { type: "reapplied", generation: G, ok: false });
	assert.deepEqual(steps[4], [{ type: "disarm" }, { type: "restart", sessionId: NEW }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: no answer to the set-again within 15 s restarts the CLI on the new session", () => {
	const { state, actions } = withPicks(BEFORE, {}, ...LOST, timeout(3, 15_040));
	assert.deepEqual(actions.slice(-2), [{ type: "restart", sessionId: NEW }, { type: "release" }]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: the process ending during the set-again restarts on the new session", () => {
	const { actions } = withPicks(BEFORE, {}, ...LOST, closed());
	assert.deepEqual(actions.slice(-3), [{ type: "disarm" }, { type: "restart", sessionId: NEW }, { type: "release" }]);
});

test("PRD-001.R38: the answer's own timer is no longer the armed one during the set-again", () => {
	const { state } = withPicks(BEFORE, {}, ...LOST, timeout(2, 15_020));
	assert.equal(state.phase, "reapplying");
});

test("PRD-001.R38: messages during the set-again change nothing, and a reply of another process or of no set-again is ignored", () => {
	const { state } = withPicks(BEFORE, {}, ...LOST, message(ACTIVITY, 40), message(RESULT, 50), { type: "reapplied", generation: G + 1, ok: true });
	assert.equal(state.phase, "reapplying");
	assert.deepEqual(run([{ type: "reapplied", generation: G, ok: true }]).actions, []);
	const settling = run([begin(0), message(RESET), message(initOf(NEW, BEFORE)), { type: "reapplied", generation: G, ok: true }]);
	assert.equal(settling.state.phase, "settling");
});

test("PRD-001.R38: the old turn's result after the clear's own answer ends the clear, then the picks are set again", () => {
	const result = (extra) => ({ kind: "result", ...extra });
	const { state, steps } = run([
		begin(0),
		message({ kind: "init", sessionId: OLD }, 5),
		{ ...message(RESET, 10), inForce: BEFORE },
		message(initOf(NEW, { permissionMode: "default" }), 20),
		message(result({ sessionId: NEW, numTurns: 0 }), 30),
		message(result({ sessionId: OLD, numTurns: 1 }), 40),
	]);
	assert.deepEqual(steps[5].map((action) => action.type), ["disarm", "reapply", "arm"]);
	assert.equal(state.phase, "reapplying");
});

const pick = (values, generation = G) => ({ type: "picked", generation, ...values });
const reapplied = (ok, generation = G) => ({ type: "reapplied", generation, ok, at: 40 });

test("PRD-001.R38: the target is what runs at the reset, not at the start of the clear", () => {
	const { state } = run([begin(0), { ...message(RESET, 10), inForce: BEFORE }]);
	assert.deepEqual(state.target, BEFORE);
	// A self-turn's init before the reset is in what runs at the reset.
	const turn = run([begin(0), message(initOf(OLD, { model: "m0" }), 5), { ...message(RESET, 10), inForce: { model: "m0" } }]);
	assert.deepEqual(turn.state.target, { model: "m0" });
});

test("PRD-001.R38: a pick accepted after the new session started, with a CLI that kept the picks, sends nothing", () => {
	const { state, types } = withPicks(BEFORE, {}, message(initOf(NEW, BEFORE), 20), pick({ permissionMode: "plan" }), message(RESULT, 30));
	assert.equal(types.includes("reapply"), false);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: a pick accepted before the new session started and undone by the reset is set again, not the older value", () => {
	const { steps } = withPicks(BEFORE, {}, pick({ permissionMode: "plan" }), message(initOf(NEW, { permissionMode: "default", model: BEFORE.model }), 20), message(RESULT, 30));
	assert.deepEqual(steps[4].find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "plan" });
});

test("PRD-001.R38: a pick accepted while the picks are set again is shown and ends in the CLI, sent again if the first send was older", () => {
	const lost = withPicks(BEFORE, {}, ...LOST);
	const picked = run([pick({ permissionMode: "plan" })], lost.state);
	assert.equal(picked.state.target.permissionMode, "plan");
	const answered = run([reapplied(true)], picked.state);
	assert.deepEqual(answered.actions, [{ type: "disarm" }, { type: "reapply", permissionMode: "plan" }, { type: "arm", timer: 4, ms: 15_000 }]);
	assert.equal(answered.state.phase, "reapplying");
	const done = run([reapplied(true)], answered.state);
	assert.deepEqual(done.actions, [{ type: "disarm" }, { type: "applied", permissionMode: "plan" }, { type: "release" }]);
});

test("PRD-001.R38: the picks shown after a set-again are the target's, not the older sent ones", () => {
	const lost = withPicks(BEFORE, {}, ...LOST);
	const picked = run([pick({ model: "claude-haiku-5" }), pick({ model: "claude-sonnet-5" })], lost.state);
	const done = run([reapplied(true)], picked.state);
	assert.deepEqual(done.actions.find((action) => action.type === "applied"), { type: "applied", permissionMode: "acceptEdits", model: "claude-sonnet-5" });
});

test("PRD-001.R38: picks that keep arriving past three rounds fall back to the restart", () => {
	let state = withPicks(BEFORE, {}, ...LOST).state;
	for (let round = 0; round < 2; round++) {
		state = run([pick({ permissionMode: `m${round}` }), reapplied(true)], state).state;
		assert.equal(state.phase, "reapplying");
	}
	const last = run([pick({ permissionMode: "m9" }), reapplied(true)], state);
	assert.deepEqual(last.actions.slice(-2), [{ type: "restart", sessionId: NEW }, { type: "release" }]);
});

test("PRD-001.R38: a pick outside an open clear changes nothing", () => {
	assert.deepEqual(run([pick({ model: "m" })]).actions, []);
});

test("PRD-001.R38: a status during the wait for the answer that differs from the target is set again", () => {
	const status = { kind: "status", permissionMode: "default" };
	const { steps } = withPicks(BEFORE, {}, message(initOf(NEW, BEFORE), 20), message(status, 25), message(RESULT, 30));
	assert.deepEqual(steps[4].find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "acceptEdits" });
});

test("PRD-001.R38: a status that restores the target after an init that lost it needs no set-again", () => {
	const status = { kind: "status", permissionMode: "acceptEdits" };
	const { types } = withPicks(BEFORE, {}, message(initOf(NEW, { permissionMode: "default", model: BEFORE.model }), 20), message(status, 25), message(RESULT, 30));
	assert.equal(types.includes("reapply"), false);
});

test("PRD-001.R38: classify reads a status's mode and no other status", () => {
	assert.deepEqual(classify({ type: "system", subtype: "status", permissionMode: "plan" }), { kind: "status", permissionMode: "plan" });
	assert.equal(classify({ type: "system", subtype: "status", status: "compacting" }), null);
});

test("PRD-001.R38: an init that reports no mode while a mode is kept sets the mode again", () => {
	const { steps } = withPicks(BEFORE, {}, message(initOf(NEW, { model: BEFORE.model }), 20), message(RESULT, 30));
	assert.deepEqual(steps[3].find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "acceptEdits" });
});

test("PRD-001.R38: a status during the set-again of the model, reporting another mode, has the mode set again before release", () => {
	const PLAN = { permissionMode: "plan", model: "claude-sonnet-5" };
	const lost = withPicks(PLAN, {}, message(initOf(NEW, { permissionMode: "plan", model: CLEAN }), 20), message(RESULT, 30));
	assert.deepEqual(lost.steps[3].find((action) => action.type === "reapply"), { type: "reapply", model: "claude-sonnet-5" });
	const status = run([message({ kind: "status", permissionMode: "default" }, 35)], lost.state);
	assert.equal(status.state.phase, "reapplying");
	assert.equal(status.state.reported.permissionMode, "default");
	const answered = run([reapplied(true)], status.state);
	assert.deepEqual(answered.actions.find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "plan" });
	assert.equal(answered.actions.some((action) => action.type === "release"), false);
	const done = run([reapplied(true)], answered.state);
	assert.deepEqual(done.actions.at(-1), { type: "release" });
	assert.equal(done.state.phase, "idle");
});

test("PRD-001.R38: a report that arrives while the picks are set again supersedes what was sent for that key", () => {
	const lost = withPicks({ permissionMode: "plan", model: "claude-sonnet-5" }, {}, ...LOST);
	const status = run([message({ kind: "status", permissionMode: "default" }, 35)], lost.state);
	assert.deepEqual(status.state.applying, { model: "claude-sonnet-5" });
	const answered = run([reapplied(true)], status.state);
	assert.deepEqual(answered.actions.find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "plan" });
	assert.equal(answered.actions.some((action) => action.type === "release"), false);
	const done = run([reapplied(true)], answered.state);
	assert.deepEqual(done.actions.at(-1), { type: "release" });
});

test("PRD-001.R38: a Default model pick accepted while a pinned model is set again has Default restored before release", () => {
	const lost = withPicks(BEFORE, {}, ...LOST);
	const picked = run([pick({ model: undefined })], lost.state);
	const answered = run([reapplied(true)], picked.state);
	const again = answered.actions.find((action) => action.type === "reapply");
	assert.ok(again && "model" in again && again.model === undefined, "set_model with no model");
	assert.equal(answered.actions.some((action) => action.type === "release"), false);
	const done = run([reapplied(true)], answered.state);
	assert.equal(done.actions.some((action) => action.type === "reapply"), false);
	assert.deepEqual(done.actions.at(-1), { type: "release" });
});

test("PRD-001.R38: a later init while waiting or setting again is compared too", () => {
	const settling = withPicks(BEFORE, {}, message(initOf(NEW, BEFORE), 20), message(initOf(NEW, { permissionMode: "default", model: BEFORE.model }), 22), message(RESULT, 30));
	assert.deepEqual(settling.steps[4].find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "acceptEdits" });
	const lost = withPicks(BEFORE, {}, message(initOf(NEW, { permissionMode: "acceptEdits", model: CLEAN }), 20), message(RESULT, 30));
	const init = run([message(initOf(NEW, { permissionMode: "yolo", model: CLEAN }), 35)], lost.state);
	assert.equal(init.state.reported.permissionMode, "yolo");
	const answered = run([reapplied(true)], init.state);
	// The init also superseded the model that was sent, so both are sent again.
	assert.deepEqual(answered.actions.find((action) => action.type === "reapply"), { type: "reapply", permissionMode: "acceptEdits", model: "claude-sonnet-5" });
});

test("PRD-001.R38: Default for the model is a pick that replaces the model to keep", () => {
	const lost = withPicks(BEFORE, {}, ...LOST);
	const picked = run([pick({ model: undefined })], lost.state);
	assert.equal("model" in picked.state.target, true);
	assert.equal(picked.state.target.model, undefined);
	const none = withPicks({ model: "claude-sonnet-5" }, {}, pick({ model: undefined }), message(initOf(NEW, { permissionMode: "default", model: CLEAN }), 20), message(RESULT, 30));
	assert.equal(none.types.includes("reapply"), false);
});

// --- Undo ------------------------------------------------------------------------------

function undo(inputs, from = idleUndo()) {
	let state = from;
	const actions = [];
	const steps = [];
	for (const input of inputs) {
		const step = reduceUndo(state, input);
		state = step.state;
		steps.push(step.actions);
		actions.push(...step.actions);
	}
	return { state, actions, steps, types: actions.map((action) => action.type) };
}
const start = undo([{ type: "begin" }]);

test("PRD-001.R38: an Undo starts the CLI and arms 15 s", () => {
	assert.equal(start.state.phase, "pending");
	assert.deepEqual(start.actions, [{ type: "start", run: 1 }, { type: "arm", timer: 1, ms: UNDO_MS }]);
	assert.equal(UNDO_MS, 15_000);
});

test("PRD-001.R38: a second Undo while one is pending or being adopted does nothing", () => {
	assert.deepEqual(undo([{ type: "begin" }], start.state).actions, []);
	const adopting = undo([{ type: "replied", run: 1 }], start.state);
	assert.deepEqual(undo([{ type: "begin" }], adopting.state).actions, []);
	assert.equal(adopting.state.phase, "adopting");
});

test("PRD-001.R38: a parsed success has the tab adopt the CLI, and only the tab's answer completes the Undo", () => {
	const replied = undo([{ type: "replied", run: 1 }], start.state);
	assert.deepEqual(replied.actions, [{ type: "disarm" }, { type: "adopt", run: 1 }]);
	// Nothing is stopped, completed or released before the adoption is answered.
	const done = undo([{ type: "adopted", run: 1, ok: true }], replied.state);
	assert.deepEqual(done.actions, [{ type: "complete" }, { type: "release" }]);
	assert.equal(done.state.phase, "idle");
});

test("PRD-001.R38: an adoption the tab refused stops the CLI, says it failed and releases the sends", () => {
	const replied = undo([{ type: "replied", run: 1 }], start.state);
	const refused = undo([{ type: "adopted", run: 1, ok: false }], replied.state);
	assert.deepEqual(refused.actions, [{ type: "stop" }, { type: "fail" }, { type: "release" }]);
	assert.equal(refused.state.phase, "idle");
});

test("PRD-001.R38: an error, an exit or a CLI that did not start fails the Undo: the CLI is stopped, the failure shown, the sends released", () => {
	const failed = undo([{ type: "failed", run: 1 }], start.state);
	assert.deepEqual(failed.actions, [{ type: "disarm" }, { type: "stop" }, { type: "fail" }, { type: "release" }]);
	assert.equal(failed.state.phase, "idle");
});

test("PRD-001.R38: no answer within 15 s fails the Undo", () => {
	const late = undo([{ type: "timeout", timer: 1 }], start.state);
	assert.deepEqual(late.actions, [{ type: "stop" }, { type: "fail" }, { type: "release" }]);
	assert.equal(late.state.phase, "idle");
});

test("PRD-001.R38: a timer that is no longer the armed one, or fires after the CLI answered, changes nothing", () => {
	assert.deepEqual(undo([{ type: "timeout", timer: 9 }], start.state).actions, []);
	const adopting = undo([{ type: "replied", run: 1 }], start.state);
	assert.deepEqual(undo([{ type: "timeout", timer: 1 }], adopting.state).actions, []);
	assert.deepEqual(undo([{ type: "timeout", timer: 1 }]).actions, []);
});

test("ADR-018: events of an earlier run change nothing, so a late reply never adopts a CLI the tab stopped", () => {
	const failed = undo([{ type: "failed", run: 1 }], start.state);
	const second = undo([{ type: "begin" }], failed.state);
	assert.equal(second.state.run, 2);
	assert.equal(second.state.timer, 2);
	// The first run's late reply, failure and timer.
	assert.deepEqual(undo([{ type: "replied", run: 1 }, { type: "failed", run: 1 }, { type: "adopted", run: 1, ok: true }, { type: "timeout", timer: 1 }], second.state).actions, []);
	assert.equal(undo([{ type: "replied", run: 2 }], second.state).state.phase, "adopting");
});

test("PRD-001.R38: a failure or an exit while the tab is adopting does not undo the adoption", () => {
	const adopting = undo([{ type: "replied", run: 1 }], start.state);
	assert.deepEqual(undo([{ type: "failed", run: 1 }], adopting.state).actions, []);
	assert.equal(undo([{ type: "failed", run: 1 }], adopting.state).state.phase, "adopting");
});

test("PRD-001.R38: closing the tab stops the Undo's CLI and releases the sends without showing a failure", () => {
	for (const from of [start.state, undo([{ type: "replied", run: 1 }], start.state).state]) {
		const stopped = undo([{ type: "stop" }], from);
		assert.deepEqual(stopped.actions, [{ type: "disarm" }, { type: "stop" }, { type: "release" }]);
		assert.equal(stopped.state.phase, "idle");
	}
	assert.deepEqual(undo([{ type: "stop" }]).actions, []);
});

test("PRD-001.R38: only an error result ends the Undo's CLI; its other messages are no answer", () => {
	assert.equal(undoFailure({ type: "result", subtype: "error_during_execution", is_error: true }), true);
	assert.equal(undoFailure({ type: "result", subtype: "error_max_turns" }), true);
	assert.equal(undoFailure({ type: "result", subtype: "success" }), false);
	assert.equal(undoFailure({ type: "system", subtype: "init" }), false);
	assert.equal(undoFailure({ type: "assistant", message: {} }), false);
	assert.equal(undoFailure(null), false);
});

// --- The held /clear ---------------------------------------------------------------

const { HOLD_GRACE_MS, idleHold, reduceHold } = await import("./.build/state/clear-operation.mjs");

/** Feed events to the hold machine. */
function hold(inputs, from = idleHold()) {
	let state = from;
	const steps = [];
	for (const input of inputs) {
		const step = reduceHold(state, input);
		state = step.state;
		steps.push(step.actions);
	}
	return { state, steps, actions: steps.flat() };
}
const held = hold([{ type: "hold" }]);

test("PRD-001.R38: a /clear sent while a turn runs is held and writes nothing", () => {
	assert.equal(held.state.phase, "waiting");
	assert.deepEqual(held.actions, []);
	// Held once; a second hold changes nothing.
	assert.equal(hold([{ type: "hold" }], held.state).state, held.state);
});

test("PRD-001.R38: the turn ending with no message queued behind it runs the held /clear at once", () => {
	const ended = hold([{ type: "turn", running: false, queued: false }], held.state);
	assert.deepEqual(ended.actions, [{ type: "disarm" }, { type: "fire" }]);
	assert.equal(ended.state.phase, "idle");
});

test("PRD-001.R38: a turn that ends with a message queued behind it waits for that message's turn, and its end runs the /clear", () => {
	const grace = hold([{ type: "turn", running: false, queued: true }], held.state);
	assert.equal(grace.state.phase, "grace");
	assert.deepEqual(grace.actions, [{ type: "arm", timer: 1, ms: HOLD_GRACE_MS }]);
	const started = hold([{ type: "turn", running: true }], grace.state);
	assert.equal(started.state.phase, "waiting");
	assert.deepEqual(started.actions, [{ type: "disarm" }]);
	// The queued turn's timer, fired late, changes nothing.
	assert.deepEqual(hold([{ type: "timeout", timer: 1 }], started.state).actions, []);
	assert.deepEqual(hold([{ type: "turn", running: false, queued: false }], started.state).actions, [{ type: "disarm" }, { type: "fire" }]);
});

test("PRD-001.R38: a queued message whose turn never starts, as when the CLI steered the turn with it, lets the /clear run after the grace", () => {
	const grace = hold([{ type: "turn", running: false, queued: true }], held.state);
	assert.deepEqual(hold([{ type: "timeout", timer: 0 }], grace.state).actions, []);
	const timeout = hold([{ type: "timeout", timer: 1 }], grace.state);
	assert.deepEqual(timeout.actions, [{ type: "fire" }]);
	assert.equal(timeout.state.phase, "idle");
	// A second end in the grace does not arm another timer.
	assert.deepEqual(hold([{ type: "turn", running: false, queued: true }], grace.state).actions, []);
});

test("PRD-001.R38: Cancel drops the held /clear, in either phase", () => {
	const grace = hold([{ type: "turn", running: false, queued: true }], held.state);
	for (const from of [held.state, grace.state]) {
		const cancelled = hold([{ type: "cancel" }], from);
		assert.deepEqual(cancelled.actions, [{ type: "disarm" }, { type: "drop" }]);
		assert.equal(cancelled.state.phase, "idle");
	}
});

test("PRD-001.R38: with nothing held, a turn's end, Cancel or a timer change nothing; closing the tab disarms", () => {
	const idle = idleHold();
	for (const input of [{ type: "cancel" }, { type: "turn", running: false, queued: false }, { type: "turn", running: true }, { type: "timeout", timer: 1 }, { type: "stop" }])
		assert.deepEqual(hold([input], idle).actions, [], input.type);
	assert.deepEqual(hold([{ type: "stop" }], held.state).actions, [{ type: "disarm" }]);
	assert.equal(hold([{ type: "stop" }], held.state).state.phase, "idle");
});

test("PRD-001.R38: a timer of an earlier hold does not run a later one", () => {
	const first = hold([{ type: "hold" }, { type: "turn", running: false, queued: true }, { type: "cancel" }]);
	const second = hold([{ type: "hold" }, { type: "turn", running: false, queued: true }], first.state);
	assert.deepEqual(second.steps[1], [{ type: "arm", timer: 2, ms: HOLD_GRACE_MS }]);
	assert.deepEqual(hold([{ type: "timeout", timer: 1 }], second.state).actions, []);
	assert.deepEqual(hold([{ type: "timeout", timer: 2 }], second.state).actions, [{ type: "fire" }]);
});
