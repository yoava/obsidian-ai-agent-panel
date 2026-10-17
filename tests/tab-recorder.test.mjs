import { test } from "node:test";
import assert from "node:assert/strict";
import { Recorder } from "./.build/tab/recorder.mjs";

const FIELDS = { profileId: "p1", model: "", effort: "high", permissionMode: "default", permissionModePicked: undefined };

function recorder() {
	const tab = { conversation: null };
	const calls = { saves: 0, first: 0, prompts: 0 };
	const rec = new Recorder(tab, {
		queueSave: () => calls.saves++,
		fields: () => FIELDS,
		onFirstMessage: () => calls.first++,
		onPrompt: () => calls.prompts++,
	});
	return { tab, calls, rec };
}

test("PRD-001.R7: a long first prompt titles the conversation at a word, ended by an ellipsis", () => {
	const { rec, tab } = recorder();
	rec.recordPrompt({ kind: "user", text: `${"a".repeat(70)} ${"b".repeat(30)}`, sentAt: 1 });
	assert.equal(tab.conversation.title, `${"a".repeat(70)}…`);
});

test("PRD-003.R1: a prompt is recorded with its send time, and the first one titles the conversation", () => {
	const { tab, calls, rec } = recorder();
	rec.recordPrompt({ kind: "user", text: "Summarize this\nplease", sentAt: 1760184120000 });
	rec.recordPrompt({ kind: "user", text: "Then link it", sentAt: 1760184180000 });
	assert.equal(tab.conversation.title, "Summarize this");
	assert.deepEqual(tab.conversation.messages, [
		{ kind: "user", text: "Summarize this\nplease", sentAt: 1760184120000 },
		{ kind: "user", text: "Then link it", sentAt: 1760184180000 },
	]);
	assert.deepEqual(calls, { saves: 2, first: 1, prompts: 2 });
});

test("PRD-001.R7: a panel command or a ! run is recorded without titling the conversation", () => {
	const { tab, calls, rec } = recorder();
	rec.record({ kind: "user", text: "/status" });
	rec.record({ kind: "bash", command: "ls" });
	assert.equal(tab.conversation.title, "");
	assert.equal(tab.conversation.messages.length, 2);
	assert.equal(calls.prompts, 0);
});

test("PRD-003.R12: a conversation created by a pin starts with its first message", async () => {
	const { tab, rec } = recorder();
	const created = rec.ensureConversation();
	assert.equal(rec.ensureConversation(), created, "created once");
	assert.match(created.id, /^[a-z0-9]+-[a-z0-9]{1,6}$/);
	assert.deepEqual(
		{ ...created, id: "", createdAt: 0, updatedAt: 0 },
		{ version: 1, id: "", sessionId: null, title: "", createdAt: 0, updatedAt: 0, ...FIELDS, resolvedModel: "", messages: [] }
	);
	const pinnedAt = created.createdAt;
	await new Promise((resolve) => setTimeout(resolve, 5));
	rec.record({ kind: "assistant", text: "a" });
	assert.ok(tab.conversation.createdAt > pinnedAt);
	assert.equal(tab.conversation.updatedAt, tab.conversation.createdAt);
});

test("PRD-003.R3: a tool call's record changed in place saves again, while the conversation holds it", () => {
	const { tab, calls, rec } = recorder();
	const tool = { kind: "tool", name: "Read", input: {} };
	rec.record(tool);
	tool.result = "text";
	rec.changed(tool);
	assert.equal(calls.saves, 2);
	tab.conversation = { ...tab.conversation, messages: [] };
	rec.changed(tool);
	assert.equal(calls.saves, 2, "a detached conversation does not save it");
});

test("PRD-002.R15: a branch's record leads the conversation's first record of any kind, once, and an unused branch stores nothing", () => {
	let intent = { kind: "meta", branchSession: "s", branchTarget: "t" };
	const tab = { conversation: null };
	const calls = { first: 0 };
	const rec = new Recorder(tab, {
		queueSave: () => {},
		fields: () => FIELDS,
		onFirstMessage: () => calls.first++,
		onPrompt: () => {},
		leadRecord: () => {
			const taken = intent;
			intent = null;
			return taken;
		},
	});
	// Opened and not used: nothing recorded.
	rec.ensureConversation();
	assert.deepEqual(tab.conversation.messages, []);
	// A panel command is the first record: the branch goes before it.
	rec.record({ kind: "user", text: "/status" });
	rec.recordPrompt({ kind: "user", text: "hi", sentAt: 1 });
	assert.deepEqual(
		tab.conversation.messages.map((m) => m.kind),
		["meta", "user", "user"]
	);
	assert.equal(calls.first, 1);
});
