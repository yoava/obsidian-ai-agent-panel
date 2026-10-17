import test from "node:test";
import assert from "node:assert/strict";

const { UsageService, parseUsage } = await import("./.build/usage-core.mjs");

const REPLY = {
	rate_limits: { five_hour: { utilization: 12.5, resets_at: "2026-10-11T12:00:00Z" } },
};

/** A clock the test advances and a timer it fires by hand. */
function fakeClock(start = 1_000_000) {
	let now = start;
	const timers = new Set();
	const clock = {
		now: () => now,
		advance(ms) {
			now += ms;
		},
		/** How many timers were ever started, running or not. */
		created: 0,
		every(callback, ms) {
			clock.created++;
			const timer = { callback, ms };
			timers.add(timer);
			return () => timers.delete(timer);
		},
		timers,
		tick() {
			for (const timer of [...timers]) timer.callback();
		},
	};
	return clock;
}

/** A service over a fake clock; `state.fail` and `state.client` steer the CLI. */
function setup({ refreshSeconds = 300 } = {}) {
	const clock = fakeClock();
	const config = { refreshSeconds };
	const state = { fail: false, requests: 0, clientLookups: 0, reply: REPLY };
	const client = {
		async getPlanUsage() {
			state.requests++;
			if (state.fail) throw new Error("boom");
			return state.reply;
		},
	};
	state.client = client;
	const service = new UsageService(
		() => config,
		() => {
			state.clientLookups++;
			return state.client;
		},
		clock
	);
	let settled = 0;
	service.subscribe(() => settled++);
	return { service, clock, config, state, redraws: () => settled };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const SECOND = 1000;

test("PRD-005.R2: requests made while one is in flight share its result", async () => {
	const { service, state } = setup();
	const first = service.refresh();
	const second = service.refresh(true);
	assert.equal(first, second);
	await first;
	assert.equal(state.requests, 1);
});

test("PRD-005.R2: a snapshot is reused until the refresh interval has passed", async () => {
	const { service, clock, state } = setup();
	await service.refresh();
	clock.advance(299 * SECOND);
	await service.refresh();
	assert.equal(state.requests, 1);
	clock.advance(SECOND);
	await service.refresh();
	assert.equal(state.requests, 2);
});

test("PRD-005.R2: even a forced refresh starts at most one request every 10 s", async () => {
	const { service, clock, state } = setup();
	await service.refresh(true);
	clock.advance(9_999);
	await service.refresh(true);
	assert.equal(state.requests, 1);
	clock.advance(1);
	await service.refresh(true);
	assert.equal(state.requests, 2);
});

test("PRD-005.R2: a failed request keeps the previous figures and reports the error", async () => {
	const { service, clock, state, redraws } = setup();
	const first = await service.refresh();
	assert.equal(first.fiveHour.utilization, 12.5);
	clock.advance(301 * SECOND);
	state.fail = true;
	const second = await service.refresh();
	assert.equal(second, first);
	assert.equal(service.snapshot, first);
	assert.equal(service.lastError, "boom");
	assert.equal(redraws(), 2);
	clock.advance(10 * SECOND);
	state.fail = false;
	await service.refresh(true);
	assert.equal(service.lastError, null);
});

test("PRD-005.R1: a request without a client, a reply or plan limits names the reason", async () => {
	const { service, clock, state } = setup();
	state.client = null;
	await service.refresh(true);
	assert.equal(
		service.lastError,
		"Plan usage comes from a running session - send a message first."
	);
	state.client = { getPlanUsage: async () => null };
	clock.advance(10 * SECOND);
	await service.refresh(true);
	assert.equal(service.lastError, "This CLI version does not report plan usage.");
	state.client = { getPlanUsage: async () => ({ rate_limits_available: false }) };
	clock.advance(10 * SECOND);
	await service.refresh(true);
	assert.equal(
		service.lastError,
		"No plan limits on this login - API-key and Bedrock/Vertex sessions have none."
	);
});

test("PRD-005.R3: after a failure no background request is made for one refresh interval", async () => {
	const { service, clock, state } = setup();
	state.fail = true;
	await service.refresh();
	assert.equal(state.requests, 1);
	for (let elapsed = 30; elapsed < 300; elapsed += 30) {
		clock.advance(30 * SECOND);
		await service.refresh();
		assert.equal(state.requests, 1, `${elapsed} s after the failure`);
	}
	clock.advance(30 * SECOND);
	await service.refresh();
	assert.equal(state.requests, 2);
});

test("PRD-005.R3: the back-off measures from a failure that kept older figures", async () => {
	const { service, clock, state } = setup();
	await service.refresh();
	clock.advance(300 * SECOND);
	state.fail = true;
	await service.refresh();
	assert.equal(state.requests, 2);
	// The kept snapshot is older than the interval, yet nothing is asked.
	clock.advance(299 * SECOND);
	await service.refresh();
	assert.equal(state.requests, 2);
	clock.advance(SECOND);
	await service.refresh();
	assert.equal(state.requests, 3);
});

test("PRD-005.R3: a forced refresh after a failure skips the back-off but not the 10 s floor", async () => {
	const { service, clock, state } = setup();
	state.fail = true;
	await service.refresh();
	clock.advance(9_999);
	await service.refresh(true);
	assert.equal(state.requests, 1);
	clock.advance(1);
	state.fail = false;
	await service.refresh(true);
	assert.equal(state.requests, 2);
	assert.equal(service.lastError, null);
});

test("PRD-005.R3: one timer serves every open view", () => {
	const { service, clock } = setup();
	const [a, b] = [{}, {}];
	service.setSegmentVisible(a, true);
	service.setSegmentVisible(b, true);
	service.setSegmentVisible(a, true);
	assert.equal(clock.timers.size, 1);
	// Repeated reports at the same period leave the one interval running.
	assert.equal(clock.created, 1);
	service.setSegmentVisible(a, false);
	assert.equal(clock.timers.size, 1);
	assert.equal(clock.created, 1);
	service.setSegmentVisible(b, false);
	assert.equal(clock.timers.size, 0);
});

test("PRD-005.R3: no timer runs and no request is made while no plan-usage segment is visible", async () => {
	const { service, clock, state } = setup();
	assert.equal(clock.timers.size, 0);
	service.setSegmentVisible({}, false);
	assert.equal(clock.timers.size, 0);
	await settle();
	assert.equal(state.requests, 0);
	assert.equal(state.clientLookups, 0);
});

test("PRD-005.R3: the timer period is the refresh interval, from 10 s to 30 s", () => {
	const periodFor = (refreshSeconds) => {
		const { service, clock } = setup({ refreshSeconds });
		service.setSegmentVisible({}, true);
		return [...clock.timers].map((timer) => timer.ms);
	};
	assert.deepEqual(periodFor(300), [30_000]);
	assert.deepEqual(periodFor(20), [20_000]);
	assert.deepEqual(periodFor(10), [10_000]);
	assert.deepEqual(periodFor(3), [10_000]);
});

test("PRD-005.R3: a changed refresh interval re-times the one timer", () => {
	const { service, clock, config } = setup();
	const view = {};
	service.setSegmentVisible(view, true);
	assert.deepEqual([...clock.timers].map((timer) => timer.ms), [30_000]);
	config.refreshSeconds = 15;
	service.setSegmentVisible(view, true);
	assert.deepEqual([...clock.timers].map((timer) => timer.ms), [15_000]);
	assert.equal(clock.created, 2);
});

test("PRD-005.R3: a plan-usage segment that becomes visible redraws and requests usage at once", async () => {
	const { service, state, redraws } = setup();
	service.setSegmentVisible({}, true);
	assert.equal(redraws(), 1);
	await settle();
	assert.equal(state.requests, 1);
	assert.equal(redraws(), 2, "the settled request redraws too");
	// A second view showing its segment redraws once, and the fresh cache answers.
	service.setSegmentVisible({}, true);
	assert.equal(redraws(), 3);
	await settle();
	assert.equal(state.requests, 1);
	assert.equal(redraws(), 3);
});

test("PRD-005.R3: a segment hidden and shown again inside the back-off makes no request", async () => {
	const { service, clock, state } = setup();
	const view = {};
	state.fail = true;
	service.setSegmentVisible(view, true);
	await settle();
	service.setSegmentVisible(view, false);
	clock.advance(60 * SECOND);
	service.setSegmentVisible(view, true);
	await settle();
	assert.equal(state.requests, 1);
	clock.advance(240 * SECOND);
	clock.tick();
	await settle();
	assert.equal(state.requests, 2);
});

test("PRD-005.R3: the back-off counts from when the failure settles, not from the attempt", async () => {
	const clock = fakeClock();
	let attempts = 0;
	const slowFailure = {
		async getPlanUsage() {
			attempts++;
			clock.advance(5 * SECOND);
			throw new Error("slow");
		},
	};
	const service = new UsageService(() => ({ refreshSeconds: 300 }), () => slowFailure, clock);
	await service.refresh();
	clock.advance(297 * SECOND); // 302 s after the attempt began, 297 s after it failed
	await service.refresh();
	assert.equal(attempts, 1);
	clock.advance(3 * SECOND);
	await service.refresh();
	assert.equal(attempts, 2);
});

test("PRD-005.R5: a request in flight stays flagged through redraws until its listeners hear it settled", async () => {
	const { service, clock, state } = setup();
	let release;
	state.client = {
		getPlanUsage: () => new Promise((resolve) => (release = () => resolve(REPLY))),
	};
	const seen = [];
	service.subscribe(() => seen.push(service.refreshing));
	assert.equal(service.refreshing, false);
	const pending = service.refresh(true);
	assert.equal(service.refreshing, true);
	// A view showing and a timer tick redraw while the request is out.
	service.setSegmentVisible({}, true);
	clock.tick();
	assert.deepEqual(seen, [true, true]);
	release();
	await pending;
	assert.deepEqual(seen, [true, true, false]);
	assert.equal(service.refreshing, false);
});

test("PRD-005.R3: a finished turn forces a refresh only while some segment is visible", async () => {
	const { service, clock, state } = setup();
	service.refreshIfVisible();
	await settle();
	assert.equal(state.requests, 0);
	const view = {};
	service.setSegmentVisible(view, true);
	await settle();
	assert.equal(state.requests, 1);
	clock.advance(10 * SECOND);
	service.refreshIfVisible();
	await settle();
	assert.equal(state.requests, 2, "forced past the fresh snapshot");
	service.setSegmentVisible(view, false);
	clock.advance(10 * SECOND);
	service.refreshIfVisible();
	await settle();
	assert.equal(state.requests, 2);
});

test("PRD-005.R3: dispose stops the timer and drops the subscriptions", async () => {
	const { service, clock, redraws } = setup();
	service.setSegmentVisible({}, true);
	await settle();
	service.dispose();
	assert.equal(clock.timers.size, 0);
	const before = redraws();
	clock.advance(10 * SECOND);
	await service.refresh(true);
	assert.equal(redraws(), before);
});

test("PRD-005.R3: each tick redraws the segments and asks for usage", async () => {
	const { service, clock, state, redraws } = setup();
	service.setSegmentVisible({}, true);
	await settle();
	const before = redraws();
	clock.advance(30 * SECOND);
	clock.tick();
	assert.equal(redraws(), before + 1);
	assert.equal(state.requests, 1, "a fresh snapshot answers the tick");
	clock.advance(270 * SECOND);
	clock.tick();
	await settle();
	assert.equal(state.requests, 2, "the interval has passed");
});

test("PRD-005.R3: an outage draws one background request per refresh interval", async () => {
	const { service, clock, state } = setup();
	state.fail = true;
	service.setSegmentVisible({}, true);
	await settle();
	for (let i = 0; i < 20; i++) {
		clock.advance(30 * SECOND);
		clock.tick();
		await settle();
	}
	// At the show, then once per 300 s of the 600 s that passed.
	assert.equal(state.requests, 3);
});

test("PRD-005.R4: parseUsage keeps the windows the CLI reports and drops mistyped fields", () => {
	const snapshot = parseUsage(
		{
			rate_limits: {
				five_hour: { utilization: 41.9, resets_at: "2026-10-11T12:00:00Z" },
				seven_day: { utilization: "9", resets_at: 7 },
				seven_day_sonnet: "none",
				model_scoped: [
					{ display_name: "Opus", utilization: 30, resets_at: "2026-10-14T00:00:00Z" },
					{ utilization: 5 },
					{ display_name: "Haiku", utilization: "5" },
					null,
				],
				extra_usage: {
					is_enabled: true,
					monthly_limit: 5000,
					used_credits: "x",
					utilization: 10,
					currency: "USD",
				},
			},
		},
		42
	);
	assert.equal(snapshot.fetchedAt, 42);
	assert.deepEqual(snapshot.fiveHour, { utilization: 41.9, resetsAt: "2026-10-11T12:00:00Z" });
	assert.deepEqual(snapshot.sevenDay, { utilization: null, resetsAt: null });
	assert.equal(snapshot.sevenDaySonnet, null);
	assert.deepEqual(snapshot.modelLimits, [
		{ name: "Opus", percent: 30, resetsAt: "2026-10-14T00:00:00Z" },
	]);
	assert.equal(snapshot.extraUsage.isEnabled, true);
	assert.equal(snapshot.extraUsage.monthlyLimit, 5000);
	assert.equal(snapshot.extraUsage.usedCredits, null);
	assert.equal(snapshot.extraUsage.disabledReason, null);
});

test("PRD-005.R4: parseUsage gives a snapshot with no windows when rate_limits is absent", () => {
	const snapshot = parseUsage({ rate_limits: null }, 1);
	assert.equal(snapshot.fiveHour, null);
	assert.deepEqual(snapshot.modelLimits, []);
	assert.equal(snapshot.extraUsage, null);
});
