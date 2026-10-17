import test from "node:test";
import assert from "node:assert/strict";

const { countTasks, settleOnce, stopAskMode, stopTitle, STOP_BODY, STOP_CANCEL, STOP_CONFIRM, STOP_FAILED } = await import("./.build/state/clear-dialog.mjs");

test("PRD-001.R38: a stop question is asked in the tab shown, waits for a tab that is not shown, and is refused while one is open", () => {
	assert.equal(stopAskMode(true, false), "ask");
	assert.equal(stopAskMode(false, false), "wait");
	// Asked later, when the tab is shown, it meets the same rule again.
	assert.equal(stopAskMode(false, true), "wait");
	assert.equal(stopAskMode(true, true), "refuse");
});

const agent = { taskType: "local_agent" };
const shell = { taskType: "local_bash" };

test("PRD-001.R38: settleOnce resolves before returning focus, survives a focus throw and ignores a second answer", () => {
	const seen = [];
	const settle = settleOnce(
		(answer) => seen.push(`resolve ${answer}`),
		() => {
			seen.push("focus");
			throw new Error("focus");
		}
	);
	settle("cancel");
	settle("stop");
	assert.deepEqual(seen, ["resolve cancel", "focus"]);
});

test("PRD-001.R38: agents are counted by task type, every other task is a background task", () => {
	assert.deepEqual(countTasks([agent, shell, {}, agent]), { agents: 2, tasks: 2 });
	assert.deepEqual(countTasks([]), { agents: 0, tasks: 0 });
});

test("PRD-001.R38: the title names the agents, the background tasks, or both joined by 'and'", () => {
	assert.equal(stopTitle({ agents: 1, tasks: 0 }), "1 agent is still running");
	assert.equal(stopTitle({ agents: 2, tasks: 0 }), "2 agents are still running");
	assert.equal(stopTitle({ agents: 0, tasks: 1 }), "1 background task is still running");
	assert.equal(stopTitle({ agents: 0, tasks: 3 }), "3 background tasks are still running");
	assert.equal(stopTitle({ agents: 2, tasks: 1 }), "2 agents and 1 background task are still running");
	assert.equal(stopTitle({ agents: 1, tasks: 1 }), "1 agent and 1 background task are still running");
	assert.equal(stopTitle({ agents: 1, tasks: 2 }), "1 agent and 2 background tasks are still running");
	assert.equal(stopTitle({ agents: 0, tasks: 0 }), null);
});

test("PRD-001.R38: the dialog's words", () => {
	assert.equal(STOP_BODY, "Clearing stops them. What they reported so far stays above, dimmed.");
	assert.equal(STOP_CONFIRM, "Stop and clear");
	assert.equal(STOP_CANCEL, "Cancel");
	assert.equal(STOP_FAILED, "Could not stop every agent, so the context was not cleared.");
});
