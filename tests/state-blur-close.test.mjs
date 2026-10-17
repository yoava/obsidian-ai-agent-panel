import { test } from "node:test";
import assert from "node:assert/strict";
import { BlurClose, holdsFocus } from "./.build/state/blur-close.mjs";

/** A timer host the test advances by hand. */
function fakeHost() {
	let now = 0;
	let next = 1;
	const pending = new Map();
	return {
		setTimeout(fn, ms) {
			pending.set(next, { fn, at: now + ms });
			return next++;
		},
		clearTimeout(id) {
			pending.delete(id);
		},
		advance(ms) {
			now += ms;
			for (const [id, t] of [...pending]) {
				if (t.at <= now) {
					pending.delete(id);
					t.fn();
				}
			}
		},
	};
}

function setup(focused = false) {
	const host = fakeHost();
	const state = { focused, closed: 0 };
	const blur = new BlurClose(() => state.closed++, () => state.focused, 150, host);
	return { host, state, blur };
}

test("PRD-001.R19: a blur closes the list after the grace delay, not before", () => {
	const { host, state, blur } = setup();
	blur.schedule();
	host.advance(149);
	assert.equal(state.closed, 0);
	host.advance(1);
	assert.equal(state.closed, 1);
});

test("PRD-001.R19: the commands button's blur then refocus leaves the list open", () => {
	const { host, state, blur } = setup();
	blur.schedule(); // mousedown on the button blurs the textarea
	state.focused = true; // the click refocuses it and opens the list
	blur.cancel();
	host.advance(500);
	assert.equal(state.closed, 0);
});

test("PRD-001.R19: a close that comes due with the textarea focused does not run", () => {
	const { host, state, blur } = setup();
	blur.schedule();
	state.focused = true; // focus came back with no focus event seen
	host.advance(150);
	assert.equal(state.closed, 0);
});

test("PRD-001.R19: a blur that stays closes the list once, and a second blur replaces the first", () => {
	const { host, state, blur } = setup();
	blur.schedule();
	host.advance(100);
	blur.schedule();
	host.advance(100);
	assert.equal(state.closed, 0);
	host.advance(50);
	assert.equal(state.closed, 1);
});

test("PRD-001.R19: the textarea holds focus only while it is active and its window has focus", () => {
	const doc = { activeElement: null, focused: true, hasFocus() { return this.focused; } };
	const el = { ownerDocument: doc };
	doc.activeElement = el;
	assert.equal(holdsFocus(el), true);
	doc.focused = false; // the window lost focus: the list still closes
	assert.equal(holdsFocus(el), false);
	doc.focused = true;
	doc.activeElement = {};
	assert.equal(holdsFocus(el), false);
});
