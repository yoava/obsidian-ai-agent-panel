import { test } from "node:test";
import assert from "node:assert/strict";
import {
	CHIP_ON_TOOLTIP,
	composerChips,
	composerView,
	appendText,
	escapeAction,
	fitChips,
	isCommandText,
	STOP_LABEL,
	withCommand,
} from "./.build/state/composer.mjs";

test("PRD-001.R35: a tab without messages shows the empty placeholder and Send, no Stop", () => {
	assert.deepEqual(composerView("idle", false), {
		placeholder: "Ask about your vault… (@ mentions a note, / runs a command)",
		sendLabel: "Send",
		waiting: false,
		stopShown: false,
	});
});

test("PRD-001.R11: an idle tab with messages shows the reply placeholder and Send, no Stop", () => {
	assert.deepEqual(composerView("idle", true), {
		placeholder: "Reply, or @ to mention a note…",
		sendLabel: "Send",
		waiting: false,
		stopShown: false,
	});
});

test("PRD-001.R11: a working or writing tab queues the next message and shows Stop", () => {
	for (const state of ["working", "writing"])
		for (const hasMessages of [true, false])
			assert.deepEqual(composerView(state, hasMessages), {
				placeholder: "Claude is working. Enter queues another message…",
				sendLabel: "Queue message",
				waiting: false,
				stopShown: true,
			});
	assert.equal(STOP_LABEL, "Stop Claude's turn (Esc)");
});

test("PRD-001.R11: a waiting tab marks the card waiting (dimmed), dims Queue message, which still sends, and shows Stop", () => {
	assert.deepEqual(composerView("waiting", true), {
		placeholder: "Claude is waiting for your answer above…",
		sendLabel: "Queue message",
		waiting: true,
		stopShown: true,
	});
});

test("PRD-001.R11: Escape interrupts only a running turn, outside IME composition, with no list or popover open", () => {
	const base = { composing: false, listOpen: false, popoverOpen: false, turnRunning: true };
	assert.equal(escapeAction(base), "interrupt");
	assert.equal(escapeAction({ ...base, composing: true }), "none");
	assert.equal(escapeAction({ ...base, listOpen: true }), "none");
	assert.equal(escapeAction({ ...base, turnRunning: false }), "none");
});

test("PRD-001.R11: Escape does not interrupt while a popover reports open", () => {
	const base = { composing: false, listOpen: false, popoverOpen: true, turnRunning: true };
	assert.equal(escapeAction(base), "none");
});

test("PRD-001.R11: the textarea is monospace while its text starts with /", () => {
	assert.equal(isCommandText("/compact"), true);
	assert.equal(isCommandText("/"), true);
	assert.equal(isCommandText(" /compact"), false);
	assert.equal(isCommandText("a/b"), false);
	assert.equal(isCommandText(""), false);
});

test("PRD-001.R20: a /help row puts /<name> and a space at the start of the composer, replacing a command typed there", () => {
	const known = ["compact", "review", "mcp"];
	assert.equal(withCommand("", "compact", known), "/compact ");
	assert.equal(withCommand("keep the plan", "compact", known), "/compact keep the plan");
	assert.equal(withCommand("/review 12", "compact", known), "/compact 12");
	assert.equal(withCommand("/REVIEW 12", "compact", known), "/compact 12", "in any case");
	assert.equal(withCommand("/", "mcp", known), "/mcp ");
	assert.equal(withCommand("/tmp/notes is a path", "compact", known), "/compact /tmp/notes is a path", "only a known command is replaced");
	assert.equal(withCommand("/comp", "compact", known), "/compact /comp");
});

const fit = (count, squeeze = false) => ({ count, squeeze });

test("PRD-001.R30: fitChips shows every chip when they all fit, with no +N", () => {
	assert.deepEqual(fitChips(200, 4, 30, [60, 60, 60]), fit(3), "60 + 4 + 60 + 4 + 60 = 188");
	assert.deepEqual(fitChips(188, 4, 30, [60, 60, 60]), fit(3), "an exact fit");
	assert.deepEqual(fitChips(100, 4, 30, []), fit(0));
});

test("PRD-001.R30: fitChips keeps room for +N after the chips that fit", () => {
	assert.deepEqual(fitChips(187, 4, 30, [60, 60, 60]), fit(2), "two and +N need 60 + 4 + 60 + 4 + 30 = 158; all three 188");
	assert.deepEqual(fitChips(158, 4, 30, [60, 60, 60, 60]), fit(2));
	assert.deepEqual(fitChips(157, 4, 30, [60, 60, 60, 60]), fit(1));
	assert.deepEqual(fitChips(150, 4, 30, [20, 200, 20]), fit(1), "the chips stay in order: a narrow one after a wide one waits");
});

test("PRD-001.R30: when not even the first chip fits beside +N it shows shrunk into the room left, while that room is +N's width", () => {
	assert.deepEqual(fitChips(93, 4, 30, [60, 60]), fit(1, true), "93 - 30 - 4 = 59 left for a 60 px chip");
	assert.deepEqual(fitChips(64, 4, 30, [117, 117]), fit(1, true), "30 px left: as wide as +N");
	assert.deepEqual(fitChips(63, 4, 30, [117, 117]), fit(0), "29 px left: +N alone");
	assert.deepEqual(fitChips(20, 4, 30, [60, 60]), fit(0));
	assert.deepEqual(fitChips(40, 4, 30, [60]), fit(1, true), "a lone chip needs no +N and takes the whole row");
	assert.deepEqual(fitChips(20, 4, 30, [60]), fit(1, true), "however narrow, and whatever +N measured before");
	assert.deepEqual(fitChips(0, 4, 0, [60]), fit(1, true));
});

const NO_CHIPS = { note: null, selection: null, folder: null, on: { note: false, folder: false, links: false }, attached: [], images: [] };

test("PRD-001.R12, R28: the note, folder and links & properties chips are on in the accent or offered, each named by its text and its tooltip", () => {
	const view = composerChips({ ...NO_CHIPS, note: "Q4 planning.md", folder: "Projects", on: { note: true, folder: false, links: false } });
	assert.equal(view.inline, false);
	assert.deepEqual(
		view.chips.map(({ slot, on, name, icon, tooltip, label }) => ({ slot, on, name, icon, tooltip, label })),
		[
			{ slot: "note", on: true, name: "Q4 planning.md", icon: "file-text", tooltip: CHIP_ON_TOOLTIP, label: `Q4 planning.md · ${CHIP_ON_TOOLTIP}` },
			{ slot: "folder", on: false, name: "Projects/", icon: "plus", tooltip: "Click to attach the active folder", label: "Projects/ · Click to attach the active folder" },
			{ slot: "links", on: false, name: "links & properties", icon: "plus", tooltip: "Click to attach links and properties", label: "links & properties · Click to attach links and properties" },
		]
	);
	assert.equal(CHIP_ON_TOOLTIP, "Sent with your message · click to leave out");
	const offered = composerChips({ ...NO_CHIPS, note: "Q4 planning.md" }).chips[0];
	assert.equal(offered.label, "Q4 planning.md · Click to attach the active note");
	assert.equal(offered.actionLabel, "Turn off Q4 planning.md");
});

test("PRD-001.R12: with lines selected in the note the note chip names them, the note and its lines following in its name", () => {
	const on = composerChips({ ...NO_CHIPS, note: "Q4.md", selection: { from: 12, to: 15 }, on: { note: true, folder: false, links: true } });
	const [note, links] = on.chips;
	assert.equal(note.name, "4 lines selected");
	assert.equal(note.icon, "file-text");
	assert.equal(note.label, `4 lines selected · Q4.md, lines 12-15 · ${CHIP_ON_TOOLTIP}`);
	assert.equal(note.actionLabel, "Turn off Q4.md");
	assert.equal(links.name, "links & properties");
	const one = composerChips({ ...NO_CHIPS, note: "Q4.md", selection: { from: 3, to: 3 } }).chips[0];
	assert.equal(one.name, "1 line selected");
	assert.equal(one.label, "1 line selected · Q4.md, line 3 · Click to attach the active note");
	assert.equal(composerChips({ ...NO_CHIPS, selection: { from: 1, to: 2 } }).chips.length, 0, "no note, no chip");
});

test("PRD-001.R12: with no chip on and nothing attached the chips row gives way to the inline offer chip", () => {
	assert.equal(composerChips({ ...NO_CHIPS, note: "a.md", folder: "F" }).inline, true);
	assert.equal(composerChips(NO_CHIPS).inline, true);
	assert.equal(composerChips({ ...NO_CHIPS, on: { note: true, folder: true, links: true } }).inline, true, "chips on with no note or folder to name");
	assert.equal(composerChips({ ...NO_CHIPS, note: "a.md", on: { note: false, folder: false, links: true } }).inline, false);
	assert.equal(composerChips({ ...NO_CHIPS, folder: "F", on: { note: false, folder: true, links: false } }).inline, false);
	assert.equal(composerChips({ ...NO_CHIPS, attached: [{ name: "b", path: "b.md", folder: false }] }).inline, false);
	assert.equal(composerChips({ ...NO_CHIPS, images: [{ name: "shot.png", bytes: 2048 }] }).inline, false);
});

test("PRD-001.R13, R14: images lead, attached items follow the context chips, each removable", () => {
	const view = composerChips({
		...NO_CHIPS,
		note: "a.md",
		on: { note: true, folder: false, links: false },
		attached: [
			{ name: "Ideas", path: "Notes/Ideas.md", folder: false },
			{ name: "Archive", path: "Archive", folder: true },
		],
		images: [{ name: "shot.png", bytes: 2048 }],
	});
	assert.deepEqual(
		view.chips.map(({ slot, index, on, name, icon, tooltip, actionLabel }) => ({ slot, index, on, name, icon, tooltip, actionLabel })),
		[
			{ slot: "image", index: 0, on: true, name: "shot.png", icon: null, tooltip: "shot.png (2 KB) · Sent with your message · click to view", actionLabel: "Remove shot.png" },
			{ slot: "note", index: -1, on: true, name: "a.md", icon: "file-text", tooltip: CHIP_ON_TOOLTIP, actionLabel: "Turn off a.md" },
			{ slot: "links", index: -1, on: false, name: "links & properties", icon: "plus", tooltip: "Click to attach links and properties", actionLabel: "Turn off links & properties" },
			{ slot: "file", index: 0, on: true, name: "Ideas", icon: "paperclip", tooltip: "Notes/Ideas.md · Sent with your message · click to open", actionLabel: "Remove Ideas" },
			{ slot: "folder-item", index: 1, on: true, name: "Archive/", icon: "folder", tooltip: "Archive/ · Sent with your message", actionLabel: "Remove Archive/" },
		]
	);
});

test("PRD-002.R15: text put back in the message box goes after what is there, a blank line between", () => {
	assert.equal(appendText("", "Unsent"), "Unsent");
	assert.equal(appendText("Typed since  \n", "Unsent"), "Typed since\n\nUnsent");
});
