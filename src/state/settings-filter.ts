/**
 * The settings page's search and Modified filter (DES-001 Settings page): the rows, the query and the Modified
 * state in; which rows show, where the query matches in their names and descriptions, how many rows each
 * section shows, how many rows differ from their defaults, and which sections and profiles have nothing to
 * show. No DOM; the page controller applies the result.
 */

/** A `[start, end)` range of a text, in UTF-16 units. */
export type Range = [number, number];

/** One row as the page model reads it. */
export interface FilterRow {
	id: string;
	section: string;
	/** The profile a Claude Code row belongs to. */
	profile?: string;
	name: string;
	desc?: string;
	/** The search text beyond the name and description (`settings-rows`). */
	terms: readonly string[];
	modified: boolean;
}

export interface FilterInput {
	rows: readonly FilterRow[];
	/** The sections in page order. */
	sections: readonly string[];
	query: string;
	modifiedOnly: boolean;
	/** Rows that show whatever the filters say, so an edit does not hide the row being edited. */
	keep?: ReadonlySet<string>;
}

/** What the page does to one row. */
export interface RowView {
	shown: boolean;
	/** Where the query matches in the name and the description; empty unless the row shows. */
	name: Range[];
	desc: Range[];
}

export interface PageView {
	/** The query as it filters: trimmed. */
	query: string;
	/** The query holds text. */
	searching: boolean;
	modifiedOnly: boolean;
	/** Either filter is on. */
	filtering: boolean;
	rows: Record<string, RowView>;
	/** Rows each section shows. */
	shown: Record<string, number>;
	/** Rows each section has that differ from their defaults, whatever the filters. */
	modified: Record<string, number>;
	/** Rows shown in all. */
	matches: number;
	/** Rows that differ from their defaults, whatever the filters. */
	modifiedTotal: number;
	/** Sections that show a row. */
	sectionsShown: number;
	/** While filtering: the sections that show nothing, in page order. */
	hiddenSections: string[];
	/** While filtering: the profiles that show nothing, in the order their rows come. */
	hiddenProfiles: string[];
}

/** Every non-overlapping occurrence of the trimmed `query` in `text`, ignoring case; none for an empty query. */
export function matchRanges(text: string, query: string): Range[] {
	const needle = query.trim().toLowerCase();
	const haystack = text.toLowerCase();
	// A letter whose lower case is longer or shorter would shift every later range.
	if (needle === "" || haystack.length !== text.length) return [];
	const ranges: Range[] = [];
	for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
		ranges.push([at, at + needle.length]);
	}
	return ranges;
}

/** Whether `row` holds `needle` (lower case) in its name, description or search text. */
function holds(row: FilterRow, needle: string): boolean {
	return [row.name, row.desc ?? "", ...row.terms].some((text) => text.toLowerCase().includes(needle));
}

export function filterPage(input: FilterInput): PageView {
	const query = input.query.trim();
	const needle = query.toLowerCase();
	const searching = query !== "";
	const filtering = searching || input.modifiedOnly;
	const rows: Record<string, RowView> = {};
	const shown: Record<string, number> = Object.fromEntries(input.sections.map((section) => [section, 0]));
	const modified: Record<string, number> = Object.fromEntries(input.sections.map((section) => [section, 0]));
	const profiles = new Map<string, number>();
	let matches = 0;
	let modifiedTotal = 0;
	for (const row of input.rows) {
		if (row.modified) {
			modifiedTotal++;
			modified[row.section] = (modified[row.section] ?? 0) + 1;
		}
		const show = input.keep?.has(row.id) === true || ((!searching || holds(row, needle)) && (!input.modifiedOnly || row.modified));
		rows[row.id] = {
			shown: show,
			name: show && searching ? matchRanges(row.name, query) : [],
			desc: show && searching ? matchRanges(row.desc ?? "", query) : [],
		};
		if (row.profile !== undefined) profiles.set(row.profile, (profiles.get(row.profile) ?? 0) + (show ? 1 : 0));
		if (!show) continue;
		matches++;
		shown[row.section] = (shown[row.section] ?? 0) + 1;
	}
	const hiddenSections = filtering ? input.sections.filter((section) => shown[section] === 0) : [];
	return {
		query,
		searching,
		modifiedOnly: input.modifiedOnly,
		filtering,
		rows,
		shown,
		modified,
		matches,
		modifiedTotal,
		sectionsShown: input.sections.length - input.sections.filter((section) => shown[section] === 0).length,
		hiddenSections,
		hiddenProfiles: filtering ? [...profiles].filter(([, count]) => count === 0).map(([profile]) => profile) : [],
	};
}

const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);

/** The line under the bar while a filter is on; null when none is. */
export function filterLine(view: PageView): string | null {
	if (view.searching) {
		const found =
			view.matches === 0
				? `No settings match “${view.query}”.`
				: `${view.matches} ${plural(view.matches, "setting matches", "settings match")} “${view.query}” in ${view.sectionsShown} ${plural(view.sectionsShown, "section", "sections")}.`;
		return `${found} Names, descriptions and values are searched; Esc clears.${view.matches === 0 ? "" : " Show clears the search and scrolls to the setting."}`;
	}
	if (!view.modifiedOnly) return null;
	// The chip's total, not the rows shown: a row edited back to its default stays shown but no longer differs.
	if (view.modifiedTotal === 0) return "No settings differ from their defaults.";
	return view.modifiedTotal === 1
		? "1 setting differs from its default. It shows its default under the description."
		: `${view.modifiedTotal} settings differ from their defaults. Each shows its default under the description.`;
}
