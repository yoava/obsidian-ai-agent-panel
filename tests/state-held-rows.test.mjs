import { test } from "node:test";
import assert from "node:assert/strict";
import { HELD_ANNOUNCEMENT, HELD_CLEAR_STATUS, HELD_SEND_STATUS, declineNote, heldRows } from "./.build/state/held-rows.mjs";

test("PRD-001.R38: the tray draws the held /clear with Cancel, then the messages behind it, each with its status", () => {
	const rows = heldRows({
		clear: "/clear",
		sends: [
			{ id: 1, text: "then summarise it", images: [] },
			{ id: 2, text: "and this", images: [{}, {}] },
			{ id: 3, text: "and this one", images: [{}] },
		],
	});
	assert.deepEqual(
		rows.map((row) => [row.key, row.text, row.status, row.cancel]),
		[
			["clear", "/clear", "Queued · clears when this turn ends", true],
			["send-1", "then summarise it", "Queued · sends in order", false],
			["send-2", "and this", "Queued · sends in order · 2 images", false],
			["send-3", "and this one", "Queued · sends in order · 1 image", false],
		]
	);
	assert.equal(HELD_CLEAR_STATUS, "Queued · clears when this turn ends");
	assert.equal(HELD_SEND_STATUS, "Queued · sends in order");
});

test("PRD-001.R38: messages held behind an open clear or an Undo draw without Cancel, and nothing held draws nothing", () => {
	assert.deepEqual(heldRows({ clear: null, sends: [{ id: 4, text: "hi", images: [] }] }).map((row) => row.cancel), [false]);
	assert.deepEqual(heldRows({ clear: null, sends: [] }), []);
});

test("PRD-001.R38: a /clear that could not run names the actual cause", () => {
	assert.deepEqual(declineNote("restore"), { text: "Not cleared: a restore is under way.", error: false });
	assert.deepEqual(declineNote("stop-failed"), { text: "Could not stop every agent, so the context was not cleared.", error: true });
	assert.equal(declineNote("cancelled"), null, "a Cancel says nothing");
});

test("PRD-001.R28, R38: the live region says each change of the tray once, in these words", () => {
	assert.deepEqual(HELD_ANNOUNCEMENT, {
		clear: "Clear queued until this turn ends",
		message: "Message queued",
		cancelled: "Clear cancelled",
	});
});
