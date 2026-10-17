import { test } from "node:test";
import assert from "node:assert/strict";
import { codeLike, commandGroups, commandRow, headingParts, meterParts, serverRow, skillBar, tile } from "./.build/state/report-card.mjs";
import { costReport, helpReport, mcpReport, PANEL_COMMANDS, skillsReport } from "./.build/commands.mjs";

test("PRD-001.R20 (CA22, CA48): paths, ids, versions, amounts, durations and hosts are set in mono; words are not", () => {
	for (const value of [
		"~/.local/bin/claude",
		"/usr/bin/claude",
		"C:\\Users\\me\\claude.exe",
		"~/Vaults/Second Brain",
		".",
		"., /tmp",
		"$0.0412",
		"US$12.40",
		"2.4.1",
		"2.1.292-beta.1",
		"8f3c2a1e-77b0-4c1d-9e52-a91e",
		"1m 12s",
		"github.com, registry.npmjs.org",
		".obsidian/",
	])
		assert.equal(codeLike(value), true, value);
	for (const value of ["", "Default", "Accept edits", "AI Agent Panel 0.5.0", "yes", "Claude account", "3 connected, 1 failed", "on"])
		assert.equal(codeLike(value), false, value);
});

test("PRD-001.R20 (CA49): a heading's closing (…) becomes its pill", () => {
	assert.deepEqual(headingParts("Auto memory (on)"), { text: "Auto memory", pill: "on" });
	assert.deepEqual(headingParts("Instruction files"), { text: "Instruction files", pill: null });
});

test("PRD-001.R20 (CA32, CA33, CA35): /context's meter runs used, free, reserve; colors by name; the legend adds free space when reported", () => {
	const meter = {
		max: 200,
		free: 100,
		segments: [
			{ label: "Messages", tokens: 40 },
			{ label: "Autocompact buffer", tokens: 30, reserved: true },
			{ label: "System prompt", tokens: 10 },
		],
	};
	const { bar, legend } = meterParts(meter);
	assert.deepEqual(
		bar.map((part) => [part.label, part.share, part.swatch]),
		[
			["Messages", 20, 5],
			["System prompt", 5, 1],
			["Free space", null, "free"],
			["Autocompact buffer", 15, "reserved"],
		]
	);
	assert.deepEqual(
		legend.map((part) => [part.label, part.tokens]),
		[
			["Messages", 40],
			["System prompt", 10],
			["Free space", 100],
			["Autocompact buffer", 30],
		]
	);
	const unreported = meterParts({ max: 200, segments: [{ label: "Messages", tokens: 40 }] });
	assert.deepEqual(unreported.legend.map((part) => part.label), ["Messages"], "no free figure, no free legend item");
	assert.equal(unreported.bar.at(-1).swatch, "free", "the bar still fills the rest");
});

test("PRD-001.R21 (CA23, CA40): an /mcp row takes its pill, meta and error from the builder, and labels the first button of a server that needs it", () => {
	const report = mcpReport({
		mcpServers: [
			{ name: "github", status: "connected", config: { type: "stdio" }, scope: "user", tools: new Array(26).fill({}) },
			{ name: "postgres", status: "failed", error: "spawn uvx ENOENT", config: {}, scope: "project" },
			{ name: "obsidian", status: "connected", config: { type: "sdk" }, scope: "dynamic", tools: [{}] },
			{ name: "figma", status: "disabled", config: { type: "http" }, scope: "user" },
		],
	});
	const rows = report.sections[0].rows.map(serverRow);
	assert.deepEqual(
		rows.map(({ name, pill, tone, own, meta, detail, muted }) => ({ name, pill, tone, own, meta, detail, muted })),
		[
			{ name: "postgres", pill: "failed", tone: "error", own: false, meta: "stdio · project", detail: "spawn uvx ENOENT", muted: false },
			{ name: "github", pill: "connected", tone: "ok", own: false, meta: "stdio · user · 26 tools", detail: null, muted: false },
			{
				name: "obsidian",
				pill: "connected",
				tone: "ok",
				own: true,
				meta: "sdk · 1 tool · on/off in Settings → AI Agent Panel",
				detail: null,
				muted: false,
			},
			{ name: "figma", pill: "disabled", tone: "off", own: false, meta: "http · user", detail: null, muted: true },
		]
	);
	assert.deepEqual(
		rows.map((row) => row.buttons.map((b) => [b.action.label, b.icon, b.labelled])),
		[
			[
				["Reconnect", "rotate-cw", true],
				["Disable", "power", false],
			],
			[
				["Reconnect", "rotate-cw", false],
				["Disable", "power", false],
			],
			[],
			[["Enable", "power", true]],
		]
	);
});

test("PRD-001.R20 (CA44): /skills' bar has a segment per listed skill with tokens, its share and its opacity step", () => {
	const skill = (name, tokens, state = "on") => ({ name, source: "user", tokens, state });
	const rows = skillsReport({ skills: [skill("a", 300), skill("b", 100), skill("c", null), skill("d", 400, "off")] }).sections[0].rows;
	assert.deepEqual(skillBar(rows), [
		{ name: "a", share: 75, step: 0 },
		{ name: "b", share: 25, step: 1 },
	]);
	const many = skillsReport({ skills: Array.from({ length: 7 }, (_, i) => skill(`s${i}`, 10)) }).sections[0].rows;
	assert.deepEqual(skillBar(many).map((segment) => segment.step), [0, 1, 2, 3, 4, 4, 4], "the last step holds");
	assert.deepEqual(skillBar([]), []);
});

test("PRD-001.R20 (CA50): /help's rows take name and hint from the builder, and group in the boards' order", () => {
	const help = helpReport([{ name: "compact", description: "Free up context by summarizing.", argumentHint: "[instructions]" }], true);
	const mcp = help.sections[0].rows.find((row) => row.insert === "mcp");
	assert.deepEqual(commandRow(mcp), {
		name: "/mcp",
		hint: "[reconnect|enable|disable <server>|all]",
		description: mcp.cells[1],
	});
	assert.deepEqual(commandRow(help.sections[1].rows[0]), {
		name: "/compact",
		hint: "[instructions]",
		description: "Free up context by summarizing.",
	});
	assert.deepEqual(commandRow({ cells: ["/x y", "z"] }), { name: "/x y", hint: "", description: "z" }, "no parts: the cell whole");
	const panel = commandGroups(help.sections[0].rows);
	assert.deepEqual(
		panel.map((group) => group.label),
		["Usage & cost", "Setup", "Conversation"]
	);
	assert.equal(
		panel.reduce((sum, group) => sum + group.rows.length, 0),
		PANEL_COMMANDS.length,
		"every panel command once"
	);
	assert.deepEqual(panel[0].rows.map((row) => row.insert).slice(0, 2), ["usage", "usage-credits"]);
	const cli = commandGroups(help.sections[1].rows);
	assert.deepEqual(
		cli.map((group) => [group.label, group.rows.length]),
		[[null, 1]],
		"Claude Code's commands stay one unlabelled list"
	);
	const unnamed = commandGroups([{ cells: ["/usage", "x"], insert: "usage" }, { cells: ["/new", "y"], insert: "new" }]);
	assert.deepEqual(unnamed.map((group) => group.label), ["Usage & cost", null], "a command no group names follows them");
});

test("PRD-001.R20 (CA39): a /cost tile shows the figure, with tokens in its label", () => {
	const totals = { turns: 3, inputTokens: 18_200, outputTokens: 4_100, cacheWriteTokens: 0, cacheReadTokens: 0 };
	const rows = costReport(totals, 0.0412, null).sections[0].rows;
	assert.deepEqual(rows.map(tile).slice(0, 2), [
		{ value: "3", label: "Turns" },
		{ value: "18.2k", label: "Input tokens" },
	]);
	assert.deepEqual(rows[1].cells, ["Input", "18.2k tokens"], "the Markdown keeps its cells");
});
