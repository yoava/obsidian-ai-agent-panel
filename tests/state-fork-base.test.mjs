import test from "node:test";
import assert from "node:assert/strict";

const { decideForkBase, sessionTotal, forkTarget, costNote, NO_BASE_NOTE, ESTIMATE_NOTE } = await import(
	"./.build/state/fork-base.mjs"
);

const meta = (sessionId, costUsd, extra = {}) => ({ kind: "meta", sessionId, costUsd, ...extra });
const start = (over = {}) => ({ total: 0.5, turnRunning: false, began: true, otherTabRan: false, tasksRunning: false, ...over });

test("PRD-005.R7: the base is the source's latest recorded total, exact when the panel saw the whole session", () => {
	assert.deepEqual(decideForkBase(start()), { costUsd: 0.5 });
	assert.deepEqual(decideForkBase(start({ total: 0 })), { costUsd: 0 }, "a recorded zero is a base");
});

test("PRD-005.R7: no recorded total, or a turn running in the source, gives no base", () => {
	assert.equal(decideForkBase(start({ total: null })), null);
	assert.equal(decideForkBase(start({ turnRunning: true })), null);
	for (const total of [NaN, Infinity, -1]) assert.equal(decideForkBase(start({ total })), null);
});

test("PRD-005.R7: a session not begun here, an agent or task running, or another tab running it makes the base an estimate", () => {
	for (const over of [{ began: false }, { tasksRunning: true }, { otherTabRan: true }])
		assert.deepEqual(decideForkBase(start(over)), { costUsd: 0.5, estimate: true });
});

test("PRD-005.R7: the source's total is the latest meta record of that session; others are skipped", () => {
	const messages = [
		meta("s1", 0.1),
		meta("s2", 9),
		meta("s1", 0.3),
		{ kind: "meta", sessionId: "s1" },
		{ kind: "user", text: "x", sessionId: "s1", costUsd: 7 },
		meta("s1", "5"),
		meta("s1", NaN),
	];
	assert.equal(sessionTotal(messages, "s1"), 0.3);
	assert.equal(sessionTotal(messages, "s2"), 9);
	assert.equal(sessionTotal(messages, "s3"), null);
	assert.equal(sessionTotal([], "s1"), null);
});

test("PRD-005.R7: the base applies to the fork's own session only, once it is among the records", () => {
	const messages = [meta("f1", 0.6), meta("f2", 0.9)];
	assert.equal(forkTarget(messages, { costUsd: 0.5, sessionId: "f2" }), "f2");
	assert.equal(forkTarget(messages, { costUsd: 0.5, sessionId: "gone" }), null);
	assert.equal(forkTarget(messages, { costUsd: 0.5 }), null, "no id yet: nothing is taken off");
	assert.equal(forkTarget([{ kind: "user", text: "x" }], { costUsd: 0.5 }), null);
	assert.equal(forkTarget(messages, undefined), null);
});

test("PRD-005.R7: a branch without a base says its cost includes the source's; an estimate says it can; an exact base says nothing", () => {
	const branch = [{ kind: "meta", branchSession: "s1", branchTarget: "t" }, meta("f1", 0.6)];
	assert.equal(NO_BASE_NOTE, "Includes the cost of the conversation it branched from");
	assert.equal(ESTIMATE_NOTE, "Estimate: can include some cost of the conversation it branched from");
	assert.equal(costNote(branch, undefined), NO_BASE_NOTE);
	assert.equal(costNote(branch, { costUsd: 0.5, estimate: true }), ESTIMATE_NOTE);
	assert.equal(costNote(branch, { costUsd: 0.5 }), null);
	assert.equal(costNote([meta("s1", 1)], undefined), null, "an ordinary conversation has no note");
	assert.equal(costNote([], { costUsd: 0.5, estimate: true }), ESTIMATE_NOTE, "a stored base marks a branch whatever the records");
});
