/**
 * ADR-017 Validation: every rule of styles.css keeps the panel's CSS rules.
 * The legacy tail is gone (ADR-017 Migration: the last slice deletes it), so
 * no line of the file is exempt.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules, splitList, splitComplex } from "./css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** What started the legacy tail; no line of styles.css may say it again. */
const TAIL = /legacy tail/i;

const NAMED_COLORS = new Set(
	(
		"aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown " +
		"burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan " +
		"darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid " +
		"darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet " +
		"deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
		"ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
		"lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow " +
		"lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray " +
		"lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine " +
		"mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise " +
		"mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab " +
		"orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru " +
		"pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
		"seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan " +
		"teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen"
	).split(" ")
);
const SYSTEM_COLORS = new Set(
	(
		"accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field " +
		"fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext"
	).split(" ")
);
/**
 * Obsidian's color variables, which no rule reads (ADR-017 Palettes and
 * mode: the palettes are literals; the accent's two sources are read only in
 * the palette blocks, checked by `paletteViolations`). Its spacing, radii and
 * UI font sizes are not read either (`OBSIDIAN_GEOMETRY_VAR`); font weights
 * and layers are read directly. The panel's own `--ai-agent-panel-*` are not
 * Obsidian's.
 */
const OBSIDIAN_COLOR_VAR = /^--(?!ai-agent-panel-)(?:(?:background|text|interactive|color|shadow)-|[\w-]*color)/;
/** ADR-017 Validation: no `--font-ui-*`, `--size-*` or `--radius-*` anywhere. */
const OBSIDIAN_GEOMETRY_VAR = /(?<![\w-])--(?:font-ui|size|radius)-[\w-]+/g;
const TOKEN_BLOCK = ".ai-agent-panel-scope";
/** ADR-017 Palettes and mode: the two palette blocks, after the token block. */
const PALETTE_BLOCKS = { light: ".ai-agent-panel-scope.is-light", dark: ".ai-agent-panel-scope.is-dark" };
const PREFIX = "--ai-agent-panel-";
/** The tokens each palette block declares, exactly (DES-003 Token contract). */
const PALETTE_TOKENS = [
	"accent", "accent-hover", "accent-line", "accent-soft", "accent-text", "added", "added-line", "added-soft",
	"added-word", "amber", "bg", "bg-recessed", "bg-translucent", "blend-mode", "cat-1", "cat-2", "cat-3",
	"cat-4", "cat-5", "cat-6", "code-function", "code-important", "code-keyword", "code-operator",
	"code-property", "code-string", "code-tag", "code-value", "cover", "embed-border", "error", "error-line",
	"error-soft", "fill", "fill-hover", "highlight-blue", "highlight-green", "highlight-orange",
	"highlight-purple", "highlight-red", "highlight-yellow", "input-shadow", "input-shadow-hover", "line",
	"line-strong", "mono", "ok", "ok-soft", "on-accent", "prompt-accent-fill", "prompt-accent-ink",
	"prompt-accent-line", "prompt-clear-fill", "prompt-clear-ink", "prompt-clear-line", "prompt-lavender-fill",
	"prompt-lavender-ink", "prompt-lavender-line", "prompt-mist-fill", "prompt-mist-ink", "prompt-mist-line",
	"prompt-rose-fill", "prompt-rose-ink", "prompt-rose-line", "prompt-sage-fill", "prompt-sage-ink",
	"prompt-sage-line", "prompt-sand-fill", "prompt-sand-ink", "prompt-sand-line", "prompt-sea-fill",
	"prompt-sea-ink", "prompt-sea-line", "prompt-stone-fill", "prompt-stone-ink", "prompt-stone-line", "removed",
	"removed-line", "removed-soft", "removed-word", "scrollbar-thumb", "scrollbar-thumb-active", "selection",
	"shadow", "shadow-small", "sponsor", "strip", "stuck", "surface", "swatch-shadow", "text", "text-faint", "text-muted",
	"track", "user-bg", "user-ink", "user-line", "warning", "warning-line", "warning-soft",
];
/** ADR-017 Prompt color: the nine named colors and the three tokens each has per palette. */
const PROMPT_COLOR_NAMES = ["clear", "sand", "stone", "sage", "sea", "mist", "lavender", "rose", "accent"];
/** The tokens a prompt selection re-aliases, in the order the rules declare them. */
const USER_TOKENS = ["user-bg", "user-line", "user-ink"];
/** ADR-017 Prompt color: the one custom property read without a declaration, set inline on the roots. */
const CUSTOM_PROPERTY = `${PREFIX}prompt-custom`;
/** A selector of the form a prompt selection rule has, named or not. */
const SELECTION_SHAPE = /^\.ai-agent-panel-scope\.mod-prompt-color-[\w-]+(?: \.ai-agent-panel-scope)?$/;
/** The Custom card's swatch, the only rule besides the Custom selection rule that reads it. */
const CUSTOM_SWATCH = ".ai-agent-panel-color-swatch.mod-custom";
/**
 * ADR-017 Validation, `PROMPT_SELECTION`: the one rule per color but Mist that re-aliases `user-bg`, `user-line` and
 * `user-ink` on a root and on the scope roots inside it, after the palette blocks, outside any at-rule.
 */
const PROMPT_SELECTION = [...PROMPT_COLOR_NAMES.filter((color) => color !== "mist"), "custom"].map((color) => ({
	color,
	selectors: [`.ai-agent-panel-scope.mod-prompt-color-${color}`, `.ai-agent-panel-scope.mod-prompt-color-${color} .ai-agent-panel-scope`],
	declarations:
		color === "custom"
			? [
					["user-bg", `var(${CUSTOM_PROPERTY})`],
					["user-line", `color-mix(in srgb, var(${CUSTOM_PROPERTY}), var(${PREFIX}text) 25%)`],
					["user-ink", `var(${PREFIX}text-muted)`],
				]
			: [
					["user-bg", `var(${PREFIX}prompt-${color}-fill)`],
					["user-line", `var(${PREFIX}prompt-${color}-line)`],
					["user-ink", `var(${PREFIX}prompt-${color}-ink)`],
				],
}));
/**
 * ADR-017 Validation, value types: the palette tokens whose value is exactly one `var()` alias, never a color of its
 * own; the dark accent ink is the only one that differs by palette.
 */
const ALIASES = {
	"user-bg": `var(${PREFIX}prompt-mist-fill)`,
	"user-line": `var(${PREFIX}prompt-mist-line)`,
	"user-ink": `var(${PREFIX}prompt-mist-ink)`,
	"prompt-accent-line": `var(${PREFIX}accent-line)`,
};
const DARK_ALIASES = { "prompt-accent-ink": `var(${PREFIX}accent-text)` };
/** Palette tokens whose value is a shadow list, a border or a blend mode; every other one is a color. */
const SHADOW_TOKENS = ["input-shadow", "input-shadow-hover", "shadow", "shadow-small", "stuck", "swatch-shadow"];
const BORDER_TOKENS = ["embed-border"];
const KEYWORD_TOKENS = ["blend-mode"];
/** The values of mix-blend-mode. */
const BLEND_MODES = new Set(
	(
		"normal multiply screen overlay darken lighten color-dodge color-burn hard-light soft-light difference " +
		"exclusion hue saturation color luminosity plus-darker plus-lighter"
	).split(" ")
);
/** The accent's sources (ADR-017 Accent): each read only as the whole value of its token, in the palette blocks. */
const ACCENT_SOURCES = { "--interactive-accent": `${PREFIX}accent`, "--text-on-accent": `${PREFIX}on-accent` };
/** The re-declaration contract: `names` re-declared on each palette, `excluded` never declared. */
const CONTRACT = JSON.parse(readFileSync(path.join(ROOT, "tests", "fixtures", "redeclared.json"), "utf8"));
/** ADR-017's theme-switch fence, the one rule that may use !important. */
const FENCE_SELECTORS = [
	".ai-agent-panel-scope.is-switching-theme",
	".ai-agent-panel-scope.is-switching-theme *",
	".ai-agent-panel-scope.is-switching-theme *::before",
	".ai-agent-panel-scope.is-switching-theme *::after",
];
const FENCE_BODY = "transition: none !important;";
const PREFIXED = /\.ai-agent-panel(?:-[\w-]+)?(?![\w-])/;
/** ADR-017 Tabs: the board's prefixed ancestor; Obsidian's `.workspace-*` classes only after it. */
const BOARD = ".ai-agent-panel-board";
const HOVER = "@media (hover: hover)";
/** ADR-017 Tabs, the tab parts an override may have as its subject. */
const TAB_PARTS = [
	"workspace-tab-header-container", "workspace-tab-header-container-inner", "workspace-tab-header",
	"workspace-tab-header-inner", "workspace-tab-header-inner-title", "workspace-tab-header-inner-icon",
	"workspace-tab-header-inner-close-button", "workspace-tab-header-status-container",
];
/** ADR-017 Tabs, the override table, row by row: [selectors under the board, at-rule context, declarations]. */
const OVERRIDE_TABLE = [
	[[".workspace-tab-header-container"], "", { height: "var(--header-height)", padding: "0", margin: "0", "app-region": "no-drag", direction: "ltr" }],
	[["light", "dark"].map((mode) => `.ai-agent-panel-scope.is-${mode} ${BOARD} .workspace-tab-header-container`), "", { "background-color": "var(--tab-container-background)" }],
	[[".workspace-tab-header-container::before", ".workspace-tab-header-container::after"], "", { content: "none" }],
	[[".workspace-tab-header-container-inner"], "", { margin: "0", padding: "var(--ai-agent-panel-tab-strip-padding)", "app-region": "no-drag" }],
	[[".workspace-tab-header"], "", {
		"writing-mode": "horizontal-tb", "text-orientation": "mixed", width: "var(--tab-width)", padding: "var(--ai-agent-panel-tab-padding)",
		"border-radius": "var(--tab-radius-active)", "box-shadow": "none", "background-color": "transparent",
	}],
	[[".workspace-tab-header.is-active"], "", { "box-shadow": "inset 0 0 0 1px var(--tab-outline-color)", "background-color": "var(--tab-background-active)" }],
	[[".workspace-tab-header.is-active::before", ".workspace-tab-header.is-active::after"], "", { display: "block" }],
	[[".workspace-tab-header-inner"], "", { padding: "var(--ai-agent-panel-tab-inner-padding)", "border-radius": "var(--tab-radius)" }],
	[[".workspace-tab-header:hover .workspace-tab-header-inner"], HOVER, { "background-color": "var(--tab-inner-background-hover)" }],
	[[".workspace-tab-header-inner::after"], "", { display: "block" }],
	[[".workspace-tab-header.is-active .workspace-tab-header-inner::after"], "", { display: "none" }],
	[[".workspace-tab-header:hover .workspace-tab-header-inner::after"], HOVER, { display: "none" }],
	[[".workspace-tab-header-inner-title"], "", {
		display: "block", order: "0", width: "auto", padding: "0", transform: "none", "text-align": "start",
		"mask-image": "var(--ai-agent-panel-tab-title-mask)",
	}],
	[[".workspace-tab-header-inner-icon"], "", { display: "flex", order: "0", cursor: "inherit", padding: "0", "border-radius": "0" }],
	[[".workspace-tab-header-inner-icon:hover"], HOVER, { "background-color": "transparent" }],
	[[".workspace-tab-header-inner-icon:active"], "", { cursor: "inherit" }],
	[[".workspace-tab-header-inner-close-button"], "", { display: "flex", order: "0", color: "inherit" }],
	[[".workspace-tab-header-status-container"], "", { display: "flex", order: "0" }],
];
/** ADR-017 Validation: every `!important` declaration but the fence's, as "selector|context|property|value". */
const IMPORTANT_ALLOW = new Set(
	OVERRIDE_TABLE.flatMap(([selectors, context, decls]) =>
		selectors.flatMap((selector) =>
			Object.entries(decls).map(([property, value]) =>
				[selector.startsWith(".ai-agent-panel-") ? selector : `${BOARD} ${selector}`, context, property, value].join("|")
			)
		)
	)
);

/** ADR-017 Validation, selector containment: why `selector` reaches outside the panel; null when it does not. */
function containmentBreach(selector) {
	const { compounds, combinators } = splitComplex(selector);
	if (!PREFIXED.test(compounds[0] ?? "")) return "no prefixed class in the first compound";
	if (combinators[0] === "+" || combinators[0] === "~") return `"${combinators[0]}" after the first compound`;
	const board = compounds.findIndex((compound) => compound.split(/(?=[.:[])/).includes(BOARD));
	const workspace = compounds.findIndex((compound) => /\.workspace-/.test(compound));
	if (workspace !== -1 && (board === -1 || workspace <= board)) return ".workspace-* not after .ai-agent-panel-board";
	return null;
}

/** The subject of `selector` without its pseudo-classes and pseudo-element, if it is one tab part (ADR-017 Validation). */
function tabPartSubject(selector) {
	const { compounds } = splitComplex(selector);
	const subject = compounds.at(-1).replace(/::(?:before|after)$/, "").replace(/:(?:hover|active)$/, "");
	const [part, ...states] = subject.split(".").slice(1);
	return /^[.\w-]+$/.test(subject) && TAB_PARTS.includes(part) && states.every((state) => state === "is-active") ? part : null;
}

/** Whether `!important` on this declaration is an `IMPORTANT_ALLOW` entry. */
function importantAllowed(selector, context, property, value) {
	const key = [selector.replace(/\s+/g, " "), context.join(" ").replace(/\s+/g, " "), property, value.replace(/\s+/g, " ")].join("|");
	return IMPORTANT_ALLOW.has(key) && tabPartSubject(selector) !== null;
}

/** Color literals among a declaration block's values. */
function colorLiterals(body, forcedColors) {
	const found = [];
	for (const declaration of body.split(";")) {
		const colon = declaration.indexOf(":");
		if (colon === -1) continue;
		const value = declaration.slice(colon + 1).replace(/--[\w-]+/g, " ");
		for (const hex of value.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) found.push(hex);
		for (const fn of value.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi) ?? []) found.push(fn);
		for (const word of value.match(/[A-Za-z][\w-]*/g) ?? []) {
			const lower = word.toLowerCase();
			if (NAMED_COLORS.has(lower)) found.push(word);
			else if (SYSTEM_COLORS.has(lower) && !forcedColors) found.push(word);
		}
	}
	return found;
}

/** Every breach of ADR-017's rules in the whole file, as "selector: what". */
export function violations(css) {
	const out = [];
	for (const rule of parseRules(css)) {
		if (rule.context.some((at) => at.startsWith("@keyframes"))) {
			for (const color of colorLiterals(rule.body, false)) out.push(`${rule.prelude}: color literal ${color}`);
			continue;
		}
		const fence =
			rule.context.length === 0 &&
			JSON.stringify(rule.selectors) === JSON.stringify(FENCE_SELECTORS) &&
			rule.body.trim().replace(/\s+/g, " ") === FENCE_BODY;
		const forced = rule.context.some((at) => /forced-colors\s*:\s*active/.test(at));
		const palette = rule.context.length === 0 && Object.values(PALETTE_BLOCKS).includes(rule.prelude);
		for (const selector of rule.selectors) {
			const breach = containmentBreach(selector);
			if (breach) out.push(`${selector}: ${breach}`);
			if (/\.theme-(light|dark)\b/.test(selector)) out.push(`${selector}: keys on Obsidian's mode class`);
			if (splitComplex(selector).compounds.length > 3) out.push(`${selector}: more than three compounds`);
		}
		for (const at of rule.context)
			if (/\.theme-(light|dark)\b/.test(at)) out.push(`${at}: keys on Obsidian's mode class`);
		/** Declarations whose `!important` the override table allows, for every selector of the rule. */
		const allowed = new Set(
			declarations(rule.body)
				.filter(([, value]) => /!\s*important$/i.test(value))
				.filter(([property, value]) => {
					const bare = value.replace(/\s*!\s*important$/i, "");
					return rule.selectors.length > 0 && rule.selectors.every((selector) => importantAllowed(selector, rule.context, property, bare));
				})
				.map(([property, value]) => `${property}: ${value}`)
		);
		if (!fence && declarations(rule.body).some(([property, value]) => /!\s*important/i.test(value) && !allowed.has(`${property}: ${value}`)))
			out.push(`${rule.prelude}: !important`);
		if (/--[\w-]+-rgb\b|--accent-[hsl]\b/.test(rule.body)) out.push(`${rule.prelude}: channel variable`);
		for (const [name] of rule.body.matchAll(OBSIDIAN_GEOMETRY_VAR)) out.push(`${rule.prelude}: names Obsidian's ${name}`);
		if (/scroll-state\(/.test([...rule.context, rule.body].join(" "))) out.push(`${rule.prelude}: scroll-state()`);
		if (palette) continue;
		for (const color of colorLiterals(rule.body, forced)) out.push(`${rule.prelude}: color literal ${color}`);
		// An allowed override reads Obsidian's `--tab-*` as its table row says (ADR-017 Tabs).
		for (const [property, value] of declarations(rule.body).filter(([p, v]) => !allowed.has(`${p}: ${v}`)))
			for (const [, name] of `${property}: ${value}`.matchAll(/var\(\s*(--[\w-]+)/g))
				if (OBSIDIAN_COLOR_VAR.test(name))
					out.push(`${rule.prelude}: reads the Obsidian color variable ${name} outside the palette blocks`);
	}
	return out;
}

/** A declaration block's declarations as [property, value], in order. */
function declarations(body) {
	return body
		.split(";")
		.map((d) => d.trim())
		.filter(Boolean)
		.map((d) => {
			const colon = d.indexOf(":");
			return [d.slice(0, colon).trim(), d.slice(colon + 1).trim().replace(/\s+/g, " ")];
		});
}

const MIX_ARG = String.raw`(?:var\(${PREFIX}[\w-]+\)|white|black|transparent)(?: [\d.]+%)?`;
const COLOR_MIX = new RegExp(String.raw`^color-mix\(in srgb, ${MIX_ARG}, ${MIX_ARG}\)$`);
const COLOR_LITERAL = /^(?:#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\))$/i;

const LENGTH = /^(?:0|-?(?:\d+|\d*\.\d+)(?:px|em|rem))$/;
const isColorLiteral = (value) => COLOR_LITERAL.test(value) || NAMED_COLORS.has(value.toLowerCase());

/** Whether `value` is a box-shadow list: each shadow 2-4 lengths (the third, the blur, not negative), one color literal, `inset` at most once. */
function isShadowList(value) {
	return splitList(value).every((shadow) => {
		const parts = shadow.match(/[\w.#-]+\([^)]*\)|\S+/g) ?? [];
		const at = parts.flatMap((part, i) => (LENGTH.test(part) ? [i] : []));
		const colors = parts.filter(isColorLiteral).length;
		const insets = parts.filter((part) => part === "inset").length;
		const contiguous = at.every((index, i) => i === 0 || index === at[i - 1] + 1);
		const blur = at.length >= 3 ? parts[at[2]] : "0";
		return at.length >= 2 && at.length <= 4 && contiguous && !blur.startsWith("-") && colors === 1 && insets <= 1 && at.length + colors + insets === parts.length;
	});
}

/** Why a palette token's value is not of its type (ADR-017 Validation, value types); null when it is. */
function valueTypeBreach(token, value, mode) {
	const alias = ALIASES[token] ?? (mode === "dark" ? DARK_ALIASES[token] : undefined);
	if (alias !== undefined) return value === alias ? null : `is ${value}, not ${alias}`;
	const source = Object.entries(ACCENT_SOURCES).find(([, name]) => name === PREFIX + token)?.[0];
	if (source) return value === `var(${source})` ? null : `is ${value}, not var(${source})`;
	if (SHADOW_TOKENS.includes(token)) return isShadowList(value) ? null : `is no shadow list of literals: ${value}`;
	if (BORDER_TOKENS.includes(token))
		return /^\d+px (?:solid|dashed|dotted|double) (\S+)$/i.test(value) &&
			(isColorLiteral(value.split(" ")[2]) || /^var\(--ai-agent-panel-[\w-]+\)$/.test(value.split(" ")[2]))
			? null
			: `is no border of a width, a style and a color: ${value}`;
	if (KEYWORD_TOKENS.includes(token)) return BLEND_MODES.has(value) ? null : `is no blend mode: ${value}`;
	if (isColorLiteral(value) || COLOR_MIX.test(value)) return null;
	return `is neither a color literal nor a color-mix() of tokens: ${value}`;
}

/** The first `var()` cycle among custom properties, as "a -> b -> a"; null when acyclic. */
function varCycle(decls) {
	const graph = new Map(decls.map(([property, value]) => [property, [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1])]));
	const state = new Map();
	const visit = (node, trail) => {
		if (state.get(node) === "done" || !graph.has(node)) return null;
		if (state.get(node) === "open") return [...trail.slice(trail.indexOf(node)), node].join(" -> ");
		state.set(node, "open");
		for (const next of graph.get(node)) {
			const cycle = visit(next, [...trail, node]);
			if (cycle) return cycle;
		}
		state.set(node, "done");
		return null;
	};
	for (const node of graph.keys()) {
		const cycle = visit(node, []);
		if (cycle) return cycle;
	}
	return null;
}

/**
 * Every breach of ADR-017's palette rules (Validation), as "where: what": the
 * first three rules, each palette's exact token set and `color-scheme`, the
 * re-declaration contract in both directions, where the accent's sources are
 * read, no excluded name declared, every token read declared in the token
 * block or in both palettes, an acyclic `var()` graph per palette, and each
 * palette token's value type.
 */
export function paletteViolations(css, contract = CONTRACT, paletteTokens = PALETTE_TOKENS, selection = PROMPT_SELECTION) {
	const out = [];
	const rules = parseRules(css);
	const opening = [TOKEN_BLOCK, PALETTE_BLOCKS.light, PALETTE_BLOCKS.dark];
	opening.forEach((selector, i) => {
		if (rules[i]?.prelude !== selector || rules[i].context.length > 0)
			out.push(`rule ${i + 1}: ${rules[i]?.prelude ?? "none"}, not ${selector}`);
		if (rules.filter((rule) => rule.prelude === selector).length !== 1) out.push(`${selector}: not exactly one rule`);
	});
	const block = (selector) => declarations(rules.find((rule) => rule.prelude === selector && rule.context.length === 0)?.body ?? "");
	const tokenBlock = block(TOKEN_BLOCK);
	const tokenNames = new Set(tokenBlock.map(([property]) => property).filter((p) => p.startsWith(PREFIX)));
	const palettes = Object.entries(PALETTE_BLOCKS).map(([mode, selector]) => ({ mode, selector, decls: block(selector) }));
	const paletteNames = palettes.map(({ decls }) => new Set(decls.map(([p]) => p).filter((p) => p.startsWith(PREFIX))));
	const names = [...contract.names].sort();
	for (const { mode, selector, decls } of palettes) {
		const own = new Map(decls);
		const tokens = decls.map(([p]) => p).filter((p) => p.startsWith(PREFIX)).map((p) => p.slice(PREFIX.length)).sort();
		if (JSON.stringify(tokens) !== JSON.stringify([...paletteTokens].sort()))
			out.push(
				`${selector}: tokens differ from PALETTE_TOKENS (extra ${tokens.filter((t) => !paletteTokens.includes(t)).join(" ") || "none"}; ` +
					`missing ${paletteTokens.filter((t) => !tokens.includes(t)).join(" ") || "none"})`
			);
		if (own.get("color-scheme") !== mode) out.push(`${selector}: color-scheme ${own.get("color-scheme") ?? "missing"}, not ${mode}`);
		const redeclared = decls.filter(([p]) => !p.startsWith(PREFIX) && p !== "color-scheme");
		const declaredNames = redeclared.map(([p]) => p).sort();
		if (JSON.stringify(declaredNames) !== JSON.stringify(names)) {
			for (const name of names) if (!declaredNames.includes(name)) out.push(`${selector}: contract name ${name} not re-declared`);
			for (const name of new Set(declaredNames)) {
				if (!names.includes(name)) out.push(`${selector}: ${name} declared, not in the contract`);
				if (declaredNames.indexOf(name) !== declaredNames.lastIndexOf(name)) out.push(`${selector}: ${name} re-declared more than once`);
			}
		}
		for (const [property, value] of redeclared) {
			const token = /^var\((--ai-agent-panel-[\w-]+)\)$/.exec(value)?.[1];
			if (!token) out.push(`${selector}: ${property} is ${value}, not var(${PREFIX}…)`);
			else if (!tokenNames.has(token) && !own.has(token)) out.push(`${selector}: ${property} reads ${token}, which neither the token block nor this palette declares`);
		}
		for (const [property, value] of decls.filter(([p]) => p.startsWith(PREFIX))) {
			const breach = valueTypeBreach(property.slice(PREFIX.length), value, mode);
			if (breach) out.push(`${selector}: ${property} ${breach}`);
		}
		const cycle = varCycle([...tokenBlock, ...decls].filter(([p]) => p.startsWith("--")));
		if (cycle) out.push(`${selector}: var() cycle ${cycle}`);
	}
	const inBoth = new Set([...paletteNames[0]].filter((name) => paletteNames[1].has(name)));
	const excluded = new Set(contract.excluded.map((e) => e.name));
	/** A rule is an entry's only if its whole selector list is the entry's, outside any at-rule. */
	const isEntry = (rule, entry) => rule.context.length === 0 && JSON.stringify(rule.selectors) === JSON.stringify(entry.selectors);
	const selectionRules = new Set();
	for (const [i, rule] of rules.entries()) if (i > 2 && selection.some((entry) => isEntry(rule, entry))) selectionRules.add(rule);
	for (const rule of rules) {
		const isPalette = rule.context.length === 0 && Object.values(PALETTE_BLOCKS).includes(rule.prelude);
		for (const [property, value] of declarations(rule.body)) {
			if (excluded.has(property)) out.push(`${rule.prelude}: declares the excluded ${property}`);
			if (!isPalette && !selectionRules.has(rule) && property.startsWith(PREFIX) && paletteTokens.includes(property.slice(PREFIX.length)))
				out.push(`${rule.prelude}: declares the palette token ${property}`);
			for (const [, source] of value.matchAll(/var\(\s*(--interactive-accent|--text-on-accent)(?![\w-])/g))
				if (!isPalette || ACCENT_SOURCES[source] !== property || value !== `var(${source})`)
					out.push(`${rule.prelude}: reads ${source} in ${property}`);
		}
	}
	for (const [property, value] of tokenBlock.filter(([p]) => p.startsWith(PREFIX)))
		if (
			colorLiterals(`${property}: ${value}`, false).length > 0 ||
			/color-mix\(|\b(?:transparent|currentcolor)\b/i.test(value) ||
			[...value.matchAll(/var\(\s*--ai-agent-panel-([\w-]+)/g)].some(([, token]) => paletteTokens.includes(token))
		)
			out.push(`${TOKEN_BLOCK}: ${property} holds a color: ${value}`);
	const known = new Set([...tokenNames, ...inBoth]);
	/** The rules that may read the Custom property: the Custom selection rule and the Custom swatch. */
	const customEntry = selection.find(({ color }) => color === "custom");
	const customReaders = new Set(
		rules.filter((rule) => rule.context.length === 0 && ((customEntry !== undefined && isEntry(rule, customEntry)) || rule.prelude === CUSTOM_SWATCH))
	);
	for (const rule of rules)
		for (const [, name] of rule.body.matchAll(/var\(\s*(--ai-agent-panel-[\w-]+)/g))
			if (!known.has(name) && !(name === CUSTOM_PROPERTY && customReaders.has(rule))) out.push(`${rule.prelude}: reads ${name}, declared nowhere`);
	out.push(...selectionViolations(rules, selection, palettes, tokenBlock));
	return out;
}

/**
 * Every breach of ADR-017's Prompt color selection rules (Validation, `PROMPT_SELECTION`): one rule per entry,
 * after the palette blocks, outside any at-rule, with exactly the declarations of the entry, and no cycle in either
 * palette with that rule applied over it; the Custom property read only by the Custom rule and the Custom swatch.
 */
function selectionViolations(rules, selection, palettes, tokenBlock) {
	const out = [];
	for (const { color, selectors, declarations: expected } of selection) {
		const found = rules.filter((rule) => JSON.stringify(rule.selectors) === JSON.stringify(selectors));
		if (found.length !== 1) {
			out.push(`${selectors[0]}: ${found.length} rules, not one`);
			continue;
		}
		const [rule] = found;
		if (rule.context.length > 0) out.push(`${selectors[0]}: inside ${rule.context.join(" ")}`);
		if (rules.indexOf(rule) < 3) out.push(`${selectors[0]}: before the palette blocks`);
		const actual = declarations(rule.body).map(([property, value]) => [property.startsWith(PREFIX) ? property.slice(PREFIX.length) : property, value]);
		if (JSON.stringify(actual) !== JSON.stringify(expected))
			out.push(`${selectors[0]}: declares ${actual.map(([p, v]) => `${p}: ${v}`).join("; ")}, not ${expected.map(([p, v]) => `${p}: ${v}`).join("; ")}`);
		for (const { mode, selector, decls } of palettes) {
			const cycle = varCycle([...tokenBlock, ...decls, ...expected.map(([p, v]) => [PREFIX + p, v])].filter(([p]) => p.startsWith("--")));
			if (cycle) out.push(`${selector} with ${selectors[0]}: var() cycle ${cycle}`);
		}
	}
	const named = new Set(selection.flatMap(({ selectors }) => selectors));
	for (const rule of rules)
		if (rule.selectors.some((selector) => SELECTION_SHAPE.test(selector) && !named.has(selector)))
			out.push(`${rule.prelude}: a prompt selection rule PROMPT_SELECTION does not name`);
	return out;
}

const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("ADR-017: styles.css opens with the token block and the two palettes and has no legacy tail", () => {
	const rules = parseRules(STYLES);
	assert.deepEqual(
		rules.slice(0, 3).map((rule) => rule.prelude),
		[TOKEN_BLOCK, PALETTE_BLOCKS.light, PALETTE_BLOCKS.dark],
		"the token block, then the light and dark palettes"
	);
	assert.equal(rules.filter((rule) => rule.prelude === TOKEN_BLOCK).length, 1, "one token block");
	assert.doesNotMatch(STYLES, TAIL, "no legacy tail, nor a marker for one");
});

test("ADR-017: every rule of styles.css keeps the panel's CSS rules", () => {
	assert.deepEqual(violations(STYLES), []);
});

test("ADR-017: the palettes declare PALETTE_TOKENS and the contract, read the accent only at its source, and resolve", () => {
	assert.equal(CONTRACT.names.length, 115, "the 115 names of ADR-017's contract");
	assert.equal(CONTRACT.obsidian, "1.14.4");
	assert.deepEqual(paletteViolations(STYLES), []);
});

test("ADR-017: the check finds each kind of breach", () => {
	const seeded = `
.ai-agent-panel-scope { --ai-agent-panel-bg: var(--background-primary); }
.ai-agent-panel-a { color: #fff; }
.ai-agent-panel-b { background: rgba(0, 0, 0, 0.1); }
.ai-agent-panel-c { border-color: red; }
.card { color: var(--ai-agent-panel-text); }
.theme-dark .ai-agent-panel-d { color: var(--ai-agent-panel-text); }
.ai-agent-panel-e { color: var(--ai-agent-panel-text) !important; }
.ai-agent-panel-f { background: rgba(var(--color-red-rgb), 0.2); }
.ai-agent-panel-g { color: var(--text-muted); }
.ai-agent-panel-h .x .y .z { color: var(--ai-agent-panel-text); }
.ai-agent-panel-i { border-color: Canvas; }
@media (forced-colors: active) { .ai-agent-panel-j { border-color: ButtonBorder; } }
.ai-agent-panel-scope.is-switching-theme,
.ai-agent-panel-scope.is-switching-theme *,
.ai-agent-panel-scope.is-switching-theme *::before,
.ai-agent-panel-scope.is-switching-theme *::after {
	transition: none !important;
}
.ai-agent-panel-k.is-switching-theme { opacity: 0 !important; }
.ai-agent-panel-l { white-space: nowrap; color: transparent; fill: currentColor; }
.ai-agent-panel-m { padding: var(--size-4-2); border-radius: var(--radius-m); font-size: var(--font-ui-small); }
.ai-agent-panel-n { font-family: var(--font-interface); font-weight: var(--font-semibold); z-index: var(--layer-popover); }
.ai-agent-panel-o { color: var(--icon-color); border-color: var(--background-modifier-border); }
@container scroll-state(stuck: top) { .ai-agent-panel-p { color: var(--ai-agent-panel-text); } }
.ai-agent-panel-q { --size-4-2: 8px; gap: var(--ai-agent-panel-space-8); font-size: var(--ai-agent-panel-font-size-ui); }
.ai-agent-panel-scope.is-light { --ai-agent-panel-bg: #fff; --ai-agent-panel-accent: var(--interactive-accent); }
@media (min-width: 1px) { .ai-agent-panel-scope.is-dark { --ai-agent-panel-bg: #000; } }
/* Legacy tail: no line below a marker is exempt. */
.legacy { color: #000 !important; }
`;
	const expect = [
		".ai-agent-panel-scope: reads the Obsidian color variable --background-primary outside the palette blocks",
		".ai-agent-panel-a: color literal #fff",
		".ai-agent-panel-b: color literal rgba(",
		".ai-agent-panel-c: color literal red",
		".card: no prefixed class in the first compound",
		".theme-dark .ai-agent-panel-d: keys on Obsidian's mode class",
		".theme-dark .ai-agent-panel-d: no prefixed class in the first compound",
		".ai-agent-panel-e: !important",
		".ai-agent-panel-f: channel variable",
		".ai-agent-panel-f: color literal rgba(",
		".ai-agent-panel-f: reads the Obsidian color variable --color-red-rgb outside the palette blocks",
		".ai-agent-panel-g: reads the Obsidian color variable --text-muted outside the palette blocks",
		".ai-agent-panel-h .x .y .z: more than three compounds",
		".ai-agent-panel-i: color literal Canvas",
		".ai-agent-panel-k.is-switching-theme: !important",
		".ai-agent-panel-o: reads the Obsidian color variable --icon-color outside the palette blocks",
		".ai-agent-panel-o: reads the Obsidian color variable --background-modifier-border outside the palette blocks",
		".ai-agent-panel-m: names Obsidian's --size-4-2",
		".ai-agent-panel-m: names Obsidian's --radius-m",
		".ai-agent-panel-m: names Obsidian's --font-ui-small",
		".ai-agent-panel-p: scroll-state()",
		".ai-agent-panel-q: names Obsidian's --size-4-2",
		// A palette block nested in an at-rule is no palette block.
		".ai-agent-panel-scope.is-dark: color literal #000",
		".legacy: no prefixed class in the first compound",
		".legacy: !important",
		".legacy: color literal #000",
	];
	assert.deepEqual(violations(seeded).sort(), expect.sort());
	assert.match(seeded, TAIL);
	assert.throws(() => parseRules(".ai-agent-panel-a { .b { color: red; } }"), /nested/);
	const fontFace = parseRules("@font-face { font-family: x; }\n@media (x) { .ai-agent-panel-a { color: red; } }");
	assert.deepEqual(
		fontFace.map((rule) => [rule.prelude, rule.selectors.length, rule.context.length]),
		[["@font-face", 0, 0], [".ai-agent-panel-a", 1, 1]],
		"an at-rule holding declarations parses as a rule with no selectors"
	);
});

test("ADR-017: IMPORTANT_ALLOW mirrors the override table, each subject a tab part", () => {
	assert.equal(IMPORTANT_ALLOW.size, 48, "the table's 48 selector, context, property and value entries");
	for (const entry of IMPORTANT_ALLOW) {
		const [selector] = entry.split("|");
		assert.ok(tabPartSubject(selector), `${selector}: its subject is a tab part or its pseudo-element`);
		assert.equal(containmentBreach(selector), null, `${selector}: under ${BOARD}`);
	}
	assert.equal(tabPartSubject(`${BOARD} .workspace-tab-header + .ai-agent-panel-card`), null);
	assert.equal(tabPartSubject(`${BOARD} .workspace-tab-header[data-key]`), null);
});

test("ADR-017: !important passes only as the fence or an IMPORTANT_ALLOW entry in its context", () => {
	const block = OVERRIDE_TABLE.map(([selectors, context, decls]) => {
		const list = selectors.map((selector) => (selector.startsWith(".ai-agent-panel-") ? selector : `${BOARD}   ${selector}`)).join(",\n");
		const rule = `${list} {\n${Object.entries(decls).map(([p, v]) => `\t${p}: ${v} !important;`).join("\n")}\n}`;
		return context ? `${context} {\n${rule}\n}` : rule;
	}).join("\n");
	assert.deepEqual(violations(block), [], "the table itself, whitespace aside");
	const seeds = [
		[`${BOARD} .workspace-tab-header + .ai-agent-panel-card { display: none !important; }`, [`${BOARD} .workspace-tab-header + .ai-agent-panel-card: !important`]],
		[`${BOARD} .workspace-tab-header .ai-agent-panel-x { color: red !important; }`, [
			`${BOARD} .workspace-tab-header .ai-agent-panel-x: !important`,
			`${BOARD} .workspace-tab-header .ai-agent-panel-x: color literal red`,
		]],
		[`${BOARD} .workspace-tab-header-inner-title { color: inherit !important; }`, [`${BOARD} .workspace-tab-header-inner-title: !important`]],
		[`${BOARD} .workspace-tab-header-container { height: 31px !important; }`, [`${BOARD} .workspace-tab-header-container: !important`]],
		[`${BOARD} .workspace-tab-header:hover::before { display: block !important; }`, [`${BOARD} .workspace-tab-header:hover::before: !important`]],
	];
	for (const [css, expected] of seeds) assert.deepEqual(violations(css).sort(), [...expected].sort(), css);
});

test("ADR-017: selector containment anchors the first compound and admits .workspace-* only after the board", () => {
	const probes = [
		[`body:has(${BOARD}) .x { color: var(--ai-agent-panel-text); }`, [`body:has(${BOARD}) .x: no prefixed class in the first compound`]],
		[`${BOARD} + .x { color: var(--ai-agent-panel-text); }`, [`${BOARD} + .x: "+" after the first compound`]],
		[`.ai-agent-panel-a ~ .x { color: var(--ai-agent-panel-text); }`, [`.ai-agent-panel-a ~ .x: "~" after the first compound`]],
		[`:is(.ai-agent-panel-a) .x { color: var(--ai-agent-panel-text); }`, [`:is(.ai-agent-panel-a) .x: no prefixed class in the first compound`]],
		[`.workspace-tab-header ${BOARD} { color: var(--ai-agent-panel-text); }`, [
			`.workspace-tab-header ${BOARD}: no prefixed class in the first compound`,
		]],
		[`.ai-agent-panel-a .workspace-tab-header { color: var(--ai-agent-panel-text); }`, [
			`.ai-agent-panel-a .workspace-tab-header: .workspace-* not after .ai-agent-panel-board`,
		]],
		[`${BOARD}.workspace-tab-header { color: var(--ai-agent-panel-text); }`, [
			`${BOARD}.workspace-tab-header: .workspace-* not after .ai-agent-panel-board`,
		]],
	];
	for (const [css, expected] of probes) assert.deepEqual(violations(css), expected, css);
	const clean = `${BOARD}>.workspace-tab-header:has(+ .is-active) .workspace-tab-header-inner::after,
.ai-agent-panel-a .ai-agent-panel-b + .ai-agent-panel-c,
.ai-agent-panel-a > .ai-agent-panel-b ~ .ai-agent-panel-c,
.ai-agent-panel-a:not(.is-x) .ai-agent-panel-b { color: var(--ai-agent-panel-text); }`;
	assert.deepEqual(violations(clean), []);
});

test("ADR-017: the palette check finds each kind of breach, each seeded alone", () => {
	const contract = { names: ["--background-primary", "--text-normal", "--text-accent"], excluded: [{ name: "--callout-info", reason: "x" }] };
	const tokens = ["accent", "accent-text", "bg", "blend-mode", "embed-border", "on-accent", "shadow", "text"];
	const palette = (mode) => `.ai-agent-panel-scope.is-${mode} {
	--ai-agent-panel-accent: var(--interactive-accent);
	--ai-agent-panel-on-accent: var(--text-on-accent);
	--ai-agent-panel-accent-text: color-mix(in srgb, var(--ai-agent-panel-accent), white 40%);
	--ai-agent-panel-bg: #141417;
	--ai-agent-panel-blend-mode: lighten;
	--ai-agent-panel-embed-border: 2px solid var(--ai-agent-panel-accent);
	--ai-agent-panel-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 10px 22px -10px rgba(0, 0, 0, 0.7);
	--ai-agent-panel-text: #ededf0;
	--background-primary: var(--ai-agent-panel-bg);
	--text-normal: var(--ai-agent-panel-text);
	--text-accent: var(--ai-agent-panel-accent-text);
	color-scheme: ${mode};
}`;
	const clean = `.ai-agent-panel-scope { --ai-agent-panel-z-float: 4; --ai-agent-panel-gap: 4px; --ai-agent-panel-top: 0; color: var(--ai-agent-panel-text); }
${palette("light")}
${palette("dark")}
.ai-agent-panel-a { gap: var(--ai-agent-panel-gap); top: var(--ai-agent-panel-top); }`;
	assert.deepEqual(paletteViolations(clean, contract, tokens, []), []);
	const light = ".ai-agent-panel-scope.is-light";
	const dark = ".ai-agent-panel-scope.is-dark";
	/** Replace the dark palette's declaration of `property` with `value` (null drops it). */
	const inDark = (property, value) => (css) => {
		const at = css.indexOf(`${dark} {`);
		const re = new RegExp(`\\t${property}: [^;]*;\\n`);
		assert.match(css.slice(at), re, `the clean dark palette declares ${property}`);
		return css.slice(0, at) + css.slice(at).replace(re, value === null ? "" : `\t${property}: ${value};\n`);
	};
	const addTo = (mode, line) => (css) => css.replace(`color-scheme: ${mode};`, `color-scheme: ${mode};\n\t${line}`);
	const append = (rule) => (css) => `${css}\n${rule}`;
	/** Each breach seeded alone into the clean file, with exactly what it must report. */
	const seeds = [
		["rule order", (css) => `.ai-agent-panel-b { color: var(--ai-agent-panel-text); }\n${css}`, [
			"rule 1: .ai-agent-panel-b, not .ai-agent-panel-scope",
			"rule 2: .ai-agent-panel-scope, not .ai-agent-panel-scope.is-light",
			"rule 3: .ai-agent-panel-scope.is-light, not .ai-agent-panel-scope.is-dark",
		]],
		["an extra token", addTo("light", "--ai-agent-panel-extra: #fff;"), [`${light}: tokens differ from PALETTE_TOKENS (extra extra; missing none)`]],
		["a missing token", inDark("--ai-agent-panel-blend-mode", null), [`${dark}: tokens differ from PALETTE_TOKENS (extra none; missing blend-mode)`]],
		["a name outside the contract", addTo("light", "--hr-color: var(--ai-agent-panel-text);"), [`${light}: --hr-color declared, not in the contract`]],
		["a duplicate re-declaration", addTo("dark", "--text-normal: var(--ai-agent-panel-text);"), [`${dark}: --text-normal re-declared more than once`]],
		["a missing re-declaration", inDark("--text-normal", null), [`${dark}: contract name --text-normal not re-declared`]],
		["an excluded name", addTo("light", "--callout-info: var(--ai-agent-panel-text);"), [
			`${light}: --callout-info declared, not in the contract`,
			`${light}: declares the excluded --callout-info`,
		]],
		["a cycle", (css) => css.replace("--ai-agent-panel-z-float: 4;", "--ai-agent-panel-z-float: 4; --ai-agent-panel-loop: var(--ai-agent-panel-loop-2); --ai-agent-panel-loop-2: var(--ai-agent-panel-loop);"), [
			`${light}: var() cycle --ai-agent-panel-loop -> --ai-agent-panel-loop-2 -> --ai-agent-panel-loop`,
			`${dark}: var() cycle --ai-agent-panel-loop -> --ai-agent-panel-loop-2 -> --ai-agent-panel-loop`,
		]],
		["the wrong color-scheme", (css) => css.replace("color-scheme: dark", "color-scheme: light"), [`${dark}: color-scheme light, not dark`]],
		["a literal re-declaration", inDark("--text-accent", "hsl(258, 88%, 66%)"), [`${dark}: --text-accent is hsl(258, 88%, 66%), not var(--ai-agent-panel-…)`]],
		["an accent variant at the source", inDark("--ai-agent-panel-accent", "color-mix(in srgb, var(--interactive-accent), white 8%)"), [
			`${dark}: --ai-agent-panel-accent is color-mix(in srgb, var(--interactive-accent), white 8%), not var(--interactive-accent)`,
			`${dark}: reads --interactive-accent in --ai-agent-panel-accent`,
		]],
		["a shadow through var()", inDark("--ai-agent-panel-shadow", "var(--shadow-s)"), [`${dark}: --ai-agent-panel-shadow is no shadow list of literals: var(--shadow-s)`]],
		["a shadow that is a bare color", inDark("--ai-agent-panel-shadow", "red"), [`${dark}: --ai-agent-panel-shadow is no shadow list of literals: red`]],
		["a shadow with two colors", inDark("--ai-agent-panel-shadow", "0 1px 2px red blue"), [`${dark}: --ai-agent-panel-shadow is no shadow list of literals: 0 1px 2px red blue`]],
		["a shadow with five lengths", inDark("--ai-agent-panel-shadow", "0 1px 2px 3px 4px red"), [`${dark}: --ai-agent-panel-shadow is no shadow list of literals: 0 1px 2px 3px 4px red`]],
		["a blend mode that is none", inDark("--ai-agent-panel-blend-mode", "banana"), [`${dark}: --ai-agent-panel-blend-mode is no blend mode: banana`]],
		["a border without a style", inDark("--ai-agent-panel-embed-border", "2px var(--ai-agent-panel-accent)"), [
			`${dark}: --ai-agent-panel-embed-border is no border of a width, a style and a color: 2px var(--ai-agent-panel-accent)`,
		]],
		["a border with a five-digit hex", inDark("--ai-agent-panel-embed-border", "2px solid #12345"), [
			`${dark}: --ai-agent-panel-embed-border is no border of a width, a style and a color: 2px solid #12345`,
		]],
		["a shadow with a negative blur", inDark("--ai-agent-panel-shadow", "0 0 -1px red"), [`${dark}: --ai-agent-panel-shadow is no shadow list of literals: 0 0 -1px red`]],
		["a color through var()", inDark("--ai-agent-panel-text", "var(--text-muted)"), [
			`${dark}: --ai-agent-panel-text is neither a color literal nor a color-mix() of tokens: var(--text-muted)`,
		]],
		["a color literal in the token block", (css) => css.replace("--ai-agent-panel-z-float: 4;", "--ai-agent-panel-z-float: 4; --ai-agent-panel-ring: inset 0 0 0 1px red;"), [
			".ai-agent-panel-scope: --ai-agent-panel-ring holds a color: inset 0 0 0 1px red",
		]],
		["a palette color in the token block", (css) => css.replace("--ai-agent-panel-z-float: 4;", "--ai-agent-panel-z-float: 4; --ai-agent-panel-tint: var(--ai-agent-panel-text);"), [
			".ai-agent-panel-scope: --ai-agent-panel-tint holds a color: var(--ai-agent-panel-text)",
		]],
		["a color-mix() in the token block", (css) => css.replace("--ai-agent-panel-z-float: 4;", "--ai-agent-panel-z-float: 4; --ai-agent-panel-tint: color-mix(in srgb, white 50%, transparent);"), [
			".ai-agent-panel-scope: --ai-agent-panel-tint holds a color: color-mix(in srgb, white 50%, transparent)",
		]],
		["transparent in the token block", (css) => css.replace("--ai-agent-panel-z-float: 4;", "--ai-agent-panel-z-float: 4; --ai-agent-panel-ring: inset 0 0 0 1px transparent;"), [
			".ai-agent-panel-scope: --ai-agent-panel-ring holds a color: inset 0 0 0 1px transparent",
		]],
		["currentColor in the token block", (css) => css.replace("--ai-agent-panel-z-float: 4;", "--ai-agent-panel-z-float: 4; --ai-agent-panel-ring: inset 0 0 0 1px currentColor;"), [
			".ai-agent-panel-scope: --ai-agent-panel-ring holds a color: inset 0 0 0 1px currentColor",
		]],
		["a palette token in a component", append(".ai-agent-panel-c { --ai-agent-panel-bg: #000; }"), [".ai-agent-panel-c: declares the palette token --ai-agent-panel-bg"]],
		["the accent read in a component", append(".ai-agent-panel-c { border-color: var(--interactive-accent); }"), [".ai-agent-panel-c: reads --interactive-accent in border-color"]],
		["a token declared nowhere", append(".ai-agent-panel-c { color: var(--ai-agent-panel-missing); }"), [".ai-agent-panel-c: reads --ai-agent-panel-missing, declared nowhere"]],
		["a token only a component declares", append(".ai-agent-panel-c { --ai-agent-panel-local: 1px; gap: var(--ai-agent-panel-local); }"), [
			".ai-agent-panel-c: reads --ai-agent-panel-local, declared nowhere",
		]],
		["a token one palette lacks", inDark("--ai-agent-panel-text", null), [
			`${dark}: tokens differ from PALETTE_TOKENS (extra none; missing text)`,
			`${dark}: --text-normal reads --ai-agent-panel-text, which neither the token block nor this palette declares`,
			".ai-agent-panel-scope: reads --ai-agent-panel-text, declared nowhere",
			`${light}: reads --ai-agent-panel-text, declared nowhere`,
			`${dark}: reads --ai-agent-panel-text, declared nowhere`,
		]],
	];
	for (const [name, seed, expected] of seeds) assert.deepEqual(paletteViolations(seed(clean), contract, tokens, []).sort(), [...expected].sort(), name);
});

test("ADR-017: the prompt color checks find each kind of breach, each seeded alone", () => {
	const contract = { names: ["--text-normal"], excluded: [] };
	const parts = ["fill", "line", "ink"];
	const tokens = [
		"accent", "accent-line", "accent-text", "bg", "text", "text-muted", ...USER_TOKENS,
		...PROMPT_COLOR_NAMES.flatMap((color) => parts.map((part) => `prompt-${color}-${part}`)),
	];
	const palette = (mode) => {
		const lines = [
			`--ai-agent-panel-accent: var(--interactive-accent);`,
			`--ai-agent-panel-accent-line: rgba(138, 92, 245, 0.4);`,
			`--ai-agent-panel-accent-text: color-mix(in srgb, var(--ai-agent-panel-accent), white 40%);`,
			`--ai-agent-panel-bg: #141417;`,
			`--ai-agent-panel-text: #ededf0;`,
			`--ai-agent-panel-text-muted: #aaaab2;`,
			...USER_TOKENS.map((token, i) => `--ai-agent-panel-${token}: var(--ai-agent-panel-prompt-mist-${parts[i]});`),
		];
		for (const color of PROMPT_COLOR_NAMES)
			lines.push(
				color === "accent"
					? `--ai-agent-panel-prompt-accent-fill: color-mix(in srgb, var(--ai-agent-panel-accent) 16%, var(--ai-agent-panel-bg));`
					: `--ai-agent-panel-prompt-${color}-fill: #1d2330;`,
				color === "accent" ? `--ai-agent-panel-prompt-accent-line: var(--ai-agent-panel-accent-line);` : `--ai-agent-panel-prompt-${color}-line: rgba(128, 164, 228, 0.36);`,
				color !== "accent"
					? `--ai-agent-panel-prompt-${color}-ink: #80a4e4;`
					: mode === "dark"
						? `--ai-agent-panel-prompt-accent-ink: var(--ai-agent-panel-accent-text);`
						: `--ai-agent-panel-prompt-accent-ink: color-mix(in srgb, var(--ai-agent-panel-accent), black 11%);`
			);
		return `.ai-agent-panel-scope.is-${mode} {\n\t${lines.join("\n\t")}\n\t--text-normal: var(--ai-agent-panel-text);\n\tcolor-scheme: ${mode};\n}`;
	};
	const rule = ({ selectors, declarations: decls }) => `${selectors.join(",\n")} {\n${decls.map(([p, v]) => `\t--ai-agent-panel-${p}: ${v};`).join("\n")}\n}`;
	const rules = PROMPT_SELECTION.map(rule);
	const build = (selectionRules = rules) => [".ai-agent-panel-scope { --ai-agent-panel-gap: 4px; }", palette("light"), palette("dark"), ...selectionRules, `${CUSTOM_SWATCH} { background-color: var(${CUSTOM_PROPERTY}); }`].join("\n");
	const clean = build();
	assert.deepEqual(paletteViolations(clean, contract, tokens), []);
	assert.equal(PROMPT_SELECTION.length, 9, "one rule per color but Mist");
	const sage = rules[PROMPT_SELECTION.findIndex(({ color }) => color === "sage")];
	const without = (drop) => build(rules.filter((r) => r !== drop));
	const sageSelector = ".ai-agent-panel-scope.mod-prompt-color-sage";
	const sageList = `${sageSelector},\n${sageSelector} .ai-agent-panel-scope`;
	const seeds = [
		["a rule missing", without(sage), [`${sageSelector}: 0 rules, not one`]],
		["a rule without the descendant branch", build(rules.map((r) => (r === sage ? r.replace(",\n.ai-agent-panel-scope.mod-prompt-color-sage .ai-agent-panel-scope", "") : r))), [
			`${sageSelector}: 0 rules, not one`,
			`${sageSelector}: declares the palette token --ai-agent-panel-user-bg`,
			`${sageSelector}: declares the palette token --ai-agent-panel-user-ink`,
			`${sageSelector}: declares the palette token --ai-agent-panel-user-line`,
		]],
		["a rule twice", build([...rules, sage]), [`${sageSelector}: 2 rules, not one`]],
		["a wrong value", build(rules.map((r) => (r === sage ? r.replace("prompt-sage-ink", "prompt-mist-ink") : r))), [
			`${sageSelector}: declares user-bg: var(--ai-agent-panel-prompt-sage-fill); user-line: var(--ai-agent-panel-prompt-sage-line); user-ink: var(--ai-agent-panel-prompt-mist-ink), not user-bg: var(--ai-agent-panel-prompt-sage-fill); user-line: var(--ai-agent-panel-prompt-sage-line); user-ink: var(--ai-agent-panel-prompt-sage-ink)`,
		]],
		["a fourth declaration", build(rules.map((r) => (r === sage ? r.replace("\n}", "\n\t--ai-agent-panel-bg: #000;\n}") : r))), [
			`${sageSelector}: declares user-bg: var(--ai-agent-panel-prompt-sage-fill); user-line: var(--ai-agent-panel-prompt-sage-line); user-ink: var(--ai-agent-panel-prompt-sage-ink); bg: #000, not user-bg: var(--ai-agent-panel-prompt-sage-fill); user-line: var(--ai-agent-panel-prompt-sage-line); user-ink: var(--ai-agent-panel-prompt-sage-ink)`,
		]],
		["a rule in an at-rule", build(rules.map((r) => (r === sage ? `@media (min-width: 1px) {\n${r}\n}` : r))), [
			...["user-bg", "user-ink", "user-line"].map((token) => `${sageList}: declares the palette token --ai-agent-panel-${token}`),
			`${sageSelector}: inside @media (min-width: 1px)`,
		]],
		["a rule before the palettes", [rules[0], build(rules.slice(1))].join("\n"), [
			".ai-agent-panel-scope.mod-prompt-color-clear,\n.ai-agent-panel-scope.mod-prompt-color-clear .ai-agent-panel-scope: declares the palette token --ai-agent-panel-user-bg",
			".ai-agent-panel-scope.mod-prompt-color-clear,\n.ai-agent-panel-scope.mod-prompt-color-clear .ai-agent-panel-scope: declares the palette token --ai-agent-panel-user-ink",
			".ai-agent-panel-scope.mod-prompt-color-clear,\n.ai-agent-panel-scope.mod-prompt-color-clear .ai-agent-panel-scope: declares the palette token --ai-agent-panel-user-line",
			".ai-agent-panel-scope.mod-prompt-color-clear: before the palette blocks",
			"rule 1: .ai-agent-panel-scope.mod-prompt-color-clear,\n.ai-agent-panel-scope.mod-prompt-color-clear .ai-agent-panel-scope, not .ai-agent-panel-scope",
			"rule 2: .ai-agent-panel-scope, not .ai-agent-panel-scope.is-light",
			"rule 3: .ai-agent-panel-scope.is-light, not .ai-agent-panel-scope.is-dark",
		]],
		["a rule for a color PROMPT_SELECTION lacks", build([...rules, rule({ selectors: ["a", "b"].map((x, i) => `.ai-agent-panel-scope.mod-prompt-color-mist${i ? " .ai-agent-panel-scope" : ""}`), declarations: PROMPT_SELECTION[0].declarations })]), [
			".ai-agent-panel-scope.mod-prompt-color-mist,\n.ai-agent-panel-scope.mod-prompt-color-mist .ai-agent-panel-scope: a prompt selection rule PROMPT_SELECTION does not name",
			".ai-agent-panel-scope.mod-prompt-color-mist,\n.ai-agent-panel-scope.mod-prompt-color-mist .ai-agent-panel-scope: declares the palette token --ai-agent-panel-user-bg",
			".ai-agent-panel-scope.mod-prompt-color-mist,\n.ai-agent-panel-scope.mod-prompt-color-mist .ai-agent-panel-scope: declares the palette token --ai-agent-panel-user-line",
			".ai-agent-panel-scope.mod-prompt-color-mist,\n.ai-agent-panel-scope.mod-prompt-color-mist .ai-agent-panel-scope: declares the palette token --ai-agent-panel-user-ink",
		]],
		["a selection rule in an at-rule, with another color's value", `${clean}\n@media (min-width: 1px) { ${sageSelector} { --ai-agent-panel-user-bg: var(--ai-agent-panel-prompt-rose-fill); } }`, [
			`${sageSelector}: declares the palette token --ai-agent-panel-user-bg`,
		]],
		["a selection descendant branch with an extra selector", `${clean}\n${sageSelector} .ai-agent-panel-scope, .ai-agent-panel-x { --ai-agent-panel-text: var(--ai-agent-panel-prompt-sage-ink); }`, [
			`${sageSelector} .ai-agent-panel-scope, .ai-agent-panel-x: declares the palette token --ai-agent-panel-text`,
		]],
		["a selection rule declaring a token outside its three", `${clean}\n.ai-agent-panel-scope.mod-prompt-color-rose { --ai-agent-panel-bg: var(--ai-agent-panel-prompt-rose-fill); }`, [
			".ai-agent-panel-scope.mod-prompt-color-rose: declares the palette token --ai-agent-panel-bg",
		]],
		["a palette token declared in a component", `${clean}\n.ai-agent-panel-c { --ai-agent-panel-user-bg: var(--ai-agent-panel-prompt-rose-fill); }`, [
			".ai-agent-panel-c: declares the palette token --ai-agent-panel-user-bg",
		]],
		["the Custom property read in a component", `${clean}\n.ai-agent-panel-c { background-color: var(${CUSTOM_PROPERTY}); }`, [`.ai-agent-panel-c: reads ${CUSTOM_PROPERTY}, declared nowhere`]],
		["the Custom property read by a rule that follows the swatch's name", `${clean}\n.ai-agent-panel-color-swatch.mod-sage { background-color: var(${CUSTOM_PROPERTY}); }`, [
			`.ai-agent-panel-color-swatch.mod-sage: reads ${CUSTOM_PROPERTY}, declared nowhere`,
		]],
		["the Custom swatch in an at-rule", build().replace(`${CUSTOM_SWATCH} {`, `@media (min-width: 1px) { ${CUSTOM_SWATCH} {`).concat(" }"), [`${CUSTOM_SWATCH}: reads ${CUSTOM_PROPERTY}, declared nowhere`]],
		["an alias that is a literal", clean.replace("--ai-agent-panel-user-ink: var(--ai-agent-panel-prompt-mist-ink);", "--ai-agent-panel-user-ink: #80a4e4;"), [
			".ai-agent-panel-scope.is-light: --ai-agent-panel-user-ink is #80a4e4, not var(--ai-agent-panel-prompt-mist-ink)",
		]],
		["an alias of another color", clean.replace("--ai-agent-panel-user-bg: var(--ai-agent-panel-prompt-mist-fill);", "--ai-agent-panel-user-bg: var(--ai-agent-panel-prompt-rose-fill);"), [
			".ai-agent-panel-scope.is-light: --ai-agent-panel-user-bg is var(--ai-agent-panel-prompt-rose-fill), not var(--ai-agent-panel-prompt-mist-fill)",
		]],
		["a var() that is no alias", clean.replace("--ai-agent-panel-prompt-sand-ink: #80a4e4;", "--ai-agent-panel-prompt-sand-ink: var(--ai-agent-panel-text);"), [
			".ai-agent-panel-scope.is-light: --ai-agent-panel-prompt-sand-ink is neither a color literal nor a color-mix() of tokens: var(--ai-agent-panel-text)",
		]],
		["the dark accent ink as a literal", clean.replace(/(is-dark \{[\s\S]*?--ai-agent-panel-prompt-accent-ink: )var\(--ai-agent-panel-accent-text\)/, "$1#a896f0"), [
			".ai-agent-panel-scope.is-dark: --ai-agent-panel-prompt-accent-ink is #a896f0, not var(--ai-agent-panel-accent-text)",
		]],
		["the light accent ink as the dark alias", clean.replace(/(--ai-agent-panel-prompt-accent-ink: )color-mix\(in srgb, var\(--ai-agent-panel-accent\), black 11%\)/, "$1var(--ai-agent-panel-accent-text)"), [
			".ai-agent-panel-scope.is-light: --ai-agent-panel-prompt-accent-ink is neither a color literal nor a color-mix() of tokens: var(--ai-agent-panel-accent-text)",
		]],
		["the accent line as a literal", clean.replace("--ai-agent-panel-prompt-accent-line: var(--ai-agent-panel-accent-line);", "--ai-agent-panel-prompt-accent-line: rgba(138, 92, 245, 0.4);"), [
			".ai-agent-panel-scope.is-light: --ai-agent-panel-prompt-accent-line is rgba(138, 92, 245, 0.4), not var(--ai-agent-panel-accent-line)",
		]],
		["a cycle through a selection", clean.replace("--ai-agent-panel-prompt-sage-fill: #1d2330;", "--ai-agent-panel-prompt-sage-fill: color-mix(in srgb, var(--ai-agent-panel-user-bg), white 10%);"), [
			`.ai-agent-panel-scope.is-light with ${sageSelector}: var() cycle --ai-agent-panel-user-bg -> --ai-agent-panel-prompt-sage-fill -> --ai-agent-panel-user-bg`,
		]],
	];
	for (const [name, css, expected] of seeds) assert.deepEqual(paletteViolations(css, contract, tokens).sort(), [...expected].sort(), name);
});

test("ADR-017: styles.css holds one selection rule per color but Mist, after the palettes, and reads the Custom property only in two rules", () => {
	assert.deepEqual(paletteViolations(STYLES), []);
	const rules = parseRules(STYLES);
	const readers = rules.filter((rule) => rule.body.includes(CUSTOM_PROPERTY)).map((rule) => rule.prelude.replace(/\s+/g, " "));
	assert.deepEqual(readers.sort(), [CUSTOM_SWATCH, ...PROMPT_SELECTION.filter(({ color }) => color === "custom").map(({ selectors }) => selectors.join(", "))].sort());
	assert.equal(STYLES.match(/\.ai-agent-panel-scope\.mod-prompt-color-[\w-]+,/g)?.length, 9);
});
