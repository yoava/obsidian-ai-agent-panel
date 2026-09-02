/**
 * Model picker entries and their labels.
 *
 * The picker's values are CLI aliases ("opus", "sonnet", …), which the CLI
 * itself points at the latest snapshot of each family - so the selection never
 * goes stale. The entries themselves are learned too: the CLI's `initialize`
 * response lists exactly the models this install and account accept
 * (`parseCliModels`, cached per CLI profile in `settings.cliModels`), which
 * keeps entries the CLI would reject - a 1M-context variant the account lacks,
 * an alias the install predates - out of the picker. Labels prefer the id an
 * alias resolved to (also re-reported by every session's `system/init` and
 * cached via `AgentPanelPlugin.rememberModelResolution`) so the version shown
 * tracks reality. The literals below are only the first-run fallback, used
 * until a session has reported a list.
 */

export interface ModelOption {
	value: string;
	label: string;
	/** Compact form shown on the composer button. */
	short: string;
	/** CLI-provided blurb, shown as the entry's tooltip when known. */
	description?: string;
}

export type ModelDescription = Pick<ModelOption, "label" | "short">;

/** Alias -> the model id the CLI last resolved it to. */
export type ResolvedModels = Record<string, string>;

/**
 * One model as the CLI reports it in the `initialize` response (same shape as
 * the `list_models` control request). This is the authoritative picker source:
 * it lists exactly the values this CLI version *and* this account accept, so
 * entries the CLI would reject with "not a recognized model id" never appear.
 */
export interface CliModel {
	/** Picker value; the CLI's "default" sentinel is normalized to "". */
	value: string;
	resolvedModel?: string;
	displayName?: string;
	description?: string;
	/** Effort levels this model accepts; undefined = effort not supported. */
	supportedEffortLevels?: string[];
}

/** Parse the `models` array of an initialize response; null when absent/empty. */
export function parseCliModels(raw: unknown): CliModel[] | null {
	if (!Array.isArray(raw)) return null;
	const models: CliModel[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") continue;
		const o = entry as Record<string, unknown>;
		if (typeof o.value !== "string" || !o.value) continue;
		models.push({
			value: o.value === "default" ? "" : o.value,
			resolvedModel:
				typeof o.resolvedModel === "string" ? o.resolvedModel : undefined,
			displayName: typeof o.displayName === "string" ? o.displayName : undefined,
			description: typeof o.description === "string" ? o.description : undefined,
			supportedEffortLevels: Array.isArray(o.supportedEffortLevels)
				? o.supportedEffortLevels.filter((l): l is string => typeof l === "string")
				: undefined,
		});
	}
	return models.length ? models : null;
}

export const MODEL_OPTIONS: ModelOption[] = [
	{ value: "", label: "Default model", short: "Default" },
	{ value: "fable", label: "Fable 5", short: "Fable 5" },
	{ value: "opus", label: "Opus 5", short: "Opus 5" },
	{ value: "opus[1m]", label: "Opus 5 (1M context)", short: "Opus 5 1M" },
	{ value: "sonnet", label: "Sonnet 5", short: "Sonnet 5" },
	{ value: "sonnet[1m]", label: "Sonnet 5 (1M context)", short: "Sonnet 5 1M" },
	{ value: "haiku", label: "Haiku 4.5", short: "Haiku 4.5" },
	{ value: "opusplan", label: "Opus plan → Sonnet", short: "Opus plan" },
];

/**
 * opusplan plans on Opus and executes on Sonnet, so the single id reported at
 * init describes only half of it - keep the hand-written label.
 */
const FIXED_LABEL_VALUES = new Set(["opusplan"]);

const MODEL_FAMILIES = ["fable", "mythos", "opus", "sonnet", "haiku"];

/** Bracketed context-window variants, e.g. "sonnet[1m]". */
const VARIANT_LABELS: Record<string, ModelDescription> = {
	"1m": { label: "1M context", short: "1M" },
};

/** Whether a resolved id for this value is worth caching. */
export function isLearnableModel(value: string): boolean {
	return !FIXED_LABEL_VALUES.has(value);
}

/** Family named by a picker value or model id, e.g. "opus[1m]" → "opus". */
function modelFamily(value: string): string | null {
	const base = value.replace(/\[[^\]]+\]$/, "").trim().toLowerCase();
	const parts = base.replace(/^claude-/, "").split("-").filter(Boolean);
	return parts.find((part) => MODEL_FAMILIES.includes(part)) ?? null;
}

/**
 * Whether a resolved id is a believable resolution of a picker value. An alias
 * names a family - "opus" points at some claude-opus-* - so a cross-family
 * report is noise, not news: a CLI that does not recognize an alias (say,
 * "fable" on an install that predates it) silently runs its default model and
 * reports that id, which must not become the alias's label.
 */
export function isCredibleResolution(value: string, resolvedId: string): boolean {
	const family = modelFamily(value);
	return family === null || modelFamily(resolvedId) === family;
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * Pretty-print a CLI model id: "claude-opus-5" → "Opus 5",
 * "claude-haiku-4-5-20251001" → "Haiku 4.5", "claude-sonnet-5[1m]" →
 * "Sonnet 5 (1M context)". Returns null for anything without a recognizable
 * family so callers can fall back to the raw string.
 */
export function describeModelId(id: string): ModelDescription | null {
	const variantMatch = /^(.*?)\[([^\]]+)\]$/.exec(id.trim());
	const base = (variantMatch ? variantMatch[1] : id).trim().toLowerCase();
	const variant = variantMatch?.[2].trim().toLowerCase();

	const parts = base.replace(/^claude-/, "").split("-").filter(Boolean);
	const family = parts.find((part) => MODEL_FAMILIES.includes(part));
	if (!family) return null;

	// Version digits sit either side of the family ("opus-4-5", "3-5-sonnet");
	// an 8-digit group is a snapshot date, not part of the version.
	const others = parts.filter((part) => part !== family && !/^\d{8}$/.test(part));
	const version = others.filter((part) => /^\d+$/.test(part)).join(".");
	const extras = others.filter((part) => !/^\d+$/.test(part)).map(capitalize);

	const name = [capitalize(family) + (version ? ` ${version}` : ""), ...extras].join(" ");
	if (!variant) return { label: name, short: name };

	const suffix = VARIANT_LABELS[variant] ?? { label: variant, short: variant };
	return { label: `${name} (${suffix.label})`, short: `${name} ${suffix.short}` };
}

/** Label a CLI-reported entry: versioned resolved id first, then its own name. */
function describeCliModel(model: CliModel): ModelDescription {
	const name =
		describeModelId(model.resolvedModel ?? "") ??
		(model.displayName
			? { label: model.displayName, short: model.displayName }
			: null) ??
		describeModelId(model.value) ?? { label: model.value, short: model.value };
	if (!model.value)
		return { label: `Default model (${name.label})`, short: "Default" };
	return name;
}

/**
 * Label a picker value, preferring the id the CLI resolved it to so the version
 * shown tracks whatever the alias currently points at.
 */
export function describeModel(
	value: string,
	resolved?: ResolvedModels,
	cliModels?: CliModel[] | null
): ModelDescription {
	const cli = cliModels?.find((model) => model.value === value);
	if (cli) return describeCliModel(cli);

	const fallback = MODEL_OPTIONS.find((option) => option.value === value);
	if (fallback && FIXED_LABEL_VALUES.has(value))
		return { label: fallback.label, short: fallback.short };

	// The id the CLI reported for this alias is the freshest naming there is.
	const learned = describeModelId(resolved?.[value] ?? "");

	if (!value)
		return {
			label: learned ? `Default model (${learned.label})` : "Default model",
			short: "Default",
		};
	if (learned) return learned;
	if (fallback) return { label: fallback.label, short: fallback.short };
	// Nothing learned and no entry of our own: a full model id typed into
	// settings still describes itself ("claude-opus-4-7" → "Opus 4.7"), while a
	// bare alias would only describe its family, so show it as written.
	return describeModelId(value) ?? { label: value, short: value };
}

/**
 * The picker's entries with current labels applied. A CLI-reported list wins
 * outright - it is exactly what this CLI + account accept - with the account
 * -default entry kept first; MODEL_OPTIONS only covers the first run, before
 * any session has reported a list.
 */
export function modelOptions(
	resolved?: ResolvedModels,
	cliModels?: CliModel[] | null
): ModelOption[] {
	if (cliModels?.length) {
		const options = cliModels.map((model) => ({
			value: model.value,
			description: model.description,
			...describeCliModel(model),
		}));
		if (!options.some((option) => option.value === ""))
			options.unshift({
				value: "",
				description: undefined,
				label: "Default model",
				short: "Default",
			});
		return options;
	}
	return MODEL_OPTIONS.map((option) => ({
		value: option.value,
		...describeModel(option.value, resolved),
	}));
}
