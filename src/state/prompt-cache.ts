/**
 * The prompt cache countdown (PRD-005.R11; DES-007 Prompt cache): an estimate
 * from the cache usage the main agent's responses report, since Claude Code
 * reports no expiry. A pure reducer over the stream messages and the view the
 * context segment, its hover card, its popover and the `/context` card draw.
 */

export const CACHE_HOUR_MS = 3_600_000;
export const CACHE_FIVE_MIN_MS = 300_000;
/** Under this much left the cache is expiring. */
export const EXPIRING_MS = 60_000;
/** Above this much left the time shows as whole minutes. */
export const MINUTES_ABOVE_MS = 600_000;
/** A minute-grained label is redrawn once a minute while at least this much is left, so the switch to m:ss is not missed. */
const MINUTE_TICK_ABOVE_MS = MINUTES_ABOVE_MS + 60_000;

export interface PromptCache {
	/** A main-agent response has reported cache reads or writes since the conversation opened. */
	seen: boolean;
	/** One hour when the main agent's last cache write was a one-hour write, else five minutes. */
	lifetimeMs: number;
	/** When the last report restarted the countdown. */
	refreshedAt: number | null;
	/** Tokens the last report read from or wrote to the cache. */
	cachedTokens: number;
	/** A main-agent response is streaming. */
	refreshing: boolean;
	/** Compacted, cleared or the model changed since the last report. */
	cold: boolean;
}

export function emptyCache(): PromptCache {
	return { seen: false, lifetimeMs: CACHE_FIVE_MIN_MS, refreshedAt: null, cachedTokens: 0, refreshing: false, cold: false };
}

function count(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * The cache after one stream message. A message of a subagent (it names a
 * parent tool call) changes nothing: its writes are five-minute in every case
 * observed and never set the main agent's countdown (E4). The same object
 * comes back when nothing changed.
 */
export function cacheAfter(cache: PromptCache, message: unknown, now: number): PromptCache {
	const fields = record(message);
	if (fields.parent_tool_use_id) return cache;
	switch (fields.type) {
		case "stream_event": {
			const type = record(fields.event).type;
			if (type === "message_start") return cache.refreshing ? cache : { ...cache, refreshing: true };
			if (type === "message_stop") return cache.refreshing ? { ...cache, refreshing: false } : cache;
			return cache;
		}
		case "assistant":
			return reported(cache, record(record(fields.message).usage), now);
		case "result":
			return cacheIdle(cache);
		default:
			return cache;
	}
}

/** A main-agent response reported its usage: a restart when it read or wrote the cache. */
function reported(cache: PromptCache, usage: Record<string, unknown>, now: number): PromptCache {
	const split = record(usage.cache_creation);
	const hour = count(split.ephemeral_1h_input_tokens);
	const written = Math.max(count(usage.cache_creation_input_tokens), hour + count(split.ephemeral_5m_input_tokens));
	const read = count(usage.cache_read_input_tokens);
	if (written + read === 0) return cache;
	let lifetimeMs = cache.seen ? cache.lifetimeMs : CACHE_FIVE_MIN_MS;
	if (written > 0) lifetimeMs = hour > 0 ? CACHE_HOUR_MS : CACHE_FIVE_MIN_MS;
	return { ...cache, seen: true, lifetimeMs, refreshedAt: now, cachedTokens: written + read, cold: false };
}

/** The turn ended: nothing streams any more. */
export function cacheIdle(cache: PromptCache): PromptCache {
	return cache.refreshing ? { ...cache, refreshing: false } : cache;
}

/** The conversation was compacted or cleared, or its model changed: the next request rebuilds the cache. */
export function coldCache(cache: PromptCache): PromptCache {
	if (!cache.seen || (cache.cold && !cache.refreshing)) return cache;
	return { ...cache, cold: true, refreshing: false };
}

export type CacheState = "refreshing" | "warm" | "expiring" | "cold";

export interface CacheView {
	state: CacheState;
	/** Time left while warm or expiring, else 0. */
	leftMs: number;
	/** "4:12" or "52m" while warm or expiring, else "". */
	left: string;
	/** "5-min" or "1-hour". */
	lifetime: string;
	lifetimeMs: number;
	cachedTokens: number;
	/** When the estimate runs out, or null when it is unknown. */
	expiresAt: number | null;
	/** The share of the lifetime left, 0 to 1. */
	fraction: number;
}

/** "4:12"; "52m" (whole minutes) while more than 10 minutes are left. */
export function formatCacheLeft(ms: number): string {
	if (ms > MINUTES_ABOVE_MS) return `${Math.ceil(ms / 60_000)}m`;
	const seconds = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The cache as the surfaces show it at `now`; null before any main-agent response reported it. */
export function cacheView(cache: PromptCache, now: number): CacheView | null {
	if (!cache.seen) return null;
	const expiresAt = cache.refreshedAt === null ? null : cache.refreshedAt + cache.lifetimeMs;
	const left = expiresAt === null ? 0 : Math.max(0, expiresAt - now);
	let state: CacheState;
	if (cache.refreshing) state = "refreshing";
	else if (cache.cold || left === 0) state = "cold";
	else state = left < EXPIRING_MS ? "expiring" : "warm";
	const counting = state === "warm" || state === "expiring";
	return {
		state,
		leftMs: counting ? left : 0,
		left: counting ? formatCacheLeft(left) : "",
		lifetime: cache.lifetimeMs === CACHE_HOUR_MS ? "1-hour" : "5-min",
		lifetimeMs: cache.lifetimeMs,
		cachedTokens: cache.cachedTokens,
		expiresAt,
		fraction: counting ? left / cache.lifetimeMs : 0,
	};
}

/** "4:12 left", "52 min left" in text; "" while there is no countdown. */
export function cacheLeftText(view: CacheView): string {
	if (!view.left) return "";
	return view.leftMs > MINUTES_ABOVE_MS ? `${view.left.replace(/m$/, "")} min left` : `${view.left} left`;
}

/** The accessible text of the state (PRD-001.R28): "Prompt cache warm, 4:12 left", "..., 52 min left", "Prompt cache cold". */
export function cacheLabel(view: CacheView): string {
	const left = cacheLeftText(view);
	return left ? `Prompt cache ${view.state}, ${left}` : `Prompt cache ${view.state}`;
}

/**
 * Whether a surface needs the ticker, from the view it last drew: while it
 * shows a countdown. Not from the live view, which is cold once the time has
 * run out before the surface draws that last change.
 */
export function countdownTicks(drawn: CacheView | null): boolean {
	return drawn !== null && drawn.left !== "";
}

/** How often a label of this view needs redrawing (PRD-001.R29): a minute while it shows whole minutes far from the switch, else a second. */
export function cachePeriodMs(view: CacheView): number {
	return view.leftMs > MINUTE_TICK_ABOVE_MS ? 60_000 : 1000;
}
