import test from "node:test";
import assert from "node:assert/strict";

const { isCheckpointedTool, restorePoint, restoreButtonState, restoredNotice, restoreBefore, turnRestore } = await import(
	"./.build/restore.mjs"
);

const record = { rewindUuid: "u1", sessionId: "s1", profileId: "p1", edited: true };
const context = { sessionId: "s1", profileId: "p1", busy: false, restoring: false };

test("PRD-002.R13: the main agent's tools the CLI's checkpoints track mark a turn edited", () => {
	for (const name of ["Edit", "Write", "MultiEdit", "NotebookEdit"]) assert.equal(isCheckpointedTool(name), true, name);
	for (const name of ["Bash", "Read", "mcp__obsidian__obsidian_rename", "Task"]) assert.equal(isCheckpointedTool(name), false, name);
});

test("PRD-002.R14: a turn offers Restore files only with the full turn record", () => {
	assert.deepEqual(restorePoint(record), { uuid: "u1", sessionId: "s1", profileId: "p1" });
	for (const key of Object.keys(record)) assert.equal(restorePoint({ ...record, [key]: undefined }), null, key);
	// A record from before the switch: a legacy flag, no turn record.
	assert.equal(restorePoint({ restorable: true, turn: 3, rewindUuid: "u1" }), null);
});

test("PRD-002.R14: Restore files hides off the tab's session or profile and disables while busy", () => {
	const point = restorePoint(record);
	assert.deepEqual(restoreButtonState(point, context, false), { hidden: false, disabled: false });
	assert.equal(restoreButtonState(point, { ...context, sessionId: "s2" }, false).hidden, true);
	assert.equal(restoreButtonState(point, { ...context, sessionId: null }, false).hidden, true);
	assert.equal(restoreButtonState(point, { ...context, profileId: "p2" }, false).hidden, true);
	assert.equal(restoreButtonState(point, context, true).hidden, true);
	assert.equal(restoreButtonState(point, { ...context, busy: true }, false).disabled, true);
	assert.equal(restoreButtonState(point, { ...context, restoring: true }, false).disabled, true);
});

test("PRD-002.R14: the result names the files restored and those skipped", () => {
	assert.equal(restoredNotice(3, ["a", "b", "c"]), "Files restored: 3.");
	assert.equal(restoredNotice(3, ["a", "b"]), "Files restored: 2. 1 skipped.");
	// A reply without the list counts the preview's files.
	assert.equal(restoredNotice(3, undefined), "Files restored: 3.");
});

const turn = (prompt, overrides = {}) => ({ point: restorePoint(record), gone: false, prompt, ...overrides });

test("PRD-002.R18: Restore to before turn N runs the earliest turn whose Restore files shows, N its prompt", () => {
	const elsewhere = restorePoint({ ...record, sessionId: "s0" });
	// In the order the turns were recorded.
	const turns = [turn(null), turn(1, { point: elsewhere }), turn(2, { gone: true }), turn(3), turn(4)];
	const offer = restoreBefore(turns, context, false);
	assert.equal(offer.turn, turns[3]);
	assert.equal(offer.label, "Restore to before turn 3");
	assert.equal(offer.disabled, false);
	// The first recorded, whatever its number.
	const later = [turn(3), turn(1)];
	assert.equal(restoreBefore(later, context, false).turn, later[0]);
});

test("PRD-002.R18: after its conversation is deleted, a tab's later turns count on from its earlier prompts", () => {
	const user = (text) => ({ kind: "user", text });
	const out = { kind: "assistant", text: "…" };
	const edited = (turnNumber) => ({ kind: "meta", turn: turnNumber, ...record });
	// The tab's conversation: prompts 1 to 3; turns 2 and 3 offer Restore files.
	const deleted = [user("a"), out, { kind: "meta", turn: 1 }, user("b"), out, edited(2), user("c"), out, edited(3)];
	// Deleted from history, the tab records its next message in a new conversation, shown as prompt 4.
	const next = [user("d"), out, edited(1)];
	const turns = [turnRestore(deleted, 5, 0), turnRestore(deleted, 8, 0), turnRestore(next, 2, 3)];
	assert.deepEqual(
		turns.map((entry) => entry.prompt),
		[2, 3, 4]
	);
	assert.equal(turnRestore(deleted, 2, 0), null, "a turn without the full record offers no restore");
	// A turn running at the delete: its prompt was recorded before it, in the deleted record.
	assert.equal(turnRestore([out, edited(3)], 1, 3).prompt, 3);
	const offer = restoreBefore(turns, context, false);
	assert.equal(offer.turn, turns[0]);
	assert.equal(offer.label, "Restore to before turn 2");
});

test("PRD-002.R18: Restore to before turn N is left out while the change list is empty or no turn offers Restore files", () => {
	assert.equal(restoreBefore([turn(1)], context, true), null);
	assert.equal(restoreBefore([], context, false), null);
	assert.equal(restoreBefore([turn(1, { gone: true })], { ...context, profileId: "p2" }, false), null);
});

test("PRD-002.R18: Restore to before turn N is disabled while a turn or a restore runs, and says what it rewinds", () => {
	assert.equal(restoreBefore([turn(2)], { ...context, busy: true }, false).disabled, true);
	assert.equal(restoreBefore([turn(2)], { ...context, restoring: true }, false).disabled, true);
	assert.equal(
		restoreBefore([turn(2)], context, false).title,
		"Rewinds every file Claude edited from turn 2 on, including files this list does not show. " +
			"Changes by subagents, shell commands, vault tools and linked files stay."
	);
});

test("PRD-002.R14: Restore files hides on a turn before a clear, whatever the tab's session", () => {
	const point = restorePoint(record);
	assert.equal(restoreButtonState(point, context, false, true).hidden, true);
	assert.deepEqual(restoreButtonState(point, context, false, false), { hidden: false, disabled: false });
});

test("PRD-002.R14: a turn is before a clear when a clear record follows it, and not when only a fresh start does", () => {
	const user = { kind: "user", text: "a" };
	const edited = { kind: "meta", turn: 1, ...record };
	const flag = (...after) => turnRestore([user, edited, ...after], 1, 0).cleared;
	assert.equal(flag(), false);
	assert.equal(flag({ kind: "fresh-start", at: 1 }), false);
	assert.equal(flag({ kind: "user", text: "b" }, { kind: "clear", at: 1 }), true);
	// A clear before the turn does not hide it.
	assert.equal(turnRestore([{ kind: "clear", at: 1 }, user, edited], 2, 0).cleared, false);
});

test("PRD-002.R18: Restore to before turn N skips turns before a clear and is left out when none is after it", () => {
	const turns = [turn(1, { cleared: true }), turn(2, { cleared: true }), turn(3)];
	const offer = restoreBefore(turns, context, false);
	assert.equal(offer.turn, turns[2]);
	assert.equal(offer.label, "Restore to before turn 3");
	assert.equal(restoreBefore([turn(1, { cleared: true })], context, false), null);
});
