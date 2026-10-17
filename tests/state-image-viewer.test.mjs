import { test } from "node:test";
import assert from "node:assert/strict";
import {
	ACTUAL_SIZE_LABEL,
	base64Bytes,
	formatBytes,
	openViewer,
	shownImage,
	stepViewer,
	stepViewerImages,
	thumbLabel,
	toggleSize,
	viewerCaption,
} from "./.build/state/image-viewer.mjs";

const image = (name, bytes = 2048) => ({ name, mediaType: "image/png", base64: "AAAA", bytes });
const three = [image("a.png"), image("b.png", 250_880), image("c.png")];

test("PRD-001.R14: the viewer opens fitted on the image clicked, an index outside the list clamped", () => {
	assert.deepEqual(openViewer(three, 1), { images: three, index: 1, actual: false });
	assert.equal(openViewer(three, 9).index, 2);
	assert.equal(openViewer(three, -1).index, 0);
	assert.equal(shownImage(openViewer([], 0)), undefined);
});

test("PRD-001.R14: Left and Right step through the same images, fitted again, and stop at either end", () => {
	const actual = toggleSize(openViewer(three, 1));
	assert.deepEqual(stepViewer(actual, 1), { images: three, index: 2, actual: false });
	assert.equal(stepViewer(actual, -1).index, 0);
	const last = openViewer(three, 2);
	assert.equal(stepViewer(last, 1), last);
	const first = openViewer(three, 0);
	assert.equal(stepViewer(first, -1), first);
});

test("PRD-001.R14: a click toggles actual size; the image is a toggle button named for it", () => {
	const actual = toggleSize(openViewer(three, 0));
	assert.equal(actual.actual, true);
	assert.equal(toggleSize(actual).actual, false);
	assert.equal(ACTUAL_SIZE_LABEL, "Actual size");
});

test("PRD-001.R14: the caption names the image, its file size and, once loaded, its pixels", () => {
	const state = openViewer(three, 1);
	assert.equal(viewerCaption(state, null), "2 of 3 · b.png · 245 KB");
	assert.equal(viewerCaption(state, { width: 1920, height: 1080 }), "2 of 3 · b.png · 245 KB · 1920 × 1080");
	assert.equal(viewerCaption(openViewer([image("one.png", 512)], 0), { width: 4, height: 3 }), "one.png · 512 B · 4 × 3");
	assert.equal(viewerCaption(openViewer([], 0), null), "");
});

test("PRD-001.R14: a thumbnail is a button named for the image it views", () => {
	assert.equal(thumbLabel("shot.png"), "View shot.png");
});

test("PRD-001.R16: a tool result's images are numbered among the row's, their size from the base64", () => {
	const shown = stepViewerImages([
		{ mediaType: "image/png", data: "AAAA" },
		{ mediaType: "image/jpeg", data: "AAAAAA==" },
	]);
	assert.deepEqual(shown, [
		{ name: "Tool result image 1", mediaType: "image/png", base64: "AAAA", bytes: 3 },
		{ name: "Tool result image 2", mediaType: "image/jpeg", base64: "AAAAAA==", bytes: 4 },
	]);
	assert.equal(base64Bytes("AA\nAA"), 3);
});

test("file sizes read as B, KB and MB", () => {
	assert.equal(formatBytes(512), "512 B");
	assert.equal(formatBytes(2048), "2 KB");
	assert.equal(formatBytes(3.2 * 1024 * 1024), "3.2 MB");
});
