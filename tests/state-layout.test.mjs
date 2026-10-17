import { test } from "node:test";
import assert from "node:assert/strict";
import { COLUMN_FROM_PX, COLUMN_KEEP_PX, columnLayout } from "./.build/state/layout.mjs";

test("PRD-001.R8: Automatic shows the column from an 820 px panel", () => {
	assert.equal(COLUMN_FROM_PX, 820);
	assert.equal(columnLayout("auto", 819, false), false);
	assert.equal(columnLayout("auto", 820, false), true);
	assert.equal(columnLayout("auto", 1040, false), true);
});

test("PRD-001.R8: Automatic keeps a shown column down to 780 px", () => {
	assert.equal(COLUMN_KEEP_PX, 780);
	assert.equal(columnLayout("auto", 800, true), true);
	assert.equal(columnLayout("auto", 780, true), true);
	assert.equal(columnLayout("auto", 779, true), false);
	assert.equal(columnLayout("auto", 800, false), false, "a strip between the two stays a strip");
});

test("PRD-001.R8: Top is always the strip, Side always the column", () => {
	for (const width of [300, 800, 1400]) {
		for (const shown of [false, true]) {
			assert.equal(columnLayout("top", width, shown), false);
			assert.equal(columnLayout("side", width, shown), true);
		}
	}
});

test("PRD-001.R8: a panel not laid out (0 px, hidden) keeps its layout", () => {
	assert.equal(columnLayout("auto", 0, true), true);
	assert.equal(columnLayout("auto", 0, false), false);
});
