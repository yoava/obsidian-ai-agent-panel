import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, headRings, workingLine } from "./.build/state/working-line.mjs";

test("PRD-001.R15: the working line shows while Claude works, reading Working…, Thinking… or Writing… with the elapsed time", () => {
	assert.deepEqual(workingLine({ activity: "working", thinking: false, startedAt: 0 }, 42_400), { label: "Working…", elapsed: "0:42" });
	assert.deepEqual(workingLine({ activity: "working", thinking: true, startedAt: 0 }, 3_000), { label: "Thinking…", elapsed: "0:03" });
	assert.deepEqual(workingLine({ activity: "writing", thinking: false, startedAt: 0 }, 185_000), { label: "Writing…", elapsed: "3:05" });
	assert.deepEqual(workingLine({ activity: "working", thinking: false, startedAt: null }, 5), { label: "Working…", elapsed: "" }, "a start not known");
});

test("PRD-001.R15: the working line's elapsed time reads as the boards' clock, m:ss, then h:mm:ss", () => {
	assert.equal(formatClock(0), "0:00");
	assert.equal(formatClock(999), "0:00");
	assert.equal(formatClock(42_000), "0:42");
	assert.equal(formatClock(600_000), "10:00");
	assert.equal(formatClock(3_599_000), "59:59");
	assert.equal(formatClock(3_600_000), "1:00:00");
	assert.equal(formatClock(3_725_000), "1:02:05");
	assert.equal(formatClock(-5), "0:00", "a clock behind the start");
});

test("PRD-001.R15: the working line is gone while a card waits and once the turn ends", () => {
	assert.equal(workingLine({ activity: "waiting", thinking: false, startedAt: 0 }, 5), null);
	assert.equal(workingLine({ activity: "waiting", thinking: true, startedAt: 0 }, 5), null);
	assert.equal(workingLine({ activity: "idle", thinking: false, startedAt: 0 }, 5), null);
});

test("PRD-001.R15: the head's mark rings only while the turn runs and no working line shows: between the send and the CLI's answer", () => {
	assert.equal(headRings(true, "idle"), true);
	assert.equal(headRings(true, "working"), false, "the working line is the one moving cue");
	assert.equal(headRings(true, "writing"), false);
	assert.equal(headRings(true, "waiting"), false);
	assert.equal(headRings(false, "idle"), false);
	assert.equal(headRings(false, "working"), false);
});
