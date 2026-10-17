/**
 * Settings data model, defaults, and the pure helpers around them. Kept free
 * of Obsidian imports so tests can exercise migration and profile resolution
 * directly; the settings-tab UI lives in settings.ts.
 */

import { parseCliModels, type CliModel } from "./models";
import type { PermissionFlags, PermissionMode, PermissionRequest, PermissionResult } from "./protocol/types";
import { OBSIDIAN_MCP_SERVER } from "./tool-labels";

/**
 * What a chat runs as: the CLI's own permission modes plus `auto`, which is the
 * plugin's own - the CLI still asks for every tool, and this plugin answers
 * "allow" without showing a card. That keeps the CLI's deny rules and hooks in
 * play, unlike `bypassPermissions`, which switches its permission system off.
 */
export type ChatPermissionMode = PermissionMode | "auto";

/** The CLI mode to actually launch with; `auto` is answered on our side. */
export function cliPermissionMode(mode: ChatPermissionMode): PermissionMode {
	return mode === "auto" ? "default" : mode;
}

/** What the "Default permission mode" setting offers; never Bypass (ADR-002). */
export const DEFAULT_MODE_CHOICES = ["default", "acceptEdits", "plan", "auto"] as const;
export type DefaultModeChoice = (typeof DEFAULT_MODE_CHOICES)[number];

/** The "Default permission mode" choices as the settings page shows them; keyed by `DEFAULT_MODE_CHOICES`, so none is left out. */
export const DEFAULT_MODE_LABELS: Record<DefaultModeChoice, string> = {
	default: "Claude Code default",
	acceptEdits: "Accept edits",
	plan: "Plan (read-only)",
	auto: "⚠️ Auto-approve everything",
};

/** The modes a tab's mode menu can hold, in menu order. */
export const MENU_MODES = [...DEFAULT_MODE_CHOICES, "bypassPermissions"] as const;
export type MenuMode = (typeof MENU_MODES)[number];

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
	return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** How a permission mode shows (PRD-002.R8 mode table). */
export interface ModeEntry {
	icon: string;
	short: string;
	long: string;
	hover: string;
	/** Red: nothing stops a tool from running. */
	warn: boolean;
}

/** The menu's modes, keyed by `MENU_MODES` so none is left out. */
export const MODE_TABLE: Readonly<Record<MenuMode, ModeEntry>> = {
	default: {
		icon: "shield",
		short: "Ask",
		long: "Ask before acting",
		hover: "Claude Code asks before any call its rules do not allow",
		warn: false,
	},
	acceptEdits: {
		icon: "shield-check",
		short: "Edits",
		long: "Accept edits",
		hover: "file edits run without asking; other calls follow Claude Code's rules",
		warn: false,
	},
	plan: {
		icon: "clipboard-list",
		short: "Plan",
		long: "Plan (read-only)",
		hover: "Claude reads and plans, and edits nothing until you approve the plan",
		warn: false,
	},
	auto: {
		icon: "zap",
		short: "Auto",
		long: "⚠ Auto-approve everything",
		hover: "every call runs without a card, except calls Claude Code flags",
		warn: true,
	},
	bypassPermissions: {
		icon: "shield-off",
		short: "Bypass",
		long: "⚠ Bypass permissions",
		hover: "Claude Code's permission checks are off",
		warn: true,
	},
};

/**
 * Modes the CLI can report that the menu does not offer, shown as reported.
 * The CLI's own `auto` (Claude Code decides) is not the panel's Auto-approve.
 */
export const CLI_ONLY_MODES: Readonly<Record<string, ModeEntry>> = {
	dontAsk: {
		icon: "shield-x",
		short: "Don't ask",
		long: "Don't ask (deny what isn't allowed)",
		hover: "calls Claude Code's rules do not allow are denied",
		warn: false,
	},
	auto: {
		icon: "sparkles",
		short: "Auto mode",
		long: "Auto mode (Claude Code decides)",
		hover: "Claude Code decides which calls need a card",
		warn: false,
	},
};

/** A mode's accessible name: its long string without the warning sign, which red already says. */
export function modeName(mode: Pick<ModeEntry, "long">): string {
	return mode.long.replace(/^⚠\s*/, "");
}

/** The permission popover's modes in menu order; Bypass only while enabled (PRD-002.R10). */
export function offeredModes(enableBypass: boolean): Array<{ value: MenuMode } & ModeEntry> {
	return MENU_MODES.filter((value) => value !== "bypassPermissions" || enableBypass).map((value) => ({
		value,
		...MODE_TABLE[value],
	}));
}

/** A mode the CLI reported, with its menu value; null for a mode the menu does not offer. */
export function reportedModeEntry(mode: string): ModeEntry & { value: MenuMode | null } {
	if (isOneOf(MENU_MODES, mode) && mode !== "auto") return { value: mode, ...MODE_TABLE[mode] };
	const other = Object.prototype.hasOwnProperty.call(CLI_ONLY_MODES, mode) ? CLI_ONLY_MODES[mode] : null;
	if (other) return { value: null, ...other };
	return { value: null, icon: "shield", short: mode, long: mode, hover: "", warn: false };
}

/** An inherited mode: the profile's startup mode when known, else Claude Code default. */
export function inheritedModeEntry(startup: ModeEntry | null): ModeEntry {
	if (!startup)
		return {
			icon: "shield",
			short: "Default",
			long: "Claude Code default (set in its settings)",
			hover: "Claude Code's settings decide the mode",
			warn: false,
		};
	return { ...startup, long: `${startup.long} · Claude Code's default when it last started` };
}

/** A stored default mode the setting does not offer becomes Claude Code default. */
export function validDefaultPermissionMode(value: unknown): DefaultModeChoice {
	return isOneOf(DEFAULT_MODE_CHOICES, value) ? value : "default";
}

/** A tab's mode: its pick, and whether the launch leaves the mode to the CLI. */
export interface TabModeState {
	selectedMode: ChatPermissionMode;
	inheritMode: boolean;
}

/**
 * The mode a reopened conversation takes (PRD-002.R9 to R11). An unknown
 * stored mode, Bypass while the bypass setting is off, and Auto-approve
 * until the user confirms it (`confirmAuto`) leave the tab as it was.
 */
export function reopenMode(
	stored: { permissionMode?: unknown; permissionModePicked?: unknown },
	current: TabModeState,
	bypassEnabled: boolean
): TabModeState & { confirmAuto: boolean } {
	const mode = stored.permissionMode;
	const keep = (confirmAuto: boolean) => ({
		selectedMode: current.selectedMode,
		inheritMode: current.inheritMode,
		confirmAuto,
	});
	if (!isOneOf(MENU_MODES, mode)) return keep(false);
	if (mode === "bypassPermissions" && !bypassEnabled) return keep(false);
	if (mode === "auto" && current.selectedMode !== "auto") return keep(true);
	return {
		selectedMode: mode,
		inheritMode: stored.permissionModePicked !== true && mode === "default",
		confirmAuto: false,
	};
}

/**
 * A stored value that may reach a command line (`--model`, `--effort`) or a
 * profile lookup: 1 to 200 characters, no whitespace or
 * control character, none of the characters cmd.exe acts on (`CMD_UNSAFE` in
 * `protocol/client`, which this module may not import), not starting with
 * `-`, so it can never act as a flag (PRD-003.R4).
 */
export function isSafeArgValue(value: unknown): value is string {
	return typeof value === "string" && value.length <= 200 && /^[^\s\p{Cc}"%!&|<>^-][^\s\p{Cc}"%!&|<>^]*$/u.test(value);
}

/** The fields of a stored conversation that reach a command line, and the model id beside the pick. */
export interface StoredArgValues {
	sessionId?: unknown;
	model?: unknown;
	effort?: unknown;
	profileId?: unknown;
	resolvedModel?: unknown;
}

/**
 * Read a stored conversation's values as absent when they fail
 * {@link isSafeArgValue}: a Default pick, the default profile (DES-005), and
 * a session id that is no string reads as none; a string one stays, since the
 * session-id grammar judges it (`state/session-id`). `""` stays a Default pick. An unsafe `resolvedModel` becomes
 * `""`, none reported yet, so the field still marks the current format
 * ({@link migrateStoredModel}). Mutates `stored`.
 */
export function dropUnsafeArgValues<T extends StoredArgValues>(stored: T): T {
	const values: StoredArgValues = stored;
	// A session id is not checked here: one failing the grammar is kept as stored and never used (ADR-018 Decision 1).
	if (typeof values.sessionId !== "string") values.sessionId = null;
	for (const key of ["model", "effort"] as const)
		if (key in values && values[key] !== "" && !isSafeArgValue(values[key])) delete values[key];
	if ("resolvedModel" in values && values.resolvedModel !== "" && !isSafeArgValue(values.resolvedModel))
		values.resolvedModel = "";
	if ("profileId" in values && !isSafeArgValue(values.profileId)) delete values.profileId;
	return stored;
}

/**
 * A file without `resolvedModel` was written by 0.5.x, whose `model` held the
 * id the CLI reported rather than the pick: read it as the resolved id and a
 * Default pick (DES-005). The field then marks the current format. Mutates
 * `stored`.
 */
export function migrateStoredModel<T extends StoredArgValues>(stored: T): T {
	const values: StoredArgValues = stored;
	if ("resolvedModel" in values) return stored;
	values.resolvedModel = typeof values.model === "string" ? values.model : "";
	if ("model" in values) values.model = "";
	return stored;
}

/** A model or effort pick as stored: `""` (Default) unless it is a safe value. */
function storedPick(value: unknown): string {
	return isSafeArgValue(value) ? value : "";
}

/**
 * The picks a reopened conversation takes (PRD-003.R9): its model and effort,
 * Default included, and its CLI profile when this device has it, else the
 * default profile.
 */
export function reopenPicks(
	stored: { model?: unknown; effort?: unknown; profileId?: unknown },
	settings: AgentPanelSettings
): { model: string; effort: string; profileId: string } {
	const profileId = isSafeArgValue(stored.profileId) ? stored.profileId : undefined;
	return {
		model: storedPick(stored.model),
		effort: storedPick(stored.effort),
		profileId: (profileById(settings, profileId) ?? defaultProfile(settings)).id,
	};
}

/**
 * What a Profile pick does to a tab (PRD-001.R3, DES-002): `apply` before any
 * session; `restart` stops a CLI only a panel command started, then applies;
 * `keep` leaves a conversation with a Claude Code session, running or ended,
 * on the session's profile. A stored session whose profile this device lacks
 * (`storedProfileKnown` false) takes the pick until a session is live.
 */
export type ProfilePickAction = "apply" | "restart" | "keep";

export function profilePick(state: {
	session: { sessionId: string | null; busy: boolean } | null;
	resumeSessionId: string | null;
	storedSessionId: string | null | undefined;
	storedProfileKnown: boolean;
}): ProfilePickAction {
	const { session } = state;
	// A busy session without an id is a first turn waiting for its session id.
	if (session?.sessionId || session?.busy) return "keep";
	if ((state.resumeSessionId || state.storedSessionId) && state.storedProfileKnown) return "keep";
	return session ? "restart" : "apply";
}

/**
 * How the panel names a profile, whatever the user typed. `standalone` is for
 * a menu item or heading with no "profile" around it.
 */
export function profileLabel(profile: Pick<CliProfile, "name">, standalone = false): string {
	return profile.name || (standalone ? "Unnamed profile" : "Unnamed");
}

/** The Notice a Profile pick shows when the conversation keeps its session's profile (PRD-001.R3). */
export function keptProfileNotice(profile: Pick<CliProfile, "name">): string {
	return `This conversation stays on ${profileLabel(profile)}; start a new conversation to use another.`;
}

/** The settings that decide a launch's spawn-time options. */
export type LaunchSettings = Pick<AgentPanelSettings, "vaultInstructions" | "enableObsidianMcp" | "enableBypassMode">;

export interface SettingsLaunchOptions {
	appendSystemPrompt: string | undefined;
	sdkMcpServers: string[] | undefined;
	allowBypassPermissions: boolean;
}

/**
 * The spawn-time options the settings decide: the vault instructions, the
 * vault-tools server and the bypass flag. A new conversation launches with
 * them and an open one is restarted with them when the settings tab closes
 * (PRD-001.R25, DES-002), so the two cannot differ.
 */
export function settingsLaunchOptions(settings: LaunchSettings): SettingsLaunchOptions {
	return {
		appendSystemPrompt: settings.vaultInstructions || undefined,
		sdkMcpServers: settings.enableObsidianMcp ? [OBSIDIAN_MCP_SERVER] : undefined,
		allowBypassPermissions: settings.enableBypassMode,
	};
}

/**
 * What decides how an open session would relaunch: the spawn-time options and
 * each profile's CLI and launch arguments. Equal before and after the settings
 * tab closes means nothing launches differently.
 */
export function launchSignature(settings: AgentPanelSettings): string {
	const profiles = settings.cliProfiles.map(({ id, cliPath, useWsl, chrome, sandbox, extraArgs }) => [id, cliPath, useWsl, chrome, sandbox, extraArgs]);
	return JSON.stringify([settingsLaunchOptions(settings), profiles]);
}

/**
 * How the panel answers a permission request. The `-after-read` forms are for
 * Edit, Write and MultiEdit in Auto-approve: the allow waits for the call's
 * pre-edit read (PRD-002.R6).
 */
export type PermissionDecision = "form" | "card" | "card-after-read" | "allow" | "allow-after-read";

/**
 * The `decision_reason_type` values Auto-approve may answer without a card
 * (ADR-002). Any other value gets a card: `rule`, `hook`, `safetyCheck`,
 * `sandboxOverride`, and one this list does not know.
 */
export const AUTO_APPROVE_REASON_TYPES: ReadonlySet<string> = new Set([
	"mode",
	"subcommandResults",
	"workingDir",
	"classifier",
	"asyncAgent",
	"permissionPromptTool",
	"other",
]);

/**
 * The decision order of DES-004, first match wins: a well-formed
 * AskUserQuestion gets its form; in Auto-approve a request Claude Code did
 * not flag is allowed; anything else gets a card. Flagged: a reason type
 * outside {@link AUTO_APPROVE_REASON_TYPES}, a safety check anywhere in the
 * reason, an ask rule beside the tool's own reason, an organization's MCP ask
 * ceiling, required interaction, a flag field of the wrong type, an input
 * that asks to run outside the sandbox whatever reason came with it (a CLI
 * that sends no reason fields flags nothing), and an AskUserQuestion its
 * form cannot show. In Auto-approve an edit is allowed,
 * from its card or not, only once its pre-edit read finished; in the other
 * modes a card's Allow answers at once (PRD-002.R1).
 */
export function permissionDecision(
	mode: ChatPermissionMode,
	req: PermissionFlags & Pick<PermissionRequest, "toolName">,
	call: { questionForm: boolean; isEdit: boolean; sandboxOff: boolean }
): PermissionDecision {
	if (call.questionForm) return "form";
	if (mode !== "auto") return "card";
	const type = req.decisionReasonType;
	const flagged =
		(type !== undefined && !AUTO_APPROVE_REASON_TYPES.has(type)) ||
		typeof req.classifierApprovable === "boolean" ||
		req.matchedAskRule === true ||
		req.decisionReasonCode === "org_ask_ceiling" ||
		req.requiresUserInteraction === true ||
		(req.mistypedFlags?.length ?? 0) > 0 ||
		call.sandboxOff ||
		req.toolName === "AskUserQuestion";
	if (flagged) return call.isEdit ? "card-after-read" : "card";
	return call.isEdit ? "allow-after-read" : "allow";
}

/** Whether a tool input asks Claude Code to run the command outside its sandbox (Bash's `dangerouslyDisableSandbox`). */
export function asksSandboxOff(input: Record<string, unknown>): boolean {
	return input.dangerouslyDisableSandbox === true;
}

/** Allow with the input unchanged, and for Always allow the CLI's suggested rules. */
export function allowResult(input: Record<string, unknown>, updatedPermissions?: unknown[]): PermissionResult {
	return updatedPermissions
		? { behavior: "allow", updatedInput: input, updatedPermissions }
		: { behavior: "allow", updatedInput: input };
}

/** {@link allowResult} once the pre-edit read settles, failed or not (PRD-002.R6). */
export async function allowAfterRead(
	read: Promise<unknown>,
	input: Record<string, unknown>,
	updatedPermissions?: unknown[]
): Promise<PermissionResult> {
	await read.catch(() => undefined);
	return allowResult(input, updatedPermissions);
}

/**
 * Where the conversation tabs sit: a strip above the transcript, a column
 * beside it, or `auto` - the column whenever the pane is wide enough for one.
 */
export const TAB_POSITIONS = ["top", "side", "auto"] as const;
export type TabPosition = (typeof TAB_POSITIONS)[number];

/** The "Conversation tabs" cards: the name over its caption; keyed by `TabPosition`, so none is left out. */
export const TAB_POSITION_CARDS: Record<TabPosition, { name: string; caption: string }> = {
	top: { name: "Top", caption: "strip above" },
	side: { name: "Side", caption: "column beside" },
	auto: { name: "Automatic", caption: "by panel width" },
};

/** The "Theme" choices (PRD-001.R34): Obsidian's mode ("Auto"), or the light or dark palette (ADR-017). */
export const THEME_CHOICES = ["match", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** The "Theme" labels, in the settings tab and the panel's menu; keyed by `ThemeChoice`, so none is left out. */
export const THEME_LABELS: Record<ThemeChoice, string> = {
	match: "Auto",
	light: "Light",
	dark: "Dark",
};

/** The line under a Theme card's name: Auto says which mode Obsidian is in now; the others have none. */
export function themeCardCaption(choice: ThemeChoice, hostDark: boolean): string | undefined {
	return choice === "match" ? `now ${hostDark ? "Dark" : "Light"}` : undefined;
}

/** The "Prompt style" choices (PRD-001.R33), in the order the settings offer them. */
export const PROMPT_STYLES = ["card", "bubble"] as const;
export type PromptStyle = (typeof PROMPT_STYLES)[number];

/** The "Prompt style" cards (PRD-001.R33): the name over its caption; keyed by `PromptStyle`, so none is left out. */
export const PROMPT_STYLE_CARDS: Record<PromptStyle, { name: string; caption: string }> = {
	card: { name: "Card", caption: "numbered, full width" },
	bubble: { name: "Bubble", caption: "right-aligned" },
};

/** What a prompt style decides about the panel (PRD-001.R33). */
export interface PromptLayout {
	/** Full width with the number box; false for the right-aligned bubble. */
	numbered: boolean;
	/** Whether "Prompt jump rail" can show. */
	rail: boolean;
}

/** Card is numbered and has the jump rail; Bubble has neither. */
export function promptLayout(style: PromptStyle): PromptLayout {
	const numbered = style !== "bubble";
	return { numbered, rail: numbered };
}

/** The "Prompt color" choices (PRD-001.R33), in the order the settings offer them; Sand is the default. */
export const PROMPT_COLORS = ["clear", "sand", "stone", "sage", "sea", "mist", "lavender", "rose", "accent", "custom"] as const;
export type PromptColor = (typeof PROMPT_COLORS)[number];

/** The "Prompt color" cards' names; keyed by `PromptColor`, so none is left out. */
export const PROMPT_COLOR_LABELS: Record<PromptColor, string> = {
	clear: "Clear",
	sand: "Sand",
	stone: "Stone",
	sage: "Sage",
	sea: "Sea",
	mist: "Mist",
	lavender: "Lavender",
	rose: "Rose",
	accent: "Accent",
	custom: "Custom",
};

/** Whether `value` is one of the ten prompt colors. */
export function isPromptColor(value: unknown): value is PromptColor {
	return isOneOf(PROMPT_COLORS, value);
}

/** The longest "Custom color" the settings keep (ADR-017 Prompt color). */
export const MAX_CUSTOM_COLOR_LENGTH = 64;

/** A launch option the profile can force on or off; "" leaves it to the CLI's own config. */
export type LaunchToggle = "" | "on" | "off";

/** One way to launch the Claude Code CLI (e.g. a Windows install vs. WSL). */
export interface CliProfile {
	/** Stable id referenced by chats and the default-profile setting. */
	id: string;
	/** Display name shown in pickers, e.g. "WSL" or "Windows". */
	name: string;
	/** Absolute path to the claude executable; empty = auto-detect. */
	cliPath: string;
	/** Windows only: run the CLI inside WSL. */
	useWsl: boolean;
	/** Claude in Chrome: `--chrome` / `--no-chrome`. */
	chrome: LaunchToggle;
	/** The Bash sandbox: `sandbox.enabled` via `--settings`. */
	sandbox: LaunchToggle;
	/** Further command-line arguments, as typed; split by parseCliArgs. */
	extraArgs: string;
}

/** A profile with every launch option left at the CLI's own default. */
export function newProfile(
	id: string,
	name: string,
	fields: Partial<Omit<CliProfile, "id" | "name">> = {}
): CliProfile {
	return { id, name, cliPath: "", useWsl: false, chrome: "", sandbox: "", extraArgs: "", ...fields };
}

function launchToggle(value: unknown): LaunchToggle {
	return value === "on" || value === "off" ? value : "";
}

export interface AgentPanelSettings {
	/** Ways to launch the CLI; most users have exactly one. */
	cliProfiles: CliProfile[];
	/** Profile new chats use; with several profiles a chat can pick another. */
	defaultProfileId: string;
	/** Model alias or full id; empty = account default. */
	model: string;
	/** Default reasoning effort (low|medium|high|xhigh|max); empty = CLI default. */
	effort: string;
	/** Last model picked in the chat; new chats start from it. Unset = use `model`. */
	lastModel?: string;
	/** Last effort picked in the chat; new chats start from it. Unset = use `effort`. */
	lastEffort?: string;
	/**
	 * Model alias -> the id the CLI last resolved it to, learned from each
	 * session's init message so picker labels track the current snapshots.
	 */
	resolvedModels?: Record<string, string>;
	/**
	 * CLI profile id -> the models that profile's CLI + account accept, learned
	 * from each session's initialize handshake. The picker offers exactly this
	 * list, so models the CLI would reject never appear.
	 */
	cliModels?: Record<string, CliModel[]>;
	/**
	 * CLI profile id -> the permission mode that profile's CLI last started in
	 * when launched without one (its own settings' `defaultMode`), so a
	 * conversation shows it before its CLI is running.
	 */
	cliStartupModes?: Record<string, string>;
	defaultPermissionMode: ChatPermissionMode;
	/** Gates the dangerous bypassPermissions mode in the chat view. */
	enableBypassMode: boolean;
	/** Allow the composer's "!" shell escape. */
	enableBashMode: boolean;
	/** Expose the in-process "obsidian" MCP server to the CLI. */
	enableObsidianMcp: boolean;
	/** Attach active note path + selection to prompts by default. */
	includeContextByDefault: boolean;
	/** Where the conversation tabs are drawn. */
	tabPosition: TabPosition;
	/** The panel's light or dark mode. */
	theme: ThemeChoice;
	/** "Show tooltips": text tooltips on icon-only controls (PRD-001.R32). */
	showTooltips: boolean;
	/** How the user's own messages show ("Prompt style", PRD-001.R33). */
	promptStyle: PromptStyle;
	/** What color they take ("Prompt color", PRD-001.R33). */
	promptColor: PromptColor;
	/** The "Custom color" last accepted as a CSS color; "" until one is. */
	promptCustomColor: string;
	/** "Pin the current prompt while scrolling". */
	pinPrompt: boolean;
	/** "Prompt jump rail", shown with the Card style. */
	promptRail: boolean;
	/** Extra instructions appended to Claude's system prompt. */
	vaultInstructions: string;
	/** Keep a Markdown note of each conversation in the vault. */
	exportEnabled: boolean;
	/** Vault folder for exported transcripts. */
	exportFolder: string;
	/** Note-name pattern inside the folder; {date}, {title}, {id} placeholders. */
	exportFilePattern: string;
	/** Moment format for the pattern's {date} (conversation start time). */
	exportDateFormat: string;
	/** Seconds cached usage data stays fresh before an automatic re-fetch. */
	usageRefreshSeconds: number;
	/** Show the plan-usage segment at the end of the status line ("Show plan usage"). */
	showUsage: boolean;
	/** Usage % from which a window is highlighted orange. */
	usageWarnPercent: number;
	/** Usage % from which a window is highlighted red. */
	usageCritPercent: number;
	/**
	 * SYNC_UNITS keys whose settings live on this device instead of in the
	 * synced data.json. The list itself stays on this device, so a synced file
	 * cannot move a security unit back to synced (ADR-009).
	 */
	localGroups?: string[];
}

/** "90" → 90, "30s" → 30, "2m" → 120, "1.5h" → 5400; null when unparseable. */
export function parseDurationSeconds(raw: string): number | null {
	const match =
		/^\s*(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)?\s*$/i.exec(
			raw
		);
	if (!match) return null;
	const value = Number(match[1]);
	if (!isFinite(value) || value <= 0) return null;
	const unit = (match[2] ?? "s").toLowerCase();
	const multiplier = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
	return Math.round(value * multiplier);
}

/** Canonical display form: 45 → "45s", 120 → "2m", 5400 → "90m", 7200 → "2h". */
export function formatDurationSeconds(seconds: number): string {
	if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
	if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
}

/** Fetches are never scheduled tighter than this, whatever the setting says. */
export const MIN_USAGE_REFRESH_SECONDS = 10;

export const DEFAULT_SETTINGS: AgentPanelSettings = {
	cliProfiles: [],
	defaultProfileId: "default",
	model: "",
	effort: "",
	defaultPermissionMode: "default",
	enableBypassMode: false,
	enableBashMode: true,
	enableObsidianMcp: true,
	includeContextByDefault: true,
	tabPosition: "auto",
	theme: "match",
	showTooltips: true,
	promptStyle: "card",
	promptColor: "sand",
	promptCustomColor: "",
	pinPrompt: true,
	promptRail: true,
	vaultInstructions: "",
	exportEnabled: false,
	exportFolder: "Agent Chats",
	exportFilePattern: "{date} {title}",
	exportDateFormat: "YYYY-MM-DD",
	usageRefreshSeconds: 300,
	showUsage: true,
	usageWarnPercent: 70,
	usageCritPercent: 90,
};

/** Fresh id for a user-created profile; "default" is the migrated original. */
export function newProfileId(): string {
	return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Bring stored data from any older shape to the current one. Mutates and
 * returns `raw` (the object loadData produced, before defaults are merged).
 */
export function migrateRawSettings(
	raw: Record<string, unknown>
): Record<string, unknown> {
	// ≤0.1.x stored the usage interval in minutes. The old 10-minute default
	// (never a deliberate choice) maps to the current default.
	if (
		typeof raw.usageRefreshMinutes === "number" &&
		raw.usageRefreshSeconds === undefined &&
		raw.usageRefreshMinutes !== 10
	) {
		raw.usageRefreshSeconds = raw.usageRefreshMinutes * 60;
	}
	delete raw.usageRefreshMinutes;

	// ≤0.3.x kept a single CLI location as two flat fields.
	if (!Array.isArray(raw.cliProfiles)) {
		const cliPath = typeof raw.cliPath === "string" ? raw.cliPath : "";
		const useWsl = raw.useWsl === true;
		if (cliPath || useWsl) {
			raw.cliProfiles = [newProfile("default", "Default", { cliPath, useWsl })];
		}
	}
	delete raw.cliPath;
	delete raw.useWsl;
	return raw;
}

/** Whether `value` has the kind of `fallback`: number (finite), string, boolean, array or object. */
export function sameKind(value: unknown, fallback: unknown): boolean {
	if (typeof value === "number") return typeof fallback === "number" && Number.isFinite(value);
	return (
		value !== null &&
		typeof value === typeof fallback &&
		Array.isArray(value) === Array.isArray(fallback)
	);
}

const isPercent = (value: unknown) => typeof value === "number" && value >= 0 && value <= 100;

/** What else a value of the right kind must satisfy: a closed set of values, or a range. */
const VALUE_LIMITS: Partial<Record<keyof AgentPanelSettings, (value: unknown) => boolean>> = {
	defaultPermissionMode: (value) => isOneOf(DEFAULT_MODE_CHOICES, value),
	tabPosition: (value) => isOneOf(TAB_POSITIONS, value),
	theme: (value) => isOneOf(THEME_CHOICES, value),
	promptStyle: (value) => isOneOf(PROMPT_STYLES, value),
	promptColor: isPromptColor,
	promptCustomColor: (value) => typeof value === "string" && value.length <= MAX_CUSTOM_COLOR_LENGTH,
	usageWarnPercent: isPercent,
	usageCritPercent: isPercent,
};

/**
 * Make the loaded settings safe to use. Every key with a default has the
 * default's kind and passes its limit, or takes the default (ADR-009); keys
 * without a default (the learned caches, the last picks) are left as stored,
 * except that the model and effort picks, the last ones included, that fail
 * `isSafeArgValue` become `""` (PRD-003.R4).
 * Profiles are fresh objects of the right shape (never references into
 * DEFAULT_SETTINGS or the raw JSON's prototype-less objects), there is always
 * at least one, and the default id points at one of them.
 */
export function normalizeSettings(settings: AgentPanelSettings): AgentPanelSettings {
	const record = settings as unknown as Record<string, unknown>;
	for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
		const limit = VALUE_LIMITS[key as keyof AgentPanelSettings];
		if (!sameKind(record[key], fallback) || (limit && !limit(record[key]))) record[key] = fallback;
	}
	const profiles = (Array.isArray(settings.cliProfiles) ? settings.cliProfiles : [])
		.filter((p): p is CliProfile => !!p && typeof p === "object" && typeof p.id === "string")
		.map((p) =>
			newProfile(p.id, typeof p.name === "string" ? p.name : "", {
				cliPath: typeof p.cliPath === "string" ? p.cliPath : "",
				useWsl: p.useWsl === true,
				chrome: launchToggle(p.chrome),
				sandbox: launchToggle(p.sandbox),
				extraArgs: typeof p.extraArgs === "string" ? p.extraArgs : "",
			})
		);
	if (profiles.length === 0) profiles.push(newProfile("default", "Default"));
	settings.cliProfiles = profiles;
	if (!profiles.some((p) => p.id === settings.defaultProfileId))
		settings.defaultProfileId = profiles[0].id;
	settings.localGroups = sanitizeLocalGroups(settings.localGroups);
	// Picks reach --model and --effort (PRD-003.R4); an absent last pick stays absent.
	for (const key of ["model", "lastModel", "effort", "lastEffort"] as const)
		if (record[key] !== undefined) record[key] = storedPick(record[key]);
	// The learned caches describe this device's CLI; an entry of another shape is dropped, never shown or sent.
	const caches: Record<string, unknown> = {
		resolvedModels: storedCache(settings.resolvedModels, (value) => (isSafeArgValue(value) ? value : undefined)),
		cliModels: storedCache(settings.cliModels, safeCliModels),
		cliStartupModes: storedCache(settings.cliStartupModes, (value) => (typeof value === "string" ? value : undefined)),
	};
	for (const [key, cache] of Object.entries(caches)) {
		if (cache === undefined) delete record[key];
		else record[key] = cache;
	}
	return settings;
}

/**
 * A learned cache as stored: its own keys to the values `keep` accepts,
 * prototype keys dropped; a cache that is no object is absent. The caches are
 * device-local, yet the device object is read as data like `data.json`.
 */
function storedCache<T>(raw: unknown, keep: (value: unknown) => T | undefined): Record<string, T> | undefined {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
	const cache: Record<string, T> = {};
	for (const [key, value] of Object.entries(storedRecord(raw))) {
		const kept = keep(value);
		if (kept !== undefined) cache[key] = kept;
	}
	return cache;
}

/**
 * A profile's model list, from the initialize reply or as stored: the entries
 * {@link parseCliModels} reads whose picker value (the Default pick, `""`,
 * aside) and resolved id pass {@link isSafeArgValue}, since a pick reaches
 * `--model`, each keeping only the effort levels that pass it, since a level
 * reaches `--effort` (PRD-003.R4); none left is no list.
 */
export function safeCliModels(raw: unknown): CliModel[] | undefined {
	const models = parseCliModels(raw)
		?.filter(
			(model) =>
				(model.value === "" || isSafeArgValue(model.value)) &&
				(model.resolvedModel === undefined || isSafeArgValue(model.resolvedModel))
		)
		.map((model) =>
			model.supportedEffortLevels === undefined
				? model
				: { ...model, supportedEffortLevels: model.supportedEffortLevels.filter((level) => isSafeArgValue(level)) }
		);
	return models?.length ? models : undefined;
}

// ---------------------------------------------------------------------------
// Synced vs. device-local storage
//
// data.json is synced by Obsidian Sync (and any tool that syncs the vault's
// .obsidian folder). Settings that describe the machine rather than the vault
// - where the CLI is installed, above all - would fight across devices there,
// so each sync unit below can be kept device-local instead: its values are
// then written to App.saveLocalStorage (per vault, per device, never synced)
// and omitted from data.json. A value still present in data.json (from before
// the unit went local, or from a device on an older version) serves as the
// one-time seed for devices that have no local value yet - except for the
// never-seeded units, which start at their defaults (ADR-009).

/**
 * The settings behind one row of the settings tab, syncable as one unit via
 * the row's cloud badge. A unit spans several keys only where one row rules
 * them (a model pick updates `lastModel` too; the CLI block is one concept).
 */
export interface SyncUnit {
	key: string;
	settings: (keyof AgentPanelSettings)[];
	/** Units that describe the machine, and the security units, default to device-local. */
	defaultLocal: boolean;
	/**
	 * Chooses what runs on this device (the CLI executable and its arguments)
	 * or widens what runs without a card (PRD-001.R24): while device-local it
	 * starts at its defaults and never takes a value from data.json.
	 */
	neverSeeded?: true;
}

export const SYNC_UNITS: SyncUnit[] = [
	{ key: "cli", settings: ["cliProfiles", "defaultProfileId"], defaultLocal: true, neverSeeded: true },
	{ key: "model", settings: ["model", "lastModel"], defaultLocal: false },
	{ key: "effort", settings: ["effort", "lastEffort"], defaultLocal: false },
	{ key: "permissionMode", settings: ["defaultPermissionMode"], defaultLocal: true, neverSeeded: true },
	{ key: "bypass", settings: ["enableBypassMode"], defaultLocal: true, neverSeeded: true },
	{ key: "obsidianMcp", settings: ["enableObsidianMcp"], defaultLocal: true, neverSeeded: true },
	{ key: "bash", settings: ["enableBashMode"], defaultLocal: true, neverSeeded: true },
	{ key: "context", settings: ["includeContextByDefault"], defaultLocal: false },
	{ key: "tabPosition", settings: ["tabPosition"], defaultLocal: false },
	{ key: "theme", settings: ["theme"], defaultLocal: false },
	{ key: "showTooltips", settings: ["showTooltips"], defaultLocal: false },
	{ key: "promptStyle", settings: ["promptStyle"], defaultLocal: false },
	{ key: "promptColor", settings: ["promptColor", "promptCustomColor"], defaultLocal: false },
	{ key: "pinPrompt", settings: ["pinPrompt"], defaultLocal: false },
	{ key: "promptRail", settings: ["promptRail"], defaultLocal: false },
	{ key: "instructions", settings: ["vaultInstructions"], defaultLocal: true, neverSeeded: true },
	{ key: "showUsage", settings: ["showUsage"], defaultLocal: false },
	{ key: "usageRefresh", settings: ["usageRefreshSeconds"], defaultLocal: false },
	{ key: "usageWarn", settings: ["usageWarnPercent"], defaultLocal: false },
	{ key: "usageCrit", settings: ["usageCritPercent"], defaultLocal: false },
	{
		key: "export",
		settings: ["exportEnabled", "exportFolder", "exportFilePattern", "exportDateFormat"],
		defaultLocal: false,
	},
];

/** Pre-release coarse group keys → today's per-row unit keys. */
const LEGACY_UNIT_KEYS: Record<string, string[]> = {
	permissions: ["permissionMode", "bypass"],
	chat: ["bash", "obsidianMcp", "context"],
	usage: ["showUsage", "usageRefresh", "usageWarn", "usageCrit"],
};

/**
 * Learned caches that describe this machine's CLI install - never synced and
 * never offered in the sync chooser.
 */
const ALWAYS_LOCAL_KEYS: (keyof AgentPanelSettings)[] = [
	"resolvedModels",
	"cliModels",
	"cliStartupModes",
];

/** A valid localGroups list; anything else falls back to the defaults. */
export function sanitizeLocalGroups(raw: unknown): string[] {
	if (!Array.isArray(raw))
		return SYNC_UNITS.filter((u) => u.defaultLocal).map((u) => u.key);
	const keys = raw.flatMap((key) =>
		typeof key === "string" ? LEGACY_UNIT_KEYS[key] ?? [key] : []
	);
	return [
		...new Set(keys.filter((key) => SYNC_UNITS.some((u) => u.key === key))),
	];
}

/** Every setting key that lives on this device under the given unit choice. */
export function localSettingKeys(localGroups: string[]): Set<string> {
	const keys = new Set<string>(ALWAYS_LOCAL_KEYS);
	for (const unit of SYNC_UNITS)
		if (localGroups.includes(unit.key))
			for (const key of unit.settings) keys.add(key);
	return keys;
}

/** Partition the live settings into what data.json gets and what stays local. */
export function splitSettings(settings: AgentPanelSettings): {
	synced: Record<string, unknown>;
	local: Record<string, unknown>;
} {
	const localGroups = sanitizeLocalGroups(settings.localGroups);
	const localKeys = localSettingKeys(localGroups);
	const synced: Record<string, unknown> = {};
	const local: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(settings))
		if (key !== "localGroups") (localKeys.has(key) ? local : synced)[key] = value;
	// Which units are local is this device's own choice.
	local.localGroups = localGroups;
	return { synced, local };
}

/**
 * Overlay this device's stored values onto the synced ones. Only keys that
 * are currently local apply - a key whose group went back to synced keeps
 * following data.json even if a stale local copy remains.
 */
export function mergeLocalSettings(
	settings: AgentPanelSettings,
	localRaw: unknown
): AgentPanelSettings {
	if (!localRaw || typeof localRaw !== "object") return settings;
	const localKeys = localSettingKeys(sanitizeLocalGroups(settings.localGroups));
	for (const [key, value] of Object.entries(localRaw as Record<string, unknown>)) {
		if (localKeys.has(key) && value !== undefined)
			(settings as unknown as Record<string, unknown>)[key] = value;
	}
	return settings;
}

/** Keys that would reach an object's prototype rather than a setting. */
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** A stored object's own keys, as a fresh object without prototype keys; {} for anything else. */
function storedRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const record: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) if (!PROTOTYPE_KEYS.has(key)) record[key] = item;
	return record;
}

/** Keys a 0.5.0-or-earlier build wrote to the device object (never `localGroups`, which sat in data.json). */
const PRE_ADR009_LOCAL_KEYS = ["cliProfiles", "defaultProfileId", "resolvedModels", "cliModels", "cliPath", "useWsl"];

/**
 * Whether the device object is one a 0.5.0-or-earlier build wrote: it has no
 * `localGroups` key at all and holds a key such a build wrote. Local storage
 * never syncs, so a synced file cannot forge this shape.
 */
export function isUpgradeShape(localRaw: unknown): boolean {
	const local = storedRecord(localRaw);
	return !("localGroups" in local) && PRE_ADR009_LOCAL_KEYS.some((key) => key in local);
}

/** Never-seeded units an upgrade takes from data.json; the CLI profiles and Bypass are not among them. */
const UPGRADE_TAKEN = new Set(["permissionMode", "obsidianMcp", "bash", "instructions"]);

/** Permission defaults an upgrade may carry over; anything that runs without a card resets. */
const UPGRADE_MODES: string[] = ["plan", "default"];

function isUpgradeMode(value: unknown): boolean {
	return typeof value === "string" && UPGRADE_MODES.includes(value);
}

/**
 * The settings from data.json and this device's object (DES-005 Load). The
 * device's list of local units wins; without one, a data.json list can add
 * units to the default-local ones, never remove one. Local never-seeded units
 * (the CLI profiles and the five security settings) start at their defaults
 * rather than from data.json, then this device's values apply. On an upgrade
 * from 0.5.0 or earlier, which kept the security settings in data.json, the
 * device takes them from there once, failing closed for a key another device
 * already moved out of the file, with the permission default and Bypass never
 * loosened. CLI profiles and the learned caches never come from data.json.
 */
export function settingsFromStores(dataRaw: unknown, localRaw: unknown): AgentPanelSettings {
	const data = migrateRawSettings(storedRecord(dataRaw));
	const local = storedRecord(localRaw);
	const upgrading = isUpgradeShape(localRaw);
	const localGroups = Array.isArray(local.localGroups)
		? sanitizeLocalGroups(local.localGroups)
		: sanitizeLocalGroups([
				...sanitizeLocalGroups(undefined),
				...(Array.isArray(data.localGroups) ? (data.localGroups as unknown[]) : []),
			]);
	delete data.localGroups;
	// The learned caches describe this device's CLI and are never seeded from data.json: a synced file must not choose what the picker offers.
	for (const key of ALWAYS_LOCAL_KEYS) delete data[key];
	const settings = { ...DEFAULT_SETTINGS, ...data, localGroups } as AgentPanelSettings;
	const record = settings as unknown as Record<string, unknown>;
	const defaults = DEFAULT_SETTINGS as unknown as Record<string, unknown>;
	for (const unit of SYNC_UNITS)
		if (unit.neverSeeded && localGroups.includes(unit.key) && !(upgrading && UPGRADE_TAKEN.has(unit.key)))
			for (const key of unit.settings) record[key] = defaults[key];
	if (upgrading) {
		if (localGroups.includes("permissionMode") && !isUpgradeMode(data.defaultPermissionMode))
			settings.defaultPermissionMode = DEFAULT_SETTINGS.defaultPermissionMode;
		if (localGroups.includes("bash") && data.enableBashMode !== true) settings.enableBashMode = false;
		if (localGroups.includes("obsidianMcp") && data.enableObsidianMcp !== true)
			settings.enableObsidianMcp = false;
		if (localGroups.includes("instructions") && !("vaultInstructions" in data))
			settings.vaultInstructions = "";
	}
	mergeLocalSettings(settings, local);
	return normalizeSettings(settings);
}

/** What a save writes where. */
export interface StoreWriters {
	/**
	 * The units the load read as device-only: what a device object without a
	 * list of its own still means.
	 */
	loadedLocalGroups: string[];
	/** The device object as load reads it; null or undefined when there is none. */
	readLocal: () => unknown;
	writeLocal: (local: Record<string, unknown>) => void;
	writeData: (synced: Record<string, unknown>) => Promise<void>;
}

/**
 * Write the device object, then data.json; nothing reaches data.json if the
 * first write throws. Units the stored device object lists as local that this
 * save moves to synced stay in the device object, with their current values,
 * until data.json holds them: a failed write of either file never loses them.
 */
export async function writeStores(settings: AgentPanelSettings, writers: StoreWriters): Promise<void> {
	const { synced, local } = splitSettings(settings);
	const list = storedRecord(writers.readLocal()).localGroups;
	const stored = Array.isArray(list) ? sanitizeLocalGroups(list) : writers.loadedLocalGroups;
	const moving = stored.filter((key) => !(local.localGroups as string[]).includes(key));
	writers.writeLocal(
		moving.length === 0
			? local
			: splitSettings({ ...settings, localGroups: [...(local.localGroups as string[]), ...moving] }).local
	);
	await writers.writeData(synced);
	if (moving.length > 0) writers.writeLocal(local);
}

/** The profile new chats use. */
export function defaultProfile(settings: AgentPanelSettings): CliProfile {
	return (
		settings.cliProfiles.find((p) => p.id === settings.defaultProfileId) ??
		settings.cliProfiles[0] ??
		newProfile("default", "Default")
	);
}

/** Look a profile up by id; undefined when it no longer exists. */
export function profileById(
	settings: AgentPanelSettings,
	id: string | undefined
): CliProfile | undefined {
	return id ? settings.cliProfiles.find((p) => p.id === id) : undefined;
}
