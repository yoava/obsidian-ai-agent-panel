import { test } from "node:test";
import assert from "node:assert/strict";
import {
	answeredText,
	canSubmit,
	callProceeds,
	cardChrome,
	cardLocation,
	isPathLike,
	cardStep,
	cardToolName,
	CANCELLED_MESSAGE,
	DENIED_MESSAGE,
	DISMISSED_MESSAGE,
	emptySelections,
	ENDED_MESSAGE,
	formTitle,
	OUTCOME,
	permissionCard,
	pickOption,
	questionForm,
	typeOther,
} from "./.build/state/permission.mjs";

const request = (fields = {}) => ({
	requestId: "r1",
	toolName: "Edit",
	input: { file_path: "note.md", old_string: "a", new_string: "b" },
	...fields,
});
const card = (fields = {}, extra = {}) => permissionCard(request(fields), { gate: "none", diff: "none", ...extra });
const QUESTIONS = [
	{ question: "Where?", header: "Location", multiSelect: false, options: [{ label: "Templates/", description: "" }, { label: "Journal/", description: "x" }] },
	{ question: "Which sections?", header: "", multiSelect: true, options: [{ label: "Wins", description: "" }, { label: "Blockers", description: "" }, { label: "Focus", description: "" }] },
];
const form = (questions = QUESTIONS) =>
	questionForm(request({ toolName: "AskUserQuestion", input: { questions, other: 1 } }), questions);

/** Runs events in order; returns the last card and every reply given. */
function run(start, ...events) {
	let current = start;
	const replies = [];
	for (const event of events) {
		const step = cardStep(current, event);
		current = step.card;
		if (step.reply) replies.push(step.reply);
	}
	return { card: current, replies };
}

// --- The card's content (DES-004 Card contract) --------------------------------

test("PRD-002.R1: a card is titled by the vault-tool sentence, else Claude Code's title, else Allow <tool>?", () => {
	const vault = card({ toolName: "mcp__obsidian__obsidian_rename", input: { path: "a.md", newPath: "b.md" }, title: "CLI title" });
	assert.notEqual(vault.title, "CLI title");
	assert.notEqual(vault.icon, "shield-alert");
	assert.equal(card({ title: "Claude wants to edit note.md" }).title, "Claude wants to edit note.md");
	const plain = card();
	assert.equal(plain.title, "Edit note.md?");
	assert.equal(plain.icon, "pencil");
	assert.equal(card({ toolName: "Write", input: { file_path: "/v/Journal/new.md", content: "x" } }).title, "Write new.md?");
	assert.equal(card({ input: {} }).title, "Allow Edit?", "no file named: the generic title");
	assert.equal(card({ toolName: "unknown" }).title, "Allow unknown?");
	assert.equal(card({ toolName: "unknown" }).icon, "shield-alert");
	assert.equal(card({ toolName: "Bash", input: { command: "ls" } }).icon, "terminal");
});

test("PRD-002.R1: an edit card says the vault folder of its file once the read named it, else its summary", () => {
	const pre = (vaultPath) => ({ reported: "/v/x", vaultPath, before: "a" });
	assert.equal(cardLocation(card({}, { diff: pre("Journal/2026/Weekly review.md") })), "Journal/2026/");
	assert.equal(cardLocation(card({}, { diff: pre("note.md") })), "Vault root");
	assert.equal(cardLocation(card({}, { diff: pre(null) })), "note.md");
	assert.equal(cardLocation(card({}, { diff: "reading" })), "note.md");
	assert.equal(cardLocation(card({})), "note.md");
});

test("PRD-002.R12: an option label that is a path is set in the code font, words are not", () => {
	for (const label of ["Templates/", "Journal/Templates/", "Journal/2026/Weekly.md", "./notes", "/abs/dir", "~/vault"]) assert.equal(isPathLike(label), true, label);
	for (const label of ["Wins", "and/or", "Beside your templates", "", "/", "Next week's focus", "v1.2"]) assert.equal(isPathLike(label), false, label);
});

test("PRD-002.R1: a title or description that is not a string is not shown", () => {
	const odd = card({ title: { x: 1 }, description: 7 });
	assert.equal(odd.title, "Edit note.md?");
	assert.equal(odd.description, null);
	assert.equal(card({ description: "" }).description, null);
	assert.equal(card({ description: "Why it asks" }).description, "Why it asks");
});

test("PRD-002.R1: the summary is cut to 96 characters and Full input to 2000", () => {
	const long = card({ input: { file_path: "x".repeat(200), content: "y".repeat(5000) } });
	assert.equal(long.summary.length, 94);
	assert.ok(long.summary.endsWith("…"));
	assert.ok(long.fullInput.startsWith('{\n  "file_path"'));
	assert.equal(long.fullInput.length, 2000 + "\n…".length);
	assert.ok(long.fullInput.endsWith("\n…"));
	assert.equal(card().fullInput, JSON.stringify(request().input, null, 2));
});

test("PRD-002.R17: an ExitPlanMode card carries its whole plan; any other card none", () => {
	const plan = "# Plan\n\n" + "step\n".repeat(1000);
	assert.equal(card({ toolName: "ExitPlanMode", input: { plan } }).plan, plan);
	assert.equal(card({ toolName: "ExitPlanMode", input: { plan: "  " } }).plan, null);
	assert.equal(card({ input: { plan } }).plan, null);
});

test("PRD-002.R2: Always allow is offered only when the CLI sent suggestions", () => {
	const suggestions = [{ type: "addRules" }];
	assert.equal(card({ suggestions }).suggestions, suggestions);
	assert.equal(card({ suggestions: [] }).suggestions, null);
	assert.equal(card().suggestions, null);
});

// --- The card machine (DES-003 Permission card and question form) --------------

test("PRD-002.R1: Allow answers allow with the input unchanged and settles the card Allowed", () => {
	const start = card();
	const { card: settled, replies } = run(start, { type: "allow" });
	assert.deepEqual(replies, [{ behavior: "allow", updatedInput: start.input }]);
	assert.equal(replies[0].updatedInput, start.input, "the same object");
	assert.equal(settled.phase, "settled");
	assert.equal(settled.outcome, "Allowed");
});

test("PRD-002.R2: Always allow answers allow with the suggestions unchanged and settles Always allowed", () => {
	const suggestions = [{ type: "addRules", rules: [{ toolName: "Edit" }] }];
	const start = card({ suggestions });
	const { card: settled, replies } = run(start, { type: "always-allow" });
	assert.deepEqual(replies, [{ behavior: "allow", updatedInput: start.input, updatedPermissions: suggestions }]);
	assert.equal(replies[0].updatedPermissions, suggestions);
	assert.equal(settled.outcome, "Always allowed");
	assert.deepEqual(run(card(), { type: "always-allow" }).replies, [], "no suggestions, no Always allow");
});

test("PRD-002.R1: Deny answers with the denial and settles the card Denied", () => {
	const { card: settled, replies } = run(card(), { type: "deny" });
	assert.deepEqual(replies, [{ behavior: "deny", message: "The user denied this action in Obsidian." }]);
	assert.equal(DENIED_MESSAGE, "The user denied this action in Obsidian.");
	assert.equal(settled.outcome, "Denied");
});

test("PRD-002.R3: a withdrawn card settles Cancelled and an ended one Session ended, each answered as a denial", () => {
	const cancelled = run(card(), { type: "cancelled" });
	assert.equal(cancelled.card.outcome, "Cancelled");
	assert.deepEqual(cancelled.replies, [{ behavior: "deny", message: CANCELLED_MESSAGE }]);
	const ended = run(card(), { type: "ended" });
	assert.equal(ended.card.outcome, "Session ended");
	assert.deepEqual(ended.replies, [{ behavior: "deny", message: "The agent session ended before this was answered." }]);
	assert.equal(ENDED_MESSAGE, "The agent session ended before this was answered.");
});

test("PRD-002.R1: a settled card ignores every later event, so it is answered once", () => {
	const suggestions = [{ type: "addRules" }];
	for (const first of ["allow", "always-allow", "deny", "cancelled", "ended"]) {
		const settled = run(card({ suggestions }), { type: first });
		const after = run(
			settled.card,
			{ type: "allow" },
			{ type: "always-allow" },
			{ type: "deny" },
			{ type: "read-settled" },
			{ type: "cancelled" },
			{ type: "ended" }
		);
		assert.equal(after.card, settled.card, first);
		assert.deepEqual(after.replies, [], first);
	}
});

test("PRD-002.R1: settled, the outcome label replaces the buttons and the waiting highlight goes", () => {
	assert.deepEqual(cardChrome(card()), { highlight: true, buttons: "enabled", outcome: null });
	const labels = {
		allow: OUTCOME.allowed,
		"always-allow": OUTCOME.alwaysAllowed,
		deny: OUTCOME.denied,
		cancelled: OUTCOME.cancelled,
		ended: OUTCOME.ended,
	};
	assert.deepEqual(Object.values(labels), ["Allowed", "Always allowed", "Denied", "Cancelled", "Session ended"]);
	for (const [event, label] of Object.entries(labels))
		assert.deepEqual(cardChrome(run(card({ suggestions: [{}] }), { type: event }).card), { highlight: false, buttons: null, outcome: label }, event);
	for (const [event, label] of [["dismiss", "Dismissed"], ["cancelled", "Cancelled"], ["ended", "Session ended"]])
		assert.deepEqual(cardChrome(run(form(), { type: event }).card), { highlight: false, buttons: null, outcome: label }, event);
});

test("PRD-002.R6: Allow while the pre-edit read is pending answers nothing and disables the buttons, until the read settles", () => {
	const start = card({}, { gate: "pending" });
	const pressed = run(start, { type: "allow" });
	assert.deepEqual(pressed.replies, []);
	assert.equal(pressed.card.phase, "answering");
	assert.deepEqual(cardChrome(pressed.card), { highlight: true, buttons: "disabled", outcome: null });
	assert.deepEqual(run(pressed.card, { type: "allow" }, { type: "deny" }).replies, [], "the buttons are disabled");
	const answered = run(pressed.card, { type: "read-settled" });
	assert.deepEqual(answered.replies, [{ behavior: "allow", updatedInput: start.input }]);
	assert.equal(answered.card.outcome, "Allowed");
	assert.deepEqual(cardChrome(answered.card), { highlight: false, buttons: null, outcome: "Allowed" });
});

test("PRD-002.R6: Always allow while the read is pending answers with the suggestions once it settles", () => {
	const suggestions = [{ type: "addRules" }];
	const start = card({ suggestions }, { gate: "pending" });
	const { card: settled, replies } = run(start, { type: "always-allow" }, { type: "read-settled" });
	assert.deepEqual(replies, [{ behavior: "allow", updatedInput: start.input, updatedPermissions: suggestions }]);
	assert.equal(settled.outcome, "Always allowed");
});

test("PRD-002.R6: once the read settled, Allow answers at once; Deny never waits", () => {
	const read = run(card({}, { gate: "pending" }), { type: "read-settled" });
	assert.deepEqual(read.replies, []);
	assert.equal(read.card.phase, "waiting");
	assert.equal(run(read.card, { type: "allow" }).replies.length, 1);
	const denied = run(card({}, { gate: "pending" }), { type: "deny" });
	assert.deepEqual(denied.replies, [{ behavior: "deny", message: DENIED_MESSAGE }]);
	assert.equal(denied.card.outcome, "Denied");
});

test("PRD-002.R6: an answering card withdrawn or ended settles as such, and its read settling later answers nothing", () => {
	for (const [event, label] of [["cancelled", "Cancelled"], ["ended", "Session ended"]]) {
		const { card: settled, replies } = run(card({}, { gate: "pending" }), { type: "allow" }, { type: event }, { type: "read-settled" });
		assert.equal(settled.outcome, label);
		assert.equal(replies.length, 1);
		assert.equal(replies[0].behavior, "deny");
	}
});

// --- The question form -----------------------------------------------------------

test("PRD-002.R12: the form is titled Claude has a question, or Claude has questions when it holds several", () => {
	assert.equal(formTitle(QUESTIONS.slice(0, 1)), "Claude has a question");
	assert.equal(formTitle(QUESTIONS), "Claude has questions");
});

test("PRD-002.R12: N of M answered counts the questions with an option or Other text", () => {
	let sel = emptySelections(QUESTIONS);
	assert.equal(answeredText(QUESTIONS, sel), "0 of 2 answered");
	sel = [pickOption(sel[0], QUESTIONS[0], 1, true), sel[1]];
	assert.equal(answeredText(QUESTIONS, sel), "1 of 2 answered");
	sel = [sel[0], typeOther(sel[1], QUESTIONS[1], "   ")];
	assert.equal(answeredText(QUESTIONS, sel), "1 of 2 answered", "blank Other text is no answer");
	sel = [sel[0], typeOther(sel[1], QUESTIONS[1], "Notes")];
	assert.equal(answeredText(QUESTIONS, sel), "2 of 2 answered");
});

test("PRD-002.R12: Submit is enabled only once every question has an answer", () => {
	let sel = emptySelections(QUESTIONS);
	assert.equal(canSubmit(QUESTIONS, sel), false);
	sel = [pickOption(sel[0], QUESTIONS[0], 0, true), sel[1]];
	assert.equal(canSubmit(QUESTIONS, sel), false);
	sel = [sel[0], pickOption(sel[1], QUESTIONS[1], 2, true)];
	assert.equal(canSubmit(QUESTIONS, sel), true);
	sel = [sel[0], pickOption(sel[1], QUESTIONS[1], 2, false)];
	assert.equal(canSubmit(QUESTIONS, sel), false);
});

test("PRD-002.R12: a single-select question keeps one answer: an option clears the Other text, Other text the option", () => {
	const q = QUESTIONS[0];
	let sel = typeOther(emptySelections([q])[0], q, "Elsewhere");
	sel = pickOption(sel, q, 0, true);
	assert.deepEqual(sel, { picked: [0], other: "" });
	sel = pickOption(sel, q, 1, true);
	assert.deepEqual(sel, { picked: [1], other: "" });
	assert.deepEqual(typeOther(sel, q, "  "), { picked: [1], other: "  " }, "blank text keeps the option");
	assert.deepEqual(typeOther(sel, q, "Inbox/"), { picked: [], other: "Inbox/" });
});

test("PRD-002.R12: a multi-select question keeps every option picked and the Other text", () => {
	const q = QUESTIONS[1];
	let sel = emptySelections([q])[0];
	sel = pickOption(sel, q, 2, true);
	sel = pickOption(sel, q, 0, true);
	sel = pickOption(sel, q, 0, true);
	sel = typeOther(sel, q, "Energy");
	assert.deepEqual(sel, { picked: [2, 0], other: "Energy" });
	assert.deepEqual(pickOption(sel, q, 2, false), { picked: [0], other: "Energy" });
});

test("PRD-002.R12: Submit answers allow with the input and its answers, each joined by a comma, labelled Answered:", () => {
	const start = form();
	let sel = emptySelections(QUESTIONS);
	sel = [pickOption(sel[0], QUESTIONS[0], 1, true), sel[1]];
	sel = [sel[0], typeOther(pickOption(pickOption(sel[1], QUESTIONS[1], 2, true), QUESTIONS[1], 0, true), QUESTIONS[1], " Energy ")];
	const { card: settled, replies } = run(start, { type: "submit", selections: sel });
	assert.deepEqual(replies, [
		{
			behavior: "allow",
			updatedInput: { questions: QUESTIONS, other: 1, answers: { "Where?": "Journal/", "Which sections?": "Wins, Focus, Energy" } },
		},
	]);
	assert.equal(settled.phase, "settled");
	assert.equal(settled.outcome, "Answered: Journal/ · Wins, Focus, Energy");
});

test("PRD-002.R12: Submit before every question has an answer changes nothing", () => {
	const start = form();
	const sel = [pickOption(emptySelections(QUESTIONS)[0], QUESTIONS[0], 0, true), { picked: [], other: " " }];
	const after = run(start, { type: "submit", selections: sel });
	assert.equal(after.card, start);
	assert.deepEqual(after.replies, []);
});

test("PRD-002.R12: Dismiss answers with the dismissal and settles the form Dismissed", () => {
	const { card: settled, replies } = run(form(), { type: "dismiss" });
	assert.deepEqual(replies, [{ behavior: "deny", message: "The user dismissed the question without answering." }]);
	assert.equal(DISMISSED_MESSAGE, "The user dismissed the question without answering.");
	assert.equal(settled.outcome, "Dismissed");
});

test("PRD-002.R3: a form withdrawn or ended settles Cancelled or Session ended, answered as a denial", () => {
	assert.deepEqual(run(form(), { type: "cancelled" }).replies, [{ behavior: "deny", message: CANCELLED_MESSAGE }]);
	assert.deepEqual(run(form(), { type: "ended" }).replies, [{ behavior: "deny", message: ENDED_MESSAGE }]);
});

test("PRD-002.R12: a form takes only Submit and Dismiss, a card only Allow, Always allow and Deny", () => {
	const start = form();
	assert.equal(run(start, { type: "allow" }, { type: "always-allow" }, { type: "deny" }).card, start);
	const plain = card({ suggestions: [{}] });
	assert.equal(run(plain, { type: "dismiss" }, { type: "submit", selections: [] }).card, plain);
	assert.deepEqual(cardChrome(start), { highlight: true, buttons: "enabled", outcome: null });
});

test("PRD-001.R16: a card or form names its call's tool_use id, and whether a subagent asked", () => {
	assert.equal(card({ toolUseId: "toolu_1" }).toolUseId, "toolu_1");
	assert.equal(card().toolUseId, null);
	assert.equal(card({ toolUseId: 7 }).toolUseId, null, "the client passes it unchecked");
	assert.equal(card().fromAgent, false);
	assert.equal(card({ agentId: "agent-7" }).fromAgent, true);
	assert.equal(questionForm(request({ toolUseId: "toolu_2", agentId: "a" }), QUESTIONS).toolUseId, "toolu_2");
	assert.equal(cardToolName(card()), "Edit");
	assert.equal(cardToolName(form()), "AskUserQuestion");
});

test("PRD-001.R16: a call runs once its card is answered, denied or dismissed, not once withdrawn, ended or denied by Stop and clear", () => {
	assert.equal(callProceeds(card()), false, "still waiting");
	for (const event of ["allow", "deny"]) assert.equal(callProceeds(run(card(), { type: event }).card), true, event);
	assert.equal(callProceeds(run(form(), { type: "dismiss" }).card), true);
	for (const event of ["cancelled", "ended", "clearing"]) assert.equal(callProceeds(run(card(), { type: event }).card), false, event);
});
