import { test } from "node:test";
import assert from "node:assert/strict";
import { ShellEscape } from "./.build/tab/shell-escape.mjs";
import { EMPTY_MODEL, shellStatus } from "./.build/state/tab.mjs";
import { addShell, addUserMessage, updateItem } from "./.build/state/turn.mjs";

/** A `ShellEscape` over a model and fakes of the tab's other parts. */
function escape(enableBashMode = true) {
	let model = EMPTY_MODEL;
	const seen = { records: [], taken: [], appended: [], counts: [] };
	const tab = {
		status: { profileId: "" },
		addPrompt(prompt) {
			const step = addUserMessage(model, prompt);
			model = step.model;
			return step.item;
		},
		addShell(command) {
			const step = addShell(model, command);
			model = step.model;
			return step.item;
		},
		card(id, kind) {
			const item = model.items.find((entry) => entry.id === id);
			return item?.kind === kind ? item : null;
		},
		updateItem(item) {
			model = updateItem(model, item).model;
		},
	};
	const shell = new ShellEscape({
		tab,
		recorder: { record: (message) => seen.records.push(message) },
		settings: () => ({ enableBashMode, cliProfiles: [], defaultProfileId: "" }),
		vaultPath: () => process.cwd(),
		takeText: (text) => seen.taken.push(text),
		appendToInput: (text) => seen.appended.push(text),
		countRun: (delta) => seen.counts.push(delta),
		follow: () => {},
	});
	return { shell, seen, items: () => model.items };
}

async function settled(seen) {
	while (seen.records.length === 0) await new Promise((resolve) => setTimeout(resolve, 10));
}

test("PRD-002.R16: a lone !, or a ! command with the escape off, goes to Claude as a message", () => {
	const on = escape();
	for (const text of ["!", "!   ", "ls", "explain !ls"]) assert.equal(on.shell.start(text), false, text);
	const off = escape(false);
	assert.equal(off.shell.start("!ls"), false);
	assert.deepEqual([on.seen.taken, off.seen.taken, on.items(), off.items()], [[], [], [], []]);
});

test("PRD-002.R16: a ! run shows its card running, then its result, and is recorded once it ends", async () => {
	const { shell, seen, items } = escape();
	assert.equal(shell.start("!echo hi"), true);
	assert.deepEqual(seen.taken, ["!echo hi"]);
	assert.deepEqual(
		items().map((item) => [item.kind, item.kind === "prompt" ? `${item.type} ${item.text}` : item.result]),
		[
			["prompt", "shell !echo hi"],
			["shell", null],
		],
		"running: the card has no result yet"
	);
	await settled(seen);
	const card = items()[1];
	assert.equal(card.result.stdout, "hi\n");
	assert.equal(shellStatus(card.result).label, "exit 0");
	assert.equal(seen.records.length, 1);
	assert.deepEqual({ ...seen.records[0], durationMs: 0 }, { kind: "bash", command: "echo hi", stdout: "hi\n", stderr: undefined, code: 0, timedOut: undefined, durationMs: 0 });
	assert.deepEqual(seen.counts, [1, -1], "counted while it ran");
});

test("PRD-002.R16: Add output to chat puts the command and its fenced output into the composer, unsent", () => {
	const { shell, seen } = escape();
	shell.addOutput({ command: "false", stdout: "", stderr: "", code: 1, timedOut: false, durationMs: 5, truncated: false });
	assert.equal(seen.appended.length, 1);
	assert.match(seen.appended[0], /^I ran `false` in the vault:\n\n```\n\(no output\)\n```\n\nExit code: 1$/);
});
