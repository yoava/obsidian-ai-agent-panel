import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSection, jumpTarget, stuckBarBottom } from "./.build/state/section-spy.mjs";

/** A 600 px scroller whose bar's bottom edge is at 90 and whose six headings sit at `tops` (viewport coordinates). */
const view = (tops, scrollTop = 0, extra = {}) => ({
	tops,
	barBottom: 90,
	scrollTop,
	clientHeight: 600,
	scrollHeight: 3000,
	...extra,
});

test("PRD-001.R39: at the top of the page the first section is current, whatever is under the bar", () => {
	assert.equal(currentSection(view([140, 600, 1000, 1400, 1800, 2200])), 0);
	assert.equal(currentSection(view([200, 600, 1000, 1400, 1800, 2200])), 0);
});

test("PRD-001.R39: the current section is the last whose heading top is at or above the bar's bottom", () => {
	assert.equal(currentSection(view([-300, 90, 500, 900, 1300, 1700], 800)), 1);
	assert.equal(currentSection(view([-300, 89, 500, 900, 1300, 1700], 800)), 1);
	assert.equal(currentSection(view([-300, 92, 500, 900, 1300, 1700], 800)), 0);
	assert.equal(currentSection(view([-900, -500, -100, 400, 800, 1200], 1500)), 2);
});

test("PRD-001.R39: a section that follows a jump is current once its heading sits at the bar's bottom", () => {
	const at = jumpTarget({ headingTop: 900, barBottom: 90, scrollTop: 0, clientHeight: 600, scrollHeight: 3000 });
	assert.equal(at, 810);
	assert.equal(currentSection(view([-810, -410, 90, 490, 890, 1290], at)), 2);
});

test("PRD-001.R39: a heading a pixel under the bar's bottom, as a jump leaves it, is at the bar", () => {
	assert.equal(currentSection(view([-300, 90.6, 500, 900, 1300, 1700], 800)), 1);
	assert.equal(currentSection(view([-300, 91, 500, 900, 1300, 1700], 800)), 1);
});

test("PRD-001.R39: at the scroller's end the last section is current, even when its heading stays below the bar", () => {
	assert.equal(currentSection(view([-2000, -1600, -1200, -800, -400, 300], 2400)), 5);
	assert.equal(currentSection(view([-2000, -1600, -1200, -800, -400, 300], 2399.5)), 5);
	assert.equal(currentSection(view([-2000, -1600, -1200, -800, -400, 300], 2390)), 4);
});

test("PRD-001.R39: a page too short to scroll is at its end, so the last section is current", () => {
	assert.equal(currentSection(view([140, 300, 460], 0, { scrollHeight: 600 })), 2);
});

test("PRD-001.R39: an empty page has no current section and a single one is always current", () => {
	assert.equal(currentSection(view([])), -1);
	assert.equal(currentSection(view([400])), 0);
	assert.equal(currentSection(view([-400], 900)), 0);
});

test("PRD-001.R39: a jump puts the heading's top at the bar's bottom", () => {
	assert.equal(jumpTarget({ headingTop: 900, barBottom: 90, scrollTop: 100, clientHeight: 600, scrollHeight: 3000 }), 910);
	assert.equal(jumpTarget({ headingTop: -50, barBottom: 90, scrollTop: 500, clientHeight: 600, scrollHeight: 3000 }), 360);
});

test("PRD-001.R39: a jump never scrolls past either end", () => {
	assert.equal(jumpTarget({ headingTop: 20, barBottom: 90, scrollTop: 30, clientHeight: 600, scrollHeight: 3000 }), 0);
	assert.equal(jumpTarget({ headingTop: 500, barBottom: 90, scrollTop: 2200, clientHeight: 600, scrollHeight: 3000 }), 2400);
});

test("PRD-001.R39: the bar's stuck bottom is the scroller's top plus the bar's height, wherever the bar sits now", () => {
	assert.equal(stuckBarBottom(40, 90), 130);
	assert.equal(stuckBarBottom(0, 0), 0);
});

test("PRD-001.R39: a jump from the top of the page, with the bar not yet stuck, still lands the heading at the stuck bar", () => {
	// Scroller top 0, bar 90 tall but resting 50 below the top (in flow); the heading is 700 down.
	const bar = { top: 50, height: 90 };
	const at = jumpTarget({ headingTop: 700, barBottom: stuckBarBottom(0, bar.height), scrollTop: 0, clientHeight: 600, scrollHeight: 3000 });
	assert.equal(at, 610);
	// After the scroll the heading's top is 90: the gap to the stuck bar is 0, and its section is current.
	assert.equal(700 - at, stuckBarBottom(0, bar.height));
	assert.equal(currentSection(view([-610, -210, 90, 490, 890, 1290], at)), 2);
});
