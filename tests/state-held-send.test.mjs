import { test } from "node:test";
import assert from "node:assert/strict";
import { contextFor, imagesAfterKeep, imagesAfterSend, pendingImages, returnsClear, routeAfter, sendGate, submitRoute } from "./.build/state/held-send.mjs";

const img = (name) => ({ mediaType: "image/png", base64: name, name, bytes: 1 });
const A = img("a");
const B = img("b");
const C = img("c");
const ok = { restoring: false, session: true, blocked: false, resumeRefused: () => false };

test("PRD-001.R38: a message made while something holds the tab, or behind held ones, is held; else it is sent", () => {
	assert.equal(submitRoute(true), "hold");
	assert.equal(submitRoute(false), "deliver");
});

test("PRD-001.R38: a message whose hold began while it was being sent is held in its place, any other result is final", () => {
	assert.equal(routeAfter("again"), "hold");
	assert.equal(routeAfter("sent"), "done");
	assert.equal(routeAfter("kept"), "done");
});

test("PRD-001.R38: the gate lets a message go, keeps it for a restore or no session, holds its place for a hold, and keeps it for a pending resume", () => {
	assert.equal(sendGate(ok), "go");
	assert.equal(sendGate({ ...ok, restoring: true }), "kept");
	assert.equal(sendGate({ ...ok, session: false }), "kept");
	assert.equal(sendGate({ ...ok, blocked: true }), "again");
	assert.equal(sendGate({ ...ok, resumeRefused: () => true }), "kept");
});

test("PRD-001.R38: the gate asks a pending resume last, so a held place never shows its error", () => {
	let asked = 0;
	const refuse = () => (asked++, true);
	assert.equal(sendGate({ ...ok, blocked: true, resumeRefused: refuse }), "again");
	assert.equal(sendGate({ ...ok, restoring: true, resumeRefused: refuse }), "kept");
	assert.equal(asked, 0);
	assert.equal(sendGate({ ...ok, resumeRefused: refuse }), "kept");
	assert.equal(asked, 1);
});

test("PRD-001.R12, R38: a held message plans from its own images, a typed one from the composer's", () => {
	assert.deepEqual(pendingImages([A], [B]), [A]);
	assert.deepEqual(pendingImages(null, [B]), [B]);
	assert.deepEqual(pendingImages([], [B]), [], "a held message with no images does not take the composer's");
});

test("PRD-001.R12, R38: after a send the composer keeps what waits behind a command, beside the images typed since a held message was made", () => {
	assert.deepEqual(imagesAfterSend(false, [A], [B]), [B]);
	assert.deepEqual(imagesAfterSend(true, [A], [B]), [A, B]);
	assert.deepEqual(imagesAfterSend(true, [A], []), [A]);
});

test("PRD-001.R38: a held message that did not go puts its images back after the composer's, in order", () => {
	assert.deepEqual(imagesAfterKeep([A], [B, C]), [A, B, C]);
	assert.deepEqual(imagesAfterKeep([], [B]), [B]);
});

test("PRD-001.R38: a held message takes the context it was sent with while it takes one, else the current one", () => {
	const snap = { block: "<snapshot>", label: "Old.md", paths: ["Old.md"] };
	const now = { block: null, label: null, paths: [] };
	const held = { id: 1, text: "t", images: [], context: snap };
	assert.equal(contextFor(held, true, () => now), snap);
	assert.equal(contextFor(held, false, () => now), now, "a queued or bare message takes none");
	assert.equal(contextFor({ ...held, context: null }, true, () => now), now);
	assert.equal(contextFor(null, true, () => now), now);
});

test("PRD-001.R38: a declined /clear goes back only alone into an empty composer, never into a draft or with held messages", () => {
	assert.equal(returnsClear(0, true), true);
	assert.equal(returnsClear(0, false), false);
	assert.equal(returnsClear(2, true), false);
});
