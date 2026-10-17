import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Fake timers first: the module takes the host's setTimeout when it loads.
mock.timers.enable({ apis: ["setTimeout"] });
const { clearRepeatingTimer, clearTimer, setRepeatingTimer, setTimer, withDeadline } = await import(
	"./.build/timers.mjs"
);
const { allowAfterRead } = await import("./.build/settings-core.mjs");

/** Let pending promise callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("PRD-002.R6: a pre-edit read that never settles gives up at its deadline", async () => {
	let settled;
	void withDeadline(new Promise(() => {}), 5000, null).then((value) => {
		settled = { value };
	});
	mock.timers.tick(4999);
	await flush();
	assert.equal(settled, undefined);
	mock.timers.tick(1);
	await flush();
	assert.deepEqual(settled, { value: null });
});

test("PRD-002.R6: a read that lands after its deadline is ignored", async () => {
	let finish;
	const late = withDeadline(
		new Promise((resolve) => {
			finish = resolve;
		}),
		5000,
		null
	);
	mock.timers.tick(5000);
	finish({ before: "late" });
	assert.equal(await late, null);
});

test("PRD-002.R6: a read within its deadline, or one that fails, settles the deadline", async () => {
	assert.deepEqual(await withDeadline(Promise.resolve({ before: "x" }), 5000, null), { before: "x" });
	assert.equal(await withDeadline(Promise.reject(new Error("EIO")), 5000, null), null);
});

test("PRD-002.R6: an Auto-approve answer waits at most the read's deadline", async () => {
	const input = { file_path: "note.md" };
	let answer;
	void allowAfterRead(withDeadline(new Promise(() => {}), 5000, null), input).then((result) => {
		answer = result;
	});
	await flush();
	assert.equal(answer, undefined);
	mock.timers.tick(5000);
	await flush();
	assert.deepEqual(answer, { behavior: "allow", updatedInput: input });
});

test("ADR-016: a timer runs on the window it is given", () => {
	const calls = [];
	const win = {
		setTimeout: (callback, ms) => (calls.push(["setTimeout", ms]), 7),
		clearTimeout: (handle) => calls.push(["clearTimeout", handle]),
		setInterval: (callback, ms) => (calls.push(["setInterval", ms]), 8),
		clearInterval: (handle) => calls.push(["clearInterval", handle]),
	};
	clearTimer(setTimer(() => undefined, 50, win), win);
	clearRepeatingTimer(setRepeatingTimer(() => undefined, 1000, win), win);
	assert.deepEqual(calls, [
		["setTimeout", 50],
		["clearTimeout", 7],
		["setInterval", 1000],
		["clearInterval", 8],
	]);
});
