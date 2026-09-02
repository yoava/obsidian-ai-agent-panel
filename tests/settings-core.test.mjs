import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_SETTINGS,
	SYNC_UNITS,
	defaultProfile,
	mergeLocalSettings,
	migrateRawSettings,
	normalizeSettings,
	profileById,
	sanitizeLocalGroups,
	splitSettings,
} from "./.build/settings-core.mjs";

// Mirrors AgentPanelPlugin.loadSettings, minus the Obsidian storage APIs.
const load = (raw, local = null) => {
	const merged = Object.assign({}, DEFAULT_SETTINGS, migrateRawSettings(raw));
	merged.localGroups = sanitizeLocalGroups(raw.localGroups);
	mergeLocalSettings(merged, local);
	return normalizeSettings(merged);
};

test("legacy cliPath/useWsl migrate into a single profile", () => {
	const settings = load({ cliPath: "/usr/local/bin/claude", useWsl: true });
	assert.equal(settings.cliProfiles.length, 1);
	assert.deepEqual(settings.cliProfiles[0], {
		id: "default",
		name: "Default",
		cliPath: "/usr/local/bin/claude",
		useWsl: true,
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
		{ id: "a", name: "WSL", cliPath: "claude", useWsl: true },
		{ id: "b", name: "Windows", cliPath: "C:\\claude.exe", useWsl: false },
	];
	const settings = load({
		cliProfiles: profiles,
		defaultProfileId: "b",
		// Stale flat fields from a partially-synced data.json must not resurrect.
		cliPath: "/stale",
		useWsl: true,
	});
	assert.deepEqual(settings.cliProfiles, profiles);
	assert.equal(settings.defaultProfileId, "b");
});

test("normalize repairs malformed profiles and a dangling default id", () => {
	const settings = load({
		cliProfiles: [null, { name: "no id" }, { id: "ok", name: 7, useWsl: "yes" }],
		defaultProfileId: "gone",
	});
	assert.deepEqual(settings.cliProfiles, [
		{ id: "ok", name: "", cliPath: "", useWsl: false },
	]);
	assert.equal(settings.defaultProfileId, "ok");
});

test("normalize never aliases DEFAULT_SETTINGS' profile array", () => {
	const a = load({});
	const b = load({});
	a.cliProfiles[0].cliPath = "/mutated";
	assert.equal(b.cliProfiles[0].cliPath, "");
	assert.equal(DEFAULT_SETTINGS.cliProfiles.length, 0);
});

test("profile lookups fall back sensibly", () => {
	const settings = load({
		cliProfiles: [
			{ id: "a", name: "One", cliPath: "", useWsl: false },
			{ id: "b", name: "Two", cliPath: "", useWsl: false },
		],
		defaultProfileId: "b",
	});
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

test("CLI profiles are device-local by default; the rest syncs", () => {
	const settings = load({});
	const { synced, local } = splitSettings(settings);
	assert.ok(!("cliProfiles" in synced));
	assert.ok(!("defaultProfileId" in synced));
	assert.ok("cliProfiles" in local);
	assert.ok("model" in synced);
	assert.deepEqual(synced.localGroups, ["cli"]);
});

test("device-local values override synced ones, absent ones seed from synced", () => {
	const settings = load(
		{ cliProfiles: [{ id: "a", name: "Synced", cliPath: "/synced", useWsl: false }] },
		{ cliProfiles: [{ id: "b", name: "Mine", cliPath: "/mine", useWsl: true }] }
	);
	assert.equal(settings.cliProfiles[0].cliPath, "/mine");
	// No local copy of this key yet - the synced value seeds it.
	const seeded = load({
		cliProfiles: [{ id: "a", name: "Synced", cliPath: "/synced", useWsl: false }],
	});
	assert.equal(seeded.cliProfiles[0].cliPath, "/synced");
});

test("a group moved back to synced ignores its stale local copy", () => {
	const settings = load(
		{ localGroups: [], model: "opus" },
		{ model: "haiku", cliProfiles: [{ id: "x", name: "", cliPath: "/x", useWsl: false }] }
	);
	assert.equal(settings.model, "opus");
	assert.equal(settings.cliProfiles[0].cliPath, "");
	const { synced } = splitSettings(settings);
	assert.equal(synced.model, "opus");
	assert.ok("cliProfiles" in synced);
});

test("marking a group local moves its values out of data.json", () => {
	const settings = load({ vaultInstructions: "use wiki-links" });
	settings.localGroups = [...settings.localGroups, "instructions"];
	const { synced, local } = splitSettings(settings);
	assert.ok(!("vaultInstructions" in synced));
	assert.equal(local.vaultInstructions, "use wiki-links");
	assert.deepEqual(synced.localGroups, ["cli", "instructions"]);
});

test("learned model resolutions never sync", () => {
	const settings = load({ resolvedModels: { opus: "claude-opus-5" } });
	const { synced, local } = splitSettings(settings);
	assert.ok(!("resolvedModels" in synced));
	assert.deepEqual(local.resolvedModels, { opus: "claude-opus-5" });
});

test("sanitizeLocalGroups keeps an explicit empty choice and drops junk", () => {
	assert.deepEqual(sanitizeLocalGroups(undefined), ["cli"]);
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
