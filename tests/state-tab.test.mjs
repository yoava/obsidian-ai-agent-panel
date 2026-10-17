import { test } from "node:test";
import assert from "node:assert/strict";
import {
	activity,
	chunkDone,
	closeNeedsConfirmation,
	emptyUsage,
	firstScreenDone,
	followsEnd,
	scrollsUpByHand,
	modelFromStored,
	newTabData,
	nextTasks,
	reopenReusesTab,
	restoredScrollTop,
	scrollPosition,
	sectionsOf,
	shellStatus,
	storedCount,
	taskLabel,
	withItem,
	withTurnUsage,
} from "./.build/state/tab.mjs";

const SETTINGS = {
	defaultPermissionMode: "default",
	model: "opus",
	effort: "high",
	defaultProfileId: "p1",
	includeContextByDefault: true,
};

test("PRD-001.R7: activity is waiting while a card waits, whatever the turn does", () => {
	assert.equal(activity(true, 1, true), "waiting");
	assert.equal(activity(true, 2, false), "waiting");
	assert.equal(activity(false, 1, false), "waiting");
});

test("PRD-001.R7: activity is writing while a text block is open in a running turn", () => {
	assert.equal(activity(true, 0, true), "writing");
});

test("PRD-001.R7: activity is working while a turn runs with no open text block", () => {
	assert.equal(activity(true, 0, false), "working");
});

test("PRD-001.R7: activity is idle with no turn and no card, an open text block notwithstanding", () => {
	assert.equal(activity(false, 0, false), "idle");
	assert.equal(activity(false, 0, true), "idle");
});

test("PRD-001.R7: a new tab takes the last picks, else the settings, and the default profile", () => {
	const fresh = newTabData(SETTINGS);
	assert.deepEqual(
		{ model: fresh.status.model, effort: fresh.status.effort, profileId: fresh.status.profileId },
		{ model: "opus", effort: "high", profileId: "p1" }
	);
	const picked = newTabData({ ...SETTINGS, lastModel: "", lastEffort: "low" });
	assert.equal(picked.status.model, "");
	assert.equal(picked.status.effort, "low");
	assert.equal(fresh.status.reportedModel, "");
	assert.equal(fresh.status.costUsd, 0);
	assert.deepEqual(fresh.status.usage, emptyUsage());
	assert.equal(fresh.status.cache.seen, false, "the prompt cache countdown starts empty (PRD-005 Failure and recovery)");
});

test("PRD-001.R7: a new tab's composer is empty, with the note chip per the setting", () => {
	const { composer } = newTabData(SETTINGS);
	assert.deepEqual(composer, {
		draft: "",
		includeNote: true,
		includeFolder: false,
		includeLinks: false,
		attached: [],
		images: [],
		hasMessages: false,
	});
	assert.equal(newTabData({ ...SETTINGS, includeContextByDefault: false }).composer.includeNote, false);
});

test("PRD-002.R10: a new tab never starts in Bypass, and inherits the CLI's mode only from Claude Code default", () => {
	const inherit = newTabData(SETTINGS).status;
	assert.deepEqual(
		{ selectedMode: inherit.selectedMode, inheritMode: inherit.inheritMode, cliMode: inherit.cliMode },
		{ selectedMode: "default", inheritMode: true, cliMode: null }
	);
	const edits = newTabData({ ...SETTINGS, defaultPermissionMode: "acceptEdits" }).status;
	assert.deepEqual([edits.selectedMode, edits.inheritMode], ["acceptEdits", false]);
	const bypass = newTabData({ ...SETTINGS, defaultPermissionMode: "bypassPermissions" }).status;
	assert.deepEqual([bypass.selectedMode, bypass.inheritMode], ["default", true]);
});

test("PRD-005.R7: a result adds its tokens and one turn; missing or non-numeric fields add nothing", () => {
	const once = withTurnUsage(emptyUsage(), {
		input_tokens: 10,
		output_tokens: 20,
		cache_creation_input_tokens: 30,
		cache_read_input_tokens: 40,
	});
	assert.deepEqual(once, {
		inputTokens: 10,
		outputTokens: 20,
		cacheWriteTokens: 30,
		cacheReadTokens: 40,
		turns: 1,
		context: null,
	});
	const twice = withTurnUsage(once, { input_tokens: "5", output_tokens: Number.NaN });
	assert.deepEqual(
		[twice.inputTokens, twice.outputTokens, twice.turns],
		[10, 20, 2]
	);
	assert.equal(withTurnUsage(once, undefined).turns, 2);
	// The totals are a new object; the old one is left as it was.
	assert.equal(once.turns, 1);
});

test("PRD-001.R7: closing asks first while a turn runs or a card waits, and not otherwise", () => {
	assert.equal(closeNeedsConfirmation(true, 0), true);
	assert.equal(closeNeedsConfirmation(false, 1), true);
	assert.equal(closeNeedsConfirmation(true, 2), true);
	assert.equal(closeNeedsConfirmation(false, 0), false);
});

test("PRD-001.R7: a switch keeps the scroll position, following the end within 120 px of it", () => {
	// scrollHeight 1000, view 400: the end is at scrollTop 600.
	assert.deepEqual(scrollPosition(481, 1000, 400), { top: 481, nearBottom: true });
	assert.deepEqual(scrollPosition(480, 1000, 400), { top: 480, nearBottom: false });
	assert.equal(restoredScrollTop({ top: 481, nearBottom: true }, 1500), 1500, "to the new end");
	assert.equal(restoredScrollTop({ top: 200, nearBottom: false }, 1500), 200, "where it was");
});

test("PRD-001.R29: a scroll up the user makes leaves the end, however near; growth below and scroll anchoring keep it; a scroll down to within 120 px rejoins", () => {
	const at = (following, lastTop) => ({ following, lastTop });
	assert.deepEqual(followsEnd(at(true, 600), 600, 186), at(true, 600), "a fence or embed settled below the view: no scroll, still following");
	assert.deepEqual(followsEnd(at(true, 600), 1400, 186), at(true, 1400), "scroll anchoring moved the view down for content drawn above");
	assert.deepEqual(followsEnd(at(true, 600), 590, 30, true), at(false, 590), "the user's scroll up leaves it, within 120 px too");
	assert.deepEqual(followsEnd(at(true, 600), 590, 0), at(true, 590), "a scroll up nobody made (content shrank under the end) keeps it");
	assert.deepEqual(followsEnd(at(false, 500), 450, 50), at(false, 450), "and rejoins nothing");
	assert.deepEqual(followsEnd(at(false, 400), 500, 119), at(true, 500), "a scroll down to within 120 px of the end rejoins");
	assert.deepEqual(followsEnd(at(false, 400), 500, 120), at(false, 500));
	assert.deepEqual(followsEnd(at(false, 400), 400, 300), at(false, 400), "growth below a view that does not follow changes nothing");
	assert.deepEqual(followsEnd(at(true, 600), 599.5, 186, true), at(true, 600), "half a pixel is no move, and the reference stays");
});

test("PRD-001.R29: the user's slow scroll up leaves the end once it has gone 1 px, however small its steps", () => {
	let state = { following: true, lastTop: 600 };
	for (let top = 599.5; top >= 598.5; top -= 0.5) state = followsEnd(state, top, 700 - top, true);
	assert.deepEqual(state, { following: false, lastTop: 598.5 });
});

test("PRD-001.R29: a wheel up, PageUp, ArrowUp or Home outside a field and a press on the scroll bar are the user's scrolls up", () => {
	assert.equal(scrollsUpByHand({ kind: "wheel", deltaY: -3 }), true);
	assert.equal(scrollsUpByHand({ kind: "wheel", deltaY: 40 }), false);
	assert.equal(scrollsUpByHand({ kind: "wheel", deltaY: 0 }), false);
	for (const key of ["PageUp", "ArrowUp", "Home"]) assert.equal(scrollsUpByHand({ kind: "key", key, inField: false }), true, key);
	assert.equal(scrollsUpByHand({ kind: "key", key: "ArrowUp", inField: true }), false, "a field's own arrow keys");
	for (const key of ["PageDown", "ArrowDown", "End", " ", "Enter"]) assert.equal(scrollsUpByHand({ kind: "key", key, inField: false }), false, key);
	assert.equal(scrollsUpByHand({ kind: "scrollbar" }), true);
});

test("PRD-001.R7: a new tab starts at the end of its messages", () => {
	assert.equal(newTabData(SETTINGS).scroll.nearBottom, true);
});

/** Each item as a line: prompts by text, turns by their blocks and footer. */
const shape = (items) =>
	items.map((item) => {
		if (item.kind === "prompt") return `${item.type} ${item.number ?? "-"} ${item.text}${item.queued ? " (queued)" : ""}`;
		if (item.kind === "error") return `error ${item.text}`;
		if (item.kind === "report") return `report /${item.command} ${item.state}${item.markdown === null ? "" : ` ${item.markdown}`}`;
		if (item.kind === "shell") return `shell ${item.command}${item.result ? ` ${shellStatus(item.result).label}` : " running"}`;
		const blocks = item.blocks.map((block) =>
			block.kind === "steps" ? `steps ${block.rows.map((row) => row.name).join(" ")}` : `${block.kind} ${block.text}`
		);
		const footer = item.footer
			? ` | ${item.footer.error ?? `${item.footer.durationMs ?? "-"}ms $${item.footer.costUsd?.toFixed(4) ?? "-"}`}`
			: "";
		return `${item.continuation ? "cont" : "turn"} ${item.turn}:${blocks.length ? ` ${blocks.join(", ")}` : ""}${footer}`;
	});

test("PRD-005.R7: a reopened branch's first footer costs its total minus the fork base", () => {
	const footerCosts = (model) => model.items.filter((item) => item.footer).map((item) => Math.round(item.footer.costUsd * 1e6) / 1e6);
	const messages = [
		{ kind: "user", text: "One" },
		{ kind: "meta", turn: 1, durationMs: 10, costUsd: 0.52, sessionId: "f1" },
		{ kind: "user", text: "Two" },
		{ kind: "meta", turn: 2, durationMs: 10, costUsd: 0.55, sessionId: "f1" },
	];
	assert.deepEqual(footerCosts(modelFromStored(messages, { costUsd: 0.5, sessionId: "f1" })), [0.02, 0.03]);
	assert.deepEqual(footerCosts(modelFromStored(messages)), [0.52, 0.03]);
});

test("PRD-001.R15, PRD-001.R33: the model built from stored messages numbers the prompts and draws each turn with its footer", () => {
	const tool = { kind: "tool", name: "Read", input: {} };
	const meta = { kind: "meta", turn: 1, durationMs: 1200, costUsd: 0.01, sessionId: "s1" };
	const model = modelFromStored([
		{ kind: "user", text: "First", contextName: "Q4.md", images: 2, sentAt: 1000 },
		{ kind: "thinking", text: "Hmm" },
		{ kind: "assistant", text: "One" },
		tool,
		meta,
		{ kind: "user", text: "Second" },
		{ kind: "meta", turn: 2, error: "Overloaded", costUsd: 0.03, sessionId: "s1" },
	]);
	assert.deepEqual(model.items[0], {
		kind: "prompt",
		id: 1,
		type: "prompt",
		number: 1,
		text: "First",
		contextName: "Q4.md",
		images: 2,
		sentAt: 1000,
		queued: false,
	});
	assert.deepEqual(shape(model.items), [
		"prompt 1 First",
		"turn 1: thinking Hmm, text One, steps Read | 1200ms $0.0100",
		"prompt 2 Second",
		"turn 2: | Overloaded",
	]);
	const turn = model.items[1];
	assert.equal(turn.running, false);
	assert.equal(turn.startedAt, null, "no timing on reopen");
	assert.deepEqual(turn.blocks[2].rows.map((row) => [row.name, row.status]), [["Read", "unknown"]], "a tool call as a step row");
	assert.equal(turn.footer.record, meta, "the record itself, for Restore files");
	assert.equal(turn.footer.tokens, null, "tokens only for turns finished since the conversation opened");
	assert.deepEqual(turn.blocks[0], { kind: "thinking", id: 3, text: "Hmm", streaming: false, startedAt: null, endedAt: null });
	assert.equal(model.open, null);
	assert.equal(model.prompts, 2);
	assert.equal(model.turns, 2);
	assert.equal(model.lastId, 7);
});

test("PRD-002.R15: a turn that ended before its branch's rewind succeeded reopens with its prompts not sent, and only that", () => {
	const intent = { kind: "meta", branchSession: "s", branchTarget: "t" };
	const flags = (messages) =>
		modelFromStored(messages)
			.items.filter((item) => item.kind === "prompt")
			.map((item) => [item.text, item.notSent === true]);
	// Closed during the first rewind: the turn's end record carries the branch.
	assert.deepEqual(flags([intent, { kind: "user", text: "A" }, { kind: "meta", turn: 1, branchSession: "s", branchTarget: "t" }]), [["A", true]]);
	// Crashed after the fork's init and output: its end record names no branch, and neither does a missing one.
	const reply = { kind: "assistant", text: "ok" };
	assert.deepEqual(flags([intent, { kind: "user", text: "A" }, reply, { kind: "meta", turn: 1, lastPromptUuid: "u" }]), [["A", false]]);
	assert.deepEqual(flags([intent, { kind: "user", text: "A" }, reply]), [["A", false]]);
});

test("PRD-002.R15: a branch recorded ahead of the first record draws nothing on reopen", () => {
	const intent = { kind: "meta", branchSession: "s", branchTarget: "t" };
	const turn = { kind: "meta", turn: 1, sessionId: "f" };
	const without = modelFromStored([{ kind: "user", text: "Hi" }, turn]);
	assert.deepEqual(modelFromStored([intent, { kind: "user", text: "Hi" }, turn]), without);
	assert.deepEqual(modelFromStored([intent]).items, []);
});

test("PRD-001.R15: a reopened prompt sent mid-turn is queued, the turn going on in a continuation after it", () => {
	const model = modelFromStored([
		{ kind: "user", text: "One" },
		{ kind: "assistant", text: "a" },
		{ kind: "user", text: "Two" },
		{ kind: "assistant", text: "b" },
		{ kind: "meta", turn: 1, durationMs: 10, costUsd: 0.01, sessionId: "s1" },
		{ kind: "assistant", text: "c" },
		{ kind: "meta", turn: 2, durationMs: 20, costUsd: 0.03, sessionId: "s1" },
	]);
	assert.deepEqual(shape(model.items), [
		"prompt 1 One",
		"turn 1: text a",
		"prompt 2 Two (queued)",
		"cont 1: text b | 10ms $0.0100",
		"turn 2: text c | 20ms $0.0200",
	]);
});

test("PRD-001.R15: a turn that ended without a result records its end, so the next prompt reopens as a turn of its own", () => {
	const model = modelFromStored([
		{ kind: "user", text: "A" },
		{ kind: "assistant", text: "ra" },
		{ kind: "meta", turn: 1 },
		{ kind: "user", text: "B" },
		{ kind: "assistant", text: "rb" },
		{ kind: "meta", turn: 2, durationMs: 10, costUsd: 0.01, sessionId: "s1" },
	]);
	assert.deepEqual(shape(model.items), ["prompt 1 A", "turn 1: text ra | -ms $-", "prompt 2 B", "turn 2: text rb | 10ms $0.0100"]);
	assert.equal(model.unclosed, null);
});

test("PRD-001.R15: a file from before turn ends were recorded reads a prompt between a turn's output and its record as sent mid-turn", () => {
	const model = modelFromStored([
		{ kind: "user", text: "A" },
		{ kind: "assistant", text: "ra" },
		{ kind: "user", text: "B" },
		{ kind: "assistant", text: "rb" },
		{ kind: "meta", turn: 1, durationMs: 10, costUsd: 0.01, sessionId: "s1" },
	]);
	assert.deepEqual(shape(model.items), ["prompt 1 A", "turn 1: text ra", "prompt 2 B (queued)", "cont 1: text rb | 10ms $0.0100"]);
});

test("PRD-002.R15: a reopened branch failure marks its turn's prompts not sent, and an ordinary session error does not", () => {
	const failure = { kind: "meta", error: "Could not branch from that turn: x", branchSession: "s", branchTarget: "t" };
	const notSent = (messages) =>
		modelFromStored(messages)
			.items.filter((item) => item.kind === "prompt")
			.map((item) => [item.text, item.notSent === true]);
	assert.deepEqual(
		notSent([
			{ kind: "user", text: "A" },
			{ kind: "meta", turn: 1, durationMs: 10, costUsd: 0.01 },
			{ kind: "user", text: "B" },
			{ kind: "user", text: "C" },
			{ kind: "meta", turn: 2 },
			failure,
		]),
		[
			["A", false],
			["B", true],
			["C", true],
		]
	);
	assert.deepEqual(
		notSent([
			{ kind: "user", text: "A" },
			{ kind: "meta", error: "Claude exited with code 1" },
		]),
		[["A", false]]
	);
});

test("PRD-001.R15: a file that leaves its last turn open says which, for the next prompt to record its end", () => {
	assert.equal(modelFromStored([{ kind: "user", text: "A" }, { kind: "assistant", text: "ra" }]).unclosed, 1);
	assert.equal(modelFromStored([{ kind: "user", text: "A" }, { kind: "meta", turn: 4 }]).unclosed, null);
	assert.equal(modelFromStored([]).unclosed, null);
});

test("PRD-001.R33, PRD-001.R20, PRD-002.R16: a stored panel command and a ! run reopen as compact, unnumbered messages with their cards", () => {
	const model = modelFromStored([
		{ kind: "user", text: "/status" },
		{ kind: "assistant", text: "**Status**" },
		{ kind: "bash", command: "git status", stdout: "clean", code: 0, durationMs: 300 },
		{ kind: "user", text: "Go" },
		{ kind: "assistant", text: "Went" },
	]);
	assert.deepEqual(shape(model.items), [
		"command - /status",
		"report /status answered **Status**",
		"shell - !git status",
		"shell git status exit 0",
		"prompt 1 Go",
		"turn 1: text Went | -ms $-",
	]);
	assert.deepEqual(model.items[3].result, {
		command: "git status",
		stdout: "clean",
		stderr: "",
		code: 0,
		timedOut: false,
		durationMs: 300,
		truncated: false,
	});
});

test("PRD-001.R20: a reopened card takes its command from the message before it, in any case and with arguments", () => {
	const model = modelFromStored([
		{ kind: "user", text: "/MCP reconnect github" },
		{ kind: "user", text: "/help" },
		{ kind: "assistant", text: "**MCP servers**" },
		{ kind: "assistant", text: "**Commands**" },
	]);
	assert.deepEqual(shape(model.items), [
		"command - /MCP reconnect github",
		"command - /help",
		"report /mcp answered **MCP servers**",
		"report /help answered **Commands**",
	]);
});

test("PRD-002.R16: a ! run reads running, then exit N, failed or timed out, with its time to a tenth of a second", () => {
	const run = (fields) => ({ command: "x", stdout: "", stderr: "", code: 0, timedOut: false, durationMs: 340, truncated: false, ...fields });
	assert.deepEqual(shellStatus(null), { label: "running", failed: false, duration: "" });
	assert.deepEqual(shellStatus(run({})), { label: "exit 0", failed: false, duration: "0.3s" });
	assert.deepEqual(shellStatus(run({ code: 2 })), { label: "exit 2", failed: true, duration: "0.3s" });
	assert.deepEqual(shellStatus(run({ code: null, error: "spawn sh ENOENT", durationMs: 0 })), { label: "failed", failed: true, duration: "0.0s" });
	assert.deepEqual(shellStatus(run({ code: null, timedOut: true, durationMs: 60_012 })), { label: "timed out", failed: true, duration: "60.0s" });
	assert.equal(shellStatus(run({ code: null })).label, "failed", "killed with no code: failed, not exit null");
});

test("DES-003: an error the session ended with reopens as an error block after the turn it closed", () => {
	const model = modelFromStored([
		{ kind: "meta", error: "Claude Code CLI not found" },
		{ kind: "user", text: "One" },
		{ kind: "assistant", text: "partial" },
		{ kind: "meta", error: "Claude exited with code 3" },
		{ kind: "user", text: "Two" },
	]);
	assert.deepEqual(shape(model.items), [
		"error Claude Code CLI not found",
		"prompt 1 One",
		"turn 1: text partial | -ms $-",
		"error Claude exited with code 3",
		"prompt 2 Two",
		"turn 2: | -ms $-",
	]);
	assert.equal(model.open, null, "a turn the file leaves open is closed");
	assert.equal(model.items[2].footer.record, null);
});

test("DES-003: the turn counter continues from the highest recorded turn", () => {
	assert.equal(modelFromStored([{ kind: "meta", turn: 7, durationMs: 1 }]).turns, 7);
});

test("PRD-001.R29: a reopen counts a turn by the stored messages it holds, a group by its calls", () => {
	const model = modelFromStored([
		{ kind: "user", text: "One" },
		{ kind: "assistant", text: "a" },
		{ kind: "tool", name: "Read", input: {} },
		{ kind: "tool", name: "Grep", input: {} },
		{ kind: "meta", durationMs: 1 },
	]);
	assert.deepEqual(model.items.map(storedCount), [1, 4]);
});

test("PRD-001.R18: background tasks: task_started adds, background_tasks_changed decides, task_updated patches, task_notification removes", () => {
	const watch = { taskId: "k1", status: "running", description: "Watch", toolUseId: "t1", taskType: "local_agent" };
	let tasks = nextTasks([], { type: "started", task: watch });
	tasks = nextTasks(tasks, { type: "started", task: { taskId: "k2", status: "running" } });
	assert.deepEqual(tasks.map((task) => task.taskId), ["k1", "k2"]);
	tasks = nextTasks(tasks, { type: "running", tasks: [{ taskId: "k1", status: "running" }, { taskId: "k3", status: "running", description: "Shell" }] });
	assert.deepEqual(tasks, [watch, { taskId: "k3", status: "running", description: "Shell" }], "what was known of a task stays");
	tasks = nextTasks(tasks, { type: "updated", taskId: "k3", status: "paused" });
	assert.equal(tasks[1].status, "paused");
	assert.equal(nextTasks(tasks, { type: "updated", taskId: "nope", status: "x" }), tasks, "an unknown task changes nothing");
	assert.equal(nextTasks(tasks, { type: "updated", taskId: "k3", status: null }), tasks);
	const report = { status: "completed", tokens: null, toolUses: null, durationMs: null };
	tasks = nextTasks(tasks, { type: "ended", taskId: "k1", toolUseId: "t1", report });
	assert.deepEqual(tasks.map((task) => task.taskId), ["k3"]);
	assert.equal(nextTasks(tasks, { type: "ended", taskId: null, toolUseId: "t1", report }), tasks);
});

test("PRD-001.R18: a background task is labelled by its description, else its subagent type, else Background task", () => {
	assert.equal(taskLabel({ taskId: "a", description: "Watch", subagentType: "Explore" }), "Watch");
	assert.equal(taskLabel({ taskId: "a", subagentType: "Explore" }), "Explore");
	assert.equal(taskLabel({ taskId: "a" }), "Background task");
});

test("PRD-001.R33: prompts are numbered in order across the whole conversation; panel commands and ! runs get none and do not move the count", () => {
	const numbers = (messages) =>
		modelFromStored(messages)
			.items.filter((item) => item.kind === "prompt")
			.map((item) => `${item.type} ${item.number}`);
	assert.deepEqual(
		numbers([
			{ kind: "user", text: "First" },
			{ kind: "assistant", text: "One" },
			{ kind: "meta", turn: 1 },
			{ kind: "user", text: "Second" },
			{ kind: "user", text: "Third, sent mid-turn" },
			{ kind: "meta", turn: 2 },
			{ kind: "user", text: "/compact" },
		]),
		["prompt 1", "prompt 2", "prompt 3", "prompt 4"]
	);
	assert.deepEqual(
		numbers([
			{ kind: "user", text: "/status" },
			{ kind: "bash", command: "ls" },
			{ kind: "user", text: "Hello" },
			{ kind: "user", text: "/USAGE" },
			{ kind: "user", text: "Again" },
		]),
		["command null", "shell null", "prompt 1", "command null", "prompt 2"]
	);
});

test("PRD-003.R1: a file without send times reopens without them", () => {
	const [prompt] = modelFromStored([{ kind: "user", text: "Old" }]).items;
	assert.equal(prompt.sentAt, null);
});

test("DES-005: a stored message of a kind this version does not know is skipped", () => {
	const items = modelFromStored([{ kind: "divider", text: "x" }, { kind: "user", text: "Hi" }]).items;
	assert.deepEqual(items.map((item) => item.kind), ["prompt", "turn"]);
});

test("DES-003: each user message starts a section; items before the first one form their own", () => {
	const items = modelFromStored([
		{ kind: "meta", error: "Claude Code CLI not found" },
		{ kind: "user", text: "One" },
		{ kind: "assistant", text: "a" },
		{ kind: "user", text: "/cost" },
		{ kind: "assistant", text: "card" },
		{ kind: "bash", command: "ls" },
		{ kind: "user", text: "Two" },
	]).items;
	assert.deepEqual(
		sectionsOf(items).map((section) => section.map((item) => item.id)),
		[[1], [2, 3], [5, 6], [7, 8], [9, 10]]
	);
	assert.deepEqual(sectionsOf([]), []);
});

test("DES-003: an item update replaces that item only", () => {
	const items = modelFromStored([{ kind: "user", text: "/help" }, { kind: "user", text: "/cost" }]).items;
	const next = withItem(items, 2, { queued: true });
	assert.equal(next[1].queued, true);
	assert.equal(next[0], items[0]);
	assert.equal(items[1].queued, false, "the old list is untouched");
	assert.equal(withItem(items, 9, { queued: true }), items, "an unknown id changes nothing");
});

test("PRD-001.R29: a reopen draws newest sections until the messages hold two view heights", () => {
	assert.equal(firstScreenDone(900, 500), false);
	assert.equal(firstScreenDone(1000, 500), true);
	assert.equal(firstScreenDone(0, 0), true, "a hidden tab draws one section, the rest when idle");
});

test("PRD-001.R29: an idle chunk ends at 20 messages or under 4 ms left", () => {
	assert.equal(chunkDone(19, 10), false);
	assert.equal(chunkDone(20, 10), true);
	assert.equal(chunkDone(3, 3.9), true);
	assert.equal(chunkDone(3, 4), false);
});

const IDLE_TAB = {
	hasConversation: false,
	hasSession: false,
	starting: false,
	turnRunning: false,
	localRuns: 0,
	pendingCards: 0,
};

test("PRD-003.R9: a reopen reuses the active tab only when it holds no conversation and runs nothing", () => {
	assert.equal(reopenReusesTab(IDLE_TAB), true);
	assert.equal(reopenReusesTab(null), false, "no active tab: a new one");
	for (const [field, value] of [
		["hasConversation", true],
		["hasSession", true],
		["starting", true],
		["turnRunning", true],
		["localRuns", 1],
		["pendingCards", 1],
	])
		assert.equal(reopenReusesTab({ ...IDLE_TAB, [field]: value }), false, field);
});

test("PRD-003.R9: a stored compaction reopens as a divider between the messages around it, and counts as drawn", () => {
	const record = { kind: "compaction", at: 5, trigger: "manual", preTokens: 30423, postTokens: 3973, summary: "S" };
	const model = modelFromStored([
		{ kind: "user", text: "First" },
		{ kind: "assistant", text: "One" },
		record,
		{ kind: "assistant", text: "Two" },
		{ kind: "meta", turn: 1, durationMs: 5, sessionId: "s1" },
	]);
	assert.deepEqual(
		model.items.map((item) => item.kind),
		["prompt", "turn", "compaction", "turn"]
	);
	const divider = model.items[2];
	assert.deepEqual(
		[divider.phase, divider.trigger, divider.at, divider.preTokens, divider.postTokens, divider.summary],
		["compacted", "manual", 5, 30423, 3973, "S"]
	);
	assert.equal(storedCount(divider), 1);
});

test("PRD-003.R9: a stored compaction of an unknown trigger reopens as an automatic one", () => {
	const model = modelFromStored([{ kind: "compaction", trigger: "sideways" }]);
	assert.equal(model.items[0].trigger, "auto");
});

test("PRD-003.R9: a stored /compact turn reopens as its prompt and the divider, with no empty turn", () => {
	const model = modelFromStored([
		{ kind: "user", text: "/compact" },
		{ kind: "compaction", at: 5, trigger: "manual" },
		{ kind: "meta", turn: 1, durationMs: 5, sessionId: "s1" },
	]);
	assert.deepEqual(
		model.items.map((item) => item.kind),
		["prompt", "compaction"]
	);
});

test("PRD-003.R9: a stored clear reopens as a divider after the messages it cleared, and counts as drawn", () => {
	const model = modelFromStored([
		{ kind: "user", text: "First", sentAt: 1 },
		{ kind: "assistant", text: "One" },
		{ kind: "meta", turn: 1, durationMs: 5, sessionId: "s1" },
		{ kind: "clear", at: 7, sessionId: "s1" },
		{ kind: "user", text: "Second", sentAt: 9 },
		{ kind: "assistant", text: "Two" },
		{ kind: "meta", turn: 2, durationMs: 5, sessionId: "s2" },
	]);
	assert.deepEqual(
		model.items.map((item) => item.kind),
		["prompt", "turn", "clear", "prompt", "turn"]
	);
	assert.equal(model.items[2].at, 7);
	assert.equal(storedCount(model.items[2]), 1);
	assert.equal(model.turns, 2);
});

test("PRD-001.R38: a stored /clear reopens as a command bubble above the divider and takes no card from the reply after it", () => {
	const model = modelFromStored([
		{ kind: "user", text: "First", sentAt: 1 },
		{ kind: "assistant", text: "One" },
		{ kind: "meta", turn: 1, sessionId: "s1" },
		{ kind: "user", text: "/clear" },
		{ kind: "clear", at: 7, sessionId: "s1" },
		{ kind: "user", text: "Second", sentAt: 9 },
		{ kind: "assistant", text: "Two" },
	]);
	assert.deepEqual(
		model.items.map((item) => (item.kind === "prompt" ? item.type : item.kind)),
		["prompt", "turn", "command", "clear", "prompt", "turn"]
	);
});

test("PRD-003.R9: a stored clear with no time reopens as a divider with none, and a fresh start draws nothing", () => {
	const model = modelFromStored([{ kind: "clear" }, { kind: "fresh-start", at: 3 }]);
	assert.deepEqual(model.items.map((item) => [item.kind, item.at ?? null]), [["clear", null]]);
});

test("PRD-001.R38: a clear starts its own section unless the /clear message just before it is there to take it", () => {
	const kinds = (messages) => sectionsOf(modelFromStored(messages).items).map((section) => section.map((item) => item.kind));
	const turn = [{ kind: "user", text: "One" }, { kind: "assistant", text: "a" }];
	assert.deepEqual(kinds([...turn, { kind: "user", text: "/clear" }, { kind: "clear", at: 1 }]), [["prompt", "turn"], ["prompt", "clear"]]);
	assert.deepEqual(kinds([...turn, { kind: "clear", at: 1 }]), [["prompt", "turn"], ["clear"]]);
	assert.deepEqual(kinds([{ kind: "clear", at: 1 }]), [["clear"]]);
});
