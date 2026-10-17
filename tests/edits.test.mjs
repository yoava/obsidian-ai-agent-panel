import test from "node:test";
import assert from "node:assert/strict";

const { planEdit, isEditTool, editTargetPath, vaultRelativePath, namesIgnoreCase, namesIgnoreForm, placeInVault } = await import(
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

const posix = "/home/me/vault";
const windows = "C:/Users/me/vault";

test("PRD-002.R4: an absolute path that climbs out of the vault with .. is outside it", () => {
	assert.equal(vaultRelativePath("/v/../x.md", "/v", false), null);
	assert.equal(vaultRelativePath("/home/me/vault/../x.md", posix, false), null);
	assert.equal(vaultRelativePath("/home/me/vault/../vault-other/x.md", posix, false), null);
	assert.equal(vaultRelativePath("/v/./../v2/x", "/v", false), null);
	assert.equal(vaultRelativePath("/v/a/b/../../../x.md", "/v", false), null);
	assert.equal(vaultRelativePath("/v/a/../../../../etc/passwd", "/v", false), null);
	assert.equal(vaultRelativePath("C:\\Users\\me\\vault\\..\\secret.md", windows, true), null);
	assert.equal(vaultRelativePath("C:/Users/me/vault\\..\\vault2/x.md", windows, true), null);
});

test("PRD-002.R4: . and .. segments inside the vault resolve before the path is used", () => {
	assert.equal(vaultRelativePath("/v/a/../b.md", "/v", false), "b.md");
	assert.equal(vaultRelativePath("/v/./a/./b.md", "/v", false), "a/b.md");
	assert.equal(vaultRelativePath("/v/a/b/../../c.md", "/v", false), "c.md");
	assert.equal(vaultRelativePath("/v/../v/x.md", "/v", false), "x.md");
	assert.equal(vaultRelativePath("/v//a//b.md", "/v", false), "a/b.md");
	assert.equal(vaultRelativePath("C:\\Users\\me\\vault\\a\\..\\b.md", windows, true), "b.md");
	assert.equal(vaultRelativePath("a/../b.md", "/v", false), "b.md");
	assert.equal(vaultRelativePath("./a/./b.md", "/v", false), "a/b.md");
	assert.equal(vaultRelativePath("a\\..\\b.md", windows, true), "b.md");
});

test("PRD-002.R4: a path that resolves to the vault root itself is not a file in it", () => {
	assert.equal(vaultRelativePath("/v/a/..", "/v", false), null);
	assert.equal(vaultRelativePath("/v/.", "/v", false), null);
	assert.equal(vaultRelativePath("/v/", "/v", false), null);
	assert.equal(vaultRelativePath("a/..", "/v", false), null);
	assert.equal(vaultRelativePath(".", "/v", false), null);
});

test("PRD-002.R4: a folder sharing the root's name as a prefix is outside the vault", () => {
	assert.equal(vaultRelativePath("/v2/x", "/v", false), null);
	assert.equal(vaultRelativePath("/v2/x", "/v/", false), null);
	assert.equal(vaultRelativePath("/v/../v2/x", "/v", false), null);
	assert.equal(vaultRelativePath("C:\\Users\\me\\vault2\\x.md", windows, true), null);
});

test("PRD-002.R4: the vault root's own separators, . and .. resolve the same way", () => {
	assert.equal(vaultRelativePath("/home/me/vault/a.md", "/home/me/vault//", false), "a.md");
	assert.equal(vaultRelativePath("/home/me/vault/a.md", "/home/me/./other/../vault", false), "a.md");
	assert.equal(vaultRelativePath("/home/me/other/a.md", "/home/me/other/../vault", false), null);
	assert.equal(vaultRelativePath("C:\\Users\\me\\vault\\a.md", "C:\\Users\\me\\vault\\", true), "a.md");
	assert.equal(vaultRelativePath("C:/Users/me/vault/a\\b.md", "C:\\Users\\me\\vault", true), "a/b.md");
	assert.equal(vaultRelativePath("D:\\notes\\a.md", "D:\\", true), "notes/a.md");
});

test("PRD-002.R4: a path anchored elsewhere than the root is outside the vault", () => {
	assert.equal(vaultRelativePath("D:/Users/me/vault/a.md", windows, true), null);
	assert.equal(vaultRelativePath("/Users/me/vault/a.md", windows, true), null);
	assert.equal(vaultRelativePath("/v/a.md", "C:/v", true), null);
	assert.equal(vaultRelativePath("/v/a.md", "v", false), null);
	assert.equal(vaultRelativePath("/v/a.md", "", false), null);
});

test("PRD-002.R4: under a POSIX root a backslash is part of a name, so the path is refused", () => {
	const escape = "/home/me/.config/autostart/..\\..\\..\\vault\\evil.desktop";
	assert.equal(vaultRelativePath(escape, posix, false), null);
	assert.equal(vaultRelativePath("/home/me/vault/a\\b.md", posix, false), null);
	assert.equal(vaultRelativePath("a\\..\\b.md", posix, false), null);
	assert.equal(vaultRelativePath("notes\\a.md", posix, false), null);
	assert.equal(vaultRelativePath("\\\\host\\share\\v\\a.md", posix, false), null);
});

test("PRD-002.R4: a UNC root's host and share are its anchor, which .. cannot leave", () => {
	const wsl = "\\\\wsl.localhost\\Ubuntu\\home\\me\\vault";
	assert.equal(vaultRelativePath("\\\\wsl.localhost\\Ubuntu\\home\\me\\vault\\a.md", wsl, true), "a.md");
	assert.equal(vaultRelativePath("//WSL.localhost/ubuntu/home/me/vault/a.md", wsl, true), "a.md");
	const hop = "\\\\evil\\x\\..\\..\\wsl.localhost\\Ubuntu\\home\\me\\vault\\a.md";
	assert.equal(vaultRelativePath(hop, wsl, true), null);
	assert.equal(vaultRelativePath("\\\\host\\share2\\..\\share\\v\\a.md", "\\\\host\\share\\v", true), null);
	assert.equal(vaultRelativePath("\\\\host\\share\\v\\..\\w\\a.md", "//host/share/v", true), null);
	assert.equal(vaultRelativePath("/host/share/v/a.md", "\\\\host\\share\\v", true), null);
	// Fewer than two segments is no share; `?` and `.` hosts are device paths.
	assert.equal(vaultRelativePath("\\\\host\\share\\a.md", "\\\\host", true), null);
	assert.equal(vaultRelativePath("\\\\host\\share\\a.md", "\\\\host\\", true), null);
	assert.equal(vaultRelativePath("\\\\?\\C:\\Users\\me\\vault\\a.md", windows, true), null);
	assert.equal(vaultRelativePath("\\\\.\\C:\\Users\\me\\vault\\a.md", windows, true), null);
	assert.equal(vaultRelativePath("\\\\?\\UNC\\host\\share\\v\\a.md", "\\\\?\\UNC\\host\\share\\v", true), null);
});

test("PRD-002.R4: names compare exactly on Linux and ignoring case on Windows and macOS", () => {
	assert.equal(namesIgnoreCase("linux"), false);
	assert.equal(namesIgnoreCase("win32"), true);
	assert.equal(namesIgnoreCase("darwin"), true);
	assert.equal(vaultRelativePath("/home/me/Vault/a.md", posix, false), null);
	assert.equal(vaultRelativePath("/home/me/Vault/A.md", posix, true), "A.md");
	assert.equal(vaultRelativePath("c:\\users\\ME\\Vault\\Notes\\A.md", windows, true), "Notes/A.md");
	assert.equal(vaultRelativePath("c:\\users\\ME\\Vault\\Notes\\A.md", windows, false), null);
});

test("PRD-002.R4: ignoring case upper-cases each character only into one character", () => {
	// The Kelvin, Ohm and Angstrom signs lower-case to k, ω and å; Windows keeps them apart.
	assert.equal(vaultRelativePath("C:/Users/\u212Aim/vault/a.md", "C:/Users/kim/vault", true), null);
	assert.equal(vaultRelativePath("C:/Users/me/\u2126/a.md", "C:/Users/me/\u03C9", true), null);
	assert.equal(vaultRelativePath("C:/Users/me/\u212Bsa/a.md", "C:/Users/me/\u00E5sa", true), null);
	// ß upper-cases to "SS", two characters, so it stays ß.
	assert.equal(vaultRelativePath("C:/Users/me/STRASSE/a.md", "C:/Users/me/stra\u00DFe", true), null);
	assert.equal(vaultRelativePath("C:/Users/me/\u03A9mega/a.md", "C:/Users/me/\u03C9mega", true), "a.md");
	assert.equal(vaultRelativePath("C:/Users/me/\u00C5sa/a.md", "C:/Users/me/\u00E5sa", true), "a.md");
	// Dotless i and long s upper-case to I and S, which lower-case back to i and s.
	assert.equal(vaultRelativePath("/Users/me/Obs\u0131d\u0131an/x.md", "/Users/me/Obsidian", true), null);
	assert.equal(vaultRelativePath("/Users/me/\u017Fecrets/x.md", "/Users/me/secrets", true), null);
	assert.equal(vaultRelativePath("/Users/me/OBSIDIAN/x.md", "/Users/me/Obsidian", true), "x.md");
});

test("PRD-002.R4: names compare in NFC on macOS and by their code points elsewhere", () => {
	assert.equal(namesIgnoreForm("darwin"), true);
	assert.equal(namesIgnoreForm("win32"), false);
	assert.equal(namesIgnoreForm("linux"), false);
	const nfc = "/Users/me/Caf\u00e9";
	const nfd = "/Users/me/Cafe\u0301";
	// macOS: the root Obsidian holds and the CLI's spelling of it may differ in form only.
	assert.equal(vaultRelativePath(`${nfd}/a.md`, nfc, true, true), "a.md");
	assert.equal(vaultRelativePath(`${nfc}/a.md`, nfd, true, true), "a.md");
	assert.equal(vaultRelativePath(`${nfd}/Cafe\u0301.md`, nfc, true, true), "Cafe\u0301.md"); // the reported form stays
	assert.equal(vaultRelativePath(`${nfd}/a.md`, nfc, true, false), null);
	assert.equal(vaultRelativePath(`${nfd}/a.md`, nfc, false, false), null);
	// Windows (NTFS) and Linux tell the forms apart: a sibling folder differing in form only is outside the vault.
	assert.equal(vaultRelativePath("C:/Users/me/Cafe\u0301/a.md", "C:/Users/me/Caf\u00e9", true), null);
	assert.equal(vaultRelativePath(`${nfd}/a.md`, nfc, false), null);
	// Form and case together, as macOS compares.
	assert.equal(vaultRelativePath("/Users/me/CAFE\u0301/a.md", nfc, true, true), "a.md");
	assert.equal(placeInVault(`${nfd}/a.md`, () => nfc, "darwin"), "a.md");
	assert.equal(placeInVault(`${nfd}/a.md`, () => nfc, "linux"), null);
});

test("PRD-002.R4: a reported path keeps its spelling, surrounding whitespace included", () => {
	// A leading space makes a relative path through a folder named " ", which is refused; trimmed, it showed as the vault's own x.md.
	assert.equal(vaultRelativePath(" /home/me/vault/x.md", posix, false), null);
	assert.equal(vaultRelativePath(" notes/x.md", posix, false), " notes/x.md"); // a folder named " notes", as spelled
	assert.equal(vaultRelativePath("/home/me/vault/x.md ", posix, false), "x.md ");
	assert.equal(vaultRelativePath("/home/me/vault/x.md\n", posix, false), "x.md\n");
	// A tab before the drive letter leaves no drive: a relative path, as spelled.
	assert.equal(vaultRelativePath("\tC:\\Users\\me\\vault\\x.md", windows, true), "\tC:/Users/me/vault/x.md");
	assert.equal(vaultRelativePath("C:\\Users\\me\\vault\\x.md ", windows, true), "x.md ");
});

test("PRD-002.R4: a relative path starting at ~ is the home folder, not the vault", () => {
	assert.equal(vaultRelativePath("~/notes/a.md", posix, false), null);
	assert.equal(vaultRelativePath("~", posix, false), null);
	assert.equal(vaultRelativePath("~\\notes\\a.md", windows, true), null);
	assert.equal(vaultRelativePath("notes/~/a.md", posix, false), "notes/~/a.md");
	assert.equal(vaultRelativePath("~notes/a.md", posix, false), "~notes/a.md");
});

test("PRD-002.R4: a segment of only dots and spaces is refused", () => {
	for (const name of ["...", "....", ". ", ".. ", " ..", " ", " . "])
		assert.equal(vaultRelativePath(`/home/me/vault/${name}/a.md`, posix, false), null, JSON.stringify(name));
	assert.equal(vaultRelativePath("C:\\Users\\me\\vault\\.. \\a.md", windows, true), null);
	assert.equal(vaultRelativePath("notes/.../a.md", posix, false), null);
	assert.equal(vaultRelativePath("/home/me/vault/.notes/a.md", posix, false), ".notes/a.md");
	assert.equal(vaultRelativePath("/home/me/vault/a b/c..md", posix, false), "a b/c..md");
});

test("PRD-002.R4: a drive with no separator after it is refused", () => {
	assert.equal(vaultRelativePath("C:..\\x.md", windows, true), null);
	assert.equal(vaultRelativePath("C:notes\\a.md", windows, true), null);
	assert.equal(vaultRelativePath("C:notes\\a.md", "C:notes", true), null);
	assert.equal(vaultRelativePath("C:notes/a.md", posix, false), "C:notes/a.md");
});

test("placeInVault places a reported path for the platform and is null when the root cannot be read", () => {
	assert.equal(placeInVault("/home/me/vault/a.md", () => "/home/me/vault", "linux"), "a.md");
	assert.equal(placeInVault("/Home/Me/Vault/a.md", () => "/home/me/vault", "linux"), null, "case counts on linux");
	assert.equal(placeInVault("/Home/Me/Vault/a.md", () => "/home/me/vault", "darwin"), "a.md", "not on macOS");
	assert.equal(placeInVault("/mnt/c/Users/me/vault/a.md", () => "C:/Users/me/vault", "linux"), null, "a WSL mount path stays absolute");
	assert.equal(placeInVault("a.md", () => { throw new Error("not local"); }, "linux"), null);
});
