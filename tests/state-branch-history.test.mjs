import test from "node:test";
import assert from "node:assert/strict";

const { BRANCH_TITLE, holdsSession, latestPrompt, pendingBranch, branchRecord, withBranch, isBranchIntent, stripBranch, summarizedAway, SUMMARIZED_BRANCH_TITLE } = await import("./.build/state/branch-history.mjs");

test("PRD-002.R15: a branch's rewind names the latest prompt the source session recorded, else none", () => {
	const messages = [
		{ kind: "user", text: "one" },
		{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011", sessionId: "s1" },
		{ kind: "user", text: "two" },
		{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000012", sessionId: "s1" },
		{ kind: "user", text: "elsewhere" },
		{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000013", sessionId: "s2" },
		// A turn that ended without a result and without an echo records no uuid.
		{ kind: "meta", turn: 4 },
	];
	assert.equal(latestPrompt(messages, "s1"), "00000000-0000-4000-8000-000000000012");
	assert.equal(latestPrompt(messages, "s2"), "00000000-0000-4000-8000-000000000013");
	assert.equal(latestPrompt(messages, "s3"), null);
});

test("PRD-002.R15: a turn's last echoed prompt, queued or steered, outranks its first, crashed turns included", () => {
	const messages = [
		{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011", lastPromptUuid: "00000000-0000-4000-8000-00000000001b", sessionId: "s1" },
		{ kind: "meta", turn: 2, lastPromptUuid: "00000000-0000-4000-8000-000000000012", sessionId: "s1" },
	];
	assert.equal(latestPrompt(messages, "s1"), "00000000-0000-4000-8000-000000000012");
	assert.equal(latestPrompt(messages.slice(0, 1), "s1"), "00000000-0000-4000-8000-00000000001b");
});

test("PRD-002.R15: records from before sessions were recorded name their last uuid", () => {
	const legacy = [
		{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011" },
		{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000012" },
	];
	assert.equal(latestPrompt(legacy, "s1"), "00000000-0000-4000-8000-000000000012");
	// A later record of another session is skipped; an unmarked one counts.
	assert.equal(latestPrompt([...legacy, { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000019", sessionId: "s2" }], "s1"), "00000000-0000-4000-8000-000000000012");
	assert.equal(latestPrompt([{ kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011", sessionId: "s1" }, ...legacy], "s1"), "00000000-0000-4000-8000-000000000012");
});

const UUID_A = "00000000-0000-4000-8000-00000000000a";
const UUID_B = "00000000-0000-4000-8000-00000000000b";
const UUID_C = "00000000-0000-4000-8000-00000000000c";

test("PRD-002.R15: after a clear, the latest prompt is read from the segment of the session asked about", () => {
	const messages = [
		{ kind: "meta", rewindUuid: UUID_A, sessionId: "s1" },
		{ kind: "clear", at: 1, sessionId: "s1" },
		{ kind: "meta", rewindUuid: UUID_B, sessionId: "s2" },
	];
	assert.equal(latestPrompt(messages, "s1"), UUID_A);
	assert.equal(latestPrompt(messages, "s2"), UUID_B);
});

test("PRD-002.R15: a record without a session belongs to the session the first later clear or fresh start ended", () => {
	const legacy = [
		{ kind: "meta", rewindUuid: UUID_A },
		{ kind: "clear", at: 1, sessionId: "s1" },
		{ kind: "meta", rewindUuid: UUID_B },
		{ kind: "fresh-start", at: 2, sessionId: "s2" },
		{ kind: "meta", rewindUuid: UUID_C },
	];
	assert.equal(latestPrompt(legacy, "s1"), UUID_A);
	assert.equal(latestPrompt(legacy, "s2"), UUID_B);
	// No boundary follows the last: it is the live segment, any session not ended before it.
	assert.equal(latestPrompt(legacy, "s3"), UUID_C);
	// A boundary naming no session leaves the segment's turns unclaimed.
	assert.equal(latestPrompt([{ kind: "meta", rewindUuid: UUID_A }, { kind: "clear", at: 1 }], "s1"), null);
});

test("PRD-002.R15: a session a clear ended records nothing after it, whether or not records carry ids", () => {
	const noIds = [{ kind: "meta", rewindUuid: UUID_A }, { kind: "clear", at: 1, sessionId: "s1" }, { kind: "meta", rewindUuid: UUID_B }];
	assert.equal(latestPrompt(noIds, "s1"), UUID_A);
	const twice = [
		{ kind: "meta", rewindUuid: UUID_A, sessionId: "s1" },
		{ kind: "clear", at: 1, sessionId: "s1" },
		{ kind: "meta", rewindUuid: UUID_B, sessionId: "s2" },
		{ kind: "clear", at: 2, sessionId: "s2" },
		{ kind: "meta", rewindUuid: UUID_C, sessionId: "s3" },
	];
	assert.equal(latestPrompt(twice, "s1"), UUID_A);
	assert.equal(latestPrompt(twice, "s2"), UUID_B);
	assert.equal(latestPrompt(twice, "s3"), UUID_C);
	// The same id recorded again after its ending clear is not read.
	const again = [...twice.slice(0, 2), { kind: "meta", rewindUuid: UUID_C, sessionId: "s1" }];
	assert.equal(latestPrompt(again, "s1"), UUID_A);
});

test("PRD-002.R15: a conversation holds a session in any segment its records name", () => {
	const messages = [
		{ kind: "meta", rewindUuid: UUID_A, sessionId: "s1" },
		{ kind: "clear", at: 1, sessionId: "s1" },
		{ kind: "fresh-start", at: 2, sessionId: "s0" },
		{ kind: "meta", rewindUuid: UUID_B, sessionId: "s2" },
	];
	for (const id of ["s0", "s1", "s2"]) assert.equal(holdsSession(messages, id), true);
	assert.equal(holdsSession(messages, "s3"), false);
	assert.equal(holdsSession([{ kind: "user", text: "s1", sessionId: "s1" }], "s1"), false);
});

test("PRD-002.R15: every Branch button is titled with the requirement's wording", () => {
	assert.equal(BRANCH_TITLE, "Branch from just before this turn, in a new tab");
});

const SRC = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
const TARGET = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const LATEST = "9e8d7c6b-5a4f-4e3d-a2c1-b0a9f8e7d6c5";
const FAILURE = { kind: "meta", error: "Could not branch", branchSession: SRC, branchTarget: TARGET, branchLatest: LATEST };

test("PRD-002.R15: a branch that never started is found again from its last failure record", () => {
	const messages = [{ kind: "user", text: "hi" }, { kind: "meta", turn: 1 }, FAILURE];
	assert.deepEqual(pendingBranch({ sessionId: null, messages }), { source: SRC, target: TARGET, latest: LATEST });
	const { branchLatest: _latest, ...unknown } = FAILURE;
	assert.deepEqual(pendingBranch({ sessionId: null, messages: [unknown] }), { source: SRC, target: TARGET, latest: null });
	// The branch started after all: its own session resumes.
	assert.equal(pendingBranch({ sessionId: "fork", messages }), null);
	assert.equal(pendingBranch({ sessionId: null, messages: [{ kind: "user", text: "hi" }] }), null);
});

test("PRD-001.R38: dropping a branch removes its intent record and the branch fields of a failure, so a reopen makes none", () => {
	const intent = branchRecord({ source: SRC, target: TARGET, latest: LATEST });
	const messages = [{ kind: "user", text: "/help" }, intent, { ...FAILURE }, { kind: "meta", turn: 1 }];
	stripBranch(messages);
	assert.deepEqual(messages, [{ kind: "user", text: "/help" }, { kind: "meta", error: "Could not branch", branchTarget: TARGET }, { kind: "meta", turn: 1 }]);
	assert.equal(pendingBranch({ sessionId: null, messages }), null);
});

test("PRD-002.R15: a stored branch whose session or message ids are not lowercase UUIDs is not made", () => {
	for (const [field, value] of [
		["branchSession", "--dangerously-skip-permissions"],
		["branchSession", "a b"],
		["branchSession", SRC.toUpperCase()],
		["branchSession", "fake-source"],
		["branchTarget", "-x"],
		["branchTarget", ""],
		["branchTarget", "u-branch"],
		["branchLatest", `${LATEST}\n`],
		["branchLatest", "u-latest"],
	])
		assert.equal(pendingBranch({ sessionId: null, messages: [{ ...FAILURE, [field]: value }] }), "invalid", `${field}=${value}`);
	// No source: the retry was dropped (a clear), only the not-sent mark remains.
	assert.equal(pendingBranch({ sessionId: null, messages: [{ ...FAILURE, branchSession: undefined }] }), null);
});

test("PRD-002.R15: a stored prompt id that is not a lowercase UUID is not offered as the latest seen", () => {
	assert.equal(latestPrompt([{ kind: "meta", rewindUuid: "u1", sessionId: "s1" }], "s1"), null);
	assert.equal(latestPrompt([{ kind: "meta", rewindUuid: LATEST, lastPromptUuid: "--x", sessionId: "s1" }], "s1"), null);
});

test("PRD-002.R15: a later error without branch fields does not hide the branch still to make", () => {
	const messages = [FAILURE, { kind: "meta", error: "Claude Code exited with code 1" }];
	assert.deepEqual(pendingBranch({ sessionId: null, messages }), { source: SRC, target: TARGET, latest: LATEST });
	// A turn of the fork's own session supersedes the branch record.
	assert.equal(pendingBranch({ sessionId: null, messages: [FAILURE, { kind: "meta", turn: 1, sessionId: "fork" }] }), null);
});

test("PRD-002.R15: a branch recorded ahead of the first record, before any rewind, is found again", () => {
	const intent = branchRecord({ source: SRC, target: TARGET, latest: LATEST });
	assert.deepEqual(intent, { kind: "meta", branchSession: SRC, branchTarget: TARGET, branchLatest: LATEST });
	assert.deepEqual(pendingBranch({ sessionId: null, messages: [intent] }), { source: SRC, target: TARGET, latest: LATEST });
	assert.deepEqual(branchRecord({ source: SRC, target: TARGET, latest: null }, "failed"), {
		kind: "meta",
		error: "failed",
		branchSession: SRC,
		branchTarget: TARGET,
	});
	assert.equal(pendingBranch({ sessionId: "fork", messages: [intent] }), null);
	// The first send recorded the branch, then its prompt; the tab closed during the first rewind.
	const closed = [intent, { kind: "user", text: "hi" }];
	assert.deepEqual(pendingBranch({ sessionId: null, messages: closed }), { source: SRC, target: TARGET, latest: LATEST });
	// Its turn's end record, written at the close, carries the branch too and keeps it pending; it is not a bare branch record.
	const end = withBranch({ kind: "meta", turn: 1 }, { source: SRC, target: TARGET, latest: LATEST });
	assert.equal(isBranchIntent(end), false);
	assert.equal(isBranchIntent(intent), true);
	assert.deepEqual(pendingBranch({ sessionId: null, messages: [intent, { kind: "user", text: "hi" }, end] }), {
		source: SRC,
		target: TARGET,
		latest: LATEST,
	});
});

test("PRD-002.R15: a compaction after a turn's record summarized the turn away; the turn that triggered it and later ones were not", () => {
	const t1 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011", sessionId: "s1" };
	const t2 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000012", sessionId: "s1" };
	// An automatic compaction inside turn 3 is recorded before that turn's end record.
	const t3 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000013", sessionId: "s1" };
	// A manual /compact turn: its rewind uuid is the stdout message, after the boundary.
	const t4 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000014", sessionId: "s1" };
	const t5 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000015", sessionId: "s1" };
	const messages = [{ kind: "user", text: "a" }, t1, t2, { kind: "compaction", trigger: "auto" }, t3, { kind: "compaction", trigger: "manual" }, t4, t5];
	assert.equal(summarizedAway(messages, t1), true);
	assert.equal(summarizedAway(messages, t2), true);
	assert.equal(summarizedAway(messages, t3), true);
	assert.equal(summarizedAway(messages, t4), false);
	assert.equal(summarizedAway(messages, t5), false);
});

test("PRD-002.R15: a compaction after a clear or a fresh start belongs to the later session and leaves earlier turns offered", () => {
	const t1 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011", sessionId: "s1" };
	const t2 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000012", sessionId: "s2" };
	for (const kind of ["clear", "fresh-start"]) {
		const messages = [t1, { kind }, t2, { kind: "compaction" }];
		assert.equal(summarizedAway(messages, t1), false, kind);
		assert.equal(summarizedAway(messages, t2), true, kind);
	}
});

test("PRD-002.R15: a record the conversation does not hold, a conversation without compactions and a missing record are not summarized away", () => {
	const t1 = { kind: "meta", rewindUuid: "00000000-0000-4000-8000-000000000011" };
	assert.equal(summarizedAway([t1], t1), false);
	assert.equal(summarizedAway([{ kind: "compaction" }], { ...t1 }), false);
	assert.equal(summarizedAway([t1, { kind: "compaction" }], null), false);
	assert.match(SUMMARIZED_BRANCH_TITLE, /compact/i);
});
