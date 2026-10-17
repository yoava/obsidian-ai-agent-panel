/**
 * The context block's text (DES-003 Context block and chips), from what
 * `context-builder` gathered in Obsidian: the active note and selection, the
 * active folder, the note's properties and links, and the attached items;
 * also the message's context label and the paths stored with it. Paths, not
 * note bodies: the selection and property values are the only note text.
 */

/** The selection's cut (PRD-001.R12). */
export const MAX_SELECTION_CHARS = 8000;
/** Entries per list under "links & properties" before "… N more" (PRD-001.R12). */
export const MAX_LIST_ENTRIES = 40;

export interface ContextChips {
	note: boolean;
	folder: boolean;
	links: boolean;
}

/** A vault file or folder by its path; folders without the trailing slash. */
export interface VaultEntry {
	path: string;
	folder: boolean;
}

/** The active note's place in the vault, as `metadataCache` reports it; lists in any order, repeats allowed. */
export interface NoteGraph {
	/** Frontmatter entries in their order. */
	properties: readonly (readonly [string, unknown])[];
	/** Resolved link, frontmatter-link and embed targets. */
	linksTo: readonly string[];
	/** Notes whose resolved links reach the note. */
	linkedFrom: readonly string[];
	/** Link texts that resolve to no file. */
	broken: readonly string[];
}

/** The lines a selection spans as on disk, 1-based, frontmatter counted. */
export interface LineRange {
	from: number;
	to: number;
}

/** The note's editor selection: its text and the lines it spans. */
export interface NoteSelection extends LineRange {
	text: string;
}

/** An editor position: 0-based line and character. */
export interface EditorPoint {
	line: number;
	ch: number;
}

export interface ContextSources {
	/** The active note; `name` is its file name. */
	note: { path: string; name: string } | null;
	/** The active folder. */
	folder: { path: string; name: string } | null;
	chips: ContextChips;
	/** The note's editor selection; read only while the note chip is on. */
	selection: NoteSelection | null;
	/** Read only while the "links & properties" chip is on. */
	graph: NoteGraph | null;
	/** The attached items, in chip order. */
	attached: readonly VaultEntry[];
}

/** What a send carries besides its text: the block, the message's label, the paths stored with it (DES-005). */
export interface SendContext {
	block: string | null;
	label: string | null;
	paths: string[];
}

/** The block, label and paths of one send; with `withContext` false (mid-turn, bare) only the `@` mentions' paths. */
export function sendContext(sources: ContextSources, withContext: boolean, mentions: readonly string[]): SendContext {
	return {
		block: withContext ? contextBlock(sources) : null,
		label: contextName(sources),
		paths: contextPaths(sources, withContext, mentions),
	};
}

/** The `<context>` block, or null when it would say nothing. */
export function contextBlock(sources: ContextSources): string | null {
	const { note, folder, chips } = sources;
	const parts: string[] = [];
	if (chips.note && note) {
		parts.push(`Active note: ${note.path}`);
		const selection = sources.selection;
		if (selection?.text.trim())
			parts.push(`${selectionReference(note.path, selection)}\n"""\n${cutSelection(selection.text)}\n"""`);
	}
	if (chips.folder && folder) parts.push(`Active folder: ${folder.path}/`);
	if (chips.links && note && sources.graph) parts.push(...graphLines(sources.graph));
	for (const item of listedAttachments(sources))
		parts.push(item.folder ? `Attached folder: ${item.path}/` : `Attached file: ${item.path}`);
	if (parts.length === 0) return null;
	return `<context>\nThe user is working in an Obsidian vault.\n${parts.join("\n")}\n</context>`;
}

/** The message's context label: what the block carries ("Q4.md · Projects/ · links & properties · 2 attached"). */
export function contextName(sources: ContextSources): string | null {
	const { note, folder, chips } = sources;
	const labels: string[] = [];
	if (chips.note && note) {
		labels.push(note.name);
		if (sources.selection?.text.trim()) labels.push(selectedLinesName(sources.selection));
	}
	if (chips.folder && folder) labels.push(`${folder.name}/`);
	if (chips.links && note) labels.push("links & properties");
	const attached = listedAttachments(sources).length;
	if (attached > 0) labels.push(`${attached} attached`);
	return labels.length ? labels.join(" · ") : null;
}

/** The paths stored with the message: the block's (folders with a slash), then the `@` mentions, each once. */
export function contextPaths(sources: ContextSources, withContext: boolean, mentions: readonly string[]): string[] {
	const paths: string[] = [];
	const add = (path: string) => {
		if (!paths.includes(path)) paths.push(path);
	};
	if (withContext) {
		const { note, folder, chips } = sources;
		if (chips.note && note) add(note.path);
		if (chips.folder && folder) add(`${folder.path}/`);
		for (const item of listedAttachments(sources)) add(item.folder ? `${item.path}/` : item.path);
	}
	for (const path of mentions) add(path);
	return paths;
}

/** The attached items the block lists: one equal to the active note or folder whose chip is on is already named (PRD-001.R13). */
export function listedAttachments(sources: ContextSources): VaultEntry[] {
	const { note, folder, chips } = sources;
	return sources.attached.filter(
		(item) => !((chips.note && note && item.path === note.path) || (chips.folder && folder && item.path === folder.path))
	);
}

/**
 * The lines a selection from `from` to `to` spans, 1-based: one that ends
 * at the start of a later line leaves that line out (PRD-001.R12).
 */
export function selectionLines(from: EditorPoint, to: EditorPoint): LineRange {
	const last = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;
	return { from: from.line + 1, to: last + 1 };
}

/**
 * The line that leads a selection, in the context block and from "Add
 * selection to chat" (PRD-001.R12, R13): "Selected text from <path>, lines
 * 12-18:", or "line 12" for one line. The range is the whole selection's,
 * also when its text is cut.
 */
export function selectionReference(path: string, lines: LineRange): string {
	return `Selected text from ${path}, ${lineRange(lines)}:`;
}

/** "lines 12-18", or "line 12" for one line. */
export function lineRange(lines: LineRange): string {
	return lines.from === lines.to ? `line ${lines.from}` : `lines ${lines.from}-${lines.to}`;
}

/** "4 lines selected", or "1 line selected": the message label's and the note chip's (PRD-001.R12). */
export function selectedLinesName(lines: LineRange): string {
	const count = lines.to - lines.from + 1;
	return `${count} ${count === 1 ? "line" : "lines"} selected`;
}

/** The first 8000 characters, leaving out whole a surrogate pair the cut would split. */
export function cutSelection(selection: string): string {
	if (selection.length <= MAX_SELECTION_CHARS) return selection;
	const splits =
		isHighSurrogate(selection.charCodeAt(MAX_SELECTION_CHARS - 1)) &&
		isLowSurrogate(selection.charCodeAt(MAX_SELECTION_CHARS));
	return selection.slice(0, splits ? MAX_SELECTION_CHARS - 1 : MAX_SELECTION_CHARS);
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/** A frontmatter value as one readable line; an object JSON cannot write (a cycle, a BigInt) reads `[object Object]`, not a failed send. */
export function stringifyProperty(value: unknown): string {
	if (Array.isArray(value)) return value.map((entry) => String(entry)).join(", ");
	if (value !== null && typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return Object.prototype.toString.call(value);
		}
	}
	return String(value);
}

/** "Properties:" and the three link lists, each left out when empty. */
function graphLines(graph: NoteGraph): string[] {
	const lines: string[] = [];
	if (graph.properties.length > 0)
		lines.push("Properties:", ...capped(graph.properties, ([key, value]) => `${key}: ${stringifyProperty(value)}`));
	const section = (title: string, values: readonly string[]) => {
		const sorted = [...new Set(values)].sort();
		if (sorted.length > 0) lines.push(`${title} (${sorted.length}):`, ...capped(sorted, (value) => value));
	};
	section("Links to", graph.linksTo);
	section("Linked from", graph.linkedFrom);
	section("Broken links", graph.broken);
	return lines;
}

/** Up to 40 entries, each formatted only when shown, indented, then "… N more". */
function capped<T>(values: readonly T[], format: (value: T) => string): string[] {
	const shown = values.slice(0, MAX_LIST_ENTRIES).map((value) => `  ${format(value)}`);
	return values.length > MAX_LIST_ENTRIES ? [...shown, `  … ${values.length - MAX_LIST_ENTRIES} more`] : shown;
}

const MENTION = /(^|[\s([{'"])@/g;
const MENTION_END = /[\s.,;:!?)\]}'"]/;

/**
 * Vault paths referenced with `@` (PRD-001.R13). The mention picker inserts
 * full vault paths, folders with a trailing slash, so each `@` at a token
 * start is matched against real paths: the longest wins, and the character
 * after it must end the token, since paths may hold spaces.
 */
export function findMentionedPaths(text: string, vault: readonly VaultEntry[]): string[] {
	const found: string[] = [];
	for (const match of text.matchAll(MENTION)) {
		const rest = text.slice((match.index ?? 0) + match[0].length);
		let best: string | null = null;
		for (const item of vault) {
			if (item.path === "/" || item.path === "") continue;
			const canonical = item.folder ? `${item.path}/` : item.path;
			for (const token of item.folder ? [canonical, item.path] : [item.path]) {
				if (!rest.startsWith(token)) continue;
				const next = rest[token.length];
				if (next !== undefined && !MENTION_END.test(next)) continue;
				if (!best || canonical.length > best.length) best = canonical;
			}
		}
		if (best && !found.includes(best)) found.push(best);
	}
	return found;
}
