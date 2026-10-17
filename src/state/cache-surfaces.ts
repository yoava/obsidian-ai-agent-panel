/**
 * What the prompt cache looks like on the two surfaces that spell it out
 * (PRD-005.R11; DES-007 Prompt cache): the context popover's "Prompt cache"
 * section and the live `/context` card's cache line. The segment and its
 * hover card are in `status-line`.
 */

import { formatTokens } from "../commands";
import { CACHE_HOUR_MS, MINUTES_ABOVE_MS, type CacheState, type CacheView } from "./prompt-cache";
import { cacheWord } from "./status-line";
import type { Activity } from "./tab";

export const CACHE_NOTE = "Estimated from the last request; Claude Code reports no expiry. Each request restarts the timer.";

/** The tooltip of both Compact buttons (the popover's and the card's). */
export const COMPACT_TITLE = "Summarize the conversation now (uses tokens)";

/**
 * Whether `/compact` can be sent now: no turn runs (a mid-turn `/compact`
 * would go straight to the running CLI) and no restore is under way. The one
 * predicate of both Compact buttons and of the send.
 */
export function compactAllowed(activity: Activity, restoring: boolean, held = false): boolean {
	// A send held for a clear or an Undo waits in the held tray; `/compact` would run out of order.
	return activity === "idle" && !restoring && !held;
}

const NONE = "-";

export interface CacheSection {
	state: CacheState;
	/** "Refreshing", "Warm", "Expiring" or "Cold". */
	stateLabel: string;
	/** "4:12", "52m", or "-" while there is no countdown. */
	left: string;
	/** The bar's fill, 0 to 1. */
	fraction: number;
	/** The bar's accessible name: "4 minutes 12 seconds of 5 minutes left". */
	barLabel: string;
	/** "61.2k tokens", or "-" while cold. */
	cached: string;
	/** The expiry time of day, or "-". */
	expires: string;
	/** "5-min TTL" or "1-hour TTL". */
	lifetime: string;
	note: string;
}

function plural(count: number, unit: string): string {
	return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** The time left as it is spoken: "4 minutes 12 seconds", "51 minutes" while more than 10 are left. */
function spokenLeft(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	if (ms > MINUTES_ABOVE_MS) return plural(Math.ceil(ms / 60_000), "minute");
	return [minutes > 0 ? plural(minutes, "minute") : "", seconds % 60 > 0 || minutes === 0 ? plural(seconds % 60, "second") : ""]
		.filter(Boolean)
		.join(" ");
}

function clockWithSeconds(time: number): string {
	return new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** The popover's "Prompt cache" section for a cache that has a state. */
export function cacheSection(view: CacheView): CacheSection {
	const counting = view.state === "warm" || view.state === "expiring";
	const total = view.lifetimeMs === CACHE_HOUR_MS ? "1 hour" : "5 minutes";
	return {
		state: view.state,
		stateLabel: cacheWord(view.state),
		left: counting ? view.left : NONE,
		fraction: view.fraction,
		barLabel: counting ? `${spokenLeft(view.leftMs)} of ${total} left` : `Prompt cache ${view.state}`,
		cached: view.state === "cold" ? NONE : `${formatTokens(view.cachedTokens)} tokens`,
		expires: counting && view.expiresAt !== null ? clockWithSeconds(view.expiresAt) : NONE,
		lifetime: `${view.lifetime} TTL`,
		note: CACHE_NOTE,
	};
}

/** The `/context` card's line: "Prompt cache warm · 61.2k tokens", then the time left. */
export interface CacheCardLine {
	state: CacheState;
	text: string;
	/** "61.2k tokens"; "" while cold. */
	cached: string;
	/** "4:12" or "52m"; "" while there is no countdown. */
	left: string;
}

export function cacheCardLine(view: CacheView | null): CacheCardLine | null {
	if (!view) return null;
	return {
		state: view.state,
		text: `Prompt cache ${view.state}`,
		cached: view.state === "cold" ? "" : `${formatTokens(view.cachedTokens)} tokens`,
		left: view.left,
	};
}
