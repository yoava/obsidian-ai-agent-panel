import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DATE_GROUP_OLDER,
	DATE_GROUP_TODAY,
	DATE_GROUP_WEEK,
	DATE_GROUP_YESTERDAY,
	groupConversations,
	matchesConversationFilter,
} from "./.build/conversation-list.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors the module's own local-day arithmetic. Built independently rather
// than imported, so a bug in the module's boundary math wouldn't cancel out
// against the same bug here - and built from local Date components (not a
// hard-coded UTC epoch) so the suite means the same thing under any TZ.
const startOfDay = (ts) => {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
};

const NOW = new Date(2024, 5, 15, 12, 30, 0).getTime();
const TODAY_START = startOfDay(NOW);
const YESTERDAY_START = TODAY_START - DAY_MS;
const WEEK_START = TODAY_START - 7 * DAY_MS;

let nextId = 0;
const entry = (overrides = {}) => ({
	id: `id-${nextId++}`,
	title: "Untitled",
	updatedAt: NOW,
	openIndex: null,
	pinned: false,
	pinnedAt: null,
	...overrides,
});

test("matchesConversationFilter is a case-insensitive substring test", () => {
	assert.equal(matchesConversationFilter("Refactor the Parser", "parser"), true);
	assert.equal(matchesConversationFilter("Refactor the Parser", "PARSER"), true);
	assert.equal(matchesConversationFilter("Refactor the Parser", "the parser"), true);
	assert.equal(matchesConversationFilter("Refactor the Parser", "lexer"), false);
});

test("matchesConversationFilter treats a blank filter as no filter", () => {
	assert.equal(matchesConversationFilter("anything", ""), true);
	assert.equal(matchesConversationFilter("anything", "   "), true);
});

test("an entry that is both pinned and open appears only in pinned", () => {
	const e = entry({ pinned: true, pinnedAt: 100, openIndex: 0 });
	const result = groupConversations([e], NOW);
	assert.deepEqual(result.pinned, [e]);
	assert.deepEqual(result.open, []);
	assert.equal(result.total, 1);
});

test("pinned rows sort oldest pin first, with pinnedAt: null last", () => {
	const newest = entry({ id: "newest", pinned: true, pinnedAt: 300 });
	const oldest = entry({ id: "oldest", pinned: true, pinnedAt: 100 });
	const middle = entry({ id: "middle", pinned: true, pinnedAt: 200 });
	const unpinnedAt = entry({ id: "no-pinned-at", pinned: true, pinnedAt: null });
	const result = groupConversations([newest, oldest, middle, unpinnedAt], NOW);
	assert.deepEqual(
		result.pinned.map((e) => e.id),
		["oldest", "middle", "newest", "no-pinned-at"]
	);
});

test("open rows follow openIndex, not updatedAt", () => {
	const first = entry({ id: "first", openIndex: 0, updatedAt: NOW - 1000 });
	const second = entry({ id: "second", openIndex: 1, updatedAt: NOW });
	const third = entry({ id: "third", openIndex: 2, updatedAt: NOW - 5000 });
	// updatedAt order would be second, first, third - openIndex must win.
	const result = groupConversations([second, third, first], NOW);
	assert.deepEqual(
		result.open.map((e) => e.id),
		["first", "second", "third"]
	);
});

test("recent rows sort by updatedAt descending", () => {
	const a = entry({ id: "a", updatedAt: NOW - 1000 });
	const b = entry({ id: "b", updatedAt: NOW });
	const c = entry({ id: "c", updatedAt: NOW - 500 });
	const result = groupConversations([a, b, c], NOW);
	const ids = result.recent.flatMap((g) => g.entries.map((e) => e.id));
	assert.deepEqual(ids, ["b", "c", "a"]);
});

test("the four date buckets land correctly, and empty buckets are omitted", () => {
	const today = entry({ id: "today", updatedAt: NOW });
	const older = entry({ id: "older", updatedAt: WEEK_START - DAY_MS });
	// No entry falls in Yesterday or Previous 7 days, so those headers must
	// not appear at all.
	const result = groupConversations([today, older], NOW);
	assert.deepEqual(
		result.recent.map((g) => g.label),
		[DATE_GROUP_TODAY, DATE_GROUP_OLDER]
	);
	assert.deepEqual(result.recent[0].entries.map((e) => e.id), ["today"]);
	assert.deepEqual(result.recent[1].entries.map((e) => e.id), ["older"]);
});

test("all four buckets appear, in fixed order, when each has an entry", () => {
	const today = entry({ id: "today", updatedAt: NOW });
	const yesterday = entry({ id: "yesterday", updatedAt: YESTERDAY_START });
	const week = entry({ id: "week", updatedAt: WEEK_START });
	const older = entry({ id: "older", updatedAt: WEEK_START - 1 });
	const result = groupConversations([yesterday, older, today, week], NOW);
	assert.deepEqual(
		result.recent.map((g) => g.label),
		[DATE_GROUP_TODAY, DATE_GROUP_YESTERDAY, DATE_GROUP_WEEK, DATE_GROUP_OLDER]
	);
});

test("a timestamp slightly in the future still lands in Today", () => {
	const future = entry({ id: "future", updatedAt: NOW + 5000 });
	const result = groupConversations([future], NOW);
	assert.equal(result.recent.length, 1);
	assert.equal(result.recent[0].label, DATE_GROUP_TODAY);
});

test("exact boundary behaviour matches the spec's four cutoffs", () => {
	const atTodayStart = entry({ id: "at-today-start", updatedAt: TODAY_START });
	const atYesterdayStart = entry({ id: "at-yesterday-start", updatedAt: YESTERDAY_START });
	const atWeekStart = entry({ id: "at-week-start", updatedAt: WEEK_START });
	const justBeforeWeekStart = entry({ id: "just-before-week-start", updatedAt: WEEK_START - 1 });

	const result = groupConversations(
		[atTodayStart, atYesterdayStart, atWeekStart, justBeforeWeekStart],
		NOW
	);
	const labelFor = (id) =>
		result.recent.find((g) => g.entries.some((e) => e.id === id))?.label;

	assert.equal(labelFor("at-today-start"), DATE_GROUP_TODAY);
	assert.equal(labelFor("at-yesterday-start"), DATE_GROUP_YESTERDAY);
	assert.equal(labelFor("at-week-start"), DATE_GROUP_WEEK);
	assert.equal(labelFor("just-before-week-start"), DATE_GROUP_OLDER);
});

test("the filter is case-insensitive, matches substrings, and applies to every section", () => {
	const pinnedHit = entry({ id: "pinned-hit", title: "Refactor Widgets", pinned: true, pinnedAt: 1 });
	const pinnedMiss = entry({ id: "pinned-miss", title: "Something Else", pinned: true, pinnedAt: 2 });
	const openHit = entry({ id: "open-hit", title: "WIDGET cleanup", openIndex: 0 });
	const openMiss = entry({ id: "open-miss", title: "Unrelated tab", openIndex: 1 });
	const recentHit = entry({ id: "recent-hit", title: "widget notes", updatedAt: NOW });
	const recentMiss = entry({ id: "recent-miss", title: "Nothing here", updatedAt: NOW });

	const result = groupConversations(
		[pinnedHit, pinnedMiss, openHit, openMiss, recentHit, recentMiss],
		NOW,
		"WiDgEt"
	);

	assert.deepEqual(result.pinned.map((e) => e.id), ["pinned-hit"]);
	assert.deepEqual(result.open.map((e) => e.id), ["open-hit"]);
	assert.deepEqual(
		result.recent.flatMap((g) => g.entries.map((e) => e.id)),
		["recent-hit"]
	);
	assert.equal(result.total, 3);
});

test("a whitespace-only filter matches everything", () => {
	const a = entry({ id: "a", title: "Alpha" });
	const b = entry({ id: "b", title: "Beta" });
	const result = groupConversations([a, b], NOW, "   ");
	assert.equal(result.total, 2);
});

test("entries with id: null are handled and sort deterministically", () => {
	// Two unsaved tabs sharing a timestamp: id: null must sort last, not throw.
	const unsavedA = entry({ id: null, updatedAt: NOW });
	const unsavedB = entry({ id: null, updatedAt: NOW });
	const saved = entry({ id: "saved", updatedAt: NOW });
	const first = groupConversations([unsavedA, saved, unsavedB], NOW);
	const second = groupConversations([unsavedA, saved, unsavedB], NOW);
	const ids = (r) => r.recent.flatMap((g) => g.entries.map((e) => e.id));
	assert.deepEqual(ids(first), ["saved", null, null]);
	// Same input, same output - nothing here depends on iteration order noise.
	assert.deepEqual(ids(first), ids(second));
});

test("a pinned entry with id: null still sorts to a fixed spot", () => {
	const pinnedNullId = entry({ id: null, pinned: true, pinnedAt: 50 });
	const pinnedNamed = entry({ id: "z", pinned: true, pinnedAt: 50 });
	const result = groupConversations([pinnedNamed, pinnedNullId], NOW);
	assert.deepEqual(result.pinned.map((e) => e.id), ["z", null]);
});

test("total counts every rendered row across all three sections", () => {
	const pinned = entry({ id: "p", pinned: true, pinnedAt: 1 });
	const open = entry({ id: "o", openIndex: 0 });
	const recentToday = entry({ id: "r1", updatedAt: NOW });
	const recentOlder = entry({ id: "r2", updatedAt: WEEK_START - 1 });
	const result = groupConversations([pinned, open, recentToday, recentOlder], NOW);
	assert.equal(result.total, 4);
	assert.equal(
		result.total,
		result.pinned.length +
			result.open.length +
			result.recent.reduce((sum, g) => sum + g.entries.length, 0)
	);
});

test("the input array and its entries are not mutated", () => {
	const a = entry({ id: "b-entry", updatedAt: NOW - 1000 });
	const b = entry({ id: "a-entry", updatedAt: NOW });
	const input = [a, b];
	const snapshotA = { ...a };
	const snapshotB = { ...b };

	groupConversations(input, NOW, "");

	// Original array order untouched, even though the sorted output reorders.
	assert.deepEqual(input, [a, b]);
	assert.deepEqual(a, snapshotA);
	assert.deepEqual(b, snapshotB);
});
