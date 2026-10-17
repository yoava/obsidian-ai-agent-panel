import { test } from "node:test";
import assert from "node:assert/strict";
import { barClearance } from "./.build/state/bar-clearance.mjs";

const box = (left, top, right, bottom) => ({ left, top, right, bottom });
// A right sidebar 300 px wide in a 1000 x 800 window.
const panel = box(700, 40, 1000, 800);

test("PRD-001.R30: a status bar over the panel's bottom corner is cleared by its height", () => {
	assert.equal(barClearance(panel, box(820, 774, 1000, 800)), 26);
});

test("PRD-001.R30: a bar reaching only part of the panel's width still clears", () => {
	assert.equal(barClearance(panel, box(900, 774, 1000, 800)), 26);
	assert.equal(barClearance(panel, box(600, 774, 720, 800)), 26, "a bar ending inside the panel");
});

test("PRD-001.R30: a bar with no horizontal overlap leaves nothing to clear", () => {
	assert.equal(barClearance(box(0, 40, 300, 800), box(820, 774, 1000, 800)), 0);
	assert.equal(barClearance(panel, box(600, 774, 700, 800)), 0, "touching edges do not overlap");
});

test("PRD-001.R30: a hidden or absent bar leaves nothing to clear", () => {
	assert.equal(barClearance(panel, null), 0);
	assert.equal(barClearance(panel, box(0, 0, 0, 0)), 0, "display none: no size");
	assert.equal(barClearance(panel, box(900, 774, 900, 800)), 0);
});

test("PRD-001.R30: a bar below the panel or above it leaves nothing to clear", () => {
	assert.equal(barClearance(box(700, 40, 1000, 774), box(820, 774, 1000, 800)), 0, "the panel ends where the bar begins");
	assert.equal(barClearance(box(700, 300, 1000, 500), box(820, 774, 1000, 800)), 0, "a panel clear of the bar");
	assert.equal(barClearance(box(700, 400, 1000, 600), box(820, 20, 1000, 40)), 0, "a bar above the panel");
});

test("PRD-001.R30: a bar part-way over a panel clears what covers it, whole pixels", () => {
	assert.equal(barClearance(box(700, 40, 1000, 790), box(820, 774, 1000, 800)), 16);
	assert.equal(barClearance(panel, box(820, 773.4, 1000, 800)), 27, "a fractional edge rounds up");
});

test("PRD-001.R30: the clearance never exceeds the region's height, and a region not laid out takes none", () => {
	assert.equal(barClearance(box(700, 780, 1000, 800), box(820, 700, 1000, 800)), 20);
	assert.equal(barClearance(box(0, 0, 0, 0), box(820, 774, 1000, 800)), 0);
});
