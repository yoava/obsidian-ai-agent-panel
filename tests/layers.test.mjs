/**
 * DES-003 Layout model, stacking: every floating layer (popovers and hover
 * cards in the main column's layer, the suggests) draws above every sticky
 * or positioned element of the panel. Every z-index reads one of the token
 * block's `--ai-agent-panel-z-*` tokens, and no ancestor of a floating layer
 * starts a stacking context through a declaration below. The `container`
 * shorthand on the root and the main column may start one; that is harmless:
 * the main column encloses the layer, the suggests, the pinned prompt and the
 * rail, and only the column's section headers and handle sit outside it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules } from "./css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_BLOCK = ".ai-agent-panel-scope";
/** The elements every floating element draws in; each sets its own z-index. */
const FLOATING_ROOTS = ["ai-agent-panel-layer", "ai-agent-panel-suggest"];
/** Floating elements: the roots and what draws inside the layer. */
const FLOATING = [...FLOATING_ROOTS, "ai-agent-panel-popover", "ai-agent-panel-hover-card"];
/** The floating roots' ancestors: root, main column, composer area, composer card. Kept by hand with ui/shell and ui/composer. */
const ANCESTORS = ["ai-agent-panel", "ai-agent-panel-main", "ai-agent-panel-composer-area", "ai-agent-panel-composer"];
/** Properties that start a stacking context whatever their value (z-index does on a positioned element). */
const STACKING_PROPERTIES = new Set([
	"z-index",
	"opacity",
	"transform",
	"filter",
	"backdrop-filter",
	"perspective",
	"clip-path",
	"mask",
	"mask-image",
	"mix-blend-mode",
	"will-change",
]);

/** A declaration block's declarations as [property, value]. */
const declarations = (body) =>
	body
		.split(";")
		.filter((d) => d.includes(":"))
		.map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]);

const startsStackingContext = (body) =>
	declarations(body).some(
		([property, value]) =>
			STACKING_PROPERTIES.has(property) ||
			(property === "isolation" && value === "isolate") ||
			(property === "contain" && /\b(?:layout|paint|strict|content)\b/.test(value))
	);

const hasClass = (compound, name) => new RegExp(`\\.${name}(?![\\w-])`).test(compound);

/** The last compound of a complex selector: the element the rule styles. */
function subject(selector) {
	let depth = 0;
	let start = 0;
	for (let i = 0; i < selector.length; i++) {
		const ch = selector[i];
		if (ch === "(") depth++;
		else if (ch === ")") depth--;
		else if (depth === 0 && /[\s>+~]/.test(ch)) start = i + 1;
	}
	return selector.slice(start);
}

const zIndex = (body) => declarations(body).find(([property]) => property === "z-index")?.[1] ?? null;

/** Every breach of the stacking order in `css`, as "selector: what". */
export function stackingBreaches(css) {
	const rules = parseRules(css);
	const out = [];
	const tokens = new Map();
	for (const rule of rules.filter((r) => r.prelude === TOKEN_BLOCK))
		for (const [, name, value] of rule.body.matchAll(/(--ai-agent-panel-z-[\w-]+)\s*:\s*([^;]+)/g)) tokens.set(name, Number(value.trim()));
	const resolve = (rule, value) => {
		const token = /^var\(\s*(--ai-agent-panel-z-[\w-]+)\s*\)$/.exec(value);
		if (!token) {
			out.push(`${rule.prelude}: z-index ${value} reads no --ai-agent-panel-z-* token`);
			return null;
		}
		const z = tokens.get(token[1]);
		if (z === undefined || !Number.isFinite(z)) {
			out.push(`${rule.prelude}: z-index token ${token[1]} is not a number in the token block`);
			return null;
		}
		return z;
	};
	const floating = [];
	const others = [];
	for (const rule of rules) {
		if (rule.prelude === TOKEN_BLOCK) continue;
		const subjects = rule.selectors.filter((s) => !s.includes("::")).map(subject);
		const value = zIndex(rule.body);
		if (value !== null) {
			const z = resolve(rule, value);
			if (z !== null)
				(subjects.some((s) => FLOATING.some((name) => hasClass(s, name))) ? floating : others).push({ rule, z });
		}
		for (const s of subjects)
			for (const name of ANCESTORS)
				if (hasClass(s, name) && startsStackingContext(rule.body))
					out.push(`${rule.prelude}: starts a stacking context on .${name}, an ancestor of a floating layer`);
	}
	for (const name of FLOATING_ROOTS)
		if (!floating.some(({ rule }) => rule.selectors.some((s) => hasClass(subject(s), name))))
			out.push(`.${name}: sets no z-index`);
	for (const float of floating)
		for (const other of others)
			if (float.z <= other.z)
				out.push(`${float.rule.prelude}: z-index ${float.z} is not above ${other.rule.prelude}'s ${other.z}`);
	return out;
}

const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("DES-003 Layout model: every floating layer draws above every sticky or positioned element", () => {
	assert.deepEqual(stackingBreaches(STYLES), []);
});

test("DES-003 Layout model: the stacking check fires", () => {
	const tokens = `.ai-agent-panel-scope { --ai-agent-panel-z-sticky: 1; --ai-agent-panel-z-float: 4; }`;
	const ok = `${tokens}
.ai-agent-panel-layer { position: absolute; z-index: var(--ai-agent-panel-z-float); }
.ai-agent-panel-suggest { position: absolute; z-index: var(--ai-agent-panel-z-float); }
.ai-agent-panel-pin { position: sticky; z-index: var(--ai-agent-panel-z-sticky); }`;
	assert.deepEqual(stackingBreaches(ok), [], "a sound order passes");
	const cases = [
		[`.ai-agent-panel-pin { position: sticky; z-index: var(--ai-agent-panel-z-float); }`, /is not above/],
		[`.ai-agent-panel-rail { position: absolute; z-index: 9; }`, /reads no --ai-agent-panel-z-\* token/],
		[`.ai-agent-panel-rail { z-index: var(--ai-agent-panel-z-missing); }`, /is not a number/],
		[`.ai-agent-panel-main .ai-agent-panel-composer.is-busy { opacity: 0.5; }`, /stacking context on \.ai-agent-panel-composer,/],
		[`.ai-agent-panel-composer-area { transform: translateY(0); }`, /stacking context on \.ai-agent-panel-composer-area/],
	];
	for (const [rule, breach] of cases)
		assert.match(stackingBreaches(`${ok}\n${rule}`).join("\n"), breach, rule);
	assert.match(
		stackingBreaches(ok.replace("z-index: var(--ai-agent-panel-z-float); }\n.ai-agent-panel-suggest", "}\n.ai-agent-panel-suggest")).join("\n"),
		/\.ai-agent-panel-layer: sets no z-index/,
		"a floating root with no z-index"
	);
	assert.deepEqual(
		stackingBreaches(`${ok}\n.ai-agent-panel-composer-chip { opacity: 0.5; }\n.ai-agent-panel-composer::after { opacity: 0; }`),
		[],
		"a descendant's or a pseudo-element's own stacking context traps nothing"
	);
});
