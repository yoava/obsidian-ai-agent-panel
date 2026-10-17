/**
 * What a report card draws beyond the Markdown's table and pairs (DES-003
 * Report cards): mono values, a heading's pill, the /context meter's parts,
 * and the row lists' parts, from the builders' card-only fields. Obsidian-free;
 * `report-view` draws them.
 */
import {
	contextCategoryColor,
	HELP_GROUPS,
	type CommandReport,
	type ReportAction,
	type ReportRow,
	type ReportStatus,
} from "../commands";

const PATH = /^(?:~|\.{1,2})?[\\/]|^[A-Za-z]:[\\/]|^\.{1,2}$/;
const AMOUNT = /^(?:[A-Z]{1,3})?[$€£]\s?\d[\d,.]*$/;
const VERSION = /^v?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?$/;
const ID = /^[0-9a-f]{8}(?:-[0-9a-f]{2,}){1,4}$/i;
const DURATION = /^\d+(?:\.\d+)?(?:ms|s|m|h|d)(?: \d+(?:\.\d+)?(?:ms|s|m|h))*$/;
const HOST = /^[\w-]+(?:\.[\w-]+)+(?::\d+)?$/;
const SLASHED = /^\S*\/\S*$/;

/**
 * A value a card sets in mono: a path, an id, a version, an amount, a
 * duration, a host, or a comma list of those (CA22's paths, ids and amounts).
 */
export function codeLike(text: string): boolean {
	const items = text.trim().split(/,\s+/);
	return (
		items[0] !== "" &&
		items.every((item) => [PATH, AMOUNT, VERSION, ID, DURATION, HOST, SLASHED].some((pattern) => pattern.test(item)))
	);
}

/** A heading split into its text and its closing "(…)", which a card draws as a pill. */
export function headingParts(heading: string): { text: string; pill: string | null } {
	const match = /^(.*\S)\s+\(([^()]+)\)$/.exec(heading);
	return match ? { text: match[1], pill: match[2] } : { text: heading, pill: null };
}

/** One part of /context's meter: a category's color (1 to 6), the free rest, or the reserve. */
export interface MeterPart {
	label: string;
	tokens: number;
	/** Percent of the window; null for the free rest, which takes what the others leave. */
	share: number | null;
	swatch: number | "free" | "reserved";
}

/**
 * /context's meter as the boards draw it: the used categories, colored by
 * name, then free space, then the autocompact reserve; the legend lists the
 * same, free space only when the reply reported it.
 */
export function meterParts(meter: NonNullable<CommandReport["meter"]>): { bar: MeterPart[]; legend: MeterPart[] } {
	const share = (tokens: number) => Math.min(100, (tokens / Math.max(1, meter.max)) * 100);
	const used: MeterPart[] = [];
	const reserved: MeterPart[] = [];
	for (const segment of meter.segments) {
		const part = { label: segment.label, tokens: segment.tokens, share: share(segment.tokens) };
		if (segment.reserved) reserved.push({ ...part, swatch: "reserved" });
		else used.push({ ...part, swatch: contextCategoryColor(segment.label) });
	}
	const free: MeterPart = { label: "Free space", tokens: meter.free ?? 0, share: null, swatch: "free" };
	return {
		bar: [...used, free, ...reserved],
		legend: [...used, ...(meter.free === undefined ? [] : [free]), ...reserved],
	};
}

/** A row button: its icon, and whether its label shows or it is icon-only (named by its tooltip). */
export interface RowButton {
	action: ReportAction;
	icon: string;
	labelled: boolean;
}

/** One /mcp server as the boards list it. */
export interface ServerRow {
	name: string;
	/** The status pill's text and tone. */
	pill: string;
	tone: ReportStatus | undefined;
	/** The panel's own server: an accent "this panel" pill and no buttons. */
	own: boolean;
	/** "stdio · user · 26 tools". */
	meta: string;
	/** The server's error, a mono line under the meta. */
	detail: string | null;
	/** A disabled server's name is muted. */
	muted: boolean;
	buttons: RowButton[];
}

/**
 * `mcpReport`'s row as a list row, from its `server` parts. A connected
 * server's buttons are icon-only; any other's first button shows its label.
 */
export function serverRow(row: ReportRow): ServerRow {
	const server = row.server ?? { meta: "", own: false };
	return {
		name: row.cells[0] ?? "",
		pill: row.pill ?? "",
		tone: row.status,
		own: server.own,
		meta: server.meta,
		detail: row.detail ?? null,
		muted: row.status === "off",
		buttons: (row.actions ?? []).map((action, i) => ({
			action,
			icon: action.label === "Reconnect" ? "rotate-cw" : "power",
			labelled: i === 0 && row.status !== "ok",
		})),
	};
}

/** Opacity steps of /skills' token bar, one per listed skill, the last held. */
const SKILL_STEPS = 5;

/**
 * /skills' bar: one segment per row with `tokens` (a skill listed to
 * Claude), its share of their total and its opacity step (0 to 4).
 */
export function skillBar(rows: readonly ReportRow[]): Array<{ name: string; share: number; step: number }> {
	const listed = rows.flatMap((row) => (row.tokens ? [{ name: row.cells[0] ?? "", tokens: row.tokens }] : []));
	const total = listed.reduce((sum, skill) => sum + skill.tokens, 0);
	return listed.map((skill, i) => ({
		name: skill.name,
		share: (skill.tokens / Math.max(1, total)) * 100,
		step: Math.min(i, SKILL_STEPS - 1),
	}));
}

/** A /help row's command, its argument hint and its description; a row without `command` parts shows its first cell whole. */
export function commandRow(row: ReportRow): { name: string; hint: string; description: string } {
	return {
		name: row.command?.name ?? row.cells[0] ?? "",
		hint: row.command?.hint ?? "",
		description: row.cells[1] ?? "",
	};
}

/**
 * /help's rows in `HELP_GROUPS`, each group in its order, then any row no
 * group names under no label; rows of no group at all stay as one unlabelled group.
 */
export function commandGroups(rows: readonly ReportRow[]): Array<{ label: string | null; rows: ReportRow[] }> {
	const groups: Array<{ label: string | null; rows: ReportRow[] }> = HELP_GROUPS.map(({ label, names }) => ({
		label,
		rows: names.flatMap((name) => rows.filter((row) => row.insert === name)),
	})).filter((group) => group.rows.length > 0);
	const grouped = new Set(groups.flatMap((group) => group.rows));
	const rest = rows.filter((row) => !grouped.has(row));
	if (groups.length === 0) return [{ label: null, rows: [...rows] }];
	return rest.length ? [...groups, { label: null, rows: rest }] : groups;
}

/** A /cost tile: its `tile` parts, else the row's label and figure as they are. */
export function tile(row: ReportRow): { value: string; label: string } {
	return row.tile ?? { value: row.cells[1] ?? "", label: row.cells[0] ?? "" };
}
