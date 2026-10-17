import { test } from "node:test";
import assert from "node:assert/strict";
import { rovingIndex } from "./.build/state/roving.mjs";

test("PRD-002.R5: arrow keys move between the Diff and Rendered tabs and wrap", () => {
	assert.equal(rovingIndex("ArrowRight", false, 0, 1), 1);
	assert.equal(rovingIndex("ArrowRight", false, 1, 1), 0);
	assert.equal(rovingIndex("ArrowLeft", false, 0, 1), 1);
	assert.equal(rovingIndex("ArrowLeft", false, 1, 1), 0);
	assert.equal(rovingIndex("ArrowDown", false, 0, 2), 1);
	assert.equal(rovingIndex("ArrowUp", false, 0, 2), 2);
});

test("PRD-002.R5: Home and End jump to the ends", () => {
	assert.equal(rovingIndex("Home", false, 2, 2), 0);
	assert.equal(rovingIndex("End", false, 0, 2), 2);
});

test("PRD-002.R5: Left and Right swap right to left", () => {
	assert.equal(rovingIndex("ArrowRight", true, 1, 2), 0);
	assert.equal(rovingIndex("ArrowLeft", true, 1, 2), 2);
	assert.equal(rovingIndex("ArrowDown", true, 0, 2), 1);
});

test("PRD-002.R5: any other key, or no items, moves nothing", () => {
	assert.equal(rovingIndex("Enter", false, 0, 1), null);
	assert.equal(rovingIndex("a", false, 1, 1), null);
	assert.equal(rovingIndex("ArrowRight", false, 0, -1), null);
	assert.equal(rovingIndex("constructor", false, 0, 1), null);
});
