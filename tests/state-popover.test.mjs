import { test } from "node:test";
import assert from "node:assert/strict";
import { CLOSED, HOVER_DELAY_MS, HOVER_IDLE, POPOVER_EDGE, POPOVER_GAP, controlUnder, hoverStep, lostTrigger, opensDown, placeAbove, placeBelow, placeInline, pointerMoved, popoverStep, returnedFromInner } from "./.build/state/popover.mjs";

// Triggers are compared by identity; any object does.
const model = { name: "model segment" };
const effort = { name: "effort segment" };
const open = (trigger = model, focus = null) => popoverStep(CLOSED, { type: "activate", id: "model-effort", trigger, focus }).state;

test("PRD-001.R32: activating a trigger opens its popover with focus on the first control", () => {
	const step = popoverStep(CLOSED, { type: "activate", id: "model-effort", trigger: model });
	assert.deepEqual(step, { state: { open: true, id: "model-effort", trigger: model, focus: null }, focus: "target" });
	assert.equal(step.state.trigger, model);
});

test("PRD-001.R32: a trigger can name the control that takes focus (PRD-001.R23's effort control)", () => {
	const step = popoverStep(CLOSED, { type: "activate", id: "model-effort", trigger: effort, focus: "effort" });
	assert.deepEqual(step, { state: { open: true, id: "model-effort", trigger: effort, focus: "effort" }, focus: "target" });
});

test("PRD-001.R32: another trigger opens its popover in place of the open one", () => {
	const step = popoverStep(open(model), { type: "activate", id: "permission", trigger: effort });
	assert.deepEqual(step, { state: { open: true, id: "permission", trigger: effort, focus: null }, focus: "target" });
});

test("PRD-001.R32: the open popover's own trigger closes it and takes focus", () => {
	assert.deepEqual(popoverStep(open(model), { type: "activate", id: "model-effort", trigger: model }), {
		state: CLOSED,
		focus: "trigger",
	});
});

test("PRD-001.R32: a pointer down on the open popover's own trigger or inside it changes nothing", () => {
	const state = open(model);
	for (const on of ["trigger", "popover"])
		assert.deepEqual(popoverStep(state, { type: "pointerdown", on }), { state, focus: "stay" }, on);
	assert.equal(popoverStep(state, { type: "pointerdown", on: "trigger" }).state, state, "the same state");
});

test("PRD-001.R32: Escape or a pick closes the popover and returns focus to its trigger", () => {
	for (const type of ["escape", "pick"])
		assert.deepEqual(popoverStep(open(), { type }), { state: CLOSED, focus: "trigger" }, type);
});

test("PRD-001.R32: a pointer down outside the popover and its trigger closes it and leaves focus where it went", () => {
	assert.deepEqual(popoverStep(open(), { type: "pointerdown", on: "outside" }), { state: CLOSED, focus: "stay" });
});

test("PRD-001.R32: focus moving outside the popover, other than to its trigger, closes it and stays there", () => {
	assert.deepEqual(popoverStep(open(), { type: "focus", to: "outside" }), { state: CLOSED, focus: "stay" });
	const state = open();
	for (const to of ["popover", "trigger"])
		assert.deepEqual(popoverStep(state, { type: "focus", to }), { state, focus: "stay" }, to);
});

test("PRD-001.R32: focus leaving to nothing keeps the popover open and moves focus to its dialog", () => {
	const state = open();
	assert.deepEqual(popoverStep(state, { type: "focus", to: "nothing" }), { state, focus: "dialog" });
});

test("PRD-001.R32: the trigger leaving the DOM or being hidden, or a tab switch, closes it, focus to the composer only from inside", () => {
	for (const type of ["trigger-removed", "trigger-hidden", "tab-changed"]) {
		assert.deepEqual(popoverStep(open(), { type, focusInside: true }), { state: CLOSED, focus: "composer" }, type);
		assert.deepEqual(popoverStep(open(), { type, focusInside: false }), { state: CLOSED, focus: "stay" }, type);
	}
});

test("PRD-001.R7: a tab switch leaves open a popover whose content keeps it open, focus where it is", () => {
	const state = open();
	assert.deepEqual(popoverStep(state, { type: "tab-changed", focusInside: true, keepOpen: true }), { state, focus: "stay" });
	assert.deepEqual(popoverStep(state, { type: "tab-changed", focusInside: true, keepOpen: false }), { state: CLOSED, focus: "composer" });
});

test("PRD-001.R32: a trigger that left the DOM or no longer shows, by any rule, closes its popover", () => {
	assert.equal(lostTrigger(false, false), "trigger-removed");
	assert.equal(lostTrigger(false, true), "trigger-removed", "a detached element is removed, whatever it reports");
	assert.equal(lostTrigger(true, false), "trigger-hidden", "a fit step or the 360 px rule hid it");
	assert.equal(lostTrigger(true, true), null);
});

test("PRD-001.R32: with no popover open only a trigger does anything", () => {
	for (const event of [
		{ type: "pointerdown", on: "outside" },
		{ type: "pointerdown", on: "trigger" },
		{ type: "escape" },
		{ type: "pick" },
		{ type: "focus", to: "outside" },
		{ type: "focus", to: "nothing" },
		{ type: "trigger-removed", focusInside: true },
		{ type: "trigger-hidden", focusInside: true },
		{ type: "tab-changed", focusInside: true },
	])
		assert.deepEqual(popoverStep(CLOSED, event), { state: CLOSED, focus: "stay" }, event.type);
});

// --- Hover card ---------------------------------------------------------------

const usage = { name: "plan-usage segment" };
const context = { name: "context segment" };
const armed = (el = usage) => hoverStep(HOVER_IDLE, { type: "enter", el });
const shownBy = (by, el = usage) =>
	by === "pointer" ? hoverStep(armed(el), { type: "elapsed", el }) : hoverStep(HOVER_IDLE, { type: "focus", el });

test("PRD-001.R32: a hover card waits 500 ms of pointer rest", () => {
	assert.equal(HOVER_DELAY_MS, 500);
	assert.deepEqual(armed(), { phase: "armed", el: usage });
	assert.deepEqual(hoverStep(armed(), { type: "elapsed", el: usage }), { phase: "shown", el: usage, by: "pointer" });
});

test("PRD-001.R32: the pointer leaving an armed or pointer-shown element drops its card", () => {
	assert.deepEqual(hoverStep(armed(), { type: "leave", el: usage }), HOVER_IDLE);
	assert.deepEqual(hoverStep(shownBy("pointer"), { type: "leave", el: usage }), HOVER_IDLE);
});

test("PRD-001.R32: keyboard focus shows the card at once, whatever the pointer did", () => {
	for (const state of [HOVER_IDLE, armed(), armed(context), shownBy("pointer"), shownBy("pointer", context)])
		assert.deepEqual(hoverStep(state, { type: "focus", el: usage }), { phase: "shown", el: usage, by: "focus" });
});

test("PRD-001.R32: a card shown by focus stays while the pointer leaves its element, and goes on blur", () => {
	const state = shownBy("focus");
	for (const event of [
		{ type: "leave", el: usage },
		{ type: "enter", el: usage },
		{ type: "control", el: usage },
		{ type: "elapsed", el: usage },
		{ type: "blur", el: context },
	])
		assert.equal(hoverStep(state, event), state, event.type);
	assert.deepEqual(hoverStep(state, { type: "blur", el: usage }), HOVER_IDLE);
});

// Any interactive element of the panel that is not a hover-card element: a button, a segment, a row.
const button = { name: "send button" };

test("PRD-001.R32: the pointer reaching another control drops any card at once, one shown by focus too", () => {
	for (const state of [armed(), shownBy("pointer"), shownBy("focus")]) {
		assert.deepEqual(hoverStep(state, { type: "control", el: button }), HOVER_IDLE, `${state.phase}: a plain control`);
		assert.deepEqual(hoverStep(state, { type: "control", el: context }), HOVER_IDLE, `${state.phase}: another card's element`);
		assert.equal(hoverStep(state, { type: "control", el: usage }), state, `${state.phase}: its own element`);
	}
	assert.equal(hoverStep(HOVER_IDLE, { type: "control", el: button }), HOVER_IDLE);
	assert.equal(hoverStep(BLOCKED, { type: "control", el: button }), BLOCKED);
});

test("PRD-001.R32: the pointer entering another hover-card element drops a card shown by focus and arms that one", () => {
	assert.deepEqual(hoverStep(shownBy("focus"), { type: "enter", el: context }), { phase: "armed", el: context });
	const dropped = hoverStep(shownBy("focus"), { type: "control", el: context });
	assert.deepEqual(hoverStep(dropped, { type: "enter", el: context }), { phase: "armed", el: context }, "control, then enter");
});

const BLOCKED = { phase: "blocked" };

test("PRD-001.R32: a popover opening or the element leaving the DOM drops the card", () => {
	for (const state of [HOVER_IDLE, armed(), shownBy("pointer"), shownBy("focus")]) {
		assert.deepEqual(hoverStep(state, { type: "popover-opened" }), BLOCKED, state.phase);
		if (state.phase === "idle") continue;
		assert.deepEqual(hoverStep(state, { type: "removed", el: usage }), HOVER_IDLE, state.phase);
		assert.equal(hoverStep(state, { type: "removed", el: context }), state, "another element leaving changes nothing");
	}
});

test("PRD-001.R32: while a popover is open no card arms or shows, until it closes", () => {
	for (const event of [
		{ type: "enter", el: usage },
		{ type: "elapsed", el: usage },
		{ type: "leave", el: usage },
		{ type: "focus", el: usage },
		{ type: "blur", el: usage },
		{ type: "removed", el: usage },
		{ type: "popover-opened" },
	])
		assert.equal(hoverStep(BLOCKED, event), BLOCKED, event.type);
	assert.deepEqual(hoverStep(BLOCKED, { type: "popover-closed" }), HOVER_IDLE);
	const state = armed();
	assert.equal(hoverStep(state, { type: "popover-closed" }), state, "a close with none open changes nothing");
});

test("PRD-001.R32: focus a closing popover returns to its trigger shows no card", () => {
	assert.equal(hoverStep(HOVER_IDLE, { type: "focus", el: usage, returned: true }), HOVER_IDLE);
	const state = armed();
	assert.equal(hoverStep(state, { type: "focus", el: usage, returned: true }), state);
});

test("PRD-001.R32: the pointer moving to another element arms that one", () => {
	assert.deepEqual(hoverStep(armed(), { type: "enter", el: context }), { phase: "armed", el: context });
	assert.deepEqual(hoverStep(shownBy("pointer"), { type: "enter", el: context }), { phase: "armed", el: context });
	const state = armed();
	assert.equal(hoverStep(state, { type: "enter", el: usage }), state, "re-entering keeps the running delay");
	const shown = shownBy("pointer");
	assert.equal(hoverStep(shown, { type: "enter", el: usage }), shown);
});

test("PRD-001.R32: a delay or leave for another element changes nothing", () => {
	const state = armed();
	assert.equal(hoverStep(state, { type: "elapsed", el: context }), state);
	assert.equal(hoverStep(state, { type: "leave", el: context }), state);
	assert.equal(hoverStep(state, { type: "blur", el: usage }), state, "blur drops only a card shown by focus");
	for (const event of [{ type: "leave", el: usage }, { type: "elapsed", el: usage }, { type: "blur", el: usage }, { type: "popover-closed" }, { type: "removed", el: usage }])
		assert.equal(hoverStep(HOVER_IDLE, event), HOVER_IDLE, `idle: ${event.type}`);
});

test("PRD-001.R32: only a pointer that moved reaches a control; a scroll under a still pointer does not", () => {
	assert.equal(pointerMoved(null, { x: 10, y: 20 }), true, "the first pointerover");
	assert.equal(pointerMoved({ x: 10, y: 20 }, { x: 10, y: 20 }), false, "same place");
	assert.equal(pointerMoved({ x: 10, y: 20 }, { x: 11, y: 20 }), true, "moved across");
	assert.equal(pointerMoved({ x: 10, y: 20 }, { x: 10, y: 19 }), true, "moved up");
});

// --- Placement ------------------------------------------------------------------

/** A box from its left, top, width and height, as getBoundingClientRect gives it. */
const box = (left, top, width, height) => ({ left, top, width, right: left + width, bottom: top + height });
const MAIN = box(100, 0, 400, 800);

test("PRD-001.R32: a popover or hover card opens up from its trigger, as tall as the space above it", () => {
	assert.deepEqual(placeAbove(MAIN, box(120, 770, 60, 26)), { bottom: 34, maxHeight: 758 });
	assert.deepEqual(placeAbove(MAIN, box(120, 5, 60, 26)), { bottom: 799, maxHeight: 0 }, "never a negative height");
});

test("PRD-001.R32: a popover or hover card in the top region opens down from its trigger, as tall as the space below it", () => {
	assert.deepEqual(placeBelow(MAIN, box(120, 10, 60, 28)), { top: 42, maxHeight: 750 });
	assert.deepEqual(placeBelow(MAIN, box(120, 790, 60, 26)), { top: 820, maxHeight: 0 }, "never a negative height");
});

test("PRD-001.R7, PRD-001.R32: a tab's hover card opens down; a column row's up where it fits, else down", () => {
	const nearTop = box(520, 60, 200, 32);
	const nearBottom = box(520, 700, 200, 32);
	assert.equal(opensDown("down", MAIN, nearBottom, 80), true);
	assert.equal(opensDown("up", MAIN, nearTop, 80), false);
	assert.equal(opensDown("auto", MAIN, nearBottom, 80), false, "room above");
	assert.equal(opensDown("auto", MAIN, nearTop, 80), true, "48 px above, an 80 px card");
});

test("PRD-001.R32: it aligns to the trigger's start edge in the column's first half, else to its end edge", () => {
	// Offsets run from the column's inline-start edge.
	assert.equal(placeInline(MAIN, box(120, 770, 60, 26), 200, false), 20);
	assert.equal(placeInline(MAIN, box(380, 770, 100, 26), 200, false), 180);
	// Right to left, the start edge is the right one.
	assert.equal(placeInline(MAIN, box(420, 770, 60, 26), 200, true), 20);
	assert.equal(placeInline(MAIN, box(120, 770, 100, 26), 200, true), 180);
});

test("PRD-001.R32: it stays 8 px inside the main column", () => {
	assert.equal(placeInline(MAIN, box(102, 770, 20, 26), 200, false), 8);
	assert.equal(placeInline(MAIN, box(490, 770, 20, 26), 200, false), 192, "end-aligned past the end edge");
	assert.equal(placeInline(MAIN, box(300, 770, 10, 26), 390, false), 8, "wider than the room: the start edge wins");
});

test("PRD-001.R32: a popover keeps 8 px above its trigger, 6 px below it and 12 px inside the column", () => {
	assert.deepEqual(placeAbove(MAIN, box(120, 770, 60, 26), POPOVER_GAP.up), { bottom: 38, maxHeight: 754 });
	assert.deepEqual(placeBelow(MAIN, box(120, 10, 60, 28), POPOVER_GAP.down), { top: 44, maxHeight: 748 });
	assert.equal(placeInline(MAIN, box(102, 770, 20, 26), 200, false, POPOVER_EDGE), 12);
	assert.equal(placeInline(MAIN, box(490, 770, 20, 26), 200, false, POPOVER_EDGE), 188);
	assert.equal(placeInline(MAIN, box(300, 770, 10, 26), 390, false, POPOVER_EDGE), 8, "a popover as wide as the room keeps the 8 px");
	assert.equal(placeInline(MAIN, box(300, 770, 10, 26), 380, false, POPOVER_EDGE), 10, "the room beside it, shared");
});

// A path runs from the pointer's target up to the panel.
const node = (el, flags = {}) => ({ el, attached: false, interactive: false, ...flags });

test("PRD-001.R32: a control inside a hover-card element is its own control, other descendants count as the element", () => {
	const tab = node("tab", { attached: true, interactive: true });
	const panel = node("panel");
	assert.equal(controlUnder([node("close icon"), node("close", { interactive: true }), node("title"), tab, panel]), "close");
	assert.equal(controlUnder([node("title"), tab, panel]), "tab", "plain text inside the tab");
	assert.equal(controlUnder([tab, panel]), "tab", "the tab itself");
	assert.equal(controlUnder([node("icon"), node("main", { interactive: true }), node("row"), panel]), "main", "an interactive element with no card");
	assert.equal(controlUnder([node("bar"), panel]), null, "no control");
	assert.equal(
		controlUnder([node("inner", { attached: true, interactive: true }), tab, panel]),
		"inner",
		"an inner element with a card of its own"
	);
});

test("PRD-001.R32: only a return onto an element from a control inside it re-arms its card, not movement within it", () => {
	const inside = (outer, inner) => inner.startsWith(outer);
	assert.equal(returnedFromInner("tab/close", "tab", inside), true, "from the close button onto the tab");
	assert.equal(returnedFromInner("tab", "tab", inside), false, "movement within the element");
	assert.equal(returnedFromInner(null, "tab", inside), false, "no previous control");
	assert.equal(returnedFromInner("other", "tab", inside), false, "from elsewhere");
});
