import { test } from "node:test";
import assert from "node:assert/strict";
import {
	applyPatches,
	confirmLabel,
	failureNotice,
	planReset,
	planSummary,
	planTitle,
	resetCounts,
	resetNotice,
	samePlan,
	shownText,
	startUndo,
	undoneNotice,
	undoReset,
} from "./.build/state/settings-reset.mjs";
import { DEFAULT_SETTINGS, SYNC_UNITS, newProfile } from "./.build/settings-core.mjs";

const SECTIONS = [
	{ key: "general", label: "General" },
	{ key: "permissions", label: "Permissions" },
	{ key: "appearance", label: "Appearance" },
	{ key: "usage", label: "Usage" },
	{ key: "export", label: "Export" },
	{ key: "cli", label: "Claude Code" },
];
const ROWS = [
	["general", "model", "Model"],
	["general", "effort", "Default reasoning effort"],
	["general", "note-context", "Include note context by default"],
	["general", "vault-instructions", "Vault instructions"],
	["permissions", "permission-mode", "Default permission mode"],
	["permissions", "bypass", "Bypass-permissions mode"],
	["permissions", "vault-tools", "Vault tools for Claude"],
	["permissions", "shell-escape", "The composer’s “!” shell escape"],
	["appearance", "theme", "Theme"],
	["appearance", "conversation-tabs", "Conversation tabs"],
	["appearance", "tooltips", "Show tooltips"],
	["appearance", "prompt-style", "Prompt style"],
	["appearance", "prompt-color", "Prompt color"],
	["appearance", "pin-prompt", "Pin the current prompt while scrolling"],
	["appearance", "prompt-rail", "Prompt jump rail"],
	["usage", "show-usage", "Show plan usage"],
	["usage", "usage-refresh", "Refresh interval"],
	["usage", "usage-warn", "Warning threshold"],
	["usage", "usage-crit", "Critical threshold"],
	["export", "export", "Export transcripts to Markdown"],
	["export", "export-folder", "Folder"],
	["export", "export-pattern", "Note name pattern"],
	["export", "export-date", "Date format"],
	["cli", "p1:path", "Claude CLI path"],
	["cli", "p1:args", "Additional arguments"],
	["cli", "p1:chrome", "Claude in Chrome"],
	["cli", "p1:sandbox", "Sandbox"],
	["cli", "p1:name", "Profile name"],
	["cli", "p1:wsl", "Run via WSL"],
].map(([section, id, name]) => ({ id, section, name }));

const DEFAULT_LOCAL = SYNC_UNITS.filter((unit) => unit.defaultLocal).map((unit) => unit.key);

/** The defaults, the default-local units and one profile "p1", with `over` on top. */
const settings = (over = {}, profile = {}) => ({
	...DEFAULT_SETTINGS,
	localGroups: [...DEFAULT_LOCAL],
	cliProfiles: [newProfile("p1", "Windows", profile)],
	defaultProfileId: "p1",
	...over,
});

const plan = (s, scope, options) => planReset({ rows: ROWS, sections: SECTIONS, settings: s, scope, options });
const row = (id) => ({ kind: "row", id });
const section = (key) => ({ kind: "section", section: key });
const ALL = { kind: "all" };

/** Modified in General, Permissions, Appearance and Usage, plus a Claude Code path and a moved sync badge. */
const busy = () =>
	settings(
		{
			model: "opus",
			lastModel: "sonnet",
			effort: "high",
			lastEffort: "low",
			vaultInstructions: "Notes live in areas/\nUse wikilinks",
			defaultPermissionMode: "acceptEdits",
			enableBashMode: false,
			theme: "dark",
			promptColor: "custom",
			promptCustomColor: "#4d91b3",
			usageWarnPercent: 50,
			exportEnabled: true,
			exportFolder: "Chats",
			localGroups: [...DEFAULT_LOCAL.filter((key) => key !== "bash"), "theme"],
		},
		{ cliPath: "/usr/bin/claude", sandbox: "on", extraArgs: "--add-dir ~/x", chrome: "off", name: "Mine", useWsl: true }
	);

const names = (p) => p.changes.map((change) => change.name);

test("PRD-001.R39: a row's plan holds its change as old and new, and the unit's store", () => {
	const p = plan(busy(), row("theme"));
	assert.deepEqual(p.changes.map(({ id, section, name, old, new: now, store, turnsOn }) => ({ id, section, name, old, now, store, turnsOn })), [
		{ id: "theme", section: "appearance", name: "Theme", old: "Dark", now: "Auto", store: "device", turnsOn: false },
	]);
	assert.equal(plan(busy(), row("tooltips")).changes.length, 0, "an unmodified row has nothing to reset");
	assert.equal(plan(busy(), row("p1:name")).changes.length, 0, "a profile's name is never reset");
	assert.equal(plan(busy(), row("p1:wsl")).changes.length, 0, "Run via WSL is never reset");
	assert.equal(plan(busy(), row("nope")).changes.length, 0);
});

test("PRD-001.R39: a section's plan is every modified row in it, in page order, and no other section's", () => {
	assert.deepEqual(names(plan(busy(), section("general"))), ["Model", "Default reasoning effort", "Vault instructions"]);
	assert.deepEqual(names(plan(busy(), section("permissions"))), ["Default permission mode", "The composer’s “!” shell escape"]);
	assert.deepEqual(names(plan(busy(), section("appearance"))), ["Theme", "Prompt color"]);
	assert.deepEqual(names(plan(busy(), section("usage"))), ["Warning threshold"]);
	assert.deepEqual(names(plan(busy(), section("export"))), ["Export transcripts to Markdown", "Folder"]);
	assert.deepEqual(names(plan(busy(), section("cli"))), ["Claude CLI path", "Additional arguments", "Claude in Chrome", "Sandbox"]);
	assert.equal(plan(settings(), section("general")).changes.length, 0);
});

test("PRD-001.R39: everything leaves Claude Code and the sync choices alone unless the options say so", () => {
	const s = busy();
	const without = plan(s, ALL);
	assert.ok(!without.changes.some((change) => change.section === "cli"));
	assert.equal(without.changes.length, 10);
	assert.ok(!without.patches.some((patch) => patch.kind === "profile" || patch.kind === "groups"));
	assert.deepEqual(
		without.claudeCode.map((change) => change.name),
		["Claude CLI path", "Additional arguments", "Claude in Chrome", "Sandbox"],
		"the option's changes are known without it"
	);
	assert.equal(without.syncsDiffer, true);

	const cli = plan(s, ALL, { claudeCode: true });
	assert.equal(cli.changes.length, 14);
	assert.equal(cli.patches.filter((patch) => patch.kind === "profile").length, 4);
	assert.ok(!cli.patches.some((patch) => patch.kind === "groups"));

	const syncs = plan(s, ALL, { syncs: true });
	assert.equal(syncs.changes.length, 10);
	assert.deepEqual(syncs.patches.filter((patch) => patch.kind === "groups"), [{ kind: "groups", value: DEFAULT_LOCAL }]);

	const both = plan(s, ALL, { claudeCode: true, syncs: true });
	assert.equal(both.changes.length, 14);
	assert.equal(both.patches.length, cli.patches.length + 1);
});

test("PRD-001.R39: a section's plan ignores the two options; Reset N counts every modified row in it", () => {
	const s = busy();
	assert.deepEqual(plan(s, section("cli"), { claudeCode: false }).changes.length, 4);
	assert.deepEqual(plan(s, section("general"), { syncs: true }).patches.filter((patch) => patch.kind === "groups"), []);
});

test("PRD-001.R39: the store of a change is where its unit lives after the plan (the sync option moves units)", () => {
	const s = busy();
	const stores = (p) => Object.fromEntries(p.changes.map((change) => [change.id, change.store]));
	const plain = stores(plan(s, ALL));
	assert.equal(plain.model, "synced");
	assert.equal(plain["permission-mode"], "device");
	assert.equal(plain["shell-escape"], "synced", "its badge was flipped to synced");
	assert.equal(plain.theme, "device", "its badge was flipped to this device");
	assert.equal(plain["export-folder"], "synced", "a sub-row is stored with its row's unit");
	assert.equal(plain["vault-instructions"], "device");
	const reset = stores(plan(s, ALL, { syncs: true }));
	assert.equal(reset["shell-escape"], "device");
	assert.equal(reset.theme, "synced");
	assert.ok(plan(s, section("cli")).changes.every((change) => change.store === "device"));
});

test("PRD-001.R39: a change that switches a capability on is marked, and only that", () => {
	const s = settings({ includeContextByDefault: false, enableObsidianMcp: false, enableBashMode: false, enableBypassMode: true, tooltips: false, showTooltips: false });
	const marks = Object.fromEntries(plan(s, ALL).changes.map((change) => [change.id, change.turnsOn]));
	assert.deepEqual(marks, { "note-context": true, "vault-tools": true, "shell-escape": true, bypass: false, tooltips: false });
	const off = settings({ enableBashMode: true, includeContextByDefault: false });
	assert.deepEqual(plan(off, ALL).changes.map((change) => [change.id, change.turnsOn]), [["note-context", true]]);
});

test("PRD-001.R39: a deleted text shows by its first line, cut at 60 characters with an ellipsis", () => {
	assert.equal(shownText("Use wikilinks"), "Use wikilinks");
	assert.equal(shownText("Notes live in areas/\nUse wikilinks"), "Notes live in areas/…");
	const long = "x".repeat(61);
	assert.equal(shownText(long), `${"x".repeat(60)}…`);
	assert.equal(shownText("x".repeat(60)), "x".repeat(60));
	assert.equal(shownText("\n\nsecond"), "second", "blank leading lines are skipped");
	assert.equal(shownText("😀".repeat(61)), `${"😀".repeat(60)}…`, "counted in characters, never splitting one");
	const p = plan(busy(), row("vault-instructions"));
	assert.equal(p.changes[0].old, "Notes live in areas/…");
	assert.equal(p.changes[0].new, "None");
});

test("PRD-001.R39: old and new are the values as the page shows them", () => {
	const shown = Object.fromEntries(plan(busy(), ALL, { claudeCode: true }).changes.map((change) => [change.id, [change.old, change.new]]));
	assert.deepEqual(shown.model, ["opus", "Claude Code default"]);
	assert.deepEqual(shown.effort, ["High", "CLI default"]);
	assert.deepEqual(shown["permission-mode"], ["Accept edits", "Claude Code default"]);
	assert.deepEqual(shown["shell-escape"], ["Off", "On"]);
	assert.deepEqual(shown["prompt-color"], ["Custom", "Sand"]);
	assert.deepEqual(shown["usage-warn"], ["50%", "70%"]);
	assert.deepEqual(shown.export, ["On", "Off"]);
	assert.deepEqual(shown["export-folder"], ["Chats", "Agent Chats"]);
	assert.deepEqual(shown["p1:path"], ["/usr/bin/claude", "Auto-detect"]);
	assert.deepEqual(shown["p1:chrome"], ["Off", "Claude Code default"]);
	assert.deepEqual(shown["p1:sandbox"], ["On", "Claude Code default"]);
	assert.deepEqual(shown["p1:args"], ["--add-dir ~/x", "None"]);
});

test("PRD-001.R39: a profile's rows carry the profile's name once there are several", () => {
	const s = settings({ cliProfiles: [newProfile("p1", "Windows", { cliPath: "a" }), newProfile("p2", "WSL", { cliPath: "b" })] });
	const rows = [...ROWS, { id: "p2:path", section: "cli", name: "WSL: Claude CLI path" }];
	const p = planReset({ rows, sections: SECTIONS, settings: s, scope: section("cli") });
	assert.deepEqual(names(p), ["Claude CLI path", "WSL: Claude CLI path"]);
	assert.deepEqual(p.patches, [
		{ kind: "profile", id: "p1", field: "cliPath", value: "" },
		{ kind: "profile", id: "p2", field: "cliPath", value: "" },
	]);
});

test("PRD-001.R39, R24: Model, effort and Prompt color reset their paired key too; the others write one key", () => {
	const s = busy();
	assert.deepEqual(plan(s, row("model")).patches, [{ kind: "keys", set: { model: "", lastModel: undefined } }]);
	assert.deepEqual(plan(s, row("effort")).patches, [{ kind: "keys", set: { effort: "", lastEffort: undefined } }]);
	assert.deepEqual(plan(s, row("prompt-color")).patches, [{ kind: "keys", set: { promptColor: "sand", promptCustomColor: "" } }]);
	assert.deepEqual(plan(s, row("theme")).patches, [{ kind: "keys", set: { theme: "match" } }]);
	assert.deepEqual(plan(s, row("usage-warn")).patches, [{ kind: "keys", set: { usageWarnPercent: 70 } }]);
	assert.deepEqual(plan(s, row("shell-escape")).patches, [{ kind: "keys", set: { enableBashMode: true } }]);
	assert.deepEqual(plan(s, row("p1:sandbox")).patches, [{ kind: "profile", id: "p1", field: "sandbox", value: "" }]);
	assert.deepEqual(plan(s, row("p1:chrome")).patches, [{ kind: "profile", id: "p1", field: "chrome", value: "" }]);
	assert.deepEqual(plan(s, row("p1:args")).patches, [{ kind: "profile", id: "p1", field: "extraArgs", value: "" }]);
});

test("PRD-001.R39: applying a plan writes the defaults, deletes the paired keys, and leaves identity and the rest alone", () => {
	const s = busy();
	const before = JSON.stringify(s.cliProfiles[0]);
	applyPatches(s, plan(s, ALL, { claudeCode: true, syncs: true }).patches);
	assert.equal(s.model, "");
	assert.ok(!("lastModel" in s), "lastModel is removed, not set to undefined");
	assert.equal(s.effort, "");
	assert.ok(!("lastEffort" in s));
	assert.equal(s.promptColor, "sand");
	assert.equal(s.promptCustomColor, "");
	assert.equal(s.vaultInstructions, "");
	assert.equal(s.defaultPermissionMode, "default");
	assert.equal(s.enableBashMode, true);
	assert.equal(s.usageWarnPercent, 70);
	assert.equal(s.exportEnabled, false);
	assert.equal(s.exportFolder, "Agent Chats");
	assert.deepEqual(s.localGroups, DEFAULT_LOCAL);
	const profile = s.cliProfiles[0];
	assert.deepEqual([profile.cliPath, profile.sandbox, profile.extraArgs, profile.chrome], ["", "", "", ""]);
	assert.deepEqual([profile.id, profile.name, profile.useWsl], ["p1", "Mine", true]);
	assert.equal(s.cliProfiles.length, 1);
	assert.equal(s.defaultProfileId, "p1");
	assert.notEqual(JSON.stringify(profile), before);
	for (const p of [plan(s, ALL, { claudeCode: true, syncs: true }), plan(s, section("general"))]) assert.deepEqual(p.changes, [], "nothing left to reset");
	assert.equal(plan(s, ALL, { syncs: true }).syncsDiffer, false);
});

test("PRD-001.R39: a patch for a profile no longer there changes nothing and adds none", () => {
	const s = settings();
	applyPatches(s, [{ kind: "profile", id: "gone", field: "cliPath", value: "" }]);
	assert.equal(s.cliProfiles.length, 1);
});

test("PRD-001.R39: the dialog's words: title, count, where it is stored, button", () => {
	const s = busy();
	const permissions = plan(s, section("permissions"));
	assert.equal(planTitle(permissions), "Reset Permissions to default?");
	assert.equal(confirmLabel(permissions), "Reset 2 settings");
	assert.equal(planSummary(permissions), "2 settings change. Synced ones (cloud) change on every device that syncs this vault.");
	const device = plan(settings({ defaultPermissionMode: "plan", enableBypassMode: true, enableBashMode: false }), section("permissions"));
	assert.equal(planSummary(device), "3 settings change. All are stored on this device only.");
	const two = plan(settings({ defaultPermissionMode: "plan", enableBypassMode: true }), section("permissions"));
	assert.equal(planSummary(two), "2 settings change. Both are stored on this device only.");
	const one = plan(settings({ defaultPermissionMode: "plan" }), section("permissions"));
	assert.equal(planSummary(one), "1 setting changes. It is stored on this device only.");
	assert.equal(confirmLabel(one), "Reset 1 setting");
	const all = plan(s, ALL);
	assert.equal(planTitle(all), "Reset all settings to default?");
	assert.equal(planSummary(all), "10 settings in 5 sections change. Synced ones (cloud) change on every device that syncs this vault.");
	assert.equal(confirmLabel(all), "Reset 10 settings");
	assert.equal(planSummary(plan(settings({ defaultPermissionMode: "plan" }), ALL)), "1 setting in 1 section changes. It is stored on this device only.");
	assert.equal(confirmLabel(plan(settings(), ALL, { syncs: true })), "Reset 0 settings");
	assert.equal(confirmLabel(plan(busy(), ALL, { syncs: true })), "Reset 10 settings");
});

test("PRD-001.R39: the notice names what was reset", () => {
	assert.equal(resetNotice(plan(busy(), row("theme"))), "Theme reset to default.");
	assert.equal(resetNotice(plan(busy(), section("permissions"))), "Permissions reset to default.");
	assert.equal(resetNotice(plan(busy(), ALL)), "All settings reset to default.");
	assert.equal(failureNotice("disk full"), "Could not save the settings: disk full");
});

test("PRD-001.R39: a plan built again from the same settings is the same; any change in what it would do is not", () => {
	const s = busy();
	assert.ok(samePlan(plan(s, ALL), plan(s, ALL)));
	assert.ok(samePlan(plan(s, ALL, { syncs: true }), plan(busy(), ALL, { syncs: true })));
	const moved = busy();
	moved.theme = "light";
	assert.ok(!samePlan(plan(s, ALL), plan(moved, ALL)), "a value changed from another window");
	const gone = busy();
	gone.usageWarnPercent = 70;
	assert.ok(!samePlan(plan(s, ALL), plan(gone, ALL)), "a row no longer modified");
	const hidden = busy();
	hidden.lastModel = "haiku";
	assert.ok(!samePlan(plan(s, ALL), plan(hidden, ALL)), "a paired key that Undo would restore");
	assert.ok(!samePlan(plan(s, ALL), plan(s, ALL, { claudeCode: true })), "the options");
});

test("PRD-001.R39: Undo restores every value still holding the reset value, paired keys and sync choices included", () => {
	const s = busy();
	const original = structuredClone(s);
	const p = plan(s, ALL, { claudeCode: true, syncs: true });
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	assert.notDeepEqual(s, original);
	const result = undoReset(s, undo);
	assert.deepEqual(result.skipped, []);
	assert.deepEqual(s, original);
	assert.equal(s.lastModel, "sonnet");
	assert.ok(s.localGroups.includes("theme") && !s.localGroups.includes("bash"));
});

test("PRD-001.R39: Undo of a row that had no paired key leaves none behind", () => {
	const s = settings({ model: "opus" });
	const p = plan(s, row("model"));
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	undoReset(s, undo);
	assert.equal(s.model, "opus");
	assert.ok(!("lastModel" in s));
});

test("PRD-001.R39: Undo leaves a value changed since, names it, and restores the rest", () => {
	const s = busy();
	const p = plan(s, section("general"));
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	s.effort = "max";
	s.vaultInstructions = "New";
	const result = undoReset(s, undo);
	assert.deepEqual(result.skipped, ["Default reasoning effort", "Vault instructions"]);
	assert.equal(s.model, "opus");
	assert.equal(s.lastModel, "sonnet");
	assert.equal(s.effort, "max");
	assert.ok(!("lastEffort" in s), "the skipped row keeps the reset's paired key too");
	assert.equal(s.vaultInstructions, "New");
});

test("PRD-001.R39: a paired key restores only with its row: a value changed since keeps the other key as it is", () => {
	const s = busy();
	const p = plan(s, row("model"));
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	s.model = "haiku";
	const result = undoReset(s, undo);
	assert.deepEqual(result.skipped, ["Model"]);
	assert.equal(s.model, "haiku");
	assert.ok(!("lastModel" in s), "the old pick does not come back over the new default");
});

test("PRD-001.R39: a value changed and changed back counts as unchanged", () => {
	const s = busy();
	const p = plan(s, section("usage"));
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	s.usageWarnPercent = 80;
	s.usageWarnPercent = 70;
	const result = undoReset(s, undo);
	assert.deepEqual(result.skipped, []);
	assert.equal(s.usageWarnPercent, 50);
});

test("PRD-001.R39: Undo of the sync choices compares the lists as sets, and skips them when they changed since", () => {
	const s = busy();
	const p = plan(s, ALL, { syncs: true });
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	s.localGroups = [...s.localGroups].reverse();
	assert.deepEqual(undoReset(s, undo).skipped, []);
	assert.ok(s.localGroups.includes("theme"));

	const t = busy();
	const q = plan(t, ALL, { syncs: true });
	const undoT = startUndo(q);
	applyPatches(t, q.patches);
	t.localGroups = [...t.localGroups, "model"];
	assert.deepEqual(undoReset(t, undoT).skipped, ["Sync choices"]);
	assert.ok(t.localGroups.includes("model") && !t.localGroups.includes("theme"));
});

test("PRD-001.R39: Undo skips a profile removed since, and adds none", () => {
	const s = busy();
	const p = plan(s, section("cli"));
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	s.cliProfiles = [newProfile("p9", "Other")];
	const result = undoReset(s, undo);
	assert.equal(result.skipped.length, 4);
	assert.deepEqual(s.cliProfiles.map((profile) => profile.id), ["p9"]);
	assert.equal(s.cliProfiles[0].cliPath, "");
});

test("PRD-001.R39: a failed Undo save keeps the restore in memory, and asking again does not restore a second time", () => {
	const s = busy();
	const p = plan(s, section("general"));
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	s.effort = "max";
	const first = undoReset(s, undo);
	assert.equal(undo.phase, "restored");
	assert.deepEqual(first.skipped, ["Default reasoning effort"]);
	// The restore is in memory, its save failed; another edit lands before the user asks again.
	s.model = "haiku";
	const again = undoReset(s, undo);
	assert.deepEqual(again.skipped, ["Default reasoning effort"], "the same answer");
	assert.equal(s.model, "haiku", "the inverse is not applied a second time");
});

test("PRD-001.R39: a reset whose save failed offers Undo, which restores memory", () => {
	const s = busy();
	const original = structuredClone(s);
	const p = plan(s, ALL);
	const undo = startUndo(p);
	applyPatches(s, p.patches);
	assert.equal(undo.phase, "reset", "the reset's own save failing leaves the record offering Undo");
	undoReset(s, undo);
	assert.deepEqual(s, original);
});

test("PRD-001.R39: the Undo notice names what it left", () => {
	assert.equal(undoneNotice([]), "Undone.");
	assert.equal(undoneNotice(["Theme"]), "Undone, except Theme, changed since.");
	assert.equal(undoneNotice(["Theme", "Model"]), "Undone, except Theme and Model, changed since.");
	assert.equal(undoneNotice(["Theme", "Model", "Effort"]), "Undone, except Theme, Model and Effort, changed since.");
});

test("PRD-001.R39: Reset N counts every modified row of a section, Claude Code's too, and no profile identity", () => {
	// Export off hides the folder row; its value still counts. The name and Run via WSL are never reset.
	const s = settings({ effort: "high", exportEnabled: false, exportFolder: "Elsewhere", usageWarnPercent: 80 }, { cliPath: "/opt/claude", useWsl: true });
	assert.deepEqual(resetCounts({ rows: ROWS, sections: SECTIONS, settings: s }), { general: 1, usage: 1, export: 1, cli: 1 });
	assert.equal(plan(s, { kind: "section", section: "export" }).changes.map((change) => change.id).join(), "export-folder");
	assert.deepEqual(resetCounts({ rows: ROWS, sections: SECTIONS, settings: settings() }), {});
});
