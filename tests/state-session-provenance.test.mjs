import test from "node:test";
import assert from "node:assert/strict";

const { SessionProvenance, parseProvenance, storedSessionIds, MISSING_GRACE_MS } = await import(
	"./.build/state/session-provenance.mjs"
);

const A = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
const B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const C = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const DAY = 24 * 60 * 60 * 1000;

/** A device-local key and a clock. */
function device(initial, options = {}) {
	const state = { value: initial, writes: [], logs: [], now: 1_000_000, failWrites: options.failWrites ?? false };
	const io = {
		read: () => state.value,
		write: async (value) => {
			if (state.failWrites) throw new Error("disk full");
			state.writes.push(JSON.parse(JSON.stringify(value)));
			state.value = JSON.parse(JSON.stringify(value));
		},
		log: (message, detail) => state.logs.push([message, detail]),
		now: () => state.now,
	};
	return { state, io, provenance: new SessionProvenance(io) };
}

/** The io of an existing device state, for a second instance that reads what the first wrote. */
const state_io = (state) => ({
	read: () => state.value,
	write: async (value) => {
		state.value = JSON.parse(JSON.stringify(value));
	},
	log: () => {},
	now: () => state.now,
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
const scan = (overrides = {}) => ({ listed: true, names: new Set(), markerPresent: false, sources: [], ...overrides });
/** A device key already written, so the migration is over and records are saved at once. */
const MIGRATED = { version: 1, conversations: {} };
const seedDefault =(stored) => stored ?? "default";

test("PRD-003.R4: an unset key reads as empty and a malformed one as empty and logged", () => {
	assert.equal(parseProvenance(null).state, "unset");
	assert.equal(parseProvenance(undefined).state, "unset");
	for (const raw of ["x", 7, [], [{ version: 1 }], { version: 2 }, { version: "1" }, {}, true]) {
		const parsed = parseProvenance(raw);
		assert.equal(parsed.state, "malformed", JSON.stringify(raw));
		assert.equal(parsed.entries.size, 0);
	}
	const { state, provenance } = device({ version: 2, conversations: { c1: { sessions: { p: [A] } } } });
	assert.equal(provenance.check("c1", "p", A), false);
	assert.equal(state.logs.length, 1);
});

test("PRD-003.R4: every malformed shape is dropped and the valid rest is kept, by own keys only", () => {
	const parsed = parseProvenance({
		version: 1,
		conversations: {
			good: { sessions: { p1: [A, "not-a-uuid", 7, B], "-flag": [A], "a b": [A], p2: "x", p3: {} }, started: [C, "x"], missingSince: 5 },
			"bad/id": { sessions: { p1: [A] } },
			"bad id": { sessions: { p1: [A] } },
			"": { sessions: { p1: [A] } },
			notObject: 7,
			listed: [],
			nulled: null,
			noSessions: { started: [A] },
			badMissing: { sessions: {}, missingSince: -1 },
			fractional: { sessions: {}, missingSince: 1.5 },
			text: { sessions: {}, missingSince: "5" },
			infinite: { sessions: {}, missingSince: 1e999 },
		},
	});
	assert.equal(parsed.state, "valid");
	assert.deepEqual([...parsed.entries.keys()].sort(), ["badMissing", "fractional", "good", "infinite", "noSessions", "text"]);
	const good = parsed.entries.get("good");
	assert.deepEqual([...good.sessions.keys()].sort(), ["p1", "p2", "p3"]);
	assert.deepEqual([...good.sessions.get("p1")], [A, B]);
	assert.deepEqual([...good.sessions.get("p2")], []);
	assert.deepEqual([...good.started], [C]);
	assert.equal(good.missingSince, 5);
	for (const id of ["badMissing", "fractional", "infinite", "text"]) assert.equal(parsed.entries.get(id).missingSince, undefined, id);
	assert.deepEqual([...parsed.entries.get("noSessions").started], [A]);
});

test("PRD-003.R4: a conversation or profile named __proto__ or constructor is only a key", () => {
	const raw = JSON.parse(
		`{"version":1,"conversations":{"__proto__":{"sessions":{"__proto__":["${A}"],"constructor":["${B}"]},"started":[]}}}`
	);
	const { provenance } = device(raw);
	assert.equal(provenance.check("__proto__", "__proto__", A), true);
	assert.equal(provenance.check("__proto__", "constructor", B), true);
	assert.equal(provenance.check("constructor", "constructor", B), false);
	assert.equal(provenance.check("toString", "p", A), false);
	assert.equal(Object.getPrototypeOf({}).sessions, undefined);
	const stored = JSON.parse(JSON.stringify(provenance.serialize()));
	assert.deepEqual(Object.keys(stored.conversations), ["__proto__"]);
});

test("PRD-003.R4: an inherited version or conversations is no value", () => {
	const inherited = Object.create({ version: 1, conversations: { c1: { sessions: { p: [A] } } } });
	assert.equal(parseProvenance(inherited).state, "malformed");
	const noOwn = Object.create({ conversations: { c1: { sessions: { p: [A] } } } });
	noOwn.version = 1;
	assert.equal(parseProvenance(noOwn).entries.size, 0);
});

test("PRD-003.R4: a recorded id is used for its conversation and profile only", async () => {
	const { state, provenance } = device(MIGRATED);
	provenance.record("c1", "p1", A);
	assert.equal(provenance.check("c1", "p1", A), true);
	assert.equal(provenance.check("c1", "p2", A), false, "another profile");
	assert.equal(provenance.check("c2", "p1", A), false, "another conversation");
	assert.equal(provenance.check("c1", "p1", B), false, "another id");
	assert.equal(provenance.check("c1", "p1", "--resume"), false, "grammar");
	assert.equal(provenance.check("c1", "p1", null), false);
	await settle();
	assert.deepEqual(state.writes.at(-1), { version: 1, migrated: true, conversations: { c1: { sessions: { p1: [A] }, started: [] } } });
});

test("PRD-003.R4: started lists the sessions the panel began; recording twice writes once", async () => {
	const { state, provenance } = device(MIGRATED);
	provenance.record("c1", "p1", A, true);
	provenance.record("c1", "p1", A, true);
	provenance.record("c1", "p1", A);
	provenance.record("c1", "p1", B);
	await settle();
	assert.deepEqual(state.writes.at(-1).conversations.c1, { sessions: { p1: [A, B] }, started: [A] });
	const writes = state.writes.length;
	provenance.record("c1", "p1", B);
	await settle();
	assert.equal(state.writes.length, writes, "nothing changed, nothing written");
});

test("PRD-005.R7: began tells whether a session is in its conversation's started list", () => {
	const { provenance } = device(MIGRATED);
	provenance.record("c1", "p1", A, true);
	provenance.record("c1", "p1", B);
	assert.equal(provenance.began("c1", A), true);
	assert.equal(provenance.began("c1", B), false, "resumed or grandfathered, not begun here");
	assert.equal(provenance.began("c2", A), false, "another conversation's list");
	assert.equal(provenance.began("c1", "not an id"), false);
	assert.equal(provenance.began("c1", C), false);
});

test("PRD-003.R4: record refuses an id, conversation or profile that fails its grammar", async () => {
	const { state, provenance } = device(MIGRATED);
	provenance.record("c1", "p1", "--resume");
	provenance.record("c/1", "p1", A);
	provenance.record("c1", "-p", A);
	provenance.record("c1", "p 1", A);
	await settle();
	assert.equal(state.writes.length, 0);
	assert.equal(provenance.check("c1", "p1", A), false);
});

test("PRD-003.R4: a branch's source and fork join the branch conversation's entry for the branch's profile", () => {
	const { provenance } = device(MIGRATED);
	provenance.record("branch", "p2", A);
	provenance.record("branch", "p2", B, true);
	assert.equal(provenance.check("branch", "p2", A), true);
	assert.equal(provenance.check("branch", "p2", B), true);
	assert.equal(provenance.check("branch", "p1", A), false);
	assert.deepEqual(provenance.serialize().conversations.branch.started, [B]);
});

test("PRD-003.R8: forgetting a conversation removes its entry and saves", async () => {
	const { state, provenance } = device({
		version: 1,
		conversations: { c1: { sessions: { p: [A] }, started: [] }, c2: { sessions: { p: [B] }, started: [] } },
	});
	provenance.forget("c1");
	provenance.forget("missing");
	await settle();
	assert.equal(provenance.check("c1", "p", A), false);
	assert.equal(provenance.check("c2", "p", B), true);
	assert.deepEqual(Object.keys(state.writes.at(-1).conversations), ["c2"]);
	assert.equal(state.writes.length, 1);
});

test("PRD-003.R4: a failed write is logged and the ids stay usable in memory", async () => {
	const { state, provenance } = device(MIGRATED, { failWrites: true });
	provenance.record("c1", "p1", A);
	await settle();
	assert.equal(provenance.check("c1", "p1", A), true);
	assert.equal(state.logs.length, 1);
	assert.equal(state.writes.length, 0);
});

test("PRD-003.R4: saves run one at a time and the last write holds the latest record", async () => {
	const order = [];
	let release = () => {};
	const io = {
		read: () => ({ version: 1, conversations: {} }),
		write: async (value) => {
			order.push(JSON.stringify(value));
			await new Promise((resolve) => (release = resolve));
		},
		log: () => {},
		now: () => 0,
	};
	const provenance = new SessionProvenance(io);
	provenance.record("c1", "p", A);
	provenance.record("c1", "p", B);
	provenance.record("c1", "p", C);
	await settle();
	assert.equal(order.length, 1, "one write in flight");
	release();
	await settle();
	release();
	await settle();
	assert.equal(order.length, 2);
	assert.deepEqual(JSON.parse(order[1]).conversations.c1.sessions.p, [A, B, C]);
});

test("PRD-003.R4: grandfathering seeds each listed conversation's own and turn ids for its stored profile, once", async () => {
	const { state, provenance } = device(null);
	const sources = [
		{ id: "c1", profileId: "p1", sessionIds: [A, B, "not-a-uuid", null, 7] },
		{ id: "c2", sessionIds: [C] },
		{ id: "c3", profileId: "gone", sessionIds: [A] },
	];
	const seedProfile = (stored) => (stored === undefined ? "default" : stored === "p1" ? "p1" : null);
	const result = await provenance.afterScan(scan({ sources, names: new Set(["c1", "c2", "c3"]) }), seedProfile);
	assert.deepEqual(result, { writeMarker: true });
	assert.equal(provenance.check("c1", "p1", A), true);
	assert.equal(provenance.check("c1", "p1", B), true);
	assert.equal(provenance.check("c2", "default", C), true, "no stored profile: the default profile");
	assert.equal(provenance.check("c2", "p1", C), false);
	assert.equal(provenance.check("c3", "gone", A), false, "a profile this device lacks is not seeded");
	assert.equal(provenance.check("c3", "default", A), false, "and not remapped");
	assert.deepEqual(state.writes.at(-1).conversations.c1, { sessions: { p1: [A, B] }, started: [] });
	assert.equal(state.writes.at(-1).conversations.c3, undefined);
	// Once: a second complete scan seeds nothing more.
	const again = await provenance.afterScan(
		scan({ sources: [{ id: "c4", sessionIds: [A] }], names: new Set(["c1", "c2", "c3", "c4"]) }),
		seedDefault
	);
	// A marker still absent is asked for again; nothing more is seeded.
	assert.deepEqual(again, { writeMarker: true });
	assert.equal(provenance.check("c4", "default", A), false);
});

test("PRD-003.R4: the default profile is the one a conversation storing none is seeded for", async () => {
	const { provenance } = device(null);
	await provenance.afterScan(scan({ sources: [{ id: "c1", sessionIds: [A] }], names: new Set(["c1"]) }), () => "the-default");
	assert.equal(provenance.check("c1", "the-default", A), true);
	assert.equal(provenance.check("c1", "default", A), false);
});

test("PRD-003.R4: grandfathering writes the key and asks for the marker even when no conversation is listed", async () => {
	const { state, provenance } = device(null);
	assert.deepEqual(await provenance.afterScan(scan(), seedDefault), { writeMarker: true });
	assert.deepEqual(state.writes.at(-1), { version: 1, migrated: true, conversations: {} });
});

test("PRD-003.R4: with the marker present nothing is seeded, no marker is asked for, and the key is set so a removed marker opens nothing", async () => {
	const { state, provenance } = device(null);
	const result = await provenance.afterScan(
		scan({ markerPresent: true, sources: [{ id: "c1", sessionIds: [A] }], names: new Set(["c1"]) }),
		seedDefault
	);
	assert.deepEqual(result, { writeMarker: false });
	assert.equal(provenance.check("c1", "default", A), false);
	assert.deepEqual(state.writes.at(-1), { version: 1, migrated: true, conversations: {} });
	// The marker is removed and crafted files appear: a later scan, and a reload, seed nothing (the marker is recreated).
	const crafted = scan({ markerPresent: false, sources: [{ id: "c2", sessionIds: [B] }], names: new Set(["c2"]) });
	assert.deepEqual(await provenance.afterScan(crafted, seedDefault), { writeMarker: true });
	assert.equal(provenance.check("c2", "default", B), false);
	const reloaded = new SessionProvenance({ ...state_io(state) });
	assert.deepEqual(await reloaded.afterScan(crafted, seedDefault), { writeMarker: true });
	assert.equal(reloaded.check("c2", "default", B), false);
});

test("PRD-003.R4: with the device key set nothing is seeded, as after a second run", async () => {
	const { state, provenance } = device({ version: 1, conversations: {} });
	const result = await provenance.afterScan(scan({ sources: [{ id: "c1", sessionIds: [A] }], names: new Set(["c1"]) }), seedDefault);
	// Nothing is seeded or written; the marker, absent, is recreated.
	assert.deepEqual(result, { writeMarker: true });
	assert.equal(provenance.check("c1", "default", A), false);
	assert.equal(state.writes.length, 0);
});

test("PRD-003.R4: a malformed device key grandfathers nothing", async () => {
	const { provenance } = device({ version: 9 });
	const result = await provenance.afterScan(scan({ sources: [{ id: "c1", sessionIds: [A] }], names: new Set(["c1"]) }), seedDefault);
	assert.deepEqual(result, { writeMarker: true });
	assert.equal(provenance.check("c1", "default", A), false);
	assert.equal(provenance.migrating, false);
});

test("PRD-003.R4: a failed listing writes nothing and the next scan still grandfathers", async () => {
	const { state, provenance } = device(null);
	const failed = await provenance.afterScan(
		{ listed: false, names: new Set(), markerPresent: false, sources: [{ id: "c1", sessionIds: [A] }] },
		seedDefault
	);
	assert.deepEqual(failed, { writeMarker: false });
	assert.equal(state.writes.length, 0);
	assert.equal(provenance.check("c1", "default", A), false);
	const retry = await provenance.afterScan(scan({ sources: [{ id: "c1", sessionIds: [A] }], names: new Set(["c1"]) }), seedDefault);
	assert.deepEqual(retry, { writeMarker: true });
	assert.equal(provenance.check("c1", "default", A), true);
});

test("PRD-003.R4: ids recorded before the first scan survive it, and the migration still runs", async () => {
	const { provenance } = device(null);
	provenance.record("new", "default", B);
	await settle();
	const result = await provenance.afterScan(
		scan({ sources: [{ id: "old", sessionIds: [A] }], names: new Set(["old", "new"]) }),
		seedDefault
	);
	assert.deepEqual(result, { writeMarker: true });
	assert.equal(provenance.check("old", "default", A), true);
	assert.equal(provenance.check("new", "default", B), true);
});

test("PRD-003.R4: the marker is asked for although the key could not be written, and a later scan writes the key", async () => {
	const { state, provenance } = device(null, { failWrites: true });
	const full = scan({ sources: [{ id: "c1", sessionIds: [A] }], names: new Set(["c1"]) });
	assert.deepEqual(await provenance.afterScan(full, seedDefault), { writeMarker: true });
	assert.equal(provenance.check("c1", "default", A), true, "usable in memory");
	assert.equal(provenance.migrating, false, "completion never reverts");
	state.failWrites = false;
	// The marker now exists; the failed key write is retried by the next successful scan.
	assert.deepEqual(await provenance.afterScan({ ...full, markerPresent: true }, seedDefault), { writeMarker: false });
	assert.deepEqual(state.writes.at(-1).conversations.c1, { sessions: { default: [A] }, started: [] });
	assert.equal(state.writes.at(-1).migrated, true);
});

test("PRD-003.R4: a key that says done with the marker absent asks for the marker on every successful scan", async () => {
	const { provenance } = device({ version: 1, migrated: true, conversations: {} });
	assert.deepEqual(await provenance.afterScan(scan(), seedDefault), { writeMarker: true });
	assert.deepEqual(await provenance.afterScan(scan({ markerPresent: true }), seedDefault), { writeMarker: false });
	assert.deepEqual(await provenance.afterScan({ ...scan(), listed: false }, seedDefault), { writeMarker: false });
});

test("PRD-003.R4: only an own literal false migrated permits the migration; unset permits it, a missing field and a malformed key do not", () => {
	const permits = (raw) => new SessionProvenance({ read: () => raw, write() {}, log() {}, now: () => 0 }).migrating;
	assert.equal(permits(null), true);
	assert.equal(permits({ version: 1, migrated: false, conversations: {} }), true);
	for (const raw of [
		{ version: 1, conversations: {} },
		{ version: 1, migrated: true, conversations: {} },
		{ version: 1, migrated: 0, conversations: {} },
		{ version: 1, migrated: "false", conversations: {} },
		{ version: 2, migrated: false },
		"x",
	])
		assert.equal(permits(raw), false, JSON.stringify(raw));
	assert.equal(permits(Object.create({ migrated: false, version: 1 })), false, "an inherited field is no value");
});

test("PRD-003.R4: decide is trusted from the record with no scan, pending while the migration is open, else foreign", () => {
	const open = device(null).provenance;
	open.record("c1", "p", A);
	assert.equal(open.decide("c1", "p", A), "trusted");
	assert.equal(open.decide("c1", "p", B), "pending");
	assert.equal(open.decide("c1", "other", A), "pending");
	assert.equal(open.decide("c1", "p", "--x"), "foreign", "grammar first");
	const done = device(MIGRATED).provenance;
	done.record("c1", "p", A);
	assert.equal(done.decide("c1", "p", A), "trusted");
	assert.equal(done.decide("c1", "p", B), "foreign");
});

test("PRD-003.R8: pruning marks an entry whose conversation has no file and clears the mark when it returns", async () => {
	const { state, provenance } = device({
		version: 1,
		conversations: {
			here: { sessions: { p: [A] }, started: [] },
			gone: { sessions: { p: [B] }, started: [] },
			back: { sessions: { p: [C] }, started: [], missingSince: 5 },
		},
	});
	await provenance.afterScan(scan({ markerPresent: true, names: new Set(["here", "back"]) }), seedDefault);
	const stored = state.writes.at(-1).conversations;
	assert.equal("missingSince" in stored.here, false);
	assert.equal(stored.gone.missingSince, state.now);
	assert.equal("missingSince" in stored.back, false);
	// It returns before 30 days: the mark is cleared.
	state.now += 29 * DAY;
	await provenance.afterScan(scan({ markerPresent: true, names: new Set(["here", "back", "gone"]) }), seedDefault);
	assert.equal("missingSince" in state.writes.at(-1).conversations.gone, false);
});

test("PRD-003.R8: an entry missing for 30 days goes at the next successful scan, not before", async () => {
	const { state, provenance } = device({ version: 1, conversations: { gone: { sessions: { p: [A] }, started: [] } } });
	const t0 = state.now;
	await provenance.afterScan(scan({ markerPresent: true }), seedDefault);
	state.now = t0 + MISSING_GRACE_MS - 1;
	await provenance.afterScan(scan({ markerPresent: true }), seedDefault);
	assert.equal(provenance.check("gone", "p", A), true, "29 days and 23 hours");
	state.now = t0 + MISSING_GRACE_MS;
	await provenance.afterScan(scan({ markerPresent: true }), seedDefault);
	assert.equal(provenance.check("gone", "p", A), false);
	assert.deepEqual(state.writes.at(-1), { version: 1, migrated: true, conversations: {} });
});

test("PRD-003.R8: a failed listing prunes and marks nothing", async () => {
	const { state, provenance } = device({
		version: 1,
		conversations: { gone: { sessions: { p: [A] }, started: [], missingSince: 1 }, fresh: { sessions: { p: [B] }, started: [] } },
	});
	state.now = 1 + 100 * DAY;
	const result = await provenance.afterScan({ listed: false, names: new Set(), markerPresent: true, sources: [] }, seedDefault);
	assert.deepEqual(result, { writeMarker: false });
	assert.equal(provenance.check("gone", "p", A), true);
	assert.equal(state.writes.length, 0);
	assert.equal(provenance.serialize().conversations.fresh.missingSince, undefined);
});

test("PRD-003.R8: a conversation listed by file name counts as present whether or not its file could be read", async () => {
	const { state, provenance } = device({
		version: 1,
		conversations: { unreadable: { sessions: { p: [A] }, started: [], missingSince: 1 } },
	});
	state.now = 1 + 100 * DAY;
	await provenance.afterScan(scan({ markerPresent: true, names: new Set(["unreadable"]), sources: [] }), seedDefault);
	assert.equal(provenance.check("unreadable", "p", A), true);
	assert.equal("missingSince" in state.writes.at(-1).conversations.unreadable, false);
});

test("PRD-003.R4: storedSessionIds lists a conversation's own id and its turn records', boundary records' and pending branch's ids as stored", () => {
	assert.deepEqual(
		storedSessionIds({
			sessionId: A,
			messages: [
				{ kind: "user", sessionId: "ignored" },
				{ kind: "meta", sessionId: B },
				{ kind: "meta" },
				{ kind: "meta", sessionId: "--bad" },
				{ kind: "meta", branchSession: C },
				{ kind: "fresh-start", sessionId: C },
				{ kind: "clear", sessionId: "--lost" },
			],
		}),
		[A, B, undefined, undefined, undefined, "--bad", undefined, undefined, C, C, "--lost"]
	);
});

test("PRD-003.R4: observations before the migration are saved at once, keep it open, and survive a reload and the scan", async () => {
	const { state, provenance } = device(null);
	assert.equal(provenance.migrating, true);
	provenance.record("c1", "default", A, true);
	provenance.record("c2", "default", B);
	provenance.forget("c2");
	await settle();
	assert.deepEqual(state.writes.at(-1), {
		version: 1,
		migrated: false,
		conversations: { c1: { sessions: { default: [A] }, started: [A] } },
	});
	await provenance.afterScan({ listed: false, names: new Set(), markerPresent: false, sources: [] }, seedDefault);
	assert.equal(provenance.migrating, true, "a failed listing completes nothing");
	// After a reload the observation is still there and the migration still runs on top of it.
	const reloaded = new SessionProvenance(state_io(state));
	assert.equal(reloaded.migrating, true);
	assert.equal(reloaded.check("c1", "default", A), true);
	const result = await reloaded.afterScan(scan({ names: new Set(["old", "c1"]), sources: [{ id: "old", sessionIds: [C] }] }), seedDefault);
	assert.deepEqual(result, { writeMarker: true });
	assert.equal(reloaded.check("old", "default", C), true);
	assert.equal(reloaded.check("c1", "default", A), true);
	assert.equal(reloaded.migrating, false);
	assert.equal(state.value.migrated, true);
});
