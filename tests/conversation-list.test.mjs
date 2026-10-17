import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DATE_GROUP_OLDER,
	DATE_GROUP_TODAY,
	DATE_GROUP_WEEK,
	DATE_GROUP_YESTERDAY,
	branchTitle,
	columnEntries,
	columnKey,
	displayTitle,
	emptyRecentText,
	groupConversations,
	hasTitle,
	matchesConversationFilter,
	promptTitle,
	renamedTitle,
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

test("PRD-001.R7: a prompt titles the conversation with its first line", () => {
	assert.equal(promptTitle("Fix the parser"), "Fix the parser");
	assert.equal(promptTitle("Fix the parser\nthen the lexer"), "Fix the parser");
	assert.equal(promptTitle("Fix the parser\r\nthen the lexer"), "Fix the parser");
	assert.equal(promptTitle("/compact keep the plan"), "/compact keep the plan");
});

test("PRD-001.R7: a title over 80 characters is cut and ended by an ellipsis", () => {
	assert.equal(promptTitle("a".repeat(80)), "a".repeat(80));
	assert.equal(promptTitle("a".repeat(81)), `${"a".repeat(79)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(100)}\nb`), `${"a".repeat(79)}\u2026`);
});

test("PRD-001.R7: an empty or blank first line titles the conversation \"Untitled\"", () => {
	assert.equal(promptTitle(""), "Untitled");
	assert.equal(promptTitle("\nFix the parser"), "Untitled");
	assert.equal(promptTitle("\r\nFix the parser"), "Untitled");
	assert.equal(promptTitle("  \t \nFix the parser"), "Untitled");
	assert.equal(promptTitle(`${" ".repeat(80)}x`), "Untitled");
});

test("PRD-001.R7: a first line with text keeps its leading blanks", () => {
	assert.equal(promptTitle("  indented"), "  indented");
});

test("PRD-001.R7: a conversation with no title is shown as \"New conversation\"", () => {
	assert.equal(displayTitle(""), "New conversation");
	assert.equal(displayTitle("   "), "New conversation");
	assert.equal(displayTitle("\t\n"), "New conversation");
	assert.equal(displayTitle(undefined), "New conversation");
	assert.equal(displayTitle(null), "New conversation");
});

test("PRD-001.R7: a title is shown as stored", () => {
	assert.equal(displayTitle("Fix the parser"), "Fix the parser");
	assert.equal(displayTitle("Untitled"), "Untitled");
	assert.equal(displayTitle(" padded "), " padded ");
});

test("PRD-001.R7: a prompt title always has something to show", () => {
	for (const text of ["", " ", "\n", "\r", "x", "a".repeat(200)])
		assert.notEqual(promptTitle(text).trim(), "");
});

test("PRD-001.R7: a lone carriage return ends the first line", () => {
	assert.equal(promptTitle("Fix the parser\rthen the lexer"), "Fix the parser");
	assert.equal(promptTitle("\rFix the parser"), "Untitled");
	assert.equal(promptTitle("a\r\rb"), "a");
});

test("PRD-001.R7: a title is cut at 80 code points, never inside a surrogate pair", () => {
	const emoji = "\u{1F600}";
	assert.equal(promptTitle(emoji.repeat(80)), emoji.repeat(80));
	assert.equal(promptTitle(emoji.repeat(81)), `${emoji.repeat(79)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(79)}${emoji}b`), `${"a".repeat(79)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(80)}${emoji}`), `${"a".repeat(79)}\u2026`);
});

test("PRD-001.R7: a stored title that is not a non-blank string is shown as \"New conversation\"", () => {
	// A hand-edited or synced file can hold any JSON value.
	for (const value of [5, 0, {}, ["a"], [], true, false, NaN])
		assert.equal(displayTitle(value), "New conversation");
});

test("PRD-001.R7: hasTitle is true only for a string with something other than whitespace", () => {
	for (const value of ["x", " x ", "Untitled", "/status"]) assert.equal(hasTitle(value), true);
	for (const value of ["", "  ", "\t\n", undefined, null, 5, {}, ["a"], true])
		assert.equal(hasTitle(value), false);
});

test("PRD-001.R7: a branch is titled <title> (branch)", () => {
	assert.equal(branchTitle("Research notes"), "Research notes (branch)");
});

test("PRD-001.R7: a branch of a branch does not repeat the suffix", () => {
	assert.equal(branchTitle("Research notes (branch)"), "Research notes (branch)");
	assert.equal(branchTitle("Research notes (branch 2)"), "Research notes (branch)");
});

test("PRD-001.R7: a branch of a conversation with no title is Conversation (branch)", () => {
	for (const title of [undefined, "", "  ", null, 5, {}])
		assert.equal(branchTitle(title), "Conversation (branch)");
});

test("PRD-001.R9: the column lists the open tabs, then every stored conversation that is not open", () => {
	const open = [
		{ id: "a", title: "Open A", updatedAt: 10, pinned: false, pinnedAt: null },
		{ id: null, title: "", updatedAt: null, pinned: false, pinnedAt: null },
	];
	const stored = [
		{ id: "a", title: "Stale copy", updatedAt: 5 },
		{ id: "b", title: 7, updatedAt: 3, pinned: true, pinnedAt: 2 },
	];
	assert.deepEqual(columnEntries(open, stored, NOW), [
		{ id: "a", title: "Open A", updatedAt: 10, openIndex: 0, pinned: false, pinnedAt: null },
		{ id: null, title: "New conversation", updatedAt: NOW, openIndex: 1, pinned: false, pinnedAt: null },
		{ id: "b", title: "New conversation", updatedAt: 3, openIndex: null, pinned: true, pinnedAt: 2 },
	]);
});

const KEY_VIEW = { filter: "", collapsed: [], scanned: true, now: NOW, openKeys: [1, 2] };
const keyOf = (entries, view = {}) => columnKey(groupConversations(entries, NOW, view.filter), { ...KEY_VIEW, ...view });

test("PRD-001.R29: the column key is unchanged for unchanged inputs and an open row's save", () => {
	const rows = [entry({ id: "o", openIndex: 0, updatedAt: NOW - 50 }), entry({ id: "r", updatedAt: NOW - 5000 })];
	assert.equal(keyOf(rows), keyOf(rows.map((row) => ({ ...row }))));
	assert.equal(
		keyOf(rows),
		keyOf([{ ...rows[0], updatedAt: NOW }, rows[1]]),
		"an open row's save time is not drawn"
	);
	// NOW is on a minute's first second.
	assert.equal(keyOf(rows), keyOf(rows, { now: NOW + 59_000 }), "within the same minute");
});

test("PRD-001.R29: the column key changes with what the column draws", () => {
	const open = entry({ id: "o", title: "Open", openIndex: 0 });
	const other = entry({ id: "p", title: "Other", openIndex: 1 });
	const recent = entry({ id: "r", title: "Recent", updatedAt: NOW - 5000 });
	const base = keyOf([open, other, recent]);
	const changed = {
		"a moved row": keyOf([{ ...open, openIndex: 1 }, { ...other, openIndex: 0 }, recent]),
		"a renamed row": keyOf([{ ...open, title: "Renamed" }, other, recent]),
		"a pin": keyOf([{ ...open, pinned: true, pinnedAt: 1 }, other, recent]),
		"a history row's time": keyOf([open, other, { ...recent, updatedAt: NOW - 4000 }]),
		"a closed row": keyOf([open, recent]),
		"the filter": keyOf([open, other, recent], { filter: "o" }),
		"a collapsed section": keyOf([open, other, recent], { collapsed: ["recent"] }),
		"the scan": keyOf([open, other, recent], { scanned: false }),
		"the minute": keyOf([open, other, recent], { now: NOW + 60_000 }),
		"two unsaved tabs swapped": keyOf([open, other, recent], { openKeys: [2, 1] }),
	};
	for (const [what, key] of Object.entries(changed)) assert.notEqual(key, base, what);
});

test("PRD-001.R9: an empty Recent says why: loading, no matches, no other matches, or none", () => {
	const open = groupConversations([entry({ title: "Open one", openIndex: 0 })], NOW, "open");
	const none = groupConversations([], NOW, "zzz");
	assert.equal(emptyRecentText(groupConversations([], NOW), "", false), "Loading…");
	assert.equal(emptyRecentText(none, "zzz", false), "No matches", "a filter, even while scanning");
	assert.equal(emptyRecentText(open, "open", true), "No other matches");
	assert.equal(emptyRecentText(groupConversations([], NOW), "  ", true), "No previous conversations");
});

const cps = (text) => Array.from(text).length;

test("PRD-001.R7: a title under the limit is its title", () => {
	assert.equal(promptTitle("Fix the parser\nthen the lexer"), "Fix the parser");
	assert.equal(promptTitle("a".repeat(80)), "a".repeat(80));
	assert.equal(promptTitle(""), "Untitled");
	assert.equal(promptTitle("  indented"), "  indented");
});

test("PRD-001.R7: a cut title ends with an ellipsis within 80 code points", () => {
	const label = promptTitle("a".repeat(81));
	assert.equal(label, `${"a".repeat(79)}\u2026`);
	assert.equal(cps(label), 80);
	assert.equal(promptTitle(`${"a".repeat(100)}\nb`), `${"a".repeat(79)}\u2026`);
});

test("PRD-001.R7: a cut title breaks at a word within the last 12 code points", () => {
	assert.equal(promptTitle(`${"a".repeat(70)} ${"b".repeat(30)}`), `${"a".repeat(70)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(67)} ${"b".repeat(30)}`), `${"a".repeat(67)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(78)} ${"b".repeat(30)}`), `${"a".repeat(78)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(79)} ${"b".repeat(30)}`), `${"a".repeat(79)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(70)}   ${"b".repeat(30)}`), `${"a".repeat(70)}\u2026`);
});

test("PRD-001.R7: a cut title with no word break nearby is cut at the limit", () => {
	assert.equal(promptTitle(`${"a".repeat(60)} ${"b".repeat(40)}`), `${"a".repeat(60)} ${"b".repeat(18)}\u2026`);
	assert.equal(promptTitle(`${"a".repeat(66)} ${"b".repeat(40)}`), `${"a".repeat(66)} ${"b".repeat(12)}\u2026`);
});

test("PRD-001.R7: a cut title never splits a surrogate pair", () => {
	const emoji = "\u{1F600}";
	const label = promptTitle(emoji.repeat(81));
	assert.equal(label, `${emoji.repeat(79)}\u2026`);
	assert.equal(cps(label), 80);
	assert.equal(promptTitle(emoji.repeat(80)), emoji.repeat(80));
});

test("PRD-001.R7: a cut title that is blank before the cut is \"Untitled\"", () => {
	assert.equal(promptTitle(`${" ".repeat(80)}x`), "Untitled");
});

test("PRD-001.R7: a rename keeps the first line, trimmed, and nothing for a blank one", () => {
	assert.equal(renamedTitle("Old", "  New name  "), "New name");
	assert.equal(renamedTitle("Old", "First\nsecond"), "First");
	assert.equal(renamedTitle("Old", "First\r\nsecond"), "First");
	assert.equal(renamedTitle("Old", "First\rsecond"), "First");
	assert.equal(renamedTitle("Old", ""), null);
	assert.equal(renamedTitle("Old", "   "), null);
	assert.equal(renamedTitle("Old", "\nsecond"), null);
});

test("PRD-001.R7: a rename is cut at 80 code points with no ellipsis and never splits a pair", () => {
	assert.equal(renamedTitle("Old", "a".repeat(100)), "a".repeat(80));
	assert.equal(renamedTitle("Old", "a".repeat(80)), "a".repeat(80));
	const emoji = "\u{1F600}";
	assert.equal(renamedTitle("Old", emoji.repeat(90)), emoji.repeat(80));
	assert.equal(renamedTitle("Old", `${"a".repeat(79)} b`), "a".repeat(79));
});

test("PRD-001.R7: a rename to the title shown changes nothing, so an untitled conversation stays untitled", () => {
	assert.equal(renamedTitle("Old", "Old"), null);
	assert.equal(renamedTitle("Old", " Old "), null);
	assert.equal(renamedTitle("", "New conversation"), null);
	assert.equal(renamedTitle(undefined, "New conversation"), null);
	assert.equal(renamedTitle(42, "New conversation"), null);
	assert.equal(renamedTitle("", "Mine"), "Mine");
});

test("PRD-001.R7: a branch of a renamed conversation is titled <new title> (branch)", () => {
	assert.equal(branchTitle(renamedTitle("Old", "Plan B")), "Plan B (branch)");
});
