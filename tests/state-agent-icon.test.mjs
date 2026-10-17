/**
 * Obsidian draws a registered icon as `<svg class="svg-icon <id>">`, so a
 * stylesheet rule that names the id as a class paints the glyph: the root rule
 * `.ai-agent-panel` once gave the icon the panel's background and color.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_ICON, AGENT_ICON_SVG, COMPACT_ICON, COMPACT_ICON_SVG } from "./.build/state/agent-icon.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");
/** Every icon id the plugin registers with `addIcon`, by the constant that names it. */
const REGISTERED = { AGENT_ICON, COMPACT_ICON };

/** The first argument of each `addIcon(` call in `source`: a quoted literal or a bare identifier. */
export function addIconArguments(source) {
	return [...source.matchAll(/(?<![\w.])addIcon\(\s*("[^"]*"|'[^']*'|[\w$]+)/g)].map((m) => m[1]);
}

/** Every `.ts` file under `dir`. */
function sourceFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		return entry.isDirectory() ? sourceFiles(full) : full.endsWith(".ts") ? [full] : [];
	});
}

/** The preludes of a stylesheet's rules, at any depth: selectors and at-rule heads, no declarations. */
function selectorText(css) {
	const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
	const preludes = [];
	let from = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "{") {
			preludes.push(text.slice(from, i));
			from = i + 1;
		} else if (text[i] === "}" || text[i] === ";") from = i + 1;
	}
	return preludes.join("\n");
}

/** Whether a selector in `css` can match an element whose class list holds `id`. */
export function selectsClass(css, id) {
	const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const selectors = selectorText(css);
	return new RegExp(`\\.${escaped}(?![\\w-])`).test(selectors) || new RegExp(`\\[\\s*class[^\\]]*${escaped}`).test(selectors);
}

/** What breaks "transparent, drawn in the text color" in an icon's inner SVG markup. */
export function iconProblems(markup) {
	const problems = [];
	const tags = [...markup.matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g)].filter((m) => !m[0].startsWith("</"));
	const attr = (attrs, name) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs)?.[1];
	const shapes = tags.filter((m) => m[1] !== "g");
	for (const [, name] of tags) {
		if (!["g", "path", "circle", "line", "polyline", "polygon", "ellipse"].includes(name))
			problems.push(`<${name}> is no stroked shape or group`);
	}
	if (shapes.length === 0) problems.push("no shape");
	for (const [, name, attrs] of tags) {
		if (/(?:^|\s)style\s*=/.test(attrs)) problems.push(`<${name}> has a style attribute`);
		const fill = attr(attrs, "fill");
		if (fill !== undefined && fill !== "none") problems.push(`<${name}> fills with ${fill}`);
		const stroke = attr(attrs, "stroke");
		if (stroke !== undefined && stroke !== "currentColor") problems.push(`<${name}> strokes with ${stroke}`);
	}
	const group = tags.find((m) => m[1] === "g");
	if (attr(group?.[2] ?? "", "fill") !== "none") problems.push("the group is not fill none");
	if (attr(group?.[2] ?? "", "stroke") !== "currentColor") problems.push("the group does not stroke currentColor");
	return problems;
}

test("PRD-001.R34: no icon the plugin registers is a class a stylesheet rule selects", () => {
	for (const id of Object.values(REGISTERED)) {
		assert.ok(!id.startsWith("ai-agent-panel"), `${id} starts with the panel's class prefix`);
		assert.equal(selectsClass(STYLES, id), false, `styles.css selects .${id}`);
	}
	assert.equal(selectsClass(STYLES, "ai-agent-panel"), true, "the probe sees the root rule it guards against");
});

test("PRD-001.R34: selectsClass finds a class in a selector, a list, a nested rule and a class attribute selector, not in a declaration, a comment or a longer name", () => {
	assert.equal(selectsClass(".a .icon-x { color: red; }", "icon-x"), true);
	assert.equal(selectsClass(".a, .icon-x:hover { color: red; }", "icon-x"), true);
	assert.equal(selectsClass("@media (min-width: 1px) { .b > .icon-x svg { color: red; } }", "icon-x"), true);
	assert.equal(selectsClass("svg[class~='icon-x'] { color: red; }", "icon-x"), true);
	assert.equal(selectsClass(".icon-xy { color: red; }", "icon-x"), false);
	assert.equal(selectsClass("/* .icon-x */ .b { content: '.icon-x'; background: url(.icon-x); }", "icon-x"), false);
});

test("PRD-001.R34: the icon is outline only, fill none and stroke currentColor", () => {
	assert.deepEqual(iconProblems(AGENT_ICON_SVG), []);
	assert.deepEqual(iconProblems(COMPACT_ICON_SVG), []);
});

test("PRD-001.R34: iconProblems rejects a filled background, a hard-coded color and a style", () => {
	const good = '<g fill="none" stroke="currentColor"><path d="M0 0"/></g>';
	assert.deepEqual(iconProblems(good), []);
	assert.ok(iconProblems('<rect width="100" height="100" fill="#fff"/>' + good).length > 0, "filled square");
	assert.ok(iconProblems('<rect width="100" height="100"/>' + good).length > 0, "rect with the default fill");
	assert.ok(iconProblems(good.replace("currentColor", "#000")).length > 0, "dark stroke");
	assert.ok(iconProblems(good.replace('fill="none"', 'fill="currentColor"')).length > 0, "filled group");
	assert.ok(iconProblems(good.replace("<path", '<path fill="red"')).length > 0, "filled path");
	assert.ok(iconProblems(good.replace("<path", '<path style="fill:red"')).length > 0, "style attribute");
	assert.ok(iconProblems('<g stroke="currentColor"><path d="M0 0"/></g>').length > 0, "group without fill none");
	assert.ok(iconProblems('<g fill="none"><path d="M0 0"/></g>').length > 0, "group without a stroke");
	assert.ok(iconProblems("").length > 0, "empty");
});

test("PRD-001.R34: every addIcon call in src registers an id the checks above cover", () => {
	const calls = sourceFiles(path.join(ROOT, "src")).flatMap((file) =>
		addIconArguments(readFileSync(file, "utf8")).map((arg) => ({ file: path.relative(ROOT, file), arg }))
	);
	assert.ok(calls.length > 0, "the scan finds the registration");
	for (const { file, arg } of calls) {
		const id = /^["']/.test(arg) ? arg.slice(1, -1) : REGISTERED[arg];
		assert.ok(Object.values(REGISTERED).includes(id), `${file} registers ${arg}, which REGISTERED does not list`);
	}
});

test("PRD-001.R34: addIconArguments finds literal and constant ids, not an import or a method", () => {
	assert.deepEqual(addIconArguments('addIcon(AGENT_ICON, SVG);\n\taddIcon( "x-y" , SVG)'), ["AGENT_ICON", '"x-y"']);
	assert.deepEqual(addIconArguments('import { addIcon, setIcon } from "obsidian";\nthis.addIcon(ID, SVG);\nremoveIcon(ID)'), []);
});
