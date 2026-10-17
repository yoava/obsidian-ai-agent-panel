import { test } from "node:test";
import assert from "node:assert/strict";
import {
	contextIcon,
	contextLabel,
	isCommandBubble,
	splitSelection,
	promptCount,
	railFractions,
	RailDrawn,
	sentLabel,
	starters,
	tickLabel,
	tickMoved,
	turnPromptNumber,
} from "./.build/state/prompts.mjs";
import { formatClock } from "./.build/state/usage-segment.mjs";

test("PRD-001.R7: the prompt count counts the messages sent to Claude", () => {
	assert.equal(promptCount([]), 0);
	assert.equal(
		promptCount([
			{ kind: "user", text: "Summarize this" },
			{ kind: "assistant", text: "Sure" },
			{ kind: "user", text: "/compact" },
			{ kind: "meta", turn: 1 },
		]),
		2,
		"a slash command Claude Code runs is a prompt"
	);
});

test("PRD-001.R7: panel commands and ! runs are not prompts", () => {
	assert.equal(
		promptCount([
			{ kind: "user", text: "/usage" },
			{ kind: "user", text: "/MCP disable fs" },
			{ kind: "bash", command: "ls" },
			{ kind: "user", text: "Hello" },
		]),
		1
	);
});

test("PRD-001.R38: a /clear message is no prompt and owns no card", () => {
	const messages = [
		{ kind: "user", text: "hi" },
		{ kind: "assistant", text: "one" },
		{ kind: "meta", turn: 1 },
		{ kind: "user", text: "/clear" },
		{ kind: "clear" },
		{ kind: "user", text: "again" },
		{ kind: "assistant", text: "answer" },
		{ kind: "meta", turn: 2 },
	];
	assert.equal(promptCount(messages), 2);
	assert.equal(turnPromptNumber(messages, 7), 2);
});

test("PRD-001.R33: a rail tick is labelled with the prompt's number and first line", () => {
	assert.equal(tickLabel(3, "Draft a short update\nfor Slack"), "3 · Draft a short update");
	assert.equal(tickLabel(1, "\n\n"), "1 · Untitled");
	assert.equal(tickLabel(2, "x".repeat(100)), `2 · ${"x".repeat(79)}\u2026`);
});

test("PRD-001.R33: a drawn prompt's tick sits at its offset over the scroll height, an undrawn one at its index fraction", () => {
	assert.deepEqual(railFractions([200, 600, 900], 1000), [0.2, 0.6, 0.9]);
	assert.deepEqual(railFractions([null, null, 900, null], 1000), [0, 0.25, 0.9, 0.75]);
	assert.deepEqual(railFractions([-10, 1200], 1000), [0, 1], "clamped to the rail");
	assert.deepEqual(railFractions([null, 50], 0), [0, 0.5], "nothing laid out: index fractions");
	assert.deepEqual(railFractions([], 1000), []);
});

test("PRD-001.R33: a tick is written only when it moves by 1 px or more", () => {
	assert.equal(tickMoved(null, 0), true, "never written");
	assert.equal(tickMoved(10, 10.9), false);
	assert.equal(tickMoved(10, 9.1), false);
	assert.equal(tickMoved(10, 11), true);
	assert.equal(tickMoved(10, 9), true);
});

test("PRD-003.R1: a prompt shows its send time only when one was recorded", () => {
	const at = new Date(2026, 9, 11, 14, 2).getTime();
	assert.equal(sentLabel(at), formatClock(at));
	assert.equal(sentLabel(null), "");
	assert.equal(sentLabel(undefined), "");
});

test("PRD-001.R35: an open note offers its two starters, inserting prompts that mention its path", () => {
	assert.deepEqual(starters({ name: "Q4 planning", path: "Work/Q4 planning.md" }, false), [
		{ icon: "file-text", label: "Summarize", note: "Q4 planning.md", prompt: "Summarize @Work/Q4 planning.md." },
		{
			icon: "link",
			label: "Find notes that should link here",
			note: "",
			prompt: "Find notes in this vault that @Work/Q4 planning.md could link to, with one line on why for each.",
		},
	]);
});

test("PRD-001.R35: the first starter names the note's file, with its extension", () => {
	assert.equal(starters({ name: "Chart", path: "Work/Chart.canvas" }, false)[0].note, "Chart.canvas");
	assert.equal(starters({ name: "Top", path: "Top.md" }, false)[0].note, "Top.md");
});

test("PRD-001.R35: a selection in the open note adds the follow-up starter", () => {
	const offered = starters({ name: "Weekly review", path: "Weekly review.md" }, true);
	assert.equal(offered.length, 3);
	assert.deepEqual(offered[2], {
		icon: "pencil",
		label: "Draft a follow-up from the selection",
		note: "",
		prompt: "Draft a follow-up from the selected text in @Weekly review.md.",
	});
});

test("PRD-001.R35: no open note, no starters, a selection notwithstanding", () => {
	assert.deepEqual(starters(null, false), []);
	assert.deepEqual(starters(null, true), []);
});

const user = (text) => ({ kind: "user", text });
const out = (kind = "assistant") => ({ kind, text: "…" });
const meta = (turn) => ({ kind: "meta", turn });
/** The prompt number of the turn whose record is the `nth` meta of `messages`. */
const numberOf = (messages, nth = 0) =>
	turnPromptNumber(messages, messages.map((m, at) => (m.kind === "meta" ? at : -1)).filter((at) => at >= 0)[nth]);

test("PRD-002.R18: a turn's number is the number of the prompt that opened it", () => {
	const messages = [user("a"), out(), out("tool"), meta(1), user("b"), out("thinking"), out(), meta(2)];
	assert.equal(numberOf(messages, 0), 1);
	assert.equal(numberOf(messages, 1), 2);
});

test("PRD-002.R18: a turn Claude Code takes up from a queued prompt has that prompt's number", () => {
	// "q" was sent while turn 1 ran; the CLI ran it as the next turn, recorded with the same turn counter.
	const messages = [user("a"), out(), user("q"), out(), meta(1), out(), user("r"), out(), meta(1)];
	assert.equal(numberOf(messages, 0), 1);
	assert.equal(numberOf(messages, 1), 2, "r came after the take-up turn's first output");
});

test("PRD-002.R18: a prompt sent before the turn's first output does not renumber the turn it joined", () => {
	const messages = [user("a"), user("s"), out(), meta(1), user("b"), out(), meta(2)];
	assert.equal(numberOf(messages, 0), 1);
	assert.equal(numberOf(messages, 1), 3);
});

test("PRD-002.R18: panel commands, their cards and ! runs are no prompts and no output", () => {
	const messages = [
		user("One"),
		out(),
		meta(1),
		user("/mcp"),
		{ kind: "assistant", text: "the /mcp card" },
		{ kind: "bash", command: "ls" },
		user("/usage"),
		user("Two"),
		{ kind: "assistant", text: "the /usage card, recorded late" },
		{ kind: "tool", name: "Read", input: {} },
		user("Three, sent mid-turn"),
		out(),
		meta(2),
	];
	assert.equal(numberOf(messages, 1), 2);
});

test("PRD-002.R18: a turn that ended with an error before any output keeps its prompt; no prompt gives none", () => {
	assert.equal(numberOf([user("a"), out(), meta(1), user("b"), { kind: "meta", turn: 2, error: "exited" }], 1), 2);
	assert.equal(numberOf([out(), meta(1)]), null);
	assert.equal(turnPromptNumber([user("a"), out()], 1), null, "not a turn record");
});

test("PRD-001.R33: a prompt's context label names its context, then a reopened prompt's image count", () => {
	assert.equal(contextLabel("Q4 planning.md · links & properties", 0), "Q4 planning.md · links & properties");
	assert.equal(contextLabel("Q4 planning.md", 2), "Q4 planning.md · 2 images");
	assert.equal(contextLabel(null, 1), "1 image");
	assert.equal(contextLabel(null, 0), "");
	assert.equal(contextLabel("Note.md", []), "Note.md", "live images show as thumbnails");
});


test("PRD-001.R33: the rail redraws only when the active tab's prompts differ from the ones drawn", () => {
	const drawn = new RailDrawn();
	assert.equal(drawn.next(["1 · a"]), "1 · a");
	assert.equal(drawn.next(["1 · a"]), null, "same prompts: nothing to write");
	assert.equal(drawn.next(["1 · a", "2 · b"]), "1 · a\n2 · b");
	assert.equal(drawn.next([]), "", "prompts cleared: redraw to no ticks");
	assert.equal(drawn.next([]), null);
});

test("PRD-001.R33: after another tab becomes active, an empty tab still redraws and clears the ticks", () => {
	const drawn = new RailDrawn();
	const tabA = ["1 · a", "2 · b"];
	assert.equal(drawn.next(tabA), "1 · a\n2 · b");
	drawn.forget();
	assert.notEqual(drawn.next([]), null, "empty tab B after A: no ticks drawn");
	drawn.forget();
	assert.equal(drawn.next(tabA), "1 · a\n2 · b", "back on A: its ticks");
	drawn.forget();
	assert.notEqual(drawn.next([]), null, "clearing the conversation opens a fresh tab: no ticks");
});

test("PRD-001.R33: the head form of a label drops \"selected\"; the bubble's line keeps it", () => {
	assert.deepEqual(splitSelection("Q4 planning.md · 6 lines selected"), { lead: "Q4 planning.md · 6 lines", rest: "" });
	assert.deepEqual(splitSelection("Q4.md · 1 line selected · Projects/ · links & properties"), {
		lead: "Q4.md · 1 line",
		rest: " · Projects/ · links & properties",
	});
	assert.equal(splitSelection("Q4 planning.md · links & properties"), null);
	assert.equal(splitSelection(""), null);
});

test("PRD-001.R33: a context label's icon is a file for a note, a folder for a folder, else none", () => {
	assert.equal(contextIcon("Q4 planning.md · 6 lines selected"), "file");
	assert.equal(contextIcon("Projects/"), "folder");
	assert.equal(contextIcon("Projects/ · 2 attached"), "folder");
	assert.equal(contextIcon("2 attached"), null);
	assert.equal(contextIcon("links & properties"), null);
	assert.equal(contextIcon(null), null);
});

test("PRD-001.R33: a panel command, a `!` run and a message sent bare (/compact) are command bubbles; a prompt is not", () => {
	assert.equal(isCommandBubble({ type: "command", text: "/clear" }), true);
	assert.equal(isCommandBubble({ type: "shell", text: "!ls" }), true);
	assert.equal(isCommandBubble({ type: "prompt", text: "/compact keep owners and due dates" }), true);
	assert.equal(isCommandBubble({ type: "prompt", text: "Summarize the note" }), false);
	assert.equal(isCommandBubble({ type: "prompt", text: "Summarize /compact" }), false);
});
