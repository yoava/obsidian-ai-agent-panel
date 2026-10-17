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

/** Whether file names on `platform` compare ignoring case: Windows and macOS do, Linux does not. */
export function namesIgnoreCase(platform: string): boolean {
	return platform === "win32" || platform === "darwin";
}

/**
 * Whether file names on `platform` compare ignoring Unicode normalization
 * form: macOS does (HFS+ stores NFD, APFS compares forms as one), so the root
 * Obsidian holds and the CLI's own spelling of it may differ in form only;
 * NTFS and ext4 tell the forms apart.
 */
export function namesIgnoreForm(platform: string): boolean {
	return platform === "darwin";
}

interface ResolvedPath {
	/** `/`, a drive (`C:/`), a UNC share (`//host/share/`), or "" when relative. */
	anchor: string;
	segments: string[];
}

/**
 * `path` as its anchor and segments, `.` and `..` resolved: Windows form when
 * `windows` (`\` and `/` separate), else POSIX, where `\` is a name character.
 * Empty and `.` segments drop; `..` at the anchor stays there, as the OS
 * resolves it. Null for what this cannot place safely: `\` in a POSIX path, a
 * UNC path without host and share or on a device (`\\?\`, `\\.\`), a drive
 * with no separator after it, a relative path starting at `~` (the CLI expands
 * it) or climbing above its start, a segment of only dots and spaces (Windows
 * trims those).
 */
function resolvePath(path: string, windows: boolean): ResolvedPath | null {
	if (!windows && path.includes("\\")) return null;
	const slashed = windows ? path.replace(/\\/g, "/") : path;
	let anchor = "";
	if (windows && slashed.startsWith("//")) {
		const [host = "", share = ""] = slashed.slice(2).split("/");
		if (host === "" || share === "" || host === "?" || host === ".") return null;
		anchor = `//${host}/${share}/`;
	} else if (windows && /^[A-Za-z]:/.test(slashed)) {
		if (slashed[2] !== "/") return null;
		anchor = slashed.slice(0, 3);
	} else if (slashed.startsWith("/")) anchor = "/";
	const raw = slashed.slice(anchor.length).split("/");
	if (anchor === "" && raw[0] === "~") return null;
	const segments: string[] = [];
	for (const segment of raw) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (segments.length > 0) segments.pop();
			else if (anchor === "") return null;
		} else if (/^[. ]+$/.test(segment)) return null;
		else segments.push(segment);
	}
	return { anchor, segments };
}

/**
 * A character as Windows compares it ignoring case: upper-cased only when that
 * gives one character that lower-cases back, so the Kelvin sign stays apart
 * from k and the dotless i from i.
 */
function foldChar(char: string): string {
	const upper = char.toUpperCase();
	return [...upper].length === 1 && (upper === char || upper.toLowerCase() === char)
		? upper
		: char;
}

/** Two names equal ignoring case; different lengths end the test before any folding. */
function sameIgnoringCase(a: string, b: string): boolean {
	const left = [...a];
	const right = [...b];
	if (left.length !== right.length) return false;
	return left.every((char, i) => char === right[i] || foldChar(char) === foldChar(right[i]));
}

/**
 * Vault-relative form of a path a tool reported, or null when it points outside
 * the vault, at its root, or at something this cannot place. The CLI runs with
 * the vault root as its cwd and reports absolute paths; Obsidian's APIs want
 * relative ones. The root's form decides the path's (Windows for a drive or UNC
 * root); both are resolved, then compared anchor and segment by segment,
 * ignoring case when `ignoreCase` (`namesIgnoreCase`) and normalization form
 * when `ignoreForm` (`namesIgnoreForm`); the segments returned keep the
 * reported form. The path is taken as reported, surrounding whitespace
 * included: a leading space makes a relative path through a folder named by
 * that space, which is refused, never the vault's own file.
 */
export function vaultRelativePath(
	reported: string,
	vaultRoot: string,
	ignoreCase: boolean,
	ignoreForm = false
): string | null {
	const windows = /^([A-Za-z]:|\\\\|\/\/)/.test(vaultRoot);
	const path = resolvePath(reported, windows);
	if (path === null) return null;
	if (path.anchor === "") return path.segments.length > 0 ? path.segments.join("/") : null;
	const root = resolvePath(vaultRoot, windows);
	const form = (name: string) => (ignoreForm ? name.normalize("NFC") : name);
	const same = (a: string, b: string) => (ignoreCase ? sameIgnoringCase(form(a), form(b)) : form(a) === form(b));
	if (root === null || !same(path.anchor, root.anchor)) return null;
	if (path.segments.length <= root.segments.length) return null;
	if (!root.segments.every((segment, i) => same(segment, path.segments[i]))) return null;
	return path.segments.slice(root.segments.length).join("/");
}

/**
 * `vaultRelativePath` for the running platform, with the vault root read
 * lazily; null too when the root cannot be read (not a local file system),
 * since a caller showing a path must not be the thing that throws. A path
 * the CLI reports through a Windows mount in WSL (`/mnt/c/...`) is placed
 * only when the vault's root is spelled the same way.
 */
export function placeInVault(reported: string, root: () => string, platform: string = process.platform): string | null {
	try {
		return vaultRelativePath(reported, root(), namesIgnoreCase(platform), namesIgnoreForm(platform));
	} catch {
		return null;
	}
}
