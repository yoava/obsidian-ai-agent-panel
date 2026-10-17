import { test } from "node:test";
import assert from "node:assert/strict";
import {
	checkForkBase,
	checkStoredMessages,
	checkStoredTimes,
	dropNonStringText,
	isSafeExportPath,
	readForkBase,
} from "./.build/history-file.mjs";
import { displayTitle, hasTitle } from "./.build/conversation-list.mjs";
import { conversationCost } from "./.build/commands.mjs";
import { restorePoint } from "./.build/restore.mjs";

test("PRD-001.R7: a stored title that is not a string is read as no title", () => {
	for (const title of [5, 0, true, null, {}, [], ["a"], undefined]) {
		const stored = dropNonStringText({ id: "a", title });
		assert.equal(stored.title, "");
		assert.equal(hasTitle(stored.title), false);
		assert.equal(displayTitle(stored.title), "New conversation");
	}
});

test("PRD-005.R7, PRD-003.R4: a stored fork base is kept when sound; a cost that is no finite number of at least 0 reads as absent", () => {
	assert.deepEqual(checkForkBase({ costUsd: 0.5 }), { costUsd: 0.5 });
	assert.deepEqual(checkForkBase({ costUsd: 0, sessionId: "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c", estimate: false }), {
		costUsd: 0,
		sessionId: "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c",
	});
	for (const costUsd of [-1, NaN, Infinity, "0.5", null, undefined, {}, [], true])
		assert.equal(checkForkBase({ costUsd }), undefined);
	for (const value of [null, undefined, 5, "base", [], true]) assert.equal(checkForkBase(value), undefined);
});

test("PRD-005.R7: a fork base estimate that is not a boolean reads as true, and a session id that is no string is dropped", () => {
	for (const estimate of ["no", 0, 1, null, {}, []]) assert.deepEqual(checkForkBase({ costUsd: 1, estimate }), { costUsd: 1, estimate: true });
	assert.deepEqual(checkForkBase({ costUsd: 1, estimate: true }), { costUsd: 1, estimate: true });
	for (const sessionId of [7, "f1", "--resume", "0F8B6A2C-1D3E-4F5A-9B7C-8D6E5F4A3B2C"])
		assert.deepEqual(checkForkBase({ costUsd: 1, sessionId }), { costUsd: 1 });
	assert.deepEqual(checkForkBase({ costUsd: 1, extra: "x" }), { costUsd: 1 }, "unknown fields are not kept");
});

test("PRD-005.R7: readForkBase checks a stored conversation's base in place, dropping an unusable one", () => {
	const sound = readForkBase({ forkBase: { costUsd: 2, estimate: "?" } });
	assert.deepEqual(sound.forkBase, { costUsd: 2, estimate: true });
	const bad = readForkBase({ forkBase: { costUsd: -2 } });
	assert.equal("forkBase" in bad, false);
	assert.equal("forkBase" in readForkBase({}), false);
});

test("PRD-001.R7: a stored title that is a string is kept as stored", () => {
	for (const title of ["Research notes", "", "  ", "two\nlines"])
		assert.equal(dropNonStringText({ id: "a", title }).title, title);
});

test("PRD-003.R1, R12: stored times that are not whole milliseconds read as the other time, else as the epoch", () => {
	assert.deepEqual(checkStoredTimes({ createdAt: 5, updatedAt: 9, pinnedAt: 7 }), { createdAt: 5, updatedAt: 9, pinnedAt: 7 });
	assert.deepEqual(checkStoredTimes({ createdAt: 0, updatedAt: 8.64e15 }), { createdAt: 0, updatedAt: 8.64e15 });
	for (const bad of ["5", 1.5, -1, 8.64e15 + 1, NaN, Infinity, true, null, undefined, {}, [], [1]]) {
		assert.deepEqual(checkStoredTimes({ createdAt: bad, updatedAt: 9 }), { createdAt: 9, updatedAt: 9 }, `createdAt ${bad}`);
		assert.deepEqual(checkStoredTimes({ createdAt: 5, updatedAt: bad }), { createdAt: 5, updatedAt: 5 }, `updatedAt ${bad}`);
		assert.deepEqual(checkStoredTimes({ createdAt: bad, updatedAt: bad }), { createdAt: 0, updatedAt: 0 }, `both ${bad}`);
		assert.deepEqual(checkStoredTimes({ createdAt: 5, updatedAt: 9, pinnedAt: bad }), { createdAt: 5, updatedAt: 9 }, `pinnedAt ${bad}`);
	}
	assert.deepEqual(checkStoredTimes({}), { createdAt: 0, updatedAt: 0 });
	// In place, the other fields untouched.
	const stored = { id: "a", createdAt: "x", updatedAt: 3, title: "t", messages: [] };
	assert.equal(checkStoredTimes(stored), stored);
	assert.deepEqual(stored, { id: "a", createdAt: 3, updatedAt: 3, title: "t", messages: [] });
});

test("PRD-003.R4: a stored export path that is not a string is read as absent", () => {
	for (const exportPath of [5, true, null, {}, ["AI/a.md"]]) {
		const stored = dropNonStringText({ title: "t", exportPath });
		assert.equal("exportPath" in stored, false);
	}
});

test("PRD-003.R4: a stored export path that is a string is kept for its own check", () => {
	for (const exportPath of ["AI/a.md", "", "../x.md"])
		assert.equal(dropNonStringText({ title: "t", exportPath }).exportPath, exportPath);
});

test("PRD-003.R4: a conversation without an export path gets none, and the other fields are untouched", () => {
	const stored = { id: "a", title: "t", pinned: true, messages: [1] };
	const same = dropNonStringText(stored);
	assert.equal(same, stored);
	assert.deepEqual(same, { id: "a", title: "t", pinned: true, messages: [1] });
});

// Stored messages (DES-005, Identity and validation) -------------------------

/** One message of every kind with every field the view records. */
const WELL_FORMED = [
	{
		kind: "user",
		text: "Summarize @note",
		contextName: "note.md",
		contextPaths: ["Projects/note.md", "Projects/"],
		images: 2,
	},
	{ kind: "bash", command: "ls", stdout: "a\nb", stderr: "w", code: 1, timedOut: false, durationMs: 40 },
	{ kind: "assistant", text: "Done." },
	{ kind: "thinking", text: "Hmm." },
	{
		kind: "tool",
		name: "Edit",
		input: { file_path: "a.md", edits: [{ old_string: "x", new_string: "y" }] },
		result: "ok",
		isError: false,
		added: 3,
		removed: 1,
	},
	{
		kind: "meta",
		durationMs: 1200,
		costUsd: 0.01,
		error: "boom",
		turn: 2,
		rewindUuid: "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c",
		lastPromptUuid: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
		sessionId: "s-1",
		profileId: "default",
		edited: true,
	},
	{
		kind: "meta",
		error: "Could not branch",
		branchSession: "s-0",
		branchTarget: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
		branchLatest: "3c4d5e6f-7a8b-4c9d-0e1f-2a3b4c5d6e7f",
	},
];
const UUID = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";

const checked = (...messages) => checkStoredMessages({ messages }).messages;
const only = (message) => checked(message)[0];
/** JSON values of every type a hand edit can put in a field. */
const NOT_STRING = [5, 0, true, null, {}, [], ["a"]];
const NOT_NUMBER = ["5", true, null, {}, [], [1], JSON.parse("1e999"), JSON.parse("-1e999")];
const NOT_BOOLEAN = ["true", 1, 0, null, {}, []];

test("PRD-003.R4: a well-formed file passes through unchanged", () => {
	const stored = {
		version: 1,
		id: "a",
		title: "t",
		messages: structuredClone(WELL_FORMED),
		legacy: { restorable: true },
	};
	const before = structuredClone(stored);
	const same = checkStoredMessages(stored);
	assert.equal(same, stored);
	assert.deepEqual(same, before);
});

test("PRD-003.R4: a message with only its required fields passes through unchanged", () => {
	const minimal = [
		{ kind: "user", text: "" },
		{ kind: "bash", command: "ls" },
		{ kind: "assistant", text: "a" },
		{ kind: "thinking", text: "t" },
		{ kind: "tool", name: "Read", input: {} },
		{ kind: "meta" },
	];
	assert.deepEqual(checked(...structuredClone(minimal)), minimal);
});

test("PRD-003.R4: a message that is not an object is dropped, the others keep their order", () => {
	const a = { kind: "assistant", text: "a" };
	const b = { kind: "thinking", text: "b" };
	const junk = [null, 0, 5, "user", true, [], [{ kind: "user", text: "x" }]];
	assert.deepEqual(checked(...junk.flatMap((j) => [j, a]), b), [...junk.map(() => a), b]);
	assert.deepEqual(checked(...junk), []);
});

test("PRD-003.R4: an object whose kind is not a string is dropped", () => {
	for (const kind of [5, null, true, {}, ["user"], undefined])
		assert.deepEqual(checked({ kind, text: "x" }), []);
	assert.deepEqual(checked({ text: "x" }, {}), []);
});

test("PRD-003.R4: a message of an unknown kind is kept as stored, for a newer plugin version's records", () => {
	const future = { kind: "plan", text: 5, steps: [null] };
	for (const kind of ["plan", "", "constructor", "toString", "__proto__", "User"]) {
		const message = { kind, text: 5, steps: [null] };
		assert.deepEqual(checked(message), [{ kind, text: 5, steps: [null] }]);
	}
	assert.deepEqual(checked(future, { kind: "user", text: 1 }), [future, { kind: "user", text: "" }]);
});

test("PRD-003.R4, ADR-018: a boundary record keeps a session id that fails the grammar as stored, and reads a bad time or id type as absent", () => {
	for (const kind of ["fresh-start", "clear"]) {
		assert.deepEqual(checked({ kind, at: 5, sessionId: "--resume" }), [{ kind, at: 5, sessionId: "--resume" }]);
		assert.deepEqual(checked({ kind, at: "5", sessionId: 7 }), [{ kind }]);
		assert.deepEqual(checked({ kind }), [{ kind }]);
	}
});

test("PRD-003.R4: a required text field that is not a string reads as an empty string", () => {
	const required = { user: "text", bash: "command", assistant: "text", thinking: "text", tool: "name" };
	for (const [kind, field] of Object.entries(required)) {
		const base = { kind, input: {} };
		for (const value of NOT_STRING) assert.equal(only({ ...base, [field]: value })[field], "", `${kind}.${field}`);
		assert.equal(only(base)[field], "", `${kind}.${field} absent`);
		assert.equal(only({ ...base, [field]: "kept" })[field], "kept");
	}
});

test("PRD-003.R4: an optional text field that is not a string reads as absent", () => {
	const optional = {
		user: ["contextName"],
		bash: ["stdout", "stderr"],
		tool: ["result"],
		meta: ["error", "sessionId", "profileId", "branchSession"],
	};
	for (const [kind, fields] of Object.entries(optional))
		for (const field of fields) {
			const base = { kind, text: "", command: "", name: "", input: {} };
			for (const value of NOT_STRING)
				assert.equal(field in only({ ...base, [field]: value }), false, `${kind}.${field}`);
			for (const value of ["", "kept"]) assert.equal(only({ ...base, [field]: value })[field], value);
		}
});

test("PRD-003.R4, ADR-018: a stored message id reads as absent unless it is a lowercase UUID", () => {
	for (const field of ["rewindUuid", "lastPromptUuid", "branchTarget", "branchLatest"]) {
		assert.equal(only({ kind: "meta", [field]: UUID })[field], UUID, field);
		for (const value of [...NOT_STRING, "", "u-1", UUID.toUpperCase(), `${UUID} `, "--resume", "../x"])
			assert.equal(field in only({ kind: "meta", [field]: value }), false, `${field} = ${JSON.stringify(value)}`);
	}
	// Restore files is offered only for an id the CLI's rewind takes.
	const record = { kind: "meta", sessionId: "s-1", profileId: "default", edited: true };
	assert.deepEqual(restorePoint(only({ ...record, rewindUuid: UUID })), { uuid: UUID, sessionId: "s-1", profileId: "default" });
	assert.equal(restorePoint(only({ ...record, rewindUuid: "u-1" })), null);
});

test("PRD-003.R4: an optional number that is not a finite number reads as absent", () => {
	const optional = {
		bash: ["code", "durationMs"],
		tool: ["added", "removed"],
		meta: ["durationMs", "costUsd", "turn"],
	};
	for (const [kind, fields] of Object.entries(optional))
		for (const field of fields) {
			const base = { kind, command: "", name: "", input: {} };
			for (const value of NOT_NUMBER)
				assert.equal(field in only({ ...base, [field]: value }), false, `${kind}.${field}`);
			for (const value of [0, 1, -1, 0.5, 1700000000000])
				assert.equal(only({ ...base, [field]: value })[field], value);
		}
});

test("PRD-003.R4: an optional flag that is not a boolean reads as absent", () => {
	const optional = { bash: ["timedOut"], tool: ["isError"], meta: ["edited"] };
	for (const [kind, fields] of Object.entries(optional))
		for (const field of fields) {
			const base = { kind, command: "", name: "", input: {} };
			for (const value of NOT_BOOLEAN)
				assert.equal(field in only({ ...base, [field]: value }), false, `${kind}.${field}`);
			for (const value of [true, false]) assert.equal(only({ ...base, [field]: value })[field], value);
		}
});

test("PRD-003.R4: an image count that is not a positive whole number reads as absent", () => {
	for (const images of [...NOT_NUMBER, 0, -1, 2.5, Number.MAX_SAFE_INTEGER + 2])
		assert.equal("images" in only({ kind: "user", text: "", images }), false, String(images));
	assert.equal(only({ kind: "user", text: "", images: 3 }).images, 3);
});

test("PRD-003.R1, R4: a prompt's send time is kept; one that is not a time reads as absent", () => {
	for (const sentAt of [...NOT_NUMBER, -1, 2.5, 8.64e15 + 1])
		assert.equal("sentAt" in only({ kind: "user", text: "", sentAt }), false, String(sentAt));
	assert.equal(only({ kind: "user", text: "", sentAt: 1760184120000 }).sentAt, 1760184120000);
	assert.equal(only({ kind: "user", text: "", sentAt: 0 }).sentAt, 0);
});

test("PRD-003.R4: context paths that are not a list of strings read as absent or lose the non-strings", () => {
	for (const contextPaths of ["a.md", 5, true, null, {}, { 0: "a.md", length: 1 }])
		assert.equal("contextPaths" in only({ kind: "user", text: "", contextPaths }), false);
	assert.deepEqual(only({ kind: "user", text: "", contextPaths: ["a.md", 5, null, {}, "b/", ["c"]] }).contextPaths, [
		"a.md",
		"b/",
	]);
	assert.deepEqual(only({ kind: "user", text: "", contextPaths: [5] }).contextPaths, []);
	assert.deepEqual(only({ kind: "user", text: "", contextPaths: ["a.md", "b/"] }).contextPaths, ["a.md", "b/"]);
});

test("PRD-003.R4: a tool input that is not an object reads as an empty object", () => {
	for (const input of [null, 5, "ls", true, [], ["a"]])
		assert.deepEqual(only({ kind: "tool", name: "Bash", input }).input, {});
	assert.deepEqual(only({ kind: "tool", name: "Bash" }).input, {});
	const input = { command: "ls", nested: { list: [1, null, "x"] }, n: 5 };
	assert.deepEqual(only({ kind: "tool", name: "Bash", input: structuredClone(input) }).input, input);
});

test("PRD-003.R4: fields the reader does not know are kept on a known kind", () => {
	const message = { kind: "meta", restorable: true, turn: 1, extra: { a: [null] } };
	assert.deepEqual(only(structuredClone(message)), message);
});

test("PRD-003.R4: a message is checked in place and the other conversation fields are untouched", () => {
	const message = { kind: "assistant", text: 5 };
	const stored = { id: "a", title: "t", pinned: true, messages: [message, null] };
	const same = checkStoredMessages(stored);
	assert.equal(same, stored);
	assert.equal(same.messages[0], message);
	assert.deepEqual(same, { id: "a", title: "t", pinned: true, messages: [{ kind: "assistant", text: "" }] });
});

test("PRD-003.R4: checking twice gives the same as checking once", () => {
	const hostile = [
		null,
		{ kind: "user", text: 5, contextPaths: [1, "a"], images: "2" },
		{ kind: "tool", name: null, input: 3, result: {}, added: "1" },
		{ kind: "meta", costUsd: "0.5", edited: "yes" },
		{ kind: "plan" },
	];
	const once = checked(...structuredClone(hostile));
	assert.deepEqual(checkStoredMessages({ messages: structuredClone(once) }).messages, once);
});

test("PRD-003.R4: a file whose messages are not a list is returned as it is, never thrown on", () => {
	for (const messages of [undefined, null, 5, "x", {}]) {
		const stored = { id: "a", messages };
		assert.doesNotThrow(() => checkStoredMessages(stored));
		assert.equal(stored.messages, messages);
	}
});

test("PRD-003.R4: the readers can rely on the types after the check", () => {
	const hostile = JSON.parse(
		JSON.stringify([
			null,
			7,
			{ kind: "user", text: { a: 1 }, contextName: 3, contextPaths: "a.md", images: "2" },
			{ kind: "bash", command: null, stdout: 1, stderr: [], code: "1", timedOut: "yes", durationMs: "5" },
			{ kind: "assistant", text: null },
			{ kind: "thinking", text: [] },
			{ kind: "tool", name: 5, input: "x", result: 2, isError: 1, added: "3", removed: {} },
			{ kind: "meta", costUsd: "0.5", sessionId: 4, rewindUuid: 4, profileId: 4, edited: 1, turn: "3" },
		])
	);
	const messages = checked(...hostile);
	assert.equal(messages.length, 6);
	for (const msg of messages) {
		if ("text" in msg) assert.equal(typeof msg.text, "string");
		if (msg.kind === "bash") assert.equal(typeof msg.command, "string");
		if (msg.kind === "tool") {
			assert.equal(typeof msg.name, "string");
			assert.equal(typeof msg.input, "object");
		}
	}
	assert.equal(conversationCost(messages), 0);
	assert.equal(restorePoint(messages[5]), null);
});

test("PRD-003.R4: a cost that is a number survives the check and counts", () => {
	const messages = checked(
		{ kind: "meta", costUsd: "9", sessionId: "s" },
		{ kind: "meta", costUsd: 0.25, sessionId: "s" },
		{ kind: "meta", costUsd: JSON.parse("1e999"), sessionId: "t" }
	);
	assert.equal(conversationCost(messages), 0.25);
});

test("PRD-003.R4: own __proto__ and constructor keys from JSON pollute nothing and survive", () => {
	const raw =
		'[{"kind":"assistant","text":5,"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}},' +
		'{"kind":"tool","name":"x","input":{"__proto__":{"polluted":true},"constructor":1}},' +
		'{"kind":"plan","__proto__":{"polluted":true}}]';
	const messages = checked(...JSON.parse(raw));
	assert.equal({}.polluted, undefined);
	assert.equal(Object.prototype.polluted, undefined);
	for (const message of messages) {
		assert.equal(Object.getPrototypeOf(message), Object.prototype);
		assert.equal(message.polluted, undefined);
	}
	const [assistant, tool, plan] = messages;
	assert.equal(assistant.text, "");
	for (const key of ["__proto__", "constructor"]) assert.equal(Object.hasOwn(assistant, key), true);
	assert.deepEqual(Object.getOwnPropertyDescriptor(assistant, "__proto__").value, { polluted: true });
	assert.deepEqual(assistant.constructor, { prototype: { polluted: true } });
	assert.equal(Object.hasOwn(tool.input, "__proto__"), true);
	assert.equal(tool.input.constructor, 1);
	assert.equal(Object.hasOwn(plan, "__proto__"), true);
});

test("PRD-003.R4: a stored export path is safe only as a .md note inside the folder", () => {
	for (const path of ["Agent Chats/a.md", "Agent Chats/sub/a.md"]) assert.equal(isSafeExportPath(path, "Agent Chats"), true, path);
	for (const path of [
		"Agent Chats/a.txt",
		"Other/a.md",
		"Agent Chats/../x.md",
		"Agent Chats/./a.md",
		"Agent Chats//a.md",
		"Agent Chats/..\\..\\x.md",
		"Agent Chats/sub\\a.md",
		"Agent Chats/document.txt:transcript.md",
	])
		assert.equal(isSafeExportPath(path, "Agent Chats"), false, path);
});

test("PRD-003.R1: a stored compaction keeps its fields of the right type and drops the others", () => {
	const [kept] = checked({ kind: "compaction", at: 1_700_000_000_000, trigger: "auto", preTokens: 81240, postTokens: 13763, summary: "Kept the plan" });
	assert.deepEqual(kept, { kind: "compaction", at: 1_700_000_000_000, trigger: "auto", preTokens: 81240, postTokens: 13763, summary: "Kept the plan" });
	const [bad] = checked({ kind: "compaction", at: "now", trigger: 3, preTokens: "many", postTokens: NaN, summary: { text: "x" } });
	assert.deepEqual(bad, { kind: "compaction" });
});

test("PRD-003.R1: a stored clear keeps its time and ended session as stored, and drops the fields of the wrong type", () => {
	assert.deepEqual(only({ kind: "clear", at: 1_700_000_000_000, sessionId: "--odd" }), { kind: "clear", at: 1_700_000_000_000, sessionId: "--odd" });
	assert.deepEqual(only({ kind: "clear", at: "now", sessionId: 4 }), { kind: "clear" });
});
