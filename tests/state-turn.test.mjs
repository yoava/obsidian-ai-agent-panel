import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addBlock,
	addCard,
	addClear,
	removeClear,
	addCompaction,
	addNote,
	addReport,
	addShell,
	addUserMessage,
	closeTurn,
	EMPTY_FOOTER,
	endedSession,
	turnEndRecord,
	formatElapsed,
	headView,
	lastTurnPrompts,
	markNotSent,
	openTurn,
	patchBlock,
	patchCard,
	removeBlock,
	thinkingExpandable,
	thinkingLabel,
	turnCopyText,
	updateItem,
} from "./.build/state/turn.mjs";
import { EMPTY_MODEL } from "./.build/state/tab.mjs";

const prompt = (text, type = "prompt") => ({ type, text, contextName: null, images: [], sentAt: null });
const text = (value, streaming = false) => ({ kind: "text", text: value, streaming });

/** Runs steps from `model`, each `(model) => step`, keeping every change. */
function steps(model, ...fns) {
	const changes = [];
	for (const fn of fns) {
		const step = fn(model);
		model = step.model;
		changes.push(...step.changes);
	}
	return { model, changes };
}

const shape = (items) =>
	items.map((item) =>
		item.kind === "turn"
			? `${item.continuation ? "cont" : "turn"} ${item.turn}${item.running ? " running" : ""}${item.footer ? " footer" : ""}: ${item.blocks
					.map((block) => (block.kind === "text" ? block.text : block.kind))
					.join(", ")}`
			: item.kind === "prompt"
				? `${item.type} ${item.text}${item.queued ? " (queued)" : ""}`
				: item.kind
	);

test("PRD-001.R15: a message sent while no turn runs opens a turn after it, the counter going up", () => {
	const { model, changes } = steps(EMPTY_MODEL, (m) => addUserMessage(m, prompt("Hi")));
	assert.deepEqual(shape(model.items), ["prompt Hi", "turn 1 running: "]);
	assert.equal(model.turns, 1);
	assert.equal(model.prompts, 1);
	assert.deepEqual(model.open, { turn: 1, startedAt: null, headId: 2, itemId: 2, lastId: 2 });
	assert.deepEqual(changes.map((change) => change.type), ["added", "added"]);
});

test("PRD-001.R15: a turn opened at a time carries it for the head's elapsed time", () => {
	const { model } = steps(EMPTY_MODEL, (m) => openTurn(m, 5000));
	assert.equal(model.items[0].startedAt, 5000);
	assert.equal(model.open.startedAt, 5000);
});

test("PRD-001.R15: the first assistant output while no turn runs opens one", () => {
	const { model } = steps(EMPTY_MODEL, (m) => addBlock(m, text("Taken up"), 10));
	assert.deepEqual(shape(model.items), ["turn 1 running: Taken up"]);
	assert.equal(model.items[0].startedAt, 10);
});

test("PRD-001.R15: a prompt sent while a turn runs is queued and starts a continuation, where the turn goes on", () => {
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addBlock(m, text("a"), 0),
		(m) => addUserMessage(m, prompt("Two")),
		(m) => addBlock(m, text("b"), 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "turn 1 running: a", "prompt Two (queued)", "cont 1: b"]);
	assert.equal(model.turns, 1, "a continuation is the same turn");
	assert.equal(model.prompts, 2);
});

test("PRD-001.R15: a panel command or a ! run mid-turn sends the turn's next block to a continuation after it", () => {
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addUserMessage(m, prompt("!ls", "shell")),
		(m) => addShell(m, "ls"),
		(m) => addBlock(m, text("after"), 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "turn 1 running: ", "shell !ls", "shell", "cont 1: after"]);
	assert.equal(model.prompts, 1, "a ! run is not numbered");
});

test("PRD-001.R15: the turn closes with its footer at the end of its last continuation and its head stops", () => {
	const { model, changes } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addUserMessage(m, prompt("Two")),
		(m) => closeTurn(m, { ...EMPTY_FOOTER, durationMs: 1200 }, 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "turn 1: ", "prompt Two (queued)", "cont 1 footer: "]);
	assert.equal(model.items[3].footer.durationMs, 1200);
	assert.equal(model.open, null);
	assert.deepEqual(
		changes.slice(-2).map((change) => [change.type, change.item.id]),
		[
			["changed", 2],
			["changed", 4],
		]
	);
});

test("PRD-001.R15: a session ending with no turn open closes nothing; a turn record with none open opens and closes one", () => {
	const ended = closeTurn(EMPTY_MODEL, EMPTY_FOOTER, 0);
	assert.equal(ended.model, EMPTY_MODEL);
	assert.deepEqual(ended.changes, []);
	const record = { kind: "meta", durationMs: 5, costUsd: 0.01 };
	const { model } = steps(EMPTY_MODEL, (m) => closeTurn(m, { ...EMPTY_FOOTER, record }, 0));
	assert.deepEqual(shape(model.items), ["turn 1 footer: "]);
});

test("PRD-002.R15: the branch note is an item at the end, outside any turn, which continues after it", () => {
	const alone = addNote(EMPTY_MODEL, "Branched from Q4 planning, before turn 2.");
	assert.deepEqual(alone.item, { kind: "note", id: 1, text: "Branched from Q4 planning, before turn 2." });
	assert.deepEqual(shape(alone.model.items), ["note"]);
	assert.deepEqual(alone.changes, [{ type: "added", item: alone.item }]);
	assert.equal(alone.model.prompts, 0, "a note is not a prompt");
	assert.equal(alone.model.turns, 0, "nor a turn");
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addNote(m, "note"),
		(m) => addBlock(m, text("after"), 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "turn 1 running: ", "note", "cont 1: after"]);
});

test("PRD-001.R15: a block is patched or removed where it is, a later continuation notwithstanding", () => {
	let model = addUserMessage(EMPTY_MODEL, prompt("One")).model;
	const streaming = addBlock(model, text("", true), 0);
	model = addUserMessage(streaming.model, prompt("Two")).model;
	const patched = patchBlock(model, streaming.id, { text: "done", streaming: false });
	assert.deepEqual(shape(patched.model.items), ["prompt One", "turn 1 running: done", "prompt Two (queued)", "cont 1: "]);
	assert.deepEqual(patched.changes.map((change) => [change.type, change.item.id]), [["changed", 2]]);
	const removed = removeBlock(model, streaming.id);
	assert.deepEqual(shape(removed.model.items)[1], "turn 1 running: ");
	assert.equal(patchBlock(model, 99, { text: "x" }).model, model, "an unknown block changes nothing");
});

test("PRD-001.R15: the head reads Working, Writing or Waiting for you with the elapsed time, and nothing once closed", () => {
	const head = { kind: "turn", running: true, continuation: false, startedAt: 0 };
	assert.deepEqual(headView(head, "working", 42_400), { label: "Working", elapsed: "42s" });
	assert.deepEqual(headView(head, "writing", 185_000), { label: "Writing", elapsed: "3m 05s" });
	assert.deepEqual(headView(head, "waiting", 72 * 60_000 + 30_000), { label: "Waiting for you", elapsed: "1h 12m" });
	assert.deepEqual(headView(head, "idle", 1000), { label: "Working", elapsed: "1s" }, "between the send and the CLI's answer");
	assert.deepEqual(headView({ ...head, startedAt: null }, "working", 5), { label: "Working", elapsed: "" });
	assert.equal(headView({ ...head, running: false }, "working", 5), null);
});

test("PRD-001.R15: elapsed times read 42s, 3m 05s and 1h 12m", () => {
	assert.equal(formatElapsed(42_400), "42s");
	assert.equal(formatElapsed(185_000), "3m 05s");
	assert.equal(formatElapsed(72 * 60_000 + 30_000), "1h 12m");
	assert.equal(formatElapsed(-5), "0s");
});

test("PRD-001.R15: thinking reads Thinking… while it streams, Thought for Ns when done, Thought process when the time is unknown", () => {
	assert.equal(thinkingLabel({ streaming: true, startedAt: 0, endedAt: null }), "Thinking…");
	assert.equal(thinkingLabel({ streaming: false, startedAt: 1000, endedAt: 5900 }), "Thought for 4s");
	assert.equal(thinkingLabel({ streaming: false, startedAt: 1000, endedAt: 1200 }), "Thought for 1s", "at least 1");
	assert.equal(thinkingLabel({ streaming: false, startedAt: null, endedAt: null }), "Thought process");
	assert.equal(thinkingLabel({ streaming: false, startedAt: 1000, endedAt: null }), "Thought process");
});

test("PRD-001.R15: a thinking block expands only when it holds text", () => {
	assert.equal(thinkingExpandable(""), false, "no text yet, or redacted");
	assert.equal(thinkingExpandable(" \n\t "), false, "whitespace only");
	assert.equal(thinkingExpandable("Let me check."), true);
	assert.equal(thinkingExpandable("\n  Let me check.\n"), true, "padding around text");
});

test("PRD-001.R15: a turn's copy text is its reply blocks across its continuations, joined by blank lines", () => {
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addBlock(m, { kind: "thinking", text: "hm", streaming: false, startedAt: null, endedAt: null }, 0),
		(m) => addBlock(m, text("First"), 0),
		(m) => addBlock(m, { kind: "steps", rows: [], open: false }, 0),
		(m) => addUserMessage(m, prompt("Two")),
		(m) => addBlock(m, text("Second"), 0),
		(m) => addBlock(m, text("still streaming", true), 0),
		(m) => closeTurn(m, EMPTY_FOOTER, 0),
		(m) => addUserMessage(m, prompt("Three")),
		(m) => addBlock(m, text("Other turn"), 0)
	);
	assert.equal(turnCopyText(model.items, 1), "First\n\nSecond");
	assert.equal(turnCopyText(model.items, 2), "Other turn");
	assert.equal(turnCopyText(model.items, 9), "");
});

test("PRD-001.R15, PRD-002.R15: a turn ending without a result records its number and its last echoed prompt, which is no session's error", () => {
	assert.deepEqual(turnEndRecord(3), { kind: "meta", turn: 3 });
	assert.equal(endedSession(turnEndRecord(3)), false);
	// PRD-002.R15: a turn the CLI echoed a prompt for keeps that prompt's uuid, the latest a branch names.
	const echoed = turnEndRecord(3, { uuid: "u-9", sessionId: "s1" });
	assert.deepEqual(echoed, { kind: "meta", turn: 3, lastPromptUuid: "u-9", sessionId: "s1" });
	assert.equal(endedSession(echoed), false);
	assert.deepEqual(turnEndRecord(3, { uuid: "u-9", sessionId: null }), { kind: "meta", turn: 3, lastPromptUuid: "u-9" });
	assert.equal(endedSession({ kind: "meta", error: "Claude exited with code 1" }), true);
});

const waitingCard = (requestId) => ({ kind: "permission", requestId, phase: "waiting", outcome: null });

test("PRD-001.R16: a turn closing closes its open tool-step groups, in its continuations too, and leaves other turns' alone", () => {
	const steps1 = (open) => ({ kind: "steps", rows: [], open });
	let model = steps(EMPTY_MODEL, (m) => addUserMessage(m, prompt("One")), (m) => addBlock(m, steps1(true), 0)).model;
	model = steps(model, (m) => closeTurn(m, EMPTY_FOOTER, 0), (m) => addUserMessage(m, prompt("Two"))).model;
	model = steps(model, (m) => addBlock(m, steps1(true), 0), (m) => addUserMessage(m, prompt("Three")), (m) => addBlock(m, steps1(true), 0)).model;
	const closed = closeTurn(model, EMPTY_FOOTER, 0);
	const open = (item) => item.blocks.map((block) => block.open);
	assert.deepEqual(closed.model.items.filter((item) => item.kind === "turn").map(open), [[false], [false], [false]]);
	assert.deepEqual(
		closed.changes.map((change) => change.item.id),
		[model.items[3].id, model.items[5].id],
		"the second turn's head and its continuation"
	);
});

test("PRD-001.R16: a message added mid-turn closes the open group of the item it leaves", () => {
	const group = { kind: "steps", rows: [], open: true };
	for (const message of [prompt("Two"), prompt("!ls", "shell")]) {
		const before = steps(EMPTY_MODEL, (m) => addUserMessage(m, prompt("One")), (m) => addBlock(m, group, 0)).model;
		const after = addUserMessage(before, message).model;
		assert.equal(after.items[1].blocks[0].open, false, message.type);
	}
});

test("PRD-001.R16: a card holds the call's row it took out", () => {
	const { model } = steps(EMPTY_MODEL, (m) => addUserMessage(m, prompt("Hi")));
	const held = { parent: null, row: null, agent: null };
	assert.equal(addCard(model, waitingCard("r1"), 0, held).model.items[1].blocks[0].held, held);
	assert.equal(addCard(EMPTY_MODEL, waitingCard("r2"), 0, held).model.items[0].held, held);
	assert.equal(addCard(model, waitingCard("r3"), 0).model.items[1].blocks[0].held, null);
	const inTurn = addCard(model, waitingCard("r4"), 0, held);
	const settled = { ...waitingCard("r4"), phase: "settled", outcome: "Allowed" };
	assert.equal(patchCard(inTurn.model, inTurn.ref, settled).model.items[1].blocks[0].held, held, "kept by default");
	assert.equal(patchCard(inTurn.model, inTurn.ref, settled, null).model.items[1].blocks[0].held, null, "released once settled");
	const outside = addCard(EMPTY_MODEL, waitingCard("r5"), 0, held);
	assert.equal(patchCard(outside.model, outside.ref, settled, null).model.items[0].held, null);
});

test("PRD-002.R1: a card sits in the running turn, after a prompt sent mid-turn in its continuation, and at the end while no turn runs", () => {
	let { model } = steps(EMPTY_MODEL, (m) => addUserMessage(m, prompt("Hi")));
	const inTurn = addCard(model, waitingCard("r1"), 0);
	assert.deepEqual(shape(inTurn.model.items), ["prompt Hi", "turn 1 running: card"]);
	assert.deepEqual(inTurn.ref, { item: 2, block: 3 });
	assert.deepEqual(inTurn.changes.map((change) => change.type), ["changed"]);
	model = steps(inTurn.model, (m) => addUserMessage(m, prompt("More"))).model;
	const continued = addCard(model, waitingCard("r2"), 0);
	assert.deepEqual(shape(continued.model.items), ["prompt Hi", "turn 1 running: card", "prompt More (queued)", "cont 1: card"]);
	const idle = steps(continued.model, (m) => closeTurn(m, EMPTY_FOOTER, 0)).model;
	const outside = addCard(idle, waitingCard("r3"), 0);
	assert.deepEqual(shape(outside.model.items).slice(-1), ["card"]);
	assert.deepEqual(outside.ref, { item: outside.model.items.at(-1).id, block: null });
	assert.equal(outside.model.open, null, "a card opens no turn");
	assert.deepEqual(outside.changes.map((change) => change.type), ["added"]);
});

test("PRD-002.R1: a card changes where it is, in its turn or at the end; another ref changes nothing", () => {
	const { model } = steps(EMPTY_MODEL, (m) => addUserMessage(m, prompt("Hi")));
	const inTurn = addCard(model, waitingCard("r1"), 0);
	const settled = { ...waitingCard("r1"), phase: "settled", outcome: "Allowed" };
	const patched = patchCard(inTurn.model, inTurn.ref, settled);
	assert.equal(patched.model.items[1].blocks[0].card, settled);
	assert.deepEqual(patched.changes.map((change) => [change.type, change.item.id]), [["changed", 2]]);
	const outside = addCard(EMPTY_MODEL, waitingCard("r2"), 0);
	const top = patchCard(outside.model, outside.ref, settled);
	assert.equal(top.model.items[0].card, settled);
	assert.deepEqual(top.changes.map((change) => change.type), ["changed"]);
	assert.equal(patchCard(model, { item: 2, block: null }, settled).model, model, "a turn is no card");
	assert.equal(patchCard(model, { item: 2, block: 9 }, settled).model, model);
});

test("PRD-001.R20, PRD-002.R16: a panel command's card and a ! run's card go at the end, the running turn continuing after them", () => {
	const { model, changes } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addUserMessage(m, prompt("/status", "command")),
		(m) => addReport(m, "status"),
		(m) => addUserMessage(m, prompt("!ls", "shell")),
		(m) => addShell(m, "ls"),
		(m) => addBlock(m, text("after"), 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "turn 1 running: ", "command /status", "report", "shell !ls", "shell", "cont 1: after"]);
	assert.deepEqual(model.items[3], { kind: "report", id: 4, command: "status", state: "loading", report: null, error: null, markdown: null });
	assert.deepEqual(model.items[5], { kind: "shell", id: 6, command: "ls", result: null });
	assert.deepEqual(
		changes.filter((change) => change.type === "added").map((change) => change.item.kind),
		["prompt", "turn", "prompt", "report", "prompt", "shell", "turn"]
	);
});

test("PRD-001.R20: a card's change replaces it where it is, as one item change", () => {
	const added = addReport(EMPTY_MODEL, "mcp");
	const failed = { ...added.item, state: "failed", error: "Claude Code did not start - see the error above." };
	const step = updateItem(added.model, failed);
	assert.deepEqual(step.model.items, [failed]);
	assert.deepEqual(step.changes, [{ type: "changed", item: failed }]);
	assert.equal(step.model.lastId, added.model.lastId);
	const unknown = updateItem(added.model, { ...failed, id: 9 });
	assert.deepEqual([unknown.model, unknown.changes], [added.model, []]);
	const shell = addShell(added.model, "ls");
	const wrongKind = updateItem(shell.model, { ...failed, id: shell.item.id });
	assert.deepEqual(wrongKind.changes, [], "an item of another kind is not replaced");
});

test("PRD-002.R15: the last turn's prompts are the one that opened it and those queued into it, commands left out", () => {
	assert.deepEqual(lastTurnPrompts(EMPTY_MODEL), []);
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("Earlier")),
		(m) => closeTurn(m, EMPTY_FOOTER, 0),
		(m) => addNote(m, "note"),
		(m) => addUserMessage(m, prompt("One")),
		(m) => addUserMessage(m, prompt("/status", "command")),
		(m) => addUserMessage(m, prompt("Two"))
	);
	assert.deepEqual(
		lastTurnPrompts(model).map((item) => [item.text, item.queued]),
		[
			["One", false],
			["Two", true],
		]
	);
});

test("PRD-002.R15: a failed branch's prompts are marked not sent, each changed once, others left as they were", () => {
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("Earlier")),
		(m) => closeTurn(m, EMPTY_FOOTER, 0),
		(m) => addUserMessage(m, prompt("One")),
		(m) => addUserMessage(m, prompt("Two"))
	);
	const marked = markNotSent(model);
	assert.deepEqual(
		marked.model.items.filter((item) => item.kind === "prompt").map((item) => [item.text, item.notSent === true]),
		[
			["Earlier", false],
			["One", true],
			["Two", true],
		]
	);
	assert.deepEqual(
		marked.changes.map((change) => [change.type, change.item.text]),
		[
			["changed", "One"],
			["changed", "Two"],
		]
	);
	assert.deepEqual(markNotSent(EMPTY_MODEL).changes, []);
});

const COMPACTED = { phase: "compacted", trigger: "auto", percent: null, at: 1, preTokens: 9, postTokens: 3, summary: null };

test("PRD-001.R37: a compaction's divider goes at the end, outside the running turn, which continues after it", () => {
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addBlock(m, text("before"), 0),
		(m) => addCompaction(m, COMPACTED),
		(m) => addBlock(m, text("after"), 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "turn 1 running: before", "compaction", "cont 1: after"]);
});

test("PRD-001.R37: a divider changed in place fires item:<id> with its new data", () => {
	const added = addCompaction(EMPTY_MODEL, { ...COMPACTED, phase: "compacting", at: null });
	const next = { ...added.item, ...COMPACTED };
	const step = updateItem(added.model, next);
	assert.deepEqual(step.changes, [{ type: "changed", item: next }]);
	assert.equal(step.model.items[0].phase, "compacted");
});

test("PRD-001.R37: a divider added while the turn has no block goes before the turn, after the prompt", () => {
	const { model, changes } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("One")),
		(m) => addCompaction(m, COMPACTED),
		(m) => addBlock(m, text("after"), 0)
	);
	assert.deepEqual(shape(model.items), ["prompt One", "compaction", "turn 1 running: after"]);
	assert.deepEqual(
		changes.filter((c) => c.type === "removed"),
		[{ type: "removed", id: 2 }],
		"the empty turn leaves and comes back after the divider"
	);
});

test("PRD-001.R37: a turn that held only a compaction closes with no head and no footer", () => {
	const footer = { ...EMPTY_FOOTER, record: { kind: "meta", turn: 1 }, durationMs: 5 };
	const { model } = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("/compact", "prompt")),
		(m) => addCompaction(m, COMPACTED),
		(m) => closeTurn(m, footer, 0)
	);
	assert.deepEqual(shape(model.items), ["prompt /compact", "compaction"]);
	assert.equal(model.open, null);
});

test("PRD-001.R37: a compaction turn that ends in an error, or answered, keeps its turn", () => {
	const failed = steps(
		EMPTY_MODEL,
		(m) => addUserMessage(m, prompt("/compact", "prompt")),
		(m) => addCompaction(m, COMPACTED),
		(m) => closeTurn(m, { ...EMPTY_FOOTER, error: "boom" }, 0)
	);
	assert.deepEqual(shape(failed.model.items), ["prompt /compact", "compaction", "turn 1 footer: "]);
});

test("PRD-001.R38: an Undo removes the clear's divider and nothing else; another item's id removes nothing", () => {
	const hi = addUserMessage(EMPTY_MODEL, prompt("Hi"));
	const cleared = addClear(hi.model, { at: 5 });
	const gone = removeClear(cleared.model, cleared.item.id);
	assert.deepEqual(gone.changes, [{ type: "removed", id: cleared.item.id }]);
	assert.deepEqual(shape(gone.model.items), shape(hi.model.items));
	assert.deepEqual(removeClear(cleared.model, hi.model.items[0].id).changes, []);
	assert.deepEqual(removeClear(gone.model, cleared.item.id).changes, []);
});
