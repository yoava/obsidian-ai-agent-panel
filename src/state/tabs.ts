/**
 * The open tabs as the strip, the switcher and the open-tabs list draw them
 * (DES-003 Tabs and conversation column): their order, each tab's dot and
 * accessible label, whether the strip overflows, the tab hover card, the
 * switcher's label, and the column layout's title block.
 */

import type { Activity } from "./tab";
import { formatElapsed } from "./turn";

/** What ordering and drawing read of an open tab; `K` identifies it while it is open. */
export interface TabSummary<K = number> {
	key: K;
	/** The title as shown: "New conversation" while it has none. */
	title: string;
	pinned: boolean;
	/** When it was pinned; null when unpinned or unknown. */
	pinnedAt: number | null;
	activity: Activity;
}

/** Pinned first, oldest pin first (an unknown time last); then the rest in drag order. */
export function stripOrder<T extends Pick<TabSummary<unknown>, "pinned" | "pinnedAt">>(tabs: readonly T[]): T[] {
	const pinTime = (tab: T): number | null => (tab.pinned ? (tab.pinnedAt ?? Infinity) : null);
	// Array.prototype.sort is stable, so unpinned tabs keep their drag order.
	return [...tabs].sort((a, b) => {
		const left = pinTime(a);
		const right = pinTime(b);
		if (left === null) return right === null ? 0 : 1;
		if (right === null) return -1;
		return left === right ? 0 : left < right ? -1 : 1;
	});
}

/**
 * "Next conversation tab" (+1) and "Previous conversation tab" (-1): the
 * key of the tab after or before the active one in strip order, wrapping
 * at the ends; with no active tab, the first or last; null with fewer than
 * two tabs, when the command is not offered.
 */
export function stepTab<K>(tabs: readonly TabSummary<K>[], activeKey: K | null, delta: -1 | 1): K | null {
	if (tabs.length < 2) return null;
	const order = stripOrder(tabs);
	const at = order.findIndex((tab) => tab.key === activeKey);
	const from = at < 0 ? (delta === 1 ? -1 : 0) : at;
	return order[(from + delta + order.length) % order.length].key;
}

/** Sub-pixel layout and rounded scroll widths leave this much (px) unaccounted. */
const FIT_SLACK_PX = 1;

/**
 * Whether the strip overflows, so it shows its "All conversations" button
 * (PRD-001.R7). Read with the button as drawn: hidden, it shows once the tabs
 * overflow without it; shown, the strip is narrower and it hides only once
 * they fit beside it, so toggling it never undoes itself.
 */
export function stripOverflows(scrollWidth: number, clientWidth: number): boolean {
	return scrollWidth - clientWidth > FIT_SLACK_PX;
}

/**
 * The drag order after a drop: the tabs in `shown`, in that order, take the
 * slots those tabs held; every other tab (pinned, or hidden by the column's
 * filter) keeps its slot, so unpinning returns a tab where it was.
 */
export function reorder<T>(tabs: readonly T[], shown: readonly T[]): T[] {
	const moved = new Set(shown);
	let next = 0;
	return tabs.map((tab) => (moved.has(tab) ? shown[next++] : tab));
}

export type DotState = "busy" | "waiting" | "none";

/** Working or writing: a pulsing accent dot; waiting: a steady warning one; idle: none. */
export function dotState(activity: Activity): DotState {
	if (activity === "waiting") return "waiting";
	return activity === "idle" ? "none" : "busy";
}

const WAITING = "Waiting for you";

/** A tab in the strip or a row in the column. */
export interface TabItemView {
	/** The pin replaces the dot on a pinned tab and takes the dot's state. */
	glyph: "pin" | "dot" | "none";
	state: DotState;
	/** The glyph's tooltip: only the waiting dot has one (PRD-001.R7); the pin is named by `label`. */
	glyphTitle: string;
	title: string;
	/** The accessible name: the title, then the pin and the state in words (PRD-001.R28). */
	label: string;
}

export function tabItem(tab: Pick<TabSummary<unknown>, "title" | "pinned" | "activity">): TabItemView {
	const state = dotState(tab.activity);
	const words = [tab.title];
	if (tab.pinned) words.push("pinned");
	if (state === "busy") words.push("working");
	else if (state === "waiting") words.push("waiting for you");
	return {
		glyph: tab.pinned ? "pin" : state === "none" ? "none" : "dot",
		state,
		glyphTitle: state === "waiting" ? WAITING : "",
		title: tab.title,
		label: words.join(", "),
	};
}

/** A dollar amount: four decimals below $1, two from $1 (DES-007). */
export function formatCost(usd: number): string {
	return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

const clock = (time: number): string =>
	new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** When a conversation started: HH:MM on `now`'s day, else the date before it. */
export function startedLabel(startedAt: number, now: number): string {
	const date = new Date(startedAt);
	if (date.toDateString() === new Date(now).toDateString()) return clock(startedAt);
	return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${clock(startedAt)}`;
}

/** What the tab hover card shows (PRD-001.R7). */
export interface TabCardInput {
	title: string;
	activity: Activity;
	/** When the running turn started; null when unknown or none runs. */
	workingSince: number | null;
	/** `state/prompts`' count. */
	prompts: number;
	/** The model's label. */
	model: string;
	/** The permission mode's short string. */
	mode: string;
	/** When the conversation's first message was recorded; null before. */
	startedAt: number | null;
	/** The conversation's cost (DES-007). */
	costUsd: number;
	/** A branch's note on what the cost includes (`state/fork-base`); null or absent for any other. */
	costNote?: string | null;
}

export interface TabCardView {
	title: string;
	/** "Working · 2m 14s" or "Waiting for you"; null while idle. */
	state: { kind: Exclude<DotState, "none">; text: string } | null;
	/** "3 prompts · Opus 4.1 · Ask · started 14:02" */
	meta: string;
	/** The cost while above zero. */
	cost: string | null;
	/** The note under the cost; null without a cost. */
	costNote: string | null;
}

export function tabCard(input: TabCardInput, now: number): TabCardView {
	const dot = dotState(input.activity);
	let state: TabCardView["state"] = null;
	if (dot === "waiting") state = { kind: "waiting", text: WAITING };
	else if (dot === "busy")
		state = {
			kind: "busy",
			text: input.workingSince === null ? "Working" : `Working · ${formatElapsed(now - input.workingSince)}`,
		};
	const meta = [promptsLabel(input.prompts), input.model, input.mode];
	if (input.startedAt !== null) meta.push(startedText(input.startedAt, now));
	return {
		title: input.title,
		state,
		meta: meta.join(" · "),
		cost: input.costUsd > 0 ? formatCost(input.costUsd) : null,
		costNote: input.costUsd > 0 ? input.costNote ?? null : null,
	};
}

const promptsLabel = (count: number): string => `${count} ${count === 1 ? "prompt" : "prompts"}`;

const startedText = (startedAt: number, now: number): string => `started ${startedLabel(startedAt, now)}`;

/** What the column layout's title block shows of the active conversation (PRD-001.R30). */
export interface TitleBlockInput {
	title: string;
	/** `state/prompts`' count. */
	prompts: number;
	/** When the conversation's first message was recorded; null before. */
	startedAt: number | null;
}

/** The title, then "3 prompts · started 14:02". */
export function titleBlock(input: TitleBlockInput, now: number): { title: string; meta: string } {
	const meta = [promptsLabel(input.prompts)];
	if (input.startedAt !== null) meta.push(startedText(input.startedAt, now));
	return { title: input.title, meta: meta.join(" · ") };
}

/** The switcher's accessible name (PRD-001.R30). */
export function switcherLabel(open: number): string {
	return `Switch conversation, ${open} open`;
}

/** A row of the open-tabs list: what the row draws, as a tab or a column row does. */
export interface OpenTabsRow<K> {
	key: K;
	item: TabItemView;
	active: boolean;
}

/** Every open tab in strip order, each as the tab item the strip draws, the active one marked (PRD-001.R7, R30). */
export function openTabsList<K>(tabs: readonly TabSummary<K>[], activeKey: K | null): OpenTabsRow<K>[] {
	return stripOrder(tabs).map((tab) => ({ key: tab.key, item: tabItem(tab), active: tab.key === activeKey }));
}

/**
 * The row focus goes to after `closed` left the open-tabs list, from the
 * rows' keys before and after: the row now in its place, else the one before
 * it; `closed` itself while it still shows (a close that asked and was
 * declined); null when no row is left or `closed` was not drawn.
 */
export function focusAfterClose<K>(before: readonly K[], after: readonly K[], closed: K): K | null {
	if (after.includes(closed)) return closed;
	const at = before.indexOf(closed);
	return at < 0 ? null : (after[at] ?? after[at - 1] ?? null);
}
