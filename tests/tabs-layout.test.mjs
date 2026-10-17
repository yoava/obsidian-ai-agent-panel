import { test } from "node:test";
import assert from "node:assert/strict";
import {
	COLUMN_MAX_PX,
	COLUMN_MIN_PX,
	clampColumnWidth,
	columnWidth,
	defaultColumnWidth,
	parseStoredColumnWidth,
} from "./.build/tabs-layout.mjs";

test("PRD-001.R8: an unset width is 26% of the panel within 220 to 300 px", () => {
	assert.equal(defaultColumnWidth(1000), 260);
	assert.equal(defaultColumnWidth(820), 220, "26% is 213, raised to 220");
	assert.equal(defaultColumnWidth(2000), 300, "26% is 520, capped at 300");
	assert.equal(columnWidth(null, 1000), 260);
});

test("PRD-001.R8: an unset width is at most half the panel", () => {
	assert.equal(defaultColumnWidth(400), 200);
	assert.equal(defaultColumnWidth(300), 150);
});

test("PRD-001.R8: a panel not laid out yet (0 px) gets the unset width's floor", () => {
	assert.equal(defaultColumnWidth(0), 220);
});

test("PRD-001.R8: a dragged width runs from 140 px to the smaller of 480 px and half the panel", () => {
	assert.equal(COLUMN_MIN_PX, 140);
	assert.equal(COLUMN_MAX_PX, 480);
	assert.equal(clampColumnWidth(10, 2000), 140);
	assert.equal(clampColumnWidth(9999, 2000), 480);
	assert.equal(clampColumnWidth(9999, 800), 400, "half the panel");
	assert.equal(clampColumnWidth(240.6, 2000), 241, "whole pixels");
	assert.equal(columnWidth(350, 1000), 350);
	assert.equal(columnWidth(350, 600), 300, "a narrow panel caps what is drawn");
});

test("PRD-001.R8: the minimum wins when half the panel is below it", () => {
	assert.equal(clampColumnWidth(200, 200), 140);
	assert.equal(columnWidth(300, 200), 140);
});

test("PRD-001.R8: a panel not laid out yet clamps a dragged width to the plain range", () => {
	assert.equal(clampColumnWidth(300, 0), 300);
	assert.equal(clampColumnWidth(9999, 0), 480);
});

test("PRD-001.R8: a stored 180 px reads as unset", () => {
	assert.equal(parseStoredColumnWidth(180), null);
});

test("PRD-001.R8: a stored width is clamped on the way in, junk reads as unset", () => {
	assert.equal(parseStoredColumnWidth(240), 240);
	assert.equal(parseStoredColumnWidth(9999), 480);
	assert.equal(parseStoredColumnWidth(0), 140);
	for (const junk of [null, undefined, "240", { width: 240 }, NaN, Infinity])
		assert.equal(parseStoredColumnWidth(junk), null, String(junk));
});
