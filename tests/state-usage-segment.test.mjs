import { test } from "node:test";
import assert from "node:assert/strict";
import {
	creditsReport,
	formatRemaining,
	formatReset,
	usageHover,
	usagePopover,
	usageReport,
	usageSegment,
} from "./.build/state/usage-segment.mjs";

const THRESHOLDS = { warn: 70, crit: 90 };
// Noon local time, so a reset hours later is the same day.
const NOW = new Date(2026, 9, 11, 12, 0).getTime();
const HOUR = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();
const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const weekday = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short" });

const window = (utilization, resetsAt = null) => ({ utilization, resetsAt });
const snapshot = (fields = {}) => ({
	fetchedAt: NOW - 60_000,
	fiveHour: null,
	sevenDay: null,
	sevenDaySonnet: null,
	modelLimits: [],
	extraUsage: null,
	...fields,
});
const FULL = snapshot({
	fiveHour: window(42.9, iso(NOW + 2 * HOUR + 27 * 60_000)),
	sevenDay: window(18.2, iso(NOW + 89 * HOUR)),
	sevenDaySonnet: window(81, iso(NOW + 89 * HOUR)),
	modelLimits: [{ name: "Opus", percent: 12, resetsAt: null }],
});

test("PRD-005.R4: the segment shows the 5-hour and the highest weekly percentage, rounded down", () => {
	const view = usageSegment(FULL, null, THRESHOLDS, NOW);
	assert.deepEqual(
		view.items.map(({ label, percent }) => [label, percent]),
		[
			["5h", 42],
			["Sonnet", 81],
		]
	);
	assert.equal(view.note, null);
	assert.equal(view.label, "Plan usage: 5h 42%, Sonnet 81%");
});

test("PRD-005.R4: the weekly item is wk for the all-models week, else the model's name", () => {
	const allModels = usageSegment(snapshot({ sevenDay: window(30), sevenDaySonnet: window(30), modelLimits: [{ name: "Opus", percent: 29.5, resetsAt: null }] }), null, THRESHOLDS, NOW);
	assert.deepEqual(allModels.items.map((item) => item.label), ["wk"], "a tie keeps the all-models week");
	const model = usageSegment(snapshot({ sevenDay: window(10), modelLimits: [{ name: "Opus", percent: 55, resetsAt: null }] }), null, THRESHOLDS, NOW);
	assert.deepEqual(model.items.map(({ label, percent }) => [label, percent]), [["Opus", 55]]);
});

test("PRD-005.R4: each item shows only when reported", () => {
	assert.deepEqual(usageSegment(snapshot({ fiveHour: window(5) }), null, THRESHOLDS, NOW).items.map((i) => i.label), ["5h"]);
	assert.deepEqual(usageSegment(snapshot({ sevenDay: window(5) }), null, THRESHOLDS, NOW).items.map((i) => i.label), ["wk"]);
	assert.deepEqual(
		usageSegment(snapshot({ fiveHour: window(null), sevenDay: window(null, iso(NOW)) }), null, THRESHOLDS, NOW).items,
		[],
		"a window without utilization is not reported"
	);
});

test("PRD-005.R4: the segment is orange from the warning threshold and red from the critical one, reached by either item", () => {
	const level = (five, week, thresholds = THRESHOLDS) =>
		usageSegment(snapshot({ fiveHour: window(five), sevenDay: window(week) }), null, thresholds, NOW).level;
	assert.equal(level(69, 10), "normal");
	assert.equal(level(70, 10), "warning");
	assert.equal(level(10, 70), "warning");
	assert.equal(level(89.9, 10), "warning");
	assert.equal(level(10, 90), "critical");
	assert.equal(level(95, 75), "critical");
	assert.equal(level(0, 0, { warn: 0, crit: 100 }), "warning", "0 is a threshold like any other");
	const items = usageSegment(snapshot({ fiveHour: window(91), sevenDay: window(72) }), null, THRESHOLDS, NOW).items;
	assert.deepEqual(items.map((item) => item.level), ["critical", "warning"], "each percentage keeps its own color");
});

test("PRD-005.R4: the 5-hour item carries its reset time, for a wide main column", () => {
	const [five, week] = usageSegment(FULL, null, THRESHOLDS, NOW).items;
	assert.equal(five.reset, `resets ${clock(NOW + 2 * HOUR + 27 * 60_000)}`);
	assert.equal(week.reset, "", "only the 5-hour item has one");
	const later = NOW + 20 * HOUR;
	const tomorrow = usageSegment(snapshot({ fiveHour: window(1, iso(later)) }), null, THRESHOLDS, NOW).items[0];
	assert.equal(tomorrow.reset, `resets ${weekday(later)} ${clock(later)}`, "another day names it");
	assert.equal(usageSegment(snapshot({ fiveHour: window(1, "soon") }), null, THRESHOLDS, NOW).items[0].reset, "");
});

test("PRD-005.R4: before any usage the segment shows usage…, or click to retry after a failure", () => {
	const fetching = usageSegment(null, null, THRESHOLDS, NOW);
	assert.deepEqual([fetching.items, fetching.note, fetching.level], [[], "usage…", "normal"]);
	assert.equal(fetching.label, "Plan usage: usage…");
	const failed = usageSegment(null, "Control request timed out: get_usage", THRESHOLDS, NOW);
	assert.equal(failed.note, "usage unavailable - click to retry");
});

test("PRD-005.R4: a snapshot without limit windows shows no usage limits", () => {
	const view = usageSegment(snapshot({ extraUsage: { isEnabled: true, monthlyLimit: null, usedCredits: 0, utilization: null, currency: "USD", disabledReason: null } }), null, THRESHOLDS, NOW);
	assert.deepEqual([view.items, view.note], [[], "no usage limits"]);
});

test("PRD-005.R2: after a failed refresh the segment keeps the previous figures", () => {
	const view = usageSegment(FULL, "boom", THRESHOLDS, NOW);
	assert.deepEqual(view.items.map((item) => item.percent), [42, 81]);
	assert.equal(view.note, null);
});

test("PRD-005.R4: the hover card lists a refresh failure first, then each window with percent and reset", () => {
	const view = usageHover(FULL, "boom", THRESHOLDS, NOW);
	assert.equal(view.failure, "⚠ Refresh failed: boom");
	assert.deepEqual(
		view.rows.map(({ short, percent, level }) => [short, percent, level]),
		[
			["5-hour session", 42, "normal"],
			["Week", 18, "normal"],
			["Week · Sonnet", 81, "warning"],
			["Week · Opus", 12, "normal"],
		]
	);
	assert.equal(view.rows[0].reset, `resets ${clock(NOW + 2 * HOUR + 27 * 60_000)}`);
	assert.equal(view.rows[3].reset, "");
	assert.equal(view.note, null);
	assert.equal(usageHover(FULL, null, THRESHOLDS, NOW).failure, null);
});

test("PRD-005.R4: the hover card says what is missing when there are no rows", () => {
	assert.deepEqual(usageHover(null, null, THRESHOLDS, NOW), { failure: null, rows: [], note: "Fetching usage…" });
	assert.deepEqual(usageHover(null, "boom", THRESHOLDS, NOW), { failure: "⚠ Refresh failed: boom", rows: [], note: null });
	assert.deepEqual(usageHover(snapshot(), null, THRESHOLDS, NOW), {
		failure: null,
		rows: [],
		note: "No usage limits reported for this account.",
	});
});

test("PRD-005.R5: the popover leads with as of HH:MM, then a bar per window with reset time and time to reset", () => {
	const view = usagePopover(FULL, null, THRESHOLDS, NOW);
	assert.equal(view.status, `as of ${clock(NOW - 60_000)}`);
	assert.equal(view.failed, false);
	assert.deepEqual(
		view.bars.map(({ title, percent, level }) => [title, percent, level]),
		[
			["Current session (5h)", 42, "normal"],
			["Current week (all models)", 18, "normal"],
			["Current week (Sonnet)", 81, "warning"],
			["Current week (Opus)", 12, "normal"],
		]
	);
	assert.equal(view.bars[1].reset, `Resets ${weekday(NOW + 89 * HOUR)} ${clock(NOW + 89 * HOUR)} · in 3d 17h`);
	assert.equal(view.empty, null);
	assert.equal(view.extra, null);
});

test("PRD-005.R5: after a failed refresh the popover says so in place of the as-of line", () => {
	const stale = usagePopover(FULL, "boom", THRESHOLDS, NOW);
	assert.equal(stale.status, `⚠ Refresh failed: boom - showing data from ${clock(NOW - 60_000)}.`);
	assert.equal(stale.failed, true);
	assert.equal(stale.bars.length, 4, "the previous figures stay");
	const none = usagePopover(null, "boom", THRESHOLDS, NOW);
	assert.deepEqual([none.status, none.failed, none.bars, none.empty], ["Couldn't fetch usage: boom", true, [], null]);
	const fetching = usagePopover(null, null, THRESHOLDS, NOW);
	assert.deepEqual([fetching.status, fetching.failed], ["Fetching usage…", false]);
});

test("PRD-005.R5: the popover shows the extra-usage line, and says when no limits are reported", () => {
	const extra = { isEnabled: true, monthlyLimit: 5000, usedCredits: 350, utilization: 7, currency: "USD", disabledReason: null };
	const view = usagePopover(snapshot({ extraUsage: extra }), null, THRESHOLDS, NOW);
	assert.match(view.extra, /^Extra usage: .*3\.50.* \(of .*50\.00.*\) - 7%$/);
	assert.equal(view.empty, "No usage limits reported for this account.");
	assert.equal(usagePopover(snapshot({ extraUsage: { ...extra, isEnabled: false } }), null, THRESHOLDS, NOW).extra, null);
	assert.match(usagePopover(snapshot({ extraUsage: { ...extra, monthlyLimit: null, utilization: null } }), null, THRESHOLDS, NOW).extra, /\(no monthly cap\)$/);
});

test("PRD-005.R5: the time to reset counts minutes, hours and days, and nothing once past", () => {
	assert.equal(formatRemaining(45 * 60_000), "45m");
	assert.equal(formatRemaining(2 * HOUR + 27 * 60_000), "2h 27m");
	assert.equal(formatRemaining(89 * HOUR), "3d 17h");
	assert.equal(formatRemaining(30_000), "1m");
	assert.equal(formatRemaining(0), "");
	assert.equal(formatRemaining(-HOUR), "");
	assert.equal(formatReset(iso(NOW - HOUR), NOW), `Resets ${clock(NOW - HOUR)}`, "a past reset has no countdown");
	assert.equal(formatReset(null, NOW), "");
	assert.equal(formatReset("not a date", NOW), "");
});

test("PRD-005.R6: the /usage card leads with As of HH:MM, a bar per window with its reset, extra usage and the thresholds", () => {
	const extra = { isEnabled: true, monthlyLimit: 5000, usedCredits: 350, utilization: 7, currency: "USD", disabledReason: null };
	const report = usageReport(snapshot({ ...FULL, extraUsage: extra }), null, THRESHOLDS, NOW);
	assert.equal(report.title, "Plan usage");
	assert.equal(report.lead, `As of ${clock(NOW - 60_000)}`);
	assert.deepEqual(
		report.bars.map(({ label, percent, tint }) => [label, percent, tint]),
		[
			["Current session (5h)", 42, "normal"],
			["Current week (all models)", 18, "normal"],
			["Current week (Sonnet)", 81, "warning"],
			["Current week (Opus)", 12, "normal"],
			["Extra usage", 7, "normal"],
		]
	);
	assert.equal(report.bars[0].sub, `Resets ${clock(NOW + 2 * HOUR + 27 * 60_000)} · in 2h 27m`);
	assert.equal(report.bars[3].sub, undefined, "no reset reported, no sub-line");
	assert.match(report.bars[4].value, /3\.50.* \(of .*50\.00.*\)$/);
	assert.equal(report.bars[4].sub, "7% of the monthly cap");
	assert.deepEqual(report.notes, ["Warning from 70%, critical from 90%."]);
	assert.deepEqual(report.sections, []);
});

test("PRD-005.R6: extra usage without a monthly cap shows its amount with no bar", () => {
	const extra = { isEnabled: true, monthlyLimit: null, usedCredits: 0, utilization: null, currency: "USD", disabledReason: null };
	const [bar] = usageReport(snapshot({ extraUsage: extra }), null, THRESHOLDS, NOW).bars;
	assert.equal(bar.label, "Extra usage");
	assert.equal(bar.percent, null);
	assert.match(bar.value, /\(no monthly cap\)$/);
	assert.equal(usageReport(snapshot({ extraUsage: { ...extra, isEnabled: false } }), null, THRESHOLDS, NOW).bars.length, 0, "only when enabled");
});

test("PRD-005.R6: a failed refresh with older figures appends the stale line to the /usage card", () => {
	const report = usageReport(FULL, "boom", THRESHOLDS, NOW);
	assert.equal(report.bars.length, 4, "the older figures stay");
	assert.equal(report.notes.at(-1), `⚠ Refresh failed (boom) - showing data fetched at ${clock(NOW - 60_000)}.`);
});

test("PRD-005.R6: an account with no limit window and no extra usage says so", () => {
	const report = usageReport(snapshot(), null, THRESHOLDS, NOW);
	assert.deepEqual(report.bars, []);
	assert.deepEqual(report.notes, ["No usage limits reported for this account."]);
});

test("PRD-005.R6: with no usage to be had the usage cards fail with Couldn't fetch usage", () => {
	assert.throws(() => usageReport(null, "boom", THRESHOLDS, NOW), { message: "Couldn't fetch usage: boom" });
	assert.throws(() => creditsReport(null, "boom"), { message: "Couldn't fetch usage: boom" });
	assert.throws(() => creditsReport(null, null), { message: "Couldn't fetch usage: unknown error" });
});

test("PRD-005.R6: the credits card leads with As of HH:MM and /extra-usage, then status, limit and use with a bar, and the settings link", () => {
	const extra = { isEnabled: false, monthlyLimit: 5000, usedCredits: 1250, utilization: 25, currency: "USD", disabledReason: "out_of_credits" };
	const report = creditsReport(snapshot({ extraUsage: extra }), null);
	assert.equal(report.title, "Usage credits");
	assert.equal(report.lead, `As of ${clock(NOW - 60_000)} · also answers /extra-usage`);
	assert.deepEqual(
		report.bars.map(({ label, percent }) => [label, percent]),
		[
			["Status", null],
			["Monthly limit", null],
			["Used this period", 25],
		]
	);
	assert.equal(report.bars[0].value, "disabled (out of credits)");
	assert.equal(report.barPairs, true, "the card draws them as key/value rows");
	assert.equal(report.bars[0].status, "off");
	assert.match(report.bars[1].value, /50\.00/);
	assert.match(report.bars[2].value, /12\.50/);
	assert.equal(report.bars[2].sub, "25% of the cap");
	assert.deepEqual(report.links, [{ label: "claude.ai/settings/usage", href: "https://claude.ai/settings/usage" }]);
	const unlimited = creditsReport(snapshot({ extraUsage: { ...extra, isEnabled: true, monthlyLimit: null, utilization: null } }), null);
	assert.equal(unlimited.bars[1].value, "unlimited");
	assert.equal(unlimited.bars[0].status, "ok");
	assert.equal(unlimited.bars[2].percent, null, "no cap, no bar");
});

test("PRD-005.R6: the credits card says when none are reported, and appends a stale line", () => {
	const none = creditsReport(snapshot(), null);
	assert.deepEqual(none.bars, []);
	assert.deepEqual(none.notes, ["Extra-usage credits aren't reported for this account (API-key setups and some plans don't have them)."]);
	assert.equal(none.links.length, 1);
	const stale = creditsReport(snapshot(), "boom");
	assert.equal(stale.notes.at(-1), `⚠ Refresh failed (boom) - showing data fetched at ${clock(NOW - 60_000)}.`);
});
