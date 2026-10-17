/**
 * PRD-001.R34 clause 2: host-drawn content in a reply takes the panel palette.
 * MarkdownRenderer.render appends children without Obsidian's `markdown-rendered`
 * class, so Obsidian's code rules never apply; styles.css paints code itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "./css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");
/** Every container ui/markdown renders into (reply, subagent text, plan, report, diff preview). */
const CONTAINERS = [
	"ai-agent-panel-turn-text",
	"ai-agent-panel-card-plan",
	"ai-agent-panel-report-markdown",
	"ai-agent-panel-diff-pane-body",
];

/** The declarations of every rule that has a selector under `container` ending in `tail`. */
function declarations(container, tail) {
	return parseRules(STYLES)
		.filter((rule) => rule.selectors.some((s) => s.startsWith(`.${container} `) && s.endsWith(tail)))
		.map((rule) => rule.body)
		.join("\n");
}

for (const container of CONTAINERS) {
	test(`PRD-001.R34: a fenced code block in .${container} has the code background`, () => {
		assert.match(declarations(container, " pre"), /background-color:\s*var\(--code-background\)/);
	});
	test(`PRD-001.R34: a fenced code block in .${container} has the code border`, () => {
		assert.match(declarations(container, " pre"), /border:\s*1px solid var\(--ai-agent-panel-line\)/);
	});
	test(`PRD-001.R34: inline code in .${container} has the fill background`, () => {
		assert.match(declarations(container, ":not(pre) > code"), /background-color:\s*var\(--ai-agent-panel-fill\)/);
	});
}

test("PRD-001.R34: the code rules in a reply do not use !important", () => {
	for (const container of CONTAINERS) {
		assert.doesNotMatch(declarations(container, " pre"), /!important/);
		assert.doesNotMatch(declarations(container, ":not(pre) > code"), /!important/);
	}
});
