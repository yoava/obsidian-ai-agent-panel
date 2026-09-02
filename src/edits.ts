/**
 * What a file-editing tool call *would* do, worked out from its input alone.
 *
 * This is what makes a diff possible before the user approves anything: the
 * permission prompt carries the tool's input, so given the file's current
 * contents the resulting text can be computed locally and shown. Pure, no
 * Obsidian import, tested in plain Node (tests/edits.test.mjs).
 *
 * The Edit/Write/MultiEdit semantics mirrored here are Claude Code's documented
 * tool contracts, not copied code.
 */

/** Tools whose effect on a file can be previewed as a diff. */
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit"]);

export function isEditTool(name: string): boolean {
	return EDIT_TOOLS.has(name);
}

/** The file an edit tool is aimed at, as written in the tool input. */
export function editTargetPath(input: Record<string, unknown>): string | null {
	const path = input.file_path ?? input.path ?? input.notebook_path;
	return typeof path === "string" && path.trim() !== "" ? path : null;
}

export interface EditPlan {
	/** Path exactly as the tool named it (may be absolute). */
	path: string;
	before: string;
	after: string;
	/**
	 * `file` - before/after are whole file contents.
	 * `fragment` - the file could not be read or the search text did not match,
	 * so before/after are just the tool's own strings. Still worth showing, but
	 * line numbers are relative to the fragment.
	 */
	scope: "file" | "fragment";
	/** True when the tool creates a file that does not exist yet. */
	creates: boolean;
	/** Why the plan is approximate, when it is. */
	note?: string;
}

interface SingleEdit {
	oldString: string;
	newString: string;
	replaceAll: boolean;
}

function readEdit(raw: unknown): SingleEdit | null {
	if (raw === null || typeof raw !== "object") return null;
	const e = raw as Record<string, unknown>;
	const oldString = typeof e.old_string === "string" ? e.old_string : null;
	const newString = typeof e.new_string === "string" ? e.new_string : null;
	if (oldString === null || newString === null) return null;
	return { oldString, newString, replaceAll: e.replace_all === true };
}

/** Literal (non-regex) replacement, so Markdown metacharacters stay literal. */
function replaceLiteral(
	text: string,
	search: string,
	replacement: string,
	all: boolean
): { text: string; count: number } {
	if (search === "") return { text, count: 0 };
	let out = "";
	let from = 0;
	let count = 0;
	for (;;) {
		const at = text.indexOf(search, from);
		if (at < 0) break;
		out += text.slice(from, at) + replacement;
		from = at + search.length;
		count++;
		if (!all) break;
	}
	if (count === 0) return { text, count: 0 };
	return { text: out + text.slice(from), count };
}

/**
 * Work out the before/after text for one edit tool call.
 *
 * `before` is the file's current content, or null when the file does not exist
 * or could not be read. Returns null for tools this cannot preview.
 */
export function planEdit(
	name: string,
	input: Record<string, unknown>,
	before: string | null
): EditPlan | null {
	const path = editTargetPath(input);
	if (path === null || !isEditTool(name)) return null;

	if (name === "Write") {
		const content = typeof input.content === "string" ? input.content : "";
		return {
			path,
			before: before ?? "",
			after: content,
			scope: "file",
			creates: before === null,
		};
	}

	const edits: SingleEdit[] =
		name === "MultiEdit"
			? (Array.isArray(input.edits) ? input.edits : [])
					.map(readEdit)
					.filter((e): e is SingleEdit => e !== null)
			: [readEdit(input)].filter((e): e is SingleEdit => e !== null);
	if (edits.length === 0) return null;

	// Edit with an empty old_string against a missing file is a create.
	if (before === null) {
		if (edits.length === 1 && edits[0].oldString === "")
			return {
				path,
				after: edits[0].newString,
				before: "",
				scope: "file",
				creates: true,
			};
		return {
			path,
			before: edits.map((e) => e.oldString).join("\n"),
			after: edits.map((e) => e.newString).join("\n"),
			scope: "fragment",
			creates: false,
			note: "The file could not be read, so this shows only the replaced text.",
		};
	}

	let text = before;
	let applied = 0;
	for (const edit of edits) {
		if (edit.oldString === "") {
			// Documented as "create", but the file exists - the CLI will reject it.
			continue;
		}
		const result = replaceLiteral(text, edit.oldString, edit.newString, edit.replaceAll);
		if (result.count === 0) continue;
		text = result.text;
		applied++;
	}

	if (applied === 0)
		return {
			path,
			before: edits.map((e) => e.oldString).join("\n"),
			after: edits.map((e) => e.newString).join("\n"),
			scope: "fragment",
			creates: false,
			note:
				edits.length === 1
					? "The text to replace was not found in the current file, so this shows the tool's own before/after."
					: "None of the replacements matched the current file, so this shows the tool's own before/after.",
		};

	return {
		path,
		before,
		after: text,
		scope: "file",
		creates: false,
		note:
			applied < edits.length
				? `${edits.length - applied} of ${edits.length} replacements did not match the current file.`
				: undefined,
	};
}

/**
 * Vault-relative form of a path a tool reported, or null when it points outside
 * the vault. The CLI runs with the vault root as its cwd and reports absolute
 * paths; Obsidian's APIs want relative ones.
 */
export function vaultRelativePath(reported: string, vaultRoot: string): string | null {
	const normalize = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
	const path = normalize(reported.trim());
	const root = normalize(vaultRoot);
	if (path === "") return null;
	if (!/^([A-Za-z]:)?\//.test(path)) {
		// Already relative. Reject traversal out of the vault.
		return path.split("/").includes("..") ? null : path;
	}
	if (root === "") return null;
	const lowerPath = path.toLowerCase();
	const lowerRoot = root.toLowerCase();
	if (lowerPath === lowerRoot) return null;
	if (!lowerPath.startsWith(lowerRoot + "/")) return null;
	return path.slice(root.length + 1);
}
