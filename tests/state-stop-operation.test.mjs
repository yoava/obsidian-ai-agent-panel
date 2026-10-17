import test from "node:test";
import assert from "node:assert/strict";

const { idleStop, reduceStop, taskSignal, signalOf, ledgerAfter, runningIn, unfinishedTasks, emptyLedger, STOP_MS } = await import("./.build/state/stop-operation.mjs");

const G = 4;

/** Feed events to the machine, collecting the actions of every step. */
function run(inputs, from = idleStop()) {
	let state = from;
	const actions = [];
	for (const input of inputs) {
		const step = reduceStop(state, input);
		state = step.state;
		actions.push(...step.actions);
	}
	return { state, actions, types: actions.map((action) => action.type) };
}

const begin = (taskIds = ["a"], turn = false, generation = G) => ({ type: "begin", generation, taskIds, turn });
const message = (signal, generation = G) => ({ type: "message", generation, signal });
const ended = (taskId) => message({ kind: "ended", taskId });
const running = (...ids) => ids.map((taskId) => ({ taskId, status: "running" }));
const seen = (...taskIds) => message({ kind: "seen", tasks: running(...taskIds) });
const stateOf = (state, id) => state.tasks.get(id)?.state;
const turn = (running, queued = false) => ({ type: "turn", running, queued });
const look = (fields = {}) => ({ type: "looked", alive: true, turn: false, taskIds: [], ...fields });

test("PRD-001.R38: Stop and clear denies the cards, stops each task, then interrupts, and arms 15 s", () => {
	const { actions, state } = run([begin(["a", "b"], true)]);
	assert.deepEqual(actions, [
		{ type: "deny" },
		{ type: "stopTask", taskId: "a" },
		{ type: "stopTask", taskId: "b" },
		{ type: "interrupt" },
		{ type: "arm", timer: 1, ms: STOP_MS },
	]);
	assert.equal(STOP_MS, 15_000);
	assert.equal(state.phase, "stopping");
});

test("PRD-001.R38: it clears only when no turn runs and every task has ended", () => {
	const { types, state } = run([begin(["a", "b"], true), ended("a"), turn(false)]);
	assert.ok(!types.includes("clear"));
	assert.equal(state.phase, "stopping");
	const last = run([ended("b")], state);
	assert.deepEqual(last.types, ["settle"]);
	assert.equal(last.state.phase, "stopping");
	const cleared = run([look()], last.state);
	assert.deepEqual(cleared.types, ["disarm", "clear"]);
	assert.equal(cleared.state.phase, "idle");
});

test("PRD-001.R38: interrupt with no turn running clears once the tasks ended, waiting for no result", () => {
	const { types } = run([begin(["a"], false), ended("a"), look()]);
	assert.deepEqual(types, ["deny", "stopTask", "interrupt", "arm", "settle", "disarm", "clear"]);
});

test("PRD-001.R38: no task and no turn is quiet at once, after the interrupt", () => {
	const { types, state } = run([begin([], false), look()]);
	assert.deepEqual(types, ["deny", "interrupt", "arm", "settle", "disarm", "clear"]);
	assert.equal(state.phase, "idle");
});

test("PRD-001.R38: a stop with no events changes nothing and the bound fails it", () => {
	const started = run([begin(["a"], false)]);
	const timer = started.state.timer;
	// Nothing else came: no report, no clear.
	const failed = run([{ type: "timeout", timer }], started.state);
	assert.deepEqual(failed.types, ["fail"]);
	assert.equal(failed.state.phase, "idle");
});

test("PRD-001.R38: the stop reply is no input to the machine, a task missing from a list is not an end", () => {
	// background_tasks_changed listing nothing names no task and ends none.
	assert.equal(taskSignal({ type: "system", subtype: "background_tasks_changed", tasks: [] }), null);
	const { state, types } = run([begin(["a"], false), seen("b")]);
	assert.equal(stateOf(state, "a"), "running");
	assert.ok(!types.includes("clear"));
});

test("PRD-001.R38: an unknown status never counts as ended", () => {
	assert.deepEqual(taskSignal({ type: "system", subtype: "task_notification", task_id: "a", status: "weird" }), { kind: "seen", tasks: running("a") });
	assert.deepEqual(taskSignal({ type: "system", subtype: "task_updated", task_id: "a", patch: { status: "weird" } }), { kind: "seen", tasks: running("a") });
	assert.deepEqual(taskSignal({ type: "system", subtype: "task_notification", task_id: "a" }), { kind: "seen", tasks: running("a") });
	const unknown = run([begin(["a"], false), seen("a")]);
	assert.equal(stateOf(unknown.state, "a"), "running");
	assert.ok(!unknown.types.includes("clear"));
});

test("PRD-001.R38: only the known terminal statuses end a task", () => {
	for (const status of ["stopped", "completed", "failed"]) {
		assert.deepEqual(taskSignal({ type: "system", subtype: "task_notification", task_id: "a", status }), { kind: "ended", taskId: "a" });
	}
	for (const status of ["killed", "completed", "failed"]) {
		assert.deepEqual(taskSignal({ type: "system", subtype: "task_updated", task_id: "a", patch: { status } }), { kind: "ended", taskId: "a" });
	}
	// A notification's "killed" and an update's "stopped" are not in the lists.
	assert.deepEqual(taskSignal({ type: "system", subtype: "task_notification", task_id: "a", status: "killed" }), { kind: "seen", tasks: running("a") });
	assert.deepEqual(taskSignal({ type: "system", subtype: "task_updated", task_id: "a", patch: { status: "stopped" } }), { kind: "seen", tasks: running("a") });
	assert.equal(taskSignal({ type: "system", subtype: "task_started" }), null);
	assert.equal(taskSignal({ type: "result" }), null);
	assert.equal(taskSignal(null), null);
});

test("PRD-001.R38: a task started mid-stop is stopped and waited for", () => {
	const started = run([begin(["a"], false), ended("a")]);
	assert.equal(started.state.pending, true);
	// The same, but the new task is named before the first one ended.
	const mid = run([begin(["a"], false), seen("c"), ended("a")]);
	assert.deepEqual(mid.actions.filter((action) => action.type === "stopTask"), [
		{ type: "stopTask", taskId: "a" },
		{ type: "stopTask", taskId: "c" },
	]);
	assert.equal(mid.state.phase, "stopping");
	const last = run([ended("c"), look()], mid.state);
	assert.deepEqual(last.types, ["settle", "disarm", "clear"]);
});

test("PRD-001.R38: an end is final: a later listing of an ended task does not bring it back", () => {
	const { state } = run([begin(["a", "b"], false), ended("a"), seen("a")]);
	assert.equal(stateOf(state, "a"), "ended");
	assert.equal(state.phase, "stopping");
});

test("PRD-001.R38: a turn that starts meanwhile is interrupted and waited for", () => {
	const running = run([begin(["a"], false), turn(true)]);
	assert.deepEqual(running.types.slice(-1), ["interrupt"]);
	const after = run([ended("a")], running.state);
	assert.ok(!after.types.includes("clear"));
	const last = run([turn(false), look()], after.state);
	assert.deepEqual(last.types, ["settle", "disarm", "clear"]);
	// The same state again reports nothing.
	assert.deepEqual(run([turn(true)], running.state).actions, []);
});

test("PRD-001.R38: a CLI exit abandons the stop, one of another process does not", () => {
	const started = run([begin(["a"], true)]);
	assert.deepEqual(run([{ type: "closed", generation: G + 1 }], started.state).actions, []);
	const closed = run([{ type: "closed", generation: G }], started.state);
	assert.deepEqual(closed.types, ["disarm", "fail"]);
	assert.equal(closed.state.phase, "idle");
});

test("PRD-001.R38: the messages of another process change nothing", () => {
	const started = run([begin(["a"], false)]);
	const other = run([message({ kind: "ended", taskId: "a" }, G + 1)], started.state);
	assert.deepEqual(other.actions, []);
	assert.equal(stateOf(other.state, "a"), "running");
});

test("PRD-001.R38: a stale timer changes nothing, and the tab closing stops quietly", () => {
	const started = run([begin(["a"], false)]);
	assert.deepEqual(run([{ type: "timeout", timer: started.state.timer + 9 }], started.state).actions, []);
	const closed = run([{ type: "stop" }], started.state);
	assert.deepEqual(closed.types, ["disarm"]);
	assert.equal(closed.state.phase, "idle");
});

test("PRD-001.R38: a second Stop and clear while one runs is ignored, and an idle machine ignores events", () => {
	const started = run([begin(["a"], false)]);
	assert.deepEqual(run([begin(["z"], false)], started.state).actions, []);
	for (const input of [ended("a"), turn(true), { type: "timeout", timer: 1 }, { type: "closed", generation: G }, { type: "stop" }]) {
		assert.deepEqual(reduceStop(idleStop(), input).actions, []);
	}
});

test("PRD-001.R38: timers are numbered across stops, so a stale one of an earlier stop is ignored", () => {
	const first = run([begin(["a"], false), ended("a"), look()]);
	const second = run([begin(["b"], false)], first.state);
	assert.equal(second.state.timer, 2);
	assert.deepEqual(run([{ type: "timeout", timer: 1 }], second.state).actions, []);
});

test("PRD-001.R38: background_tasks_changed names the tasks it lists", () => {
	const signal = taskSignal({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "x" }, { task_id: "" }, null, { task_id: "y" }] });
	assert.deepEqual(signal, { kind: "seen", tasks: running("x", "y") });
});

test("PRD-001.R38: the last look finding the process gone fails the stop and never clears", () => {
	const settled = run([begin(["a"], false), ended("a")]);
	const failed = run([look({ alive: false })], settled.state);
	assert.deepEqual(failed.types, ["disarm", "fail"]);
	assert.equal(failed.state.phase, "idle");
});

test("PRD-001.R38: a turn, a task or a queued message found by the last look keeps the stop going", () => {
	const settled = run([begin(["a"], false), ended("a")]).state;
	const turned = run([look({ turn: true })], settled);
	assert.deepEqual(turned.types, ["interrupt"]);
	assert.equal(turned.state.phase, "stopping");
	assert.equal(turned.state.pending, false);
	// It settles again when the turn ends.
	assert.deepEqual(run([turn(false)], turned.state).types, ["settle"]);
	const tasked = run([look({ taskIds: ["a", "z"] })], settled);
	assert.deepEqual(tasked.types, ["stopTask"]);
	assert.deepEqual(tasked.actions, [{ type: "stopTask", taskId: "z" }]);
	assert.equal(stateOf(tasked.state, "a"), "ended");
	assert.equal(stateOf(tasked.state, "z"), "running");
});

test("PRD-001.R38: activity between the settle and the last look is caught", () => {
	const settled = run([begin(["a"], false), ended("a")]).state;
	// task_started and a turn arrive in the same batch as the last terminal status.
	const busy = run([seen("late"), turn(true)], settled);
	assert.deepEqual(busy.types, ["stopTask", "interrupt"]);
	const looked = run([look({ turn: true, taskIds: ["late"] })], busy.state);
	assert.ok(!looked.types.includes("clear"));
	assert.equal(looked.state.phase, "stopping");
});

test("PRD-001.R38: a queued message at the turn's end is waited for and its turn interrupted", () => {
	const running = run([begin([], true)]).state;
	const queued = run([turn(false, true)], running);
	assert.deepEqual(queued.types, []);
	assert.equal(queued.state.queued, true);
	const next = run([turn(true)], queued.state);
	assert.deepEqual(next.types, ["interrupt"]);
	const last = run([turn(false, false)], next.state);
	assert.deepEqual(last.types, ["settle"]);
});

test("PRD-001.R38: a look nobody asked for changes nothing", () => {
	const started = run([begin(["a"], false)]).state;
	assert.deepEqual(run([look()], started).actions, []);
	assert.deepEqual(reduceStop(idleStop(), look()).actions, []);
});

test("PRD-001.R38: the ledger keeps a task running until a terminal status, whatever else is said of it", () => {
	let ledger = emptyLedger();
	const apply = (signal) => (ledger = ledgerAfter(ledger, signal));
	apply({ kind: "seen", tasks: running("a", "b") });
	apply(taskSignal({ type: "system", subtype: "task_notification", task_id: "a", status: "weird" }));
	apply(taskSignal({ type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "b" }] }));
	assert.deepEqual(runningIn(ledger), ["a", "b"]);
	apply(taskSignal({ type: "system", subtype: "task_updated", task_id: "a", patch: { status: "killed" } }));
	assert.deepEqual(runningIn(ledger), ["b"]);
	// An end is final: a later sighting of an ended task is no new task.
	apply({ kind: "seen", tasks: running("a") });
	assert.deepEqual(runningIn(ledger), ["b"]);
	assert.equal(ledgerAfter(ledger, { kind: "ended", taskId: "a" }), ledger);
});

test("PRD-001.R38: task ids that name Object members are tasks like any other, in the ledger and in the stop", () => {
	for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
		const started = taskSignal({ type: "system", subtype: "task_started", task_id: id });
		let ledger = ledgerAfter(emptyLedger(), started);
		assert.deepEqual(runningIn(ledger), [id], id);
		// A stop that begins with it waits for it and clears only once it ended.
		const begun = run([begin([id], false), look()]);
		assert.ok(begun.types.includes("stopTask"), id);
		assert.ok(!begun.types.includes("clear"), id);
		const ended = run([begin([id], false), message({ kind: "ended", taskId: id }), look()]);
		assert.deepEqual(ended.types.slice(-2), ["disarm", "clear"], id);
		ledger = ledgerAfter(ledger, { kind: "ended", taskId: id });
		assert.deepEqual(runningIn(ledger), [], id);
	}
	// A listing of other tasks does not make a member name a running task.
	const listed = run([begin(["a"], false), seen("b")]);
	assert.equal(stateOf(listed.state, "constructor"), undefined);
});

test("PRD-001.R38: the ledger keeps what it knew of a task, so an omitted agent still counts as an agent", () => {
	let ledger = emptyLedger();
	ledger = ledgerAfter(ledger, taskSignal({ type: "system", subtype: "task_started", task_id: "ag", task_type: "local_agent", description: "Survey" }));
	// The run bar drops it at a notification with an unknown status; the ledger still holds it.
	ledger = ledgerAfter(ledger, taskSignal({ type: "system", subtype: "task_notification", task_id: "ag", status: "weird" }));
	const [task] = unfinishedTasks(ledger, []);
	assert.equal(task.taskType, "local_agent");
	assert.equal(task.description, "Survey");
	assert.equal(task.taskId, "ag");
	// Omission is still no end.
	assert.deepEqual(runningIn(ledger), ["ag"]);
});

test("PRD-001.R38: a turn queued behind one that ended before the stop began is waited for at the begin", () => {
	const begun = run([{ type: "begin", generation: G, taskIds: [], turn: false, queued: true }]);
	assert.ok(!begun.types.includes("settle"));
	assert.equal(begun.state.queued, true);
	const next = run([turn(true), turn(false)], begun.state);
	assert.deepEqual(next.types, ["interrupt", "settle"]);
});

test("PRD-001.R38: signalOf reads the parsed events", () => {
	assert.deepEqual(signalOf({ type: "started", task: { taskId: "t", status: "running" } }), { kind: "seen", tasks: running("t") });
	assert.equal(signalOf({ type: "running", tasks: [] }), null);
	assert.equal(signalOf({ type: "updated", taskId: "t", status: null }), null);
	assert.equal(signalOf({ type: "ended", taskId: null, toolUseId: null, report: { status: "stopped" } }), null);
});

test("PRD-001.R38: what a /clear stops comes from terminal statuses, not the run bar", () => {
	let ledger = emptyLedger();
	for (const message of [
		{ type: "system", subtype: "task_started", task_id: "shown", task_type: "local_agent" },
		{ type: "system", subtype: "task_started", task_id: "unknown-end" },
		{ type: "system", subtype: "task_started", task_id: "killed" },
		{ type: "system", subtype: "task_started", task_id: "done" },
	]) ledger = ledgerAfter(ledger, taskSignal(message));
	// The bar drops "unknown-end" at a notification whose status is no known end.
	ledger = ledgerAfter(ledger, taskSignal({ type: "system", subtype: "task_notification", task_id: "unknown-end", status: "weird" }));
	// An update with a terminal status ends "killed", though the bar keeps its row.
	ledger = ledgerAfter(ledger, taskSignal({ type: "system", subtype: "task_updated", task_id: "killed", patch: { status: "killed" } }));
	ledger = ledgerAfter(ledger, taskSignal({ type: "system", subtype: "task_notification", task_id: "done", status: "completed" }));
	const bar = [
		{ taskId: "shown", status: "running", taskType: "local_agent" },
		{ taskId: "killed", status: "killed" },
	];
	assert.deepEqual(unfinishedTasks(ledger, bar), [
		{ taskId: "shown", status: "running", taskType: "local_agent" },
		{ taskId: "unknown-end", status: "running" },
	]);
});
