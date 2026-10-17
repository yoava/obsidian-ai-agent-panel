/**
 * The `obsidian_rename` target: which paths are refused (PRD-004.R7) and the
 * path used. Pure, so it is checked in plain Node (tests/mcp.test.mjs); the
 * handler calls both on the raw `newPath` before `normalizePath` or any file
 * call.
 */

const SHAPE_ERROR =
	'"newPath" must be vault-relative: no leading / or \\, no drive letter, no ".." segment.';
const EMPTY_ERROR = '"newPath" must name a file inside the vault.';
const HIDDEN_ERROR =
	'"newPath" names a hidden file or folder (a segment starting with "."), or a segment ' +
	"named like a Windows short name (NAME~1, MCP~1.JSO) that may stand for one; pick a visible name.";
const CHARACTER_ERROR = '"newPath" has a character Obsidian forbids in a name (* " < > : | ?); pick another name.';

/**
 * The characters Obsidian refuses in a file or folder name on every platform,
 * the separators aside: Windows cannot store them, and on NTFS a `:` addresses
 * an alternate data stream, a file the vault index never lists.
 */
const FORBIDDEN_CHARACTER = /[*"<>:|?]/;

/** A Windows 8.3 short name (`CLAUDE~1`, `OB1234~1.X`, `MCP~1.JSO`); it names the file or folder it shortens. */
const SHORT_NAME = /^[^~]{1,6}~\d+(\.[^.]{0,3})?$/i;

const IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

/** The characters HFS+ ignores in a name (zero-width and bidirectional marks, the BOM). */
const HFS_IGNORED = /[\u200c-\u200f\u202a-\u202e\u206a-\u206f\ufeff]/g;

/**
 * The segments of `path`, split on both separators (Windows takes either, and
 * `normalizePath` maps one to the other), without empty or `.` segments.
 */
function pathSegments(path: string): string[] {
	return path.split(/[\\/]/).filter((segment) => segment !== "" && segment !== ".");
}

/**
 * A segment as a file system may compare it. Case-insensitive, also where
 * macOS folds a character (long s to s); invisible characters and Unicode
 * normalization form are ignored. Trailing dots and spaces and a `:` suffix
 * are ignored too: Node's `fs` gives Windows a `\\?\` path, which skips the
 * trimming, so those only add defense in depth (a `:` suffix names an NTFS
 * stream of the folder). A segment of only dots or spaces keeps its own text.
 *
 * Folding more than `normalizePath` does means a string it could turn into
 * the folder is refused too. A loop rather than a regex for the trim, so a
 * long run of dots cannot make the match quadratic.
 */
function fold(segment: string): string {
	const name = segment.replace(IGNORABLE, "").normalize("NFC").split(":", 1)[0];
	let end = name.length;
	while (end > 0 && (name[end - 1] === "." || /\s/.test(name[end - 1]))) end--;
	return (end > 0 ? name.slice(0, end) : segment).toUpperCase().toLowerCase();
}

/**
 * Whether a segment is a hidden name: its first character is `.`, once the
 * characters HFS+ ignores are dropped. Nothing else is trimmed or folded: a
 * leading space or a zero-width space makes a different name on every file
 * system, which no tool reads as the dot name.
 */
function isHidden(segment: string): boolean {
	return segment.replace(HFS_IGNORED, "").startsWith(".");
}

/**
 * The tool error for a rename target outside the vault, in its configuration
 * folder (`app.vault.configDir`), or at a hidden name, else null. A hidden name
 * is any segment, the file name included, that starts with `.`: Claude Code,
 * Git and other tools run or read what they find in `.claude/`, `.git/hooks/`
 * or `.mcp.json`, and Obsidian indexes none of it, so a note moved there
 * leaves the vault view. The configuration folder keeps its own text and its
 * own check, which holds even where its name has no leading dot. A segment
 * shaped like a Windows 8.3 short name (`CLAUDE~1`, `MCP~1.JSO`) counts as
 * hidden at any depth, the file name included: a nested repository has its
 * own `.git` and `.claude`, and on NTFS the short name of `.mcp.json` opens
 * that file, which the vault index does not list. `Draft~1.md` is refused
 * with it; `Meeting~1.md` (seven characters before the tilde) is not a short
 * name and passes. Last, a character Obsidian forbids in a name (`*"<>:|?`)
 * gets its own error; the config and hidden checks come first, so
 * `.obsidian:stream/x.md` is reported as the config folder.
 */
export function renameTargetError(newPath: string, configDir: string): string | null {
	if (
		/^[\\/]/.test(newPath) ||
		/^[A-Za-z]:/.test(newPath) ||
		newPath.split(/[\\/]/).some((segment) => segment.trim() === "..")
	)
		return SHAPE_ERROR;
	const segments = pathSegments(newPath);
	if (segments.length === 0) return EMPTY_ERROR;

	const config = pathSegments(configDir).map(fold);
	const target = segments.map(fold);
	if (config.every((segment, index) => segment === target[index]))
		return `"newPath" is in the vault's configuration folder (${configDir}); pick another folder.`;
	if (segments.some(isHidden) || target.some((segment) => SHORT_NAME.test(segment))) return HIDDEN_ERROR;
	if (FORBIDDEN_CHARACTER.test(newPath)) return CHARACTER_ERROR;
	return null;
}

/** `newPath` without its empty and `.` segments, so `./a/b.md` is `a/b.md`. */
export function renameTargetPath(newPath: string): string {
	return pathSegments(newPath).join("/");
}
