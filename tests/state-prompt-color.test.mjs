/**
 * PRD-001.R33, ADR-017 Prompt color: the ten colors and their root classes,
 * and which Custom colors reach the one custom property.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, PROMPT_COLORS, PROMPT_COLOR_LABELS } from "./.build/settings-core.mjs";
import {
	ALL_PROMPT_COLOR_CLASSES,
	CUSTOM_PROPERTY,
	acceptCustomColor,
	customColorMessage,
	customColorProblem,
	pickerHex,
	promptColorClass,
	promptSelection,
} from "./.build/state/prompt-color.mjs";

/** A stand-in for `CSS.supports("color", value)` that knows the forms these tests use. */
const calls = [];
const supports = (value) => {
	calls.push(value);
	return /^(?:#[0-9a-f]{3,8}|red|blue|currentcolor|transparent|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|calc|min|max|clamp)\(.*\))$/i.test(value);
};

test("PRD-001.R33: the prompt colors are Clear, Sand, Stone, Sage, Sea, Mist, Lavender, Rose, Accent and Custom, in that order", () => {
	assert.deepEqual([...PROMPT_COLORS], ["clear", "sand", "stone", "sage", "sea", "mist", "lavender", "rose", "accent", "custom"]);
	assert.deepEqual(
		PROMPT_COLORS.map((color) => PROMPT_COLOR_LABELS[color]),
		["Clear", "Sand", "Stone", "Sage", "Sea", "Mist", "Lavender", "Rose", "Accent", "Custom"]
	);
});

test("PRD-001.R33: every color but Mist, which the tokens alias, has a root class", () => {
	assert.equal(promptColorClass("mist"), null);
	for (const color of PROMPT_COLORS.filter((c) => c !== "mist")) assert.equal(promptColorClass(color), `mod-prompt-color-${color}`, color);
	assert.deepEqual(
		[...ALL_PROMPT_COLOR_CLASSES],
		PROMPT_COLORS.filter((c) => c !== "mist").map((c) => `mod-prompt-color-${c}`)
	);
	assert.equal(CUSTOM_PROPERTY, "--ai-agent-panel-prompt-custom");
});

test("PRD-001.R33, ADR-017: acceptCustomColor takes a color that refers to nothing else and keeps it as typed", () => {
	for (const value of ["#80a4e4", "#abc", "red", "rgb(10, 20, 30)", "RGBA(10 20 30 / .5)", "hsl(200 40% 50% / .15)", "oklch(0.7 0.1 200)", "color-mix(in srgb, red 20%, blue)", "calc(1 + 1)"])
		assert.deepEqual(acceptCustomColor(value, supports), { ok: true, value }, value);
	assert.deepEqual(acceptCustomColor("  red  ", supports), { ok: true, value: "red" }, "trimmed");
});

test("PRD-001.R33, ADR-017: acceptCustomColor refuses var(), env(), attr(), currentColor and the CSS-wide keywords with their own reason, in any case", () => {
	const keywords = ["currentcolor", "currentColor", "CURRENTCOLOR", " currentColor ", "color-mix(in srgb, currentColor 50%, red)", "inherit", "INITIAL", "Unset", "revert", "revert-layer"];
	for (const value of ["var(--x)", "VAR(--x)", "rgb(var(--x))", "color-mix(in srgb, env(x), red)", "attr(data-x)", "env(safe-area-inset-top)", "var (--x)", ...keywords])
		assert.deepEqual(acceptCustomColor(value, supports), { ok: false, reason: "reference" }, value);
});

test("PRD-001.R33, ADR-017: acceptCustomColor refuses a value over 64 characters, with a character outside the set, or a function outside the list", () => {
	const refused = [
		"#" + "a".repeat(64),
		`rgb(${" ".repeat(70)}1, 2, 3)`,
		"v\\61r(--x)", // a CSS escape of var
		"red;color:blue",
		"red}",
		"red{",
		'"red"',
		"'red'",
		"url(x)",
		"image-set(red)",
		"red @import",
		"red:blue",
		"rgb(1,2,3)/*",
		"not a color",
		"",
		"   ",
		"#12",
		"(red)",
	];
	for (const value of refused) assert.deepEqual(acceptCustomColor(value, supports), { ok: false, reason: "invalid" }, JSON.stringify(value));
});

test("PRD-001.R33, ADR-017: acceptCustomColor refuses a value that is not a string", () => {
	for (const value of [undefined, null, 5, true, {}, ["red"], { toString: () => "red" }])
		assert.deepEqual(acceptCustomColor(value, supports), { ok: false, reason: "invalid" }, String(value));
});

test("PRD-001.R33, ADR-017: acceptCustomColor asks CSS only about a value that passed its own checks, with the trimmed value", () => {
	calls.length = 0;
	acceptCustomColor("var(--x)", supports);
	acceptCustomColor("red;color:blue", supports);
	acceptCustomColor("inherit", supports);
	acceptCustomColor("currentColor", supports);
	acceptCustomColor("url(x)", supports);
	assert.deepEqual(calls, []);
	acceptCustomColor(" blue ", supports);
	assert.deepEqual(calls, ["blue"]);
	assert.equal(acceptCustomColor("nonsense", () => false).ok, false, "CSS has the last word");
});

test("PRD-001.R33: the Custom field's message is the reason, then what the prompt shows", () => {
	const fallback = `Prompts use ${PROMPT_COLOR_LABELS[DEFAULT_SETTINGS.promptColor]}, the default.`;
	assert.equal(fallback, "Prompts use Sand, the default.");
	const keeps = "The prompt keeps the last valid one.";
	// A valid value stored: a refusal keeps it.
	assert.equal(customColorMessage("nonsense", "red", supports), `Not a CSS color. ${keeps}`);
	assert.equal(customColorMessage("var(--x)", "red", supports), `Use a color, not var(), env(), attr() or currentColor. ${keeps}`);
	assert.equal(customColorMessage("", "red", supports), `Not a CSS color. ${keeps}`);
	// Nothing valid stored: the default.
	assert.equal(customColorMessage("nonsense", "", supports), `Not a CSS color. ${fallback}`);
	assert.equal(customColorMessage("var(--x)", "", supports), `Use a color, not var(), env(), attr() or currentColor. ${fallback}`);
	// A stored refused value drawn as typed.
	assert.equal(customColorMessage("var(--x)", "var(--x)", supports), `Use a color, not var(), env(), attr() or currentColor. ${fallback}`);
	assert.equal(customColorMessage("red;x", "red;x", supports), `Not a CSS color. ${fallback}`);
	// Empty field, nothing valid stored.
	assert.equal(customColorMessage("", "", supports), `No custom color yet. ${fallback}`);
	assert.equal(customColorMessage("  ", "red;x", supports), `No custom color yet. ${fallback}`);
	// Nothing to say.
	assert.equal(customColorMessage("red", "", supports), null);
	assert.equal(customColorMessage("red", "blue", supports), null);
});

test("PRD-001.R33, ADR-017: promptSelection classes a named color, and Custom only while its color is accepted", () => {
	assert.deepEqual(promptSelection("sage", "", supports), { className: "mod-prompt-color-sage", custom: null });
	assert.deepEqual(promptSelection("mist", "", supports), { className: null, custom: null });
	assert.deepEqual(promptSelection("custom", "#4d91b3", supports), { className: "mod-prompt-color-custom", custom: "#4d91b3" });
	assert.deepEqual(promptSelection("sage", "#4d91b3", supports), { className: "mod-prompt-color-sage", custom: "#4d91b3" }, "the property is set whichever color is picked");
});

test("PRD-001.R33, ADR-017: a stored color that is no key, or a Custom that is refused or empty, leaves the root in the default color", () => {
	const fallback = { className: promptColorClass(DEFAULT_SETTINGS.promptColor), custom: null };
	assert.equal(fallback.className, "mod-prompt-color-sand");
	for (const color of ["Sage", "", "mod-prompt-color-sage", "sage mist", "__proto__", "constructor", 5, null, undefined, {}, ["sage"]])
		assert.deepEqual(promptSelection(color, "", supports), fallback, String(color));
	for (const custom of ["", "var(--x)", "blu", "red;x", 5, null, undefined])
		assert.deepEqual(promptSelection("custom", custom, supports), fallback, String(custom));
	assert.deepEqual(promptSelection("sage", "var(--x)", supports), { className: "mod-prompt-color-sage", custom: null });
});

test("PRD-001.R33: an empty Custom field with nothing valid stored is empty, and a blank field over a stored value is refused", () => {
	assert.equal(customColorProblem("", "", supports), "empty");
	assert.equal(customColorProblem("   ", "", supports), "empty");
	assert.equal(customColorProblem("", "red;x", supports), "empty");
	assert.equal(customColorProblem("", "#4d91b3", supports), "invalid", "blank over a stored value");
	assert.equal(customColorProblem("  ", "red", supports), "invalid");
});

test("PRD-001.R33: the Custom field's problem is the refusal's reason, and a stored refused value shows it when the page draws", () => {
	assert.equal(customColorProblem("red", "", supports), null);
	assert.equal(customColorProblem("nonsense", "", supports), "invalid");
	assert.equal(customColorProblem("var(--x)", "red", supports), "reference");
	assert.equal(customColorProblem("currentColor", "red", supports), "reference");
	// N4: a hand-edited data.json value, drawn as typed.
	assert.equal(customColorProblem("var(--x)", "var(--x)", supports), "reference");
	assert.equal(customColorProblem("red;x", "red;x", supports), "invalid");
});

test("PRD-001.R33: the picker shows an accepted #rrggbb value, in lower case, and nothing else", () => {
	assert.equal(pickerHex("#4D91B3", supports), "#4d91b3");
	assert.equal(pickerHex(" #4d91b3 ", supports), "#4d91b3");
	for (const value of ["#abc", "red", "rgb(1, 2, 3)", "#4d91b3ff", "", "var(--x)", "#12345g"]) assert.equal(pickerHex(value, supports), null, value);
});
