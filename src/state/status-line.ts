/**
 * The status line's segments (DES-003 Status line): their order, strings,
 * accessible labels and tooltips, DES-004's mode display rule, the context
 * segment with its hover card and popover, the fit step, and when plan usage
 * is polled.
 */

import { contextCategoryKind, formatTokens, shortTokens } from "../commands";
import { describeModel, describeModelId, effortEntry, type CliModel, type ResolvedModels } from "../models";
import type { ContextUsage } from "../protocol/types";
import {
	inheritedModeEntry,
	MODE_TABLE,
	modeName,
	profileLabel,
	reportedModeEntry,
	type CliProfile,
	type MenuMode,
	type ModeEntry,
} from "../settings-core";
import { cacheLabel, cacheLeftText, type CacheState, type CacheView } from "./prompt-cache";
import type { ModeState, UsageTotals } from "./tab";

export const SEGMENT_ORDER = ["model", "effort", "permission", "profile", "context", "usage"] as const;
export type SegmentKind = (typeof SEGMENT_ORDER)[number];

export interface SegmentView {
	icon: string;
	/** Shown below 560 px of main column. */
	short: string;
	/** Shown from 560 px. */
	long: string;
	/** Accessible name, with the value in it (PRD-001.R31). */
	label: string;
	tooltip: string;
	warn: boolean;
}

/** The mode shown for a tab, and its menu value; null for a mode the menu does not offer. */
export interface ShownMode extends ModeEntry {
	value: MenuMode | null;
}

/**
 * DES-004's display rule, first match: Auto-approve as picked; the mode the
 * CLI reported; an inherited mode as the profile's CLI last started it, or
 * Claude Code default; the pick.
 */
export function shownMode(state: ModeState, startupMode: string | undefined): ShownMode {
	if (state.selectedMode === "auto") return { value: "auto", ...MODE_TABLE.auto };
	if (state.cliMode) return reportedModeEntry(state.cliMode);
	if (state.inheritMode) {
		const startup = startupMode ? reportedModeEntry(startupMode) : null;
		return { ...inheritedModeEntry(startup), value: startup?.value ?? null };
	}
	return reportedModeEntry(state.selectedMode);
}

export function modeSegment(mode: ShownMode): SegmentView {
	const label = `Permissions: ${modeName(mode)}`;
	return {
		icon: mode.icon,
		short: mode.short,
		long: mode.long,
		label,
		tooltip: mode.hover ? `${mode.long} · ${mode.hover}` : mode.long,
		warn: mode.warn,
	};
}

/**
 * The model the CLI reported, else the pick before it reports; the tooltip
 * is the full model id, as far as it is known.
 */
export function modelSegment(
	pick: string,
	reported: string,
	resolved?: ResolvedModels,
	cliModels?: CliModel[] | null
): SegmentView {
	const shown = describeModel(reported || pick, resolved, cliModels).label;
	const id =
		reported ||
		cliModels?.find((model) => model.value === pick)?.resolvedModel ||
		resolved?.[pick] ||
		pick ||
		shown;
	return { icon: "sparkles", short: shown, long: shown, label: `Model: ${shown}`, tooltip: id, warn: false };
}

export function effortSegment(level: string): SegmentView {
	const entry = effortEntry(level);
	const label = `Reasoning effort: ${entry.short}`;
	return { icon: "gauge", short: entry.short, long: entry.long, label, tooltip: label, warn: false };
}

/** The tab's profile; null while only one profile exists (PRD-001.R3). */
export function profileSegment(profileCount: number, profile: Pick<CliProfile, "name">): SegmentView | null {
	if (profileCount < 2) return null;
	const name = profileLabel(profile);
	const label = `CLI profile: ${name}`;
	return { icon: "terminal", short: name, long: name, label, tooltip: label, warn: false };
}

/**
 * PRD-001.R31's shortening order: step N shortens the Nth kind. Steps 1, 2,
 * 3 and 5 collapse the segment's label (the context segment's percentage);
 * step 4 hides the plan-usage segment.
 */
export const FIT_ORDER = ["profile", "effort", "permission", "usage", "context"] as const;

/** 0: nothing shortened; N: steps 1 to N applied, step 3 left out in Auto-approve and Bypass. */
export type FitStep = 0 | 1 | 2 | 3 | 4 | 5;

/** One shown segment as measured: its width without its label, and its label's natural width. */
export interface SegmentWidths {
	kind: SegmentKind;
	fixed: number;
	labelNatural: number;
}

/** Widths read for a segment, with the mode (long strings from 560 px) and text they were read for. */
export interface MeasuredWidths {
	long: boolean;
	text: string;
	fixed: number;
	labelNatural: number;
}

/**
 * What a hidden segment (plan usage under step 4) counts as: the widths last
 * read, when read in the same mode for text no shorter than it holds now, so
 * it cannot be wider than counted; else 0 for one pass, so it shows and is
 * measured.
 */
export function hiddenWidths(
	last: MeasuredWidths | undefined,
	long: boolean,
	text: string
): Pick<SegmentWidths, "fixed" | "labelNatural"> {
	if (!last || last.long !== long || text.length < last.text.length) return { fixed: 0, labelNatural: 0 };
	return { fixed: last.fixed, labelNatural: last.labelNatural };
}

const HIDE_STEP = 4;
const PERMISSION_STEP = 3;
/** Room a line keeps to fit: `scrollWidth` rounds each label to a whole pixel. */
const SLACK = 1;

function lineWidth(step: FitStep, gap: number, segments: readonly SegmentWidths[], skipPermission: boolean): number {
	let total = 0;
	let shown = 0;
	for (const segment of segments) {
		const shortenedAt = FIT_ORDER.indexOf(segment.kind as (typeof FIT_ORDER)[number]) + 1;
		const applies = shortenedAt > 0 && step >= shortenedAt && !(skipPermission && shortenedAt === PERMISSION_STEP);
		if (applies && shortenedAt === HIDE_STEP) continue;
		total += segment.fixed + (applies ? 0 : segment.labelNatural);
		shown++;
	}
	return total + gap * Math.max(0, shown - 1);
}

/**
 * The fewest steps, in order, whose line fits `available` with a pixel to
 * spare, or the last step when none does. `segments` are the shown ones in line order; in Auto-approve
 * and Bypass (`skipPermission`) step 3 is left out, so the permission segment
 * keeps its label.
 */
export function fitStep(
	available: number,
	gap: number,
	segments: readonly SegmentWidths[],
	skipPermission: boolean
): FitStep {
	const steps: FitStep[] = skipPermission ? [0, 1, 2, 4, 5] : [0, 1, 2, 3, 4, 5];
	for (const step of steps) if (lineWidth(step, gap, segments, skipPermission) + SLACK <= available) return step;
	return 5;
}

/** Whether the plan-usage segment counts as visible for polling (PRD-005.R3); step 4 hides it. */
export function usageSegmentVisible(input: {
	showUsage: boolean;
	documentHidden: boolean;
	/** The segment is rendered: the panel and its line show. */
	segmentShown: boolean;
	step: FitStep;
}): boolean {
	return input.showUsage && !input.documentHidden && input.segmentShown && input.step < HIDE_STEP;
}

// --- Context segment (PRD-005.R8) ---------------------------------------------

/** The context segment takes the warning color from this percentage. */
export const CONTEXT_WARN_PERCENT = 80;

const CONTEXT_UNREPORTED = "Claude Code has not reported the context window yet.";

/** The prompt cache as the context segment draws it after the percentage (PRD-005.R11). */
export interface CacheSegmentView {
	state: CacheState;
	/** Lucide: a bolt, struck through while cold (the shape tells the state as well as the color). */
	icon: "zap" | "zap-off";
	/** "4:12" or "52m" while warm or expiring, else "". */
	time: string;
}

export interface ContextSegmentView {
	/** The ring's fill and the percentage shown; null when the CLI has not answered. */
	percent: number | null;
	/** Accessible name, with the cache state in it (PRD-001.R28). */
	label: string;
	warn: boolean;
	/** The CLI reports a compaction: the segment takes the warning tint (PRD-005.R8). */
	compacting: boolean;
	/** Null while no main-agent response has reported cache tokens. */
	cache: CacheSegmentView | null;
}

function usedOf(context: ContextUsage): string {
	return `${formatTokens(context.totalTokens)} of ${formatTokens(context.maxTokens)} tokens`;
}

/**
 * Null (hidden) until the conversation's first finished turn; then the last
 * percentage the CLI gave, or none, and the prompt cache's state when known.
 * While `compacting`, the label ends ", compacting" and the cache part shows
 * the struck bolt without a time, since the compaction rewrites the prompt.
 * Hidden after a clear until the next finished turn (`hidden`, PRD-005.R8).
 */
export function contextSegment(
	usage: Pick<UsageTotals, "turns" | "context">,
	cache: CacheView | null = null,
	compacting = false,
	hidden = false
): ContextSegmentView | null {
	if (usage.turns === 0 || hidden) return null;
	const segment: CacheSegmentView | null = !cache
		? null
		: compacting
			? { state: "cold", icon: "zap-off", time: "" }
			: { state: cache.state, icon: cache.state === "cold" ? "zap-off" : "zap", time: cache.left };
	const suffix = (cache ? `. ${cacheLabel(cache)}` : "") + (compacting ? ", compacting" : "");
	const context = usage.context;
	if (!context)
		return { percent: null, label: `Context: not reported${suffix}`, warn: false, compacting, cache: segment };
	const percent = Math.round(context.percentage);
	return {
		percent,
		label: `Context: ${usedOf(context)} (${percent}%)${suffix}`,
		warn: percent >= CONTEXT_WARN_PERCENT,
		compacting,
		cache: segment,
	};
}

export interface ContextHoverView {
	/** "68k / 200k". */
	used: string | null;
	/** The bar's fill. */
	percent: number | null;
	note: string | null;
	/** "Warm · 4:12 left", "Expiring · 0:48 left", "Refreshing" or "Cold"; null while the cache state is unknown. */
	cache: string | null;
}

const CACHE_WORDS: Readonly<Record<CacheState, string>> = {
	refreshing: "Refreshing",
	warm: "Warm",
	expiring: "Expiring",
	cold: "Cold",
};

/** The state's word: "Refreshing", "Warm", "Expiring" or "Cold" (PRD-005.R11). */
export function cacheWord(state: CacheState): string {
	return CACHE_WORDS[state];
}

/** The context segment's hover card (PRD-005.R8): the tokens used, and the prompt cache's state with the time left. */
export function contextHover(context: ContextUsage | null, cache: CacheView | null = null): ContextHoverView {
	const left = cache ? cacheLeftText(cache) : "";
	const state = cache ? (left ? `${cacheWord(cache.state)} · ${left}` : cacheWord(cache.state)) : null;
	if (!context) return { used: null, percent: null, note: CONTEXT_UNREPORTED, cache: state };
	return {
		used: `${shortTokens(context.totalTokens)} / ${shortTokens(context.maxTokens)}`,
		percent: Math.round(context.percentage),
		note: null,
		cache: state,
	};
}

/** A category's swatch: one of the six category colors, the hatched reserve, or none for a deferred one. */
export type ContextSwatch = 1 | 2 | 3 | 4 | 5 | 6 | "reserved" | "deferred";

export interface ContextPopoverView {
	/** "Opus 5.5 · 200k window". */
	window: string;
	/** The headline: "68.4k", then `ofWindow`. */
	used: string | null;
	/** "of 200k tokens". */
	ofWindow: string | null;
	percent: number | null;
	/** What fills the window, each `share` percent of it wide. */
	bar: Array<{ name: string; share: number; swatch: ContextSwatch }>;
	/** Each category with tokens but free space, deferred ones marked. */
	legend: Array<{ name: string; tokens: string; swatch: ContextSwatch }>;
	/** "Autocompacts at 167k · 99k to go". */
	autoCompact: string | null;
	note: string | null;
}

/**
 * The "Context" popover (PRD-005.R8). The model is the one the reply names,
 * else the one the CLI last reported. Deferred categories are not in the
 * window, so they show in the legend only; free space is the bar's rest.
 */
export function contextPopover(context: ContextUsage | null, reportedModel: string): ContextPopoverView {
	const modelId = context?.model || reportedModel;
	const model = modelId ? (describeModelId(modelId)?.label ?? modelId) : "";
	const windowSize = context ? `${shortTokens(context.maxTokens)} window` : "";
	const window = [model, windowSize].filter(Boolean).join(" · ");
	if (!context)
		return {
			window,
			used: null,
			ofWindow: null,
			percent: null,
			bar: [],
			legend: [],
			autoCompact: null,
			note: CONTEXT_UNREPORTED,
		};
	const bar: ContextPopoverView["bar"] = [];
	const legend: ContextPopoverView["legend"] = [];
	let colors = 0;
	for (const category of context.categories) {
		const kind = contextCategoryKind(category.kind, category.name);
		if (category.tokens <= 0 || kind === "free") continue;
		let swatch: ContextSwatch;
		if (category.deferred) swatch = "deferred";
		else if (kind === "buffer") swatch = "reserved";
		else swatch = ((colors++ % 6) + 1) as ContextSwatch;
		const name = category.deferred ? `${category.name} (deferred)` : category.name;
		legend.push({ name, tokens: shortTokens(category.tokens), swatch });
		if (!category.deferred)
			bar.push({ name: category.name, share: (category.tokens * 100) / Math.max(1, context.maxTokens), swatch });
	}
	const at = context.autoCompactAt;
	return {
		window,
		used: formatTokens(context.totalTokens),
		ofWindow: `of ${shortTokens(context.maxTokens)} tokens`,
		percent: Math.round(context.percentage),
		bar,
		legend,
		autoCompact:
			at === null
				? null
				: `Autocompacts at ${shortTokens(at)} · ${shortTokens(Math.max(0, at - context.totalTokens))} to go`,
		note: null,
	};
}
