import { test } from "node:test";
import assert from "node:assert/strict";
import {
	AUTO_APPROVE_REASON_TYPES,
	CLI_ONLY_MODES,
	MODE_TABLE,
	MENU_MODES,
	modeName,
	offeredModes,
	inheritedModeEntry,
	reportedModeEntry,
	DEFAULT_SETTINGS,
	PROMPT_COLORS,
	PROMPT_STYLES,
	TAB_POSITIONS,
	TAB_POSITION_CARDS,
	THEME_LABELS,
	THEME_CHOICES,
	themeCardCaption,
	SYNC_UNITS,
	allowAfterRead,
	allowResult,
	asksSandboxOff,
	cliPermissionMode,
	defaultProfile,
	dropUnsafeArgValues,
	isSafeArgValue,
	keptProfileNotice,
	migrateStoredModel,
	permissionDecision,
	promptLayout,
	profileById,
	profileLabel,
	profilePick,
	reopenMode,
	reopenPicks,
	sameKind,
	sanitizeLocalGroups,
	settingsFromStores,
	safeCliModels,
	isUpgradeShape,
	writeStores,
	settingsLaunchOptions,
	launchSignature,
	newProfile,
	splitSettings,
	validDefaultPermissionMode,
} from "./.build/settings-core.mjs";
import { CMD_UNSAFE } from "./.build/protocol/client.mjs";

// What AgentPanelPlugin.loadSettings does with data.json and this device's object.
const load = (raw, local = null) => settingsFromStores(raw, local);

/** The units device-local by default: CLI profiles and the five security settings. */
const DEFAULT_LOCAL = ["cli", "permissionMode", "bypass", "obsidianMcp", "bash", "instructions"];
/** This device syncs its CLI profiles (the rest stays default), so data.json supplies them. */
const CLI_SYNCED = { localGroups: DEFAULT_LOCAL.filter((key) => key !== "cli") };
const SECURITY_KEYS = [
	"defaultPermissionMode",
	"enableBypassMode",
	"vaultInstructions",
	"enableBashMode",
	"enableObsidianMcp",
];

test("legacy cliPath/useWsl migrate into a single profile", () => {
	const settings = load({ cliPath: "/usr/local/bin/claude", useWsl: true }, CLI_SYNCED);
	assert.equal(settings.cliProfiles.length, 1);
	assert.deepEqual(settings.cliProfiles[0], {
		id: "default",
		name: "Default",
		cliPath: "/usr/local/bin/claude",
		useWsl: true,
		chrome: "",
		sandbox: "",
		extraArgs: "",
	});
	assert.equal(settings.defaultProfileId, "default");
	assert.ok(!("cliPath" in settings));
	assert.ok(!("useWsl" in settings));
});

test("a fresh install gets one auto-detect profile", () => {
	const settings = load({});
	assert.equal(settings.cliProfiles.length, 1);
	assert.equal(settings.cliProfiles[0].cliPath, "");
	assert.equal(settings.cliProfiles[0].useWsl, false);
	assert.equal(settings.defaultProfileId, settings.cliProfiles[0].id);
});

test("existing profile arrays pass through untouched", () => {
	const profiles = [
		{ id: "a", name: "WSL", cliPath: "claude", useWsl: true, chrome: "", sandbox: "on", extraArgs: "" },
		{
			id: "b",
			name: "Windows",
			cliPath: "C:\\claude.exe",
			useWsl: false,
			chrome: "on",
			sandbox: "",
			extraArgs: "--debug",
		},
	];
	const settings = load(
		{
			cliProfiles: profiles,
			defaultProfileId: "b",
			// Stale flat fields from a partially-synced data.json must not resurrect.
			cliPath: "/stale",
			useWsl: true,
		},
		CLI_SYNCED
	);
	assert.deepEqual(settings.cliProfiles, profiles);
	assert.equal(settings.defaultProfileId, "b");
});

test("normalize repairs malformed profiles and a dangling default id", () => {
	const settings = load(
		{
			cliProfiles: [null, { name: "no id" }, { id: "ok", name: 7, useWsl: "yes" }],
			defaultProfileId: "gone",
		},
		CLI_SYNCED
	);
	assert.deepEqual(settings.cliProfiles, [
		{ id: "ok", name: "", cliPath: "", useWsl: false, chrome: "", sandbox: "", extraArgs: "" },
	]);
	assert.equal(settings.defaultProfileId, "ok");
});

test("profiles from before the launch options default them to the CLI's own", () => {
	const settings = load(
		{
			cliProfiles: [
				{ id: "old", name: "Old", cliPath: "", useWsl: false },
				{ id: "bad", name: "Bad", chrome: true, sandbox: "yes", extraArgs: 3 },
			],
		},
		CLI_SYNCED
	);
	for (const profile of settings.cliProfiles) {
		assert.equal(profile.chrome, "");
		assert.equal(profile.sandbox, "");
		assert.equal(profile.extraArgs, "");
	}
});

test("normalize never aliases DEFAULT_SETTINGS' profile array", () => {
	const a = load({});
	const b = load({});
	a.cliProfiles[0].cliPath = "/mutated";
	assert.equal(b.cliProfiles[0].cliPath, "");
	assert.equal(DEFAULT_SETTINGS.cliProfiles.length, 0);
});

test("profile lookups fall back sensibly", () => {
	const settings = load(
		{
			cliProfiles: [
				{ id: "a", name: "One", cliPath: "", useWsl: false },
				{ id: "b", name: "Two", cliPath: "", useWsl: false },
			],
			defaultProfileId: "b",
		},
		CLI_SYNCED
	);
	assert.equal(defaultProfile(settings).id, "b");
	assert.equal(profileById(settings, "a")?.name, "One");
	assert.equal(profileById(settings, "gone"), undefined);
	assert.equal(profileById(settings, undefined), undefined);
});

test("usage minutes migration still applies", () => {
	assert.equal(load({ usageRefreshMinutes: 2 }).usageRefreshSeconds, 120);
	// The accidental old default maps to the current default instead.
	assert.equal(load({ usageRefreshMinutes: 10 }).usageRefreshSeconds, 300);
});

test("PRD-001.R24: CLI profiles and the five security settings are device-local by default", () => {
	const settings = load({});
	const { synced, local } = splitSettings(settings);
	for (const key of ["cliProfiles", "defaultProfileId", ...SECURITY_KEYS]) {
		assert.ok(!(key in synced), `${key} must not reach data.json`);
		assert.ok(key in local, `${key} must stay on this device`);
	}
	assert.ok("model" in synced);
	assert.deepEqual(settings.localGroups, DEFAULT_LOCAL);
});

test("PRD-001.R24: the five security settings are never seeded from data.json", () => {
	const settings = load({
		defaultPermissionMode: "auto",
		enableBypassMode: true,
		vaultInstructions: "run anything",
		enableBashMode: false,
		enableObsidianMcp: false,
	});
	for (const key of SECURITY_KEYS) assert.deepEqual(settings[key], DEFAULT_SETTINGS[key], key);
	// This device's own values still apply.
	const own = load({ enableBypassMode: false }, { enableBypassMode: true, vaultInstructions: "mine" });
	assert.equal(own.enableBypassMode, true);
	assert.equal(own.vaultInstructions, "mine");
});

test("PRD-001.R24: CLI profiles are never seeded from data.json", () => {
	const fromData = {
		cliProfiles: [{ id: "a", name: "Shared", cliPath: "/tmp/evil", useWsl: false, extraArgs: "--debug" }],
		defaultProfileId: "a",
	};
	for (const settings of [load(fromData), load(fromData, {}), load(fromData, { localGroups: DEFAULT_LOCAL })]) {
		assert.equal(settings.cliProfiles.length, 1);
		assert.deepEqual(settings.cliProfiles[0], load({}).cliProfiles[0]);
		assert.equal(settings.cliProfiles[0].cliPath, "");
		assert.equal(settings.cliProfiles[0].extraArgs, "");
		assert.equal(settings.defaultProfileId, "default");
	}
	// The pre-0.4 flat fields are no way around it.
	const legacy = load({ cliPath: "/tmp/evil", useWsl: true });
	assert.deepEqual(legacy.cliProfiles, load({}).cliProfiles);
	// This device's own profiles still apply.
	const own = load(fromData, {
		cliProfiles: [{ id: "b", name: "Mine", cliPath: "/mine", useWsl: false }],
		defaultProfileId: "b",
	});
	assert.equal(own.cliProfiles[0].cliPath, "/mine");
	assert.equal(own.defaultProfileId, "b");
});

test("PRD-001.R24: a device's own CLI profiles ignore the default profile id in data.json", () => {
	const profiles = [
		{ id: "a", name: "One", cliPath: "/one", useWsl: false },
		{ id: "b", name: "Two", cliPath: "/two", useWsl: false },
	];
	// The device stored profiles but no default id; data.json names one of them.
	const settings = load({ defaultProfileId: "b" }, { localGroups: DEFAULT_LOCAL, cliProfiles: profiles });
	assert.deepEqual(
		settings.cliProfiles.map((p) => p.id),
		["a", "b"]
	);
	assert.equal(settings.defaultProfileId, "a");
	// The device's own id still applies.
	assert.equal(load({ defaultProfileId: "a" }, { cliProfiles: profiles, defaultProfileId: "b" }).defaultProfileId, "b");
});

test("PRD-001.R24: CLI profiles this device switched to synced follow data.json", () => {
	const settings = load(
		{
			cliProfiles: [{ id: "a", name: "Synced", cliPath: "/synced", useWsl: false }],
			defaultProfileId: "a",
		},
		{ ...CLI_SYNCED, cliProfiles: [{ id: "b", name: "Stale", cliPath: "/stale", useWsl: false }] }
	);
	assert.equal(settings.cliProfiles[0].cliPath, "/synced");
	assert.equal(settings.defaultProfileId, "a");
});

test("PRD-001.R24: a device-only unit other than the six never-seeded ones still seeds from data.json", () => {
	const settings = load(
		{
			model: "opus",
			lastModel: "sonnet",
			includeContextByDefault: false,
			effort: "high",
			// The six never-seeded units, each carrying a value in data.json.
			cliProfiles: [{ id: "a", name: "Shared", cliPath: "/tmp/evil", useWsl: false }],
			defaultProfileId: "a",
			defaultPermissionMode: "auto",
			enableBypassMode: true,
			vaultInstructions: "run anything",
			enableBashMode: false,
			enableObsidianMcp: false,
		},
		{ localGroups: [...DEFAULT_LOCAL, "model", "context"] }
	);
	assert.equal(settings.model, "opus");
	assert.equal(settings.lastModel, "sonnet");
	assert.equal(settings.includeContextByDefault, false);
	// A synced unit is untouched, and the six start at their defaults.
	assert.equal(settings.effort, "high");
	for (const key of SECURITY_KEYS) assert.deepEqual(settings[key], DEFAULT_SETTINGS[key], key);
	assert.deepEqual(settings.cliProfiles, load({}).cliProfiles);
	assert.equal(settings.defaultProfileId, "default");
	// The seed leaves data.json at the next save.
	const { synced, local } = splitSettings(settings);
	assert.ok(!("model" in synced) && !("includeContextByDefault" in synced));
	assert.equal(local.model, "opus");
});

// A 0.5.0-or-earlier device wrote a device object with its profiles and learned caches, never localGroups.
const FROM_050 = { resolvedModels: {}, cliModels: [] };
const OWN_PROFILE = { id: "b", name: "Own", cliPath: "/own", useWsl: false };
const UPGRADE_DATA = {
	enableBashMode: false,
	enableObsidianMcp: false,
	defaultPermissionMode: "plan",
	vaultInstructions: "x",
	enableBypassMode: true,
};

test("PRD-001.R24: an upgrade from 0.5.0 keeps Bash and vault tools off, Plan, and the instructions", () => {
	const settings = load(UPGRADE_DATA, FROM_050);
	assert.equal(settings.enableBashMode, false);
	assert.equal(settings.enableObsidianMcp, false);
	assert.equal(settings.defaultPermissionMode, "plan");
	assert.equal(settings.vaultInstructions, "x");
	assert.equal(settings.enableBypassMode, false);
	// Bypass stays on only when this device's own value says so.
	assert.equal(load(UPGRADE_DATA, { ...FROM_050, enableBypassMode: true }).enableBypassMode, true);
});

test("PRD-001.R24: an upgrade never carries over a default that runs without a card", () => {
	for (const mode of ["acceptEdits", "auto", "bypassPermissions", "bogus"])
		assert.equal(load({ ...UPGRADE_DATA, defaultPermissionMode: mode }, FROM_050).defaultPermissionMode, "default", mode);
	assert.equal(load({ ...UPGRADE_DATA, defaultPermissionMode: "default" }, FROM_050).defaultPermissionMode, "default");
});

test("PRD-001.R24: an upgrade never takes CLI profiles or the default profile id from data.json", () => {
	const fromData = {
		cliProfiles: [{ id: "a", name: "Shared", cliPath: "/tmp/evil", useWsl: false, extraArgs: "--debug" }],
		defaultProfileId: "a",
	};
	const settings = load({ ...UPGRADE_DATA, ...fromData }, FROM_050);
	assert.deepEqual(settings.cliProfiles, load({}).cliProfiles);
	assert.equal(settings.defaultProfileId, "default");
	// This device's own profiles apply, and its own default id, not the one in data.json.
	const own = load({ ...UPGRADE_DATA, ...fromData }, { ...FROM_050, cliProfiles: [OWN_PROFILE], defaultProfileId: "b" });
	assert.equal(own.cliProfiles[0].cliPath, "/own");
	assert.equal(own.defaultProfileId, "b");
	const noId = load(
		{ ...UPGRADE_DATA, defaultProfileId: "b" },
		{ ...FROM_050, cliProfiles: [{ ...OWN_PROFILE, id: "a" }, OWN_PROFILE] }
	);
	assert.equal(noId.defaultProfileId, "a");
});

test("PRD-001.R24: only a device object with no localGroups key and a key an earlier build wrote is an upgrade", () => {
	const data = { enableBashMode: false, vaultInstructions: "x", defaultPermissionMode: "plan" };
	for (const local of [
		{ foo: 1 },
		{ ...FROM_050, localGroups: "x" },
		{ ...FROM_050, localGroups: null },
		{ ...FROM_050, localGroups: DEFAULT_LOCAL },
	]) {
		const settings = load(data, local);
		for (const key of ["enableBashMode", "vaultInstructions", "defaultPermissionMode"])
			assert.deepEqual(settings[key], DEFAULT_SETTINGS[key], `${key} ${JSON.stringify(local)}`);
	}
	assert.equal(isUpgradeShape(FROM_050), true);
	assert.equal(isUpgradeShape({ cliProfiles: [] }), true);
	for (const local of [null, undefined, {}, [], "x", { foo: 1 }, { ...FROM_050, localGroups: [] }, { ...FROM_050, localGroups: null }])
		assert.equal(isUpgradeShape(local), false, JSON.stringify(local));
});

test("PRD-001.R24: an upgrade fails closed for keys another device already moved out of data.json", () => {
	const settings = load({ model: "opus" }, FROM_050);
	assert.equal(settings.enableBashMode, false);
	assert.equal(settings.enableObsidianMcp, false);
	assert.equal(settings.defaultPermissionMode, "default");
	assert.equal(settings.vaultInstructions, "");
	assert.equal(settings.enableBypassMode, false);
	// Device A upgrades and saves; device B then upgrades from the file A left behind.
	const a = splitSettings(load(UPGRADE_DATA, FROM_050));
	assert.ok(!("enableBashMode" in a.synced) && !("vaultInstructions" in a.synced));
	const b = load(a.synced, FROM_050);
	assert.equal(b.enableBashMode, false);
	assert.equal(b.enableObsidianMcp, false);
	assert.equal(b.defaultPermissionMode, "default");
	assert.equal(b.vaultInstructions, "");
});

test("PRD-001.R24: an upgrade reads an invalid Bash or vault-tools value as off", () => {
	for (const bad of [null, "false", 0, 1, {}, []]) {
		const settings = load({ ...UPGRADE_DATA, enableBashMode: bad, enableObsidianMcp: bad }, FROM_050);
		assert.equal(settings.enableBashMode, false, JSON.stringify(bad));
		assert.equal(settings.enableObsidianMcp, false, JSON.stringify(bad));
	}
	const on = load({ ...UPGRADE_DATA, enableBashMode: true, enableObsidianMcp: true }, FROM_050);
	assert.equal(on.enableBashMode, true);
	assert.equal(on.enableObsidianMcp, true);
});

test("PRD-001.R24: an upgrade reads a non-string permission mode as the default without throwing", () => {
	for (const bad of [{ toString: null }, {}, [], null, 5, { toString: () => "plan" }, ["plan"]])
		assert.equal(load({ ...UPGRADE_DATA, defaultPermissionMode: bad }, FROM_050).defaultPermissionMode, "default");
});

test("PRD-001.R24: a device object with localGroups never takes the never-seeded units from data.json", () => {
	const settings = load(
		{ defaultPermissionMode: "plan", vaultInstructions: "x", enableBashMode: false },
		{ localGroups: DEFAULT_LOCAL }
	);
	for (const key of SECURITY_KEYS) assert.deepEqual(settings[key], DEFAULT_SETTINGS[key], key);
});

test("PRD-001.R24: the seed from 0.5.0 does not repeat after the first save", () => {
	const first = load(UPGRADE_DATA, FROM_050);
	const { synced, local } = splitSettings(first);
	assert.ok(Array.isArray(local.localGroups));
	assert.equal(local.vaultInstructions, "x");
	assert.equal(isUpgradeShape(local), false);
	// The next load sees the saved device object; a stale data.json cannot reseed it.
	const next = load({ ...synced, ...UPGRADE_DATA, vaultInstructions: "stale" }, local);
	assert.equal(next.vaultInstructions, "x");
	assert.equal(next.defaultPermissionMode, "plan");
	assert.equal(load(UPGRADE_DATA, { ...local, vaultInstructions: "" }).vaultInstructions, "");
});

test("PRD-001.R24: prototype keys in data.json change nothing on upgrade", () => {
	const data = JSON.parse('{"__proto__":{"enableBashMode":true},"constructor":{"x":1},"prototype":{"y":2}}');
	const settings = load(data, FROM_050);
	assert.equal(settings.enableBashMode, false);
	assert.equal({}.enableBashMode, undefined);
	assert.deepEqual(settings, load({}, FROM_050));
});

test("PRD-001.R24: a save writes this device's object before data.json, and no file when that fails", async () => {
	const calls = [];
	const settings = load(UPGRADE_DATA, FROM_050);
	await writeStores(settings, {
		loadedLocalGroups: DEFAULT_LOCAL,
		readLocal: () => FROM_050,
		writeLocal: (value) => calls.push(["local", value]),
		writeData: async (value) => calls.push(["data", value]),
	});
	assert.deepEqual(
		calls.map((c) => c[0]),
		["local", "data"]
	);
	assert.ok(Array.isArray(calls[0][1].localGroups));
	assert.ok(!("localGroups" in calls[1][1]));
	const after = [];
	await assert.rejects(
		writeStores(settings, {
			loadedLocalGroups: DEFAULT_LOCAL,
			readLocal: () => FROM_050,
			writeLocal: () => {
				throw new Error("quota");
			},
			writeData: async () => after.push("data"),
		})
	);
	assert.deepEqual(after, []);
});

test("PRD-001.R24: a security setting this device switched to synced follows data.json", () => {
	const settings = load(
		{ enableBypassMode: true, vaultInstructions: "shared" },
		{ localGroups: ["cli"], enableBypassMode: false }
	);
	assert.equal(settings.enableBypassMode, true);
	assert.equal(settings.vaultInstructions, "shared");
});

test("PRD-001.R24: the list of device-only settings is stored on the device, never in data.json", () => {
	const settings = load({}, { localGroups: ["cli", "context"] });
	const { synced, local } = splitSettings(settings);
	assert.ok(!("localGroups" in synced));
	assert.deepEqual(local.localGroups, ["cli", "context"]);
});

test("PRD-001.R24: a data.json list can make more units device-only, never fewer", () => {
	assert.deepEqual(load({ localGroups: ["context"] }).localGroups, [...DEFAULT_LOCAL, "context"]);
	assert.deepEqual(load({ localGroups: [] }).localGroups, DEFAULT_LOCAL);
	assert.deepEqual(load({ localGroups: ["cli"] }).localGroups, DEFAULT_LOCAL);
});

test("PRD-001.R24: this device's own list wins, an explicit empty list included", () => {
	assert.deepEqual(load({ localGroups: ["context"] }, { localGroups: [] }).localGroups, []);
	assert.deepEqual(load({}, { localGroups: ["bash", 7, "bogus"] }).localGroups, ["bash"]);
});

test("ADR-009: a wrong-typed security value falls back to its default", () => {
	const fromDevice = load(
		{},
		{
			enableBypassMode: "false",
			enableBashMode: 0,
			enableObsidianMcp: null,
			vaultInstructions: 5,
			defaultPermissionMode: ["auto"],
		}
	);
	for (const key of SECURITY_KEYS) assert.deepEqual(fromDevice[key], DEFAULT_SETTINGS[key], key);
	// The same check applies to a unit this device syncs.
	const fromData = load({ enableBypassMode: "true", vaultInstructions: {} }, { localGroups: [] });
	assert.equal(fromData.enableBypassMode, false);
	assert.equal(fromData.vaultInstructions, "");
});

/** Values of the wrong type for a default, by the default's type. */
const WRONG_TYPE = {
	string: [5, true, null, {}, ["x"]],
	boolean: ["true", 1, 0, null, {}, []],
	number: ["300", null, true, NaN, Infinity, {}, []],
};

/** Every unit device-local, so a device value applies to every key. */
const ALL_LOCAL = SYNC_UNITS.map((unit) => unit.key);

test("ADR-009: a value of the wrong type loads as its default, from either store", () => {
	// cliProfiles is rebuilt by its own check; defaultProfileId then names the one profile.
	for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
		if (key === "cliProfiles") continue;
		for (const bad of WRONG_TYPE[typeof fallback]) {
			const label = `${key} = ${JSON.stringify(bad)}`;
			assert.deepEqual(load({ [key]: bad }, { localGroups: [] })[key], fallback, `data.json ${label}`);
			assert.deepEqual(load({}, { localGroups: ALL_LOCAL, [key]: bad })[key], fallback, `device ${label}`);
		}
	}
});

test("ADR-009: a wrong-typed list of profiles loads as the one default profile", () => {
	for (const bad of ["claude", 5, null, {}, { 0: { id: "a" } }]) {
		const settings = load({ cliProfiles: bad }, CLI_SYNCED);
		assert.deepEqual(settings.cliProfiles, [load({}).cliProfiles[0]]);
		assert.equal(settings.defaultProfileId, "default");
	}
});

test("ADR-009: values of the right type load unchanged", () => {
	const stored = {
		model: "opus",
		effort: "high",
		lastModel: "sonnet",
		lastEffort: "low",
		includeContextByDefault: false,
		tabPosition: "side",
		theme: "dark",
		exportEnabled: true,
		exportFolder: "Notes/Agent",
		exportFilePattern: "{id}",
		exportDateFormat: "YYYY",
		usageRefreshSeconds: 60,
		showUsage: false,
		usageWarnPercent: 0,
		usageCritPercent: 100,
	};
	// The learned caches live on the device only.
	const caches = {
		resolvedModels: { opus: "claude-opus-5" },
		cliModels: { default: [{ value: "", resolvedModel: "claude-opus-5" }, { value: "opus", displayName: "Opus" }] },
		cliStartupModes: { default: "plan" },
	};
	const settings = load(stored, { localGroups: [], ...caches });
	for (const [key, value] of Object.entries({ ...stored, ...caches })) assert.deepEqual(settings[key], value, key);
});

test("ADR-009: a tab position the setting does not offer, and a usage percent outside 0 to 100, load as the default", () => {
	for (const tabPosition of ["left", "TOP", ""])
		assert.equal(load({ tabPosition }).tabPosition, "auto", tabPosition);
	for (const key of ["usageWarnPercent", "usageCritPercent"])
		for (const bad of [-5, 101, 1e9])
			assert.equal(load({ [key]: bad })[key], DEFAULT_SETTINGS[key], `${key} ${bad}`);
	for (const tabPosition of ["top", "side", "auto"])
		assert.equal(load({ tabPosition }).tabPosition, tabPosition);
});

test("PRD-001.R25: conversation tabs default to Automatic, and a stored choice is kept", () => {
	assert.equal(DEFAULT_SETTINGS.tabPosition, "auto");
	assert.equal(load({}).tabPosition, "auto");
	for (const tabPosition of ["top", "side"])
		assert.equal(load({ tabPosition }).tabPosition, tabPosition);
});

test("PRD-001.R25: the theme defaults to Auto and syncs by default", () => {
	assert.equal(DEFAULT_SETTINGS.theme, "match");
	assert.equal(load({}).theme, "match");
	assert.deepEqual(
		SYNC_UNITS.find((unit) => unit.key === "theme"),
		{ key: "theme", settings: ["theme"], defaultLocal: false }
	);
	const { synced, local } = splitSettings(load({ theme: "light" }));
	assert.equal(synced.theme, "light");
	assert.ok(!("theme" in local));
});

test("PRD-001.R34, ADR-009: a stored theme other than Auto, Light or Dark loads as Auto", () => {
	for (const theme of ["", "Dark", "system", "auto"]) assert.equal(load({ theme }).theme, "match", theme);
	for (const theme of ["match", "light", "dark"]) assert.equal(load({ theme }).theme, theme);
});

test("PRD-001.R32, R25: Show tooltips defaults to on, syncs by default and is kept off when stored off", () => {
	assert.equal(DEFAULT_SETTINGS.showTooltips, true);
	assert.equal(load({}).showTooltips, true);
	assert.equal(load({ showTooltips: false }).showTooltips, false);
	assert.deepEqual(
		SYNC_UNITS.find((unit) => unit.key === "showTooltips"),
		{ key: "showTooltips", settings: ["showTooltips"], defaultLocal: false }
	);
	const { synced, local } = splitSettings(load({ showTooltips: false }));
	assert.equal(synced.showTooltips, false);
	assert.ok(!("showTooltips" in local));
});

test("PRD-001.R32, ADR-009: a stored Show tooltips of another type loads as on", () => {
	for (const value of ["false", 0, null, {}, "off"]) assert.equal(load({ showTooltips: value }).showTooltips, true);
});

test("PRD-001.R25: the prompt settings default to Card, the pinned prompt and the jump rail on, and sync by default", () => {
	assert.equal(DEFAULT_SETTINGS.promptStyle, "card");
	assert.equal(DEFAULT_SETTINGS.pinPrompt, true);
	assert.equal(DEFAULT_SETTINGS.promptRail, true);
	const loaded = load({});
	assert.deepEqual([loaded.promptStyle, loaded.pinPrompt, loaded.promptRail], ["card", true, true]);
	for (const key of ["promptStyle", "pinPrompt", "promptRail"])
		assert.deepEqual(
			SYNC_UNITS.find((unit) => unit.key === key),
			{ key, settings: [key], defaultLocal: false },
			key
		);
	const { synced, local } = splitSettings(load({ promptStyle: "bubble", pinPrompt: false, promptRail: false }));
	assert.deepEqual([synced.promptStyle, synced.pinPrompt, synced.promptRail], ["bubble", false, false]);
	for (const key of ["promptStyle", "pinPrompt", "promptRail"]) assert.ok(!(key in local), key);
});

test("PRD-001.R33: the prompt styles are Card and Bubble, in that order", () => {
	assert.deepEqual([...PROMPT_STYLES], ["card", "bubble"]);
});

test("PRD-001.R33, ADR-009: a stored prompt style other than Card or Bubble loads as Card, a toggle of the wrong type as on", () => {
	for (const promptStyle of ["", "Bubble", "Quiet", "quiet", "popout", 1, null]) assert.equal(load({ promptStyle }).promptStyle, "card");
	for (const promptStyle of ["card", "bubble"]) assert.equal(load({ promptStyle }).promptStyle, promptStyle);
	for (const value of ["false", 0, null, {}]) {
		assert.equal(load({ pinPrompt: value }).pinPrompt, true);
		assert.equal(load({ promptRail: value }).promptRail, true);
	}
});

test("PRD-001.R33: Card is numbered with the jump rail, Bubble is neither", () => {
	assert.deepEqual(promptLayout("card"), { numbered: true, rail: true });
	assert.deepEqual(promptLayout("bubble"), { numbered: false, rail: false });
	for (const style of PROMPT_STYLES) assert.equal(promptLayout(style).rail, promptLayout(style).numbered, style);
});

test("PRD-001.R25, R33: the prompt color defaults to Sand with no custom color, and syncs by default as one unit with its custom color", () => {
	assert.equal(DEFAULT_SETTINGS.promptColor, "sand");
	assert.equal(DEFAULT_SETTINGS.promptCustomColor, "");
	const loaded = load({});
	assert.deepEqual([loaded.promptColor, loaded.promptCustomColor], ["sand", ""]);
	assert.deepEqual(
		SYNC_UNITS.find((unit) => unit.key === "promptColor"),
		{ key: "promptColor", settings: ["promptColor", "promptCustomColor"], defaultLocal: false }
	);
	const { synced, local } = splitSettings(load({ promptColor: "custom", promptCustomColor: "#4d91b3" }));
	assert.deepEqual([synced.promptColor, synced.promptCustomColor], ["custom", "#4d91b3"]);
	assert.ok(!("promptColor" in local) && !("promptCustomColor" in local));
});

test("PRD-001.R33, ADR-009: a stored prompt color outside the ten, and a custom color over 64 characters, load as the default", () => {
	for (const promptColor of ["", "Sage", "quiet", "card", "toString", "__proto__", 1, null])
		assert.equal(load({ promptColor }).promptColor, "sand", String(promptColor));
	for (const promptColor of PROMPT_COLORS) assert.equal(load({ promptColor }).promptColor, promptColor);
	assert.equal(load({ promptColor: "mist" }).promptColor, "mist", "a stored Mist stays Mist");
	assert.equal(load({ promptCustomColor: "#" + "a".repeat(63) }).promptCustomColor, "#" + "a".repeat(63), "64 characters kept");
	assert.equal(load({ promptCustomColor: "#" + "a".repeat(64) }).promptCustomColor, "");
	// The same check applies to this device's value.
	assert.equal(load({}, { localGroups: ALL_LOCAL, promptColor: "Sage" }).promptColor, "sand");
	assert.equal(load({}, { localGroups: ALL_LOCAL, promptCustomColor: "x".repeat(65) }).promptCustomColor, "");
});

test("PRD-001.R24, R33: a stored quiet or popout loads as Card, keeping the stored prompt color, and is saved as card", () => {
	for (const promptStyle of ["quiet", "popout"]) {
		for (const promptColor of ["mist", "sage", "clear", "accent"]) {
			const settings = load({ promptStyle, promptColor });
			assert.deepEqual([settings.promptStyle, settings.promptColor], ["card", promptColor], `${promptStyle} ${promptColor}`);
		}
		const custom = load({ promptStyle, promptColor: "custom", promptCustomColor: "#4d91b3" });
		assert.deepEqual([custom.promptStyle, custom.promptColor, custom.promptCustomColor], ["card", "custom", "#4d91b3"]);
		const saved = splitSettings(load({ promptStyle, promptColor: "sage" }));
		assert.deepEqual([saved.synced.promptStyle, saved.synced.promptColor], ["card", "sage"], "the next save writes card");
		// From this device's store too.
		const local = { localGroups: [...DEFAULT_LOCAL, "promptStyle", "promptColor"], promptStyle, promptColor: "rose" };
		const fromLocal = load({}, local);
		assert.deepEqual([fromLocal.promptStyle, fromLocal.promptColor], ["card", "rose"], `${promptStyle} from the device`);
	}
	for (const promptStyle of ["card", "bubble"]) {
		const kept = load({ promptStyle, promptColor: "rose" });
		assert.deepEqual([kept.promptStyle, kept.promptColor], [promptStyle, "rose"], promptStyle);
	}
});

test("PRD-001.R24, R33: with Prompt style device-only and no prompt color stored, Prompt color stays synced", () => {
	const local = { localGroups: [...DEFAULT_LOCAL, "promptStyle"], promptStyle: "bubble" };
	for (const settings of [load({}, local), load({ localGroups: ["promptStyle"] }, null)]) {
		assert.ok(settings.localGroups.includes("promptStyle"));
		assert.ok(!settings.localGroups.includes("promptColor"));
		const saved = splitSettings(settings);
		assert.equal(saved.synced.promptColor, "sand");
		assert.ok(!("promptColor" in saved.local));
	}
});

test("PRD-001.R24: a device-only Model row leaves Effort synced", () => {
	assert.deepEqual(sanitizeLocalGroups(["model"]), ["model"]);
	const settings = load(
		{ effort: "high" },
		{ localGroups: ["model"], model: "opus", lastModel: "sonnet" }
	);
	const { synced, local } = splitSettings(settings);
	assert.equal(local.model, "opus");
	assert.equal(local.lastModel, "sonnet");
	assert.ok(!("model" in synced) && !("lastModel" in synced));
	assert.equal(synced.effort, "high");
	assert.ok(!("effort" in local));
});

test("ADR-009: a value has its default's kind: null, arrays, objects and non-finite numbers are told apart", () => {
	assert.ok(sameKind("a", ""));
	assert.ok(sameKind(false, true));
	assert.ok(sameKind(0, 300));
	assert.ok(sameKind([], []));
	assert.ok(sameKind({}, {}));
	assert.ok(!sameKind(null, {}), "null is not an object");
	assert.ok(!sameKind(null, []), "null is not an array");
	assert.ok(!sameKind(null, ""));
	assert.ok(!sameKind([], {}), "an array is not an object");
	assert.ok(!sameKind({}, []), "an object is not an array");
	assert.ok(!sameKind(NaN, 300));
	assert.ok(!sameKind(Infinity, 300));
	assert.ok(!sameKind("300", 300));
	assert.ok(!sameKind(300, ""));
	assert.ok(!sameKind(undefined, ""));
});

test("PRD-002.R8: a stored default permission mode outside the four options loads as Claude Code default", () => {
	for (const bad of ["bypassPermissions", "dontAsk", "AUTO", 7, null]) {
		assert.equal(load({}, { defaultPermissionMode: bad }).defaultPermissionMode, "default", `device ${bad}`);
		assert.equal(
			load({ defaultPermissionMode: bad }, { localGroups: [] }).defaultPermissionMode,
			"default",
			`data.json ${bad}`
		);
	}
});

test("PRD-002.R8: the four offered default modes load unchanged", () => {
	for (const mode of ["default", "acceptEdits", "plan", "auto"]) {
		assert.equal(load({}, { defaultPermissionMode: mode }).defaultPermissionMode, mode);
		assert.equal(validDefaultPermissionMode(mode), mode);
	}
});

test("PRD-002.R10: a new tab never starts in Bypass, whatever the stored default", () => {
	assert.equal(validDefaultPermissionMode("bypassPermissions"), "default");
	assert.equal(validDefaultPermissionMode(undefined), "default");
});

test("device-local values override synced ones, absent ones seed from synced", () => {
	const localModel = [...DEFAULT_LOCAL, "model"];
	const settings = load({ model: "opus" }, { localGroups: localModel, model: "haiku" });
	assert.equal(settings.model, "haiku");
	// No local copy of this key yet - the synced value seeds it.
	const seeded = load({ model: "opus" }, { localGroups: localModel });
	assert.equal(seeded.model, "opus");
});

test("a group moved back to synced ignores its stale local copy", () => {
	const settings = load(
		{ model: "opus" },
		{ localGroups: [], model: "haiku", cliProfiles: [{ id: "x", name: "", cliPath: "/x", useWsl: false }] }
	);
	assert.equal(settings.model, "opus");
	assert.equal(settings.cliProfiles[0].cliPath, "");
	const { synced } = splitSettings(settings);
	assert.equal(synced.model, "opus");
	assert.ok("cliProfiles" in synced);
});

test("marking a group local moves its values out of data.json", () => {
	const settings = load({ includeContextByDefault: false });
	settings.localGroups = [...settings.localGroups, "context"];
	const { synced, local } = splitSettings(settings);
	assert.ok(!("includeContextByDefault" in synced));
	assert.equal(local.includeContextByDefault, false);
	assert.deepEqual(local.localGroups, [...DEFAULT_LOCAL, "context"]);
});

test("learned model resolutions never sync", () => {
	const settings = load({}, { localGroups: DEFAULT_LOCAL, resolvedModels: { opus: "claude-opus-5" } });
	const { synced, local } = splitSettings(settings);
	assert.ok(!("resolvedModels" in synced));
	assert.deepEqual(local.resolvedModels, { opus: "claude-opus-5" });
});

test("PRD-001.R24: the learned caches are never seeded from data.json", () => {
	const data = {
		resolvedModels: { opus: "claude-opus-5" },
		cliModels: { default: [{ value: "opus" }] },
		cliStartupModes: { default: "plan" },
	};
	for (const local of [null, { localGroups: DEFAULT_LOCAL }, { localGroups: [] }]) {
		const settings = load(data, local);
		for (const key of Object.keys(data)) assert.ok(!(key in settings), `${key} with ${JSON.stringify(local)}`);
	}
	// An upgrade from 0.5.0 keeps the device's own caches: an empty object, and a list that is no object is absent.
	const upgraded = load(data, FROM_050);
	assert.deepEqual(upgraded.resolvedModels, {});
	assert.ok(!("cliModels" in upgraded) && !("cliStartupModes" in upgraded));
	// The device's own caches load.
	const settings = load(data, { localGroups: DEFAULT_LOCAL, ...data });
	for (const [key, value] of Object.entries(data)) assert.deepEqual(settings[key], value, key);
});

test("PRD-003.R4: a learned cache entry of another shape or with an unsafe value is dropped", () => {
	const local = {
		localGroups: DEFAULT_LOCAL,
		resolvedModels: { opus: "claude-opus-5", number: 7, spaced: "a b", flag: "-x", quoted: 'a"b', ["__proto__"]: "x" },
		cliModels: {
			default: [
				{ value: "opus", displayName: "Opus" },
				{ value: "" },
				{ value: "a b" },
				{ value: "-r" },
				{ value: "x", resolvedModel: "a b" },
				{ value: "sonnet", supportedEffortLevels: ["low", "--version", "a b", 3, "high"] },
				{ value: 5 },
				null,
				"opus",
			],
			text: "opus",
			nothingLeft: [{ value: 3 }, { value: "a|b" }],
		},
		cliStartupModes: { default: "plan", number: 3, list: ["plan"] },
	};
	const settings = load({}, local);
	assert.deepEqual(settings.resolvedModels, { opus: "claude-opus-5" });
	assert.deepEqual(settings.cliModels, {
		default: [{ value: "opus", displayName: "Opus" }, { value: "" }, { value: "sonnet", supportedEffortLevels: ["low", "high"] }],
	});
	assert.deepEqual(settings.cliStartupModes, { default: "plan" });
	// A cache that is no object is absent, not an empty one.
	for (const key of ["resolvedModels", "cliModels", "cliStartupModes"])
		for (const bad of ["x", 1, null, [1], true])
			assert.ok(!(key in load({}, { localGroups: DEFAULT_LOCAL, [key]: bad })), `${key} = ${JSON.stringify(bad)}`);
});

test("PRD-003.R4: the initialize reply's models are screened as a stored list is", () => {
	assert.deepEqual(safeCliModels([{ value: "default", resolvedModel: "claude-opus-5" }, { value: "opus" }, { value: "a b" }]), [
		{ value: "", resolvedModel: "claude-opus-5" },
		{ value: "opus" },
	]);
	assert.deepEqual(safeCliModels([{ value: "opus", supportedEffortLevels: ["high", "-x", "max"] }]), [
		{ value: "opus", supportedEffortLevels: ["high", "max"] },
	]);
	assert.deepEqual(safeCliModels([{ value: "opus", supportedEffortLevels: [] }]), [{ value: "opus", supportedEffortLevels: [] }]);
	assert.equal(safeCliModels([{ value: "a b" }]), undefined);
	assert.equal(safeCliModels(undefined), undefined);
	assert.equal(safeCliModels([]), undefined);
});

test("sanitizeLocalGroups keeps an explicit empty choice and drops junk", () => {
	assert.deepEqual(sanitizeLocalGroups(undefined), DEFAULT_LOCAL);
	assert.deepEqual(sanitizeLocalGroups([]), []);
	assert.deepEqual(sanitizeLocalGroups(["cli", "bogus", 7]), ["cli"]);
});

test("pre-release coarse group keys map onto today's per-row units", () => {
	assert.deepEqual(sanitizeLocalGroups(["usage"]), [
		"showUsage",
		"usageRefresh",
		"usageWarn",
		"usageCrit",
	]);
	assert.deepEqual(sanitizeLocalGroups(["cli", "permissions"]), [
		"cli",
		"permissionMode",
		"bypass",
	]);
	assert.deepEqual(sanitizeLocalGroups(["chat", "bash"]), [
		"bash",
		"obsidianMcp",
		"context",
	]);
});

test("every sync-unit setting exists on the settings model", () => {
	const settings = load({});
	for (const unit of SYNC_UNITS)
		for (const key of unit.settings)
			assert.ok(
				key in settings || key in DEFAULT_SETTINGS || ["lastModel", "lastEffort"].includes(key),
				`unknown settings key in sync unit "${unit.key}": ${key}`
			);
});

// ---------------------------------------------------------------------------
// Permission decisions (DES-004 rule D4)

const FRESH = { selectedMode: "default", inheritMode: true };

test("PRD-002.R9: a reopened Auto-approve conversation asks first and keeps the tab's mode until confirmed", () => {
	const state = reopenMode({ permissionMode: "auto", permissionModePicked: true }, FRESH, false);
	assert.deepEqual(state, { ...FRESH, confirmAuto: true });
	const picked = { selectedMode: "plan", inheritMode: false };
	assert.deepEqual(reopenMode({ permissionMode: "auto", permissionModePicked: true }, picked, true), {
		...picked,
		confirmAuto: true,
	});
});

test("PRD-002.R9: no confirmation when the tab is already in Auto-approve", () => {
	assert.deepEqual(
		reopenMode({ permissionMode: "auto", permissionModePicked: true }, { selectedMode: "auto", inheritMode: false }, false),
		{ selectedMode: "auto", inheritMode: false, confirmAuto: false }
	);
});

test("PRD-002.R10: a reopened Bypass conversation applies only while bypass is on", () => {
	const stored = { permissionMode: "bypassPermissions", permissionModePicked: true };
	assert.deepEqual(reopenMode(stored, FRESH, false), { ...FRESH, confirmAuto: false });
	assert.deepEqual(reopenMode(stored, FRESH, true), {
		selectedMode: "bypassPermissions",
		inheritMode: false,
		confirmAuto: false,
	});
});

test("PRD-002.R11: a stored default the user never picked reopens inheriting Claude Code's default", () => {
	assert.deepEqual(reopenMode({ permissionMode: "default" }, { selectedMode: "plan", inheritMode: false }, false), {
		selectedMode: "default",
		inheritMode: true,
		confirmAuto: false,
	});
});

test("PRD-002.R11: a picked mode reopens as a pick, Ask before acting included", () => {
	for (const mode of ["default", "acceptEdits", "plan"])
		assert.deepEqual(reopenMode({ permissionMode: mode, permissionModePicked: true }, FRESH, false), {
			selectedMode: mode,
			inheritMode: false,
			confirmAuto: false,
		});
});

test("PRD-002.R11: an unknown or wrong-typed stored mode, or a non-boolean picked flag, is ignored", () => {
	for (const permissionMode of ["dontAsk", "AUTO", 7, null, undefined, {}])
		assert.deepEqual(reopenMode({ permissionMode, permissionModePicked: true }, FRESH, true), {
			...FRESH,
			confirmAuto: false,
		});
	assert.equal(reopenMode({ permissionMode: "default", permissionModePicked: "false" }, FRESH, false).inheritMode, true);
});

const EDIT = { questionForm: false, isEdit: true, sandboxOff: false };
const OTHER = { questionForm: false, isEdit: false, sandboxOff: false };

test("PRD-002.R9: Auto-approve shows the card for a rule-flagged request", () => {
	assert.equal(permissionDecision("auto", { decisionReasonType: "rule" }, OTHER), "card");
	assert.equal(permissionDecision("auto", { decisionReasonType: "rule" }, EDIT), "card-after-read");
});

test("PRD-002.R9: Auto-approve shows the card for a hook-flagged request", () => {
	assert.equal(permissionDecision("auto", { decisionReasonType: "hook" }, OTHER), "card");
});

test("PRD-002.R9: Auto-approve shows the card when Claude Code requires user interaction", () => {
	assert.equal(permissionDecision("auto", { requiresUserInteraction: true }, OTHER), "card");
	assert.equal(
		permissionDecision("auto", { decisionReasonType: "mode", requiresUserInteraction: true }, EDIT),
		"card-after-read"
	);
});

test("PRD-002.R9: Auto-approve shows the card for a request Claude Code's safety check flagged", () => {
	assert.equal(permissionDecision("auto", { decisionReasonType: "safetyCheck" }, OTHER), "card");
	assert.equal(permissionDecision("auto", { decisionReasonType: "safetyCheck" }, EDIT), "card-after-read");
	assert.equal(
		permissionDecision("auto", { decisionReasonType: "safetyCheck", classifierApprovable: true }, OTHER),
		"card"
	);
});

test("PRD-002.R9: Auto-approve shows the card for a compound command with a safety check inside", () => {
	// Claude Code sets classifier_approvable, either way, only when a safety
	// check is somewhere in the reason; a compound command's type stays
	// subcommandResults.
	for (const classifierApprovable of [false, true])
		assert.equal(
			permissionDecision("auto", { decisionReasonType: "subcommandResults", classifierApprovable }, OTHER),
			"card",
			String(classifierApprovable)
		);
});

test("PRD-002.R9: Auto-approve shows the card for a request an ask rule forced beside the tool's own reason", () => {
	for (const decisionReasonType of ["other", "workingDir", "mode", undefined])
		assert.equal(
			permissionDecision("auto", { decisionReasonType, matchedAskRule: true }, OTHER),
			"card",
			String(decisionReasonType)
		);
	assert.equal(permissionDecision("auto", { decisionReasonType: "other", matchedAskRule: true }, EDIT), "card-after-read");
});

test("PRD-002.R9: Auto-approve shows the card for a command that asks to run outside the sandbox", () => {
	assert.equal(permissionDecision("auto", { toolName: "Bash", decisionReasonType: "sandboxOverride" }, OTHER), "card");
	// The input says so too: a CLI that sends no reason, or reports another one, still gets the card.
	const sandboxOff = { ...OTHER, sandboxOff: true };
	assert.equal(permissionDecision("auto", { toolName: "Bash" }, sandboxOff), "card");
	assert.equal(permissionDecision("auto", { toolName: "Bash", decisionReasonType: "mode" }, sandboxOff), "card");
	assert.equal(permissionDecision("plan", { toolName: "Bash" }, sandboxOff), "card");
	assert.equal(asksSandboxOff({ command: "ls", dangerouslyDisableSandbox: true }), true);
	for (const input of [{ command: "ls" }, { dangerouslyDisableSandbox: "true" }, { dangerouslyDisableSandbox: false }, {}])
		assert.equal(asksSandboxOff(input), false, JSON.stringify(input));
});

test("PRD-002.R9: Auto-approve shows the card when an organization's MCP ceiling forced the ask", () => {
	for (const decisionReasonType of ["other", "rule"])
		assert.equal(
			permissionDecision("auto", { decisionReasonType, decisionReasonCode: "org_ask_ceiling" }, OTHER),
			"card",
			decisionReasonType
		);
	assert.equal(
		permissionDecision("auto", { decisionReasonType: "other", decisionReasonCode: "classifier_transcript_too_long" }, OTHER),
		"allow"
	);
});

test("PRD-002.R9: Auto-approve shows the card for a reason type it does not know", () => {
	for (const decisionReasonType of ["aFutureReason", "RULE", "Mode", ""])
		assert.equal(permissionDecision("auto", { decisionReasonType }, OTHER), "card", decisionReasonType);
});

test("PRD-002.R9: Auto-approve shows the card when a flag field came with the wrong type", () => {
	assert.equal(permissionDecision("auto", { mistypedFlags: ["classifier_approvable"] }, OTHER), "card");
	assert.equal(
		permissionDecision("auto", { decisionReasonType: "mode", mistypedFlags: ["decision_reason_type"] }, EDIT),
		"card-after-read"
	);
});

test("PRD-002.R9: Auto-approve shows the card for an AskUserQuestion its form cannot show", () => {
	assert.equal(permissionDecision("auto", { toolName: "AskUserQuestion" }, OTHER), "card");
	assert.equal(
		permissionDecision("auto", { toolName: "AskUserQuestion" }, { questionForm: true, isEdit: false, sandboxOff: false }),
		"form"
	);
});

test("PRD-002.R9: a subagent's request is decided like the main agent's", () => {
	assert.equal(permissionDecision("auto", { agentId: "agent-7", decisionReasonType: "rule" }, EDIT), "card-after-read");
	assert.equal(permissionDecision("auto", { agentId: "agent-7", decisionReasonType: "mode" }, OTHER), "allow");
});

test("PRD-002.R9: Auto-approve answers only the reason types it lists", () => {
	assert.deepEqual(
		[...AUTO_APPROVE_REASON_TYPES].sort(),
		["asyncAgent", "classifier", "mode", "other", "permissionPromptTool", "subcommandResults", "workingDir"]
	);
	for (const decisionReasonType of ["rule", "hook", "safetyCheck", "sandboxOverride"])
		assert.equal(AUTO_APPROVE_REASON_TYPES.has(decisionReasonType), false, decisionReasonType);
});

test("PRD-002.R9: Auto-approve allows any other request without a card", () => {
	for (const decisionReasonType of [...AUTO_APPROVE_REASON_TYPES, undefined])
		assert.equal(permissionDecision("auto", { decisionReasonType }, OTHER), "allow", String(decisionReasonType));
	assert.equal(permissionDecision("auto", { requiresUserInteraction: false }, OTHER), "allow");
	assert.equal(permissionDecision("auto", { toolName: "Bash", mistypedFlags: [] }, OTHER), "allow");
});

test("PRD-002.R12: a well-formed AskUserQuestion gets its form in every mode", () => {
	for (const mode of ["default", "acceptEdits", "plan", "auto", "bypassPermissions"])
		assert.equal(
			permissionDecision(mode, { decisionReasonType: "rule" }, { questionForm: true, isEdit: false }),
			"form"
		);
});

test("PRD-002.R1: outside Auto-approve every request gets a card that answers at once", () => {
	for (const mode of ["default", "acceptEdits", "plan", "bypassPermissions"]) {
		assert.equal(permissionDecision(mode, {}, OTHER), "card", mode);
		assert.equal(permissionDecision(mode, { decisionReasonType: "rule" }, EDIT), "card", mode);
		assert.equal(permissionDecision(mode, {}, EDIT), "card", mode);
	}
});

test("PRD-002.R9: Auto-approve launches Claude Code in its default mode", () => {
	assert.equal(cliPermissionMode("auto"), "default");
	assert.equal(cliPermissionMode("plan"), "plan");
});

test("PRD-002.R6: Auto-approve answers an Edit, Write or MultiEdit request only after its pre-edit read finishes", async () => {
	assert.equal(permissionDecision("auto", {}, EDIT), "allow-after-read");
	let finishRead;
	const read = new Promise((resolve) => {
		finishRead = resolve;
	});
	const input = { file_path: "note.md", content: "x" };
	let answer = null;
	const pending = allowAfterRead(read, input).then((result) => {
		answer = result;
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.equal(answer, null, "answered before the read finished");
	finishRead({ before: "old" });
	await pending;
	assert.deepEqual(answer, { behavior: "allow", updatedInput: input });
	assert.equal(answer.updatedInput, input);
});

test("PRD-002.R6: a failed pre-edit read still lets the answer through", async () => {
	const input = { file_path: "note.md" };
	assert.deepEqual(await allowAfterRead(Promise.reject(new Error("EACCES")), input), {
		behavior: "allow",
		updatedInput: input,
	});
});

test("PRD-002.R6: a flagged edit in Auto-approve is allowed from its card only after the pre-edit read", async () => {
	assert.equal(permissionDecision("auto", { decisionReasonType: "hook" }, EDIT), "card-after-read");
	let finishRead;
	const read = new Promise((resolve) => {
		finishRead = resolve;
	});
	const input = { file_path: "note.md" };
	const suggestions = [{ type: "addRules" }];
	let answer = null;
	const pending = allowAfterRead(read, input, suggestions).then((result) => {
		answer = result;
	});
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.equal(answer, null, "Always allow answered before the read finished");
	finishRead(null);
	await pending;
	assert.deepEqual(answer, { behavior: "allow", updatedInput: input, updatedPermissions: suggestions });
});

test("ADR-009: prototype keys in either store change nothing", () => {
	const data = JSON.parse(
		'{"__proto__": {"enableBypassMode": true, "model": "evil"}, "constructor": {"prototype": {"x": 1}}, "model": "opus"}'
	);
	const local = JSON.parse('{"__proto__": {"defaultPermissionMode": "auto"}, "constructor": 1, "prototype": 2}');
	const settings = load(data, local);
	assert.deepEqual(settings, load({ model: "opus" }));
	assert.equal(Object.getPrototypeOf(settings), Object.prototype);
	assert.equal({}.enableBypassMode, undefined);
	assert.equal({}.x, undefined);
});

test("PRD-002.R1: every allow answer carries the input unchanged, and Always allow its rules", () => {
	const input = { command: "ls" };
	assert.deepEqual(allowResult(input), { behavior: "allow", updatedInput: input });
	assert.deepEqual(allowResult(input, [{ type: "addRules" }]), {
		behavior: "allow",
		updatedInput: input,
		updatedPermissions: [{ type: "addRules" }],
	});
});

// ---------------------------------------------------------------------------
// Stored values that reach a command line, and what a reopen restores

/** Values that must never reach argv: a flag, whitespace, control characters, too long. */
const UNSAFE = ["", "-x", "--model", "a b", "a\tb", "a\nb", "a\u0000b", "a\u007fb", "a\u0085b", "a\u00a0b", "a%PATH%", "a&calc", "x".repeat(201), 42, null, true, {}, ["opus"]];

test("PRD-003.R4: isSafeArgValue takes a string of 1 to 200 characters with no whitespace or control character, not starting with -", () => {
	for (const value of ["opus", "claude-opus-4-1-20250805", "high", "p-lx2k-abc123", "0b6f1c2e-4f9a-4c1e-9d7e-2f1a3b4c5d6e", "a-b", "x".repeat(200)])
		assert.equal(isSafeArgValue(value), true, JSON.stringify(value));
	for (const value of UNSAFE) assert.equal(isSafeArgValue(value), false, JSON.stringify(value));
});

test("PRD-003.R4: isSafeArgValue refuses every character cmd.exe would act on (CMD_UNSAFE)", () => {
	for (const ch of `"%!&|<>^\r\n`) assert.equal(isSafeArgValue(`a${ch}b`), false, JSON.stringify(ch));
	// Kept in step with the launch's own check, which settings-core may not import.
	for (let code = 0; code < 0x3000; code++) {
		const ch = String.fromCharCode(code);
		if (CMD_UNSAFE.test(ch)) assert.equal(isSafeArgValue(`a${ch}b`), false, `U+${code.toString(16)}`);
	}
	assert.equal(isSafeArgValue("opus[1m]"), true);
});

test("PRD-003.R4: a stored model, effort, profile id or resolved model that fails isSafeArgValue is read as absent", () => {
	// An unsafe resolved id reads as none reported yet, keeping the format marker.
	for (const bad of UNSAFE.filter((value) => value !== "")) {
		const stored = dropUnsafeArgValues({
			id: "c1",
			sessionId: null,
			model: bad,
			effort: bad,
			profileId: bad,
			resolvedModel: bad,
			title: "--keep",
		});
		assert.deepEqual(stored, { id: "c1", sessionId: null, resolvedModel: "", title: "--keep" }, JSON.stringify(bad));
	}
	const empty = dropUnsafeArgValues({ sessionId: null, profileId: "", resolvedModel: "" });
	assert.deepEqual(empty, { sessionId: null, resolvedModel: "" });
});

test("PRD-003.R4, ADR-018: a stored session id that is a string is kept as stored for the grammar to judge, any other value reads as none", () => {
	for (const rejected of ["--keep", "", "../../x", "0F8B6A2C-1D3E-4F5A-9B7C-8D6E5F4A3B2C"])
		assert.equal(dropUnsafeArgValues({ sessionId: rejected }).sessionId, rejected);
	for (const absent of [undefined, 7, {}, ["x"], true]) assert.equal(dropUnsafeArgValues({ sessionId: absent }).sessionId, null);
});

test("PRD-003.R4: safe stored values and a Default pick are kept as stored", () => {
	const safe = { sessionId: "s-1", model: "opus", effort: "high", profileId: "p-1", resolvedModel: "claude-opus-4-1" };
	assert.deepEqual(dropUnsafeArgValues({ ...safe }), safe);
	assert.deepEqual(dropUnsafeArgValues({ sessionId: null, model: "", effort: "", resolvedModel: "" }), {
		sessionId: null,
		model: "",
		effort: "",
		resolvedModel: "",
	});
	assert.deepEqual(dropUnsafeArgValues({ sessionId: null }), { sessionId: null });
});

test("PRD-003.R4, ADR-009: a model or effort pick in either store that fails isSafeArgValue loads as Default", () => {
	const bad = { model: "--dangerously-skip-permissions", lastModel: "a b", effort: "-x", lastEffort: 7 };
	const fromData = load(bad);
	const fromDevice = load({}, { localGroups: [...DEFAULT_LOCAL, "model", "effort"], ...bad });
	for (const settings of [fromData, fromDevice]) {
		assert.equal(settings.model, "");
		assert.equal(settings.lastModel, "");
		assert.equal(settings.effort, "");
		assert.equal(settings.lastEffort, "");
	}
});

test("PRD-003.R4: safe model and effort picks load unchanged, an absent last pick stays absent", () => {
	const settings = load({ model: "opus", lastModel: "", effort: "high", lastEffort: "max" });
	assert.equal(settings.model, "opus");
	assert.equal(settings.lastModel, "");
	assert.equal(settings.effort, "high");
	assert.equal(settings.lastEffort, "max");
	const fresh = load({});
	assert.equal(fresh.lastModel, undefined);
	assert.equal(fresh.lastEffort, undefined);
});

const TWO_PROFILES = () =>
	load({}, {
		cliProfiles: [
			{ id: "win", name: "Windows" },
			{ id: "wsl", name: "WSL", useWsl: true },
			// A stored id that is a flag never selects a profile, even one with that id.
			{ id: "--wsl", name: "Flag" },
		],
		defaultProfileId: "win",
	});

test("PRD-003.R9: a reopened conversation restores its model and effort picks, Default included", () => {
	const settings = TWO_PROFILES();
	assert.deepEqual(reopenPicks({ model: "opus", effort: "high", profileId: "win" }, settings), {
		model: "opus",
		effort: "high",
		profileId: "win",
	});
	assert.deepEqual(reopenPicks({ model: "", effort: "" }, settings), { model: "", effort: "", profileId: "win" });
	// Files from before picks were stored as "": absent is Default.
	assert.deepEqual(reopenPicks({}, settings), { model: "", effort: "", profileId: "win" });
	assert.deepEqual(reopenPicks({ model: "-x", effort: 3 }, settings), { model: "", effort: "", profileId: "win" });
});

test("PRD-003.R9: a file from 0.5.x reads its model as the resolved id and a Default pick", () => {
	assert.deepEqual(migrateStoredModel({ model: "claude-opus-4-1-20250805", effort: "high" }), {
		model: "",
		effort: "high",
		resolvedModel: "claude-opus-4-1-20250805",
	});
	// No model stored: Default, and the field now marks the current format.
	assert.deepEqual(migrateStoredModel({ effort: "" }), { effort: "", resolvedModel: "" });
	assert.equal(reopenPicks(migrateStoredModel({ model: "opus" }), TWO_PROFILES()).model, "");
});

test("PRD-003.R9: a current file keeps its model pick, with or without a resolved id", () => {
	assert.deepEqual(migrateStoredModel({ model: "opus", resolvedModel: "" }), { model: "opus", resolvedModel: "" });
	assert.deepEqual(migrateStoredModel({ model: "", resolvedModel: "claude-opus-4-1" }), {
		model: "",
		resolvedModel: "claude-opus-4-1",
	});
});

test("PRD-003.R9: a reopened conversation restores its CLI profile, else the default profile", () => {
	const settings = TWO_PROFILES();
	assert.equal(reopenPicks({ profileId: "wsl" }, settings).profileId, "wsl");
	assert.equal(reopenPicks({ profileId: "gone" }, settings).profileId, "win");
	assert.equal(reopenPicks({ profileId: "--wsl" }, settings).profileId, "win");
	assert.equal(reopenPicks({}, settings).profileId, "win");
});

const NO_SESSION = { session: null, resumeSessionId: null, storedSessionId: null, storedProfileKnown: true };

test("PRD-001.R3: a profile pick before any session applies to the conversation", () => {
	assert.equal(profilePick(NO_SESSION), "apply");
	assert.equal(profilePick({ ...NO_SESSION, storedSessionId: undefined }), "apply");
});

test("PRD-001.R3: a profile pick stops a CLI only a panel command started, then applies", () => {
	assert.equal(profilePick({ ...NO_SESSION, session: { sessionId: null, busy: false } }), "restart");
});

test("PRD-001.R3: a conversation with a Claude Code session, running or ended, keeps its profile", () => {
	const live = { sessionId: "s-1", busy: false };
	assert.equal(profilePick({ ...NO_SESSION, session: live }), "keep");
	assert.equal(profilePick({ ...NO_SESSION, session: { ...live, busy: true } }), "keep");
	// Ended: no process, the session id on the tab or the conversation.
	assert.equal(profilePick({ ...NO_SESSION, resumeSessionId: "s-1" }), "keep");
	assert.equal(profilePick({ ...NO_SESSION, storedSessionId: "s-1" }), "keep");
	// A first turn still waiting for its session id.
	assert.equal(profilePick({ ...NO_SESSION, session: { sessionId: null, busy: true } }), "keep");
	assert.equal(
		profilePick({ ...NO_SESSION, session: { sessionId: null, busy: false }, resumeSessionId: "s-1" }),
		"keep"
	);
});

test("PRD-001.R3: a stored session on a profile this device lacks takes the pick until a session is live", () => {
	const unknown = { ...NO_SESSION, storedProfileKnown: false };
	assert.equal(profilePick({ ...unknown, resumeSessionId: "s-1", storedSessionId: "s-1" }), "apply");
	assert.equal(profilePick({ ...unknown, storedSessionId: "s-1" }), "apply");
	assert.equal(
		profilePick({ ...unknown, session: { sessionId: null, busy: false }, resumeSessionId: "s-1" }),
		"restart"
	);
	// A live session keeps the profile it runs on.
	assert.equal(profilePick({ ...unknown, session: { sessionId: "s-2", busy: false } }), "keep");
	assert.equal(profilePick({ ...unknown, session: { sessionId: null, busy: true } }), "keep");
});

test("PRD-001.R3: the Notice for a kept profile names it and says how to use another", () => {
	assert.equal(
		keptProfileNotice({ name: "WSL" }),
		"This conversation stays on WSL; start a new conversation to use another."
	);
	assert.equal(
		keptProfileNotice({ name: "" }),
		"This conversation stays on Unnamed; start a new conversation to use another."
	);
});

test("PRD-001.R25: the settings decide the vault instructions, the vault tools and the bypass flag of a launch", () => {
	assert.deepEqual(settingsLaunchOptions(DEFAULT_SETTINGS), {
		appendSystemPrompt: undefined,
		sdkMcpServers: ["obsidian"],
		allowBypassPermissions: false,
	});
	assert.deepEqual(
		settingsLaunchOptions({
			vaultInstructions: "Use wiki-links.",
			enableObsidianMcp: false,
			enableBypassMode: true,
		}),
		{ appendSystemPrompt: "Use wiki-links.", sdkMcpServers: undefined, allowBypassPermissions: true }
	);
});

test("a profile with no name is Unnamed, or Unnamed profile where it stands alone", () => {
	assert.equal(profileLabel({ name: "WSL" }), "WSL");
	assert.equal(profileLabel({ name: "WSL" }, true), "WSL");
	assert.equal(profileLabel({ name: "" }), "Unnamed");
	assert.equal(profileLabel({ name: "" }, true), "Unnamed profile");
});

test("PRD-002.R8: the mode table holds each menu mode's icon, short, long and hover strings, the warning modes marked", () => {
	assert.deepEqual(Object.keys(MODE_TABLE), [...MENU_MODES]);
	assert.deepEqual(MODE_TABLE.default, {
		icon: "shield",
		short: "Ask",
		long: "Ask before acting",
		hover: "Claude Code asks before any call its rules do not allow",
		warn: false,
	});
	assert.deepEqual(MODE_TABLE.acceptEdits, {
		icon: "shield-check",
		short: "Edits",
		long: "Accept edits",
		hover: "file edits run without asking; other calls follow Claude Code's rules",
		warn: false,
	});
	assert.deepEqual(MODE_TABLE.plan, {
		icon: "clipboard-list",
		short: "Plan",
		long: "Plan (read-only)",
		hover: "Claude reads and plans, and edits nothing until you approve the plan",
		warn: false,
	});
	assert.deepEqual(MODE_TABLE.auto, {
		icon: "zap",
		short: "Auto",
		long: "⚠ Auto-approve everything",
		hover: "every call runs without a card, except calls Claude Code flags",
		warn: true,
	});
	assert.deepEqual(MODE_TABLE.bypassPermissions, {
		icon: "shield-off",
		short: "Bypass",
		long: "⚠ Bypass permissions",
		hover: "Claude Code's permission checks are off",
		warn: true,
	});
});

test("PRD-002.R8: the CLI's own modes and the inherited rows of the mode table", () => {
	assert.deepEqual(CLI_ONLY_MODES.dontAsk, {
		icon: "shield-x",
		short: "Don't ask",
		long: "Don't ask (deny what isn't allowed)",
		hover: "calls Claude Code's rules do not allow are denied",
		warn: false,
	});
	assert.deepEqual(CLI_ONLY_MODES.auto, {
		icon: "sparkles",
		short: "Auto mode",
		long: "Auto mode (Claude Code decides)",
		hover: "Claude Code decides which calls need a card",
		warn: false,
	});
	assert.deepEqual(inheritedModeEntry(null), {
		icon: "shield",
		short: "Default",
		long: "Claude Code default (set in its settings)",
		hover: "Claude Code's settings decide the mode",
		warn: false,
	});
	assert.deepEqual(inheritedModeEntry(MODE_TABLE.acceptEdits), {
		...MODE_TABLE.acceptEdits,
		long: "Accept edits · Claude Code's default when it last started",
	});
});

test("PRD-002.R11: a reported mode reads from the table, the CLI's own auto apart from the panel's", () => {
	assert.deepEqual(reportedModeEntry("plan"), { value: "plan", ...MODE_TABLE.plan });
	assert.deepEqual(reportedModeEntry("auto"), { value: null, ...CLI_ONLY_MODES.auto });
	assert.deepEqual(reportedModeEntry("bypassPermissions"), {
		value: "bypassPermissions",
		...MODE_TABLE.bypassPermissions,
	});
	assert.deepEqual(reportedModeEntry("newMode"), {
		value: null,
		icon: "shield",
		short: "newMode",
		long: "newMode",
		hover: "",
		warn: false,
	});
});

test("PRD-002.R8: the permission popover offers the four modes, and Bypass only while it is enabled", () => {
	assert.deepEqual(
		offeredModes(false).map((mode) => mode.value),
		["default", "acceptEdits", "plan", "auto"]
	);
	const all = offeredModes(true);
	assert.deepEqual(all.map((mode) => mode.value), ["default", "acceptEdits", "plan", "auto", "bypassPermissions"]);
	assert.deepEqual(all[4], { value: "bypassPermissions", ...MODE_TABLE.bypassPermissions });
	assert.deepEqual(all.filter((mode) => mode.warn).map((mode) => mode.long), ["⚠ Auto-approve everything", "⚠ Bypass permissions"]);
});

test("PRD-002.R8: a mode's accessible name is its long string without the warning sign", () => {
	assert.equal(modeName(MODE_TABLE.auto), "Auto-approve everything");
	assert.equal(modeName(MODE_TABLE.bypassPermissions), "Bypass permissions");
	assert.equal(modeName(MODE_TABLE.plan), "Plan (read-only)");
});

test("PRD-001.R34: the Theme cards are named Auto, Light and Dark, and only Auto says Obsidian's mode now", () => {
	assert.deepEqual(THEME_CHOICES.map((choice) => THEME_LABELS[choice]), ["Auto", "Light", "Dark"]);
	assert.equal(themeCardCaption("match", true), "now Dark");
	assert.equal(themeCardCaption("match", false), "now Light");
	assert.equal(themeCardCaption("light", true), undefined);
	assert.equal(themeCardCaption("dark", false), undefined);
});

test("PRD-001.R38: launchSignature changes with a launch setting or a profile's CLI, and not with anything else", () => {
	const base = () => ({ ...structuredClone(DEFAULT_SETTINGS), cliProfiles: [newProfile("a", "A", { cliPath: "/bin/claude" })] });
	const sig = launchSignature(base());
	assert.equal(launchSignature(base()), sig, "the same settings");
	const changed = (edit) => {
		const settings = base();
		edit(settings);
		return launchSignature(settings);
	};
	assert.notEqual(changed((s) => (s.vaultInstructions = "x")), sig);
	assert.notEqual(changed((s) => (s.enableBypassMode = !s.enableBypassMode)), sig);
	assert.notEqual(changed((s) => (s.enableObsidianMcp = !s.enableObsidianMcp)), sig);
	assert.notEqual(changed((s) => (s.cliProfiles[0].cliPath = "/other")), sig);
	assert.notEqual(changed((s) => (s.cliProfiles[0].useWsl = true)), sig);
	assert.notEqual(changed((s) => (s.cliProfiles[0].extraArgs = "--x")), sig);
	assert.equal(changed((s) => (s.showTooltips = !s.showTooltips)), sig, "a presentation setting");
	assert.equal(changed((s) => (s.cliProfiles[0].name = "Renamed")), sig, "a profile's name");
});

test("PRD-001.R7: the Conversation tabs cards are Top, Side and Automatic, in the stored order", () => {
	assert.deepEqual([...TAB_POSITIONS], ["top", "side", "auto"]);
	assert.deepEqual(TAB_POSITIONS.map((position) => TAB_POSITION_CARDS[position].name), ["Top", "Side", "Automatic"]);
	assert.deepEqual(TAB_POSITIONS.map((position) => TAB_POSITION_CARDS[position].caption), ["strip above", "column beside", "by panel width"]);
});

/**
 * Fake stores: every write is recorded, `failData` rejects the data.json
 * write, `throwOnLocal` throws on the nth device write (1-based).
 */
function fakeStores(local, data = {}, loaded = DEFAULT_LOCAL) {
	const stores = { local, data, writes: [], failData: false, throwOnLocal: 0, localWrites: 0 };
	stores.writers = {
		loadedLocalGroups: loaded,
		readLocal: () => stores.local,
		writeLocal: (value) => {
			stores.localWrites += 1;
			if (stores.localWrites === stores.throwOnLocal) throw new Error("quota");
			stores.writes.push("local");
			stores.local = structuredClone(value);
		},
		writeData: async (value) => {
			if (stores.failData) throw new Error("disk");
			stores.writes.push("data");
			stores.data = structuredClone(value);
		},
	};
	stores.reload = () => load(stores.data, stores.local);
	return stores;
}

/** A device on the default units with its own CLI profile and a non-default model, saved once. */
async function savedDevice() {
	const settings = load({}, null);
	settings.cliProfiles = [{ ...settings.cliProfiles[0], id: "own", cliPath: "/own/claude", extraArgs: "--x" }];
	settings.defaultProfileId = "own";
	settings.model = "opus";
	settings.lastModel = "opus";
	settings.localGroups = [...DEFAULT_LOCAL, "model"];
	const stores = fakeStores(undefined);
	await writeStores(settings, stores.writers);
	stores.writes = [];
	stores.localWrites = 0;
	return { settings, stores };
}

const without = (groups, ...keys) => groups.filter((key) => !keys.includes(key));

for (const [name, unit, keys] of [
	["the CLI profiles", "cli", ["cliProfiles", "defaultProfileId"]],
	["Model", "model", ["model", "lastModel"]],
]) {
	test(`PRD-001.R24: ${name} moved to synced keep their values when the data.json write fails`, async () => {
		const { settings, stores } = await savedDevice();
		const before = Object.fromEntries(keys.map((key) => [key, structuredClone(settings[key])]));
		settings.localGroups = without(settings.localGroups, unit);
		stores.failData = true;
		await assert.rejects(writeStores(settings, stores.writers));
		const loaded = stores.reload();
		for (const key of keys) assert.deepEqual(loaded[key], before[key], key);
		assert.ok(loaded.localGroups.includes(unit));
	});

	test(`PRD-001.R24: ${name} moved to synced are written device, data.json, device`, async () => {
		const { settings, stores } = await savedDevice();
		const before = Object.fromEntries(keys.map((key) => [key, structuredClone(settings[key])]));
		settings.localGroups = without(settings.localGroups, unit);
		await writeStores(settings, stores.writers);
		assert.deepEqual(stores.writes, ["local", "data", "local"]);
		assert.ok(!stores.local.localGroups.includes(unit));
		for (const key of keys) assert.ok(!(key in stores.local), key);
		const loaded = stores.reload();
		for (const key of keys) assert.deepEqual(loaded[key], before[key], key);
		assert.ok(!loaded.localGroups.includes(unit));
	});

	test(`PRD-001.R24: ${name} moved to synced keep their values when the last device write throws`, async () => {
		const { settings, stores } = await savedDevice();
		const before = Object.fromEntries(keys.map((key) => [key, structuredClone(settings[key])]));
		settings.localGroups = without(settings.localGroups, unit);
		stores.throwOnLocal = 2;
		await assert.rejects(writeStores(settings, stores.writers));
		assert.deepEqual(stores.writes, ["local", "data"]);
		const loaded = stores.reload();
		for (const key of keys) assert.deepEqual(loaded[key], before[key], key);
	});
}

test("PRD-001.R24: a unit moved to this device is in the device object before data.json drops it, even when data.json fails", async () => {
	const { settings, stores } = await savedDevice();
	settings.localGroups = without(settings.localGroups, "model");
	await writeStores(settings, stores.writers);
	stores.writes = [];
	settings.localGroups = [...settings.localGroups, "model"];
	settings.model = "sonnet";
	stores.failData = true;
	await assert.rejects(writeStores(settings, stores.writers));
	assert.deepEqual(stores.writes, ["local"]);
	assert.equal(stores.reload().model, "sonnet");
});

test("PRD-001.R24: a save that moves one unit to synced and another to this device keeps both when data.json fails", async () => {
	const { settings, stores } = await savedDevice();
	settings.theme = "dark";
	settings.localGroups = [...without(settings.localGroups, "cli"), "theme"];
	stores.failData = true;
	await assert.rejects(writeStores(settings, stores.writers));
	const loaded = stores.reload();
	assert.equal(loaded.cliProfiles[0].cliPath, "/own/claude");
	assert.equal(loaded.defaultProfileId, "own");
	assert.equal(loaded.theme, "dark");
	stores.failData = false;
	stores.writes = [];
	await writeStores(settings, stores.writers);
	assert.deepEqual(stores.writes, ["local", "data", "local"]);
	const done = stores.reload();
	assert.equal(done.cliProfiles[0].cliPath, "/own/claude");
	assert.equal(done.theme, "dark");
	assert.ok(!done.localGroups.includes("cli") && done.localGroups.includes("theme"));
});

test("PRD-001.R24: a save that moves nothing to synced writes the device object once, then data.json", async () => {
	const { settings, stores } = await savedDevice();
	settings.model = "sonnet";
	await writeStores(settings, stores.writers);
	assert.deepEqual(stores.writes, ["local", "data"]);
});

test("PRD-001.R24: a first device write that throws reaches neither store", async () => {
	const { settings, stores } = await savedDevice();
	const data = structuredClone(stores.data);
	const local = structuredClone(stores.local);
	settings.localGroups = without(settings.localGroups, "cli");
	stores.throwOnLocal = 1;
	await assert.rejects(writeStores(settings, stores.writers));
	assert.deepEqual(stores.writes, []);
	assert.deepEqual(stores.data, data);
	assert.deepEqual(stores.local, local);
});

test("PRD-001.R24: a device object without a list of its own means the routing the load derived", async () => {
	const settings = load({}, null);
	settings.localGroups = without(DEFAULT_LOCAL, "cli");
	for (const stored of [undefined, {}, { localGroups: "cli" }, { localGroups: null }]) {
		const moving = fakeStores(stored, {}, DEFAULT_LOCAL);
		await writeStores(settings, moving.writers);
		assert.deepEqual(moving.writes, ["local", "data", "local"], JSON.stringify(stored));
		const staying = fakeStores(stored, {}, settings.localGroups);
		await writeStores(settings, staying.writers);
		assert.deepEqual(staying.writes, ["local", "data"], JSON.stringify(stored));
	}
});

for (const [name, stored] of [
	["a null list", { localGroups: null, model: "opus" }],
	["no list", { model: "opus" }],
]) {
	test(`PRD-001.R24: Model that data.json's legacy list made device-only survives a failed move to synced (${name})`, async () => {
		const data = { localGroups: ["model"] };
		const loaded = load(data, stored);
		assert.equal(loaded.model, "opus");
		assert.ok(loaded.localGroups.includes("model"));
		const stores = fakeStores(stored, data, [...loaded.localGroups]);
		loaded.localGroups = without(loaded.localGroups, "model");
		stores.failData = true;
		await assert.rejects(writeStores(loaded, stores.writers));
		assert.equal(stores.reload().model, "opus");
	});
}

test("PRD-001.R24: a stored list with pre-release group keys is read as load reads it", async () => {
	const legacy = { localGroups: ["cli", "permissions", "bash", "obsidianMcp", "instructions"] };
	const stores = fakeStores(legacy);
	await writeStores(load({}, legacy), stores.writers);
	assert.deepEqual(stores.writes, ["local", "data"]);
});
