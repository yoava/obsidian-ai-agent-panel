import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addAgentMessage,
	addCardForCall,
	addStoredCall,
	addToolResults,
	addToolUse,
	agentStatusOf,
	agentView,
	closeGroup,
	editCounts,
	editStat,
	endProcess,
	groupHeader,
	headShown,
	landEdit,
	MARK_LABEL,
	reportAgent,
	rowMark,
	settleCardCall,
	settleTurnCalls,
} from "./.build/state/step-groups.mjs";
import { addBlock, addUserMessage, closeTurn, EMPTY_FOOTER, patchCard } from "./.build/state/turn.mjs";
import { EMPTY_MODEL, modelFromStored } from "./.build/state/tab.mjs";

// Message shapes as src/view.ts read them before DES-003 slice 9, not captured from a CLI.

/** A model with a prompt sent and its turn running. */
function running() {
	return addUserMessage(EMPTY_MODEL, { type: "prompt", text: "Go", contextName: null, images: [], sentAt: 0 }, 0).model;
}

const call = (id, name = "Read", input = { file_path: `${id}.md` }) => ({ id, name, input });
const use = (model, id, name, parent = null, now = 10) => addToolUse(model, call(id, name), parent, now).model;
const text = (model, value = "text") => addBlock(closeGroup(model, null).model, { kind: "text", text: value, streaming: false }, 0).model;
const outcome = (toolUseId, text = "ok", isError = false, images = []) => ({ toolUseId, isError, text, images });

/** A block as a line: groups by their rows' ids and marks, open or closed; agent rows with their threads. */
function blockShape(block) {
	if (block.kind === "steps") return `steps${block.open ? "+" : ""}[${block.rows.map((row) => `${row.toolUseId ?? row.name}:${row.status}`).join(" ")}]`;
	if (block.kind === "agent") {
		const thread = block.thread.map(blockShape).join(", ");
		return `agent ${block.toolUseId ?? "-"} ${block.status ?? "-"}${thread ? ` {${thread}}` : ""}`;
	}
	if (block.kind === "card") return `card ${block.card.toolUseId}`;
	return `${block.kind} ${block.text ?? ""}`.trim();
}

/** The model's turn items and other items, one line each. */
const shape = (model) =>
	model.items
		.filter((item) => item.kind !== "prompt")
		.map((item) => (item.kind === "turn" ? `turn: ${item.blocks.map(blockShape).join(", ")}` : blockShape(item)));

const card = (toolUseId, fields = {}) => ({
	kind: "permission",
	requestId: `r-${toolUseId}`,
	phase: "waiting",
	outcome: null,
	input: { file_path: `${toolUseId}.md` },
	toolUseId,
	fromAgent: false,
	toolName: "Read",
	title: "Allow Read?",
	icon: "shield-alert",
	description: null,
	summary: "",
	plan: null,
	fullInput: "{}",
	suggestions: null,
	gate: "none",
	diff: "none",
	always: false,
	...fields,
});
const settledCard = (waiting, outcome = "Allowed") => ({ ...waiting, phase: "settled", outcome });

/** The held row a model's card block carries. */
function heldOf(model, ref) {
	const item = model.items.find((entry) => entry.id === ref.item);
	return ref.block === null ? item.held : item.blocks.find((block) => block.id === ref.block).held;
}

/** A card waiting for `toolUseId`, then settled with `outcome`: the model after each, and its ref. */
function cardRound(model, waiting, outcomeLabel = "Allowed") {
	const added = addCardForCall(model, waiting, 20);
	const held = heldOf(added.model, added.ref);
	const done = settledCard(waiting, outcomeLabel);
	const patched = patchCard(added.model, added.ref, done).model;
	return { waitingModel: added.model, settled: settleCardCall(patched, done, held, 30).model };
}

test("PRD-001.R16: running rows join the open group; reply text closes it and the next call opens a new one", () => {
	let model = use(running(), "a");
	model = use(model, "b");
	model = text(model, "Found it.");
	model = use(model, "c");
	assert.deepEqual(shape(model), ["turn: steps[a:running b:running], text Found it., steps+[c:running]"]);
});

test("PRD-001.R16: thinking closes the open group", () => {
	let model = use(running(), "a");
	model = addBlock(closeGroup(model, null).model, { kind: "thinking", text: "Hm", streaming: false, startedAt: null, endedAt: null }, 0).model;
	model = use(model, "b");
	assert.deepEqual(shape(model), ["turn: steps[a:running], thinking Hm, steps+[b:running]"]);
});

test("PRD-001.R16, PRD-001.R18: a Task or Agent call closes the open group and adds an agent row; the next call opens a group", () => {
	let model = use(running(), "a");
	model = use(model, "task", "Task");
	model = use(model, "b");
	model = use(model, "agent", "Agent");
	assert.deepEqual(shape(model), ["turn: steps[a:running], agent task running, steps[b:running], agent agent running"]);
});

test("PRD-001.R16: the turn's result closes its open group, in a continuation too", () => {
	let model = use(running(), "a");
	model = addUserMessage(model, { type: "prompt", text: "More", contextName: null, images: [], sentAt: 0 }, 0).model;
	model = use(model, "b");
	model = closeTurn(model, EMPTY_FOOTER, 50).model;
	assert.deepEqual(shape(model), ["turn: steps[a:running]", "turn: steps[b:running]"]);
});

test("PRD-001.R16: a group opens at the end of the turn's last continuation, not in the item before a prompt", () => {
	let model = use(running(), "a");
	model = addUserMessage(model, { type: "prompt", text: "More", contextName: null, images: [], sentAt: 0 }, 0).model;
	model = use(model, "b");
	assert.deepEqual(shape(model), ["turn: steps[a:running]", "turn: steps+[b:running]"], "the prompt closed the group before it");
});

test("PRD-001.R16: a call already placed is not placed again", () => {
	const model = use(use(running(), "a"), "a");
	assert.deepEqual(shape(model), ["turn: steps+[a:running]"]);
});

test("PRD-001.R16: a card starting to wait takes its call's row out, closes the open group and sits in the turn; answered, the row is first in a new group", () => {
	let model = use(use(running(), "a"), "b");
	const { waitingModel, settled } = cardRound(model, card("b"));
	assert.deepEqual(shape(waitingModel), ["turn: steps[a:running], card b"]);
	assert.deepEqual(shape(settled), ["turn: steps[a:running], card b, steps+[b:running]"]);
	model = use(settled, "c");
	assert.deepEqual(shape(model), ["turn: steps[a:running], card b, steps+[b:running c:running]"]);
	const row = model.items[1].blocks[2].rows[0];
	assert.equal(row.startedAt, 30, "it runs from the answer");
});

test("PRD-001.R16: a group the card empties goes", () => {
	const { waitingModel } = cardRound(use(running(), "a"), card("a"));
	assert.deepEqual(shape(waitingModel), ["turn: card a"]);
});

test("PRD-001.R16: a tool_use whose card already waits gets no row; answered, the row comes from the card, and the late tool_use adds none", () => {
	const base = running();
	const added = addCardForCall(base, card("x"), 20);
	let model = use(added.model, "x");
	assert.deepEqual(shape(model), ["turn: card x"], "no row while the card waits");
	const done = settledCard(card("x"));
	model = settleCardCall(patchCard(model, added.ref, done).model, done, null, 30).model;
	assert.deepEqual(shape(model), ["turn: card x, steps+[x:running]"]);
	assert.deepEqual(model.items[1].blocks[1].rows[0].input, { file_path: "x.md" }, "the card's input");
	assert.deepEqual(shape(use(model, "x")), shape(model));
});

test("PRD-001.R16: a denied card still gives its call a row, which its result marks failed", () => {
	const { settled } = cardRound(use(running(), "a"), card("a"), "Denied");
	const model = addToolResults(settled, [outcome("a", "The user denied this action in Obsidian.", true)], 40).model;
	assert.deepEqual(shape(model), ["turn: card a, steps+[a:error]"]);
});

test("PRD-001.R16: a withdrawn card, one its session ended or one Stop and clear denied gives no row, before or after its tool_use", () => {
	for (const label of ["Cancelled", "Session ended", "Stopped"]) {
		const { settled } = cardRound(use(running(), "a"), card("a"), label);
		assert.deepEqual(shape(settled), ["turn: card a"], label);
		const added = addCardForCall(running(), card("b"), 20);
		const done = settledCard(card("b"), label);
		let model = settleCardCall(patchCard(added.model, added.ref, done).model, done, null, 30).model;
		model = use(model, "b");
		assert.deepEqual(shape(model), ["turn: card b"], `${label}, tool_use after`);
	}
});

test("PRD-001.R16: a card answered before its tool_use came makes that tool_use the first row of a new group", () => {
	let model = use(running(), "a");
	const added = addCardForCall(model, card("b", { fromAgent: true }), 20);
	const done = settledCard(card("b", { fromAgent: true }));
	model = settleCardCall(patchCard(added.model, added.ref, done).model, done, null, 30).model;
	assert.deepEqual(shape(model), ["turn: steps[a:running], card b"], "a subagent's call waits for its tool_use");
	model = use(model, "c");
	model = use(model, "b");
	assert.deepEqual(shape(model), ["turn: steps[a:running], card b, steps[c:running], steps+[b:running]"]);
});

test("PRD-001.R16, PRD-001.R18: a Task call's card, answered, adds an agent row and opens no group", () => {
	const taskCard = card("t", { toolName: "Task", input: { description: "Survey", subagent_type: "Explore" } });
	const added = addCardForCall(use(running(), "a"), taskCard, 20);
	const done = settledCard(taskCard);
	let model = settleCardCall(patchCard(added.model, added.ref, done).model, done, null, 30).model;
	model = use(model, "b");
	assert.deepEqual(shape(model), ["turn: steps[a:running], card t, agent t running, steps+[b:running]"]);
	assert.equal(model.items[1].blocks[2].description, "Survey");
});

test("PRD-001.R16: a card while no turn runs sits at the end and a main call's row does not open a turn", () => {
	const added = addCardForCall(EMPTY_MODEL, card("z"), 20);
	const done = settledCard(card("z"));
	const model = settleCardCall(patchCard(added.model, added.ref, done).model, done, null, 30).model;
	assert.deepEqual(shape(model), ["card z"]);
	assert.equal(model.open, null);
});

const subagent = (parent, content, extras = {}) => ({
	type: "assistant",
	session_id: "s",
	parent_tool_use_id: parent,
	message: { role: "assistant", content, model: "claude-haiku-4-5-20251001", usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 9000 } },
	...extras,
});
const toolUse = (id, name = "Read") => ({ type: "tool_use", id, name, input: { file_path: `${id}.md` } });

test("PRD-001.R18: a subagent's messages fill its thread, grouped by the same rules, and its running totals", () => {
	let model = use(running(), "task", "Task");
	model = addAgentMessage(model, "task", subagent("task", [{ type: "text", text: "Looking." }]), 11).model;
	model = addAgentMessage(model, "task", subagent("task", [toolUse("s1"), toolUse("s2", "Grep")]), 12).model;
	model = addAgentMessage(model, "task", subagent("task", [{ type: "thinking", thinking: "Then" }, toolUse("s3")]), 13).model;
	model = addAgentMessage(model, "task", subagent("task", [{ type: "text", text: "Done." }]), 14).model;
	assert.deepEqual(shape(model), [
		"turn: agent task running {text Looking., steps[s1:running s2:running], thinking Then, steps[s3:running], text Done.}",
	]);
	const agent = model.items[1].blocks[0];
	assert.equal(agent.toolUses, 3);
	assert.equal(agent.tokens, 4 * 125, "input, output and cache-creation tokens, not cache reads");
	assert.deepEqual(agent.models, ["claude-haiku-4-5-20251001"]);
	model = addToolResults(model, [outcome("s3")], 15).model;
	assert.equal(model.items[1].blocks[0].thread[3].rows[0].status, "done", "the thread's rows settle");
});

test("PRD-001.R18: a thread whose call is not in the messages shows its agent row on its own: in the running turn, else at the end", () => {
	const extras = { subagent_type: "Explore", task_description: "Map the notes" };
	let model = addAgentMessage(running(), "lost", subagent("lost", [{ type: "text", text: "Hi" }], extras), 11).model;
	assert.deepEqual(shape(model), ["turn: agent lost running {text Hi}"]);
	assert.equal(model.items[1].blocks[0].description, "Map the notes");
	model = addAgentMessage(EMPTY_MODEL, "alone", subagent("alone", [toolUse("s1")]), 11).model;
	assert.deepEqual(shape(model), ["agent alone running {steps+[s1:running]}"]);
	assert.equal(model.open, null, "no turn opens");
});

test("PRD-001.R16, PRD-001.R18: a subagent call's row leaves its thread while its card waits in the main turn, and returns first in a new group there", () => {
	let model = use(running(), "task", "Task");
	model = use(model, "a");
	model = addAgentMessage(model, "task", subagent("task", [toolUse("s1"), toolUse("s2")]), 12).model;
	const { waitingModel, settled } = cardRound(model, card("s2", { fromAgent: true }));
	assert.deepEqual(shape(waitingModel), ["turn: agent task running {steps+[s1:running]}, steps[a:running], card s2"]);
	assert.deepEqual(shape(settled), ["turn: agent task running {steps[s1:running], steps+[s2:running]}, steps[a:running], card s2"]);
});

test("PRD-001.R16: a subagent's call whose card was answered first is the first row of a new group in its thread", () => {
	let model = use(running(), "task", "Task");
	model = addAgentMessage(model, "task", subagent("task", [toolUse("s1")]), 12).model;
	const waiting = card("s2", { fromAgent: true });
	const added = addCardForCall(model, waiting, 20);
	const done = settledCard(waiting);
	model = settleCardCall(patchCard(added.model, added.ref, done).model, done, null, 30).model;
	model = addAgentMessage(model, "task", subagent("task", [toolUse("s2")]), 31).model;
	assert.deepEqual(shape(model), ["turn: agent task running {steps[s1:running], steps+[s2:running]}, card s2"]);
});

test("PRD-001.R16: a result marks its row done or failed, timed, cut to 1500 characters, with its images", () => {
	let model = use(use(running(), "a", "Read", null, 10), "b", "Bash", null, 11);
	const image = { mediaType: "image/png", data: "iVBORw0K" };
	model = addToolResults(model, [outcome("a", "x".repeat(2000), false, [image]), outcome("b", "boom", true)], 40).model;
	const [a, b] = model.items[1].blocks[0].rows;
	assert.equal(a.status, "done");
	assert.equal(a.endedAt, 40);
	assert.equal(a.result.length, 1500);
	assert.deepEqual(a.images, [image]);
	assert.equal(b.status, "error");
	assert.equal(b.result, "boom");
	assert.deepEqual([rowMark(a), rowMark(b)], ["done", "error"]);
	assert.deepEqual(MARK_LABEL, { running: "Running", done: "Done", error: "Failed" });
});

test("PRD-001.R16: a finished Glob, Grep or obsidian_search counts its result; a failed one does not", () => {
	let model = running();
	model = addToolUse(model, call("g", "Glob", { pattern: "*.md" }), null, 1).model;
	model = addToolUse(model, call("r", "Grep", { pattern: "TODO" }), null, 1).model;
	model = addToolUse(model, call("o", "mcp__obsidian__obsidian_search", { query: "tag:x" }), null, 1).model;
	model = addToolUse(model, call("f", "Grep", { pattern: "x" }), null, 1).model;
	model = addToolResults(
		model,
		[outcome("g", "a.md\nb.md\nc.md"), outcome("r", "Found 2 files\na.md\nb.md"), outcome("o", "9 note(s) matched `tag:x`."), outcome("f", "bad", true)],
		2
	).model;
	assert.deepEqual(model.items[1].blocks[0].rows.map((row) => row.count), ["3 files", "2 results", "9 notes", null]);
});

test("PRD-001.R18: an agent's call ending ends the agent and closes its thread's group, unless it runs in the background", () => {
	let model = use(use(running(), "fg", "Task"), "bg", "Task");
	model = addAgentMessage(model, "fg", subagent("fg", [toolUse("s1")]), 12).model;
	model = addToolResults(model, [outcome("fg", "Two notes."), outcome("bg", "Async agent launched")], 20, (id) => id === "bg").model;
	assert.deepEqual(shape(model), ["turn: agent fg done {steps[s1:running]}, agent bg running"]);
	assert.equal(model.items[1].blocks[0].endedAt, 20);
	const flagged = addToolUse(running(), call("bt", "Task", { description: "Watch", run_in_background: true }), null, 1).model;
	assert.equal(addToolResults(flagged, [outcome("bt")], 2).model.items[1].blocks[0].status, "running", "run_in_background");
	assert.equal(addToolResults(flagged, [outcome("bt", "no", true)], 2).model.items[1].blocks[0].status, "failed");
});

test("PRD-001.R18: task_notification replaces the running totals with the CLI's, and its status and duration", () => {
	let model = use(running(), "bg", "Task", null, 1000);
	model = addAgentMessage(model, "bg", subagent("bg", [toolUse("s1")]), 1100).model;
	model = reportAgent(model, "bg", { status: "completed", tokens: 4200, toolUses: 7, durationMs: 65_000 }, 2000).model;
	let agent = model.items[1].blocks[0];
	assert.deepEqual([agent.tokens, agent.toolUses, agent.durationMs, agent.status, agent.reported], [4200, 7, 65_000, "done", true]);
	assert.equal(agent.thread[0].open, false, "the thread's group closes");
	model = addAgentMessage(model, "bg", subagent("bg", [toolUse("s9")]), 2100).model;
	agent = model.items[1].blocks[0];
	assert.deepEqual([agent.tokens, agent.toolUses], [4200, 7], "reported totals stay");
	const partial = reportAgent(use(running(), "x", "Task"), "x", { status: "stopped", tokens: null, toolUses: null, durationMs: null }, 5).model;
	assert.equal(partial.items[1].blocks[0].status, "stopped");
	assert.deepEqual(["completed", "failed", "error", "killed", null].map(agentStatusOf), ["done", "failed", "failed", "stopped", "done"]);
});

test("PRD-001.R18: an agent row's label, type, model, tool count, tokens and elapsed time", () => {
	let model = addToolUse(running(), call("t", "Task", { description: "Survey the notes", subagent_type: "Explore" }), null, 1000).model;
	model = addAgentMessage(model, "t", subagent("t", [toolUse("s1")]), 1100).model;
	const agent = model.items[1].blocks[0];
	assert.deepEqual(agentView(agent, 43_000), {
		label: "Survey the notes",
		meta: ["Explore", "Haiku 4.5", "1 tool", "125 tokens"],
		elapsed: "42s",
		status: "running",
	});
	assert.equal(agentView({ ...agent, description: null }, 0).label, "Explore agent");
	assert.equal(agentView({ ...agent, description: null, subagentType: null }, 0).label, "Subagent");
	assert.equal(agentView({ ...agent, status: "done", durationMs: 185_000 }, 0).elapsed, "3m 05s");
	assert.equal(agentView({ ...agent, status: "done", endedAt: 5000 }, 0).elapsed, "4s");
	const long = addToolUse(running(), call("l", "Task", { description: "d".repeat(200) }), null, 1).model.items[1].blocks[0];
	assert.equal(long.description, `${"d".repeat(93)}…`, "cut as a summary is");
});

test("PRD-001.R16: one call shows no header; two or more show N steps, running while open, then error or done with the duration", () => {
	let model = use(running(), "a", "Read", null, 1000);
	assert.equal(groupHeader(model.items[1].blocks[0]), null);
	model = use(model, "b", "Read", null, 2000);
	assert.deepEqual(groupHeader(model.items[1].blocks[0]), { mark: "running", label: "2 steps", duration: null });
	model = addToolResults(model, [outcome("a"), outcome("b", "x", true)], 13_500).model;
	assert.deepEqual(groupHeader(model.items[1].blocks[0]), { mark: "running", label: "2 steps", duration: null }, "still open");
	model = closeGroup(model, null).model;
	assert.deepEqual(groupHeader(model.items[1].blocks[0]), { mark: "error", label: "2 steps", duration: "12s" });
	let other = use(use(running(), "c", "Read", null, 0), "d", "Read", null, 0);
	other = closeGroup(other, null).model;
	assert.deepEqual(groupHeader(other.items[1].blocks[0]), { mark: "running", label: "2 steps", duration: null }, "a row still runs");
	other = addToolResults(other, [outcome("c"), outcome("d")], 500).model;
	assert.deepEqual(groupHeader(other.items[1].blocks[0]), { mark: "done", label: "2 steps", duration: "0s" });
});

test("PRD-001.R16: a group shows its header once it has closed and no row runs, whatever its size", () => {
	let model = use(use(running(), "a"), "b");
	assert.equal(headShown(groupHeader(model.items[1].blocks[0])), false, "open: rows only");
	model = addToolResults(model, [outcome("a"), outcome("b")], 500).model;
	assert.equal(headShown(groupHeader(model.items[1].blocks[0])), false, "open still");
	const closed = closeGroup(model, null).model;
	assert.equal(headShown(groupHeader(closed.items[1].blocks[0])), true);
	const three = closeGroup(addToolResults(use(model, "c"), [outcome("c")], 600).model, null).model;
	assert.equal(headShown(groupHeader(three.items[1].blocks[0])), true, "three or more stay expanded: nothing collapses at close");
	const stillRunning = closeGroup(use(running(), "d"), null).model;
	assert.equal(headShown(groupHeader(stillRunning.items[1].blocks[0])), false, "one call has no header");
	assert.equal(headShown(null), false);
});

test("PRD-002.R6: a succeeded edit's row shows +x -y from the file as read to the file on disk, with both for its diff", () => {
	let model = addToolUse(running(), call("e", "Edit", { file_path: "n.md", old_string: "a", new_string: "b" }), null, 1).model;
	model = addToolResults(model, [outcome("e", "The file has been updated.")], 2).model;
	model = landEdit(model, "e", "one\ntwo\nthree\n", "one\n2\nthree\nfour\n").model;
	const row = model.items[1].blocks[0].rows[0];
	assert.deepEqual(row.edit, { added: 2, removed: 1 });
	assert.deepEqual(row.landed, { before: "one\ntwo\nthree\n", after: "one\n2\nthree\nfour\n" });
	assert.deepEqual(editStat(row), { added: "+2", removed: "-1" });
	assert.deepEqual(editStat({ ...row, edit: { added: 0, removed: 3 } }), { added: null, removed: "-3" });
	assert.deepEqual(editStat({ ...row, edit: null }), { added: null, removed: null });
});

test("PRD-002.R6: outside the vault an edit counts its own strings, and a call with nothing to diff counts nothing", () => {
	assert.deepEqual(editCounts("Edit", { file_path: "/x.md", old_string: "a", new_string: "b\nc" }, null, null), { added: 2, removed: 1 });
	assert.deepEqual(editCounts("Write", { file_path: "/x.md", content: "a\nb\n" }, null, null), { added: 2, removed: 0 });
	assert.equal(editCounts("Edit", {}, null, null), null);
});

test("PRD-001.R16, PRD-001.R18: the process ending closes every open group, in threads too, and stops a running agent", () => {
	let model = use(running(), "task", "Task");
	model = addAgentMessage(model, "task", subagent("task", [toolUse("s1")]), 12).model;
	model = use(model, "a");
	const step = endProcess(model, 99);
	assert.deepEqual(shape(step.model), ["turn: agent task stopped {steps[s1:unknown]}, steps[a:unknown]"]);
	assert.equal(step.model.items[1].blocks[0].endedAt, 99);
	assert.equal(step.changes.length, 1, "one changed item");
	assert.deepEqual(endProcess(step.model, 100).changes, [], "nothing left open or running");
	const alone = endProcess(addAgentMessage(EMPTY_MODEL, "bg", subagent("bg", [toolUse("s2")]), 1).model, 5).model;
	assert.deepEqual(shape(alone), ["agent bg stopped {steps[s2:unknown]}"]);
});

test("PRD-001.R16: reopened groups close only at stored text, thinking, Task or Agent calls and turn ends, with marks from isError and no times or counts", () => {
	const model = modelFromStored([
		{ kind: "user", text: "Go" },
		{ kind: "tool", name: "Glob", input: { pattern: "*.md" }, result: "a.md\nb.md", isError: false },
		{ kind: "tool", name: "Read", input: { file_path: "a.md" }, result: "nope", isError: true },
		{ kind: "tool", name: "Bash", input: { command: "ls" } },
		{ kind: "thinking", text: "Hm" },
		{ kind: "tool", name: "Read", input: { file_path: "b.md" }, result: "text" },
		{ kind: "tool", name: "Task", input: { description: "Survey" }, result: "done", isError: false },
		{ kind: "tool", name: "Edit", input: { file_path: "b.md", old_string: "a", new_string: "b" }, isError: false, added: 3, removed: 1 },
		{ kind: "assistant", text: "Done" },
		{ kind: "tool", name: "Read", input: { file_path: "c.md" }, isError: false },
		{ kind: "meta", turn: 1, durationMs: 10, costUsd: 0.01, sessionId: "s" },
	]);
	assert.deepEqual(shape(model), [
		"turn: steps[Glob:done Read:error Bash:unknown], thinking Hm, steps[Read:done], agent - done, steps[Edit:done], text Done, steps[Read:done]",
	]);
	const [group, , , agent, edit] = model.items[1].blocks;
	assert.deepEqual(groupHeader(group), { mark: "error", label: "3 steps", duration: null }, "no duration");
	assert.deepEqual(group.rows.map((row) => row.count), [null, null, null], "no counts");
	assert.equal(rowMark(group.rows[2]), null, "no outcome, no mark");
	assert.equal(agent.live, false);
	assert.equal(agentView(agent, 0).label, "Survey");
	assert.deepEqual(editStat(edit.rows[0]), { added: "+3", removed: "-1" });
	assert.equal(edit.rows[0].landed, null, "its details diff the tool's own strings");
});

test("PRD-001.R16: a reopened stored call outside any turn opens one, as live output does", () => {
	const step = addStoredCall(EMPTY_MODEL, { name: "Read", input: {} });
	assert.deepEqual(shape(step.model), ["turn: steps+[Read:unknown]"]);
});

test("PRD-001.R16: a subagent's tool_use that comes while its card waits is held by the card and returns, answered, first in a new group in its thread", () => {
	let model = use(running(), "task", "Task");
	model = addAgentMessage(model, "task", subagent("task", [toolUse("s1")]), 12).model;
	const waiting = card("s2", { fromAgent: true });
	const added = addCardForCall(model, waiting, 20);
	model = addAgentMessage(added.model, "task", subagent("task", [toolUse("s2")]), 21).model;
	assert.deepEqual(shape(model), ["turn: agent task running {steps+[s1:running]}, card s2"], "no row while it waits");
	const held = heldOf(model, added.ref);
	assert.equal(held.parent, "task");
	assert.equal(held.row.toolUseId, "s2");
	const done = settledCard(waiting);
	model = settleCardCall(patchCard(model, added.ref, done).model, done, held, 30).model;
	assert.deepEqual(shape(model), ["turn: agent task running {steps[s1:running], steps+[s2:running]}, card s2"]);
	const taskCard = card("t2", { toolName: "Task", fromAgent: true });
	const taskAdded = addCardForCall(running(), taskCard, 1);
	const withCall = addToolUse(taskAdded.model, call("t2", "Task", { description: "Nested" }), null, 2).model;
	assert.equal(heldOf(withCall, taskAdded.ref).agent.description, "Nested", "an agent row is held the same way");
});

test("PRD-001.R16, PRD-001.R18: a turn closing stops its agents that do not run in the background, ends its running rows and closes their groups", () => {
	let model = use(running(), "fg", "Task");
	model = addAgentMessage(model, "fg", subagent("fg", [toolUse("s1")]), 12).model;
	model = addToolUse(model, call("bg", "Task", { description: "Watch", run_in_background: true }), null, 13).model;
	model = addAgentMessage(model, "bg", subagent("bg", [toolUse("s2")]), 14).model;
	model = use(model, "task2", "Task");
	model = use(model, "a");
	model = settleTurnCalls(model, (id) => id === "task2", 50).model;
	assert.deepEqual(shape(model), [
		"turn: agent fg stopped {steps[s1:unknown]}, agent bg running {steps+[s2:running]}, agent task2 running, steps[a:unknown]",
	]);
	assert.equal(model.items[1].blocks[3].rows[0].endedAt, 50);
	assert.equal(settleTurnCalls(EMPTY_MODEL, () => false, 1).changes.length, 0, "no turn, nothing");
});

test("PRD-001.R16: the process ending ends every running row, so none spins on", () => {
	let model = use(running(), "a");
	model = addAgentMessage(model, "lost", subagent("lost", [toolUse("s1")]), 12).model;
	const ended = endProcess(model, 99).model;
	assert.deepEqual(shape(ended), ["turn: steps[a:unknown], agent lost stopped {steps[s1:unknown]}"]);
});

test("PRD-001.R16: a closed group whose calls have no outcome shows no mark; one with any done call shows done", () => {
	const reopened = modelFromStored([
		{ kind: "user", text: "Go" },
		{ kind: "tool", name: "Read", input: {} },
		{ kind: "tool", name: "Bash", input: {} },
		{ kind: "meta", turn: 1 },
	]);
	assert.deepEqual(groupHeader(reopened.items[1].blocks[0]), { mark: null, label: "2 steps", duration: null });
	const mixed = modelFromStored([
		{ kind: "user", text: "Go" },
		{ kind: "tool", name: "Read", input: {}, isError: false },
		{ kind: "tool", name: "Bash", input: {} },
		{ kind: "meta", turn: 1 },
	]);
	assert.equal(groupHeader(mixed.items[1].blocks[0]).mark, "done");
});

test("PRD-001.R18: a subagent's tool call whose input is not an object is drawn with an empty input", () => {
	const model = addAgentMessage(running(), "t", subagent("t", [{ type: "tool_use", id: "s1", name: "Read", input: ["x"] }]), 1).model;
	assert.deepEqual(model.items[1].blocks[0].thread[0].rows[0].input, {});
});

test("PRD-001.R16: a reopened Task or Agent call outside any turn opens one, as a reopened row does", () => {
	const step = addStoredCall(EMPTY_MODEL, { name: "Task", input: { description: "Survey" } });
	assert.deepEqual(shape(step.model), ["turn: agent - -"]);
});
