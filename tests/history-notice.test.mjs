import { test } from "node:test";
import assert from "node:assert/strict";
import { OncePerId, saveFailedText } from "./.build/history-notice.mjs";

test("PRD-003.R2: a conversation id is announced once, however often its save fails", () => {
	const once = new OncePerId();
	assert.equal(once.claim("a"), true);
	assert.equal(once.claim("a"), false);
	assert.equal(once.claim("a"), false);
});

test("PRD-003.R2: each conversation id is announced on its own", () => {
	const once = new OncePerId();
	assert.equal(once.claim("a"), true);
	assert.equal(once.claim("b"), true);
	assert.equal(once.claim("b"), false);
	assert.equal(once.claim("a"), false);
});

test("PRD-003.R2: two rules do not share what they announced", () => {
	const first = new OncePerId();
	const second = new OncePerId();
	assert.equal(first.claim("a"), true);
	assert.equal(second.claim("a"), true);
});

test("PRD-003.R2: the failure text names the conversation by its title", () => {
	assert.equal(
		saveFailedText("Research notes"),
		'Could not save "Research notes" to history. The conversation stays open; the next save tries again.'
	);
});

test("PRD-003.R2: the failure text names an untitled conversation as New conversation", () => {
	for (const title of ["", "  ", undefined, 5, null])
		assert.equal(
			saveFailedText(title),
			'Could not save "New conversation" to history. The conversation stays open; the next save tries again.'
		);
});
