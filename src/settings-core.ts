/**
 * Settings data model, defaults, and the pure helpers around them. Kept free
 * of Obsidian imports so tests can exercise migration and profile resolution
 * directly; the settings-tab UI lives in settings.ts.
 */

import type { CliModel } from "./models";
import type { PermissionMode } from "./protocol/types";

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

/**
 * Where the conversation tabs sit: a strip above the transcript, a column
 * beside it, or `auto` - the column whenever the pane is wide enough for one.
 */
export type TabPosition = "top" | "side" | "auto";

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
	/** Show the compact plan-usage strip below the composer. */
	showUsage: boolean;
	/** Usage % from which a window is highlighted orange. */
	usageWarnPercent: number;
	/** Usage % from which a window is highlighted red. */
	usageCritPercent: number;
	/**
	 * SYNC_UNITS keys whose settings live on this device instead of in the
	 * synced data.json. The list itself is synced, so every device agrees on
	 * what is device-local.
	 */
	localGroups?: string[];
}

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
	tabPosition: "top",
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
			raw.cliProfiles = [{ id: "default", name: "Default", cliPath, useWsl }];
		}
	}
	delete raw.cliPath;
	delete raw.useWsl;
	return raw;
}

/**
 * Make the loaded settings safe to use: profiles are fresh objects of the
 * right shape (never references into DEFAULT_SETTINGS or the raw JSON's
 * prototype-less objects), there is always at least one, and the default id
 * points at one of them.
 */
export function normalizeSettings(settings: AgentPanelSettings): AgentPanelSettings {
	const profiles = (Array.isArray(settings.cliProfiles) ? settings.cliProfiles : [])
		.filter((p): p is CliProfile => !!p && typeof p === "object" && typeof p.id === "string")
		.map((p) => ({
			id: p.id,
			name: typeof p.name === "string" ? p.name : "",
			cliPath: typeof p.cliPath === "string" ? p.cliPath : "",
			useWsl: p.useWsl === true,
		}));
	if (profiles.length === 0)
		profiles.push({ id: "default", name: "Default", cliPath: "", useWsl: false });
	settings.cliProfiles = profiles;
	if (!profiles.some((p) => p.id === settings.defaultProfileId))
		settings.defaultProfileId = profiles[0].id;
	settings.localGroups = sanitizeLocalGroups(settings.localGroups);
	return settings;
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
// one-time seed for devices that have no local value yet.

/**
 * The settings behind one row of the settings tab, syncable as one unit via
 * the row's cloud badge. A unit spans several keys only where one row rules
 * them (a model pick updates `lastModel` too; the CLI block is one concept).
 */
export interface SyncUnit {
	key: string;
	settings: (keyof AgentPanelSettings)[];
	/** Units that describe the machine default to device-local. */
	defaultLocal: boolean;
}

export const SYNC_UNITS: SyncUnit[] = [
	{ key: "cli", settings: ["cliProfiles", "defaultProfileId"], defaultLocal: true },
	{ key: "model", settings: ["model", "lastModel"], defaultLocal: false },
	{ key: "effort", settings: ["effort", "lastEffort"], defaultLocal: false },
	{ key: "permissionMode", settings: ["defaultPermissionMode"], defaultLocal: false },
	{ key: "bypass", settings: ["enableBypassMode"], defaultLocal: false },
	{ key: "obsidianMcp", settings: ["enableObsidianMcp"], defaultLocal: false },
	{ key: "bash", settings: ["enableBashMode"], defaultLocal: false },
	{ key: "context", settings: ["includeContextByDefault"], defaultLocal: false },
	{ key: "tabPosition", settings: ["tabPosition"], defaultLocal: false },
	{ key: "instructions", settings: ["vaultInstructions"], defaultLocal: false },
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
	model: ["model", "effort"],
	permissions: ["permissionMode", "bypass"],
	chat: ["bash", "obsidianMcp", "context"],
	usage: ["showUsage", "usageRefresh", "usageWarn", "usageCrit"],
};

/**
 * Learned caches that describe this machine's CLI install - never synced and
 * never offered in the sync chooser.
 */
const ALWAYS_LOCAL_KEYS: (keyof AgentPanelSettings)[] = ["resolvedModels", "cliModels"];

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
	const localKeys = localSettingKeys(sanitizeLocalGroups(settings.localGroups));
	const synced: Record<string, unknown> = {};
	const local: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(settings))
		(localKeys.has(key) ? local : synced)[key] = value;
	// The choice of what is local must itself reach every device.
	synced.localGroups = sanitizeLocalGroups(settings.localGroups);
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

/** The profile new chats (and account-level lookups) use. */
export function defaultProfile(settings: AgentPanelSettings): CliProfile {
	return (
		settings.cliProfiles.find((p) => p.id === settings.defaultProfileId) ??
		settings.cliProfiles[0] ?? { id: "default", name: "Default", cliPath: "", useWsl: false }
	);
}

/** Look a profile up by id; undefined when it no longer exists. */
export function profileById(
	settings: AgentPanelSettings,
	id: string | undefined
): CliProfile | undefined {
	return id ? settings.cliProfiles.find((p) => p.id === id) : undefined;
}
