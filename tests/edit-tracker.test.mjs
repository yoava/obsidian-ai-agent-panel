import test from "node:test";
import assert from "node:assert/strict";

const { ChangeList, EditTracker, changeTotals } = await import("./.build/edit-tracker.mjs");

/** A tracker over an in-memory vault at `/v/`; `disk` maps vault paths to text. */
function harness(disk = {}) {
	const reads = [];
	const recorded = [];
	const files = {
		resolve: (reported) => (reported.startsWith("/v/") ? reported.slice(3) : null),
		read: async (path) => {
			reads.push(path);
			return disk[path] ?? null;
		},
	};
	return { tracker: new EditTracker(files, (edit) => recorded.push(edit)), reads, recorded, disk };
}

const toolUse = (id, name, input, parent = null) => ({
	type: "assistant",
	parent_tool_use_id: parent,
	message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
});
const toolResult = (id, isError = false, parent = null) => ({
	type: "user",
	parent_tool_use_id: parent,
	message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: isError }] },
});
const edit = (path) => ({ file_path: path, old_string: "old", new_string: "new" });

test("PRD-002.R7: a subagent's edit is read at its tool_use and recorded at its result", async () => {
	const { tracker, recorded, disk } = harness({ "a.md": "old" });
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/v/a.md"), "task-1"));
	disk["a.md"] = "new";
	const landed = await tracker.noteResults(toolResult("t1", false, "task-1")).get("t1");
	const pre = { reported: "/v/a.md", vaultPath: "a.md", before: "old" };
	assert.deepEqual(recorded, [{ pre, after: "new" }]);
	assert.deepEqual(landed, { pre, after: "new" });
});

test("PRD-002.R7: the main agent's edit is recorded the same way and handed to its card", async () => {
	const { tracker, recorded, disk } = harness({});
	tracker.noteAssistant(toolUse("t1", "Write", { file_path: "/v/n.md", content: "hi" }));
	disk["n.md"] = "hi";
	const landed = await tracker.noteResults(toolResult("t1")).get("t1");
	assert.deepEqual(landed, { pre: { reported: "/v/n.md", vaultPath: "n.md", before: null }, after: "hi" });
	assert.deepEqual(recorded, [landed]);
});

test("PRD-002.R7: a failed edit records nothing and releases its read", () => {
	const { tracker, recorded, reads } = harness({ "a.md": "old" });
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/v/a.md")));
	assert.equal(tracker.noteResults(toolResult("t1", true)).size, 0);
	assert.equal(tracker.noteResults(toolResult("t1")).size, 0);
	tracker.readFor("Edit", "t1", edit("/v/a.md"));
	assert.equal(reads.length, 2);
	assert.deepEqual(recorded, []);
});

test("PRD-002.R7: an edit outside the vault, or of a file gone afterwards, is not recorded", async () => {
	const { tracker, recorded, reads, disk } = harness({ "a.md": "old" });
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/etc/hosts")));
	tracker.noteAssistant(toolUse("t2", "Edit", edit("/v/a.md")));
	delete disk["a.md"];
	const landed = tracker.noteResults({
		type: "user",
		parent_tool_use_id: null,
		message: {
			role: "user",
			content: [
				{ type: "tool_result", tool_use_id: "t1" },
				{ type: "tool_result", tool_use_id: "t2" },
			],
		},
	});
	assert.deepEqual(await landed.get("t1"), {
		pre: { reported: "/etc/hosts", vaultPath: null, before: null },
		after: null,
	});
	assert.equal((await landed.get("t2")).after, null);
	assert.deepEqual(reads, ["a.md", "a.md"]);
	assert.deepEqual(recorded, []);
});

test("PRD-002.R7: an edit read only after it was written is recorded with no net change", async () => {
	const { tracker, recorded } = harness({ "a.md": "new" });
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/v/a.md")));
	await tracker.noteResults(toolResult("t1")).get("t1");
	assert.equal(recorded.length, 1);
	assert.equal(recorded[0].pre.before, recorded[0].after);
});

test("PRD-002.R6: a permission request shares the read started at its tool_use, and the reverse", async () => {
	const { tracker, reads } = harness({ "a.md": "old", "b.md": "old" });
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/v/a.md")));
	const first = tracker.readFor("Edit", "t1", edit("/v/a.md"));
	assert.equal(tracker.readFor("MultiEdit", "t1", edit("/v/a.md")), first);
	const requested = tracker.readFor("Edit", "t2", edit("/v/b.md"));
	tracker.noteAssistant(toolUse("t2", "Edit", edit("/v/b.md")));
	assert.equal(tracker.readFor("Edit", "t2", edit("/v/b.md")), requested);
	assert.deepEqual(reads, ["a.md", "b.md"]);
	assert.equal((await tracker.noteResults(toolResult("t2")).get("t2")).pre, await requested);
});

test("PRD-002.R6: a request naming another file than its tool_use reads that file, and its result uses it", async () => {
	const { tracker, recorded, reads } = harness({ "a.md": "A", "b.md": "B" });
	// A hook's updatedInput rewrote the path between the tool_use and the request.
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/v/a.md")));
	const read = tracker.readFor("Edit", "t1", edit("/v/b.md"));
	assert.equal((await read).before, "B");
	await tracker.noteResults(toolResult("t1")).get("t1");
	assert.equal(recorded[0].pre.vaultPath, "b.md");
	// The request came first: its input is what runs, so a later tool_use reuses its read.
	tracker.readFor("Edit", "t2", edit("/v/b.md"));
	tracker.noteAssistant(toolUse("t2", "Edit", edit("/v/a.md")));
	await tracker.noteResults(toolResult("t2")).get("t2");
	assert.equal(recorded[1].pre.vaultPath, "b.md");
	assert.deepEqual(reads, ["a.md", "b.md", "b.md", "b.md", "b.md"]);
});

test("PRD-002.R6: only Edit, Write and MultiEdit calls that name a file are read", () => {
	const { tracker, reads } = harness({ "a.md": "old" });
	tracker.noteAssistant(toolUse("t1", "Read", { file_path: "/v/a.md" }));
	tracker.noteAssistant(toolUse("t2", "NotebookEdit", { notebook_path: "/v/a.md" }));
	tracker.noteAssistant(toolUse("t3", "Edit", { old_string: "a", new_string: "b" }));
	tracker.noteAssistant({ type: "assistant", parent_tool_use_id: null, message: { role: "assistant", content: "text" } });
	assert.equal(tracker.readFor("Bash", "t4", { command: "ls" }), null);
	assert.equal(tracker.readFor("Edit", "t5", {}), null);
	assert.deepEqual(reads, []);
	for (const id of ["t1", "t2", "t3", "t4", "t5"]) assert.equal(tracker.noteResults(toolResult(id)).size, 0);
});

test("PRD-002.R7: clear drops every kept read, so results after a process exit record nothing", () => {
	const { tracker, recorded } = harness({ "a.md": "old" });
	tracker.noteAssistant(toolUse("t1", "Edit", edit("/v/a.md"), "task-1"));
	tracker.readFor("Edit", "t2", edit("/v/a.md"));
	tracker.clear();
	assert.equal(tracker.noteResults(toolResult("t1", false, "task-1")).size, 0);
	assert.equal(tracker.noteResults(toolResult("t2")).size, 0);
	assert.deepEqual(recorded, []);
});

const pre = (vaultPath, before) => ({ reported: `/v/${vaultPath}`, vaultPath, before });

test("PRD-002.R7: a file's change runs from its first recorded contents to its latest", () => {
	const list = new ChangeList();
	list.record(pre("a.md", "one\ntwo\n"), "one\n2\n");
	list.record(pre("a.md", "one\n2\n"), "one\n2\nthree\n");
	const [file] = list.files;
	assert.deepEqual(
		{ ...file },
		{ path: "a.md", inVault: true, before: "one\ntwo\n", after: "one\n2\nthree\n", created: false, edits: 2, added: 2, removed: 1 }
	);
	assert.deepEqual(list.totals, { files: 1, added: 2, removed: 1 });
});

test("PRD-002.R7: a created file is new, and a file with no net change is neither listed nor counted", () => {
	const list = new ChangeList();
	list.record(pre("n.md", null), "hi\n");
	list.record(pre("b.md", "same\n"), "same\n");
	list.record(pre("c.md", "x\n"), "y\n");
	list.record(pre("c.md", "y\n"), "x\n");
	assert.deepEqual(
		list.files.map((file) => [file.path, file.created, file.added, file.removed]),
		[["n.md", true, 1, 0]]
	);
	assert.deepEqual(list.totals, { files: 1, added: 1, removed: 0 });
	assert.equal(list.isEmpty, false);
	assert.equal(new ChangeList().isEmpty, true);
});

test("PRD-001.R29: the totals of listed files come from the counts they hold, with no diff computed", () => {
	const totals = changeTotals([
		{ path: "a.md", before: "x", after: "y", added: 3, removed: 1 },
		{ path: "b.md", before: "x", after: "x", added: 2, removed: 0 },
	]);
	assert.deepEqual(totals, { files: 2, added: 5, removed: 1 });
	assert.deepEqual(changeTotals([]), { files: 0, added: 0, removed: 0 });
	const list = new ChangeList();
	list.record({ reported: "/v/a.md", vaultPath: "a.md", before: "a\nb\n" }, "a\nc\nd\n");
	list.record({ reported: "/v/b.md", vaultPath: "b.md", before: null }, "new\n");
	assert.deepEqual(list.totals, changeTotals(list.files));
	assert.deepEqual(list.totals, { files: 2, added: 3, removed: 1 });
});

test("PRD-002.R14: after a restore a listed file takes the text on disk, or leaves the list when gone", () => {
	const list = new ChangeList();
	list.record(pre("a.md", "a\n"), "b\n");
	list.record(pre("n.md", null), "new\n");
	assert.equal(list.reread("a.md", "a\n"), true);
	assert.equal(list.reread("n.md", null), true);
	assert.equal(list.reread("other.md", "x"), false, "a file the list does not hold");
	assert.equal(list.isEmpty, true);
	assert.deepEqual(list.totals, { files: 0, added: 0, removed: 0 });
	// Still known, so a later edit keeps the conversation's first contents.
	list.record(pre("a.md", "a\n"), "c\n");
	assert.deepEqual(list.files.map((file) => [file.before, file.after]), [["a\n", "c\n"]]);
});
