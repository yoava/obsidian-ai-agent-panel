import test from "node:test";
import assert from "node:assert/strict";

const { planEdit, isEditTool, editTargetPath, vaultRelativePath } = await import(
	"./.build/edits.mjs"
);

test("only the previewable edit tools are recognized", () => {
	assert.equal(isEditTool("Edit"), true);
	assert.equal(isEditTool("Write"), true);
	assert.equal(isEditTool("MultiEdit"), true);
	assert.equal(isEditTool("Read"), false);
	assert.equal(isEditTool("Bash"), false);
	// NotebookEdit edits JSON cells, which a text diff would misrepresent.
	assert.equal(isEditTool("NotebookEdit"), false);
});

test("the target path is read from any of the usual keys", () => {
	assert.equal(editTargetPath({ file_path: "a.md" }), "a.md");
	assert.equal(editTargetPath({ path: "b.md" }), "b.md");
	assert.equal(editTargetPath({}), null);
	assert.equal(editTargetPath({ file_path: "   " }), null);
	assert.equal(editTargetPath({ file_path: 42 }), null);
});

test("Write against an existing file is a whole-file replacement", () => {
	const plan = planEdit("Write", { file_path: "n.md", content: "new" }, "old");
	assert.equal(plan.scope, "file");
	assert.equal(plan.before, "old");
	assert.equal(plan.after, "new");
	assert.equal(plan.creates, false);
});

test("Write against a missing file is a create", () => {
	const plan = planEdit("Write", { file_path: "n.md", content: "hello" }, null);
	assert.equal(plan.creates, true);
	assert.equal(plan.before, "");
	assert.equal(plan.after, "hello");
});

test("Write with no content yields an empty file rather than crashing", () => {
	const plan = planEdit("Write", { file_path: "n.md" }, "old");
	assert.equal(plan.after, "");
});

test("Edit replaces the first occurrence only by default", () => {
	const plan = planEdit(
		"Edit",
		{ file_path: "n.md", old_string: "cat", new_string: "dog" },
		"cat and cat"
	);
	assert.equal(plan.after, "dog and cat");
	assert.equal(plan.scope, "file");
	assert.equal(plan.note, undefined);
});

test("Edit with replace_all replaces every occurrence", () => {
	const plan = planEdit(
		"Edit",
		{ file_path: "n.md", old_string: "cat", new_string: "dog", replace_all: true },
		"cat and cat and cat"
	);
	assert.equal(plan.after, "dog and dog and dog");
});

test("replacement is literal, so Markdown metacharacters are safe", () => {
	const plan = planEdit(
		"Edit",
		{ file_path: "n.md", old_string: "[[Link]]", new_string: "$& [[Other]]" },
		"see [[Link]] here"
	);
	assert.equal(plan.after, "see $& [[Other]] here");
});

test("a replacement that does not match falls back to a fragment diff", () => {
	const plan = planEdit(
		"Edit",
		{ file_path: "n.md", old_string: "missing", new_string: "x" },
		"file contents"
	);
	assert.equal(plan.scope, "fragment");
	assert.equal(plan.before, "missing");
	assert.equal(plan.after, "x");
	assert.match(plan.note, /not found/);
});

test("MultiEdit applies its edits in order", () => {
	const plan = planEdit(
		"MultiEdit",
		{
			file_path: "n.md",
			edits: [
				{ old_string: "a", new_string: "b" },
				{ old_string: "b", new_string: "c" },
			],
		},
		"a"
	);
	// First edit makes "b", second turns that into "c" - sequential, not parallel.
	assert.equal(plan.after, "c");
	assert.equal(plan.note, undefined);
});

test("MultiEdit reports partially matched edits but still diffs what applied", () => {
	const plan = planEdit(
		"MultiEdit",
		{
			file_path: "n.md",
			edits: [
				{ old_string: "keep", new_string: "kept" },
				{ old_string: "nope", new_string: "x" },
			],
		},
		"keep this"
	);
	assert.equal(plan.scope, "file");
	assert.equal(plan.after, "kept this");
	assert.match(plan.note, /1 of 2 replacements did not match/);
});

test("MultiEdit with no usable edits yields no plan", () => {
	assert.equal(planEdit("MultiEdit", { file_path: "n.md", edits: [] }, "x"), null);
	assert.equal(
		planEdit("MultiEdit", { file_path: "n.md", edits: [{ bogus: true }] }, "x"),
		null
	);
});

test("Edit with an empty old_string against a missing file is a create", () => {
	const plan = planEdit(
		"Edit",
		{ file_path: "n.md", old_string: "", new_string: "fresh" },
		null
	);
	assert.equal(plan.creates, true);
	assert.equal(plan.after, "fresh");
});

test("an unreadable existing target degrades to a fragment diff", () => {
	const plan = planEdit(
		"Edit",
		{ file_path: "n.md", old_string: "a", new_string: "b" },
		null
	);
	assert.equal(plan.scope, "fragment");
	assert.match(plan.note, /could not be read/);
});

test("unsupported tools and inputs yield no plan", () => {
	assert.equal(planEdit("Bash", { command: "ls" }, ""), null);
	assert.equal(planEdit("Edit", {}, ""), null);
	assert.equal(planEdit("Edit", { file_path: "n.md" }, ""), null);
});

test("absolute paths under the vault become vault-relative", () => {
	assert.equal(vaultRelativePath("/home/me/vault/a/b.md", "/home/me/vault"), "a/b.md");
	assert.equal(vaultRelativePath("/home/me/vault/b.md", "/home/me/vault/"), "b.md");
	assert.equal(
		vaultRelativePath("C:\\Users\\me\\vault\\a\\b.md", "C:/Users/me/vault"),
		"a/b.md"
	);
});

test("paths outside the vault are rejected", () => {
	assert.equal(vaultRelativePath("/etc/passwd", "/home/me/vault"), null);
	assert.equal(vaultRelativePath("/home/me/vault", "/home/me/vault"), null);
	assert.equal(vaultRelativePath("/home/me/vault-other/x.md", "/home/me/vault"), null);
	assert.equal(vaultRelativePath("", "/home/me/vault"), null);
});

test("relative paths pass through but traversal does not", () => {
	assert.equal(vaultRelativePath("notes/a.md", "/home/me/vault"), "notes/a.md");
	assert.equal(vaultRelativePath("../outside.md", "/home/me/vault"), null);
	assert.equal(vaultRelativePath("a/../../b.md", "/home/me/vault"), null);
});
