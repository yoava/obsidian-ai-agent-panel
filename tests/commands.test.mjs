import { test } from "node:test";
import assert from "node:assert/strict";
import {
	chromeReport,
	commandList,
	contextCategoryColor,
	contextReport,
	couldNotAnswer,
	DID_NOT_START,
	failureMarkdown,
	failureParts,
	foldedAt,
	conversationCost,
	costReport,
	escapeMarkdown,
	HELP_GROUPS,
	helpReport,
	hooksReport,
	isBareMessage,
	mcpActionRequests,
	mcpReport,
	memoryReport,
	PANEL_COMMANDS,
	parseCliCommands,
	parsePanelCommand,
	pathSegments,
	permissionsReport,
	reportHeader,
	reportMarkdown,
	reportTitle,
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

test("PRD-001.R12: a message starting with / is bare, whatever the command", () => {
	assert.equal(isBareMessage("/compact"), true);
	assert.equal(isBareMessage("/compact keep the plan"), true);
	assert.equal(isBareMessage("/review-pr 12"), true);
	assert.equal(isBareMessage("/"), true);
	// A panel command is bare too; it never reaches the model, but the rule is the first character.
	assert.equal(isBareMessage("/context"), true);
});

test("PRD-001.R12: a message not starting with / is not bare", () => {
	assert.equal(isBareMessage(""), false);
	assert.equal(isBareMessage("summarize this"), false);
	assert.equal(isBareMessage("explain /compact"), false);
	assert.equal(isBareMessage("@notes/a.md /compact"), false);
	assert.equal(isBareMessage("!ls /tmp"), false);
	// The rule reads the text as sent; the composer trims it before it asks.
	assert.equal(isBareMessage(" /compact"), false);
});

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
	assert.deepEqual(report.notes, ["Auto-compacts at 967k tokens."], "the live card's footer note");
	assert.deepEqual(report.recordNotes, ["Auto-compacts at 967k tokens; /compact does it now."], "the hint is for the recorded Markdown only: the live card has the button");
	assert.match(reportMarkdown(report), /Auto-compacts at 967k tokens; \/compact does it now\./);
	assert.throws(() => contextReport({}), /token total/);
	for (const reply of [null, undefined, [], [{ totalTokens: 1, maxTokens: 2 }], "x", 5])
		assert.throws(() => contextReport(reply), /token total/, "a reply that is no object has no fields");
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

test("PRD-001.R21: mcpReport reads an entry or a config that is no object as an empty one", () => {
	const report = mcpReport({
		mcpServers: [null, [], 5, "x", { name: "a", status: "connected", config: [] }, { name: "b", config: "x" }],
	});
	assert.deepEqual(
		report.sections[0].rows.map((r) => r.cells[0]),
		["a", "b"]
	);
	assert.throws(() => mcpReport([{ mcpServers: [] }]), /MCP server list/);
});

test("PRD-001.R21: mcpReport lists the most severe status first and offers the right actions", () => {
	const report = mcpReport(MCP);
	assert.equal(report.lead, "4 servers: 1 connected, 1 needs sign-in, 1 failed, 1 disabled");
	assert.equal(report.sections[0].list, "servers");
	const rows = report.sections[0].rows;
	assert.deepEqual(
		rows.map((r) => r.cells[0]),
		["broken", "notion", "obsidian", "off"]
	);
	assert.equal(rows[2].cells[4], "2");
	assert.equal(rows[0].cells[1], "failed - spawn ENOENT", "the Markdown keeps the error in its cell");
	assert.equal(rows[0].detail, "spawn ENOENT", "the card draws it on its own line");
	assert.equal(rows[1].detail, undefined);
	assert.equal(rows[0].status, "error");
	assert.deepEqual(
		rows[3].actions.map((a) => a.request),
		[{ subtype: "mcp_toggle", serverName: "off", enabled: true }]
	);
	assert.deepEqual(rows[2].actions, [], "the panel's own server is switched in settings");
	assert.deepEqual(
		rows[1].actions.map((a) => a.label),
		["Reconnect", "Disable"]
	);
	assert.match(report.notes[0], /sign-in/);
	assert.throws(() => mcpReport({}), /MCP server list/);
	const two = mcpReport({ mcpServers: [MCP.mcpServers[0], { ...MCP.mcpServers[0], name: "n2" }] });
	assert.equal(two.lead, "2 servers: 2 need sign-in");
});

test("PRD-001.R21: mcpActionRequests resolves a server or all", () => {
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

test("PRD-005.R9: costReport adds the CLI's own lines when it runs", () => {
	const totals = {
		turns: 2,
		inputTokens: 1500,
		outputTokens: 20,
		cacheWriteTokens: 0,
		cacheReadTokens: 0,
	};
	const text =
		"Total cost:            $0.0123\nTotal duration (API):  4s\nUsage:                 1500 input, 20 output";
	const report = costReport(totals, 0.01234, text);
	assert.equal(report.sections[0].heading, "This conversation, since opened");
	assert.ok(report.sections[0].rows.every((row) => row.cells[0] !== "Cost"));
	// The conversation's cost spans turns from before the tab opened it.
	assert.equal(report.sections[1].heading, "This conversation, all turns");
	assert.deepEqual(report.sections[1].rows, [{ cells: ["Cost", "$0.0123"] }]);
	assert.deepEqual(report.sections[2].rows[1].cells, ["Total duration (API)", "4s"]);
	assert.equal(costReport(totals, 0.01234, null).sections.length, 2);
});

const meta = (sessionId, costUsd, extra = {}) => ({ kind: "meta", sessionId, costUsd, ...extra });

test("PRD-005.R7: a branch's cost is its fork session's latest total minus the fork base", () => {
	const base = { costUsd: 0.5, sessionId: "f1" };
	assert.equal(Math.round(conversationCost([meta("f1", 0.52), meta("f1", 0.55)], base) * 1e6) / 1e6, 0.05);
	assert.equal(conversationCost([meta("f1", 0.55)], undefined), 0.55, "no base: the whole total");
	assert.equal(conversationCost([], base), 0);
});

test("PRD-005.R7: the base comes off the fork's own session; a later session counts in full", () => {
	const messages = [meta("f1", 0.52), meta("f2", 0.1), meta("f1", 0.55)];
	assert.equal(Math.round(conversationCost(messages, { costUsd: 0.5, sessionId: "f1" }) * 1e6) / 1e6, 0.15);
	assert.equal(Math.round(conversationCost(messages, { costUsd: 0.5, sessionId: "f2" }) * 1e6) / 1e6, 0.55);
	assert.equal(Math.round(conversationCost(messages, { costUsd: 0.5 }) * 1e6) / 1e6, 0.65, "no id yet: nothing taken off");
});

test("PRD-005.R7: a refused rewind followed by a fresh session shows the fresh session's full cost", () => {
	// The abandoned fork never reported a session, so its base names none.
	assert.equal(conversationCost([meta("fresh", 0.3)], { costUsd: 0.5 }), 0.3);
	assert.equal(conversationCost([meta("fresh", 0.3)], { costUsd: 0.5, sessionId: "gone" }), 0.3);
});

test("PRD-005.R7: a total below the base costs nothing, not less", () => {
	assert.equal(conversationCost([meta("f1", 0.4)], { costUsd: 0.5, sessionId: "f1" }), 0);
});

test("PRD-005.R7: /cost lists the branch note under the cost", () => {
	const totals = { turns: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
	const plain = costReport(totals, 0.01, null);
	const noted = costReport(totals, 0.01, null, "Includes the cost of the conversation it branched from");
	assert.equal(noted.notes.length, plain.notes.length + 1);
	assert.equal(noted.notes.at(-1), "Includes the cost of the conversation it branched from");
	assert.deepEqual(plain.notes, costReport(totals, 0.01, null, null).notes);
});

test("PRD-005.R7: two processes of one session count once", () => {
	// A respawn or a reopen resumes the session, whose total carries on.
	const messages = [meta("s1", 0.5), meta("s1", 0.75), meta("s1", 1.25)];
	assert.equal(conversationCost(messages), 1.25);
});

test("PRD-005.R7: a second session id (a /clear segment, a failed resume) adds its own cost", () => {
	const messages = [meta("s1", 0.5), meta("s1", 0.75), meta("s2", 0.25), meta("s2", 0.5)];
	assert.equal(conversationCost(messages), 1.25);
	// Interleaved records of two sessions still take each one's latest.
	assert.equal(conversationCost([meta("s1", 1), meta("s2", 2), meta("s1", 3)]), 5);
});

test("PRD-005.R7: records without a session id count as one session", () => {
	assert.equal(conversationCost([meta(undefined, 0.125), meta(undefined, 0.25)]), 0.25);
	assert.equal(conversationCost([meta("", 0.125), meta(undefined, 0.25)]), 0.25);
});

test("PRD-005.R7: records without a session id and the resumed session continuing their total count once", () => {
	// 0.5.0 and earlier stored no session id; the resumed session carries the total on.
	const legacy = [meta(undefined, 0.125), meta(undefined, 0.25)];
	assert.equal(conversationCost([...legacy, meta("s1", 0.25), meta("s1", 0.75)]), 0.75);
	// Opening exactly at the legacy total is a continuation too.
	assert.equal(conversationCost([...legacy, meta("s1", 0.25)]), 0.25);
});

test("PRD-005.R7: records without a session id and a session starting lower count separately", () => {
	const legacy = [meta(undefined, 0.5), meta(undefined, 0.75)];
	assert.equal(conversationCost([...legacy, meta("s1", 0.125), meta("s1", 0.25)]), 1);
	// Only the first following session decides: a later one never takes them over.
	assert.equal(conversationCost([...legacy, meta("s1", 0.125), meta("s2", 1), meta("s2", 1.25)]), 2.125);
	// And the one that does continue the total takes them over alone.
	assert.equal(conversationCost([...legacy, meta("s1", 1), meta("s2", 2)]), 3);
});

test("PRD-005.R7: an error turn's total counts as its session's latest", () => {
	const error = { kind: "meta", sessionId: "s1", error: "Turn failed", costUsd: 1 };
	assert.equal(conversationCost([meta("s1", 0.5), error]), 1);
});

test("PRD-005.R7: the latest reported total stands, even one that is lower", () => {
	// A killed process's last spend may not have been persisted into the resumed total.
	assert.equal(conversationCost([meta("s1", 0.75), meta("s1", 0.5)]), 0.5);
});

test("PRD-005.R7: turns without a cost, other messages and bad figures add nothing", () => {
	const messages = [
		{ kind: "user", text: "hi" },
		meta("s1", 0.5),
		{ kind: "meta", sessionId: "s1", error: "Turn failed" },
		meta("s2", Number.NaN),
		meta("s3", "1.5"),
		{ kind: "assistant", text: "done", costUsd: 9 },
	];
	assert.equal(conversationCost(messages), 0.5);
	assert.equal(conversationCost([]), 0);
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
	assert.deepEqual(chrome.links, [{ label: "Install the extension", href: "https://claude.ai/chrome", button: "primary" }]);
	assert.deepEqual(chrome.sections[0].rows.at(-1).cells, ["Profile setting", "on"]);
	assert.deepEqual(
		chrome.sections[0].rows.map((row) => row.status),
		["warn", "off", "off", undefined, undefined],
		"card dots: missing extension warns, the rest follow it"
	);

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
	assert.deepEqual(
		sandbox.sections[0].rows.map((row) => row.status),
		["ok", "off", undefined, undefined]
	);
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

// --- Slice 10 (DES-003 Panel commands, Report cards, Suggests) ---------------------

const CLI_COMMANDS = [
	{ name: "review", description: "Review a pull request" },
	{ name: "compact", argumentHint: "<instructions>" },
	{ name: "context", description: "Show current context usage" },
	{ name: "init", description: "Initialize a CLAUDE.md" },
	{ name: "my-skill", description: "A skill of the user's" },
];

test("PRD-001.R19: /clear is described as clearing Claude's context, the messages above staying dimmed", () => {
	assert.equal(PANEL_COMMANDS.find((cmd) => cmd.name === "clear").description, "Clear Claude's context; messages above stay, dimmed");
});

test("PRD-001.R19: one description per panel command, in the command list and in /help", () => {
	const names = PANEL_COMMANDS.map((cmd) => cmd.name);
	assert.equal(new Set(names).size, names.length, "each command once");
	for (const cmd of PANEL_COMMANDS) assert.ok(cmd.description, `/${cmd.name} has a description`);
	const described = new Map(PANEL_COMMANDS.map((cmd) => [cmd.name, cmd.description]));
	for (const cmd of commandList(CLI_COMMANDS).panel) assert.equal(cmd.description, described.get(cmd.name), `/${cmd.name} in the list`);
	const help = helpReport(CLI_COMMANDS, true).sections[0];
	assert.equal(help.rows.length, PANEL_COMMANDS.length);
	for (const row of help.rows) assert.equal(row.cells[1], described.get(row.insert), `/${row.insert} in /help`);
});

test("PRD-001.R19: the list holds the panel's commands, then Claude Code's, each sorted, the panel's description winning on a shared name", () => {
	const list = commandList(CLI_COMMANDS);
	assert.deepEqual(
		list.panel.map((cmd) => cmd.name),
		[...PANEL_COMMANDS.map((cmd) => cmd.name)].sort()
	);
	assert.equal(list.panel.find((cmd) => cmd.name === "context").description, "Show what is using the context window");
	assert.deepEqual(
		list.panel.find((cmd) => cmd.name === "mcp").argumentHint,
		"[reconnect|enable|disable <server>|all]"
	);
	assert.deepEqual(
		list.cli.map((cmd) => cmd.name),
		["compact", "init", "my-skill", "review"],
		"a name the panel answers is listed once, as the panel's"
	);
	const compact = list.cli.find((cmd) => cmd.name === "compact");
	assert.equal(compact.argumentHint, "<instructions>");
	assert.equal(compact.description, "Free up context by summarizing the conversation so far", "a known command without a description borrows the built-in one");
});

test("PRD-001.R19: until Claude Code reports its commands, the list holds the panel's plus compact, init and security-review", () => {
	const list = commandList(null);
	assert.equal(list.panel.length, PANEL_COMMANDS.length);
	assert.deepEqual(
		list.cli.map((cmd) => cmd.name),
		["compact", "init", "security-review"]
	);
	assert.ok(list.cli.every((cmd) => cmd.description));
});

test("PRD-001.R20: /help lists three of Claude Code's commands behind Show all N, each row inserting its command", () => {
	const help = helpReport(CLI_COMMANDS, true);
	const cli = help.sections[1];
	assert.deepEqual(
		cli.rows.map((row) => row.insert),
		["review", "compact", "init", "my-skill"]
	);
	assert.equal(foldedAt(cli), 3);
	assert.equal(foldedAt(helpReport(CLI_COMMANDS.slice(0, 3), true).sections[1]), null, "three show whole");
	assert.equal(help.sections[0].heading, "Answered by the panel");
	assert.equal(help.sections[0].badge, "no tokens");
	assert.equal(foldedAt(help.sections[0]), null, "the panel's own commands all show");
});

test("PRD-001.R20: a table over 14 rows shows 12 behind Show all N", () => {
	const table = (n) => ({ columns: ["A"], rows: Array.from({ length: n }, (_, i) => ({ cells: [String(i)] })) });
	assert.equal(foldedAt(table(14)), null);
	assert.equal(foldedAt(table(15)), 12);
	assert.equal(foldedAt(table(40)), 12);
});

test("PRD-001.R20: a loading card shows its title and Asking Claude Code…, with no badge and no actions", () => {
	assert.deepEqual(reportHeader("status", "loading", true), {
		title: "Status",
		note: "Asking Claude Code…",
		badge: false,
		refresh: false,
		copy: false,
	});
	assert.equal(reportHeader("usage", "loading", true).note, "Checking usage…");
	assert.equal(reportHeader("extra-usage", "loading", true).note, "Checking usage…");
	assert.equal(reportHeader("usage-credits", "loading", true).title, "Usage credits");
});

test("PRD-001.R20: an answered live card is marked no tokens, with Refresh except on /help and Copy as Markdown", () => {
	assert.deepEqual(reportHeader("mcp", "answered", true), { title: "MCP servers", note: null, badge: true, refresh: true, copy: true });
	assert.deepEqual(reportHeader("help", "answered", true), { title: "Commands", note: null, badge: true, refresh: false, copy: true });
	const recorded = reportHeader("mcp", "answered", false);
	assert.deepEqual([recorded.refresh, recorded.copy], [false, false], "a recorded card has no actions");
});

test("PRD-001.R20: a failed card shows its title with Couldn't load and no header actions", () => {
	assert.deepEqual(reportHeader("context", "failed", true), {
		title: "Context usage",
		note: "Couldn't load",
		badge: false,
		refresh: false,
		copy: false,
	});
	assert.equal(couldNotAnswer("Control request timed out: get_status"), "Claude Code could not answer: Control request timed out: get_status. Updating it may help.");
	assert.equal(DID_NOT_START, "Claude Code did not start - see the error above.");
	assert.equal(
		failureMarkdown("status", "Claude Code could not answer: Refused get_status. Updating it may help."),
		"**Status** - Couldn't load\n\nClaude Code could not answer: Refused get\\_status. Updating it may help.",
		"recorded too, so the command keeps its card on reopen"
	);
});

test("PRD-001.R20: every card has its command's title, loading or answered", () => {
	assert.equal(reportTitle("help"), "Commands");
	assert.equal(reportTitle("nope"), "/nope");
	assert.equal(helpReport(null, false).title, reportTitle("help"));
	assert.equal(contextReport(CONTEXT).title, reportTitle("context"));
	assert.equal(mcpReport(MCP).title, reportTitle("mcp"));
	assert.equal(statusReport({ sections: [] }, []).title, reportTitle("status"));
	assert.equal(memoryReport({ files: [] }).title, reportTitle("memory"));
	assert.equal(hooksReport({ hooks: [] }).title, reportTitle("hooks"));
	assert.equal(permissionsReport({ state: { rules: [] } }).title, reportTitle("permissions"));
	assert.equal(skillsReport({ skills: [] }).title, reportTitle("skills"));
	assert.equal(chromeReport({ installed: true }, "").title, reportTitle("chrome"));
	assert.equal(sandboxReport({ supported: true }, "", true).title, reportTitle("sandbox"));
	assert.equal(costReport({ turns: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }, 0, null).title, reportTitle("cost"));
});

test("PRD-001.R20: /status's MCP row offers open /mcp in place of the CLI's hint", () => {
	const report = statusReport(
		{
			sections: [
				{
					title: "Environment",
					rows: [
						{ label: "MCP servers", value: "5 connected · /mcp" },
						{ label: "Memory", value: "2 files" },
					],
				},
			],
		},
		[]
	);
	const [mcp, memory] = report.sections[1].rows;
	assert.deepEqual(mcp, { cells: ["MCP servers", "5 connected"], actions: [{ label: "open /mcp", command: "mcp" }] });
	assert.equal(memory.actions, undefined);
});

test("PRD-001.R20: /context lists memory files, MCP tools per server, agents and skills as collapsed sections", () => {
	const report = contextReport({ ...CONTEXT, agents: [{ agentType: "reviewer", source: "user", tokens: 10 }] });
	assert.deepEqual(
		report.sections.map((section) => [section.heading ?? "", !!section.collapsed]),
		[
			["", false],
			["Memory files", true],
			["MCP tools", true],
			["Custom agents", true],
			["Listed to Claude", true],
		]
	);
});

test("PRD-001.R20, PRD-005.R6: a report's bars are recorded as text lines, without the bar", () => {
	const markdown = reportMarkdown({
		title: "Plan usage",
		lead: "As of 14:32",
		bars: [
			{ label: "Current session (5h)", percent: 42, tint: "normal", sub: "Resets 16:59 · in 2h 27m" },
			{ label: "Used this period", percent: 25, tint: "normal", value: "$12.50", sub: "25% of the cap" },
			{ label: "Status", percent: null, tint: "normal", value: "enabled *now*" },
		],
		sections: [],
	});
	assert.equal(
		markdown,
		[
			"**Plan usage**",
			"As of 14:32",
			"- **Current session (5h):** 42\\% used · Resets 16:59 · in 2h 27m\n- **Used this period:** \\$12.50 · 25\\% of the cap\n- **Status:** enabled \\*now\\*",
		].join("\n\n")
	);
});

test("PRD-001.R20: a recorded report keeps its section badge and leaves out row actions", () => {
	const markdown = reportMarkdown({
		title: "Commands",
		sections: [{ heading: "Answered by the panel", badge: "no tokens", columns: ["Command"], rows: [{ cells: ["/help"], insert: "help" }] }],
	});
	assert.equal(markdown, "**Commands**\n\n**Answered by the panel** (no tokens)\n\n| Command |\n| --- |\n| /help |");
});

test("PRD-001.R20: a report path is cut after each slash and joins back unchanged", () => {
	const path = "/usr/local/bin/claude";
	assert.deepEqual(pathSegments(path), ["/", "usr/", "local/", "bin/", "claude"]);
	assert.equal(pathSegments(path).join(""), path);
	assert.deepEqual(pathSegments("Accept edits"), ["Accept edits"]);
	assert.deepEqual(pathSegments(""), [""]);
	assert.deepEqual(pathSegments("a//b/"), ["a/", "/", "b/"]);
});

test("PRD-001.R20 (CA21-CA50): the builders' card-only hints leave the Markdown as it was", () => {
	const context = contextReport(CONTEXT);
	assert.equal(context.cardLead, "Opus 5.5", "the card leads with the model's name");
	assert.deepEqual(context.figure, { value: "24.8k", caption: "of 1M tokens", aside: "2%" });
	assert.equal(context.meter.free, 942204);
	assert.equal(context.sections[0].recordOnly, true, "the legend lists the categories on the card");
	assert.match(reportMarkdown(context), /\| Category \| Tokens \| Share \|/, "the Markdown keeps the table");
	assert.match(reportMarkdown(context), /claude-opus-5-5 · 24\.8k of 1\.00M tokens \(2\\%\)/, "and its lead");
	assert.equal(contextReport({ ...CONTEXT, categories: CONTEXT.categories.slice(0, -1) }).meter.free, undefined, "no free category, no free figure");

	const cost = costReport({ turns: 3, inputTokens: 18200, outputTokens: 4100, cacheWriteTokens: 0, cacheReadTokens: 0 }, 0.0412, null);
	assert.deepEqual(cost.sections.map((section) => section.list), ["tiles", "figure"]);

	const permissions = permissionsReport({ state: { rules: [], workspaceDirectories: ["/a"] } });
	assert.deepEqual(permissions.sections.map((section) => [section.list, section.marker]), [
		["rules", "ok"],
		["rules", "warn"],
		["rules", "error"],
		["rules", undefined],
	]);

	const memory = memoryReport({ files: [], auto_memory: { status: "on" }, memories: [] });
	assert.deepEqual(memory.sections.map((section) => [section.list, section.headingPill]), [
		["files", undefined],
		["memories", "ok"],
	]);
	assert.equal(memory.sections[1].heading, "Auto memory (on)", "the Markdown keeps the state in the heading");
	assert.equal(memoryReport({ files: [], auto_memory: { status: "off" } }).sections[1].headingPill, "off");
});

test("PRD-001.R20 (CA50): /help's groups name every panel command once", () => {
	const grouped = HELP_GROUPS.flatMap((group) => group.names);
	assert.deepEqual([...grouped].sort(), PANEL_COMMANDS.map((cmd) => cmd.name).sort());
	assert.equal(new Set(grouped).size, grouped.length);
});

test("PRD-001.R20 (CA35): a context category's color follows its name, not its place", () => {
	assert.deepEqual(
		["System prompt", "System tools", "MCP tools", "Memory files", "Messages", "Custom agents"].map(contextCategoryColor),
		[1, 2, 3, 4, 5, 6]
	);
	assert.equal(contextCategoryColor("MCP tools (deferred)"), 3);
	assert.equal(contextCategoryColor("messages"), 5);
});

test("PRD-001.R20: a failure's CLI message is found for the card to set in mono", () => {
	assert.deepEqual(failureParts(couldNotAnswer("Control request timed out: get_status")), {
		before: "Claude Code could not answer: ",
		message: "Control request timed out: get_status",
		after: ". Updating it may help.",
	});
	assert.equal(failureParts(DID_NOT_START), null);
});
