import { test } from "node:test";
import assert from "node:assert/strict";
import { rankSlash } from "./.build/state/slash-rank.mjs";

const entry = (name, group = "panel") => ({ name, group });
// Stand-in for the fuzzy matcher: a subsequence match scored by shortness.
const fuzzy = (query) => (name) => {
	let at = 0;
	for (const ch of query.toLowerCase()) {
		at = name.toLowerCase().indexOf(ch, at);
		if (at < 0) return null;
		at++;
	}
	return { score: -name.length };
};

const names = (list) => list.map((e) => e.name);

test("PRD-001.R19: the command whose name is the typed text is listed first", () => {
	const list = [entry("extra-usage"), entry("usage"), entry("usage-credits")];
	// Scores as the real matcher gave them: the exact name scored lowest, so the
	// old group-then-score order listed it last.
	const scores = { "extra-usage": 5, "usage-credits": 3, usage: 1 };
	const ranked = rankSlash(list, "usage", (name) => ({ score: scores[name] }));
	assert.deepEqual(names(ranked), ["usage", "usage-credits", "extra-usage"]);
});

test("PRD-001.R19: an exact match ignores case, then prefix matches, then the rest in score order", () => {
	const list = [entry("my-clear"), entry("clear-all"), entry("Clear"), entry("clean-up"), entry("clearing")];
	assert.deepEqual(names(rankSlash(list, "clear", fuzzy("clear"))), ["Clear", "clearing", "clear-all", "my-clear"]);
});

test("PRD-001.R19: an exact match in the Claude Code group puts that group first, groups stay together", () => {
	const list = [entry("extra-usage"), entry("usage", "cli"), entry("usage-credits", "cli")];
	const ranked = rankSlash(list, "usage", fuzzy("usage"));
	assert.deepEqual(names(ranked), ["usage", "usage-credits", "extra-usage"]);
	assert.deepEqual(ranked.map((e) => e.group), ["cli", "cli", "panel"]);
});

test("PRD-001.R19: with no exact match the panel group comes first and the best score leads each group", () => {
	const list = [entry("review", "cli"), entry("rewind"), entry("remember", "cli"), entry("resume")];
	assert.deepEqual(names(rankSlash(list, "re", fuzzy("re"))), ["rewind", "resume", "review", "remember"]);
});

test("PRD-001.R19: an empty query keeps the list as given", () => {
	const list = [entry("b"), entry("a", "cli")];
	assert.deepEqual(rankSlash(list, "", fuzzy("")), list);
});
