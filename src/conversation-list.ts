/**
 * Sectioning for the conversation column: which rows are pinned, which are
 * open tabs, and how the rest bucket into dated "Recent" groups.
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
