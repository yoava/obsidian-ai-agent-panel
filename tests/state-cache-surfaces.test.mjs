import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheAfter, cacheView, coldCache, emptyCache } from "./.build/state/prompt-cache.mjs";
import { CACHE_NOTE, cacheCardLine, cacheSection, compactAllowed } from "./.build/state/cache-surfaces.mjs";

const T0 = new Date(2026, 9, 13, 14, 21, 40).getTime();
const MIN = 60_000;
const clock = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const reported = (read, h1, m5, at = T0) =>
	cacheAfter(
		emptyCache(),
		{
			type: "assistant",
			parent_tool_use_id: null,
			message: { usage: { cache_read_input_tokens: read, cache_creation_input_tokens: h1 + m5, cache_creation: { ephemeral_1h_input_tokens: h1, ephemeral_5m_input_tokens: m5 } } },
		},
		at
	);

test("PRD-005.R11: the popover's section has the state, time left, cached tokens, expiry with lifetime and the note", () => {
	const cache = reported(0, 0, 61_200);
	const section = cacheSection(cacheView(cache, T0 + 48_000));
	assert.equal(section.state, "warm");
	assert.equal(section.stateLabel, "Warm");
	assert.equal(section.left, "4:12");
	assert.equal(section.cached, "61.2k tokens");
	assert.equal(section.expires, clock(T0 + 5 * MIN));
	assert.equal(section.lifetime, "5-min TTL");
	assert.equal(section.fraction, 0.84);
	assert.equal(section.barLabel, "4 minutes 12 seconds of 5 minutes left");
	assert.equal(section.note, "Estimated from the last request; Claude Code reports no expiry. Each request restarts the timer.");
	assert.equal(CACHE_NOTE, section.note);
});

test("PRD-005.R11: a one-hour cache shows whole minutes and its 1-hour lifetime", () => {
	const section = cacheSection(cacheView(reported(5000, 30_414, 0), T0 + 8 * MIN + 20_000));
	assert.equal(section.left, "52m", "51:40 left, rounded up");
	assert.equal(section.lifetime, "1-hour TTL");
	assert.equal(section.barLabel, "52 minutes of 1 hour left");
	assert.equal(section.cached, "35.4k tokens");
});

test("PRD-005.R11: the bar label speaks singular units and drops a zero minute", () => {
	const cache = reported(0, 0, 2000);
	assert.equal(cacheSection(cacheView(cache, T0 + 4 * MIN + 59_000)).barLabel, "1 second of 5 minutes left");
	assert.equal(cacheSection(cacheView(cache, T0 + 3 * MIN + 59_000)).barLabel, "1 minute 1 second of 5 minutes left");
	assert.equal(cacheSection(cacheView(cache, T0 + 3 * MIN)).barLabel, "2 minutes of 5 minutes left");
});

test("PRD-005.R11: expiring keeps its countdown; refreshing and cold show none and no expiry", () => {
	const cache = reported(0, 0, 2000);
	const expiring = cacheSection(cacheView(cache, T0 + 4 * MIN + 12_000));
	assert.deepEqual([expiring.state, expiring.stateLabel, expiring.left], ["expiring", "Expiring", "0:48"]);
	const refreshing = cacheSection(cacheView(cacheAfter(cache, { type: "stream_event", parent_tool_use_id: null, event: { type: "message_start" } }, T0), T0));
	assert.deepEqual([refreshing.stateLabel, refreshing.left, refreshing.expires, refreshing.fraction], ["Refreshing", "-", "-", 0]);
	assert.equal(refreshing.barLabel, "Prompt cache refreshing");
	const cold = cacheSection(cacheView(coldCache(cache), T0));
	assert.deepEqual([cold.stateLabel, cold.left, cold.cached, cold.expires, cold.fraction], ["Cold", "-", "-", "-", 0]);
});

test("PRD-001.R20: the /context card's cache line names the state, the cached tokens and the time left", () => {
	const cache = reported(0, 0, 61_200);
	assert.deepEqual(cacheCardLine(cacheView(cache, T0 + 48_000)), {
		state: "warm",
		text: "Prompt cache warm",
		cached: "61.2k tokens",
		left: "4:12",
	});
	assert.equal(cacheCardLine(cacheView(cache, T0 + 4 * MIN + 30_000)).state, "expiring");
	assert.deepEqual(cacheCardLine(cacheView(coldCache(cache), T0)), { state: "cold", text: "Prompt cache cold", cached: "", left: "" });
	assert.equal(cacheCardLine(null), null);
});

test("PRD-005.R11: both Compact buttons and the send share one predicate: a turn or a restore blocks them", () => {
	assert.equal(compactAllowed("idle", false), true);
	for (const activity of ["working", "writing", "waiting"]) assert.equal(compactAllowed(activity, false), false, activity);
	assert.equal(compactAllowed("idle", true), false, "a restore");
});

test("PRD-001.R38: a held send (an Undo or a clear) disables Compact, so it is refused visibly rather than dropped", () => {
	assert.equal(compactAllowed("idle", false, false), true);
	assert.equal(compactAllowed("idle", false, true), false);
});
