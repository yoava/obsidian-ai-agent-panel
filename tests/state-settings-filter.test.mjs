import { test } from "node:test";
import assert from "node:assert/strict";
import { filterLine, filterPage, matchRanges } from "./.build/state/settings-filter.mjs";

const SECTIONS = ["general", "permissions", "appearance", "usage", "export", "cli"];

const row = (id, section, name, desc, terms = [], modified = false, profile) => ({ id, section, name, desc, terms, modified, ...(profile ? { profile } : {}) });

/** A cut of the page: every kind of row the filter reads (names, descriptions, values, two profiles). */
const ROWS = [
	row("model", "general", "Model", "An alias or a full model id.", ["opus"], true),
	row("effort", "general", "Default reasoning effort", "Higher thinks longer.", ["CLI default"]),
	row("shell-escape", "permissions", "The composer’s “!” shell escape", "It skips Claude Code’s permission prompts.", ["On"]),
	row("prompt-style", "appearance", "Prompt style", "How your own messages stand out.", ["Card", "Bubble"]),
	row("prompt-color", "appearance", "Prompt color", "Fills and outlines your own messages.", ["Clear", "Mist", "outline", "quiet", "none"], true),
	row("pin-prompt", "appearance", "Pin the current prompt while scrolling", "The prompt you are reading stays at the top.", ["On"]),
	row("usage-refresh", "usage", "Refresh interval", "How often usage is re-read.", ["5m"]),
	row("p1:path", "cli", "Claude CLI path", "Path to the claude executable.", ["/usr/bin/claude"], true, "p1"),
	row("p1:args", "cli", "Additional arguments", "Added to every launch.", [], false, "p1"),
	row("p2:path", "cli", "Claude CLI path", "Path to the claude executable.", [], false, "p2"),
	row("add-profile", "cli", "Add a CLI profile", "Another way to launch Claude Code."),
];

const view = (query = "", modifiedOnly = false, extra = {}) => filterPage({ rows: ROWS, sections: SECTIONS, query, modifiedOnly, ...extra });
const shownIds = (v) => Object.entries(v.rows).filter(([, r]) => r.shown).map(([id]) => id);

test("PRD-001.R39: with no query and no Modified filter every row shows and nothing is hidden", () => {
	const v = view();
	assert.equal(v.filtering, false);
	assert.equal(v.searching, false);
	assert.equal(shownIds(v).length, ROWS.length);
	assert.deepEqual(v.hiddenSections, []);
	assert.deepEqual(v.hiddenProfiles, []);
	assert.deepEqual(v.shown, { general: 2, permissions: 1, appearance: 3, usage: 1, export: 0, cli: 4 });
	assert.equal(filterLine(v), null);
	assert.deepEqual(v.rows.model.name, []);
});

test("PRD-001.R39: a query shows the rows whose name, description or value holds it, any case", () => {
	assert.deepEqual(shownIds(view("prompt")), ["shell-escape", "prompt-style", "prompt-color", "pin-prompt"]);
	assert.deepEqual(shownIds(view("PROMPT")), shownIds(view("prompt")));
	assert.deepEqual(shownIds(view("opus")), ["model"], "a value");
	assert.deepEqual(shownIds(view("/usr/bin")), ["p1:path"], "a path");
	assert.deepEqual(shownIds(view("5m")), ["usage-refresh"]);
	assert.deepEqual(shownIds(view("nothing like this")), []);
});

test("PRD-001.R33, R39: outline, quiet and none find Clear's row, by value as well as description", () => {
	assert.ok(shownIds(view("quiet")).includes("prompt-color"));
	assert.deepEqual(shownIds(view("quiet")), ["prompt-color"]);
	assert.ok(shownIds(view("none")).includes("prompt-color"));
	assert.ok(shownIds(view("outline")).includes("prompt-color"));
});

test("PRD-001.R39: matches are ranged in the name and the description, not in values", () => {
	const v = view("prompt");
	assert.deepEqual(v.rows["prompt-style"].name, [[0, 6]]);
	assert.deepEqual(v.rows["prompt-style"].desc, []);
	assert.deepEqual(v.rows["pin-prompt"].name, [[16, 22]]);
	assert.deepEqual(v.rows["pin-prompt"].desc, [[4, 10]]);
	assert.deepEqual(v.rows["shell-escape"].desc, [[34, 40]]);
	assert.deepEqual(v.rows.model.name, [], "a row that is not shown has no marks");
	const byValue = view("opus");
	assert.deepEqual(byValue.rows.model.name, []);
	assert.deepEqual(byValue.rows.model.desc, []);
});

test("PRD-001.R39: each section counts its shown rows, and a section with none is hidden", () => {
	const v = view("prompt");
	assert.deepEqual(v.shown, { general: 0, permissions: 1, appearance: 3, usage: 0, export: 0, cli: 0 });
	assert.deepEqual(v.hiddenSections, ["general", "usage", "export", "cli"]);
	assert.equal(v.matches, 4);
	assert.equal(v.sectionsShown, 2);
	assert.equal(v.searching, true);
	assert.equal(v.filtering, true);
});

test("PRD-001.R39: Modified shows only modified rows, hides empty sections and profiles, and counts them", () => {
	const v = view("", true);
	assert.deepEqual(shownIds(v), ["model", "prompt-color", "p1:path"]);
	assert.deepEqual(v.shown, { general: 1, permissions: 0, appearance: 1, usage: 0, export: 0, cli: 1 });
	assert.deepEqual(v.hiddenSections, ["permissions", "usage", "export"]);
	assert.deepEqual(v.hiddenProfiles, ["p2"]);
	assert.equal(v.modifiedTotal, 3);
	assert.equal(v.searching, false);
	assert.equal(v.filtering, true);
});

test("PRD-001.R39: the modified total and each section's modified count ignore the filters", () => {
	for (const v of [view(), view("prompt"), view("zzz"), view("", true)]) {
		assert.equal(v.modifiedTotal, 3);
		assert.deepEqual(v.modified, { general: 1, permissions: 0, appearance: 1, usage: 0, export: 0, cli: 1 });
	}
});

test("PRD-001.R39: a query and Modified combine: a row shows only when it meets both", () => {
	const v = view("prompt", true);
	assert.deepEqual(shownIds(v), ["prompt-color"]);
	assert.deepEqual(v.shown, { general: 0, permissions: 0, appearance: 1, usage: 0, export: 0, cli: 0 });
	assert.deepEqual(v.hiddenSections, ["general", "permissions", "usage", "export", "cli"]);
	assert.deepEqual(shownIds(view("claude", true)), ["p1:path"], "a modified row that holds the query");
});

test("PRD-001.R39: a profile with no shown row is hidden, whichever filter hid its rows", () => {
	assert.deepEqual(view("arguments").hiddenProfiles, ["p2"]);
	assert.deepEqual(view("/usr/bin").hiddenProfiles, ["p2"]);
	assert.deepEqual(view("nothing like this").hiddenProfiles, ["p1", "p2"]);
	assert.deepEqual(view("claude").hiddenProfiles, []);
});

test("PRD-001.R39: a query of spaces filters nothing, and a query is trimmed", () => {
	const v = view("   ");
	assert.equal(v.searching, false);
	assert.equal(v.filtering, false);
	assert.equal(shownIds(v).length, ROWS.length);
	assert.deepEqual(shownIds(view("  prompt  ")), shownIds(view("prompt")));
	assert.equal(view("  prompt  ").query, "prompt");
	assert.equal(view("   ", true).filtering, true, "spaces with Modified on still filter by Modified");
	assert.equal(view("   ", true).searching, false);
});

test("PRD-001.R39: a query with spaces inside matches as written", () => {
	assert.deepEqual(shownIds(view("your own")), ["prompt-style", "prompt-color"]);
});

test("PRD-001.R39: rows kept shown stay shown whatever the filters say, and still count", () => {
	const v = view("prompt", false, { keep: new Set(["model", "effort"]) });
	assert.deepEqual(shownIds(v), ["model", "effort", "shell-escape", "prompt-style", "prompt-color", "pin-prompt"]);
	assert.equal(v.shown.general, 2);
	assert.deepEqual(v.hiddenSections, ["usage", "export", "cli"]);
	const m = view("", true, { keep: new Set(["effort"]) });
	assert.deepEqual(shownIds(m), ["model", "effort", "prompt-color", "p1:path"]);
	assert.equal(filterLine(m), "3 settings differ from their defaults. Each shows its default under the description.");
});

test("PRD-001.R39: matchRanges finds every non-overlapping occurrence, case-insensitively", () => {
	assert.deepEqual(matchRanges("Prompt the prompt", "prompt"), [[0, 6], [11, 17]]);
	assert.deepEqual(matchRanges("aaaa", "aa"), [[0, 2], [2, 4]]);
	assert.deepEqual(matchRanges("Prompt", "PROMPT"), [[0, 6]]);
	assert.deepEqual(matchRanges("Prompt", ""), []);
	assert.deepEqual(matchRanges("Prompt", "   "), []);
	assert.deepEqual(matchRanges("", "a"), []);
	assert.deepEqual(matchRanges("Prompt style", " style "), [[7, 12]], "trimmed like the query");
});

test("PRD-001.R39: the filter line counts the rows that meet both filters and names the sections they are in", () => {
	assert.equal(
		filterLine(view("prompt")),
		"4 settings match “prompt” in 2 sections. Names, descriptions and values are searched; Esc clears. Show clears the search and scrolls to the setting."
	);
	assert.equal(
		filterLine(view("prompt", true)),
		"1 setting matches “prompt” in 1 section. Names, descriptions and values are searched; Esc clears. Show clears the search and scrolls to the setting."
	);
	assert.equal(
		filterLine(view("zzz")),
		"No settings match “zzz”. Names, descriptions and values are searched; Esc clears."
	);
	assert.equal(filterLine(view("", true)), "3 settings differ from their defaults. Each shows its default under the description.");
	assert.equal(
		filterLine(filterPage({ rows: ROWS.slice(0, 1), sections: SECTIONS, query: "", modifiedOnly: true })),
		"1 setting differs from its default. It shows its default under the description."
	);
	assert.equal(
		filterLine(filterPage({ rows: ROWS.slice(1, 2), sections: SECTIONS, query: "", modifiedOnly: true })),
		"No settings differ from their defaults."
	);
});

test("PRD-001.R39: no rows at all is an empty page, not an error", () => {
	const v = filterPage({ rows: [], sections: SECTIONS, query: "x", modifiedOnly: true });
	assert.deepEqual(v.rows, {});
	assert.equal(v.matches, 0);
	assert.equal(v.modifiedTotal, 0);
	assert.deepEqual(v.hiddenSections, SECTIONS);
});
