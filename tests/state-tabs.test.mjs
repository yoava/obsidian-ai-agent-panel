import { test } from "node:test";
import assert from "node:assert/strict";
import {
	dotState,
	focusAfterClose,
	formatCost,
	openTabsList,
	reorder,
	stripOverflows,
	startedLabel,
	stepTab,
	stripOrder,
	switcherLabel,
	tabCard,
	tabItem,
	titleBlock,
} from "./.build/state/tabs.mjs";

const tab = (key, overrides = {}) => ({
	key,
	title: `Tab ${key}`,
	pinned: false,
	pinnedAt: null,
	activity: "idle",
	...overrides,
});

const NOW = new Date(2026, 9, 11, 14, 30, 0).getTime();
const clock = (time) => new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

test("PRD-001.R7: pinned tabs come first, oldest pin first, then the rest in drag order", () => {
	const tabs = [
		tab(1),
		tab(2, { pinned: true, pinnedAt: 300 }),
		tab(3),
		tab(4, { pinned: true, pinnedAt: 100 }),
		tab(5),
	];
	assert.deepEqual(
		stripOrder(tabs).map((t) => t.key),
		[4, 2, 1, 3, 5]
	);
	assert.deepEqual(
		tabs.map((t) => t.key),
		[1, 2, 3, 4, 5],
		"the drag order itself is left alone"
	);
});

test("PRD-001.R7: a pin without a time sorts after the timed pins", () => {
	const tabs = [tab(1, { pinned: true, pinnedAt: null }), tab(2, { pinned: true, pinnedAt: 50 }), tab(3)];
	assert.deepEqual(
		stripOrder(tabs).map((t) => t.key),
		[2, 1, 3]
	);
});

test("PRD-001.R7: the strip overflows, and shows All conversations, only when its tabs scroll by more than a pixel", () => {
	assert.equal(stripOverflows(400, 400), false, "every tab whole");
	assert.equal(stripOverflows(401, 400), false, "a pixel is rounding");
	assert.equal(stripOverflows(402, 400), true, "more than a pixel scrolls");
	assert.equal(stripOverflows(0, 0), false, "a hidden strip measures 0");
	assert.equal(stripOverflows(300, 400), false, "a strip wider than its tabs");
});

test("PRD-001.R7: the open-tabs list draws every tab in strip order as a tab item, the active one marked", () => {
	const tabs = [
		tab(1, { title: "One" }),
		tab(2, { title: "Two", activity: "working" }),
		tab(3, { title: "Three", pinned: true, pinnedAt: 5 }),
		tab(4, { title: "Four", activity: "waiting" }),
	];
	const rows = openTabsList(tabs, 1);
	assert.deepEqual(
		rows.map((row) => row.key),
		stripOrder(tabs).map((t) => t.key)
	);
	assert.deepEqual(
		rows.map((row) => [row.item.title, row.item.glyph, row.item.state, row.active]),
		[
			["Three", "pin", "none", false],
			["One", "none", "none", true],
			["Two", "dot", "busy", false],
			["Four", "dot", "waiting", false],
		]
	);
	assert.equal(rows[3].item.glyphTitle, "Waiting for you");
	assert.equal(rows[0].item.label, "Three, pinned");
});

test("PRD-001.R7: a drag reorders the shown tabs among their own slots, others keep theirs", () => {
	const [a, b, c, d, e] = [1, 2, 3, 4, 5].map((key) => tab(key));
	// b and d are hidden (a filter, or pinned): the drag moved e before a.
	assert.deepEqual(
		reorder([a, b, c, d, e], [e, a, c]).map((t) => t.key),
		[5, 2, 1, 4, 3]
	);
	assert.deepEqual(
		reorder([a, b, c], [a, b, c]).map((t) => t.key),
		[1, 2, 3],
		"an unchanged order"
	);
});

test("PRD-001.R7: the dot pulses while a turn works or writes, is steady while a card waits, and is absent when idle", () => {
	assert.equal(dotState("working"), "busy");
	assert.equal(dotState("writing"), "busy");
	assert.equal(dotState("waiting"), "waiting");
	assert.equal(dotState("idle"), "none");
});

test("PRD-001.R7, PRD-001.R28: a tab item shows its pin or dot, and says its state in its accessible label", () => {
	assert.deepEqual(tabItem(tab(1, { title: "Notes", activity: "idle" })), {
		glyph: "none",
		state: "none",
		glyphTitle: "",
		title: "Notes",
		label: "Notes",
	});
	assert.deepEqual(tabItem(tab(1, { title: "Notes", activity: "writing" })), {
		glyph: "dot",
		state: "busy",
		glyphTitle: "",
		title: "Notes",
		label: "Notes, working",
	});
	assert.deepEqual(tabItem(tab(1, { title: "Notes", activity: "waiting" })), {
		glyph: "dot",
		state: "waiting",
		glyphTitle: "Waiting for you",
		title: "Notes",
		label: "Notes, waiting for you",
	});
	assert.deepEqual(tabItem(tab(1, { title: "Notes", pinned: true, pinnedAt: 1, activity: "idle" })), {
		glyph: "pin",
		state: "none",
		glyphTitle: "",
		title: "Notes",
		label: "Notes, pinned",
	});
	assert.deepEqual(
		tabItem(tab(1, { title: "Notes", pinned: true, pinnedAt: 1, activity: "waiting" })),
		{
			glyph: "pin",
			state: "waiting",
			glyphTitle: "Waiting for you",
			title: "Notes",
			label: "Notes, pinned, waiting for you",
		},
		"the pin takes the waiting state's color and title"
	);
});

test("PRD-001.R7: the hover card says Working and the elapsed time, then the prompt count, model, mode and start", () => {
	const card = tabCard(
		{
			title: "Q4 planning",
			activity: "working",
			workingSince: NOW - 134_000,
			prompts: 3,
			model: "Opus 4.1",
			mode: "Ask",
			startedAt: NOW - 600_000,
			costUsd: 0,
		},
		NOW
	);
	assert.deepEqual(card, {
		title: "Q4 planning",
		state: { kind: "busy", text: "Working · 2m 14s" },
		meta: `3 prompts · Opus 4.1 · Ask · started ${clock(NOW - 600_000)}`,
		cost: null,
		costNote: null,
	});
});

test("PRD-005.R7: the hover card carries a branch's cost note beside the cost, and none without a cost", () => {
	const input = {
		title: "Branch",
		activity: "idle",
		workingSince: null,
		prompts: 1,
		model: "M",
		mode: "Ask",
		startedAt: null,
		costUsd: 0.5,
		costNote: "Includes the cost of the conversation it branched from",
	};
	const card = tabCard(input, NOW);
	assert.equal(card.cost, "$0.5000");
	assert.equal(card.costNote, "Includes the cost of the conversation it branched from");
	assert.equal(tabCard({ ...input, costUsd: 0 }, NOW).costNote, null);
	assert.equal(tabCard({ ...input, costNote: undefined }, NOW).costNote, null);
});

test("PRD-001.R7: the hover card says Waiting for you, one prompt, and the cost above zero", () => {
	const card = tabCard(
		{
			title: "Notes",
			activity: "waiting",
			workingSince: NOW - 5000,
			prompts: 1,
			model: "Default",
			mode: "Auto",
			startedAt: NOW,
			costUsd: 0.04123,
		},
		NOW
	);
	assert.deepEqual(card.state, { kind: "waiting", text: "Waiting for you" });
	assert.equal(card.meta, `1 prompt · Default · Auto · started ${clock(NOW)}`);
	assert.equal(card.cost, "$0.0412");
});

test("PRD-001.R7: an idle card has no state line, and a conversation not started has no start", () => {
	const card = tabCard(
		{
			title: "New conversation",
			activity: "idle",
			workingSince: null,
			prompts: 0,
			model: "Sonnet 4.5",
			mode: "Ask",
			startedAt: null,
			costUsd: 0,
		},
		NOW
	);
	assert.equal(card.state, null);
	assert.equal(card.meta, "0 prompts · Sonnet 4.5 · Ask");
});

test("PRD-001.R7: a working tab whose start is unknown says Working alone", () => {
	const card = tabCard(
		{ title: "T", activity: "writing", workingSince: null, prompts: 1, model: "M", mode: "Ask", startedAt: null, costUsd: 0 },
		NOW
	);
	assert.deepEqual(card.state, { kind: "busy", text: "Working" });
});

test("PRD-001.R7: a start on another day names the day", () => {
	const yesterday = NOW - 24 * 60 * 60 * 1000;
	assert.equal(startedLabel(NOW, NOW), clock(NOW));
	const label = startedLabel(yesterday, NOW);
	assert.ok(label.endsWith(clock(yesterday)), label);
	assert.notEqual(label, clock(yesterday));
});

test("PRD-001.R7: the cost shows four decimals below $1 and two from $1", () => {
	assert.equal(formatCost(0.04123), "$0.0412");
	assert.equal(formatCost(1.5), "$1.50");
});

test("PRD-001.R30, PRD-001.R28: the switcher is labelled with the open count", () => {
	assert.equal(switcherLabel(1), "Switch conversation, 1 open");
	assert.equal(switcherLabel(4), "Switch conversation, 4 open");
});

test("PRD-001.R30: the open-tabs list rows carry the tab item the row draws and no icon or state words", () => {
	const tabs = [
		tab(1, { title: "One", activity: "working" }),
		tab(2, { title: "Two", pinned: true, pinnedAt: 10, activity: "waiting" }),
		tab(3, { title: "Three" }),
	];
	const rows = openTabsList(tabs, 3);
	assert.deepEqual(rows, [
		{ key: 2, item: tabItem(tabs[1]), active: false },
		{ key: 1, item: tabItem(tabs[0]), active: false },
		{ key: 3, item: tabItem(tabs[2]), active: true },
	]);
	assert.equal("icon" in rows[0], false);
	assert.equal("state" in rows[0], false);
});

test("PRD-001.R7: after a close in the open-tabs list focus goes to the row in its place, else the one before it", () => {
	assert.equal(focusAfterClose([1, 2, 3], [1, 3], 2), 3, "the next row takes the place");
	assert.equal(focusAfterClose([1, 2, 3], [1, 2], 3), 2, "the last row: the one before");
	assert.equal(focusAfterClose([1, 2, 3], [2, 3], 1), 2, "the first row: the next");
	assert.equal(focusAfterClose([1], [], 1), null, "no row is left");
	assert.equal(focusAfterClose([1, 2, 3], [1, 2, 3], 2), 2, "a close that did not happen keeps focus");
	assert.equal(focusAfterClose([1, 2, 3], [2, 3], 9), null, "a row that was not drawn has no target");
});

test("PRD-001.R30: the column layout's title block shows the title, the prompt count and the start time", () => {
	const started = new Date(2026, 9, 11, 14, 2, 0).getTime();
	assert.deepEqual(titleBlock({ title: "Q4 planning review", prompts: 3, startedAt: started }, NOW), {
		title: "Q4 planning review",
		meta: `3 prompts · started ${clock(started)}`,
	});
	assert.deepEqual(titleBlock({ title: "New conversation", prompts: 0, startedAt: null }, NOW), {
		title: "New conversation",
		meta: "0 prompts",
	});
	assert.equal(titleBlock({ title: "t", prompts: 1, startedAt: null }, NOW).meta, "1 prompt");
});

test("PRD-001.R1: next and previous conversation tab step in strip order, pinned first, and wrap", () => {
	const tabs = [tab(1), tab(2, { pinned: true, pinnedAt: 5 }), tab(3)];
	// Strip order: 2, 1, 3.
	assert.equal(stepTab(tabs, 2, 1), 1);
	assert.equal(stepTab(tabs, 1, 1), 3);
	assert.equal(stepTab(tabs, 3, 1), 2);
	assert.equal(stepTab(tabs, 2, -1), 3);
	assert.equal(stepTab(tabs, 1, -1), 2);
});

test("PRD-001.R1: with no active tab the step lands on the first or last; with fewer than two tabs there is none", () => {
	const tabs = [tab(1), tab(2)];
	assert.equal(stepTab(tabs, null, 1), 1);
	assert.equal(stepTab(tabs, null, -1), 2);
	assert.equal(stepTab([tab(1)], 1, 1), null);
	assert.equal(stepTab([], null, -1), null);
});
