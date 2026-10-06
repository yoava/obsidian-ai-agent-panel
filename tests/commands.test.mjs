import { test } from "node:test";
import assert from "node:assert/strict";
import {
	chromeReport,
	contextReport,
	costReport,
	escapeMarkdown,
	helpReport,
	hooksReport,
	mcpActionRequests,
	mcpReport,
	memoryReport,
	parseCliCommands,
	parsePanelCommand,
	permissionsReport,
	reportMarkdown,
	sandboxReport,
	skillsReport,
	statusReport,
} from "./.build/commands.mjs";

// Replies trimmed from Claude Code 2.1.292's control responses.
const CONTEXT = {
	categories: [
		{ name: "System prompt", tokens: 2407, kind: "used" },
		{ name: "System tools", tokens: 10828, kind: "used" },
		{ name: "System tools (deferred)", tokens: 19964, isDeferred: true, kind: "deferred" },
		{ name: "Memory files", tokens: 1806, kind: "used" },
		{ name: "Messages", tokens: 0, kind: "used" },
		{ name: "Autocompact buffer", tokens: 33000, kind: "buffer" },
		{ name: "Free space", tokens: 942204, kind: "free" },
	],
	totalTokens: 24796,
	maxTokens: 1000000,
	percentage: 2,
	model: "claude-opus-5-5",
	memoryFiles: [{ path: "/home/u/.claude/CLAUDE.md", type: "User", tokens: 442 }],
	mcpTools: [
		{ name: "a", serverName: "obsidian", tokens: 100, isLoaded: true },
		{ name: "b", serverName: "obsidian", tokens: 50, isLoaded: false },
	],
	agents: [],
	slashCommands: { totalCommands: 74, includedCommands: 74, tokens: 919 },
	skills: { totalSkills: 73, includedSkills: 73, tokens: 9745 },
	autoCompactThreshold: 967000,
	isAutoCompactEnabled: true,
};

const MCP = {
	mcpServers: [
		{ name: "notion", status: "needs-auth", config: { type: "http" }, scope: "dynamic", source: "plugin" },
		{ name: "obsidian", status: "connected", config: { type: "sdk" }, scope: "dynamic", tools: [{}, {}] },
		{ name: "broken", status: "failed", error: "spawn ENOENT", config: {}, scope: "user" },
		{ name: "off", status: "disabled", config: { type: "stdio" }, scope: "project" },
	],
};

test("parsePanelCommand matches only panel commands, with arguments", () => {
	assert.deepEqual(parsePanelCommand("/context"), { name: "context", args: "" });
	assert.deepEqual(parsePanelCommand("/clear"), { name: "clear", args: "" });
	assert.deepEqual(parsePanelCommand("  /MCP reconnect  my server "), {
		name: "mcp",
		args: "reconnect  my server",
	});
	assert.equal(parsePanelCommand("/compact"), null);
	assert.equal(parsePanelCommand("/contextual"), null);
	assert.equal(parsePanelCommand("explain /context"), null);
});

test("escapeMarkdown neutralizes formatting and folds newlines", () => {
	assert.equal(escapeMarkdown("Bash(git add *)"), "Bash(git add \\*)");
	assert.equal(escapeMarkdown("a|b $1 [[x]] ==y=="), "a\\|b \\$1 \\[\\[x\\]\\] \\=\\=y\\=\\=");
	assert.equal(escapeMarkdown("one\n  two"), "one two");
	assert.equal(escapeMarkdown("a\rb"), "a b");
	assert.equal(escapeMarkdown("for %%f in"), "for \\%\\%f in");
});

test("contextReport meters what is in the window and lists the rest", () => {
	const report = contextReport(CONTEXT);
	assert.equal(report.lead, "claude-opus-5-5 · 24.8k of 1.00M tokens (2%)");
	assert.deepEqual(
		report.meter.segments.map((s) => [s.label, !!s.reserved]),
		[
			["System prompt", false],
			["System tools", false],
			["Memory files", false],
			["Autocompact buffer", true],
		]
	);
	const categories = report.sections[0].rows.map((r) => r.cells[0]);
	assert.ok(categories.includes("System tools (deferred)"));
	assert.ok(!categories.includes("Messages"), "empty categories are skipped");
	const mcp = report.sections.find((s) => s.heading === "MCP tools");
	assert.deepEqual(mcp.rows[0].cells, ["obsidian", "1 of 2", "100"]);
	assert.match(report.notes[0], /Auto-compacts at 967\.0k/);
	assert.throws(() => contextReport({}), /token total/);
});

test("contextReport reads categories from CLIs that send no kind", () => {
	const report = contextReport({
		totalTokens: 10,
		maxTokens: 100,
		categories: [
			{ name: "Messages", tokens: 10 },
			{ name: "MCP tools (deferred)", tokens: 5 },
			{ name: "Autocompact buffer", tokens: 20 },
			{ name: "Free space", tokens: 70 },
		],
	});
	assert.deepEqual(
		report.meter.segments.map((s) => [s.label, !!s.reserved]),
		[
			["Messages", false],
			["Autocompact buffer", true],
		]
	);
});

test("mcpReport sorts by status and offers the right actions", () => {
	const report = mcpReport(MCP);
	assert.equal(report.lead, "4 servers: 1 connected, 1 needs sign-in, 1 failed, 1 disabled");
	const rows = report.sections[0].rows;
	assert.deepEqual(
		rows.map((r) => r.cells[0]),
		["obsidian", "notion", "broken", "off"]
	);
	assert.equal(rows[0].cells[4], "2");
	assert.equal(rows[2].cells[1], "failed - spawn ENOENT");
	assert.equal(rows[2].status, "error");
	assert.deepEqual(
		rows[3].actions.map((a) => a.request),
		[{ subtype: "mcp_toggle", serverName: "off", enabled: true }]
	);
	assert.deepEqual(rows[0].actions, [], "the panel's own server is switched in settings");
	assert.deepEqual(
		rows[1].actions.map((a) => a.label),
		["Reconnect", "Disable"]
	);
	assert.match(report.notes[0], /sign-in/);
	assert.throws(() => mcpReport({}), /MCP server list/);
	const two = mcpReport({ mcpServers: [MCP.mcpServers[0], { ...MCP.mcpServers[0], name: "n2" }] });
	assert.equal(two.lead, "2 servers: 2 need sign-in");
});

test("mcpActionRequests resolves a server or all", () => {
	assert.deepEqual(mcpActionRequests("reconnect Broken", MCP), {
		requests: [{ subtype: "mcp_reconnect", serverName: "broken" }],
	});
	assert.deepEqual(mcpActionRequests("enable all", MCP), {
		requests: [{ subtype: "mcp_toggle", serverName: "off", enabled: true }],
	});
	assert.deepEqual(
		mcpActionRequests("disable all", MCP).requests.map((r) => r.serverName),
		["notion", "broken"]
	);
	assert.match(mcpActionRequests("disable obsidian", MCP).error, /panel's own server/);
	assert.match(mcpActionRequests("disable nope", MCP).error, /No MCP server named "nope"/);
	assert.match(mcpActionRequests("frob x", MCP).error, /^Usage/);
	assert.match(mcpActionRequests("reconnect", MCP).error, /^Usage/);
});

test("costReport adds the CLI's own lines when it runs", () => {
	const totals = {
		turns: 2,
		inputTokens: 1500,
		outputTokens: 20,
		cacheWriteTokens: 0,
		cacheReadTokens: 0,
		costUsd: 0.01234,
	};
	const text =
		"Total cost:            $0.0123\nTotal duration (API):  4s\nUsage:                 1500 input, 20 output";
	const report = costReport(totals, text);
	assert.equal(report.sections[0].heading, "This conversation, since opened");
	assert.deepEqual(report.sections[0].rows.at(-1).cells, ["Cost", "$0.0123"]);
	assert.deepEqual(report.sections[1].rows[1].cells, ["Total duration (API)", "4s"]);
	assert.equal(costReport(totals, null).sections.length, 1);
});

test("statusReport puts the panel first and drops TUI-only rows", () => {
	const raw = {
		sections: [
			{
				title: "Session",
				rows: [
					{ label: "Version", value: "2.1.292" },
					{ label: "Peer address", value: "uds:/run/x.sock" },
				],
			},
			{ title: "Environment", rows: [{ label: "MCP servers", value: "5 connected · /mcp" }] },
		],
	};
	const report = statusReport(raw, [["Plugin", "0.5.0"]]);
	assert.deepEqual(
		report.sections.map((s) => s.heading),
		["Panel", "Session", "Environment"]
	);
	assert.deepEqual(report.sections[1].rows.map((r) => r.cells[0]), ["Version"]);
	assert.equal(report.sections[2].rows[0].cells[1], "5 connected");
});

test("memoryReport lists instruction files and auto memory", () => {
	const report = memoryReport({
		files: [
			{ kind: "user", path: "/u/.claude/CLAUDE.md", label: "User instructions", exists: true },
			{ kind: "project", path: "/v/CLAUDE.md", label: "Project instructions", exists: false },
		],
		folders: [{ kind: "auto", path: "/u/.claude/projects/v/memory/" }],
		memories: [{ name: "MEMORY.md", description: "Index of saved memories" }],
		auto_memory: { status: "on" },
	});
	assert.deepEqual(report.sections[0].rows[1].cells, ["Project instructions", "/v/CLAUDE.md", "not created"]);
	assert.equal(report.sections[1].heading, "Auto memory (on)");
	assert.deepEqual(report.sections[1].rows[0].cells, ["MEMORY.md", "Index of saved memories"]);
});

test("hooksReport and permissionsReport", () => {
	const hooks = hooksReport({
		hooks: [
			{
				event: "PreToolUse",
				matcher: "Bash|Grep",
				sourceLabel: "Project settings (.claude/settings.json)",
				displayText: "graphify hook-guard search",
			},
		],
	});
	assert.deepEqual(hooks.sections[0].rows[0].cells, [
		"PreToolUse",
		"Bash|Grep",
		"graphify hook-guard search",
		"Project settings (.claude/settings.json)",
	]);
	assert.equal(hooksReport({ hooks: [] }).sections[0].rows.length, 0);

	const perms = permissionsReport({
		state: {
			rules: [
				{ behavior: "allow", source: "userSettings", rule: "Bash(git add *)" },
				{ behavior: "deny", source: "userSettings", rule: "Read(~/.ssh/**)" },
			],
			workspaceDirectories: ["/extra"],
		},
	});
	assert.deepEqual(perms.sections.map((s) => [s.heading, s.rows.length]), [
		["Allow", 1],
		["Ask", 0],
		["Deny", 1],
		["Additional directories", 1],
	]);
	assert.deepEqual(perms.sections[0].rows[0].cells, ["Bash(git add *)", "User settings"]);
});

test("skillsReport totals what is listed to Claude", () => {
	const report = skillsReport({
		skills: [
			{ name: "codex", source: "user", tokens: 151, state: "on" },
			{ name: "manual", source: "user", tokens: 80, state: "user-invocable-only" },
		],
	});
	assert.equal(report.lead, "2 skills; 1 listed to Claude, ~151 tokens of descriptions");
	assert.equal(report.sections[0].rows[1].cells[3], "only when you invoke it");
});

test("chromeReport and sandboxReport explain what blocks them", () => {
	const chrome = chromeReport(
		{
			allowed: true,
			subscriber: true,
			wsl: true,
			installed: false,
			connected: false,
			enabled_by_default: false,
			at_startup: false,
			urls: { install: "https://claude.ai/chrome", permissions: "javascript:alert(1)" },
		},
		"on"
	);
	assert.match(chrome.notes[0], /inside WSL/);
	assert.deepEqual(chrome.links, [{ label: "Install the extension", href: "https://claude.ai/chrome" }]);
	assert.deepEqual(chrome.sections[0].rows.at(-1).cells, ["Profile setting", "on"]);

	const sandbox = sandboxReport(
		{
			supported: true,
			enabled: false,
			mode: "disabled",
			enabled_in_settings: false,
			dependencies: { errors: ["bubblewrap"], warnings: [] },
			restrictions: { network_allowed_domains: ["github.com", "npmjs.org"], fs_deny_read: [] },
		},
		"",
		true
	);
	assert.deepEqual(sandbox.sections[0].rows[1].cells, ["On in this session", "no (disabled)"]);
	assert.deepEqual(sandbox.sections[1].rows, [{ cells: ["Allowed domains", "github.com, npmjs.org"] }]);
	assert.equal(sandbox.notes[0], "Missing: bubblewrap");
	assert.throws(() => sandboxReport({}, "", true), /sandbox status/);
});

test("helpReport lists panel commands and, once known, the CLI's", () => {
	const before = helpReport(null, true);
	assert.equal(before.sections.length, 1);
	assert.match(before.notes[0], /once a conversation has started/);
	assert.match(before.notes[1], /! runs a shell command/);
	assert.doesNotMatch(helpReport(null, false).notes.join(" "), /shell/);
	const cli = parseCliCommands([
		{ name: "compact", description: "Free up context by summarizing the conversation so far", argumentHint: "<x>" },
		{ name: "context", description: "Show current context usage" },
		{ name: "" },
	]);
	assert.equal(cli.length, 2);
	const after = helpReport(cli, true);
	assert.deepEqual(after.sections[1].rows.map((r) => r.cells[0]), ["/compact"]);
	assert.equal(parseCliCommands("nope"), null);
});

test("reportMarkdown renders tables, pairs, notes and safe links", () => {
	const markdown = reportMarkdown({
		title: "T",
		lead: "lead",
		sections: [
			{ heading: "Pairs", rows: [{ cells: ["Turns", "2"] }] },
			{ columns: ["A", "B"], rows: [{ cells: ["x|y", "*"] }] },
			{ heading: "Empty", columns: ["A"], rows: [], empty: "None." },
		],
		notes: ["note"],
		links: [
			{ label: "ok", href: "https://example.com/a_(b)" },
			{ label: "bad", href: "javascript:alert(1)" },
			{ label: "angle", href: "https://a.b>[x](obsidian://y)" },
		],
	});
	assert.equal(
		markdown,
		[
			"**T**",
			"lead",
			"**Pairs**",
			"- **Turns:** 2",
			"| A | B |\n| --- | --- |\n| x\\|y | \\* |",
			"**Empty**",
			"*None.*",
			"note",
			"[ok](<https://example.com/a_(b)>)",
		].join("\n\n")
	);
});
