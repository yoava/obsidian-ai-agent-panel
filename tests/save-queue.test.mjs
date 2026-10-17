import test from "node:test";
import assert from "node:assert/strict";

const { serializeSaves } = await import("./.build/save-queue.mjs");

/** A write that finishes only when the test says so, recording what it saw. */
function controlledWrite(state) {
	const runs = [];
	const write = () =>
		new Promise((resolve, reject) => {
			runs.push({ saw: state.value, resolve, reject });
		});
	return { runs, write };
}

test("PRD-001.R24: settings saves run one at a time, the queued one with the latest state", async () => {
	const state = { value: "a" };
	const { runs, write } = controlledWrite(state);
	const save = serializeSaves(write);
	const first = save();
	state.value = "b";
	const second = save();
	state.value = "c";
	const third = save();
	assert.equal(runs.length, 1, "a second save started while one was in flight");
	assert.equal(second, third, "saves made meanwhile share one queued run");
	runs[0].resolve();
	await first;
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(runs.length, 2);
	assert.equal(runs[1].saw, "c", "the queued save split an older state");
	runs[1].resolve();
	await third;
});

test("PRD-001.R24: a failed save still lets the queued save run", async () => {
	const state = { value: 1 };
	const { runs, write } = controlledWrite(state);
	const save = serializeSaves(write);
	const first = save();
	const second = save();
	runs[0].reject(new Error("disk full"));
	await assert.rejects(first, /disk full/);
	await new Promise((resolve) => setImmediate(resolve));
	assert.equal(runs.length, 2);
	runs[1].resolve();
	await second;
	// Idle again: the next save runs at once.
	void save();
	assert.equal(runs.length, 3);
	runs[2].resolve();
});

test("PRD-001.R24: a save made right after another settles never runs beside the queued one", async () => {
	let active = 0;
	let most = 0;
	const write = () => {
		active++;
		most = Math.max(most, active);
		return new Promise((resolve) =>
			setTimeout(() => {
				active--;
				resolve();
			}, 5)
		);
	};
	const save = serializeSaves(write);
	const first = save();
	const queued = save();
	await first;
	// The gap between the first write settling and the queued one starting.
	const late = save();
	await Promise.all([queued, late]);
	assert.equal(most, 1, "two settings writes ran at once");
});
