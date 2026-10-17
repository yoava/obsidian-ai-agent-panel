import { test } from "node:test";
import assert from "node:assert/strict";
import { outputParts } from "./.build/state/shell-output.mjs";

const joined = (parts) => parts.map((part) => part.text).join("");

test("PRD-002.R16: a commit hash opening a line is set apart, the rest of the output is not", () => {
	const text = "a41c9e2 Add Q3 retro notes\n7d02b18 Rename Mtg notes\nplain line";
	const parts = outputParts(text);
	assert.deepEqual(
		parts.filter((part) => part.hash).map((part) => part.text),
		["a41c9e2", "7d02b18"]
	);
	assert.equal(joined(parts), text);
});

test("PRD-002.R16: a number, a word or a hash that does not open the line is not a hash", () => {
	for (const text of ["1234567 files", "defaced the page", "ok a41c9e2", "abc12 short", "a41c9e2x not hex end"]) {
		assert.deepEqual(outputParts(text), [{ text, hash: false }], text);
	}
});

test("PRD-002.R16: a hash alone on a line, a full-length hash and empty output", () => {
	assert.deepEqual(outputParts("a41c9e2"), [{ text: "a41c9e2", hash: true }]);
	const full = "a".repeat(30) + "1".repeat(10);
	assert.equal(outputParts(`${full} subject`)[0].hash, true);
	assert.deepEqual(outputParts(""), []);
});
