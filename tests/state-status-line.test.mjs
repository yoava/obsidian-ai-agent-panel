import { test } from "node:test";
import assert from "node:assert/strict";
import {
	contextHover,
	contextPopover,
	contextSegment,
	effortSegment,
	FIT_ORDER,
	fitStep,
	hiddenWidths,
	modelSegment,
	modeSegment,
	profileSegment,
	SEGMENT_ORDER,
	shownMode,
	usageSegmentVisible,
} from "./.build/state/status-line.mjs";
import { shortTokens } from "./.build/commands.mjs";

const mode = (selectedMode, extra = {}) => ({ selectedMode, inheritMode: false, cliMode: null, ...extra });

test("PRD-001.R31: the status line holds model, effort, permission, profile, context and plan usage in that order", () => {
	assert.deepEqual(SEGMENT_ORDER, ["model", "effort", "permission", "profile", "context", "usage"]);
});

test("PRD-001.R22: the model segment shows the model the CLI reported, its full id in the tooltip", () => {
	const segment = modelSegment("", "claude-opus-5-5");
	assert.equal(segment.short, "Opus 5.5");
	assert.equal(segment.label, "Model: Opus 5.5");
	assert.equal(segment.tooltip, "claude-opus-5-5");
	assert.equal(segment.icon, "sparkles");
});

test("PRD-001.R22: before the CLI reports, the model segment shows the pick", () => {
	const learned = modelSegment("sonnet", "", { sonnet: "claude-sonnet-5" });
	assert.equal(learned.label, "Model: Sonnet 5");
	assert.equal(learned.tooltip, "claude-sonnet-5");
	const cli = modelSegment("", "", undefined, [{ value: "", resolvedModel: "claude-opus-5-5" }]);
	assert.equal(cli.short, "Default model (Opus 5.5)");
	assert.equal(cli.tooltip, "claude-opus-5-5");
	const bare = modelSegment("", "");
	assert.equal(bare.label, "Model: Default model");
	assert.equal(bare.tooltip, "Default model");
});

test("PRD-001.R31: the effort segment shows the short string, the long one for wide panels, and names its value", () => {
	assert.deepEqual(effortSegment("xhigh"), {
		icon: "gauge",
		short: "Extra high",
		long: "Extra high effort",
		label: "Reasoning effort: Extra high",
		tooltip: "Reasoning effort: Extra high",
		warn: false,
	});
	assert.equal(effortSegment("").label, "Reasoning effort: Default");
});

test("PRD-001.R31: the permission segment names the long string without its warning sign", () => {
	const auto = modeSegment(shownMode(mode("auto"), undefined));
	assert.equal(auto.short, "Auto");
	assert.equal(auto.long, "⚠ Auto-approve everything");
	assert.equal(auto.label, "Permissions: Auto-approve everything");
	assert.equal(auto.icon, "zap");
	const edits = modeSegment(shownMode(mode("acceptEdits"), undefined));
	assert.equal(edits.label, "Permissions: Accept edits");
	assert.equal(edits.warn, false);
});

test("PRD-002.R8: the permission tooltip joins the long string and hover text, and Auto-approve and Bypass are red", () => {
	const edits = modeSegment(shownMode(mode("acceptEdits"), undefined));
	assert.equal(
		edits.tooltip,
		"Accept edits · file edits run without asking; other calls follow Claude Code's rules"
	);
	assert.equal(modeSegment(shownMode(mode("auto"), undefined)).warn, true);
	const bypass = modeSegment(shownMode(mode("bypassPermissions"), undefined));
	assert.equal(bypass.warn, true);
	assert.equal(bypass.short, "Bypass");
	assert.equal(bypass.icon, "shield-off");
});

test("PRD-002.R11: Auto-approve shows as picked whatever the CLI reports", () => {
	const shown = shownMode(mode("auto", { cliMode: "default" }), undefined);
	assert.equal(shown.value, "auto");
	assert.equal(shown.short, "Auto");
});

test("PRD-002.R11: a mode the CLI reported wins over the pick, its own modes shown as reported", () => {
	assert.equal(shownMode(mode("default", { cliMode: "acceptEdits" }), undefined).short, "Edits");
	const dontAsk = shownMode(mode("default", { cliMode: "dontAsk" }), undefined);
	assert.deepEqual([dontAsk.value, dontAsk.short], [null, "Don't ask"]);
	const cliAuto = shownMode(mode("default", { cliMode: "auto" }), undefined);
	assert.deepEqual([cliAuto.value, cliAuto.short, cliAuto.warn], [null, "Auto mode", false]);
	const unknown = shownMode(mode("default", { cliMode: "someNewMode" }), undefined);
	assert.deepEqual([unknown.value, unknown.short, unknown.long], [null, "someNewMode", "someNewMode"]);
});

test("PRD-002.R11: an inherited mode shows the profile's startup mode, else Claude Code default", () => {
	const known = shownMode(mode("default", { inheritMode: true }), "plan");
	assert.equal(known.short, "Plan");
	assert.equal(known.long, "Plan (read-only) · Claude Code's default when it last started");
	assert.equal(known.hover, "Claude reads and plans, and edits nothing until you approve the plan");
	const none = shownMode(mode("default", { inheritMode: true }), undefined);
	assert.deepEqual([none.value, none.short, none.long, none.hover], [
		null,
		"Default",
		"Claude Code default (set in its settings)",
		"Claude Code's settings decide the mode",
	]);
	assert.equal(
		modeSegment(none).label,
		"Permissions: Claude Code default (set in its settings)"
	);
});

test("PRD-002.R11: without a report or inheritance the pick shows", () => {
	const plan = shownMode(mode("plan"), "acceptEdits");
	assert.deepEqual([plan.value, plan.short], ["plan", "Plan"]);
});

test("PRD-001.R3: the profile segment shows only with several profiles", () => {
	assert.equal(profileSegment(1, { name: "Default" }), null);
	const segment = profileSegment(2, { name: "WSL" });
	assert.equal(segment.short, "WSL");
	assert.equal(segment.label, "CLI profile: WSL");
	assert.equal(segment.tooltip, "CLI profile: WSL");
	assert.equal(segment.icon, "terminal");
	assert.equal(profileSegment(3, { name: "" }).label, "CLI profile: Unnamed");
});

const seg = (kind, fixed, labelNatural) => ({ kind, fixed, labelNatural });
// Totals with a 4 px gap: 520 at step 0, then 480, 440, 390, 266 and 236. A
// line fits with 1 px to spare: label widths are whole pixels.
const LINE = [
	seg("model", 30, 60),
	seg("effort", 30, 40),
	seg("permission", 30, 50),
	seg("profile", 30, 40),
	seg("context", 40, 30),
	seg("usage", 120, 0),
];

test("PRD-001.R31: the line shortens the profile, effort and permission labels, hides plan usage, then the context percentage", () => {
	assert.deepEqual(FIT_ORDER, ["profile", "effort", "permission", "usage", "context"]);
});

test("PRD-001.R31: fitStep returns the fewest steps, in order, whose total fits", () => {
	const cases = [
		[600, 0], [521, 0], [520, 1], [481, 1], [480, 2], [441, 2], [440, 3], [391, 3], [390, 4], [267, 4], [266, 5], [237, 5],
	];
	for (const [available, step] of cases) assert.equal(fitStep(available, 4, LINE, false), step, `${available} px`);
});

test("PRD-001.R31: when no step fits, fitStep returns the last step", () => {
	assert.equal(fitStep(100, 4, LINE, false), 5);
	assert.equal(fitStep(0, 4, LINE, true), 5);
});

test("PRD-001.R31: in Auto-approve and Bypass step 3 is skipped and the permission label stays", () => {
	// Without step 3 the permission label's 50 px stay: 316 at step 4, 286 at step 5.
	const cases = [[441, 2], [440, 4], [317, 4], [316, 5], [287, 5]];
	for (const [available, step] of cases) assert.equal(fitStep(available, 4, LINE, true), step, `${available} px`);
});

test("PRD-001.R31: a step whose segment is not shown frees nothing, so the next one is taken", () => {
	const line = LINE.filter((segment) => segment.kind !== "profile" && segment.kind !== "usage");
	// 90 + 70 + 80 + 70 and three gaps: 322; effort's label frees 40, the permission label 50, the percentage 30.
	assert.equal(fitStep(323, 4, line, false), 0);
	assert.equal(fitStep(322, 4, line, false), 2);
	assert.equal(fitStep(233, 4, line, false), 3);
	assert.equal(fitStep(232, 4, line, false), 5);
});

test("PRD-001.R31: a line that fits only to the pixel takes the next step, since scrollWidth rounds its labels", () => {
	// A label of 60.3 px reads as 60: a total equal to the line may still overflow by a fraction.
	assert.equal(fitStep(520, 4, LINE, false), 1);
	assert.equal(fitStep(520.5, 4, LINE, false), 1);
	assert.equal(fitStep(521, 4, LINE, false), 0);
});

test("PRD-005.R3: a hidden plan-usage segment counts its last widths only when read in the same mode for text no shorter", () => {
	const last = { long: true, text: "5h 42% · 2h 13m · wk 18%", fixed: 180, labelNatural: 0 };
	assert.deepEqual(hiddenWidths(last, true, "5h 43% · 2h 12m · wk 18%"), { fixed: 180, labelNatural: 0 });
	assert.deepEqual(hiddenWidths(last, true, "5h 43% · 2h 12m · wk 18% · Sonnet 4%"), { fixed: 180, labelNatural: 0 });
});

test("PRD-005.R3: a hidden plan-usage segment counts 0 for one pass after a mode switch, shorter text, or no reading", () => {
	const last = { long: true, text: "5h 42% · 2h 13m · wk 18%", fixed: 180, labelNatural: 0 };
	const zero = { fixed: 0, labelNatural: 0 };
	assert.deepEqual(hiddenWidths(last, false, "Plan usage: 5h 42%, wk 18%"), zero, "narrowed below 560 px");
	assert.deepEqual(hiddenWidths(last, true, "5h 42% · 9m · wk 18%"), zero, "shorter text");
	assert.deepEqual(hiddenWidths(undefined, false, "usage…"), zero, "never read");
});

// --- Context segment and plan-usage polling (PRD-005.R3, R8) -------------------

/** A `get_context_usage` reply as `getContextUsage` normalizes it. */
const CONTEXT = {
	totalTokens: 68_400,
	maxTokens: 200_000,
	percentage: 34,
	model: "claude-opus-5-5",
	autoCompactAt: 167_000,
	categories: [
		{ name: "System prompt", tokens: 3_100, deferred: false, kind: "used" },
		{ name: "System tools", tokens: 13_800, deferred: false, kind: "" },
		{ name: "MCP tools", tokens: 11_200, deferred: true, kind: "deferred" },
		{ name: "Memory files", tokens: 0, deferred: false, kind: "used" },
		{ name: "Messages", tokens: 34_300, deferred: false, kind: "used" },
		{ name: "Autocompact buffer", tokens: 33_000, deferred: false, kind: "" },
		{ name: "Free space", tokens: 98_600, deferred: false, kind: "free" },
	],
};

test("PRD-005.R8: the context segment is hidden until the conversation's first finished turn", () => {
	assert.equal(contextSegment({ turns: 0, context: null }), null);
	assert.equal(contextSegment({ turns: 0, context: CONTEXT }), null);
	assert.notEqual(contextSegment({ turns: 1, context: CONTEXT }), null);
});

test("PRD-005.R8: after a clear the context segment is hidden until the next finished turn, whatever it last reported", () => {
	assert.equal(contextSegment({ turns: 3, context: CONTEXT }, null, false, true), null);
	assert.equal(contextSegment({ turns: 3, context: null }, null, true, true), null);
	assert.notEqual(contextSegment({ turns: 3, context: CONTEXT }, null, false, false), null);
});

test("PRD-005.R8: the context segment shows the percentage and names the tokens used of the window", () => {
	assert.deepEqual(contextSegment({ turns: 1, context: CONTEXT }), {
		percent: 34,
		label: "Context: 68.4k of 200.0k tokens (34%)",
		warn: false,
		compacting: false,
		cache: null,
	});
});

test("PRD-005.R8: the context segment takes the warning color from 80% as shown", () => {
	const at = (percentage) => contextSegment({ turns: 2, context: { ...CONTEXT, percentage } });
	assert.equal(at(79).warn, false);
	assert.equal(at(79.4).warn, false);
	assert.deepEqual([at(79.5).percent, at(79.5).warn], [80, true], "a reply shown as 80% is in the warning color");
	assert.equal(at(80).warn, true);
	assert.equal(at(100).warn, true);
});

test("PRD-005.R8: with no answer from the CLI the segment shows no percentage", () => {
	assert.deepEqual(contextSegment({ turns: 1, context: null }), {
		percent: null,
		label: "Context: not reported",
		warn: false,
		compacting: false,
		cache: null,
	});
});

test("PRD-005.R8: the hover card shows the tokens used of the window and a bar", () => {
	assert.deepEqual(contextHover(CONTEXT), { used: "68k / 200k", percent: 34, note: null, cache: null });
	assert.deepEqual(contextHover(null), {
		used: null,
		percent: null,
		note: "Claude Code has not reported the context window yet.",
		cache: null,
	});
});

const cacheAt = (state, left, extra = {}) => ({
	state,
	leftMs: left ? 1 : 0,
	left,
	lifetime: "5-min",
	lifetimeMs: 300_000,
	cachedTokens: 61_200,
	expiresAt: null,
	fraction: 0,
	...extra,
});

test("PRD-005.R11, PRD-001.R28: the segment carries the cache state as an icon, a time and text in its label", () => {
	const usage = { turns: 1, context: CONTEXT };
	const warm = contextSegment(usage, cacheAt("warm", "4:12"));
	assert.deepEqual(warm.cache, { state: "warm", icon: "zap", time: "4:12" });
	assert.equal(warm.label, "Context: 68.4k of 200.0k tokens (34%). Prompt cache warm, 4:12 left");
	const expiring = contextSegment(usage, cacheAt("expiring", "0:48"));
	assert.deepEqual(expiring.cache, { state: "expiring", icon: "zap", time: "0:48" });
	assert.match(expiring.label, /\. Prompt cache expiring, 0:48 left$/);
	const cold = contextSegment(usage, cacheAt("cold", ""));
	assert.deepEqual(cold.cache, { state: "cold", icon: "zap-off", time: "" }, "a struck bolt tells cold without color");
	assert.match(cold.label, /\. Prompt cache cold$/);
	const refreshing = contextSegment(usage, cacheAt("refreshing", ""));
	assert.deepEqual(refreshing.cache, { state: "refreshing", icon: "zap", time: "" });
	assert.match(refreshing.label, /\. Prompt cache refreshing$/);
	assert.equal(contextSegment(usage, null).cache, null, "no cache state until a response reports one");
	assert.equal(contextSegment({ turns: 0, context: null }, cacheAt("warm", "4:12")), null, "still hidden before the first turn ends");
	assert.equal(contextSegment({ turns: 1, context: null }, cacheAt("cold", "")).label, "Context: not reported. Prompt cache cold");
});

test("PRD-005.R11: the segment's label says minutes for a one-hour countdown", () => {
	const view = contextSegment({ turns: 1, context: CONTEXT }, cacheAt("warm", "52m", { leftMs: 52 * 60_000 }));
	assert.match(view.label, /Prompt cache warm, 52 min left$/);
});

test("PRD-005.R8, R11: the hover card adds the cache state and its time left", () => {
	assert.equal(contextHover(CONTEXT, cacheAt("warm", "4:12")).cache, "Warm · 4:12 left");
	assert.equal(contextHover(CONTEXT, cacheAt("expiring", "0:48")).cache, "Expiring · 0:48 left");
	assert.equal(contextHover(CONTEXT, cacheAt("cold", "")).cache, "Cold");
	assert.equal(contextHover(CONTEXT, cacheAt("refreshing", "")).cache, "Refreshing");
	assert.equal(contextHover(null, cacheAt("warm", "52m", { leftMs: 52 * 60_000 })).cache, "Warm · 52 min left");
});

test("PRD-005.R8: the popover shows the model and window, the tokens used, a bar and legend by category, and the autocompact point", () => {
	const view = contextPopover(CONTEXT, "");
	assert.equal(view.window, "Opus 5.5 · 200k window");
	assert.deepEqual([view.used, view.ofWindow], ["68.4k", "of 200k tokens"]);
	assert.equal(view.percent, 34);
	assert.deepEqual(
		view.bar.map(({ name, share, swatch }) => [name, share, swatch]),
		[
			["System prompt", 1.55, 1],
			["System tools", 6.9, 2],
			["Messages", 17.15, 3],
			["Autocompact buffer", 16.5, "reserved"],
		]
	);
	assert.deepEqual(
		view.legend.map(({ name, tokens, swatch }) => [name, tokens, swatch]),
		[
			["System prompt", "3.1k", 1],
			["System tools", "14k", 2],
			["MCP tools (deferred)", "11k", "deferred"],
			["Messages", "34k", 3],
			["Autocompact buffer", "33k", "reserved"],
		]
	);
	assert.equal(view.autoCompact, "Autocompacts at 167k · 99k to go");
	assert.equal(view.note, null);
});

test("PRD-005.R8: the context surfaces round tokens to a whole thousand from 10k and drop a zero decimal", () => {
	assert.deepEqual(
		[950, 3_100, 9_960, 10_400, 68_400, 200_000, 999_600, 1_000_000, 1_500_000].map(shortTokens),
		["950", "3.1k", "10k", "10k", "68k", "200k", "1M", "1M", "1.5M"]
	);
});

test("PRD-005.R8: the popover falls back to the reported model, and leaves out what the CLI did not send", () => {
	const bare = { ...CONTEXT, model: null, autoCompactAt: null, categories: [] };
	const view = contextPopover(bare, "claude-sonnet-5");
	assert.equal(view.window, "Sonnet 5 · 200k window");
	assert.deepEqual([view.bar, view.legend, view.autoCompact], [[], [], null]);
	assert.equal(contextPopover(bare, "").window, "200k window");
	const past = contextPopover({ ...CONTEXT, totalTokens: 170_000 }, "");
	assert.equal(past.autoCompact, "Autocompacts at 167k · 0 to go");
	const many = contextPopover({ ...CONTEXT, categories: Array.from({ length: 8 }, (_, i) => ({ name: `c${i}`, tokens: 10, deferred: false, kind: "" })) }, "");
	assert.deepEqual(many.bar.map((segment) => segment.swatch), [1, 2, 3, 4, 5, 6, 1, 2], "the six category colors repeat");
});

test("PRD-005.R8: before the CLI reports, the popover says so", () => {
	const view = contextPopover(null, "claude-opus-5-5");
	assert.equal(view.window, "Opus 5.5");
	assert.deepEqual([view.used, view.ofWindow, view.percent, view.bar, view.legend, view.autoCompact], [null, null, null, [], [], null]);
	assert.equal(view.note, "Claude Code has not reported the context window yet.");
});

test("PRD-005.R3: plan usage is polled only while on, shown, in a visible document and at a fit step below 4", () => {
	const visible = { showUsage: true, documentHidden: false, segmentShown: true, step: 3 };
	assert.equal(usageSegmentVisible(visible), true);
	assert.equal(usageSegmentVisible({ ...visible, step: 0 }), true);
	assert.equal(usageSegmentVisible({ ...visible, step: 4 }), false);
	assert.equal(usageSegmentVisible({ ...visible, step: 5 }), false);
	assert.equal(usageSegmentVisible({ ...visible, showUsage: false }), false);
	assert.equal(usageSegmentVisible({ ...visible, documentHidden: true }), false);
	assert.equal(usageSegmentVisible({ ...visible, segmentShown: false }), false);
});

test("PRD-005.R8: while the CLI reports compacting the segment is tinted and its label ends \", compacting\"", () => {
	const usage = { turns: 1, context: CONTEXT };
	const idle = contextSegment(usage, null, false);
	assert.equal(idle.compacting, false);
	assert.equal(contextSegment(usage).compacting, false, "compacting is off by default");
	const bare = contextSegment(usage, null, true);
	assert.equal(bare.compacting, true);
	assert.equal(bare.label, "Context: 68.4k of 200.0k tokens (34%), compacting");
	assert.equal(bare.cache, null, "no cache part appears that the CLI has not reported");
	assert.equal(contextSegment({ turns: 1, context: null }, null, true).label, "Context: not reported, compacting");
	assert.equal(contextSegment({ turns: 0, context: null }, null, true), null, "still hidden before the first turn ends");
});

test("PRD-005.R8, PRD-005.R11: while compacting the cache part shows the struck bolt and no time; the label keeps the cache state", () => {
	const usage = { turns: 1, context: CONTEXT };
	const view = contextSegment(usage, cacheAt("warm", "4:12"), true);
	assert.deepEqual(view.cache, { state: "cold", icon: "zap-off", time: "" });
	assert.equal(view.label, "Context: 68.4k of 200.0k tokens (34%). Prompt cache warm, 4:12 left, compacting");
	assert.deepEqual(contextSegment(usage, cacheAt("warm", "4:12"), false).cache, { state: "warm", icon: "zap", time: "4:12" });
});
