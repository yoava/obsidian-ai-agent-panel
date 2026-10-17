/**
 * Sectioning for the conversation column: which rows are pinned, which are
 * open tabs, and how the rest bucket into dated "Recent" groups; also how a
 * conversation is titled and how a title is shown.
 *
 * Obsidian-free on purpose - this is the sort/group logic worth
 * unit-testing without a DOM, and keeping it out of view.ts means the
 * section rules and the date-bucket rules cannot drift out of sync with
 * each other.
 */

/** One row the conversation column can draw. */
export interface ConversationEntry {
	/** Stored conversation id; null for an open tab that has not saved one yet. */
	id: string | null;
	title: string;
	updatedAt: number;
	/** Position in the tab strip, or null when the conversation is not open. */
	openIndex: number | null;
	pinned: boolean;
	/** When it was pinned; null when it is not pinned. */
	pinnedAt: number | null;
}

/** A dated run of Recent rows ("Today", "Yesterday", …). */
export interface ConversationDateGroup {
	label: string;
	entries: ConversationEntry[];
}

export interface ConversationSections {
	pinned: ConversationEntry[];
	open: ConversationEntry[];
	recent: ConversationDateGroup[];
	/** Rows in all three sections, so the caller can pick an empty state. */
	total: number;
}

export const DATE_GROUP_TODAY = "Today";
export const DATE_GROUP_YESTERDAY = "Yesterday";
export const DATE_GROUP_WEEK = "Previous 7 days";
export const DATE_GROUP_OLDER = "Older";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight for `ts` - DST-safe because the platform's Date does the shifting. */
function startOfLocalDay(ts: number): number {
	const day = new Date(ts);
	day.setHours(0, 0, 0, 0);
	return day.getTime();
}

/** Shared by the exported matcher and the per-search-run filter pass below. */
function titleIncludes(title: string, lowerFilter: string): boolean {
	return title.toLowerCase().includes(lowerFilter);
}

/** Case-insensitive substring test; a blank filter is "no filter", not "match nothing". */
export function matchesConversationFilter(title: string, filter: string): boolean {
	const trimmed = filter.trim();
	if (trimmed === "") return true;
	return titleIncludes(title, trimmed.toLowerCase());
}

/**
 * `id` orders ascending with `null` last - unsaved tabs are rare enough that
 * losing determinism for them isn't worth a special section, but they still
 * need *some* fixed slot so re-renders don't shuffle the list.
 */
function compareIdAscNullLast(a: string | null, b: string | null): number {
	if (a === null) return b === null ? 0 : 1;
	if (b === null) return -1;
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Oldest pin first, so pinning a new conversation appends rather than
 * reshuffling everyone already pinned. `pinnedAt: null` shouldn't happen on
 * a `pinned: true` row, but sorting it last (instead of throwing or NaN-ing)
 * keeps a malformed entry from corrupting the rows around it.
 */
function comparePinned(a: ConversationEntry, b: ConversationEntry): number {
	if (a.pinnedAt !== b.pinnedAt) {
		if (a.pinnedAt === null) return 1;
		if (b.pinnedAt === null) return -1;
		return a.pinnedAt - b.pinnedAt;
	}
	if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
	return compareIdAscNullLast(a.id, b.id);
}

/** Drag order, not activity - the user placed these tabs on purpose. */
function compareOpen(a: ConversationEntry, b: ConversationEntry): number {
	return (a.openIndex ?? 0) - (b.openIndex ?? 0);
}

/** Most recently touched first; the id tiebreak only matters for same-millisecond writes. */
function compareRecent(a: ConversationEntry, b: ConversationEntry): number {
	if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
	return compareIdAscNullLast(a.id, b.id);
}

/**
 * Buckets already-sorted Recent rows into the four fixed date groups,
 * dropping any group nobody falls into so the column never shows a header
 * with nothing under it.
 */
function groupByDate(entries: ConversationEntry[], now: number): ConversationDateGroup[] {
	const todayStart = startOfLocalDay(now);
	const yesterdayStart = todayStart - DAY_MS;
	const weekStart = todayStart - 7 * DAY_MS;

	const groups: ConversationDateGroup[] = [
		{ label: DATE_GROUP_TODAY, entries: [] },
		{ label: DATE_GROUP_YESTERDAY, entries: [] },
		{ label: DATE_GROUP_WEEK, entries: [] },
		{ label: DATE_GROUP_OLDER, entries: [] },
	];

	for (const entry of entries) {
		// >= todayStart also catches clock-skewed future timestamps - a row
		// newer than "now" is still today's, not a bucket of its own.
		if (entry.updatedAt >= todayStart) groups[0].entries.push(entry);
		else if (entry.updatedAt >= yesterdayStart) groups[1].entries.push(entry);
		else if (entry.updatedAt >= weekStart) groups[2].entries.push(entry);
		else groups[3].entries.push(entry);
	}

	return groups.filter((group) => group.entries.length > 0);
}

/**
 * Sections the conversation list for rendering. A pinned entry always lands
 * in `pinned`, even while open, so the tab strip's "open" concept and the
 * pin list's "kept around" concept can overlap without double-drawing a row.
 */
export function groupConversations(
	entries: ConversationEntry[],
	now: number,
	filter?: string
): ConversationSections {
	const trimmedFilter = (filter ?? "").trim();
	// Lowercase once here rather than inside matchesConversationFilter per
	// entry - the title still needs its own lowercasing, but the filter
	// itself is the same string for every row in this call.
	let survivors = entries;
	if (trimmedFilter !== "") {
		const lowerFilter = trimmedFilter.toLowerCase();
		survivors = entries.filter((entry) => titleIncludes(entry.title, lowerFilter));
	}

	const pinned = survivors.filter((entry) => entry.pinned).sort(comparePinned);
	const open = survivors
		.filter((entry) => !entry.pinned && entry.openIndex !== null)
		.sort(compareOpen);
	const recentEntries = survivors
		.filter((entry) => !entry.pinned && entry.openIndex === null)
		.sort(compareRecent);
	const recent = groupByDate(recentEntries, now);

	const total =
		pinned.length +
		open.length +
		recent.reduce((sum, group) => sum + group.entries.length, 0);

	return { pinned, open, recent, total };
}

/** Why Recent has no rows (PRD-001.R9): still scanning, filtered out, or none at all. */
export function emptyRecentText(sections: ConversationSections, filter: string, scanned: boolean): string {
	if (filter.trim()) return sections.total > 0 ? "No other matches" : "No matches";
	return scanned ? "No previous conversations" : "Loading…";
}

/** An open tab, as the column lists it. */
export interface ColumnTab {
	/** Null while the tab has no stored conversation yet. */
	id: string | null;
	/** As stored: any JSON value. */
	title: unknown;
	/** Null while the tab has no stored conversation yet. */
	updatedAt: number | null;
	pinned: boolean;
	pinnedAt: number | null;
}

/** A stored conversation, as the history store's snapshot lists it. */
export interface StoredSummary {
	id: string;
	title: unknown;
	updatedAt: number;
	pinned?: boolean;
	pinnedAt?: number;
}

/**
 * Every row the column can draw: the open tabs in drag order, then each
 * stored conversation that is not open (PRD-001.R9).
 */
export function columnEntries(
	open: readonly ColumnTab[],
	stored: readonly StoredSummary[],
	now: number
): ConversationEntry[] {
	const entries: ConversationEntry[] = open.map((tab, index) => ({
		id: tab.id,
		title: displayTitle(tab.title),
		updatedAt: tab.updatedAt ?? now,
		openIndex: index,
		pinned: tab.pinned,
		pinnedAt: tab.pinnedAt,
	}));
	const isOpen = new Set(open.map((tab) => tab.id));
	for (const meta of stored) {
		if (isOpen.has(meta.id)) continue;
		entries.push({
			id: meta.id,
			title: displayTitle(meta.title),
			updatedAt: meta.updatedAt,
			openIndex: null,
			pinned: meta.pinned === true,
			pinnedAt: meta.pinnedAt ?? null,
		});
	}
	return entries;
}

/** What else the column draws besides its rows. */
export interface ColumnKeyView {
	filter: string;
	/** The collapsed section keys. */
	collapsed: readonly string[];
	/** The history store's first scan finished ("Loading…" until then). */
	scanned: boolean;
	now: number;
	/** The open tabs' own identities in drag order: unsaved ones share the id null. */
	openKeys: readonly (string | number)[];
}

/**
 * The column's unchanged-input key (PRD-001.R29): the open tabs' and the
 * rows' identities, positions and titles, the history rows' times, the filter, the collapsed
 * sections, the scan state and the current minute, which history rows'
 * relative times follow. An open row's save time is left out: it moves on
 * every save and is not drawn.
 */
export function columnKey(sections: ConversationSections, view: ColumnKeyView): string {
	const row = (entry: ConversationEntry): string =>
		entry.openIndex !== null
			? `${entry.id ?? "new"}#${entry.openIndex}:${entry.title}`
			: `${entry.id}@${entry.updatedAt}:${entry.title}`;
	const rows = (entries: readonly ConversationEntry[]): string => JSON.stringify(entries.map(row));
	return JSON.stringify([
		view.openKeys,
		Math.floor(view.now / 60_000),
		view.filter.trim().toLowerCase(),
		[...view.collapsed].sort(),
		view.scanned,
		rows(sections.pinned),
		rows(sections.open),
		sections.recent.map((group) => [group.label, rows(group.entries)]),
	]);
}

/** What a conversation with no title is called wherever it is shown. */
export const NEW_CONVERSATION_TITLE = "New conversation";

const TITLE_MAX_CODE_POINTS = 80;

/** Whether a stored title is a string with something other than whitespace in it. */
export function hasTitle(title: unknown): title is string {
	return typeof title === "string" && title.trim() !== "";
}

/** How many code points before the limit a word break may sit for a cut title to use it. */
const TITLE_WORD_WINDOW = 12;

/**
 * A conversation's title from the first prompt sent to Claude, which the pin
 * and the rail show too: its first line (ended by LF, CRLF or a lone CR), or
 * "Untitled" when that line is empty or blank. A line over 80 code points is
 * cut at the last whitespace within the 12 code points before the cut, else at
 * the limit, and ended by "…", 80 code points in all. A character is a code
 * point, so a cut never splits a surrogate pair.
 */
export function promptTitle(text: string): string {
	const chars: string[] = [];
	for (const char of text.split(/\r\n?|\n/, 1)[0]) {
		chars.push(char);
		if (chars.length > TITLE_MAX_CODE_POINTS) break;
	}
	if (chars.length <= TITLE_MAX_CODE_POINTS) {
		const line = chars.join("");
		return line.trim() === "" ? "Untitled" : line;
	}
	let cut = TITLE_MAX_CODE_POINTS - 1;
	if (!/\s/.test(chars[cut])) {
		for (let i = cut - 1; i >= cut - TITLE_WORD_WINDOW; i--) {
			if (!/\s/.test(chars[i])) continue;
			cut = i;
			break;
		}
	}
	const head = chars.slice(0, cut).join("").trimEnd();
	return head.trim() === "" ? "Untitled" : `${head}\u2026`;
}

/**
 * The title a rename sets (PRD-001.R7): the input's first line, trimmed, cut
 * at 80 code points (no ellipsis, a cut never splits a surrogate pair); null
 * when that is blank or equals the title shown, so renaming an untitled
 * conversation "New conversation" leaves it untitled for its first prompt.
 */
export function renamedTitle(current: unknown, input: string): string | null {
	const line = [...input.split(/\r\n?|\n/, 1)[0]].slice(0, TITLE_MAX_CODE_POINTS).join("").trim();
	return line === "" || line === displayTitle(current) ? null : line;
}

/**
 * A branch's title: `<title> (branch)`, without stacking the suffix, or
 * "Conversation (branch)" when the source has no title. A stored title can be
 * any JSON value, so a blank or non-string one counts as none.
 */
export function branchTitle(title: unknown): string {
	const base = (hasTitle(title) ? title : "Conversation").replace(/ \(branch(?: \d+)?\)$/, "");
	return `${base} (branch)`;
}

/**
 * The title to show for a stored one: "New conversation" while it has none. A
 * hand-edited or synced file can hold any JSON value there, so a value that is
 * not a non-blank string counts as no title.
 */
export function displayTitle(title: unknown): string {
	return hasTitle(title) ? title : NEW_CONVERSATION_TITLE;
}
