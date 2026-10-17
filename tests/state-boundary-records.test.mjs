import test from "node:test";
import assert from "node:assert/strict";

const { clearDue, turnSource, clearRecord, freshStartRecord, freshStartDue, fileVersion, isBoundary, isStoredVersion, FOREIGN_SESSION_NOTICE, FOREIGN_BRANCH_TITLE } =
	await import("./.build/state/boundary-records.mjs");

const A = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
const turn = (n = 1) => ({ kind: "meta", turn: n });
const prompt = { kind: "user", text: "hi", sentAt: 5 };

test("PRD-003.R9: the notice and the Branch title are the wording the requirements give", () => {
	assert.equal(
		FOREIGN_SESSION_NOTICE,
		"This conversation's Claude Code session is not available on this device, so this message starts a fresh one (the messages above are kept)."
	);
	assert.equal(FOREIGN_BRANCH_TITLE, "This turn's Claude Code session is not available on this device");
});

test("PRD-003.R1: a fresh-start record holds its time and the id not resumed, a rejected string as stored", () => {
	assert.deepEqual(freshStartRecord(9, A), { kind: "fresh-start", at: 9, sessionId: A });
	assert.deepEqual(freshStartRecord(9), { kind: "fresh-start", at: 9 });
	for (const rejected of ["--resume", "", "ABC"]) assert.deepEqual(freshStartRecord(9, rejected), { kind: "fresh-start", at: 9, sessionId: rejected });
	for (const absent of [null, 7, undefined]) assert.deepEqual(freshStartRecord(9, absent), { kind: "fresh-start", at: 9 });
});

test("PRD-002.R15: a branch forks the turn's own session and profile, the conversation's or the tab's only where the turn has none", () => {
	const B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
	const conversation = { sessionId: B, profileId: "conv" };
	// After a fresh start the conversation and the live session are another session's.
	assert.deepEqual(turnSource({ sessionId: A, profileId: "old" }, [], B, conversation, "tab"), { sessionId: A, profileId: "old" });
	// A turn from before 0.6 stores neither: the live session, the conversation's profile.
	assert.deepEqual(turnSource({}, [], B, conversation, "tab"), { sessionId: B, profileId: "conv" });
	assert.deepEqual(turnSource(null, [], null, conversation, "tab"), { sessionId: B, profileId: "conv" });
	assert.deepEqual(turnSource(null, [], null, { sessionId: null }, "tab"), { sessionId: null, profileId: "tab" });
	// A rejected id is not hidden by a later good one.
	assert.equal(turnSource({ sessionId: "--bad" }, [], B, conversation, "tab").sessionId, "--bad");
});

test("PRD-002.R15: a turn recorded without a session takes the first later boundary's id before the live and stored ones", () => {
	const B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
	const legacy = { kind: "meta", turn: 1 };
	const messages = [legacy, { kind: "fresh-start", at: 2, sessionId: A }, { kind: "meta", turn: 2, sessionId: B }];
	const conversation = { sessionId: B };
	assert.equal(turnSource(legacy, messages, B, conversation, "tab").sessionId, A);
	// The first boundary decides, even when it names none: no session is offered ("" fails the grammar); no boundary means the live id.
	assert.equal(turnSource(legacy, [legacy, { kind: "clear", at: 2 }, { kind: "fresh-start", at: 3, sessionId: A }], B, conversation, "tab").sessionId, "");
	assert.equal(turnSource(legacy, [legacy, { kind: "fresh-start", at: 2, sessionId: 7 }], B, conversation, "tab").sessionId, "");
	assert.equal(turnSource(legacy, [legacy], null, conversation, "tab").sessionId, B);
	// A boundary before the turn does not count.
	assert.equal(turnSource(legacy, [{ kind: "fresh-start", at: 1, sessionId: A }, legacy], null, conversation, "tab").sessionId, B);
});

test("PRD-003.R1: a fresh start is due when the last turn follows the last boundary", () => {
	assert.equal(freshStartDue([prompt, turn()]), true);
	assert.equal(freshStartDue([turn(), { kind: "assistant", text: "x" }]), true);
	assert.equal(freshStartDue([prompt]), true, "a prompt whose turn never ended");
	assert.equal(freshStartDue([turn(), { kind: "fresh-start", at: 1 }]), false, "two fresh starts never stack");
	assert.equal(freshStartDue([turn(), { kind: "clear", at: 1 }]), false);
	assert.equal(freshStartDue([turn(), { kind: "clear", at: 1 }, turn(2)]), true);
	assert.equal(freshStartDue([turn(), { kind: "fresh-start", at: 1 }, prompt]), true);
});

test("PRD-001.R38: a clear is due only when a message to Claude Code follows the conversation's start or last clear", () => {
	assert.equal(clearDue([prompt]), true);
	assert.equal(clearDue([prompt, turn()]), true);
	assert.equal(clearDue([prompt, turn(), { kind: "clear", at: 1 }]), false, "nothing since the last clear");
	assert.equal(clearDue([prompt, turn(), { kind: "clear", at: 1 }, { kind: "user", text: "/status" }, { kind: "bash", command: "ls" }]), false, "a panel command and a ! run are no message to Claude Code");
	assert.equal(clearDue([prompt, turn(), { kind: "clear", at: 1 }, prompt]), true);
	assert.equal(clearDue([prompt, turn(), { kind: "fresh-start", at: 1 }]), false);
	assert.equal(clearDue([]), false);
	assert.equal(freshStartDue, clearDue, "a fresh start is due on the same condition");
});

test("PRD-003.R1: no fresh start is due in a conversation with no turn", () => {
	assert.equal(freshStartDue([]), false);
	assert.equal(freshStartDue([{ kind: "user", text: "/status" }]), false, "a panel command is no turn");
	assert.equal(freshStartDue([{ kind: "bash", command: "ls" }]), false);
	assert.equal(freshStartDue([{ kind: "meta", branchSession: A }]), false, "a branch record alone");
	assert.equal(freshStartDue([{ kind: "meta", error: "x" }]), false, "a session error alone");
});

test("PRD-003.R1: a file is written as version 2 while a clear or fresh start exists, else version 1", () => {
	assert.equal(fileVersion([]), 1);
	assert.equal(fileVersion([prompt, turn()]), 1);
	assert.equal(fileVersion([prompt, turn(), { kind: "fresh-start", at: 1 }]), 2);
	assert.equal(fileVersion([prompt, { kind: "clear", at: 1 }]), 2);
	assert.equal(fileVersion([prompt, { kind: "compaction", at: 1 }]), 1);
	assert.equal(isBoundary({ kind: "clear" }), true);
	assert.equal(isBoundary({ kind: "fresh-start" }), true);
	assert.equal(isBoundary({ kind: "meta" }), false);
});

test("PRD-003.R4: readers accept version 1 and 2 and no other", () => {
	assert.equal(isStoredVersion(1), true);
	assert.equal(isStoredVersion(2), true);
	for (const other of [0, 3, "1", "2", null, undefined, 1.5, {}]) assert.equal(isStoredVersion(other), false, String(other));
});

test("PRD-003.R1: a clear record holds its time and the id of the session it ended, a rejected string as stored", () => {
	assert.deepEqual(clearRecord(9, A), { kind: "clear", at: 9, sessionId: A });
	assert.deepEqual(clearRecord(9), { kind: "clear", at: 9 });
	for (const rejected of ["--resume", "", "ABC"]) assert.deepEqual(clearRecord(9, rejected), { kind: "clear", at: 9, sessionId: rejected });
	for (const absent of [null, 7, undefined]) assert.deepEqual(clearRecord(9, absent), { kind: "clear", at: 9 });
	assert.equal(isBoundary(clearRecord(9, A)), true);
});
