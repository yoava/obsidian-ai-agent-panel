import { test } from "node:test";
import assert from "node:assert/strict";
import { TICK_MS, Ticker } from "./.build/state/ticker.mjs";

/** A window's timer API, ticked by hand. */
function fakeWindow() {
	const intervals = new Map();
	let next = 1;
	return {
		intervals,
		setTimeout: () => 0,
		clearTimeout: () => undefined,
		setInterval(callback, ms) {
			const id = next++;
			intervals.set(id, { callback, ms });
			return id;
		},
		clearInterval(id) {
			intervals.delete(id);
		},
		fire() {
			for (const { callback } of [...intervals.values()]) callback();
		},
	};
}

const subscriber = (shown) => {
	const ticks = [];
	return { ticks, shown: () => shown.value, tick: (now) => ticks.push(now) };
};

test("PRD-001.R29: the ticker runs once a second only while a subscriber is shown", () => {
	const win = fakeWindow();
	let now = 1000;
	const ticker = new Ticker(() => win, () => now);
	const visible = { value: false };
	const label = subscriber(visible);
	const stop = ticker.subscribe(label);
	assert.equal(win.intervals.size, 0, "no timer for a hidden subscriber");
	visible.value = true;
	ticker.check();
	assert.equal(win.intervals.size, 1);
	assert.equal([...win.intervals.values()][0].ms, TICK_MS);
	assert.equal(TICK_MS, 1000);
	now = 2000;
	win.fire();
	assert.deepEqual(label.ticks, [2000]);
	ticker.check();
	assert.equal(win.intervals.size, 1, "a re-check while running starts no second timer");
	stop();
	assert.equal(win.intervals.size, 0, "stops at no subscriber");
});

test("PRD-001.R29: only shown subscribers tick, and the ticker stops on a tick that finds none shown", () => {
	const win = fakeWindow();
	const ticker = new Ticker(() => win, () => 5);
	const a = { value: true };
	const b = { value: false };
	const shownOne = subscriber(a);
	const hiddenOne = subscriber(b);
	ticker.subscribe(shownOne);
	ticker.subscribe(hiddenOne);
	win.fire();
	assert.deepEqual(shownOne.ticks, [5]);
	assert.deepEqual(hiddenOne.ticks, []);
	a.value = false;
	win.fire();
	assert.equal(win.intervals.size, 0);
	assert.deepEqual(shownOne.ticks, [5]);
});

test("ADR-016: the ticker runs on the window it is given, and moves when that window changes", () => {
	const main = fakeWindow();
	const popout = fakeWindow();
	let win = main;
	const ticker = new Ticker(() => win);
	ticker.subscribe(subscriber({ value: true }));
	assert.equal(main.intervals.size, 1);
	win = popout;
	ticker.check();
	assert.equal(main.intervals.size, 0);
	assert.equal(popout.intervals.size, 1);
	ticker.stop();
	assert.equal(popout.intervals.size, 0);
});

const slow = (shown, period) => {
	const ticks = [];
	return { ticks, shown: () => shown.value, periodMs: () => period.value, tick: (now) => ticks.push(now) };
};

test("PRD-001.R29: a subscriber that wants a slower period sets the timer's interval, and ticks no oftener", () => {
	const win = fakeWindow();
	let now = 0;
	const ticker = new Ticker(() => win, () => now);
	const minute = slow({ value: true }, { value: 60_000 });
	ticker.subscribe(minute);
	assert.equal([...win.intervals.values()][0].ms, 60_000, "alone, it wakes once a minute");
	now = 60_000;
	win.fire();
	assert.deepEqual(minute.ticks, [60_000]);
	const second = subscriber({ value: true });
	ticker.subscribe(second);
	assert.equal(win.intervals.size, 1);
	assert.equal([...win.intervals.values()][0].ms, TICK_MS, "a per-second subscriber brings the interval down");
	now = 61_000;
	win.fire();
	now = 62_000;
	win.fire();
	assert.deepEqual(second.ticks, [61_000, 62_000]);
	assert.deepEqual(minute.ticks, [60_000], "the slow one waits for its minute");
	now = 120_000;
	win.fire();
	assert.deepEqual(minute.ticks, [60_000, 120_000]);
});

test("PRD-001.R29: the interval follows the periods subscribers report as they tick", () => {
	const win = fakeWindow();
	let now = 0;
	const ticker = new Ticker(() => win, () => now);
	const period = { value: 60_000 };
	const label = slow({ value: true }, period);
	ticker.subscribe(label);
	assert.equal([...win.intervals.values()][0].ms, 60_000);
	period.value = TICK_MS;
	now = 60_000;
	win.fire();
	assert.equal(win.intervals.size, 1);
	assert.equal([...win.intervals.values()][0].ms, TICK_MS, "re-armed once the label wants seconds");
	now = 61_000;
	win.fire();
	assert.deepEqual(label.ticks, [60_000, 61_000]);
});

test("PRD-001.R29: a subscriber whose phase changes restarts the timer, so a minute label flips a minute after its restart", () => {
	const win = fakeWindow();
	let now = 0;
	const ticker = new Ticker(() => win, () => now);
	const phase = { value: "a" };
	const label = { ticks: [], shown: () => true, periodMs: () => 60_000, phase: () => phase.value, tick: (at) => label.ticks.push(at) };
	ticker.subscribe(label);
	const first = [...win.intervals.keys()][0];
	now = 20_000;
	ticker.check();
	assert.deepEqual([...win.intervals.keys()], [first], "the same phase keeps the timer");
	phase.value = "b";
	ticker.check();
	assert.equal(win.intervals.size, 1);
	assert.notEqual([...win.intervals.keys()][0], first, "a new phase starts the timer again");
	now = 80_000;
	win.fire();
	assert.deepEqual(label.ticks, [80_000]);
});
