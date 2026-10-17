import { test } from "node:test";
import assert from "node:assert/strict";
import { rowFacts, supportLinks } from "./.build/state/settings-rows.mjs";
import { DEFAULT_SETTINGS, newProfile } from "./.build/settings-core.mjs";

/** The defaults, with `over` on top and one profile (id "p1") unless `profile` says otherwise. */
const settings = (over = {}, profile = {}) => ({
	...DEFAULT_SETTINGS,
	cliProfiles: [newProfile("p1", "Windows", profile)],
	...over,
});

const facts = (id, over, profile) => rowFacts(id, settings(over, profile));

test("PRD-001.R39: no setting is modified at its defaults, and each row shows its default as the table says", () => {
	const defaults = {
		model: "Claude Code default",
		effort: "CLI default",
		"vault-instructions": "None",
		"permission-mode": "Claude Code default",
		"note-context": "On",
		bypass: "Off",
		"vault-tools": "On",
		"shell-escape": "On",
		theme: "Auto",
		"conversation-tabs": "Automatic",
		tooltips: "On",
		"prompt-style": "Card",
		"prompt-color": "Sand",
		"pin-prompt": "On",
		"prompt-rail": "On",
		"show-usage": "On",
		"usage-refresh": "5m",
		"usage-warn": "70%",
		"usage-crit": "90%",
		export: "Off",
		"export-folder": "Agent Chats",
		"export-pattern": "{date} {title}",
		"export-date": "YYYY-MM-DD",
		"p1:path": "Auto-detect",
		"p1:args": "None",
		"p1:chrome": "Claude Code default",
		"p1:sandbox": "Claude Code default",
	};
	for (const [id, shown] of Object.entries(defaults)) {
		const row = facts(id);
		assert.equal(row.modified, false, `${id} at its default`);
		assert.equal(row.defaultText, shown, `${id} default as shown`);
	}
});

test("PRD-001.R39: a text, choice or number that differs from its default is modified", () => {
	const changed = [
		["model", { model: "opus" }],
		["effort", { effort: "high" }],
		["vault-instructions", { vaultInstructions: "Use wikilinks" }],
		["permission-mode", { defaultPermissionMode: "plan" }],
		["theme", { theme: "dark" }],
		["conversation-tabs", { tabPosition: "top" }],
		["prompt-style", { promptStyle: "bubble" }],
		["prompt-color", { promptColor: "sage" }],
		["usage-refresh", { usageRefreshSeconds: 60 }],
		["usage-warn", { usageWarnPercent: 50 }],
		["usage-crit", { usageCritPercent: 95 }],
		["export-folder", { exportFolder: "Chats" }],
		["export-pattern", { exportFilePattern: "{title}" }],
		["export-date", { exportDateFormat: "YYYY" }],
	];
	for (const [id, over] of changed) assert.equal(facts(id, over).modified, true, id);
});

test("PRD-001.R39: a toggle is modified when it differs from DEFAULT_SETTINGS, either way", () => {
	const flips = [
		["note-context", "includeContextByDefault"],
		["bypass", "enableBypassMode"],
		["vault-tools", "enableObsidianMcp"],
		["shell-escape", "enableBashMode"],
		["tooltips", "showTooltips"],
		["pin-prompt", "pinPrompt"],
		["prompt-rail", "promptRail"],
		["show-usage", "showUsage"],
		["export", "exportEnabled"],
	];
	for (const [id, key] of flips) {
		assert.equal(facts(id, { [key]: !DEFAULT_SETTINGS[key] }).modified, true, id);
		assert.equal(facts(id, { [key]: DEFAULT_SETTINGS[key] }).modified, false, `${id} at default`);
	}
});

test("PRD-001.R39: Prompt color counts alone, Custom included; Custom color itself is never modified", () => {
	assert.equal(facts("prompt-color", { promptColor: "custom", promptCustomColor: "" }).modified, true);
	assert.equal(facts("prompt-color", { promptColor: "sand", promptCustomColor: "#123456" }).modified, false);
	assert.equal(facts("prompt-color", { promptColor: "mist", promptCustomColor: "" }).modified, true);
	assert.equal(facts("custom-color", { promptColor: "custom", promptCustomColor: "#123456" }).modified, false);
});

test("PRD-001.R39: a profile's path, arguments, Chrome and Sandbox are modified when not at the CLI's default", () => {
	assert.equal(facts("p1:path", {}, { cliPath: "/usr/bin/claude" }).modified, true);
	assert.equal(facts("p1:args", {}, { extraArgs: "--add-dir ~/x" }).modified, true);
	assert.equal(facts("p1:chrome", {}, { chrome: "on" }).modified, true);
	assert.equal(facts("p1:chrome", {}, { chrome: "off" }).modified, true);
	assert.equal(facts("p1:sandbox", {}, { sandbox: "off" }).modified, true);
});

test("PRD-001.R39: a second profile's rows read that profile, not the first", () => {
	const two = {
		...settings(),
		cliProfiles: [newProfile("p1", "Windows"), newProfile("p2", "WSL", { cliPath: "/usr/bin/claude", sandbox: "on" })],
	};
	assert.equal(rowFacts("p1:path", two).modified, false);
	assert.equal(rowFacts("p2:path", two).modified, true);
	assert.equal(rowFacts("p2:sandbox", two).modified, true);
	assert.deepEqual(rowFacts("p2:path", two).terms, ["/usr/bin/claude"]);
});

test("PRD-001.R39: profile name, Run via WSL, Use for new conversations, headings and Add a CLI profile are never modified", () => {
	const odd = settings({ defaultProfileId: "other" }, { name: "Renamed", useWsl: true });
	for (const id of ["p1:name", "p1:wsl", "default-profile", "p1:heading", "add-profile", "custom-color", "unknown-row"]) {
		const row = rowFacts(id, odd);
		assert.equal(row.modified, false, id);
		assert.equal(row.defaultText, null, id);
	}
});

test("PRD-001.R39: the search text carries the value as shown: On or Off, a dropdown's label, a field's text", () => {
	assert.deepEqual(facts("tooltips").terms, ["On"]);
	assert.deepEqual(facts("bypass").terms, ["Off"]);
	assert.deepEqual(facts("effort").terms, ["CLI default"]);
	assert.deepEqual(facts("effort", { effort: "high" }).terms, ["High"]);
	assert.deepEqual(facts("permission-mode", { defaultPermissionMode: "plan" }).terms, ["Plan (read-only)"]);
	assert.deepEqual(facts("model", { model: "opus" }).terms, ["opus"]);
	assert.deepEqual(facts("vault-instructions", { vaultInstructions: "Use wikilinks" }).terms, ["Use wikilinks"]);
	assert.deepEqual(facts("usage-refresh", { usageRefreshSeconds: 90 }).terms, ["90s"]);
	assert.deepEqual(facts("usage-warn", { usageWarnPercent: 55 }).terms, ["55%"]);
	assert.deepEqual(facts("export-folder", { exportFolder: "Chats" }).terms, ["Chats"]);
	assert.deepEqual(facts("p1:chrome", {}, { chrome: "on" }).terms, ["On"]);
	assert.deepEqual(facts("p1:sandbox").terms, ["Claude Code default"]);
	assert.deepEqual(facts("p1:args", {}, { extraArgs: "--verbose" }).terms, ["--verbose"]);
	assert.deepEqual(facts("p1:name").terms, ["Windows"]);
	assert.deepEqual(facts("custom-color", { promptCustomColor: "#4d91b3" }).terms, ["#4d91b3"]);
});

test("PRD-001.R39: a card picker's search text lists every card's name", () => {
	assert.deepEqual(facts("theme").terms, ["Auto", "Light", "Dark"]);
	assert.deepEqual(facts("conversation-tabs").terms, ["Top", "Side", "Automatic"]);
	assert.deepEqual(facts("prompt-style").terms.slice(0, 2), ["Card", "Bubble"]);
	const colors = facts("prompt-color").terms;
	for (const name of ["Clear", "Sand", "Stone", "Sage", "Sea", "Mist", "Lavender", "Rose", "Accent", "Custom"]) {
		assert.ok(colors.includes(name), name);
	}
});

test("PRD-001.R33, R39: outline, quiet and none find Clear, and only Prompt color", () => {
	const colors = facts("prompt-color").terms;
	for (const alias of ["outline", "quiet", "none"]) assert.ok(colors.includes(alias), alias);
	assert.ok(!facts("prompt-style").terms.some((term) => ["outline", "quiet", "none"].includes(term)));
	assert.ok(!facts("theme").terms.includes("quiet"));
});

test("PRD-001.R39: a row that is a heading or unknown has no terms to search", () => {
	assert.deepEqual(rowFacts("heading-general", settings()).terms, []);
	assert.deepEqual(rowFacts("nope", settings()).terms, []);
});

test("PRD-001.R39: the support buttons read the manifest's fundingUrl in order, only https addresses, a cup for a coffee site", () => {
	assert.deepEqual(supportLinks({ "GitHub Sponsors": "https://github.com/sponsors/yoava", "Buy Me a Coffee": "https://buymeacoffee.com/yoava" }), [
		{ name: "GitHub Sponsors", url: "https://github.com/sponsors/yoava", icon: "heart" },
		{ name: "Buy Me a Coffee", url: "https://buymeacoffee.com/yoava", icon: "coffee" },
	]);
	assert.equal(supportLinks({ Ko: "https://www.ko-fi.com/x" })[0].icon, "coffee");
	assert.equal(supportLinks({ Fake: "https://notbuymeacoffee.com/x" })[0].icon, "heart");
	assert.deepEqual(supportLinks("https://example.com/give"), [{ name: "Support", url: "https://example.com/give", icon: "heart" }]);
	assert.deepEqual(supportLinks({ a: "http://x", b: "javascript:alert(1)", c: 3 }), []);
	assert.deepEqual(supportLinks(undefined), []);
	assert.deepEqual(supportLinks(null), []);
});
