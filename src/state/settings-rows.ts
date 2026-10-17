/**
 * The settings rows as data (DES-001 Settings page): for each row, what the page's search reads besides its
 * name and description, whether it differs from its default, and that default as the page shows it. No DOM;
 * the page model (`settings-filter`) and the page controller read it.
 */
import { effortLabel } from "../models";
import {
	DEFAULT_MODE_LABELS,
	DEFAULT_SETTINGS,
	PROMPT_COLOR_LABELS,
	PROMPT_COLORS,
	PROMPT_STYLE_CARDS,
	PROMPT_STYLES,
	TAB_POSITION_CARDS,
	TAB_POSITIONS,
	THEME_CHOICES,
	THEME_LABELS,
	formatDurationSeconds,
	validDefaultPermissionMode,
	type AgentPanelSettings,
	type CliProfile,
} from "../settings-core";

/** The settings the rows read. */
export type RowSettings = Pick<
	AgentPanelSettings,
	| "cliProfiles"
	| "model"
	| "effort"
	| "defaultPermissionMode"
	| "includeContextByDefault"
	| "enableBypassMode"
	| "enableObsidianMcp"
	| "enableBashMode"
	| "theme"
	| "tabPosition"
	| "showTooltips"
	| "promptStyle"
	| "promptColor"
	| "promptCustomColor"
	| "pinPrompt"
	| "promptRail"
	| "vaultInstructions"
	| "exportEnabled"
	| "exportFolder"
	| "exportFilePattern"
	| "exportDateFormat"
	| "usageRefreshSeconds"
	| "showUsage"
	| "usageWarnPercent"
	| "usageCritPercent"
>;

/**
 * What a reset writes: the keys of one setting at once (`undefined` removes a key), or one field of one CLI
 * profile by its id. A paired key goes with its setting, as their sync unit pairs them (DES-005).
 */
export type ResetPatch =
	| { kind: "keys"; set: Record<string, unknown> }
	| { kind: "profile"; id: string; field: ProfileResetField; value: string };

/** The profile fields a reset writes; a profile's name, `useWsl` and default flag are never reset. */
export type ProfileResetField = "cliPath" | "chrome" | "sandbox" | "extraArgs";

/** What a reset of one modified row does. */
export interface RowReset {
	/** The row's value now, as the page shows it (a text as typed). */
	value: string;
	/** The value after the reset, as the page shows it. */
	defaultText: string;
	/** `value` is text the user typed, so a dialog shows it by its first line. */
	text: boolean;
	patches: ResetPatch[];
}

/** What the page reads of one row. */
export interface RowFacts {
	/** The search text beyond the name and description: the value as shown, a picker's cards, aliases. */
	terms: string[];
	/** Whether the row differs from its default. */
	modified: boolean;
	/** The default as shown under the description; null for a row with none. */
	defaultText: string | null;
}

/** The ids of the on/off rows and the setting each one binds. */
const TOGGLES: Record<string, "includeContextByDefault" | "enableBypassMode" | "enableObsidianMcp" | "enableBashMode" | "showTooltips" | "pinPrompt" | "promptRail" | "showUsage" | "exportEnabled"> = {
	"note-context": "includeContextByDefault",
	bypass: "enableBypassMode",
	"vault-tools": "enableObsidianMcp",
	"shell-escape": "enableBashMode",
	tooltips: "showTooltips",
	"pin-prompt": "pinPrompt",
	"prompt-rail": "promptRail",
	"show-usage": "showUsage",
	export: "exportEnabled",
};

/** The text rows modified when they differ from `DEFAULT_SETTINGS`, and the setting each binds. */
const TEXTS: Record<string, "exportFolder" | "exportFilePattern" | "exportDateFormat"> = {
	"export-folder": "exportFolder",
	"export-pattern": "exportFilePattern",
	"export-date": "exportDateFormat",
};

/** What "Prompt color" is also found by: Clear only outlines the prompt (PRD-001.R33). */
const CLEAR_ALIASES = ["outline", "quiet", "none"];

/** A row with a default. */
function fact(terms: string[], modified: boolean, defaultText: string): RowFacts {
	return { terms, modified, defaultText };
}

/** A row that is never modified: its text to search, no default. */
function plain(terms: string[]): RowFacts {
	return { terms, modified: false, defaultText: null };
}

/** `[value]`, or nothing for an empty text: an empty field shows only its placeholder. */
const typed = (value: string): string[] => (value ? [value] : []);

const onOff = (value: boolean): string => (value ? "On" : "Off");

const keys = (set: Record<string, unknown>): ResetPatch => ({ kind: "keys", set });

/** A launch toggle's value as the dropdown shows it: "" leaves it to the CLI. */
const launchLabel = (value: string): string => (value === "on" ? "On" : value === "off" ? "Off" : "Claude Code default");

/** A row of one profile, by its row id `<profile id>:<row>`; undefined for a row that is not one. */
function profileRow(id: string, settings: RowSettings): { profile: CliProfile; row: string } | undefined {
	const at = id.lastIndexOf(":");
	if (at < 0) return undefined;
	const profile = settings.cliProfiles.find((candidate) => candidate.id === id.slice(0, at));
	return profile ? { profile, row: id.slice(at + 1) } : undefined;
}

function profileFacts({ profile, row }: { profile: CliProfile; row: string }): RowFacts {
	switch (row) {
		case "path":
			return fact(typed(profile.cliPath), profile.cliPath !== "", "Auto-detect");
		case "args":
			return fact(typed(profile.extraArgs), profile.extraArgs !== "", "None");
		case "chrome":
			return fact([launchLabel(profile.chrome)], profile.chrome !== "", "Claude Code default");
		case "sandbox":
			return fact([launchLabel(profile.sandbox)], profile.sandbox !== "", "Claude Code default");
		case "name":
			return plain([profile.name]);
		case "wsl":
			return plain([onOff(profile.useWsl)]);
		default:
			return plain([]);
	}
}

/**
 * The page's reading of the row `id` (the ids `settings` gives its rows; a profile's are `<profile id>:<row>`),
 * for the current settings. A heading, or a row this does not know, has nothing to search and is never modified.
 */
export function rowFacts(id: string, settings: RowSettings): RowFacts {
	const toggle = Object.hasOwn(TOGGLES, id) ? TOGGLES[id] : undefined;
	if (toggle !== undefined) {
		return fact([onOff(settings[toggle])], settings[toggle] !== DEFAULT_SETTINGS[toggle], onOff(DEFAULT_SETTINGS[toggle]));
	}
	const text = Object.hasOwn(TEXTS, id) ? TEXTS[id] : undefined;
	if (text !== undefined) return fact(typed(settings[text]), settings[text] !== DEFAULT_SETTINGS[text], DEFAULT_SETTINGS[text]);
	switch (id) {
		case "model":
			return fact(typed(settings.model), settings.model !== "", "Claude Code default");
		case "effort":
			return fact([settings.effort ? effortLabel(settings.effort) : "CLI default"], settings.effort !== "", "CLI default");
		case "vault-instructions":
			return fact(typed(settings.vaultInstructions), settings.vaultInstructions !== "", "None");
		case "permission-mode": {
			const mode = validDefaultPermissionMode(settings.defaultPermissionMode);
			return fact([DEFAULT_MODE_LABELS[mode]], mode !== DEFAULT_SETTINGS.defaultPermissionMode, DEFAULT_MODE_LABELS[validDefaultPermissionMode(DEFAULT_SETTINGS.defaultPermissionMode)]);
		}
		case "theme":
			return fact(
				THEME_CHOICES.map((choice) => THEME_LABELS[choice]),
				settings.theme !== DEFAULT_SETTINGS.theme,
				THEME_LABELS[DEFAULT_SETTINGS.theme]
			);
		case "conversation-tabs":
			return fact(
				TAB_POSITIONS.map((position) => TAB_POSITION_CARDS[position].name),
				settings.tabPosition !== DEFAULT_SETTINGS.tabPosition,
				TAB_POSITION_CARDS[DEFAULT_SETTINGS.tabPosition].name
			);
		case "prompt-style":
			return fact(
				PROMPT_STYLES.map((style) => PROMPT_STYLE_CARDS[style].name),
				settings.promptStyle !== DEFAULT_SETTINGS.promptStyle,
				PROMPT_STYLE_CARDS[DEFAULT_SETTINGS.promptStyle].name
			);
		case "prompt-color":
			return fact(
				[...PROMPT_COLORS.map((color) => PROMPT_COLOR_LABELS[color]), ...CLEAR_ALIASES],
				settings.promptColor !== DEFAULT_SETTINGS.promptColor,
				PROMPT_COLOR_LABELS[DEFAULT_SETTINGS.promptColor]
			);
		case "custom-color":
			return plain(typed(settings.promptCustomColor));
		case "usage-refresh":
			return fact(
				[formatDurationSeconds(settings.usageRefreshSeconds)],
				settings.usageRefreshSeconds !== DEFAULT_SETTINGS.usageRefreshSeconds,
				formatDurationSeconds(DEFAULT_SETTINGS.usageRefreshSeconds)
			);
		case "usage-warn":
			return fact([`${settings.usageWarnPercent}%`], settings.usageWarnPercent !== DEFAULT_SETTINGS.usageWarnPercent, `${DEFAULT_SETTINGS.usageWarnPercent}%`);
		case "usage-crit":
			return fact([`${settings.usageCritPercent}%`], settings.usageCritPercent !== DEFAULT_SETTINGS.usageCritPercent, `${DEFAULT_SETTINGS.usageCritPercent}%`);
	}
	const inProfile = profileRow(id, settings);
	return inProfile ? profileFacts(inProfile) : plain([]);
}

/** The settings a row's reset writes, for the rows that are one key at its default (`DEFAULT_SETTINGS`). */
const PLAIN_RESETS: Record<string, keyof RowSettings> = {
	...TOGGLES,
	...TEXTS,
	"permission-mode": "defaultPermissionMode",
	theme: "theme",
	"conversation-tabs": "tabPosition",
	"prompt-style": "promptStyle",
	"usage-refresh": "usageRefreshSeconds",
	"usage-warn": "usageWarnPercent",
	"usage-crit": "usageCritPercent",
};

/** The profile fields a reset writes, by the row's name in its id. */
const PROFILE_RESETS: Record<string, ProfileResetField> = { path: "cliPath", args: "extraArgs", chrome: "chrome", sandbox: "sandbox" };

/** The value of a one-key row as it shows: a toggle's On or Off, a card's name, a dropdown's label, a number with its unit. */
function plainValue(id: string, settings: RowSettings): string | undefined {
	if (Object.hasOwn(TOGGLES, id)) return onOff(settings[TOGGLES[id]]);
	switch (id) {
		case "permission-mode":
			return DEFAULT_MODE_LABELS[validDefaultPermissionMode(settings.defaultPermissionMode)];
		case "theme":
			return THEME_LABELS[settings.theme];
		case "conversation-tabs":
			return TAB_POSITION_CARDS[settings.tabPosition].name;
		case "prompt-style":
			return PROMPT_STYLE_CARDS[settings.promptStyle].name;
		case "usage-refresh":
			return formatDurationSeconds(settings.usageRefreshSeconds);
		case "usage-warn":
			return `${settings.usageWarnPercent}%`;
		case "usage-crit":
			return `${settings.usageCritPercent}%`;
	}
	return undefined;
}

/** A profile row's value as shown, its default and whether it is typed text. */
function profileValue(profile: CliProfile, field: ProfileResetField): Pick<RowReset, "value" | "defaultText" | "text"> {
	switch (field) {
		case "cliPath":
			return { value: profile.cliPath, defaultText: "Auto-detect", text: true };
		case "extraArgs":
			return { value: profile.extraArgs, defaultText: "None", text: true };
		case "chrome":
			return { value: launchLabel(profile.chrome), defaultText: "Claude Code default", text: false };
		case "sandbox":
			return { value: launchLabel(profile.sandbox), defaultText: "Claude Code default", text: false };
	}
}

/**
 * What resetting the row `id` does to `settings` (DES-001 Reset): its value and default as shown and the patches
 * that write the default, or undefined for a row that is never reset (a heading, a profile's name, Run via WSL,
 * the default profile, Custom color, Add a CLI profile) or never modified. `rowFacts` says whether it differs.
 */
export function rowReset(id: string, settings: RowSettings): RowReset | undefined {
	const facts = rowFacts(id, settings);
	if (!facts.modified || facts.defaultText === null) return undefined;
	const defaultText = facts.defaultText;
	const result = (value: string, set: Record<string, unknown>, text = false): RowReset => ({ value, defaultText, text, patches: [keys(set)] });
	switch (id) {
		case "model":
			return result(settings.model, { model: "", lastModel: undefined }, true);
		case "effort":
			return result(effortLabel(settings.effort), { effort: "", lastEffort: undefined });
		case "vault-instructions":
			return result(settings.vaultInstructions, { vaultInstructions: "" }, true);
		case "prompt-color":
			return result(PROMPT_COLOR_LABELS[settings.promptColor], { promptColor: DEFAULT_SETTINGS.promptColor, promptCustomColor: DEFAULT_SETTINGS.promptCustomColor });
	}
	const plain = Object.hasOwn(PLAIN_RESETS, id) ? PLAIN_RESETS[id] : undefined;
	if (plain !== undefined) {
		const text = Object.hasOwn(TEXTS, id);
		return result(text ? (settings[plain] as string) : (plainValue(id, settings) ?? ""), { [plain]: DEFAULT_SETTINGS[plain] }, text);
	}
	const inProfile = profileRow(id, settings);
	const field = inProfile && Object.hasOwn(PROFILE_RESETS, inProfile.row) ? PROFILE_RESETS[inProfile.row] : undefined;
	if (!inProfile || field === undefined) return undefined;
	const shown = profileValue(inProfile.profile, field);
	return { ...shown, patches: [{ kind: "profile", id: inProfile.profile.id, field, value: "" }] };
}

/** A support link at the foot of the page: its name, address and icon (a cup for a coffee site, else a heart). */
export interface SupportLink {
	name: string;
	url: string;
	icon: "heart" | "coffee";
}

const COFFEE_HOSTS = ["buymeacoffee.com", "ko-fi.com"];

/**
 * The manifest's `fundingUrl` as the page's support links, in its order: a
 * map of names to addresses, or one address named "Support"; only `https:`
 * addresses (DES-001 Settings page).
 */
export function supportLinks(fundingUrl: unknown): SupportLink[] {
	const entries =
		typeof fundingUrl === "string"
			? [["Support", fundingUrl]]
			: fundingUrl !== null && typeof fundingUrl === "object"
				? Object.entries(fundingUrl)
				: [];
	return entries
		.filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].startsWith("https://"))
		.map(([name, url]) => ({ name, url, icon: COFFEE_HOSTS.some((host) => hostIs(url, host)) ? "coffee" : "heart" }));
}

function hostIs(url: string, host: string): boolean {
	const name = /^https:\/\/(?:[^/?#@]*@)?([^/?#:]+)/i.exec(url)?.[1]?.toLowerCase() ?? "";
	return name === host || name.endsWith(`.${host}`);
}
