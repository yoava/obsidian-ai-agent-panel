import { test } from "node:test";
import assert from "node:assert/strict";
import { BEFORE_CLEAR, FOLD_OVER, foldLabel, latestClearId, mayAdopt, planSegments, undoBlock, undoOffer, undoState } from "./.build/state/segments.mjs";
import { isClearEcho } from "./.build/state/clear-divider.mjs";
import { modelFromStored, sectionsOf } from "./.build/state/tab.mjs";

const AT = 1_700_000_000_000;

/** A prompt, its reply and the turn's end. */
const exchange = (n) => [
	{ kind: "user", text: `Question ${n}`, sentAt: AT },
	{ kind: "assistant", text: `Answer ${n}` },
	{ kind: "meta", turn: n },
];
const clear = (echo = true) => [...(echo ? [{ kind: "user", text: "/clear" }] : []), { kind: "clear", at: AT }];
const exchanges = (from, count) => Array.from({ length: count }, (_, i) => exchange(from + i)).flat();
const itemsOf = (messages) => modelFromStored(messages).items;
const textOf = (item) => (item.kind === "prompt" ? item.text : item.kind);
const idsOf = (items, predicate) => items.filter(predicate).map((item) => item.id);

test("PRD-001.R38: a conversation without a clear has nothing dimmed or folded", () => {
	const plan = planSegments(itemsOf(exchanges(1, 6)));
	assert.equal(plan.dimmed.size, 0);
	assert.deepEqual(plan.folds, []);
});

test("PRD-001.R38: the screen-reader text names the dimmed messages", () => {
	assert.equal(BEFORE_CLEAR, "Before the clear. Claude no longer sees these messages.");
});

test("PRD-001.R38: the messages above a clear are dimmed, the /clear message and the divider are not", () => {
	const items = itemsOf([...exchanges(1, 2), ...clear(), ...exchange(3)]);
	const plan = planSegments(items);
	assert.deepEqual(
		items.map((item) => [textOf(item), plan.dimmed.has(item.id)]),
		[
			["Question 1", true],
			["turn", true],
			["Question 2", true],
			["turn", true],
			["/clear", false],
			["clear", false],
			["Question 3", false],
			["turn", false],
		]
	);
});

test("PRD-001.R38: a clear stored without its /clear message opens its own section, so everything above it is dimmed", () => {
	const items = itemsOf([...exchange(1), ...clear(false), ...exchange(2)]);
	assert.deepEqual(
		sectionsOf(items).map((section) => section.map((item) => item.kind)),
		[["prompt", "turn"], ["clear"], ["prompt", "turn"]]
	);
	const plan = planSegments(items);
	assert.deepEqual([...plan.dimmed], idsOf(items, (item) => item.id <= 2));
});

test("PRD-001.R38: the /clear message and its divider share a section", () => {
	const items = itemsOf([...exchange(1), ...clear()]);
	assert.deepEqual(
		sectionsOf(items).map((section) => section.map((item) => item.kind)),
		[["prompt", "turn"], ["prompt", "clear"]]
	);
	assert.equal(isClearEcho(items[2]), true);
	assert.equal(isClearEcho(items[0]), false);
	assert.equal(isClearEcho(undefined), false);
});

test("PRD-001.R38: a segment of four messages stays whole; more fold everything before the last prompt", () => {
	assert.equal(FOLD_OVER, 4);
	// Two exchanges are four messages (two prompts, two replies).
	assert.deepEqual(planSegments(itemsOf([...exchanges(1, 2), ...clear()])).folds, []);
	const items = itemsOf([...exchanges(1, 3), ...clear()]);
	const plan = planSegments(items);
	assert.equal(plan.folds.length, 1);
	const [fold] = plan.folds;
	// Six messages, the last prompt and reply kept: four folded.
	assert.equal(fold.count, 4);
	assert.equal(fold.key, items[0].id);
	assert.deepEqual([...fold.ids], items.slice(0, 4).map((item) => item.id));
	assert.equal(plan.foldOf.get(items[3].id), fold);
	assert.equal(plan.foldOf.has(items[4].id), false);
	assert.equal(plan.foldOf.has(items[6].id), false, "the /clear message is never folded");
});

test("PRD-001.R38: the fold counts prompts, replies, panel commands and ! runs, and a continuation is no reply of its own", () => {
	const items = itemsOf([
		{ kind: "user", text: "One", sentAt: AT },
		{ kind: "assistant", text: "a" },
		{ kind: "user", text: "queued", sentAt: AT },
		{ kind: "assistant", text: "b" },
		{ kind: "meta", turn: 1 },
		{ kind: "user", text: "/cost" },
		{ kind: "assistant", text: "card" },
		{ kind: "bash", command: "ls" },
		{ kind: "user", text: "Last", sentAt: AT },
		{ kind: "assistant", text: "z" },
		{ kind: "meta", turn: 2 },
		...clear(),
	]);
	const [fold] = planSegments(items).folds;
	assert.ok(fold);
	// Everything before "Last": prompts One and queued, the /cost and ! prompts, and one reply.
	assert.equal(fold.count, 5);
});

test("PRD-001.R38: only earlier segments fold, each on its own count, and an earlier divider is not dimmed", () => {
	const items = itemsOf([...exchanges(1, 3), ...clear(), ...exchanges(4, 3), ...clear(), ...exchanges(7, 3)]);
	const plan = planSegments(items);
	assert.equal(plan.folds.length, 2);
	assert.deepEqual(plan.folds.map((fold) => fold.count), [4, 4]);
	for (const id of idsOf(items, (item) => item.kind === "clear")) assert.equal(plan.dimmed.has(id), false);
	// The current segment (after the last clear) is whole.
	const tail = items.slice(items.map((item) => item.kind).lastIndexOf("clear") + 1);
	for (const item of tail) assert.equal(plan.dimmed.has(item.id) || plan.foldOf.has(item.id), false);
});

test("PRD-001.R38: a segment of panel commands keeps the last one and folds the rest", () => {
	const items = itemsOf([
		...["/cost", "/help", "/usage", "/status", "/mcp"].flatMap((text) => [
			{ kind: "user", text },
			{ kind: "assistant", text: "card" },
		]),
		...clear(),
	]);
	assert.equal(planSegments(items).folds[0]?.count, 4);
});

test("PRD-001.R38: one prompt, its reply and four commands keep the last command and its output and fold the rest", () => {
	const items = itemsOf([
		...exchange(1),
		...["/cost", "/help", "/usage", "/status"].flatMap((text) => [{ kind: "user", text }, { kind: "assistant", text: `card ${text}` }]),
		...clear(),
	]);
	const plan = planSegments(items);
	assert.equal(plan.folds.length, 1);
	// Before /status: the prompt, its reply, and three commands with their output (one is a reply card each).
	const status = items.findIndex((item) => item.kind === "prompt" && item.text === "/status");
	assert.deepEqual([...plan.folds[0].ids], items.slice(0, status).map((item) => item.id));
	for (const item of items.slice(status)) assert.equal(plan.foldOf.has(item.id), false);
});

test("PRD-001.R38: a ! run mid-turn splits the reply; the kept reply, its continuation and its footer all stay visible", () => {
	const items = itemsOf([
		...exchanges(1, 2),
		{ kind: "user", text: "Review", sentAt: AT },
		{ kind: "assistant", text: "first part" },
		{ kind: "bash", command: "ls" },
		{ kind: "assistant", text: "second part" },
		{ kind: "meta", turn: 3 },
		...clear(),
	]);
	const plan = planSegments(items);
	assert.equal(plan.folds.length, 1, "one fold, no trailing one");
	const run = items.findIndex((item) => item.kind === "prompt" && item.text === "!ls");
	assert.ok(run > 0);
	assert.deepEqual([...plan.folds[0].ids], items.slice(0, run).map((item) => item.id));
	for (const item of items.slice(run)) assert.equal(plan.foldOf.has(item.id), false, `${textOf(item)} stays`);
	assert.equal(items.at(-1).kind, "clear");
	assert.equal(items.some((item) => item.kind === "turn" && item.continuation && plan.foldOf.has(item.id)), false);
});

test("PRD-001.R38: a replan makes new fold objects with the same keys, and a later clear leaves an earlier fold's key", () => {
	const stored = [...exchanges(1, 3), ...clear()];
	const first = planSegments(itemsOf(stored)).folds[0];
	const again = planSegments(itemsOf(stored)).folds[0];
	assert.notEqual(first, again);
	assert.equal(first.key, again.key);
	const later = planSegments(itemsOf([...stored, ...exchange(4), ...clear()])).folds[0];
	assert.equal(later.key, first.key);
});

test("PRD-001.R38: the fold button reads N earlier messages", () => {
	assert.equal(foldLabel(6), "6 earlier messages");
	assert.equal(foldLabel(1), "1 earlier message");
});

test("PRD-003.R9: a reopened conversation is dimmed and folded the same as a live one", () => {
	const plan = planSegments(itemsOf([...exchanges(1, 3), ...clear(), ...exchange(4)]));
	assert.equal(plan.folds.length, 1);
	assert.equal(plan.dimmed.size, 6);
});

// --- Undo eligibility (PRD-001.R38) ------------------------------------------------

const ENDED = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
const OTHER = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const endedClear = (sessionId = ENDED) => [{ kind: "user", text: "/clear" }, { kind: "clear", at: AT, sessionId }];
const never = () => false;

test("PRD-001.R38: Undo is offered on the latest clear while no message to Claude Code follows it", () => {
	const messages = [...exchanges(1, 2), ...endedClear()];
	const offer = undoOffer(messages, never);
	assert.equal(offer.sessionId, ENDED);
	assert.equal(offer.foreign, false);
	assert.equal(offer.record, messages.at(-1));
	assert.equal(offer.index, messages.length - 1);
});

test("PRD-001.R38: a panel command or a ! run after the clear does not take the offer away", () => {
	const messages = [...exchanges(1, 1), ...endedClear(), { kind: "user", text: "/context" }, { kind: "user", text: "!ls" }];
	assert.equal(undoOffer(messages, never)?.sessionId, ENDED);
});

test("PRD-001.R38: a prompt, a /compact or a turn's end after the clear takes the offer away", () => {
	const base = [...exchanges(1, 1), ...endedClear()];
	assert.equal(undoOffer([...base, { kind: "user", text: "hi", sentAt: AT }], never), null);
	assert.equal(undoOffer([...base, { kind: "user", text: "/compact", sentAt: AT }], never), null);
	assert.equal(undoOffer([...base, { kind: "meta", turn: 2 }], never), null);
});

test("PRD-001.R38: only the latest clear offers Undo, not an earlier one", () => {
	const earlier = [...exchanges(1, 1), ...endedClear(), ...exchange(2)];
	assert.equal(undoOffer(earlier, never), null);
	assert.equal(undoOffer([...earlier, ...endedClear(OTHER)], never)?.sessionId, OTHER);
});

test("PRD-001.R38: a fresh start after the clear is another session: no offer", () => {
	assert.equal(undoOffer([...exchanges(1, 1), ...endedClear(), { kind: "fresh-start", at: AT }], never), null);
});

test("ADR-018: a clear with no session id, or one that fails the grammar, offers no Undo", () => {
	assert.equal(undoOffer([...exchanges(1, 1), { kind: "clear", at: AT }], never), null);
	assert.equal(undoOffer([...exchanges(1, 1), { kind: "clear", at: AT, sessionId: "../../x" }], never), null);
	assert.equal(undoOffer([...exchanges(1, 1), { kind: "clear", at: AT, sessionId: 7 }], never), null);
});

test("PRD-001.R38: a session this device did not record shows Undo disabled", () => {
	const asked = [];
	const offer = undoOffer([...exchanges(1, 1), ...endedClear()], (id) => (asked.push(id), true));
	assert.equal(offer.foreign, true);
	assert.deepEqual(asked, [ENDED]);
	assert.equal(undoState(offer, false), "foreign");
});

test("PRD-001.R38: the button is ready, pending while an Undo runs, and absent without an offer", () => {
	const offer = undoOffer([...exchanges(1, 1), ...endedClear()], never);
	assert.equal(undoState(offer, false), "ready");
	assert.equal(undoState(offer, true), "pending");
	assert.equal(undoState(null, false), null);
	assert.equal(undoState(null, true), null);
});

const FREE = { working: false, restoring: false, starting: false, picking: false, clearOpen: false };

test("PRD-001.R38: nothing blocks an Undo in a free tab; each fact does, a clear still open first", () => {
	assert.equal(undoBlock(FREE), null);
	for (const key of ["working", "restoring", "starting", "picking", "clearOpen"]) {
		assert.notEqual(undoBlock({ ...FREE, [key]: true }), null, key);
	}
	assert.equal(undoBlock({ ...FREE, clearOpen: true, working: true }), "clearing");
	assert.equal(undoBlock({ ...FREE, picking: true }), "picking");
});

test("PRD-001.R38: the button shows the reason an Undo cannot start, and none while the clear is still open", () => {
	const offer = undoOffer([...exchanges(1, 1), ...endedClear()], never);
	assert.equal(undoState(offer, false, "working"), "working");
	assert.equal(undoState(offer, false, "restoring"), "restoring");
	assert.equal(undoState(offer, false, "starting"), "starting");
	assert.equal(undoState(offer, false, "picking"), "picking");
	assert.equal(undoState(offer, false, "clearing"), null);
	assert.equal(undoState(offer, true, "picking"), "pending");
	const foreign = undoOffer([...exchanges(1, 1), ...endedClear()], () => true);
	assert.equal(undoState(foreign, false, "working"), "foreign");
});

test("ADR-018: a CLI is adopted only when nothing blocks the tab and the conversation, offer and launch are those the Undo started with", () => {
	const ok = { block: null, sameConversation: true, sameOffer: true, launchGeneration: 3, startedGeneration: 3 };
	assert.equal(mayAdopt(ok), true);
	assert.equal(mayAdopt({ ...ok, block: "picking" }), false, "a pick pending, Bypass from Ask");
	assert.equal(mayAdopt({ ...ok, block: "working" }), false);
	assert.equal(mayAdopt({ ...ok, block: "clearing" }), false);
	assert.equal(mayAdopt({ ...ok, sameConversation: false }), false);
	assert.equal(mayAdopt({ ...ok, sameOffer: false }), false);
	assert.equal(mayAdopt({ ...ok, launchGeneration: 4 }), false, "the CLI path or WSL setting changed");
});

test("PRD-001.R38: the latest clear's divider is the one that can offer Undo", () => {
	const items = itemsOf([...exchanges(1, 1), ...endedClear(), ...exchange(2), ...endedClear(OTHER)]);
	const clears = items.filter((item) => item.kind === "clear");
	assert.equal(clears.length, 2);
	assert.equal(latestClearId(items), clears[1].id);
	assert.equal(latestClearId(itemsOf(exchanges(1, 1))), null);
});
