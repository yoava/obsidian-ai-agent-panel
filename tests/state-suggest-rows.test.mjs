import { test } from "node:test";
import assert from "node:assert/strict";
import { folderLabel, matchedPrefix } from "./.build/state/suggest-rows.mjs";

test("PRD-001.R13: the typed query emboldens the start of a name it prefixes, whatever its case", () => {
	assert.equal(matchedPrefix("Hiring plan.md", "hir"), 3);
	assert.equal(matchedPrefix("Hiring plan.md", "Hiring p"), 8);
	assert.equal(matchedPrefix("Hiring plan.md", ""), 0);
});

test("PRD-001.R13: a fuzzy match that is no prefix emboldens nothing, and a path query counts by its last segment", () => {
	assert.equal(matchedPrefix("Hiring plan.md", "plan"), 0);
	assert.equal(matchedPrefix("Hiring plan.md", "Projects/Hir"), 3);
	assert.equal(matchedPrefix("Hiring plan.md", "Projects/"), 0);
});

test("PRD-001.R13: a row names the folder its file or folder sits in", () => {
	assert.equal(folderLabel("Projects/Hiring plan.md"), "Projects/");
	assert.equal(folderLabel("Areas/People/Hiring"), "Areas/People/");
	assert.equal(folderLabel("Inbox.md"), "");
});
