import { test } from "node:test";
import assert from "node:assert/strict";
import { PanelCommands } from "./.build/tab/panel-commands.mjs";
import { EMPTY_MODEL, modelFromStored } from "./.build/state/tab.mjs";
import { addReport, addUserMessage, updateItem } from "./.build/state/turn.mjs";

const STATUS = { sections: [{ title: "Session", rows: [{ label: "Version", value: "2.1.292" }] }] };
const SERVERS = {
	mcpServers: [
		{ name: "github", status: "connected", config: { type: "stdio" }, scope: "user" },
		{ name: "obsidian", status: "connected", config: { type: "sdk" }, scope: "dynamic" },
	],
};

/** A `PanelCommands` over a model, a conversation and a session whose replies the test holds back or fails. */
function panel(replies = {}) {
	let model = EMPTY_MODEL;
	const conversation = { messages: [] };
	const state = { open: true, busy: false, restoring: false, fail: null, gate: null, controls: [], notices: [], saves: 0 };
	const tab = {
		status: { effort: "", usage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, turns: 0, context: null } },
		addPrompt(prompt) {
			const step = addUserMessage(model, prompt);
			model = step.model;
			return step.item;
		},
		addReport(command) {
			const step = addReport(model, command);
			model = step.model;
			return step.item;
		},
		card(id, kind) {
			const item = model.items.find((entry) => entry.id === id);
			return item?.kind === kind ? item : null;
		},
		updateItem(item) {
			model = updateItem(model, item).model;
		},
	};
	const session = {
		profileId: "",
		running: true,
		launchTarget: { cliPath: "claude", useWsl: false },
		async control(request) {
			state.controls.push(request.subtype);
			if (state.gate) await state.gate;
			if (state.fail) throw new Error(state.fail);
			const reply = replies[request.subtype];
			if (reply === undefined) throw new Error(`Unsupported control request subtype: ${request.subtype}`);
			return typeof reply === "function" ? reply(request) : reply;
		},
	};
	const commands = new PanelCommands({
		tab,
		link: { get busy() { return state.busy; }, session, ensure: async () => session },
		recorder: { record: (message) => conversation.messages.push(message) },
		conversation: () => conversation,
		open: () => state.open,
		settings: () => ({ enableBashMode: true, usageWarnPercent: 70, usageCritPercent: 90, cliProfiles: [], defaultProfileId: "" }),
		pluginVersion: "0.6.0",
		cliCommands: () => null,
		usage: { lastError: null, refresh: async () => null },
		modeLabel: () => "Ask before acting",
		queueSave: () => state.saves++,
		follow: () => {},
		notify: (message) => state.notices.push(message),
		restoring: () => state.restoring,
		countRun: () => {},
	});
	/** Hold the session's replies until the returned function is called. */
	const hold = () => {
		let release;
		state.gate = new Promise((resolve) => (release = resolve));
		return () => {
			state.gate = null;
			release();
		};
	};
	return { commands, state, conversation, hold, items: () => model.items };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Reopened items as lines: the card by its command, state and first line. */
const reopened = (messages) =>
	modelFromStored(messages).items.map((item) =>
		item.kind === "report"
			? `report /${item.command} ${item.markdown.split("\n")[0]}`
			: item.kind === "prompt"
				? `${item.type} ${item.text}`
				: item.kind === "turn"
					? `turn ${item.blocks.map((block) => block.text).join(", ")}`
					: item.kind
	);

test("PRD-001.R20: a card is recorded with its command as it runs, its text replaced when it settles though the tab closed meanwhile", async () => {
	const { commands, state, conversation, hold, items } = panel({ get_status: STATUS });
	const release = hold();
	commands.run("/status", "status", "");
	assert.deepEqual(conversation.messages, [
		{ kind: "user", text: "/status" },
		{ kind: "assistant", text: "**Status** - No answer recorded" },
	]);
	state.open = false;
	release();
	await settle();
	assert.equal(conversation.messages.length, 2);
	assert.match(conversation.messages[1].text, /^\*\*Status\*\*\n\n\*\*Panel\*\*/);
	assert.ok(state.saves > 0, "saved");
	assert.equal(items()[1].state, "loading", "a closed tab's card is not redrawn");
	assert.deepEqual(reopened(conversation.messages), ["command /status", "report /status **Status**"]);
});

test("PRD-001.R20: a reply recorded while a card loads stays the reply on reopen", async () => {
	const { commands, conversation, hold } = panel({ get_status: STATUS });
	const release = hold();
	commands.run("/status", "status", "");
	conversation.messages.push({ kind: "user", text: "Go" }, { kind: "assistant", text: "Went" }, { kind: "meta", durationMs: 1 });
	release();
	await settle();
	assert.deepEqual(reopened(conversation.messages), ["command /status", "report /status **Status**", "prompt Go", "turn Went"]);
});

test("PRD-001.R20: a card run while a turn runs is drawn, not recorded", async () => {
	const { commands, state, conversation, items } = panel({ get_status: STATUS });
	state.busy = true;
	commands.run("/status", "status", "");
	await settle();
	assert.deepEqual(conversation.messages, []);
	assert.equal(items()[1].state, "answered");
});

test("PRD-001.R20: Try again repeats the failed attempt with its arguments; Refresh and row actions list again", async () => {
	const { commands, state, items } = panel({ mcp_status: SERVERS, mcp_toggle: {} });
	state.fail = "boom";
	commands.run("/mcp disable github", "mcp", "disable github");
	await settle();
	const id = items()[1].id;
	assert.equal(items()[1].state, "failed");
	state.fail = null;
	state.controls = [];
	commands.refresh(id);
	await settle();
	assert.deepEqual(state.controls, ["mcp_status", "mcp_toggle", "mcp_status"], "Try again: the typed arguments again");
	state.fail = "boom";
	commands.refresh(id);
	await settle();
	state.fail = null;
	state.controls = [];
	commands.refresh(id);
	await settle();
	assert.deepEqual(state.controls, ["mcp_status"], "Try again after a failed Refresh: a Refresh again");
	assert.equal(items()[1].state, "answered");
});

test("PRD-001.R21: an /mcp argument error answers with the servers and the error as the lead, with nothing to try again", async () => {
	const { commands, conversation, items } = panel({ mcp_status: SERVERS });
	commands.run("/mcp frob x", "mcp", "frob x");
	commands.run("/mcp reconnect nope", "mcp", "reconnect nope");
	commands.run("/mcp disable obsidian", "mcp", "disable obsidian");
	await settle();
	const cards = items().filter((item) => item.kind === "report");
	assert.deepEqual(
		cards.map((card) => [card.state, card.report.lead]),
		[
			["answered", "Usage: /mcp [reconnect|enable|disable <server>|all]"],
			["answered", 'No MCP server named "nope".'],
			["answered", '"obsidian" is the panel\'s own server; turn it on or off in Settings → AI Agent Panel.'],
		]
	);
	assert.equal(cards[0].report.sections[0].rows.length, 2, "the servers listed");
	assert.match(conversation.messages[1].text, /Usage: \/mcp/);
});

test("PRD-001.R21: a row action's failure says so, and the card lists again", async () => {
	const { commands, state, items } = panel({
		mcp_status: SERVERS,
		mcp_toggle: () => {
			throw new Error("not now");
		},
	});
	commands.run("/mcp", "mcp", "");
	await settle();
	state.controls = [];
	commands.act(items()[1].id, { label: "Disable", request: { subtype: "mcp_toggle", serverName: "github", enabled: false } });
	await settle();
	assert.deepEqual(state.notices, ["Disable failed: not now"]);
	assert.deepEqual(state.controls, ["mcp_toggle", "mcp_status"]);
	assert.equal(items()[1].state, "answered");
});

test("PRD-002.R14: open /mcp runs nothing while a restore runs", async () => {
	const { commands, state, items } = panel({ get_status: STATUS, mcp_status: SERVERS });
	commands.run("/status", "status", "");
	await settle();
	state.restoring = true;
	commands.act(items()[1].id, { label: "open /mcp", command: "mcp" });
	assert.equal(items().length, 2);
	state.restoring = false;
	commands.act(items()[1].id, { label: "open /mcp", command: "mcp" });
	await settle();
	assert.deepEqual(
		items().map((item) => (item.kind === "prompt" ? item.text : `${item.command} ${item.state}`)),
		["/status", "status answered", "/mcp", "mcp answered"]
	);
});
