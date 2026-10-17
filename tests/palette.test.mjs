/**
 * PRD-001.R28 and R34, ADR-017 Palettes and mode: WCAG 2 contrast of the
 * pairs the panel draws in each of its palettes, read from the palette blocks
 * of styles.css. Text keeps 4.5:1, the focus ring 3:1,
 * with no exempt pair (the mock's lightness is moved where it falls short).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "./css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PALETTES = { light: ".ai-agent-panel-scope.is-light", dark: ".ai-agent-panel-scope.is-dark" };
const TEXT_MINIMUM = 4.5;
const NON_TEXT_MINIMUM = 3;
/**
 * Obsidian's default accent (1.14.4, measured: `--interactive-accent`
 * rgb(138, 92, 245)), standing in for the host's: the palettes read the
 * accent from Obsidian, so pairs that derive from it hold for this accent.
 */
const ASSUMED_ACCENT = "#8a5cf5";

/**
 * The pairs, as [foreground, background, minimum]. A background is a token
 * or "top over under": a translucent token laid on another. Any translucent
 * background not given an `under` lies on the panel's `bg`.
 */
const PAIRS = [
	// Text, muted and faint on every panel surface (R34).
	...["text", "text-muted", "text-faint"].flatMap((text) =>
		["bg", "bg-recessed", "surface", "fill"].map((bg) => [text, bg, TEXT_MINIMUM])
	),
	// Muted and faint on the meter tracks and the tab strip.
	...["text-muted", "text-faint"].flatMap((text) => ["track", "strip"].map((bg) => [text, bg, TEXT_MINIMUM])),
	// The user's prompts in Mist, the color the palettes' aliases draw (R28): text on the fill, "You" on it, the number box's outline on it.
	...promptPairs(),
	// Status and diff text on its own soft fill, and success text on the panel.
	...["ok", "error", "warning", "added", "removed"].map((status) => [status, `${status}-soft`, TEXT_MINIMUM]),
	["ok", "bg", TEXT_MINIMUM],
	// The focus ring, the solid accent (non-text, WCAG 1.4.11), on every surface it can sit on.
	...["bg", "bg-recessed", "surface", "fill"].map((bg) => ["accent", bg, NON_TEXT_MINIMUM]),
];

/**
 * The pairs of a prompt color (R28, ADR-017 Prompt color): the prompt's text on its fill; "You" (`user-ink`) on it at
 * 4.5:1; the number box's outline, also `user-ink`, on it at 3:1. Accent's ink follows Obsidian's accent, so its pairs hold at
 * the assumed accent only (as the other accent pairs); Custom has no guarantee and is not measured.
 */
function promptPairs(color = "mist") {
	if (color === "custom") return [];
	return [
		["text", "user-bg", TEXT_MINIMUM],
		["user-ink", "user-bg", TEXT_MINIMUM],
		["user-ink", "user-bg", NON_TEXT_MINIMUM],
	];
}
/** The prompt colors that have a selection rule, and Mist, which the palettes' aliases draw (ADR-017). */
const PROMPT_COLORS = ["clear", "sand", "stone", "sage", "sea", "mist", "lavender", "rose", "accent", "custom"];

/** A palette block's `--ai-agent-panel-*` tokens, name without the prefix to value. */
function paletteTokens(css, selector, color = "mist") {
	const rules = parseRules(css);
	const rule = rules.find((r) => r.context.length === 0 && r.prelude === selector);
	if (!rule) throw new Error(`no ${selector} block`);
	const tokens = new Map();
	for (const [, name, value] of rule.body.matchAll(/--ai-agent-panel-([\w-]+)\s*:\s*([^;]+);/g)) tokens.set(name, value.trim().replace(/\s+/g, " "));
	if (color === "mist") return tokens;
	// The selection rule's re-alias over the palette, as the cascade applies it to the root itself.
	const own = `.ai-agent-panel-scope.mod-prompt-color-${color}`;
	const selection = rules.find((r) => r.context.length === 0 && r.selectors.includes(own));
	if (!selection) throw new Error(`no ${own} rule`);
	for (const [, name, value] of selection.body.matchAll(/--ai-agent-panel-([\w-]+)\s*:\s*([^;]+);/g)) tokens.set(name, value.trim().replace(/\s+/g, " "));
	return tokens;
}

/** A hex or `rgb()`/`rgba()` literal, or white, black, transparent, as [r, g, b, a] (0-255, alpha 0-1); null for anything else. */
function parseColor(value) {
	const named = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] }[value];
	if (named) return named;
	const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
	if (hex) {
		let digits = hex[1];
		if (digits.length === 3 || digits.length === 4) digits = [...digits].map((d) => d + d).join("");
		if (digits.length !== 6 && digits.length !== 8) return null;
		const parts = digits.match(/../g).map((pair) => parseInt(pair, 16));
		return [parts[0], parts[1], parts[2], parts.length === 4 ? parts[3] / 255 : 1];
	}
	const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
	if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
	return null;
}

/** `color-mix(in srgb, a [p%], b [q%])` with premultiplied alpha, as CSS Color 5 defines it. */
function mix(a, p, b, q) {
	if (p === undefined && q === undefined) [p, q] = [0.5, 0.5];
	else if (p === undefined) p = 1 - q;
	else if (q === undefined) q = 1 - p;
	const alpha = a[3] * p + b[3] * q;
	if (alpha === 0) return [0, 0, 0, 0];
	return [0, 1, 2].map((i) => (a[i] * a[3] * p + b[i] * b[3] * q) / alpha).concat(alpha);
}

/** A token's color in a palette: literals, `var()` of a token or the accent, and `color-mix()` in srgb; null otherwise. */
function resolver(tokens) {
	const resolve = (value, seen = new Set()) => {
		const literal = parseColor(value);
		if (literal) return literal;
		if (value === "var(--interactive-accent)") return parseColor(ASSUMED_ACCENT);
		const ref = /^var\(--ai-agent-panel-([\w-]+)\)$/.exec(value);
		if (ref) return seen.has(ref[1]) || !tokens.has(ref[1]) ? null : resolve(tokens.get(ref[1]), new Set([...seen, ref[1]]));
		const fn = /^color-mix\(in srgb, (.+?)(?: ([\d.]+)%)?, (.+?)(?: ([\d.]+)%)?\)$/.exec(value);
		if (!fn) return null;
		const [a, b] = [resolve(fn[1], seen), resolve(fn[3], seen)];
		if (!a || !b) return null;
		const pct = (s) => (s === undefined ? undefined : Number(s) / 100);
		return mix(a, pct(fn[2]), b, pct(fn[4]));
	};
	return (name) => (tokens.has(name) ? resolve(tokens.get(name)) : null);
}

/** `top` composited over the opaque `under`. */
const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);

const channel = (c) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** WCAG 2 contrast ratio of two opaque colors. */
function contrast(a, b) {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** Every pair below its minimum, as "palette: foreground on background ratio"; a token that does not resolve to a color is reported too. */
function contrastBelow(css, pairs = PAIRS, selection = "mist") {
	const out = [];
	for (const [palette, selector] of Object.entries(PALETTES)) {
		const tokens = paletteTokens(css, selector, selection);
		const color = resolver(tokens);
		const token = (name) => {
			const found = color(name);
			if (!found) out.push(`${palette}: ${name} is no color (${tokens.get(name)})`);
			return found;
		};
		const panel = token("bg");
		for (const [fg, bg, minimum] of pairs) {
			const [topName, underName = "bg"] = bg.split(" over ");
			const front = token(fg);
			const top = token(topName);
			const under = underName === "bg" ? panel : token(underName);
			if (!front || !top || !under) continue;
			const back = top[3] < 1 ? over(top, under[3] < 1 ? over(under, panel) : under) : top;
			const ratio = contrast(over(front, back), back);
			if (ratio < minimum) out.push(`${palette}: ${fg} on ${bg} ${ratio.toFixed(2)}`);
		}
	}
	return out;
}

test("PRD-001.R28, R34: every pair the panel draws keeps its contrast in both palettes", () => {
	assert.deepEqual(contrastBelow(readFileSync(path.join(ROOT, "styles.css"), "utf8")), []);
});

test("PRD-001.R28, R33: under each prompt color, the text keeps 4.5:1 on the fill, and the ink 4.5:1 and its outline 3:1, in both palettes", () => {
	const css = readFileSync(path.join(ROOT, "styles.css"), "utf8");
	for (const color of PROMPT_COLORS.filter((c) => c !== "custom")) assert.deepEqual(contrastBelow(css, promptPairs(color), color).map((f) => `${color} ${f}`), [], color);
	// Custom is the user's responsibility: its rule exists, with the text's own color for the ink, and is not measured.
	assert.deepEqual(promptPairs("custom"), []);
	assert.deepEqual(promptPairs("accent"), promptPairs("mist"), "Accent's ink is measured at the assumed accent");
});

test("PRD-001.R28, R33: the contrast check reads a selection rule over the palette, so a darker ink in one color fails alone", () => {
	const block = (selector) => `${selector} { --ai-agent-panel-bg: #ffffff; --ai-agent-panel-text: #000000; --ai-agent-panel-user-bg: #ecf2fb; --ai-agent-panel-user-ink: #3c6cc0; --ai-agent-panel-sand-fill: #fdf3e4; --ai-agent-panel-sand-ink: #d98a1c; }`;
	const css = [
		block(PALETTES.light),
		block(PALETTES.dark),
		".ai-agent-panel-scope.mod-prompt-color-sand, .ai-agent-panel-scope.mod-prompt-color-sand .ai-agent-panel-scope { --ai-agent-panel-user-bg: var(--ai-agent-panel-sand-fill); --ai-agent-panel-user-ink: var(--ai-agent-panel-sand-ink); }",
	].join("\n");
	assert.deepEqual(contrastBelow(css, promptPairs("mist"), "mist"), []);
	const found = contrastBelow(css, promptPairs("sand"), "sand");
	// #d98a1c on #fdf3e4 is 2.7:1: fails the 4.5 pair, passes none of the 3.
	assert.ok(found.some((f) => f.startsWith("light: user-ink on user-bg 2.")), found.join("\n"));
	assert.ok(!found.some((f) => f.includes("text on user-bg")));
	// A selection that makes a cycle is reported as no color.
	const cyclic = css.replace("--ai-agent-panel-sand-fill: #fdf3e4;", "--ai-agent-panel-sand-fill: var(--ai-agent-panel-user-bg);");
	assert.ok(contrastBelow(cyclic, promptPairs("sand"), "sand").some((f) => f.startsWith("light: user-bg is no color")));
});

test("PRD-001.R28, R34: the contrast check fails a faint pair, composites alpha, resolves color-mix and rejects a non-color", () => {
	const block = (selector, faint, fill) =>
		`${selector} { --ai-agent-panel-bg: #ffffff; --ai-agent-panel-fill: ${fill}; --ai-agent-panel-text: #000; ` +
		`--ai-agent-panel-text-faint: ${faint}; --ai-agent-panel-accent: var(--interactive-accent); ` +
		`--ai-agent-panel-ring: color-mix(in srgb, var(--ai-agent-panel-accent) 50%, transparent); ` +
		`--ai-agent-panel-soft: rgba(0, 0, 0, 0.5); }`;
	const css = [block(PALETTES.light, "#ababab", "rgba(0, 0, 0, 0.5)"), block(PALETTES.dark, "rgba(0, 0, 0, 0.3)", "var(--x)")].join("\n");
	const pairs = [
		["text-faint", "bg", TEXT_MINIMUM],
		["text-faint", "fill", TEXT_MINIMUM],
		["text", "fill", TEXT_MINIMUM],
		["text", "soft over fill", TEXT_MINIMUM],
		["ring", "bg", NON_TEXT_MINIMUM],
	];
	const found = contrastBelow(css, pairs);
	assert.ok(found.includes("light: text-faint on bg 2.30"), found.join("\n"));
	// #ababab on 50% black over white (#808080): 2.0:1.
	assert.ok(found.some((f) => f.startsWith("light: text-faint on fill ")), found.join("\n"));
	assert.ok(!found.some((f) => f.startsWith("light: text on fill ")), "black on mid grey passes");
	// Black on 50% black over 50% black over white (#404040): 2.0:1.
	assert.ok(found.some((f) => f.startsWith("light: text on soft over fill ")), found.join("\n"));
	// Half the accent over white: #c5aefa against white, 1.95:1.
	assert.ok(found.includes("light: ring on bg 1.95"), found.join("\n"));
	assert.ok(found.some((f) => f.startsWith("dark: text-faint on bg ")), "30% black on white fails");
	assert.ok(found.includes("dark: fill is no color (var(--x))"), found.join("\n"));
	assert.equal(contrast([0, 0, 0], [255, 255, 255]).toFixed(1), "21.0");
	assert.deepEqual(mix([255, 0, 0, 1], 0.4, [0, 0, 0, 0], undefined), [255, 0, 0, 0.4], "a mix into transparent keeps the hue");
});
