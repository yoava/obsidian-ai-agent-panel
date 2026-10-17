import { test } from "node:test";
import assert from "node:assert/strict";
import { RENDER_COST_FACTOR, RENDER_MIN_GAP_MS, RenderThrottle } from "./.build/state/stream-render.mjs";

/**
 * Plays `deltas` arriving every `every` ms through the throttle on a virtual
 * clock, each render costing `cost` ms; returns the start time of every render.
 */
function play(deltas, every, cost) {
	const throttle = new RenderThrottle();
	const starts = [];
	let timer = null; // when the scheduled render is due
	const run = () => {
		const start = timer;
		throttle.begin();
		starts.push(start);
		const end = start + cost;
		const again = throttle.finished(start, end);
		timer = again === null ? null : end + again;
	};
	for (let i = 0; i < deltas; i++) {
		const now = i * every;
		// Renders due before this delta run first.
		while (timer !== null && timer <= now) run();
		const wait = throttle.request(now);
		if (wait !== null) timer = now + wait;
	}
	while (timer !== null) run();
	return starts;
}

test("PRD-001.R29: a 2,000-delta stream renders a bounded number of times, not once per delta", () => {
	const starts = play(2000, 5, 10);
	const ms = 2000 * 5;
	assert.ok(starts.length <= Math.ceil(ms / RENDER_MIN_GAP_MS) + 2, `${starts.length} renders for ${ms} ms`);
	assert.ok(starts.length >= 2, "and it does render along the way");
	for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= RENDER_MIN_GAP_MS, "never closer than the gap");
});

test("PRD-001.R15: the first delta renders at once and the last delta always gets a trailing render", () => {
	const starts = play(2000, 5, 10);
	assert.equal(starts[0], 0, "no wait after a quiet spell");
	assert.ok(starts.at(-1) >= 1999 * 5, "the final render starts after the final delta");
	assert.ok(starts.at(-1) - 1999 * 5 <= RENDER_MIN_GAP_MS, "within one gap of it");
	assert.deepEqual(play(1, 5, 10), [0], "a single delta renders once");
});

test("PRD-001.R29: a slow render stretches the gap so rendering takes at most a quarter of the time", () => {
	const cost = 200;
	const starts = play(2000, 5, cost);
	for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= cost * RENDER_COST_FACTOR, "gap of four renders");
	assert.ok((starts.length * cost) / (2000 * 5) <= 1 / RENDER_COST_FACTOR + 0.1);
});

test("PRD-001.R29: deltas arriving during a render ask for no second render, and one follows it", () => {
	const throttle = new RenderThrottle();
	assert.equal(throttle.request(0), 0);
	assert.equal(throttle.request(1), null, "already scheduled");
	throttle.begin();
	assert.equal(throttle.request(5), null, "a render runs");
	assert.equal(throttle.finished(0, 10), RENDER_MIN_GAP_MS - 10, "the delta that came during the render gets one at the gap");
	throttle.begin();
	assert.equal(throttle.finished(RENDER_MIN_GAP_MS, RENDER_MIN_GAP_MS + 10), null, "idle when nothing came since");
	assert.equal(throttle.request(10_000), 0, "after a quiet spell, now");
});

test("PRD-001.R15: reset forgets a pending render, so the next block starts clean", () => {
	const throttle = new RenderThrottle();
	throttle.request(0);
	throttle.reset();
	assert.equal(throttle.request(1), 0);
});

test("PRD-001.R29: no render is scheduled or run while the block is hidden; one comes at once when it shows", () => {
	const throttle = new RenderThrottle();
	assert.equal(throttle.request(0), 0);
	throttle.begin();
	assert.equal(throttle.finished(0, 10), null);
	assert.equal(throttle.setHidden(true, 20), null);
	assert.equal(throttle.request(30), null, "a delta while hidden asks for nothing");
	assert.equal(throttle.request(40), null);
	assert.equal(throttle.setHidden(false, 5000), 0, "shown: one render for all of them");
	assert.equal(throttle.setHidden(false, 5001), null, "already scheduled");
	throttle.begin();
	assert.equal(throttle.finished(5000, 5010), null);
	assert.equal(throttle.setHidden(true, 6000), null);
	assert.equal(throttle.setHidden(false, 6001), null, "nothing arrived while hidden, nothing to render");
});

test("PRD-001.R29: a render that comes due, or ends, while the block is hidden is held until it shows", () => {
	const throttle = new RenderThrottle();
	throttle.request(0);
	throttle.setHidden(true, 1);
	assert.equal(throttle.due(), false, "the timer fired while hidden");
	assert.equal(throttle.setHidden(false, 2), 0, "dirty and unscheduled: renders when shown");
	const during = new RenderThrottle();
	during.request(0);
	during.begin();
	during.request(5);
	during.setHidden(true, 6);
	assert.equal(during.finished(0, 10), null, "no follow-up render while hidden");
	assert.equal(during.setHidden(false, 100), RENDER_MIN_GAP_MS - 100, "the gap since the last render still applies");
});
