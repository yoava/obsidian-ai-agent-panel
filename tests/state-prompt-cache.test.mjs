import { test } from "node:test";
import assert from "node:assert/strict";
import { compactionSignal } from "./.build/state/compaction.mjs";
import {
	cacheAfter,
	cacheIdle,
	cacheLabel,
	cachePeriodMs,
	cacheView,
	coldCache,
	countdownTicks,
	emptyCache,
	formatCacheLeft,
} from "./.build/state/prompt-cache.mjs";

const T0 = 1_000_000;
const MIN = 60_000;

const usage = (read, h1, m5) => ({
	input_tokens: 10,
	output_tokens: 20,
	cache_read_input_tokens: read,
	cache_creation_input_tokens: h1 + m5,
	cache_creation: { ephemeral_1h_input_tokens: h1, ephemeral_5m_input_tokens: m5 },
});
const assistant = (u, parent = null) => ({ type: "assistant", parent_tool_use_id: parent, message: { role: "assistant", content: [], usage: u } });
const event = (type, parent = null) => ({ type: "stream_event", parent_tool_use_id: parent, event: { type } });

test("PRD-005.R11: no cache state until a main-agent response reports cache tokens", () => {
	const cache = emptyCache();
	assert.equal(cacheView(cache, T0), null);
	assert.equal(cacheView(cacheAfter(cache, event("message_start"), T0), T0), null, "streaming alone reports nothing");
	assert.equal(cacheView(cacheAfter(cache, assistant(usage(0, 0, 0)), T0), T0), null, "a response without cache tokens");
	assert.equal(cacheView(cacheAfter(cache, { type: "assistant", parent_tool_use_id: null, message: { content: [] } }, T0), T0), null, "no usage at all");
});

test("PRD-005.R11: a one-hour write sets a one-hour lifetime, any other write five minutes (E4)", () => {
	const hour = cacheView(cacheAfter(emptyCache(), assistant(usage(5000, 30_414, 0)), T0), T0);
	assert.equal(hour.lifetimeMs, 60 * MIN);
	assert.equal(hour.state, "warm");
	assert.equal(hour.cachedTokens, 35_414, "reads and writes are the cached prefix");
	assert.equal(hour.expiresAt, T0 + 60 * MIN);
	const five = cacheView(cacheAfter(emptyCache(), assistant(usage(0, 0, 25_426)), T0), T0);
	assert.equal(five.lifetimeMs, 5 * MIN);
	const bare = cacheView(cacheAfter(emptyCache(), assistant({ cache_creation_input_tokens: 100 }), T0), T0);
	assert.equal(bare.lifetimeMs, 5 * MIN, "a write with no lifetime split is five minutes");
});

test("PRD-005.R11: a read without a write keeps the lifetime of the last write, five minutes before any", () => {
	let cache = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	cache = cacheAfter(cache, assistant(usage(9000, 0, 0)), T0 + 10 * MIN);
	const view = cacheView(cache, T0 + 10 * MIN);
	assert.equal(view.lifetimeMs, 60 * MIN);
	assert.equal(view.expiresAt, T0 + 70 * MIN, "the read restarted the countdown");
	assert.equal(cacheView(cacheAfter(emptyCache(), assistant(usage(9000, 0, 0)), T0), T0).lifetimeMs, 5 * MIN);
});

test("PRD-005.R11 (E4): a subagent's writes never set the main agent's countdown", () => {
	let cache = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	const before = cache;
	cache = cacheAfter(cache, assistant(usage(12_000, 0, 300), "toolu_agent"), T0 + 2 * MIN);
	assert.equal(cache, before, "unchanged, the same object");
	assert.equal(cacheAfter(cache, event("message_start", "toolu_agent"), T0 + 2 * MIN), before, "nor does its streaming");
	assert.equal(cacheView(cache, T0 + 2 * MIN).lifetimeMs, 60 * MIN);
	assert.equal(cacheView(cache, T0 + 2 * MIN).expiresAt, T0 + 60 * MIN);
});

test("PRD-005.R11: the cache shows as refreshing, with no countdown, while a main-agent response streams", () => {
	let cache = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	cache = cacheAfter(cache, event("message_start"), T0 + 3 * MIN);
	let view = cacheView(cache, T0 + 3 * MIN);
	assert.equal(view.state, "refreshing");
	assert.equal(view.left, "");
	assert.equal(cacheLabel(view), "Prompt cache refreshing");
	cache = cacheAfter(cache, assistant(usage(2000, 0, 0)), T0 + 3 * MIN + 5000);
	assert.equal(cacheView(cache, T0 + 3 * MIN + 5000).state, "refreshing", "still streaming until the response stops");
	cache = cacheAfter(cache, event("message_stop"), T0 + 3 * MIN + 6000);
	view = cacheView(cache, T0 + 3 * MIN + 6000);
	assert.equal(view.state, "warm");
	assert.equal(view.expiresAt, T0 + 3 * MIN + 5000 + 60 * MIN, "restarted when the response reported");
});

test("PRD-005.R11: a turn that ends without message_stop, or a result, settles the refreshing state", () => {
	let cache = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	cache = cacheAfter(cache, event("message_start"), T0 + MIN);
	assert.equal(cacheView(cacheAfter(cache, { type: "result", subtype: "success" }, T0 + MIN), T0 + MIN).state, "warm");
	assert.equal(cacheView(cacheIdle(cache), T0 + MIN).state, "warm");
	assert.equal(cacheIdle(emptyCache()).refreshing, false);
});

test("PRD-005.R11: expiring under a minute, cold at zero", () => {
	const cache = cacheAfter(emptyCache(), assistant(usage(0, 0, 2000)), T0);
	assert.equal(cacheView(cache, T0 + 4 * MIN).state, "warm");
	const expiring = cacheView(cache, T0 + 4 * MIN + 12_000);
	assert.equal(expiring.state, "expiring");
	assert.equal(expiring.left, "0:48");
	assert.equal(cacheLabel(expiring), "Prompt cache expiring, 0:48 left");
	assert.equal(cacheView(cache, T0 + 5 * MIN - 1).state, "expiring");
	const cold = cacheView(cache, T0 + 5 * MIN);
	assert.equal(cold.state, "cold");
	assert.equal(cold.left, "");
	assert.equal(cacheLabel(cold), "Prompt cache cold");
});

test("PRD-005.R11: compaction, a clear or a model change makes the cache cold until the next report", () => {
	const cache = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	// One compaction path: the boundary is the compaction signal, which `chat-tab` turns into `coldCache`; the reducer ignores the raw message.
	const boundary = { type: "system", subtype: "compact_boundary", compact_metadata: {} };
	assert.equal(compactionSignal(boundary)?.type, "boundary");
	assert.equal(cacheAfter(cache, boundary, T0 + MIN), cache, "cacheAfter leaves system messages alone");
	assert.equal(cacheView(coldCache(cache), T0 + MIN).state, "cold");
	const cold = coldCache(cache);
	assert.equal(cacheView(cold, T0 + MIN).state, "cold");
	assert.equal(cacheView(coldCache(emptyCache()), T0), null, "nothing seen: still no state");
	const again = cacheAfter(cold, assistant(usage(0, 900, 0)), T0 + 2 * MIN);
	assert.equal(cacheView(again, T0 + 2 * MIN).state, "warm");
	// A compaction that ends while its summary still streams is cold, not refreshing.
	const streaming = cacheAfter(cache, event("message_start"), T0 + MIN);
	assert.equal(cacheView(coldCache(streaming), T0 + MIN).state, "cold");
});

test("PRD-005.R11: the time left is m:ss, or whole minutes while more than 10 minutes are left", () => {
	assert.equal(formatCacheLeft(252_000), "4:12");
	assert.equal(formatCacheLeft(48_000), "0:48");
	assert.equal(formatCacheLeft(48_999), "0:48");
	assert.equal(formatCacheLeft(10 * MIN), "10:00");
	assert.equal(formatCacheLeft(10 * MIN + 1), "11m", "rounded up, so 59:30 left reads 60m, as the label's 60 min does");
	assert.equal(formatCacheLeft(52 * MIN + 30_000), "53m");
	assert.equal(formatCacheLeft(60 * MIN), "60m");
	assert.equal(formatCacheLeft(60 * MIN - 1000), "60m");
});

test("PRD-001.R28: the accessible label names the state by text, the time as m:ss or N min", () => {
	const hour = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	assert.equal(cacheLabel(cacheView(hour, T0 + 8 * MIN)), "Prompt cache warm, 52 min left");
	const five = cacheAfter(emptyCache(), assistant(usage(0, 0, 2000)), T0);
	assert.equal(cacheLabel(cacheView(five, T0 + 48_000)), "Prompt cache warm, 4:12 left");
});

test("PRD-001.R29: the countdown ticks once a minute while it shows whole minutes, else once a second", () => {
	const hour = cacheAfter(emptyCache(), assistant(usage(0, 2000, 0)), T0);
	assert.equal(cachePeriodMs(cacheView(hour, T0 + MIN)), 60_000);
	assert.equal(cachePeriodMs(cacheView(hour, T0 + 48 * MIN)), 60_000, "12 minutes left");
	assert.equal(cachePeriodMs(cacheView(hour, T0 + 49 * MIN + 30_000)), 1000, "10 and a half minutes left: seconds soon");
	assert.equal(cachePeriodMs(cacheView(hour, T0 + 55 * MIN)), 1000);
	const five = cacheAfter(emptyCache(), assistant(usage(0, 0, 2000)), T0);
	assert.equal(cachePeriodMs(cacheView(five, T0 + MIN)), 1000);
});

test("PRD-005.R11: the bar's fraction is the share of the lifetime left", () => {
	const five = cacheAfter(emptyCache(), assistant(usage(0, 0, 61_200)), T0);
	assert.equal(cacheView(five, T0 + 48_000).fraction, 0.84);
	assert.equal(cacheView(coldCache(five), T0).fraction, 0);
});

test("PRD-001.R29: a surface ticks from the view it drew, so the draw after the last second still happens", () => {
	const five = cacheAfter(emptyCache(), assistant(usage(0, 0, 2000)), T0);
	const drawn = cacheView(five, T0 + 5 * MIN - 1000);
	assert.equal(drawn.state, "expiring");
	assert.equal(countdownTicks(drawn), true, "shown at 0:01");
	assert.equal(cacheView(five, T0 + 5 * MIN).state, "cold", "the live view is cold a second on");
	assert.equal(countdownTicks(cacheView(five, T0 + 5 * MIN)), false, "drawn cold, it stops");
	assert.equal(countdownTicks(null), false);
	assert.equal(countdownTicks(cacheView(cacheAfter(emptyCache(), { type: "stream_event", event: { type: "message_start" } }, T0), T0)), false, "refreshing has no countdown");
});
