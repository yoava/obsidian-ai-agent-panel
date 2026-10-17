/**
 * What plan usage looks like (DES-007 Usage surfaces): the plan-usage
 * segment's items, tint and placeholders, its hover card, the "Plan usage"
 * popover and the usage cards. Fetching, caching and scheduling are in
 * `usage-core`.
 */

import type { CommandReport, ReportBar } from "../commands";
import type { AgentPanelSettings } from "../settings-core";
import type { UsageExtra, UsageSnapshot, UsageWindow } from "../usage-core";

/** "Show plan usage"'s thresholds: orange from `warn`, red from `crit` (PRD-005.R4). */
export interface UsageThresholds {
	warn: number;
	crit: number;
}

export type UsageLevel = "normal" | "warning" | "critical";

const LEVEL_RANK: Readonly<Record<UsageLevel, number>> = { normal: 0, warning: 1, critical: 2 };

/** The thresholds the "Show plan usage" settings set. */
export function usageThresholds(settings: Pick<AgentPanelSettings, "usageWarnPercent" | "usageCritPercent">): UsageThresholds {
	return { warn: settings.usageWarnPercent, crit: settings.usageCritPercent };
}

export function usageLevel(percent: number, thresholds: UsageThresholds): UsageLevel {
	if (percent >= thresholds.crit) return "critical";
	if (percent >= thresholds.warn) return "warning";
	return "normal";
}

// ---------------------------------------------------------------------------
// Formatting

/** "2h 27m", "3d 17h", "45m"; empty when already past. */
export function formatRemaining(ms: number): string {
	const minutes = Math.ceil(ms / 60_000);
	if (minutes <= 0) return "";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** HH:MM in the user's locale. */
export function formatClock(time: number): string {
	return new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** When a window resets: "16:59" on `now`'s day, else "Thu 08:00"; "" for a missing or unreadable time. */
function resetWhen(resetsAt: string | null, now: number): string {
	if (!resetsAt) return "";
	const date = new Date(resetsAt);
	if (isNaN(date.getTime())) return "";
	const time = formatClock(date.getTime());
	return date.toDateString() === new Date(now).toDateString()
		? time
		: `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

/** "resets 16:59" / "resets Thu 08:00": the status segment's and the hover card's, without a countdown. */
function shortReset(resetsAt: string | null, now: number): string {
	const when = resetWhen(resetsAt, now);
	return when ? `resets ${when}` : "";
}

/** "Resets 16:59 · in 2h 27m" / "Resets Thu 08:00 · in 3d 17h"; no countdown once past. */
export function formatReset(resetsAt: string | null, now: number): string {
	const when = resetWhen(resetsAt, now);
	if (!when) return "";
	const remaining = formatRemaining(new Date(resetsAt ?? "").getTime() - now);
	return remaining ? `Resets ${when} · in ${remaining}` : `Resets ${when}`;
}

function formatCredits(minorUnits: number | null, currency: string | null): string {
	if (minorUnits === null) return "-";
	const amount = minorUnits / 100;
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currency || "USD",
		}).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency ?? "USD"}`;
	}
}

const NO_LIMITS = "No usage limits reported for this account.";
const FETCHING = "Fetching usage…";

/** One reported limit window, titled as the CLI titles it (DES-007 Usage surfaces). */
interface UsageRow {
	title: string;
	/** The hover card's shorter title: "5-hour session", "Week", "Week · Sonnet". */
	short: string;
	/** Rounded down. */
	percent: number;
	resetsAt: string | null;
}

/** The limit windows a snapshot reports, in DES-007's order; a window without utilization is left out. */
function usageRows(snapshot: UsageSnapshot): UsageRow[] {
	const rows: UsageRow[] = [];
	const push = (title: string, short: string, window: UsageWindow | null) => {
		if (window?.utilization == null) return;
		rows.push({ title, short, percent: Math.floor(window.utilization), resetsAt: window.resetsAt });
	};
	push("Current session (5h)", "5-hour session", snapshot.fiveHour);
	push("Current week (all models)", "Week", snapshot.sevenDay);
	push("Current week (Sonnet)", "Week · Sonnet", snapshot.sevenDaySonnet);
	for (const limit of snapshot.modelLimits)
		push(`Current week (${limit.name})`, `Week · ${limit.name}`, { utilization: limit.percent, resetsAt: limit.resetsAt });
	return rows;
}

/** "$3.50 (of $50.00)", "$3.50 (no monthly cap)": extra usage spent, against its cap. */
function extraSpent(extra: UsageExtra): string {
	const cap =
		extra.monthlyLimit === null ? "no monthly cap" : `of ${formatCredits(extra.monthlyLimit, extra.currency)}`;
	return `${formatCredits(extra.usedCredits, extra.currency)} (${cap})`;
}

/** "Extra usage: $3.50 (no monthly cap)"; null when not enabled. */
function extraUsageLine(extra: UsageExtra | null): string | null {
	if (!extra?.isEnabled) return null;
	return `Extra usage: ${extraSpent(extra)}` + (extra.utilization != null ? ` - ${Math.floor(extra.utilization)}%` : "");
}

// ---------------------------------------------------------------------------
// Segment (PRD-005.R4)

export interface UsageItem {
	/** `5h`, `wk`, or a model-specific week's model name. */
	label: string;
	/** Rounded down. */
	percent: number;
	level: UsageLevel;
	/** The 5-hour item's "resets 16:59", shown from a 560 px main column; "" otherwise. */
	reset: string;
}

export interface UsageSegmentView {
	items: UsageItem[];
	/** The placeholder shown instead of items, or null. */
	note: string | null;
	/** The segment's tint: the highest level either item reached. */
	level: UsageLevel;
	/** Accessible name. */
	label: string;
}

/** The highest weekly window, the all-models week winning a tie, then Sonnet's, then the model limits in order. */
function highestWeek(snapshot: UsageSnapshot): { label: string; utilization: number } | null {
	const weeks: Array<{ label: string; utilization: number | null | undefined }> = [
		{ label: "wk", utilization: snapshot.sevenDay?.utilization },
		{ label: "Sonnet", utilization: snapshot.sevenDaySonnet?.utilization },
		...snapshot.modelLimits.map((limit) => ({ label: limit.name, utilization: limit.percent })),
	];
	let best: { label: string; utilization: number } | null = null;
	for (const week of weeks)
		if (week.utilization != null && (!best || week.utilization > best.utilization))
			best = { label: week.label, utilization: week.utilization };
	return best;
}

/**
 * The plan-usage segment: the 5-hour and the highest weekly percentage, each
 * when reported; `usage…` before any usage, "usage unavailable - click to
 * retry" after a failure, "no usage limits" for a snapshot without windows.
 */
export function usageSegment(
	snapshot: UsageSnapshot | null,
	error: string | null,
	thresholds: UsageThresholds,
	now: number
): UsageSegmentView {
	const placeholder = (note: string): UsageSegmentView => ({ items: [], note, level: "normal", label: `Plan usage: ${note}` });
	if (!snapshot) return placeholder(error ? "usage unavailable - click to retry" : "usage…");
	const items: UsageItem[] = [];
	const add = (label: string, utilization: number, reset: string) => {
		const percent = Math.floor(utilization);
		items.push({ label, percent, level: usageLevel(percent, thresholds), reset });
	};
	const five = snapshot.fiveHour;
	if (five?.utilization != null) add("5h", five.utilization, shortReset(five.resetsAt, now));
	const week = highestWeek(snapshot);
	if (week) add(week.label, week.utilization, "");
	if (items.length === 0) return placeholder("no usage limits");
	const level = items.reduce<UsageLevel>(
		(highest, item) => (LEVEL_RANK[item.level] > LEVEL_RANK[highest] ? item.level : highest),
		"normal"
	);
	return {
		items,
		note: null,
		level,
		label: `Plan usage: ${items.map((item) => `${item.label} ${item.percent}%`).join(", ")}`,
	};
}

// ---------------------------------------------------------------------------
// Hover card and popover (PRD-005.R4, R5)

export interface UsageWindowView {
	title: string;
	/** The hover card's title. */
	short: string;
	/** Rounded down. */
	percent: number;
	level: UsageLevel;
	/** "Resets 16:59 · in 2h 27m" (popover), "resets 16:59" (hover card), or "" when not reported. */
	reset: string;
}

function windowViews(
	snapshot: UsageSnapshot,
	thresholds: UsageThresholds,
	now: number,
	reset: (resetsAt: string | null, now: number) => string
): UsageWindowView[] {
	return usageRows(snapshot).map((row) => ({
		title: row.title,
		short: row.short,
		percent: row.percent,
		level: usageLevel(row.percent, thresholds),
		reset: reset(row.resetsAt, now),
	}));
}

export interface UsageHoverView {
	/** `⚠ Refresh failed: <error>`, listed first. */
	failure: string | null;
	rows: UsageWindowView[];
	/** What shows when there are no rows and no failure explains why. */
	note: string | null;
}

export function usageHover(
	snapshot: UsageSnapshot | null,
	error: string | null,
	thresholds: UsageThresholds,
	now: number
): UsageHoverView {
	const failure = error ? `⚠ Refresh failed: ${error}` : null;
	const rows = snapshot ? windowViews(snapshot, thresholds, now, shortReset) : [];
	let note: string | null = null;
	if (!snapshot && !error) note = FETCHING;
	else if (snapshot && rows.length === 0) note = NO_LIMITS;
	return { failure, rows, note };
}

export interface UsagePopoverView {
	/** "as of HH:MM", or the failure line in its place, or a fetching note. */
	status: string;
	/** `status` reports a failure. */
	failed: boolean;
	bars: UsageWindowView[];
	/** "No usage limits reported for this account." for a snapshot without windows. */
	empty: string | null;
	extra: string | null;
}

/** The "Plan usage" popover (PRD-005.R5). */
export function usagePopover(
	snapshot: UsageSnapshot | null,
	error: string | null,
	thresholds: UsageThresholds,
	now: number
): UsagePopoverView {
	if (!snapshot)
		return {
			status: error ? `Couldn't fetch usage: ${error}` : FETCHING,
			failed: error !== null,
			bars: [],
			empty: null,
			extra: null,
		};
	const fetched = formatClock(snapshot.fetchedAt);
	const bars = windowViews(snapshot, thresholds, now, formatReset);
	return {
		status: error ? `⚠ Refresh failed: ${error} - showing data from ${fetched}.` : `as of ${fetched}`,
		failed: error !== null,
		bars,
		empty: bars.length === 0 ? NO_LIMITS : null,
		extra: extraUsageLine(snapshot.extraUsage),
	};
}

// ---------------------------------------------------------------------------
// Cards (PRD-005.R6): reports, drawn and recorded as every panel command's card (DES-003 Report cards)

/** The failure a usage card shows when no usage can be had. */
function noUsage(error: string | null): Error {
	return new Error(`Couldn't fetch usage: ${error ?? "unknown error"}`);
}

/** Appended when the refresh failed but older figures stand. */
function staleNotes(snapshot: UsageSnapshot, error: string | null): string[] {
	return error ? [`⚠ Refresh failed (${error}) - showing data fetched at ${formatClock(snapshot.fetchedAt)}.`] : [];
}

/**
 * The /usage card: "Plan usage" as of the fetch, a bar per limit window with
 * its reset time, extra usage while enabled, the thresholds the bars are
 * tinted by; throws "Couldn't fetch usage: <reason>" with no figures at all.
 */
export function usageReport(
	snapshot: UsageSnapshot | null,
	error: string | null,
	thresholds: UsageThresholds,
	now: number
): CommandReport {
	if (!snapshot) throw noUsage(error);
	const bars: ReportBar[] = windowViews(snapshot, thresholds, now, formatReset).map((row) => ({
		label: row.title,
		percent: row.percent,
		tint: row.level,
		...(row.reset ? { sub: row.reset } : {}),
	}));
	const extra = snapshot.extraUsage;
	if (extra?.isEnabled) {
		const percent = extra.utilization == null ? null : Math.floor(extra.utilization);
		bars.push({
			label: "Extra usage",
			percent,
			tint: percent === null ? "normal" : usageLevel(percent, thresholds),
			value: extraSpent(extra),
			...(percent === null ? {} : { sub: `${percent}% of the monthly cap` }),
		});
	}
	const notes =
		bars.length === 0 ? [NO_LIMITS] : [`Warning from ${thresholds.warn}%, critical from ${thresholds.crit}%.`];
	return {
		title: "Plan usage",
		lead: `As of ${formatClock(snapshot.fetchedAt)}`,
		bars,
		sections: [],
		notes: [...notes, ...staleNotes(snapshot, error)],
	};
}

const USAGE_SETTINGS = { label: "claude.ai/settings/usage", href: "https://claude.ai/settings/usage" };

/**
 * The /usage-credits and /extra-usage card: "Usage credits" as of the fetch,
 * the status with any disabled reason, the monthly limit, the credits used
 * this period with a bar for the share of the cap, and the settings link;
 * throws "Couldn't fetch usage: <reason>" with no figures at all.
 */
export function creditsReport(snapshot: UsageSnapshot | null, error: string | null): CommandReport {
	if (!snapshot) throw noUsage(error);
	const extra = snapshot.extraUsage;
	const report: CommandReport = {
		title: "Usage credits",
		lead: `As of ${formatClock(snapshot.fetchedAt)} · also answers /extra-usage`,
		bars: [],
		barPairs: true,
		sections: [],
		notes: [],
		links: [USAGE_SETTINGS],
	};
	if (!extra)
		report.notes?.push(
			"Extra-usage credits aren't reported for this account (API-key setups and some plans don't have them)."
		);
	else {
		const reason = extra.disabledReason ? ` (${extra.disabledReason.replace(/_/g, " ")})` : "";
		const limit =
			extra.monthlyLimit === null
				? extra.isEnabled
					? "unlimited"
					: "-"
				: formatCredits(extra.monthlyLimit, extra.currency);
		report.bars?.push(
			{
				label: "Status",
				percent: null,
				tint: "normal",
				value: `${extra.isEnabled ? "enabled" : "disabled"}${reason}`,
				status: extra.isEnabled ? "ok" : "off",
			},
			{ label: "Monthly limit", percent: null, tint: "normal", value: limit }
		);
		if (extra.usedCredits !== null) {
			const percent = extra.utilization == null ? null : Math.floor(extra.utilization);
			report.bars?.push({
				label: "Used this period",
				percent,
				tint: "normal",
				value: formatCredits(extra.usedCredits, extra.currency),
				...(percent === null ? {} : { sub: `${percent}% of the cap` }),
			});
		}
	}
	report.notes?.push(...staleNotes(snapshot, error));
	return report;
}
