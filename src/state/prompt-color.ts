import { DEFAULT_SETTINGS, isPromptColor, MAX_CUSTOM_COLOR_LENGTH, PROMPT_COLOR_LABELS, PROMPT_COLORS, type PromptColor } from "../settings-core";

/** The scope root's class that picks a prompt color's tokens, `mod-prompt-color-<color>` (ADR-017 Prompt color). */
const CLASS_PREFIX = "mod-prompt-color-";

/** The one custom property a Custom color reaches, set inline on the plugin's own roots (ADR-017). */
export const CUSTOM_PROPERTY = "--ai-agent-panel-prompt-custom";

/** The class of a color; null for Mist, which the palettes' tokens already alias. */
export function promptColorClass(color: PromptColor): string | null {
	return color === "mist" ? null : `${CLASS_PREFIX}${color}`;
}

/** Every class a root can carry for its prompt color. */
export const ALL_PROMPT_COLOR_CLASSES: readonly string[] = PROMPT_COLORS.flatMap((color) => promptColorClass(color) ?? []);

/** The colors CSS function names a Custom color may use; `var()`, `env()` and `attr()` are not among them. */
const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
	"rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color", "color-mix", "calc", "min", "max", "clamp",
]);
/** Functions that read another value: refused with their own message. */
const REFERENCES: ReadonlySet<string> = new Set(["var", "env", "attr"]);
/** Keywords that take another value (the CSS-wide ones) instead of being a color: refused with the same message. */
const REFERENCE_KEYWORDS: ReadonlySet<string> = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
/** `currentColor`, alone or inside a function. */
const CURRENT_COLOR = /(^|[^A-Za-z0-9-])currentcolor($|[^A-Za-z0-9-])/i;
/** Letters, digits, spaces and `#.,%/+-()`: no backslash escape, quote, colon, semicolon, brace or `@`. */
const ALLOWED_CHARACTERS = /^[A-Za-z0-9 #.,%/+()-]*$/;

export type CustomColorResult = { ok: true; value: string } | { ok: false; reason: "invalid" | "reference" };

/** Why the "Custom color" field warns: a refusal, or "empty" for no field value and no valid stored one. */
export type CustomColorProblem = "invalid" | "reference" | "empty";

/** The reason sentence of each problem (PRD-001.R33). */
const CUSTOM_COLOR_REASONS: Record<CustomColorProblem, string> = {
	invalid: "Not a CSS color.",
	reference: "Use a color, not var(), env(), attr() or currentColor.",
	empty: "No custom color yet.",
};

/**
 * Whether `value` may be a Custom color (ADR-017 Prompt color): a string of at most 64
 * characters from a closed set, whose every function is a color or math
 * function (so nothing refers to another value), no CSS-wide keyword or currentColor, and a
 * color to CSS itself (`supports` is `CSS.supports("color", value)`, injected
 * so Node can test it). The accepted value is the trimmed one.
 */
export function acceptCustomColor(value: unknown, supports: (value: string) => boolean): CustomColorResult {
	const invalid = { ok: false, reason: "invalid" } as const;
	if (typeof value !== "string" || value.length > MAX_CUSTOM_COLOR_LENGTH || !ALLOWED_CHARACTERS.test(value)) return invalid;
	const color = value.trim();
	if (color === "") return invalid;
	if (REFERENCE_KEYWORDS.has(color.toLowerCase()) || CURRENT_COLOR.test(color)) return { ok: false, reason: "reference" };
	const functions = [...color.matchAll(/([A-Za-z][A-Za-z0-9-]*)\s*\(/g)].map((match) => match[1].toLowerCase());
	if (functions.some((name) => REFERENCES.has(name))) return { ok: false, reason: "reference" };
	if (functions.some((name) => !ALLOWED_FUNCTIONS.has(name))) return invalid;
	return supports(color) ? { ok: true, value: color } : invalid;
}

/**
 * What the "Custom color" field warns about for what it holds, null for nothing.
 * A blank field is refused over a valid stored value, "empty" without one; a
 * stored value that is itself refused (a hand-edited data.json) shows its
 * reason when the page draws.
 */
export function customColorProblem(
	typed: string,
	stored: string,
	supports: (value: string) => boolean
): CustomColorProblem | null {
	if (typed.trim() === "") return acceptCustomColor(stored, supports).ok ? "invalid" : "empty";
	const result = acceptCustomColor(typed, supports);
	return result.ok ? null : result.reason;
}

/**
 * The line the field shows (PRD-001.R33): the problem's reason, then what the
 * prompt draws: the last valid color while one is stored, else the default.
 */
export function customColorMessage(typed: string, stored: string, supports: (value: string) => boolean): string | null {
	const problem = customColorProblem(typed, stored, supports);
	if (problem === null) return null;
	const consequence = acceptCustomColor(stored, supports).ok
		? "The prompt keeps the last valid one."
		: `Prompts use ${PROMPT_COLOR_LABELS[DEFAULT_SETTINGS.promptColor]}, the default.`;
	return `${CUSTOM_COLOR_REASONS[problem]} ${consequence}`;
}

/** The value the color picker shows for a typed one: an accepted #rrggbb in lower case, else null. */
export function pickerHex(value: string, supports: (value: string) => boolean): string | null {
	const result = acceptCustomColor(value, supports);
	return result.ok && /^#[0-9a-f]{6}$/i.test(result.value) ? result.value.toLowerCase() : null;
}

/** What a root carries for the prompt color: its class (null for Mist) and the Custom property (null for none). */
export interface PromptSelection {
	className: string | null;
	custom: string | null;
}

/**
 * The selection the stored values give. An unknown stored color is the default
 * color; Custom is its color only while the stored Custom color is accepted,
 * else the default color; the
 * Custom property is set whenever the stored color is accepted, whichever
 * color is picked, so the Custom card shows it.
 */
export function promptSelection(color: unknown, customColor: unknown, supports: (value: string) => boolean): PromptSelection {
	const accepted = acceptCustomColor(customColor, supports);
	const custom = accepted.ok ? accepted.value : null;
	const picked: PromptColor = isPromptColor(color) && !(color === "custom" && custom === null) ? color : DEFAULT_SETTINGS.promptColor;
	return { className: promptColorClass(picked), custom };
}
