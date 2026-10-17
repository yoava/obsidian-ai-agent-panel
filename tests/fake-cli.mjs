#!/usr/bin/env node
/**
 * A stand-in for the `claude` binary that speaks just enough of the stream-JSON
 * protocol to exercise src/protocol/client.ts without a real CLI, a login, or a
 * network. It reports back what it observed as `system/probe` messages so the
 * test can assert on the client's side of the conversation.
 *
 * Scripted by the FAKE_CLI_SCENARIO environment variable.
 */

const scenario = process.env.FAKE_CLI_SCENARIO ?? "basic";
const out = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const probe = (what, extra = {}) => out({ type: "system", subtype: "probe", what, ...extra });

/**
 * The "noise" scenario: every write carries lines that are valid JSON but not
 * objects, and control_responses without a `response` object, ahead of and
 * between the real messages in the same chunk.
 */
const NOISE = [
	"null",
	"42",
	'"str"',
	"[]",
	"true",
	'{"type":"control_response"}',
	'{"type":"control_response","response":null}',
	'{"type":"control_response","response":"x"}',
	'{"type":"control_request"}',
	'{"type":"control_request","request_id":"x","request":null}',
	'{"type":"control_request","request_id":"y","request":[]}',
	'{"type":"control_request","request_id":"z","request":"str"}',
]
	.map((line) => line + "\n")
	.join("");
const burst = (...objs) =>
	process.stdout.write(NOISE + objs.map((obj) => JSON.stringify(obj) + "\n" + NOISE).join(""));
const emit = (obj) => (scenario === "noise" ? burst(obj) : out(obj));
const ok = (request_id, response) =>
	emit({ type: "control_response", response: { subtype: "success", request_id, response } });

/** The Nth session this process has run: the first `...f001`, each `/clear` the next. */
const sessionOf = (n) => `00000000-0000-4000-8000-00000000f${String(n).padStart(3, "0")}`;
let sessionNumber = 1;
let SESSION = sessionOf(sessionNumber);
/** The model in use: `--model`, else the CLI's default; a null `set_model` returns to the default. */
const DEFAULT_MODEL = "claude-opus-5-5";
let currentModel = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : DEFAULT_MODEL;
/** The permission mode in use: `--permission-mode`, else default; a `set_permission_mode` changes it. */
let currentMode = process.argv.includes("--permission-mode") ? process.argv[process.argv.indexOf("--permission-mode") + 1] : "default";
let replays = 0;

/**
 * The real CLI replays a model change as a uuid-bearing user message holding
 * the command's stdout, before the control_response, idle or mid-turn; a call
 * that changes nothing sends none (docs/records/verification: task 095 W3).
 */
function replayModelChange(model) {
	const next = model ?? DEFAULT_MODEL;
	if (next === currentModel) return;
	currentModel = next;
	emit({
		type: "user",
		uuid: `u-local-${++replays}`,
		isReplay: true,
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "user", content: `<local-command-stdout>Set model to \`${next}\`</local-command-stdout>` },
	});
}
let nextId = 0;
const pendingOurs = new Map();
/** Our `can_use_tool` requests still unanswered: an interrupt withdraws them. */
const pendingPermissions = new Set();
/** From a user turn to its `result`. */
let turnRunning = false;
/** Messages sent while a turn runs, each run as the next turn, as Claude Code queues them. */
const queuedTurns = [];
/** Results sent: the context window fills with each (`get_context_usage`). */
let finishedTurns = 0;

/**
 * A `get_usage` reply shaped as Claude Code 2.1.292's (`parseUsage`): the
 * Sonnet week past the default warning threshold, resets counted from now.
 */
function usageReply() {
	const at = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
	return {
		rate_limits_available: true,
		rate_limits: {
			five_hour: { utilization: 42.5, resets_at: at(2.45) },
			seven_day: { utilization: 18, resets_at: at(89) },
			seven_day_sonnet: { utilization: 81, resets_at: at(89) },
			model_scoped: [{ display_name: "Opus", utilization: 12, resets_at: at(89) }],
			extra_usage: {
				is_enabled: true,
				monthly_limit: 5000,
				used_credits: 350,
				utilization: 7,
				currency: "USD",
				disabled_reason: null,
			},
		},
	};
}

/**
 * A `get_context_usage` reply shaped as Claude Code 2.1.292's (the captured
 * reply in tests/commands.test.mjs), each finished turn adding 40k of a 200k
 * window: 32% after one turn, 92% after four.
 */
function contextReply() {
	const max = 200_000;
	const buffer = 33_000;
	const fixed = { prompt: 2_407, tools: 10_828, memory: 1_806 };
	const messages = 9_755 + 40_000 * finishedTurns;
	const total = fixed.prompt + fixed.tools + fixed.memory + messages;
	return {
		categories: [
			{ name: "System prompt", tokens: fixed.prompt, kind: "used" },
			{ name: "System tools", tokens: fixed.tools, kind: "used" },
			{ name: "System tools (deferred)", tokens: 19_964, isDeferred: true, kind: "deferred" },
			{ name: "Memory files", tokens: fixed.memory, kind: "used" },
			{ name: "Messages", tokens: messages, kind: "used" },
			{ name: "Autocompact buffer", tokens: buffer, kind: "buffer" },
			{ name: "Free space", tokens: Math.max(0, max - total - buffer), kind: "free" },
		],
		totalTokens: total,
		maxTokens: max,
		percentage: Math.round((total / max) * 100),
		model: "fake-model-1",
		autoCompactThreshold: max - buffer,
		isAutoCompactEnabled: true,
	};
}
/**
 * The commands the initialize reply lists, shaped as Claude Code 2.1.292's:
 * more than /help shows before "Show all N", one with an argument hint, and
 * `context`, a name the panel answers itself.
 */
const COMMANDS = [
	{ name: "compact", description: "Free up context by summarizing the conversation so far", argumentHint: "<optional custom summarization instructions>" },
	{ name: "context", description: "Show current context usage" },
	{ name: "init", description: "Initialize a new CLAUDE.md file with codebase documentation" },
	{ name: "review", description: "Review a pull request" },
	{ name: "security-review", description: "Complete a security review of the pending changes on the current branch" },
	{ name: "fake-skill", description: "A skill the fake CLI lists. It does nothing." },
];

/** MCP servers by name, one of each status; `mcp_toggle` and `mcp_reconnect` change them. */
const mcpServers = new Map(
	[
		{ name: "obsidian", status: "connected", config: { type: "sdk" }, scope: "dynamic", tools: [{}, {}, {}, {}, {}, {}] },
		{ name: "github", status: "connected", config: { type: "stdio" }, scope: "user", tools: [{}, {}] },
		{ name: "linear", status: "needs-auth", config: { type: "http" }, scope: "user" },
		{ name: "postgres", status: "failed", error: "spawn uvx ENOENT", config: { type: "stdio" }, scope: "project" },
		{ name: "figma", status: "disabled", config: { type: "http" }, scope: "user" },
	].map((server) => [server.name, server])
);

/**
 * Replies to the panel's report requests, trimmed from Claude Code 2.1.292's
 * (the captured replies in tests/commands.test.mjs).
 */
const REPORTS = {
	get_status: () => ({
		sections: [
			{
				title: "Session",
				rows: [
					{ label: "Version", value: "2.1.292 (fake)" },
					{ label: "Session ID", value: SESSION },
					{ label: "Peer address", value: "uds:/run/fake.sock" },
				],
			},
			{
				title: "Environment",
				rows: [
					{ label: "MCP servers", value: `${[...mcpServers.values()].filter((s) => s.status === "connected").length} connected · /mcp` },
					{ label: "Setting sources", value: "User, Project" },
				],
			},
		],
	}),
	get_memory_dialog: () => ({
		files: [
			{ kind: "user", path: "~/.claude/CLAUDE.md", label: "User instructions", exists: true },
			{ kind: "project", path: "CLAUDE.md", label: "Project instructions", exists: false },
		],
		folders: [{ kind: "auto", path: "~/.claude/projects/fake/memory/" }],
		memories: [{ name: "MEMORY.md", description: "Index of saved memories" }],
		auto_memory: { status: "on" },
	}),
	get_hooks_listing: () => ({
		hooks: [{ event: "PreToolUse", matcher: "Bash", sourceLabel: "User settings", displayText: "~/.claude/hooks/guard.sh" }],
	}),
	list_permission_rules: () => ({
		state: {
			rules: [
				{ behavior: "allow", source: "userSettings", rule: "Bash(git status)" },
				{ behavior: "ask", source: "projectSettings", rule: "Bash(git push *)" },
				{ behavior: "deny", source: "userSettings", rule: "Read(./.env)" },
			],
			workspaceDirectories: [],
		},
	}),
	get_skills_dialog: () => ({
		skills: [
			{ name: "fake-skill", source: "user", tokens: 151, state: "on" },
			{ name: "manual", source: "project", tokens: 80, state: "user-invocable-only" },
		],
	}),
	get_chrome_dialog: () => ({
		allowed: true,
		subscriber: true,
		wsl: false,
		installed: true,
		connected: false,
		enabled_by_default: false,
		at_startup: false,
		urls: { reconnect: "https://claude.ai/chrome", permissions: "https://claude.ai/chrome/permissions" },
	}),
	get_sandbox_dialog: () => ({
		supported: true,
		enabled: false,
		mode: "disabled",
		enabled_in_settings: false,
		dependencies: { errors: ["socat"], warnings: [] },
		restrictions: { network_allowed_domains: ["github.com"], fs_allow_write: ["."] },
	}),
	get_session_cost: () => ({ text: "Total cost:            $0.0012\nTotal duration (API):  1s\nUsage:                 1200 input, 34 output" }),
	mcp_status: () => ({ mcpServers: [...mcpServers.values()] }),
};

/** `mcp_toggle` and `mcp_reconnect` on a server the fake CLI lists; an unknown one throws. */
function mcpAction(request) {
	const server = mcpServers.get(request.serverName);
	if (!server) throw new Error(`No MCP server named ${request.serverName}`);
	if (request.subtype === "mcp_toggle") server.status = request.enabled ? "connected" : "disabled";
	else {
		server.status = "connected";
		delete server.error;
	}
	return {};
}

function ask(request, onReply) {
	const request_id = `cli_${++nextId}`;
	pendingOurs.set(request_id, onReply);
	if (request.subtype === "can_use_tool") pendingPermissions.add(request_id);
	out({ type: "control_request", request_id, request });
	return request_id;
}

/**
 * A CLI slow to stop, for the restart tests: with FAKE_CLI_SIGTERM_DELAY_MS
 * set, SIGTERM ends the process only after that many milliseconds (a long
 * delay leaves it to SIGKILL), and closing stdin does not end it. Set up
 * before the first report, so a test reacting to it finds it in place. With
 * FAKE_CLI_TALK_ON_SIGTERM it also writes, on SIGTERM, what a process in a
 * turn would: messages marked `stale`, a permission request it then cancels,
 * and an MCP call.
 */
if (process.env.FAKE_CLI_SIGTERM_DELAY_MS) {
	setInterval(() => {}, 60_000);
	process.on("SIGTERM", () => {
		if (process.env.FAKE_CLI_TALK_ON_SIGTERM) talkWhileStopping();
		setTimeout(() => process.exit(0), Number(process.env.FAKE_CLI_SIGTERM_DELAY_MS));
	});
}

function talkWhileStopping() {
	const stale = { session_id: "stale-session", stale: true };
	out({ type: "system", subtype: "init", ...stale });
	out({ type: "system", subtype: "status", permissionMode: "bypassPermissions", ...stale });
	out({
		type: "assistant",
		parent_tool_use_id: null,
		message: { role: "assistant", content: [{ type: "text", text: "stale" }] },
		...stale,
	});
	out({ type: "result", subtype: "success", is_error: false, total_cost_usd: 9, ...stale });
	const id = ask({ subtype: "can_use_tool", tool_name: "Edit", input: {} }, () => {});
	out({ type: "control_cancel_request", request_id: id });
	ask({ subtype: "mcp_message", server_name: "obsidian", message: { jsonrpc: "2.0", id: 9, method: "tools/list" } }, () => {});
}
// With FAKE_CLI_HOLD_STDOUT_MS, a child holds stdout open that long, so the close comes late even after SIGKILL.
if (process.env.FAKE_CLI_HOLD_STDOUT_MS) {
	const { spawn } = await import("node:child_process");
	const hold = `setTimeout(() => {}, ${Number(process.env.FAKE_CLI_HOLD_STDOUT_MS)})`;
	spawn(process.execPath, ["-e", hold], { stdio: ["ignore", "inherit", "ignore"] }).unref();
}

/**
 * An interrupt during a turn: each waiting permission request is withdrawn
 * (`control_cancel_request`, the shape the panel's cancel handling reads),
 * then the turn ends with an ordinary `result`. Outside a turn it changes
 * nothing.
 */
function interruptTurn() {
	if (!turnRunning) return;
	for (const request_id of pendingPermissions) {
		pendingOurs.delete(request_id);
		out({ type: "control_cancel_request", request_id });
	}
	pendingPermissions.clear();
	finish();
}

// A launch whose binary the shell cannot find (DES-002 Missing CLI): exit 127 before any init.
if (scenario === "exit127") {
	process.stderr.write("sh: 1: claude: not found\n");
	process.exit(127);
}

// Report our own argv so the test can assert on spawn flags.
probe("argv", { argv: process.argv.slice(2), pid: process.pid });
// And the file-checkpointing environment the client set (ADR-006).
probe("env", {
	checkpointing: process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING ?? null,
	disable: process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING ?? null,
});

/**
 * `rewind_files` replies by user-message id, for the "rewind" scenario: a
 * preview of three files, a real run that skips one, a checkpoint that is
 * gone, and replies of the wrong shape; and the turns this process ran
 * (`rewindTurn`), whose files it puts back.
 */
function rewindReply(id, dryRun) {
	const at = checkpoints.findIndex((checkpoint) => checkpoint.uuid === id);
	if (at >= 0) return rewindTurnFiles(at, dryRun);
	// A turn of an earlier process: its checkpoints went with it.
	if (id.startsWith("u-turn-")) return { canRewind: false, error: "No file checkpoint found for this message." };
	if (id === "u-ok")
		return dryRun
			? { canRewind: true, filesChanged: ["/vault/a.md", "/vault/b.md", "/elsewhere/c.txt"], insertions: 4, deletions: 2 }
			: { canRewind: true, filesChanged: ["/vault/a.md", "/vault/b.md"], insertions: 4, deletions: 1 };
	if (id === "u-gone") return { canRewind: false, error: "No file checkpoint found for this message." };
	if (id === "u-mixed") return { canRewind: true, filesChanged: ["/vault/a.md", 7, null] };
	if (id === "u-nolist") return { canRewind: true };
	if (id === "u-bad-count") return { canRewind: true, filesChanged: [], insertions: "3" };
	return { canRewind: "yes", filesChanged: "/vault/a.md" };
}

/**
 * Why the CLI asks, for the permission scenarios that set it (PRD-002.R9),
 * overriding the default Edit request where a scenario names its own tool: a
 * subagent's request an ask rule flagged, one an ask rule forced beside the
 * tool's own reason, a compound command with a safety check inside, a safety
 * check the classifier may approve, an MCP tool under an organization's ask
 * ceiling, fields of the wrong type, a tool name that is not a string, and
 * fields sent as null.
 */
const PERMISSION_REASONS = {
	"permission-flagged": {
		agent_id: "agent-7",
		decision_reason_type: "rule",
		decision_reason: "Matched ask rule Edit(note.md)",
		requires_user_interaction: true,
	},
	"permission-ask-rule": {
		decision_reason_type: "other",
		decision_reason: "Claude requested permissions to edit note.md",
		matched_ask_rule: { source: "userSettings", tool_name: "Edit", rule_content: "note.md" },
	},
	"permission-safety-check": {
		tool_name: "Bash",
		input: { command: "cd notes && rm -rf ~" },
		decision_reason_type: "subcommandResults",
		decision_reason: "Dangerous rm operation detected",
		classifier_approvable: false,
	},
	"permission-classifier-approvable": {
		tool_name: "Write",
		input: { file_path: ".claude/settings.json", content: "{}" },
		decision_reason_type: "safetyCheck",
		classifier_approvable: true,
	},
	"permission-org-ceiling": {
		tool_name: "mcp__tracker__delete_issue",
		input: { id: 7 },
		decision_reason_type: "other",
		decision_reason_code: "org_ask_ceiling",
	},
	"permission-bad-reason": {
		decision_reason_type: 7,
		decision_reason: ["rule"],
		decision_reason_code: 5,
		requires_user_interaction: "yes",
		classifier_approvable: "false",
		matched_ask_rule: ["Edit(note.md)"],
	},
	"permission-bad-tool-name": {
		tool_name: { name: "Bash" },
	},
	"permission-null-reason": {
		decision_reason_type: null,
		decision_reason_code: null,
		requires_user_interaction: null,
		classifier_approvable: null,
		matched_ask_rule: null,
	},
	"permission-unflagged": {
		decision_reason_type: "mode",
		requires_user_interaction: false,
	},
};

/**
 * The "rewind" scenario's turns, as Claude Code's file checkpoints keep them
 * (in memory, so a new process has none): each turn echoes its prompt with a
 * uuid, writes `Fake CLI note.md` in the working directory (the vault),
 * first put there as a note of the user's when missing, and creates
 * `Fake CLI new note.md` when missing, so the panel lists a changed and a new
 * file. Each turn's checkpoint holds every file's contents before the turn
 * wrote it.
 */
const checkpoints = [];
/** Turns run, so a uuid is never reused after a rewind drops checkpoints. */
let rewindTurns = 0;
const NOTE = "Fake CLI note.md";
const NEW_NOTE = "Fake CLI new note.md";
const { existsSync, readFileSync, rmSync, writeFileSync } = await import("node:fs");
const { join } = await import("node:path");
const readOrNull = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

async function rewindTurn(text) {
	if (!existsSync(join(process.cwd(), NOTE))) writeFileSync(join(process.cwd(), NOTE), "# Fake CLI note\n\nNo turns yet.\n");
	const turn = ++rewindTurns;
	const uuid = `u-turn-${turn}`;
	out({
		type: "user",
		uuid,
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "user", content: [{ type: "text", text }] },
	});
	const writes = [[join(process.cwd(), NOTE), `# Fake CLI note\n\nTurn ${turn}: ${text}\n`]];
	if (!existsSync(join(process.cwd(), NEW_NOTE))) writes.push([join(process.cwd(), NEW_NOTE), "Created by the fake CLI.\n"]);
	const ids = writes.map((_, at) => `toolu_rewind_${turn}_${at}`);
	out({
		type: "assistant",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: {
			role: "assistant",
			content: writes.map(([file_path, content], at) => ({
				type: "tool_use",
				id: ids[at],
				name: "Write",
				input: { file_path, content },
			})),
		},
	});
	// The panel reads each file before it is written, as it does while a card
	// waits; 2 s leave time to see what a running turn disables.
	await sleep(2000);
	if (!turnRunning) return;
	checkpoints.push({ uuid, files: new Map(writes.map(([file]) => [file, readOrNull(file)])) });
	for (const [file, content] of writes) writeFileSync(file, content);
	out({
		type: "user",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: {
			role: "user",
			content: ids.map((tool_use_id) => ({ type: "tool_result", tool_use_id, content: "The file has been written." })),
		},
	});
	out({
		type: "assistant",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "assistant", content: [{ type: "text", text: `echo: ${text}` }] },
	});
	finish();
}

/**
 * The "question" scenario: AskUserQuestion requests in the shape the panel's
 * form parses (`parseAskUserQuestions`), not captured from a real CLI: two
 * questions, one single-select and one multi-select with descriptions and
 * header chips, then, once answered, a single question; the turn ends with a
 * reply naming each answer, or "dismissed". A message containing "exit" makes
 * the process exit with code 3 a second after the first form appears.
 */
const TEMPLATE_QUESTIONS = [
	{
		question: "Where should the template live?",
		header: "Location",
		multiSelect: false,
		options: [
			{ label: "Templates/", description: "Beside your other templates" },
			{ label: "Journal/Templates/", description: "Offered only for journal notes" },
		],
	},
	{
		question: "Which sections should it include?",
		header: "Sections",
		multiSelect: true,
		options: [{ label: "Wins" }, { label: "Blockers" }, { label: "Next week's focus" }, { label: "Energy check-in" }],
	},
];
const NAME_QUESTION = [
	{
		question: "What should the template be called?",
		header: "Name",
		options: [{ label: "Weekly review" }, { label: "Week in review" }],
	},
];

async function questionTurn(text) {
	const askQuestions = (questions, tool_use_id) =>
		new Promise((resolve) =>
			ask({ subtype: "can_use_tool", tool_name: "AskUserQuestion", input: { questions }, tool_use_id }, resolve)
		);
	const first = askQuestions(TEMPLATE_QUESTIONS, "toolu_question_1");
	if (text.includes("exit")) {
		await sleep(1000);
		process.stderr.write("fake cli exited while a form waited\n");
		process.exit(3);
	}
	const replies = [await first];
	probe("question_answers", { response: replies[0].response });
	replies.push(await askQuestions(NAME_QUESTION, "toolu_question_2"));
	probe("question_answers", { response: replies[1].response });
	const said = replies.map(({ response }) =>
		response?.behavior === "allow" ? JSON.stringify(response.updatedInput?.answers ?? {}) : "dismissed"
	);
	out({
		type: "assistant",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "assistant", content: [{ type: "text", text: `answers: ${said.join(" then ")}` }] },
	});
	finish();
}

/**
 * The "turn" scenario: a streamed turn as `--include-partial-messages`
 * delivers it, shaped from the panel's parsing (`src/state/stream.ts`, before
 * it `src/view.ts`), not captured from a real CLI: the prompt echoed with a
 * uuid; a thinking block, then a Markdown reply, each as `stream_event`
 * deltas between `content_block_start` and `content_block_stop` and then an
 * `assistant` message with the whole block; a Read call with its result; a
 * second reply; and a `result` with the duration, the session's running
 * `total_cost_usd` and the turn's token usage. A message containing "error"
 * ends with an error result instead. An interrupt stops it between deltas.
 */
let streamedTurns = 0;
// A fork's totals start at its source's whole total, whatever the rewind (V7): FAKE_CLI_SOURCE_TOTAL.
let sessionCost = process.argv.includes("--fork-session") ? Number(process.env.FAKE_CLI_SOURCE_TOTAL ?? 0) : 0;

/**
 * A model response's usage as the CLI reports it: cache writes split by
 * lifetime, `cache_creation.ephemeral_1h_input_tokens` and
 * `ephemeral_5m_input_tokens` (E4). The main agent writes for one hour, a
 * subagent for five minutes; `FAKE_CLI_CACHE_TTL=5m` makes the main agent
 * write for five minutes too, as a login or setting can.
 */
function responseUsage(subagent = false) {
	const fiveMinutes = subagent || process.env.FAKE_CLI_CACHE_TTL === "5m";
	const written = subagent ? 300 : 2048;
	return {
		input_tokens: subagent ? 900 : 1200,
		output_tokens: subagent ? 120 : 340,
		cache_creation_input_tokens: written,
		cache_read_input_tokens: subagent ? 12_000 : 56_000,
		cache_creation: { ephemeral_5m_input_tokens: fiveMinutes ? written : 0, ephemeral_1h_input_tokens: fiveMinutes ? 0 : written },
	};
}

async function streamTurn(text) {
	const started = Date.now();
	const n = ++streamedTurns;
	const event = (inner) => out({ type: "stream_event", session_id: SESSION, parent_tool_use_id: null, event: inner });
	/** One model response streams between `message_start` and `message_stop`. */
	const responseStart = () => event({ type: "message_start", message: { role: "assistant", usage: responseUsage() } });
	const responseStop = () => event({ type: "message_stop" });
	const assistant = (content) =>
		out({ type: "assistant", session_id: SESSION, parent_tool_use_id: null, message: { role: "assistant", content, usage: responseUsage() } });
	out({
		type: "user",
		uuid: `u-stream-${n}`,
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "user", content: [{ type: "text", text }] },
	});
	/** One block streamed in pieces, `false` once an interrupt ended the turn. */
	async function streamBlock(index, type, pieces, ms) {
		event({ type: "content_block_start", index, content_block: type === "text" ? { type, text: "" } : { type, thinking: "" } });
		for (const piece of pieces) {
			await sleep(ms);
			if (!turnRunning) return false;
			const delta = type === "text" ? { type: "text_delta", text: piece } : { type: "thinking_delta", thinking: piece };
			event({ type: "content_block_delta", index, delta });
		}
		event({ type: "content_block_stop", index });
		return true;
	}
	const thinking = ["The user wants ", "a short answer. ", "I will read the note ", "first, then ", "summarize it."];
	responseStart();
	if (!(await streamBlock(0, "thinking", thinking, 250))) return;
	assistant([{ type: "thinking", thinking: thinking.join(""), signature: "fake" }]);
	const reply = [
		"## Reading the note\n\n",
		"Here is what I will do",
		" for: **",
		text.replace(/[*_`]/g, ""),
		"**\n\n",
		"- read the note\n",
		"- list what it links to\n\n",
		"| Step | Tool |\n",
		"| --- | --- |\n",
		"| 1 | Read |\n\n",
		"```js\nconst answer = 42;\n```",
	];
	if (!(await streamBlock(1, "text", reply, 120))) return;
	assistant([{ type: "text", text: reply.join("") }]);
	const id = `toolu_stream_${n}`;
	event({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id, name: "Read", input: {} } });
	event({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"file_path":"note.md"}' } });
	event({ type: "content_block_stop", index: 2 });
	assistant([{ type: "tool_use", id, name: "Read", input: { file_path: "note.md" } }]);
	responseStop();
	await sleep(300);
	if (!turnRunning) return;
	out({
		type: "user",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "1\t# Note\n2\tSome text." }] },
	});
	responseStart();
	if (!(await streamBlock(3, "text", ["Done: ", "the note has ", "one heading."], 120))) return;
	assistant([{ type: "text", text: "Done: the note has one heading." }]);
	responseStop();
	sessionCost += 0.0123;
	const usage = responseUsage();
	const figures = { duration_ms: Date.now() - started, total_cost_usd: sessionCost, usage };
	if (/error/i.test(text))
		finish({ ...figures, subtype: "error_during_execution", is_error: true, result: "API Error: Overloaded (the fake CLI's error turn)" });
	else finish(figures);
}

/**
 * The "steps" scenario: tool calls, an edit, subagents and background tasks
 * in the shapes the panel's parsing reads (`src/state/stream.ts`, before it
 * `src/view.ts`), not captured from a real CLI. A turn: text; a Glob, a
 * Grep, an `obsidian_search` and a Read that fails, one group; text; an Edit
 * of `Fake CLI steps note.md` in the vault (put there first when missing)
 * that really changes it; a Task whose subagent replies, searches and reads
 * in its thread; a background Task (`run_in_background`) and a background
 * Bash, each a background task; text; the result. The background agent
 * keeps writing to its thread for a few seconds after the result, then
 * reports its totals (`task_notification`); the background shell ends after
 * 12 s; `stop_task` ends either at once with status "stopped".
 */
const STEPS_NOTE = "Fake CLI steps note.md";
let stepsTurns = 0;
/** Background tasks running, by task id: their call's id and how to end them. */
const backgroundTasks = new Map();

function backgroundTasksChanged() {
	out({
		type: "system",
		subtype: "background_tasks_changed",
		session_id: SESSION,
		tasks: [...backgroundTasks.values()].map(({ taskId, description, taskType }) => ({ task_id: taskId, description, task_type: taskType })),
	});
}

/** A background task ends: its notification, with the agent's totals for an agent, and the running list. */
function endBackgroundTask(taskId, status) {
	const task = backgroundTasks.get(taskId);
	if (!task) return;
	backgroundTasks.delete(taskId);
	clearTimeout(task.timer);
	out({
		type: "system",
		subtype: "task_notification",
		session_id: SESSION,
		task_id: taskId,
		tool_use_id: task.toolUseId,
		status,
		usage: { total_tokens: 4321, tool_uses: task.tools ?? 0, duration_ms: Date.now() - task.started },
	});
	backgroundTasksChanged();
}

function stopBackgroundTask(taskId) {
	endBackgroundTask(taskId, "stopped");
}

/**
 * A `stop_task` request, by FAKE_CLI_STOP. The reply is always `{}` (V4); the
 * task's own report is, for "silent", none (a stop with no events), for
 * "unknown", a `task_updated` status the panel does not know, for "updated",
 * a `task_updated` "killed", for "spawn", the stop plus a new background shell
 * (a task started mid-stop), and by default a `task_notification` "stopped".
 */
function stopTaskAs(taskId) {
	const mode = process.env.FAKE_CLI_STOP;
	if (mode === "silent") return;
	if (mode === "unknown") {
		out({ type: "system", subtype: "task_updated", session_id: SESSION, task_id: taskId, patch: { status: "paused" } });
		return;
	}
	if (mode === "updated") {
		const task = backgroundTasks.get(taskId);
		if (task) {
			backgroundTasks.delete(taskId);
			clearTimeout(task.timer);
		}
		out({ type: "system", subtype: "task_updated", session_id: SESSION, task_id: taskId, patch: { status: "killed" } });
		backgroundTasksChanged();
		return;
	}
	stopBackgroundTask(taskId);
	if (mode === "spawn" && !backgroundTasks.has("task-late")) {
		const late = { taskId: "task-late", toolUseId: "toolu_late", description: "Late task", taskType: "local_bash", started: Date.now() };
		late.timer = setTimeout(() => endBackgroundTask(late.taskId, "completed"), 12_000);
		backgroundTasks.set(late.taskId, late);
		out({ type: "system", subtype: "task_started", session_id: SESSION, task_id: late.taskId, description: late.description, task_type: "local_bash" });
		backgroundTasksChanged();
	}
}

async function stepsTurn(text) {
	const n = ++stepsTurns;
	const assistant = (content, parent = null) =>
		out({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: parent,
			message: {
				role: "assistant",
				content,
				...(parent ? { model: "claude-haiku-4-5-20251001", usage: responseUsage(true) } : { usage: responseUsage() }),
			},
		});
	const results = (blocks, parent = null) =>
		out({ type: "user", session_id: SESSION, parent_tool_use_id: parent, message: { role: "user", content: blocks } });
	const call = (id, name, input, parent = null) => assistant([{ type: "tool_use", id, name, input }], parent);
	const result = (id, content, parent = null, is_error = false) =>
		results([{ type: "tool_result", tool_use_id: id, content, ...(is_error ? { is_error } : {}) }], parent);
	const pause = async (ms) => {
		await sleep(ms);
		return turnRunning;
	};
	out({ type: "user", uuid: `u-steps-${n}`, session_id: SESSION, parent_tool_use_id: null, message: { role: "user", content: [{ type: "text", text }] } });
	assistant([{ type: "text", text: "Looking through the vault first." }]);
	const id = (name) => `toolu_steps_${n}_${name}`;
	call(id("glob"), "Glob", { pattern: "**/*.md" });
	if (!(await pause(400))) return;
	result(id("glob"), "Notes/a.md\nNotes/b.md\nNotes/c.md");
	call(id("grep"), "Grep", { pattern: "TODO", output_mode: "files_with_matches" });
	if (!(await pause(400))) return;
	result(id("grep"), "Found 2 files\nNotes/a.md\nNotes/b.md");
	call(id("search"), "mcp__obsidian__obsidian_search", { query: "tag:project" });
	if (!(await pause(300))) return;
	result(id("search"), [{ type: "text", text: "4 note(s) matched `tag:project`.\n\n- Notes/a.md\n- Notes/b.md" }]);
	call(id("read"), "Read", { file_path: "Notes/missing.md" });
	if (!(await pause(300))) return;
	result(id("read"), "File does not exist.", null, true);
	assistant([{ type: "text", text: "Updating the note." }]);
	const notePath = join(process.cwd(), STEPS_NOTE);
	if (!existsSync(notePath)) writeFileSync(notePath, "# Steps note\n\n- [ ] first\n- [ ] second\n");
	const before = readFileSync(notePath, "utf8");
	call(id("edit"), "Edit", { file_path: notePath, old_string: before.split("\n")[0], new_string: `# Steps note, turn ${n}\nEdited by the fake CLI.` });
	// The panel reads the file before it is written, as it does while a card waits.
	if (!(await pause(800))) return;
	writeFileSync(notePath, before.replace(before.split("\n")[0], `# Steps note, turn ${n}\nEdited by the fake CLI.`));
	result(id("edit"), `The file ${notePath} has been updated.`);
	// A subagent: its messages name the Task call as their parent.
	const task = id("task");
	call(task, "Task", { description: "Survey the project notes", subagent_type: "Explore", prompt: "List the project notes." });
	results([{ type: "text", text: "List the project notes." }], task);
	if (!(await pause(300))) return;
	assistant([{ type: "text", text: "I will list the project notes, then read one." }], task);
	call(`${task}_glob`, "Glob", { pattern: "Projects/*.md" }, task);
	if (!(await pause(300))) return;
	result(`${task}_glob`, "Projects/Website.md\nProjects/Hiring.md", task);
	call(`${task}_read`, "Read", { file_path: "Projects/Website.md" }, task);
	if (!(await pause(300))) return;
	result(`${task}_read`, "# Website\nLaunch on Oct 21.", task);
	assistant([{ type: "text", text: "Two project notes; **Website** launches on Oct 21." }], task);
	result(task, [{ type: "text", text: "Two project notes; Website launches on Oct 21." }]);
	// A background agent and a background shell, each a background task.
	const agent = id("bg_agent");
	call(agent, "Task", { description: "Watch the inbox", subagent_type: "general-purpose", prompt: "Watch Inbox/.", run_in_background: true });
	const agentTask = { taskId: `task-agent-${n}`, toolUseId: agent, description: "Watch the inbox", taskType: "local_agent", started: Date.now(), tools: 0 };
	backgroundTasks.set(agentTask.taskId, agentTask);
	out({ type: "system", subtype: "task_started", session_id: SESSION, task_id: agentTask.taskId, tool_use_id: agent, description: agentTask.description, task_type: "local_agent" });
	backgroundTasksChanged();
	result(agent, "Async agent launched successfully.");
	const shell = id("bg_shell");
	call(shell, "Bash", { command: "sleep 12", run_in_background: true });
	const shellTask = { taskId: `task-shell-${n}`, toolUseId: shell, description: "sleep 12", taskType: "local_bash", started: Date.now() };
	backgroundTasks.set(shellTask.taskId, shellTask);
	out({ type: "system", subtype: "task_started", session_id: SESSION, task_id: shellTask.taskId, tool_use_id: shell, description: shellTask.description, task_type: "local_bash" });
	backgroundTasksChanged();
	result(shell, `Command running in background with ID: ${shellTask.taskId}`);
	shellTask.timer = setTimeout(() => endBackgroundTask(shellTask.taskId, "completed"), 12_000);
	assistant([{ type: "text", text: "Done. A background agent keeps watching the inbox." }]);
	finish({ duration_ms: 4000, total_cost_usd: 0.004 * n });
	// The background agent goes on after the turn, until it ends or is stopped.
	for (let step = 1; step <= 3; step++) {
		await sleep(1000);
		if (!backgroundTasks.has(agentTask.taskId)) return;
		agentTask.tools++;
		call(`${agent}_${step}`, "Glob", { pattern: `Inbox/${step}/*.md` }, agent);
		await sleep(300);
		result(`${agent}_${step}`, `Inbox/${step}/new.md`, agent);
	}
	if (!backgroundTasks.has(agentTask.taskId)) return;
	assistant([{ type: "text", text: "The inbox has three new notes." }], agent);
	endBackgroundTask(agentTask.taskId, "completed");
}

/** Every file written from turn `at` on, back to its contents before that turn; a dry run lists them. */
function rewindTurnFiles(at, dryRun) {
	const before = new Map();
	for (const checkpoint of checkpoints.slice(at))
		for (const [file, content] of checkpoint.files) if (!before.has(file)) before.set(file, content);
	const lines = (text) => (text === null ? [] : text.split("\n").filter(Boolean));
	let insertions = 0;
	let deletions = 0;
	for (const [file, content] of before) {
		const now = lines(readOrNull(file));
		const then = lines(content);
		deletions += now.filter((line) => !then.includes(line)).length;
		insertions += then.filter((line) => !now.includes(line)).length;
	}
	const filesChanged = [...before.keys()];
	if (dryRun) return { canRewind: true, filesChanged, insertions, deletions };
	for (const [file, content] of before) {
		if (content === null) rmSync(file, { force: true });
		else writeFileSync(file, content);
	}
	checkpoints.splice(at);
	return { canRewind: true, filesChanged, insertions, deletions };
}

/**
 * The user prompts of the session this process resumed or forked, oldest
 * first (`FAKE_CLI_SOURCE_PROMPTS`, comma-separated), for `rewind_conversation`;
 * a process that resumed nothing has none.
 */
let sourcePrompts = (
	process.env.FAKE_CLI_SOURCE_PROMPTS ?? (process.argv.includes("--resume") ? "00000000-0000-4000-8000-000000000001,00000000-0000-4000-8000-000000000002,00000000-0000-4000-8000-000000000003" : "")
)
	.split(",")
	.filter(Boolean);

/**
 * A `rewind_conversation` reply shaped as Claude Code 2.1.296's
 * (docs/records/verification/2026-10-13-real-cli-clear-undo.md V10): a target
 * that later prompts follow is refused unless `last_seen_user_message_uuid`
 * names the latest prompt (`stale_target` without one, `unseen_later_turn`
 * with another); otherwise the history is cut before the target.
 * `FAKE_CLI_REWIND_EXIT` (an exit code, or `kill`) ends the process instead
 * when the request names `00000000-0000-4000-8000-000000000004` as last seen.
 */
function rewindConversationReply(request) {
	const target = request.target_message_uuid;
	const lastSeen = request.last_seen_user_message_uuid;
	const exit = process.env.FAKE_CLI_REWIND_EXIT;
	if (exit && lastSeen === "00000000-0000-4000-8000-000000000004") {
		if (exit === "kill") process.kill(process.pid, "SIGKILL");
		else process.exit(Number(exit));
	}
	const at = sourcePrompts.indexOf(target);
	const refused = (error, reason) => ({ rewound: false, prefillText: null, precedingAssistantUuid: null, error, reason });
	if (at < 0) return refused("target not found", "target_not_found");
	if (at < sourcePrompts.length - 1 && lastSeen !== sourcePrompts.at(-1))
		return lastSeen === undefined ? refused("stale target", "stale_target") : refused("unseen later turn", "unseen_later_turn");
	sourcePrompts = sourcePrompts.slice(0, at);
	probe("rewound", { target, pid: process.pid });
	return { rewound: true, targetMessageUuid: target, prefillText: `Prompt ${target}`, precedingAssistantUuid: null };
}

/**
 * FAKE_CLI_UNKNOWN_SESSION: a `--resume` of an id the CLI does not hold fails at
 * once, as the real one does (V1): the reason on stderr, an error `result`, exit
 * code 1; `initialize` is never answered.
 */
const unknownSession = !!process.env.FAKE_CLI_UNKNOWN_SESSION && process.argv.includes("--resume");
if (unknownSession) {
	const id = process.argv[process.argv.indexOf("--resume") + 1];
	const reason = `No conversation found with session ID: ${id}`;
	process.stderr.write(`${reason}\n`);
	setTimeout(() => out({ type: "result", subtype: "error_during_execution", is_error: true, num_turns: 0, errors: [reason] }), 20);
	setTimeout(() => process.exit(1), 60);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buf += chunk;
	const parts = buf.split("\n");
	buf = parts.pop() ?? "";
	for (const part of parts) {
		const line = part.trim();
		if (!line) continue;
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			probe("unparsable_stdin", { line: line.slice(0, 120) });
			continue;
		}
		handle(msg);
	}
});

function handle(msg) {
	// A process that failed to resume answers nothing (FAKE_CLI_UNKNOWN_SESSION).
	if (unknownSession) return;
	if (msg.type === "control_response") {
		const reply = pendingOurs.get(msg.response.request_id);
		pendingOurs.delete(msg.response.request_id);
		pendingPermissions.delete(msg.response.request_id);
		probe("got_control_response", { response: msg.response });
		if (reply) reply(msg.response);
		return;
	}

	if (msg.type === "control_request") {
		const sub = msg.request.subtype;
		// Reported as `sub`, not `subtype`: the probe envelope already uses
		// `subtype` and would be overwritten.
		probe("got_control_request", { sub, request: msg.request, pid: process.pid });
		if (sub === "initialize") {
			// FAKE_CLI_INIT_DELAY_MS answers late, as a process a restart stopped may.
			// "handshake-mode" reports the mode the CLI runs, as a CLI launched with no mode flag does.
			const reported = scenario === "handshake-mode" ? { current_permission_mode: "plan" } : {};
			const answer = () => ok(msg.request_id, { ready: true, pid: process.pid, commands: COMMANDS, ...reported });
			if (process.env.FAKE_CLI_INIT_DELAY_MS) setTimeout(answer, Number(process.env.FAKE_CLI_INIT_DELAY_MS));
			else answer();
			// A background subagent's prompt and vault-tool call, with no turn running;
			// with FAKE_CLI_DUPLICATE_PROMPT, a second prompt under the first one's id.
			if (scenario === "background-permission") {
				const first = ask({ subtype: "can_use_tool", tool_name: "Edit", input: { file_path: "note.md" }, agent_id: "agent-bg" }, () => {});
				if (process.env.FAKE_CLI_DUPLICATE_PROMPT)
					out({ type: "control_request", request_id: first, request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } } });
				ask({ subtype: "mcp_message", server_name: "obsidian", message: { jsonrpc: "2.0", id: 1, method: "tools/list" } }, () => {});
			}
			return;
		}
		if (sub === "set_permission_mode" && (process.env.FAKE_CLI_MODE_DELAY_MS || process.env.FAKE_CLI_REFUSE_MODE)) {
			// A slow mode switch, answered in order, refusing one mode if told to,
			// for the superseded-switch tests.
			const answer = () =>
				msg.request.mode === process.env.FAKE_CLI_REFUSE_MODE
					? out({
							type: "control_response",
							response: { subtype: "error", request_id: msg.request_id, error: `Refused mode ${msg.request.mode}` },
						})
					: ok(msg.request_id, {});
			setTimeout(answer, Number(process.env.FAKE_CLI_MODE_DELAY_MS ?? 0));
			return;
		}
		if (scenario === "bare-error" && sub !== "initialize") {
			// A refusal with no usable reason: none at all, or one that is not text.
			out({
				type: "control_response",
				response: { subtype: "error", request_id: msg.request_id, ...(sub === "set_model" ? { error: 7 } : {}) },
			});
			return;
		}
		if (sub === "set_model" && msg.request.model === process.env.FAKE_CLI_REFUSE_MODEL) {
			// A model the account lacks: refused, so the panel must not keep it.
			out({
				type: "control_response",
				response: { subtype: "error", request_id: msg.request_id, error: `Refused model ${msg.request.model}` },
			});
			return;
		}
		if (sub === "interrupt") {
			ok(msg.request_id, {});
			interruptTurn();
			return;
		}
		if (sub === "set_model") replayModelChange(msg.request.model);
		if (sub === "set_permission_mode" && typeof msg.request.mode === "string") currentMode = msg.request.mode;
		if (sub === "set_permission_mode" || sub === "set_model" || sub === "stop_task") {
			ok(msg.request_id, {});
			if (sub === "stop_task") stopTaskAs(msg.request.task_id);
			return;
		}
		if (sub === "rewind_conversation") {
			ok(msg.request_id, rewindConversationReply(msg.request));
			return;
		}
		if (sub === "rewind_files" && scenario === "rewind") {
			ok(msg.request_id, rewindReply(msg.request.user_message_id, msg.request.dry_run === true));
			return;
		}
		if (sub === "get_usage" || sub === "get_context_usage") {
			// FAKE_CLI_USAGE, for the context report of a process that resumed a session and ran no turn (an Undo, V1):
			// `silent` never answers, `exit` ends the process, `bare` answers without the categories.
			if (sub === "get_context_usage" && process.env.FAKE_CLI_USAGE === "silent") return;
			if (sub === "get_context_usage" && process.env.FAKE_CLI_USAGE === "exit") process.exit(1);
			if (sub === "get_context_usage" && process.env.FAKE_CLI_USAGE === "bare") {
				ok(msg.request_id, { totalTokens: 5, maxTokens: 200_000 });
				return;
			}
			// FAKE_CLI_REFUSE_USAGE refuses both, as a CLI without them or an outage would.
			// A process that resumed a session reports it before any turn (V1); a fork's first report waits for a turn.
			const resumed = process.argv.includes("--resume") && !process.argv.includes("--fork-session");
			const refusal = process.env.FAKE_CLI_REFUSE_USAGE
				? `Refused ${sub}`
				: sub === "get_context_usage" && finishedTurns === 0 && !resumed
					? "no turn received yet"
					: null;
			if (refusal)
				out({ type: "control_response", response: { subtype: "error", request_id: msg.request_id, error: refusal } });
			else ok(msg.request_id, sub === "get_usage" ? usageReply() : contextReply());
			return;
		}
		if (Object.hasOwn(REPORTS, sub) || sub === "mcp_toggle" || sub === "mcp_reconnect") {
			// FAKE_CLI_REFUSE_REPORTS refuses them all, as an outage or an older CLI would.
			const refuse = (error) =>
				out({ type: "control_response", response: { subtype: "error", request_id: msg.request_id, error } });
			if (process.env.FAKE_CLI_REFUSE_REPORTS) refuse(`Refused ${sub}`);
			else {
				try {
					ok(msg.request_id, Object.hasOwn(REPORTS, sub) ? REPORTS[sub]() : mcpAction(msg.request));
				} catch (err) {
					refuse(err.message);
				}
			}
			return;
		}
		if (sub === "mcp_message") {
			// Echo the JSON-RPC id back so the test can prove routing works.
			ok(msg.request_id, { echoed: msg.request.message?.id ?? null });
			return;
		}
		out({
			type: "control_response",
			response: {
				subtype: "error",
				request_id: msg.request_id,
				error: `Unsupported control request subtype: ${sub}`,
			},
		});
		return;
	}

	if (msg.type !== "user") return;
	const text = (msg.message?.content ?? [])
		.map((b) => (b.type === "text" ? b.text : `<${b.type}>`))
		.join("");
	probe("got_user_turn", { text, session_id: msg.session_id, pid: process.pid, queued: turnRunning });
	if (turnRunning) queuedTurns.push(text);
	else begin(text);
}

/** A written `/clear` is the CLI's own command; any other text is a turn. */
function begin(text) {
	if (text.trim() === "/clear") void runClear();
	else void runTurn(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `/clear` as the real CLI answers it (docs/records/verification/2026-10-13-real-cli-clear-undo.md):
 * `conversation_reset` (trigger "clear", the old session, the new conversation
 * id), `system/init` with the new session id, and a `result` with no turns and
 * no cost, 20 ms apart; the init reports the runtime model and permission
 * mode; no replay and no `system/status`. A `/clear`
 * written mid-turn waits for the turn's result (`queuedTurns`).
 * FAKE_CLI_CLEAR: `silent` answers nothing; `no-init` sends the reset and the
 * result; `no-result` stops after the init; `exit` exits on the write;
 * `self-turn` runs a turn of its own first; `same-id` reports the old id.
 * FAKE_CLI_CLEAR_RESETS (`mode`, `model`, or both with a comma): the new
 * session reports the default mode, the default model, instead of the picks.
 */
async function runClear() {
	const mode = process.env.FAKE_CLI_CLEAR ?? "";
	if (mode === "silent") return;
	if (mode === "exit") process.exit(1);
	if (mode === "self-turn") {
		out({ type: "system", subtype: "init", session_id: SESSION, cwd: process.cwd(), model: currentModel, tools: [], permissionMode: currentMode });
		out({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", content: [{ type: "text", text: "A background task finished." }] },
		});
		out({ type: "result", subtype: "success", is_error: false, session_id: SESSION, duration_ms: 1, total_cost_usd: 0.001 });
	}
	const old = SESSION;
	const next = mode === "same-id" ? old : sessionOf(sessionNumber + 1);
	out({ type: "conversation_reset", trigger: "clear", session_id: old, new_conversation_id: next });
	await sleep(20);
	if (mode !== "no-init") {
		sessionNumber += mode === "same-id" ? 0 : 1;
		SESSION = next;
		sessionCost = 0;
		// A CLI that does not keep the picks: the new session runs the launch defaults.
		const resets = (process.env.FAKE_CLI_CLEAR_RESETS ?? "").split(",");
		if (resets.includes("mode")) currentMode = "default";
		if (resets.includes("model")) currentModel = DEFAULT_MODEL;
		out({
			type: "system",
			subtype: "init",
			session_id: SESSION,
			cwd: process.cwd(),
			model: currentModel,
			tools: ["Read", "Edit"],
			permissionMode: currentMode,
		});
	}
	if (mode === "no-result") return;
	await sleep(20);
	out({
		type: "result",
		subtype: "success",
		is_error: false,
		session_id: SESSION,
		duration_ms: 0,
		num_turns: 0,
		total_cost_usd: 0,
	});
}

async function runTurn(text) {
	turnRunning = true;
	// FAKE_CLI_NO_INIT: the turn ends with a result and no init, as Claude Code's empty /compact does.
	if (!process.env.FAKE_CLI_NO_INIT)
		out({
			type: "system",
			subtype: "init",
			session_id: SESSION,
			cwd: process.cwd(),
			model: currentModel,
			permissionMode: currentMode,
			tools: ["Read", "Edit"],
		});

	if (scenario === "chunked") {
		// One long JSON object written in pieces, with a chunk boundary in the
		// middle of a multi-byte-free but syntactically incomplete position, plus
		// two objects sharing a single write. Framing must survive both.
		const long = {
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", content: [{ type: "text", text: "x".repeat(5000) }] },
		};
		const line = JSON.stringify(long) + "\n";
		process.stdout.write(line.slice(0, 17));
		await sleep(5);
		process.stdout.write(line.slice(17, 4000));
		await sleep(5);
		process.stdout.write(line.slice(4000));
		const a = JSON.stringify({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", content: [{ type: "text", text: "first" }] },
		});
		const b = JSON.stringify({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", content: [{ type: "text", text: "second" }] },
		});
		// Two complete objects and a partial third in one write.
		process.stdout.write(`${a}\n${b}\nnot json yet`);
		await sleep(5);
		process.stdout.write("\n");
		finish();
		return;
	}

	if (scenario === "noise") {
		const assistant = (text) => ({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", content: [{ type: "text", text }] },
		});
		// Noise first, then two real messages with noise between them, then the
		// result: all in one write, so one chunk holds noise before real lines.
		burst(assistant("before"), assistant("after"));
		finish();
		return;
	}

	if (scenario === "bigline") {
		// One 3 MB line in three writes with gaps, then a short message.
		const assistant = (text) =>
			JSON.stringify({
				type: "assistant",
				session_id: SESSION,
				parent_tool_use_id: null,
				message: { role: "assistant", content: [{ type: "text", text }] },
			}) + "\n";
		const big = assistant("x".repeat(3_000_000));
		const third = Math.ceil(big.length / 3);
		for (let at = 0; at < big.length; at += third) {
			process.stdout.write(big.slice(at, at + third));
			await sleep(5);
		}
		process.stdout.write(assistant("after"));
		finish();
		return;
	}

	if (scenario === "permission" || scenario in PERMISSION_REASONS) {
		const request = {
			subtype: "can_use_tool",
			tool_name: "Edit",
			input: { file_path: "note.md", old_string: "a", new_string: "b" },
			permission_suggestions: [{ type: "addRules" }],
			tool_use_id: "toolu_fake",
			...PERMISSION_REASONS[scenario],
		};
		// The main agent's call comes first as a tool_use and ends in a
		// tool_result, as the panel's step rows read them (not captured); a
		// subagent's request, or a tool name that is not text, comes alone.
		const call = typeof request.tool_name === "string" && !request.agent_id;
		if (call)
			out({
				type: "assistant",
				session_id: SESSION,
				parent_tool_use_id: null,
				message: { role: "assistant", content: [{ type: "tool_use", id: request.tool_use_id, name: request.tool_name, input: request.input }] },
			});
		ask(request, (response) => {
			probe("permission_decision", { response: response.response });
			const decision = response.response;
			if (call)
				out({
					type: "user",
					session_id: SESSION,
					parent_tool_use_id: null,
					message: {
						role: "user",
						content: [
							decision?.behavior === "allow"
								? { type: "tool_result", tool_use_id: request.tool_use_id, content: "The fake CLI changed nothing." }
								: { type: "tool_result", tool_use_id: request.tool_use_id, content: decision?.message ?? "Denied", is_error: true },
						],
					},
				});
			finish();
		});
		return;
	}

	if (scenario === "cancel") {
		const id = ask({ subtype: "can_use_tool", tool_name: "Edit", input: {} }, (response) => {
			// Must never happen: the client should stay silent after a cancel.
			probe("unexpected_response_after_cancel", { response });
		});
		await sleep(30);
		out({ type: "control_cancel_request", request_id: id });
		await sleep(300);
		probe("cancel_window_closed");
		finish();
		return;
	}

	if (scenario === "mcp") {
		// Drive the client the way the real CLI drives an in-process MCP server:
		// a request, then a notification, then another request.
		ask(
			{
				subtype: "mcp_message",
				server_name: "obsidian",
				message: {
					method: "initialize",
					params: { protocolVersion: "2025-11-25", capabilities: {} },
					jsonrpc: "2.0",
					id: 0,
				},
			},
			(response) => {
				probe("mcp_reply", { label: "initialize", response: response.response });
				ask(
					{
						subtype: "mcp_message",
						server_name: "obsidian",
						message: { method: "notifications/initialized", jsonrpc: "2.0" },
					},
					(notified) => {
						probe("mcp_reply", { label: "notification", response: notified.response });
						ask(
							{
								subtype: "mcp_message",
								server_name: "nope",
								message: { method: "tools/list", jsonrpc: "2.0", id: 1 },
							},
							(wrong) => {
								probe("mcp_reply", { label: "wrong_server", response: wrong });
								finish();
							}
						);
					}
				);
			}
		);
		return;
	}

	if (scenario === "unsupported") {
		ask({ subtype: "hook_callback", callback_id: "x" }, (response) => {
			probe("unsupported_reply", { response });
			finish();
		});
		return;
	}

	if (scenario === "question") {
		await questionTurn(text);
		return;
	}

	if (scenario === "crash") {
		process.stderr.write("fake cli exploded\nsecond stderr line\n");
		process.exit(3);
	}

	if (scenario === "rewind") {
		await rewindTurn(text);
		return;
	}

	if (scenario === "turn") {
		await streamTurn(text);
		return;
	}

	if (scenario === "steps") {
		await stepsTurn(text);
		return;
	}

	if (scenario.startsWith("compact-")) {
		await compactTurn(text);
		return;
	}

	out({
		type: "assistant",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "assistant", content: [{ type: "text", text: `echo: ${text}` }] },
	});
	finish();
}

/**
 * The compaction scenarios, in the order and shapes the real CLI wrote
 * (docs/records/verification: E3 for `compact-auto`, V5 for the others):
 * `compact-auto` compacts on its own inside the turn, before the model
 * request, then answers; the CLI replays the prompt between the status and the
 * boundary; `compact-manual` compacts on `/compact`, `system/init` before the
 * boundary and the command's stdout last; `compact-failed` fails the
 * compaction, then `system/init` and the notice "Compaction canceled.";
 * `compact-empty` has nothing to compact and sends only its notice. The
 * notices are `<synthetic>` assistant messages.
 */
async function compactTurn(text) {
	const status = (fields) => out({ type: "system", subtype: "status", session_id: SESSION, ...fields });
	const boundary = (trigger, pre, post) =>
		out({
			type: "system",
			subtype: "compact_boundary",
			session_id: SESSION,
			compact_metadata: { trigger, pre_tokens: pre, post_tokens: post, duration_ms: 20 },
		});
	const user = (content, extra = {}) =>
		out({ type: "user", session_id: SESSION, parent_tool_use_id: null, message: { role: "user", content }, ...extra });
	const summary = (content) => user(content, { isSynthetic: true });
	const init = () =>
		out({ type: "system", subtype: "init", session_id: SESSION, cwd: process.cwd(), tools: [], model: "fake", permissionMode: "default" });
	const notice = (content) =>
		out({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", model: "<synthetic>", content: [{ type: "text", text: content }] },
		});
	if (scenario === "compact-auto") {
		status({ status: "requesting" });
		status({ status: "compacting", compact_output_chars: 0 });
		await sleep(30);
		status({ status: null, compact_result: "success" });
		user([{ type: "text", text }], { uuid: "replay-1" });
		boundary("auto", 131000, 18000);
		summary("This session is being continued from a previous conversation.\n\nSummary:\n- The plan\n- The open questions");
		out({
			type: "assistant",
			session_id: SESSION,
			parent_tool_use_id: null,
			message: { role: "assistant", content: [{ type: "text", text: `Done: ${text}` }] },
		});
	} else if (scenario === "compact-manual") {
		status({ status: "compacting", compact_output_chars: 0 });
		await sleep(30);
		status({ status: null, compact_result: "success" });
		init();
		boundary("manual", 30423, 3973);
		summary("This session is being continued from a previous conversation.\n\nSummary:\n- The plan");
		user("<local-command-stdout>Compacted </local-command-stdout>", { uuid: "u-local-compact", isReplay: true });
	} else if (scenario === "compact-failed") {
		status({ status: "compacting", compact_output_chars: 0 });
		await sleep(30);
		status({ status: null, compact_result: "failed", compact_error: "API Error: Request was aborted." });
		init();
		notice("Compaction canceled.");
	} else {
		notice("Error: No messages to compact");
	}
	finish();
}

/** A turn's `result`; `fields` replace the defaults (the "turn" scenario's figures, an error). */
function finish(fields = {}) {
	turnRunning = false;
	finishedTurns++;
	out({
		type: "result",
		subtype: "success",
		is_error: false,
		session_id: SESSION,
		duration_ms: 1,
		total_cost_usd: 0.001,
		...fields,
	});
	const next = queuedTurns.shift();
	if (next !== undefined) begin(next);
}
