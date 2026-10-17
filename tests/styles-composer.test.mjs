/**
 * DES-003 Composer: the message box grows with its text from two lines to
 * 16em, then scrolls, with no resize grip; PRD-001.R30 keeps it one line at
 * most 640 px tall. The growth itself is the browser's (`field-sizing`), so
 * these tests read the rules that set it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "./css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");
const INPUT = ".ai-agent-panel-composer .ai-agent-panel-composer-input";
const SHORT = "@container ai-agent-panel (max-height: 640px)";

/** The input rule's declarations in `context` (no at-rule: []), as a map; the last of each property wins. */
function inputDeclarations(context) {
	const decls = new Map();
	for (const rule of parseRules(STYLES)) {
		if (!rule.selectors.includes(INPUT) || rule.context.join(" | ") !== context.join(" | ")) continue;
		for (const part of rule.body.split(";")) {
			const colon = part.indexOf(":");
			if (colon > 0) decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
		}
	}
	return decls;
}

test("DES-003 Composer: the message box sizes to its text between two lines and 16em, without a grip", () => {
	const decls = inputDeclarations([]);
	assert.equal(decls.get("field-sizing"), "content");
	assert.equal(decls.get("min-block-size"), "2lh");
	assert.equal(decls.get("max-block-size"), "16em");
	assert.equal(decls.get("resize"), "none");
	assert.equal(decls.has("block-size") || decls.has("height"), false, "a fixed height would stop the growth");
});

test("PRD-001.R30: at most 640 px tall the message box stays one line", () => {
	const decls = inputDeclarations([SHORT]);
	assert.equal(decls.get("min-block-size"), "1lh");
	assert.equal(decls.get("max-block-size"), "1lh");
});
