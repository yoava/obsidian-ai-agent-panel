import { test } from "node:test";
import assert from "node:assert/strict";
import {
	SIDE_WIDTH_DEFAULT_PX,
	SIDE_WIDTH_MAX_PX,
	SIDE_WIDTH_MIN_PX,
	TABS_SIDE_HYSTERESIS_PX,
	TABS_SIDE_MIN_TRANSCRIPT_PX,
	clampSideWidth,
	parseStoredSideWidth,
	sideLayoutThreshold,
} from "./.build/tabs-layout.mjs";

// A pane wide enough that the fraction cap never binds.
const WIDE = 4000;

test("a width inside the range comes back unchanged", () => {
	assert.equal(clampSideWidth(240, WIDE), 240);
	assert.equal(clampSideWidth(SIDE_WIDTH_DEFAULT_PX, WIDE), SIDE_WIDTH_DEFAULT_PX);
});

test("dragging past either end stops at the bound", () => {
	assert.equal(clampSideWidth(10, WIDE), SIDE_WIDTH_MIN_PX);
	assert.equal(clampSideWidth(-500, WIDE), SIDE_WIDTH_MIN_PX);
	assert.equal(clampSideWidth(9999, WIDE), SIDE_WIDTH_MAX_PX);
});

test("the column never takes more than half the pane", () => {
	assert.equal(clampSideWidth(400, 600), 300);
	assert.equal(clampSideWidth(9999, 800), 400);
	// Past 960 the absolute ceiling binds before the fraction does.
	assert.equal(clampSideWidth(9999, 2000), SIDE_WIDTH_MAX_PX);
});

test("the minimum wins over the fraction in a pane too narrow for both", () => {
	// Half of 200 is 100, below the legible minimum: the column stays at 140
	// rather than collapsing (in "auto" the tabs have moved to the top strip by
	// now anyway, and an explicit "side" is the user insisting).
	assert.equal(clampSideWidth(180, 200), SIDE_WIDTH_MIN_PX);
	assert.equal(clampSideWidth(10, 200), SIDE_WIDTH_MIN_PX);
});

test("an unmeasured pane clamps to the plain ceiling, not down to the minimum", () => {
	// clientWidth is 0 until the view has been laid out; a restored width must
	// survive that first pass.
	assert.equal(clampSideWidth(300, 0), 300);
	assert.equal(clampSideWidth(9999, 0), SIDE_WIDTH_MAX_PX);
});

test("junk widths fall back to the default", () => {
	assert.equal(clampSideWidth(NaN, WIDE), SIDE_WIDTH_DEFAULT_PX);
	assert.equal(clampSideWidth(Infinity, WIDE), SIDE_WIDTH_DEFAULT_PX);
});

test("widths are rounded to whole pixels", () => {
	assert.equal(clampSideWidth(240.4, WIDE), 240);
	assert.equal(clampSideWidth(240.6, WIDE), 241);
});

test("the default column keeps the threshold the layout used to hard-code", () => {
	assert.equal(sideLayoutThreshold(SIDE_WIDTH_DEFAULT_PX, false), 560);
	assert.equal(sideLayoutThreshold(SIDE_WIDTH_DEFAULT_PX, true), 520);
});

test("a wider column demands a wider pane, transcript budget intact", () => {
	for (const width of [SIDE_WIDTH_MIN_PX, 180, 300, SIDE_WIDTH_MAX_PX]) {
		const threshold = sideLayoutThreshold(width, false);
		assert.equal(threshold - width, TABS_SIDE_MIN_TRANSCRIPT_PX);
	}
});

test("hysteresis only ever lowers the threshold, and by a fixed amount", () => {
	for (const width of [SIDE_WIDTH_MIN_PX, 260, SIDE_WIDTH_MAX_PX]) {
		assert.equal(
			sideLayoutThreshold(width, false) - sideLayoutThreshold(width, true),
			TABS_SIDE_HYSTERESIS_PX
		);
	}
});

test("a pane between the two thresholds keeps whichever layout it has", () => {
	// The point of the hysteresis: at 540px with a default column, a side
	// layout stays on the side and a top layout stays on top, so dragging the
	// pane edge across the flip point cannot make the layout oscillate.
	const pane = 540;
	assert.ok(pane >= sideLayoutThreshold(SIDE_WIDTH_DEFAULT_PX, true));
	assert.ok(pane < sideLayoutThreshold(SIDE_WIDTH_DEFAULT_PX, false));
});

test("a junk stored width reads back as the default", () => {
	assert.equal(parseStoredSideWidth(null), SIDE_WIDTH_DEFAULT_PX);
	assert.equal(parseStoredSideWidth(undefined), SIDE_WIDTH_DEFAULT_PX);
	assert.equal(parseStoredSideWidth("240"), SIDE_WIDTH_DEFAULT_PX);
	assert.equal(parseStoredSideWidth({ width: 240 }), SIDE_WIDTH_DEFAULT_PX);
	assert.equal(parseStoredSideWidth(NaN), SIDE_WIDTH_DEFAULT_PX);
});

test("a stored width is clamped on the way in", () => {
	assert.equal(parseStoredSideWidth(240), 240);
	assert.equal(parseStoredSideWidth(9999), SIDE_WIDTH_MAX_PX);
	assert.equal(parseStoredSideWidth(0), SIDE_WIDTH_MIN_PX);
});
