import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const { ClaudeClient, cliSpawnSpec } = await import("./.build/protocol/client.mjs");
const { permissionDecision } = await import("./.build/settings-core.mjs");
const { reduceStream, STREAM_IDLE } = await import("./.build/state/stream.mjs");
const { EMPTY_MODEL, nextTasks } = await import("./.build/state/tab.mjs");
const { addBlock, addUserMessage, closeTurn, EMPTY_FOOTER } = await import("./.build/state/turn.mjs");
const { addAgentMessage, addToolResults, addToolUse, closeGroup, reportAgent, settleTurnCalls } = await import("./.build/state/step-groups.mjs");
const { cacheAfter, cacheIdle, cacheView, emptyCache } = await import("./.build/state/prompt-cache.mjs");
const { PermissionFlow } = await import("./.build/tab/permission-flow.mjs");
const reports = await import("./.build/commands.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = path.join(here, "fake-cli.mjs");

/**
 * Drive a ClaudeClient against the fake CLI and collect everything it saw.
 * Resolves when the process closes, so every assertion runs on a complete
 * transcript rather than racing the stream.
 */
function run({
	scenario = "basic",
	send = "hello",
	onPermission,
	mcpHandler,
	options = {},
}) {
	return new Promise((resolve, reject) => {
		const messages = [];
		const cancelled = [];
		let timer;
		let watch;
		const stopTimers = () => {
			clearTimeout(timer);
			clearInterval(watch);
		};

		const client = new ClaudeClient(
			{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: scenario }, ...options },
			{
				onStreamMessage: (msg) => messages.push(msg),
				onPermissionRequest:
					onPermission ??
					(async (req) => ({ behavior: "allow", updatedInput: req.input })),
				// null means "wire no handler at all", which is a distinct case.
				onMcpMessage: mcpHandler === null ? undefined : mcpHandler,
				onPermissionCancelled: (id) => cancelled.push(id),
				onClose: (close) => {
					stopTimers();
					resolve({ messages, cancelled, close, client });
				},
			}
		);

		timer = setTimeout(() => {
			stopTimers();
			client.stop();
			reject(new Error(`scenario ${scenario} timed out`));
		}, 15000);
		// Shut the process down once its turn has produced a result.
		watch = setInterval(() => {
			if (messages.some((m) => m.type === "result")) client.stop();
		}, 20);

		client.start();
		if (send !== null) client.sendUserMessage(send, "sess");
	});
}

const probes = (messages, what) =>
	messages.filter((m) => m.subtype === "probe" && m.what === what);

test("spawn flags carry the documented stream-JSON interface", async () => {
	const { messages } = await run({ scenario: "basic" });
	const [argv] = probes(messages, "argv");
	assert.ok(argv, "fake CLI should report its argv");
	const flags = argv.argv;
	assert.deepEqual(flags.slice(0, 8), [
		"--output-format",
		"stream-json",
		"--input-format",
		"stream-json",
		"--verbose",
		"--include-partial-messages",
		"--permission-prompt-tool",
		"stdio",
	]);
});

test("PRD-003.R4: a resume id that is no lowercase UUID never reaches the command line", async () => {
	for (const bad of ["--dangerously-skip-permissions", "../../x", "", "ABCDEF01-0000-4000-8000-000000000001", "abc"]) {
		const client = new ClaudeClient({ cliPath: FAKE_CLI, cwd: here, resumeSessionId: bad, forkSession: true }, { onStreamMessage() {}, onPermissionRequest: async () => ({ behavior: "deny", message: "" }), onClose() {} });
		assert.throws(() => client.start(), /not a lowercase UUID/, JSON.stringify(bad));
		assert.equal(client.running, false);
	}
});

test("optional spawn flags appear only when configured", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: {
			model: "sonnet",
			effort: "high",
			permissionMode: "acceptEdits",
			resumeSessionId: "00000000-0000-4000-8000-00000000f003",
		},
	});
	const flags = probes(messages, "argv")[0].argv;
	const pair = (flag) => flags[flags.indexOf(flag) + 1];
	assert.equal(pair("--model"), "sonnet");
	assert.equal(pair("--effort"), "high");
	assert.equal(pair("--permission-mode"), "acceptEdits");
	assert.equal(pair("--resume"), "00000000-0000-4000-8000-00000000f003");
	assert.equal(flags.includes("--allow-dangerously-skip-permissions"), false);
});

test("PRD-002.R10: the bypass setting adds --allow-dangerously-skip-permissions", async () => {
	const { messages } = await run({ scenario: "basic", options: { allowBypassPermissions: true } });
	assert.ok(probes(messages, "argv")[0].argv.includes("--allow-dangerously-skip-permissions"));
});

test("profile arguments are appended after the panel's own", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: { model: "sonnet", extraArgs: ["--chrome", "--add-dir", "/a b"] },
	});
	const flags = probes(messages, "argv")[0].argv;
	assert.deepEqual(flags.slice(-3), ["--chrome", "--add-dir", "/a b"]);
	assert.ok(flags.indexOf("--model") < flags.indexOf("--chrome"));
});

test("an unset permission mode leaves the CLI's own default", async () => {
	const { messages } = await run({ scenario: "basic", options: {} });
	const flags = probes(messages, "argv")[0].argv;
	assert.equal(flags.includes("--permission-mode"), false);
});

test("an explicit default permission mode is passed", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: { permissionMode: "default" },
	});
	const flags = probes(messages, "argv")[0].argv;
	assert.equal(flags[flags.indexOf("--permission-mode") + 1], "default");
});

test("the initialize handshake goes out before the first turn", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: { appendSystemPrompt: "vault rules" },
	});
	const requests = probes(messages, "got_control_request");
	const init = requests.find((p) => p.sub === "initialize");
	assert.ok(init, "initialize should be sent");
	assert.equal(init.request.appendSystemPrompt, "vault rules");
	const turnIndex = messages.indexOf(probes(messages, "got_user_turn")[0]);
	const initIndex = messages.indexOf(init);
	assert.ok(initIndex < turnIndex, "initialize must precede the user turn");
});

test("a user turn round-trips and the result arrives", async () => {
	const { messages } = await run({ scenario: "basic", send: "ping" });
	const [turn] = probes(messages, "got_user_turn");
	assert.equal(turn.text, "ping");
	assert.equal(turn.session_id, "sess");
	const assistant = messages.find((m) => m.type === "assistant");
	assert.equal(assistant.message.content[0].text, "echo: ping");
	const result = messages.find((m) => m.type === "result");
	assert.equal(result.is_error, false);
	assert.equal(result.session_id, "00000000-0000-4000-8000-00000000f001");
});

test("PRD-001.R15: the turn scenario streams thinking, two replies and a tool call that state/stream reduces to the turn's blocks", async () => {
	const { messages } = await run({ scenario: "turn", send: "Summarize the note" });
	let state = STREAM_IDLE;
	const changes = [];
	// The fake CLI's own probes aside.
	for (const message of messages.filter((m) => m.subtype !== "probe")) {
		const step = reduceStream(state, message);
		state = step.state;
		changes.push(...step.changes);
	}
	const kinds = changes.map((change) => change.type).filter((type) => !type.endsWith("-delta"));
	assert.deepEqual(kinds, [
		"init",
		"uuid",
		"thinking-open",
		"thinking-stop",
		"thinking-done",
		"text-open",
		"text-stop",
		"text-done",
		"tool-use",
		"tool-results",
		"text-open",
		"text-stop",
		"text-done",
		"result",
	]);
	const streamed = changes.filter((change) => change.type === "text-delta").map((change) => change.text).join("");
	const done = changes.filter((change) => change.type === "text-done").map((change) => change.text);
	assert.equal(streamed, done.join(""), "the deltas add up to the finished blocks");
	assert.match(done[0], /\| Step \| Tool \|/);
	// Into the model as the tab applies it: one turn after the prompt, its blocks in order.
	let model = addUserMessage(EMPTY_MODEL, { type: "prompt", text: "Summarize the note", contextName: null, images: [], sentAt: 0 }, 0).model;
	for (const change of changes) {
		if (change.type === "thinking-done") model = addBlock(model, { kind: "thinking", text: change.text, streaming: false, startedAt: null, endedAt: null }, 0).model;
		if (change.type === "text-done") model = addBlock(model, { kind: "text", text: change.text, streaming: false }, 0).model;
		if (change.type === "tool-use") model = addToolUse(model, change.block, null, 0).model;
	}
	assert.deepEqual(model.items[1].blocks.map((block) => block.kind), ["thinking", "text", "steps", "text"]);
	const result = changes.at(-1).message;
	assert.equal(result.usage.output_tokens, 340);
	assert.ok(result.total_cost_usd > 0 && result.duration_ms > 0);
});

/** The cache after each message of a run, as `tab/chat-tab` folds them, at the message's index in time. */
function cacheStates(messages) {
	let cache = emptyCache();
	return messages
		.filter((m) => m.subtype !== "probe")
		.map((message, at) => {
			cache = cacheAfter(cache, message, at * 1000);
			return { message, cache, at };
		});
}

test("PRD-005.R11 (E4): the fake CLI's streamed turn shows the cache refreshing while a response streams, then a one-hour countdown", async () => {
	const { messages } = await run({ scenario: "turn", send: "Summarize the note" });
	const states = cacheStates(messages);
	const first = states.find(({ message }) => message.type === "stream_event" && message.event.type === "message_start");
	assert.equal(cacheView(first.cache, first.at * 1000), null, "nothing is reported before the first response does");
	const written = states.find(({ message }) => message.type === "assistant");
	assert.equal(cacheView(written.cache, written.at * 1000).state, "refreshing", "its response is still streaming");
	const stopped = states.find(({ message }) => message.type === "stream_event" && message.event.type === "message_stop");
	const warm = cacheView(stopped.cache, stopped.at * 1000);
	assert.equal(warm.state, "warm");
	assert.equal(warm.lifetimeMs, 3_600_000, "the main agent's write was a one-hour write");
	assert.equal(warm.cachedTokens, 56_000 + 2048);
	const last = states.at(-1);
	assert.equal(cacheView(last.cache, last.at * 1000).state, "warm");
	assert.equal(cacheIdle(last.cache), last.cache, "the result left nothing streaming");
});

test("PRD-005.R11 (E4): FAKE_CLI_CACHE_TTL=5m makes the main agent's writes five-minute, so the lifetime follows the usage", async () => {
	const { messages } = await run({ scenario: "turn", send: "Summarize the note", options: { env: { FAKE_CLI_SCENARIO: "turn", FAKE_CLI_CACHE_TTL: "5m" } } });
	const last = cacheStates(messages).at(-1);
	assert.equal(cacheView(last.cache, last.at * 1000).lifetimeMs, 300_000);
});

test("PRD-005.R11 (E4): a subagent's five-minute writes do not shorten the main agent's countdown", async () => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), "fake-cli-cache-"));
	let messages;
	try {
		({ messages } = await run({ scenario: "steps", send: "Look through the notes", options: { cwd, env: { FAKE_CLI_SCENARIO: "steps" } } }));
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
	const states = cacheStates(messages);
	const subagent = messages.filter((m) => m.type === "assistant" && m.parent_tool_use_id);
	assert.ok(subagent.length >= 2, "the scenario's subagent replies");
	assert.ok(subagent.every((m) => m.message.usage.cache_creation.ephemeral_5m_input_tokens > 0 && m.message.usage.cache_creation.ephemeral_1h_input_tokens === 0));
	const last = states.at(-1);
	assert.equal(cacheView(last.cache, last.at * 1000).lifetimeMs, 3_600_000);
});

/**
 * The model and background tasks as `tab/chat-tab` builds them from a run's
 * messages, through `state/stream` and `state/step-groups`.
 */
function applySteps(messages, prompt) {
	let state = STREAM_IDLE;
	let model = addUserMessage(EMPTY_MODEL, { type: "prompt", text: prompt, contextName: null, images: [], sentAt: 0 }, 0).model;
	let tasks = [];
	const seenTasks = [];
	let now = 0;
	const block = (kind, text) =>
		addBlock(closeGroup(model, null).model, kind === "text" ? { kind, text, streaming: false } : { kind, text, streaming: false, startedAt: null, endedAt: null }, now).model;
	for (const message of messages.filter((m) => m.subtype !== "probe")) {
		now += 100;
		const step = reduceStream(state, message);
		state = step.state;
		for (const change of step.changes) {
			if (change.type === "text-done") model = block("text", change.text);
			else if (change.type === "thinking-done") model = block("thinking", change.text);
			else if (change.type === "tool-use") model = addToolUse(model, change.block, null, now).model;
			else if (change.type === "tool-results")
				model = addToolResults(model, change.results, now, (id) => tasks.some((task) => task.toolUseId === id)).model;
			else if (change.type === "agent-message") model = addAgentMessage(model, change.parent, change.message, now).model;
			else if (change.type === "result") {
				model = settleTurnCalls(model, (id) => tasks.some((task) => task.toolUseId === id), now).model;
				model = closeTurn(model, EMPTY_FOOTER, now).model;
			}
			else if (change.type === "task") {
				tasks = nextTasks(tasks, change.event);
				seenTasks.push(tasks.map((task) => task.taskId));
				if (change.event.type === "ended" && change.event.toolUseId)
					model = reportAgent(model, change.event.toolUseId, change.event.report, now).model;
			}
		}
	}
	return { model, tasks, seenTasks };
}

/** A block as a line: groups by their rows and marks, agent rows by status, with their threads. */
function stepShape(block) {
	if (block.kind === "steps") return `steps[${block.rows.map((row) => `${row.name}:${row.status}${row.count ? ` ${row.count}` : ""}`).join(", ")}]`;
	if (block.kind === "agent") return `agent ${block.description} ${block.status} {${block.thread.map(stepShape).join("; ")}}`;
	return block.kind;
}

test("PRD-001.R16, PRD-001.R18: the steps scenario's calls, subagents and background tasks become groups, agent rows and tasks", async () => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), "fake-cli-steps-"));
	const messages = [];
	let client;
	try {
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				client.stop();
				reject(new Error("steps scenario timed out"));
			}, 20000);
			client = new ClaudeClient(
				{ cliPath: FAKE_CLI, cwd, env: { FAKE_CLI_SCENARIO: "steps" } },
				{
					onStreamMessage: (msg) => {
						messages.push(msg);
						// The shell is stopped; the background agent runs on to its own end.
						if (msg.type === "result") void client.stopTask("task-shell-1");
						if (msg.subtype === "task_notification" && msg.task_id === "task-agent-1") client.stop();
					},
					onPermissionRequest: async (req) => ({ behavior: "allow", updatedInput: req.input }),
					onClose: () => {
						clearTimeout(timer);
						resolve();
					},
				}
			);
			client.start();
			client.sendUserMessage("Tidy the notes", "sess");
		});
		assert.match(readFileSync(path.join(cwd, "Fake CLI steps note.md"), "utf8"), /Edited by the fake CLI/, "the edit lands on disk");
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
	const { model, tasks, seenTasks } = applySteps(messages, "Tidy the notes");
	assert.deepEqual(model.items[1].blocks.map(stepShape), [
		"text",
		"steps[Glob:done 3 files, Grep:done 2 results, mcp__obsidian__obsidian_search:done 4 notes, Read:error]",
		"text",
		"steps[Edit:done]",
		"agent Survey the project notes done {text; steps[Glob:done 2 files, Read:done]; text}",
		"agent Watch the inbox done {steps[Glob:done 1 file, Glob:done 1 file, Glob:done 1 file]; text}",
		"steps[Bash:done]",
		"text",
	]);
	const [survey, watch] = model.items[1].blocks.filter((block) => block.kind === "agent");
	assert.deepEqual([survey.subagentType, survey.toolUses, survey.tokens, survey.models], ["Explore", 2, 4 * 1320, ["claude-haiku-4-5-20251001"]]);
	assert.deepEqual([watch.reported, watch.tokens, watch.toolUses], [true, 4321, 3], "the CLI's totals replace the running ones");
	assert.ok(model.items[1].blocks.every((block) => block.kind !== "steps" || !block.open), "the result closed the turn's groups");
	assert.deepEqual(seenTasks.slice(0, 4), [["task-agent-1"], ["task-agent-1"], ["task-agent-1", "task-shell-1"], ["task-agent-1", "task-shell-1"]]);
	assert.deepEqual(tasks, [], "the stopped shell and the finished agent are gone");
	const stopped = messages.find((m) => m.subtype === "task_notification" && m.task_id === "task-shell-1");
	assert.equal(stopped.status, "stopped");
});

test("NDJSON framing survives split lines and multiple objects per chunk", async () => {
	const { messages } = await run({ scenario: "chunked" });
	const texts = messages
		.filter((m) => m.type === "assistant")
		.map((m) => m.message.content[0].text);
	assert.equal(texts.length, 3);
	assert.equal(texts[0].length, 5000, "a line split across three writes must reassemble");
	assert.equal(texts[1], "first");
	assert.equal(texts[2], "second");
	assert.ok(messages.some((m) => m.type === "result"));
});

test("PRD-001.R6: lines that are not JSON objects, and a control_response without a response, are skipped and the rest of the chunk is processed", async () => {
	const { messages } = await run({ scenario: "noise" });
	assert.ok(
		messages.every((m) => m !== null && typeof m === "object" && !Array.isArray(m)),
		"a non-object line must not reach the view"
	);
	const texts = messages
		.filter((m) => m.type === "assistant")
		.map((m) => m.message.content[0].text);
	assert.deepEqual(texts, ["before", "after"]);
	assert.ok(messages.some((m) => m.type === "result"));
	assert.equal(probes(messages, "got_control_response").length, 0, "a malformed request is not answered");
});

test("PRD-001.R6: a multi-megabyte line split across chunks arrives whole, with the message after it", async () => {
	const { messages } = await run({ scenario: "bigline" });
	const texts = messages
		.filter((m) => m.type === "assistant")
		.map((m) => m.message.content[0].text);
	assert.equal(texts.length, 2);
	assert.equal(texts[0].length, 3_000_000);
	assert.equal(texts[1], "after");
});

test("PRD-001.R6: a long line arriving in small chunks is not rescanned for every chunk", () => {
	const seen = [];
	const client = new ClaudeClient(
		{ cliPath: FAKE_CLI, cwd: here },
		{
			onStreamMessage: (msg) => seen.push(msg),
			onPermissionRequest: async () => ({ behavior: "deny", message: "no" }),
			onPermissionCancelled: () => {},
			onClose: () => {},
		}
	);
	const started = performance.now();
	client.handleStdout('{"type":"assistant","message":{"content":[{"type":"text","text":"');
	for (let i = 0; i < 20_000; i++) client.handleStdout("x".repeat(100));
	client.handleStdout('"}]}}\n');
	const elapsed = performance.now() - started;
	assert.equal(seen.length, 1);
	assert.equal(seen[0].message.content[0].text.length, 2_000_000);
	assert.ok(elapsed < 1000, `assembling the line took ${Math.round(elapsed)} ms`);
});

test("a permission request reaches the callback and the decision goes back", async () => {
	const seen = [];
	const { messages } = await run({
		scenario: "permission",
		onPermission: async (req) => {
			seen.push(req);
			return {
				behavior: "allow",
				updatedInput: { ...req.input, new_string: "edited" },
				updatedPermissions: req.suggestions,
			};
		},
	});
	assert.equal(seen.length, 1);
	assert.equal(seen[0].toolName, "Edit");
	assert.equal(seen[0].input.file_path, "note.md");
	assert.equal(seen[0].toolUseId, "toolu_fake");
	assert.deepEqual(seen[0].suggestions, [{ type: "addRules" }]);

	const [decision] = probes(messages, "permission_decision");
	assert.equal(decision.response.behavior, "allow");
	assert.equal(decision.response.updatedInput.new_string, "edited");
	assert.deepEqual(decision.response.updatedPermissions, [{ type: "addRules" }]);
});

/** The PermissionRequest the client builds from a permission scenario's one request. */
async function permissionFrom(scenario) {
	const seen = [];
	await run({
		scenario,
		onPermission: async (req) => {
			seen.push(req);
			return { behavior: "allow", updatedInput: req.input };
		},
	});
	return seen[0];
}

test("PRD-002.R9: a permission request carries Claude Code's decision reason and interaction flag", async () => {
	const req = await permissionFrom("permission-flagged");
	assert.equal(req.decisionReasonType, "rule");
	assert.equal(req.decisionReason, "Matched ask rule Edit(note.md)");
	assert.equal(req.requiresUserInteraction, true);
	assert.equal(req.mistypedFlags, undefined);
});

test("PRD-002.R9: a flagged subagent request gets the card in Auto-approve", async () => {
	const req = await permissionFrom("permission-flagged");
	assert.equal(req.agentId, "agent-7");
	assert.equal(permissionDecision("auto", req, { questionForm: false, isEdit: true }), "card-after-read");
});

test("PRD-002.R9: decision-reason fields of the wrong type are dropped, and the flags among them named", async () => {
	const req = await permissionFrom("permission-bad-reason");
	assert.equal(req.decisionReasonType, undefined);
	assert.equal(req.decisionReason, undefined);
	assert.equal(req.decisionReasonCode, undefined);
	assert.equal(req.requiresUserInteraction, undefined);
	assert.equal(req.classifierApprovable, undefined);
	assert.equal(req.matchedAskRule, undefined);
	assert.deepEqual([...req.mistypedFlags].sort(), [
		"classifier_approvable",
		"decision_reason_code",
		"decision_reason_type",
		"matched_ask_rule",
		"requires_user_interaction",
	]);
	assert.equal(permissionDecision("auto", req, { questionForm: false, isEdit: true }), "card-after-read");
	// Absent on a request that sets none of them.
	const plain = await permissionFrom("permission");
	for (const field of ["decisionReasonType", "decisionReasonCode", "requiresUserInteraction", "classifierApprovable", "matchedAskRule", "mistypedFlags"])
		assert.equal(plain[field], undefined, field);
});

test("PRD-002.R9: a tool name that is not a string shows as unknown and flags the request", async () => {
	const req = await permissionFrom("permission-bad-tool-name");
	assert.equal(req.toolName, "unknown");
	assert.deepEqual(req.mistypedFlags, ["tool_name"]);
	assert.equal(permissionDecision("auto", req, { questionForm: false, isEdit: false }), "card");
});

test("PRD-002.R9: decision-reason fields sent as null count as absent", async () => {
	const req = await permissionFrom("permission-null-reason");
	for (const field of ["decisionReasonType", "decisionReasonCode", "requiresUserInteraction", "classifierApprovable", "matchedAskRule", "mistypedFlags"])
		assert.equal(req[field], undefined, field);
	assert.equal(permissionDecision("auto", req, { questionForm: false, isEdit: false }), "allow");
});

test("PRD-002.R9: a permission request says when an ask rule forced it beside the tool's own reason", async () => {
	const req = await permissionFrom("permission-ask-rule");
	assert.equal(req.decisionReasonType, "other");
	assert.equal(req.matchedAskRule, true);
});

test("PRD-002.R9: a permission request carries Claude Code's safety-check flag", async () => {
	const req = await permissionFrom("permission-safety-check");
	assert.equal(req.toolName, "Bash");
	assert.equal(req.decisionReasonType, "subcommandResults");
	assert.equal(req.classifierApprovable, false);
	const approvable = await permissionFrom("permission-classifier-approvable");
	assert.equal(approvable.decisionReasonType, "safetyCheck");
	assert.equal(approvable.classifierApprovable, true);
});

test("PRD-002.R9: a permission request carries an organization's MCP ask ceiling", async () => {
	const req = await permissionFrom("permission-org-ceiling");
	assert.equal(req.decisionReasonType, "other");
	assert.equal(req.decisionReasonCode, "org_ask_ceiling");
});

test("PRD-002.R9: requires_user_interaction false is carried as false", async () => {
	const req = await permissionFrom("permission-unflagged");
	assert.equal(req.requiresUserInteraction, false);
	assert.equal(req.decisionReasonType, "mode");
});

test("a denial is reported as a denial", async () => {
	const { messages } = await run({
		scenario: "permission",
		onPermission: async () => ({ behavior: "deny", message: "no thanks" }),
	});
	const [decision] = probes(messages, "permission_decision");
	assert.equal(decision.response.behavior, "deny");
	assert.equal(decision.response.message, "no thanks");
});

test("a cancelled permission notifies the view and is answered with silence", async () => {
	let release;
	const held = new Promise((r) => {
		release = r;
	});
	const { messages, cancelled } = await run({
		scenario: "cancel",
		onPermission: async () => {
			// Still pending when the cancel arrives; resolve after it.
			await held;
			return { behavior: "allow", updatedInput: {} };
		},
	});
	assert.equal(cancelled.length, 1, "the view should be told to withdraw the card");
	release({ behavior: "allow", updatedInput: {} });
	assert.equal(
		probes(messages, "unexpected_response_after_cancel").length,
		0,
		"no control response may follow a cancel"
	);
	assert.ok(probes(messages, "cancel_window_closed").length > 0);
});

test("PRD-001.R11: an interrupt while a card waits withdraws the card and ends the turn, with no stop_task", async () => {
	let client;
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	const messages = [];
	const cancelled = [];
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			client.stop();
			reject(new Error("interrupt scenario timed out"));
		}, 15000);
		client = new ClaudeClient(
			{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: "permission" } },
			{
				onStreamMessage: (msg) => {
					messages.push(msg);
					if (msg.type === "result") client.stop();
				},
				onPermissionRequest: async () => {
					void client.interrupt();
					await held;
					return { behavior: "allow", updatedInput: {} };
				},
				onPermissionCancelled: (id) => cancelled.push(id),
				onClose: () => {
					clearTimeout(timer);
					resolve();
				},
			}
		);
		client.start();
		client.sendUserMessage("hello", "sess");
	});
	release();
	assert.equal(cancelled.length, 1, "the card is withdrawn");
	assert.equal(messages.filter((m) => m.type === "result").length, 1, "the turn ends");
	const subs = probes(messages, "got_control_request").map((p) => p.sub);
	assert.ok(subs.includes("interrupt"));
	assert.ok(!subs.includes("stop_task"));
	assert.equal(probes(messages, "permission_decision").length, 0, "nothing answers a withdrawn card");
});

test("PRD-001.R11: an interrupt after the turn ended sends no second result", async () => {
	const messages = [];
	let client;
	await new Promise((resolve) => {
		client = new ClaudeClient(
			{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: "basic" } },
			{
				onStreamMessage: (msg) => {
					messages.push(msg);
					if (msg.type === "result")
						void client.interrupt().then(() => setTimeout(() => client.stop(), 100));
				},
				onPermissionRequest: async (req) => ({ behavior: "allow", updatedInput: req.input }),
				onClose: () => resolve(),
			}
		);
		client.start();
		client.sendUserMessage("hello", "sess");
	});
	assert.equal(messages.filter((m) => m.type === "result").length, 1);
});

test("PRD-001.R11: a message sent mid-turn waits for the running turn, then runs as the next", async () => {
	let client;
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	const messages = [];
	let permissions = 0;
	await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			client.stop();
			reject(new Error("queued-message scenario timed out"));
		}, 15000);
		client = new ClaudeClient(
			{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: "permission" } },
			{
				onStreamMessage: (msg) => {
					messages.push(msg);
					if (messages.filter((m) => m.type === "result").length === 2) client.stop();
				},
				onPermissionRequest: async (req) => {
					if (++permissions === 1) {
						client.sendUserMessage("second", "sess");
						await held;
					}
					return { behavior: "allow", updatedInput: req.input };
				},
				onClose: () => {
					clearTimeout(timer);
					resolve();
				},
			}
		);
		client.start();
		client.sendUserMessage("first", "sess");
		// The second message's probe arrives while the first turn still waits.
		const check = setInterval(() => {
			if (probes(messages, "got_user_turn").length < 2) return;
			clearInterval(check);
			release();
		}, 10);
	});
	const turns = probes(messages, "got_user_turn");
	assert.deepEqual(
		turns.map((p) => [p.text, p.queued]),
		[
			["first", false],
			["second", true],
		]
	);
	const firstResult = messages.findIndex((m) => m.type === "result");
	const inits = messages.map((m, i) => (m.type === "system" && m.subtype === "init" ? i : -1)).filter((i) => i >= 0);
	assert.equal(inits.length, 2);
	assert.ok(inits[1] > firstResult, "the queued turn starts after the running one ends");
	assert.equal(permissions, 2);
});

test("sdkMcpServers is registered on the initialize handshake", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: { sdkMcpServers: ["obsidian"] },
	});
	const init = probes(messages, "got_control_request").find(
		(p) => p.sub === "initialize"
	);
	assert.deepEqual(init.request.sdkMcpServers, ["obsidian"]);
});

test("no sdkMcpServers field is sent when none are configured", async () => {
	const { messages } = await run({ scenario: "basic" });
	const init = probes(messages, "got_control_request").find(
		(p) => p.sub === "initialize"
	);
	assert.equal("sdkMcpServers" in init.request, false);
});

test("mcp_message is routed to the handler and its reply wrapped for the CLI", async () => {
	const seen = [];
	const { messages } = await run({
		scenario: "mcp",
		mcpHandler: async (server, message) => {
			seen.push({ server, message });
			if (message.id === undefined) return null;
			return { jsonrpc: "2.0", id: message.id, result: { ok: true } };
		},
	});

	assert.equal(seen.length, 3, "every message should reach the handler");
	assert.equal(seen[0].server, "obsidian");
	assert.equal(seen[0].message.method, "initialize");
	assert.equal(seen[2].server, "nope", "the server name is passed through as-is");

	const replies = probes(messages, "mcp_reply");
	const byLabel = Object.fromEntries(replies.map((r) => [r.label, r.response]));

	// A request's reply travels as {mcp_response: <the JSON-RPC response>}.
	assert.deepEqual(byLabel.initialize.mcp_response, {
		jsonrpc: "2.0",
		id: 0,
		result: { ok: true },
	});
	// A notification must come back as an explicit null, not as an error or an
	// omitted field - the CLI feeds whatever it gets into its MCP client.
	assert.equal(byLabel.notification.mcp_response, null);
});

test("a client with no MCP handler refuses mcp_message rather than hanging", async () => {
	const { messages } = await run({ scenario: "mcp", mcpHandler: null });
	const [first] = probes(messages, "got_control_response");
	assert.ok(first, "the client must answer instead of leaving the CLI waiting");
	assert.equal(first.response.subtype, "error");
	assert.match(first.response.error, /No in-process MCP server/);
});

test("a handler that throws surfaces as a control-response error", async () => {
	const { messages } = await run({
		scenario: "mcp",
		mcpHandler: async () => {
			throw new Error("vault is gone");
		},
	});
	const [first] = probes(messages, "got_control_response");
	assert.equal(first.response.subtype, "error");
	assert.match(first.response.error, /vault is gone/);
});

test("an unsupported CLI-initiated control request is answered with an error", async () => {
	const { messages } = await run({ scenario: "unsupported" });
	const [reply] = probes(messages, "unsupported_reply");
	assert.ok(reply, "the client must answer rather than hang");
	assert.equal(reply.response.subtype, "error");
	assert.match(reply.response.error, /hook_callback/);
});

test("a crashed CLI surfaces its exit code and stderr tail", async () => {
	const { close } = await run({ scenario: "crash" });
	assert.equal(close.code, 3);
	assert.match(close.stderrTail, /fake cli exploded/);
	assert.match(close.stderrTail, /second stderr line/);
});

test("control requests reject once the process is gone", async () => {
	const { client } = await run({ scenario: "crash" });
	assert.equal(client.running, false);
	await assert.rejects(() => client.interrupt(), /not running/);
});

/** A client against the fake CLI with no turn sent, for control requests. */
async function withClient(scenario, fn, options = {}) {
	const messages = [];
	const client = new ClaudeClient(
		{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: scenario }, ...options },
		{
			onStreamMessage: (msg) => messages.push(msg),
			onPermissionRequest: async () => ({ behavior: "deny", message: "no" }),
			onPermissionCancelled: () => {},
			onClose: () => {},
		}
	);
	client.start();
	try {
		return await fn(client, messages);
	} finally {
		client.stop();
	}
}

test("PRD-001.R6: a request is still answered when skipped lines share its chunk", async () => {
	await withClient("noise", async (client) => {
		await client.interrupt();
		await client.setModel("sonnet");
	});
});

test("PRD-001.R22: set_model replays the change as a uuid-bearing stdout user message, and nothing when unchanged", async () => {
	await withClient("basic", async (client, messages) => {
		const replays = () => messages.filter((m) => m.type === "user" && m.isReplay === true);
		await client.setModel("sonnet");
		await client.setModel("sonnet");
		assert.equal(replays().length, 1);
		assert.match(replays()[0].uuid, /^u-local-/);
		assert.equal(replays()[0].message.content, "<local-command-stdout>Set model to `sonnet`</local-command-stdout>");
		await client.setModel(undefined);
		assert.equal(replays().length, 2);
	});
});

test("PRD-001.R22: a refusal with no text of its own still says something", async () => {
	await withClient("bare-error", async (client) => {
		await assert.rejects(() => client.interrupt(), /^Error: Claude Code refused the request\.$/);
		await assert.rejects(() => client.setModel("sonnet"), /^Error: Claude Code refused the request\.$/);
	});
});

const rewindRequests = (messages) =>
	probes(messages, "got_control_request")
		.filter((p) => p.sub === "rewind_files")
		.map((p) => p.request);

test("PRD-002.R14: a restore preview sends rewind_files as a dry run and parses the reply", async () => {
	await withClient("rewind", async (client, messages) => {
		const preview = await client.rewindFiles("u-ok", true);
		assert.deepEqual(preview, {
			canRewind: true,
			filesChanged: ["/vault/a.md", "/vault/b.md", "/elsewhere/c.txt"],
			insertions: 4,
			deletions: 2,
		});
		const real = await client.rewindFiles("u-ok", false);
		assert.deepEqual(real.filesChanged, ["/vault/a.md", "/vault/b.md"]);
		// The real rewind carries no dry_run at all.
		assert.deepEqual(rewindRequests(messages), [
			{ subtype: "rewind_files", user_message_id: "u-ok", dry_run: true },
			{ subtype: "rewind_files", user_message_id: "u-ok" },
		]);
	});
});

test("PRD-002.R14: a checkpoint the CLI no longer has comes back as canRewind false", async () => {
	await withClient("rewind", async (client) => {
		assert.deepEqual(await client.rewindFiles("u-gone", true), {
			canRewind: false,
			error: "No file checkpoint found for this message.",
		});
	});
});

test("PRD-002.R14: rewind_files replies of the wrong shape are errors", async () => {
	await withClient("rewind", async (client) => {
		// Entries that are not strings are dropped; a missing list stays missing.
		assert.deepEqual((await client.rewindFiles("u-mixed", true)).filesChanged, ["/vault/a.md"]);
		assert.deepEqual(await client.rewindFiles("u-nolist", false), { canRewind: true });
		await assert.rejects(() => client.rewindFiles("u-bad-count", true), /Unexpected rewind_files reply/);
		await assert.rejects(() => client.rewindFiles("u-bad", true), /Unexpected rewind_files reply/);
	});
});

test("PRD-002.R14: a CLI without rewind_files rejects the preview with its own error", async () => {
	await withClient("basic", async (client) => {
		await assert.rejects(() => client.rewindFiles("u-ok", true), /Unsupported control request subtype: rewind_files/);
	});
});

test("PRD-002.R15: a branch rewind names the latest prompt seen, and without it or with another an earlier target comes back refused", async () => {
	await withClient(
		"basic",
		async (client, messages) => {
			assert.deepEqual(await client.rewindConversation("00000000-0000-4000-8000-000000000002", null), {
				rewound: false,
				error: "stale target",
				reason: "stale_target",
				prefillText: undefined,
			});
			assert.deepEqual(await client.rewindConversation("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001"), {
				rewound: false,
				error: "unseen later turn",
				reason: "unseen_later_turn",
				prefillText: undefined,
			});
			assert.deepEqual(await client.rewindConversation("00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000003"), {
				rewound: false,
				error: "target not found",
				reason: "target_not_found",
				prefillText: undefined,
			});
			assert.deepEqual(await client.rewindConversation("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"), {
				rewound: true,
				error: undefined,
				reason: undefined,
				prefillText: "Prompt 00000000-0000-4000-8000-000000000002",
			});
			assert.deepEqual(
				probes(messages, "got_control_request")
					.filter((p) => p.sub === "rewind_conversation")
					.map((p) => p.request)
					.slice(0, 2),
				[
					{ subtype: "rewind_conversation", target_message_uuid: "00000000-0000-4000-8000-000000000002", interrupt_if_running: true },
					{
						subtype: "rewind_conversation",
						target_message_uuid: "00000000-0000-4000-8000-000000000002",
						interrupt_if_running: true,
						last_seen_user_message_uuid: "00000000-0000-4000-8000-000000000001",
					},
				]
			);
		},
		{ resumeSessionId: "00000000-0000-4000-8000-00000000f002", forkSession: true }
	);
});

test("PRD-002.R15: a session that resumed nothing has no prompt to rewind to", async () => {
	await withClient("basic", async (client) => {
		assert.equal((await client.rewindConversation("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003")).reason, "target_not_found");
	});
});

test("PRD-002.R13: every spawn turns the CLI's file checkpointing on", async () => {
	// Whatever the machine running the tests has set.
	const { messages } = await run({
		options: { env: { FAKE_CLI_SCENARIO: "basic", CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: undefined } },
	});
	assert.deepEqual(probes(messages, "env")[0], {
		type: "system",
		subtype: "probe",
		what: "env",
		checkpointing: "true",
		disable: null,
	});
	// The user's own switch to turn it off passes through and wins in the CLI.
	const off = await run({ options: { env: { FAKE_CLI_SCENARIO: "basic", CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: "1" } } });
	assert.equal(probes(off.messages, "env")[0].disable, "1");
	assert.equal(probes(off.messages, "env")[0].checkpointing, "true");
});

/**
 * Map raw `get_context_usage` categories through the real reducer, without a
 * process: the constructor does not spawn, so stubbing `request` is enough.
 */
async function contextCategories(categories) {
	const client = new ClaudeClient({ cliPath: FAKE_CLI, cwd: here, env: {} }, {});
	client.request = async () => ({
		totalTokens: 100_000,
		maxTokens: 200_000,
		percentage: 50,
		categories,
	});
	const usage = await client.getContextUsage();
	return usage.categories;
}

test("a \"(deferred)\" marker baked into a category name is not kept in the name", async () => {
	// What the CLI sends today: the marker is in the name *and* in the flag.
	// Leaving it in the name makes the view render it twice.
	const [tools, prompt] = await contextCategories([
		{ name: "MCP tools (deferred)", tokens: 67_000, isDeferred: true },
		{ name: "System prompt", tokens: 3200, isDeferred: false },
	]);
	assert.equal(tools.name, "MCP tools");
	assert.equal(tools.deferred, true);
	// A category that was never deferred passes through untouched.
	assert.equal(prompt.name, "System prompt");
	assert.equal(prompt.deferred, false);
});

test("either half of the deferred signal alone still marks the category", async () => {
	// The flag alone, if the CLI stops embedding the marker in the name.
	const [flagOnly] = await contextCategories([
		{ name: "MCP tools", tokens: 67_000, isDeferred: true },
	]);
	assert.equal(flagOnly.name, "MCP tools");
	assert.equal(flagOnly.deferred, true);

	// The name alone, if the CLI stops sending the flag. Stripping the marker
	// must not be the same thing as forgetting it.
	const [nameOnly, oddCasing] = await contextCategories([
		{ name: "System tools (deferred)", tokens: 15_600 },
		{ name: "MCP tools  (DEFERRED)  ", tokens: 67_000 },
	]);
	assert.equal(nameOnly.name, "System tools");
	assert.equal(nameOnly.deferred, true);
	assert.equal(oddCasing.name, "MCP tools");
	assert.equal(oddCasing.deferred, true);
});

test("a category name that is nothing but the marker does not survive as one", async () => {
	const [bare] = await contextCategories([{ name: " (deferred)", tokens: 42 }]);
	assert.equal(bare.name, "");
	assert.equal(bare.deferred, true);
});

test("malformed categories are dropped rather than rendered", async () => {
	const kept = await contextCategories([
		null,
		"Messages",
		[],
		{ name: "MCP tools (deferred)", tokens: 67_000, isDeferred: true },
		{ name: "no tokens" },
		{ tokens: 100 },
		{ name: 7, tokens: 100 },
	]);
	assert.deepEqual(kept, [{ name: "MCP tools", tokens: 67_000, deferred: true, kind: "" }]);
});

test("PRD-005.R8: a category whose kind is deferred is marked deferred", async () => {
	const [kindOnly] = await contextCategories([{ name: "System tools", tokens: 19_964, kind: "deferred" }]);
	assert.deepEqual(kindOnly, { name: "System tools", tokens: 19_964, deferred: true, kind: "deferred" });
});

test("PRD-005.R8: getContextUsage keeps the model, the autocompact point and each category's kind when typed", async () => {
	const client = new ClaudeClient({ cliPath: FAKE_CLI, cwd: here, env: {} }, {});
	const reply = {
		totalTokens: 24_796,
		maxTokens: 1_000_000,
		percentage: 2,
		model: "claude-opus-5-5",
		autoCompactThreshold: 967_000,
		isAutoCompactEnabled: true,
		categories: [
			{ name: "Autocompact buffer", tokens: 33_000, kind: "buffer" },
			{ name: "Free space", tokens: 942_204, kind: 7 },
		],
	};
	client.request = async () => reply;
	const usage = await client.getContextUsage();
	assert.equal(usage.model, "claude-opus-5-5");
	assert.equal(usage.autoCompactAt, 967_000);
	assert.deepEqual(
		usage.categories.map((category) => category.kind),
		["buffer", ""]
	);
	client.request = async () => ({ ...reply, model: 5, isAutoCompactEnabled: false });
	const off = await client.getContextUsage();
	assert.deepEqual([off.model, off.autoCompactAt], [null, null]);
	client.request = async () => ({ ...reply, autoCompactThreshold: "967000" });
	assert.equal((await client.getContextUsage()).autoCompactAt, null);
});

test("PRD-005.R1: the fake CLI answers get_usage, and refuses it on request", async () => {
	await withClient("basic", async (client) => {
		const reply = await client.getPlanUsage();
		assert.equal(typeof reply.rate_limits.five_hour.utilization, "number");
		assert.equal(typeof reply.rate_limits.seven_day.resets_at, "string");
	});
	await withClient(
		"basic",
		async (client) => {
			await assert.rejects(() => client.getPlanUsage(), /Refused get_usage/);
		},
		{ env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_REFUSE_USAGE: "1" } }
	);
});

test("PRD-001.R20, PRD-001.R21: the fake CLI answers each report request with a reply its card reads, and refuses them on request", async () => {
	await withClient("basic", async (client) => {
		const ask = (subtype, extra = {}) => client.controlRequest({ subtype, ...extra }, 5_000);
		assert.ok(reports.statusReport(await ask("get_status"), []).sections.length > 1);
		assert.ok(reports.memoryReport(await ask("get_memory_dialog")).sections[0].rows.length > 0);
		assert.ok(reports.hooksReport(await ask("get_hooks_listing")).sections[0].rows.length > 0);
		assert.ok(reports.permissionsReport(await ask("list_permission_rules")).sections[0].rows.length > 0);
		assert.ok(reports.skillsReport(await ask("get_skills_dialog")).sections[0].rows.length > 0);
		assert.equal(reports.chromeReport(await ask("get_chrome_dialog"), "").title, "Claude in Chrome");
		assert.equal(reports.sandboxReport(await ask("get_sandbox_dialog"), "", true).title, "Sandbox");
		const cost = reports.costReport({ turns: 0, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }, 0, (await ask("get_session_cost")).text);
		assert.equal(cost.sections.length, 3, "the CLI's own lines parse");
		const servers = () => ask("mcp_status").then((reply) => reports.mcpReport(reply).sections[0].rows);
		const status = (rows, name) => rows.find((row) => row.cells[0] === name)?.cells[1];
		const before = await servers();
		assert.ok(before.length >= 4, "servers of every status");
		assert.deepEqual(before.find((row) => row.cells[0] === "obsidian").actions, [], "the panel's own server");
		await ask("mcp_toggle", { serverName: "github", enabled: false });
		assert.equal(status(await servers(), "github"), "disabled");
		await ask("mcp_toggle", { serverName: "github", enabled: true });
		await ask("mcp_reconnect", { serverName: "postgres" });
		assert.equal(status(await servers(), "github"), "connected");
		await assert.rejects(() => ask("mcp_reconnect", { serverName: "nope" }), /nope/);
	});
	await withClient(
		"basic",
		async (client) => {
			await assert.rejects(() => client.controlRequest({ subtype: "get_status" }, 5_000), /Refused get_status/);
			await assert.rejects(() => client.controlRequest({ subtype: "mcp_status" }, 5_000), /Refused mcp_status/);
		},
		{ env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_REFUSE_REPORTS: "1" } }
	);
});

test("PRD-001.R19: the fake CLI reports commands at start, one of them a name the panel answers", async () => {
	let info = null;
	const client = new ClaudeClient(
		{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: "basic" } },
		{
			onStreamMessage: () => {},
			onPermissionRequest: async () => ({ behavior: "deny", message: "no" }),
			onPermissionCancelled: () => {},
			onInitInfo: (reply) => (info = reply),
			onClose: () => {},
		}
	);
	client.start();
	try {
		while (!info) await new Promise((resolve) => setTimeout(resolve, 10));
		const commands = reports.parseCliCommands(info.commands);
		assert.ok(commands.length > 3, "more than /help shows before Show all");
		assert.ok(commands.some((cmd) => cmd.name === "context"));
		assert.ok(commands.some((cmd) => cmd.argumentHint));
	} finally {
		client.stop();
	}
});

test("PRD-005.R8: the fake CLI answers get_context_usage only after a turn, growing with each", async () => {
	await withClient("basic", async (client, messages) => {
		await assert.rejects(() => client.getContextUsage(), /no turn received yet/);
		const turn = async (text) => {
			const results = () => messages.filter((m) => m.type === "result").length;
			const before = results();
			client.sendUserMessage(text, "sess");
			while (results() === before) await new Promise((resolve) => setTimeout(resolve, 10));
		};
		await turn("one");
		const first = await client.getContextUsage();
		assert.equal(first.model, "fake-model-1");
		assert.ok(first.percentage > 0 && first.percentage < 80, `${first.percentage}%`);
		assert.ok(first.autoCompactAt > first.totalTokens);
		await turn("two");
		assert.ok((await client.getContextUsage()).totalTokens > first.totalTokens);
	});
	await withClient(
		"basic",
		async (client, messages) => {
			client.sendUserMessage("one", "sess");
			while (!messages.some((m) => m.type === "result")) await new Promise((resolve) => setTimeout(resolve, 10));
			await assert.rejects(() => client.getContextUsage(), /Refused get_context_usage/);
		},
		{ env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_REFUSE_USAGE: "1" } }
	);
});

// Windows cannot spawn npm's claude.cmd shim without a shell (Node's
// CVE-2024-27980 hardening throws EINVAL), and with shell:true Node joins
// command and args without quoting - these pin the exact launch shape.
test("cliSpawnSpec runs .cmd shims through the shell with quoting", () => {
	const spec = cliSpawnSpec(
		{ cliPath: "C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\claude.cmd", cwd: "C:\\vault" },
		["--output-format", "stream-json"],
		"win32"
	);
	assert.equal(spec.shell, true);
	assert.equal(spec.command, '"C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\claude.cmd"');
	assert.deepEqual(spec.args, ["--output-format", "stream-json"]);
	assert.equal(spec.cwd, "C:\\vault");
});

test("cliSpawnSpec always quotes a shim path, whitespace or not", () => {
	for (const cliPath of ["C:\\tools\\claude.bat", "C:\\Program Files\\npm\\claude.cmd"]) {
		const spec = cliSpawnSpec({ cliPath, cwd: "C:\\vault" }, ["--verbose"], "win32");
		assert.equal(spec.command, `"${cliPath}"`);
	}
});

test("cliSpawnSpec refuses a shim path cmd.exe would interpret", () => {
	for (const cliPath of [
		"C:\\R&D\\claude.cmd",
		"C:\\a^b\\claude.cmd",
		"C:\\%TEMP%\\claude.cmd",
		"C:\\a!b\\claude.cmd",
		'C:\\a"b\\claude.cmd',
		"C:\\a\r\nb\\claude.cmd",
	])
		assert.throws(() => cliSpawnSpec({ cliPath, cwd: "C:\\vault" }, [], "win32"), /Cannot launch .*cmd\.exe would interpret/s, cliPath);
});

test("cliSpawnSpec leaves a WSL path's ~/ and $VARIABLE expansion but not command substitution", () => {
	const script = (cliPath) =>
		cliSpawnSpec({ cliPath, cwd: "C:\\v", useWsl: true }, [], "win32").args[5];
	assert.equal(script("~/bin/claude"), 'exec ~/"bin/claude" "$@"');
	assert.equal(script("$HOME/bin/claude"), 'exec "$HOME/bin/claude" "$@"');
	assert.equal(script("/x/$(touch pwned)/claude"), 'exec "/x/\\$(touch pwned)/claude" "$@"');
	assert.equal(script("/x/`id`/claude"), 'exec "/x/\\`id\\`/claude" "$@"');
	assert.equal(script("${HOME}/x"), 'exec "${HOME}/x" "$@"');
	assert.equal(script("$HOME/x"), 'exec "$HOME/x" "$@"');
	assert.equal(script("~/x"), 'exec ~/"x" "$@"');
	// bash as sh: these still run a command unless every non-plain $ is escaped.
	assert.equal(script("${Y:=$(id)}${Y@P}"), 'exec "\\${Y:=\\$(id)}\\${Y@P}" "$@"');
	assert.equal(script("${Z:=a[$(id)]}${HOME:Z}"), 'exec "\\${Z:=a[\\$(id)]}\\${HOME:Z}" "$@"');
	assert.equal(script("${P:=`id`}${P@P}"), 'exec "\\${P:=\\`id\\`}\\${P@P}" "$@"');
	assert.equal(script("$((1))"), 'exec "\\$((1))" "$@"');
	assert.equal(script("${A:-x}"), 'exec "\\${A:-x}" "$@"');
});

test("cliSpawnSpec spawns .exe and posix binaries directly", () => {
	for (const [cliPath, platform] of [
		["C:\\Users\\u\\.local\\bin\\claude.exe", "win32"],
		["/usr/local/bin/claude", "linux"],
	]) {
		const spec = cliSpawnSpec({ cliPath, cwd: "/vault" }, ["--verbose"], platform);
		assert.equal(spec.shell, false);
		assert.equal(spec.command, cliPath);
		assert.equal(spec.cwd, "/vault");
	}
});

// wsl.exe -- would hand the line to the distro's default shell to re-parse,
// and bash, zsh and fish each read quotes differently. --exec runs a login sh
// with the arguments as positional parameters instead, so no shell parses
// them. Checked against a real wsl.exe with ;, $, backticks, quotes, a
// trailing backslash, tabs and newlines.
test("cliSpawnSpec runs WSL through --exec with the args out of any shell's reach", () => {
	const spec = cliSpawnSpec(
		{ cliPath: "claude", cwd: "C:\\My Vault", useWsl: true },
		["--verbose", "--settings", '{"sandbox":{"enabled":true}}', "it's $HOME"],
		"win32"
	);
	assert.equal(spec.command, "wsl.exe");
	assert.deepEqual(spec.args, [
		"--cd",
		"C:\\My Vault",
		"--exec",
		"sh",
		"-lc",
		'exec "claude" "$@"',
		"sh",
		"--verbose",
		"--settings",
		'{"sandbox":{"enabled":true}}',
		"it's $HOME",
	]);
	assert.equal(spec.shell, false);
	assert.equal(spec.cwd, undefined);
});

test("PRD-002.R13: cliSpawnSpec adds the checkpointing variable to the environment", () => {
	const base = { PATH: "/usr/bin", HOME: "/home/u" };
	const direct = cliSpawnSpec({ cliPath: "/usr/local/bin/claude", cwd: "/vault" }, [], "linux", base);
	assert.deepEqual(direct.env, { ...base, CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: "true" });
	// Only the WSL shape needs WSLENV to carry it across into the distro.
	assert.equal(direct.env.WSLENV, undefined);
	const extra = cliSpawnSpec({ cliPath: "claude", cwd: "/v", env: { FOO: "1" } }, [], "linux", base);
	assert.equal(extra.env.FOO, "1");
});

test("PRD-002.R13: in the WSL shape WSLENV names the variable after the user's entries", () => {
	const wsl = (base) =>
		cliSpawnSpec({ cliPath: "claude", cwd: "C:\\v", useWsl: true }, [], "win32", base).env;
	assert.equal(wsl({}).WSLENV, "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING");
	assert.equal(wsl({ WSLENV: "USERPROFILE/p:FOO/u" }).WSLENV, "USERPROFILE/p:FOO/u:CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING");
	assert.equal(wsl({ WSLENV: "" }).WSLENV, "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING");
	assert.equal(wsl({}).CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING, "true");
});

test("cliSpawnSpec keeps a WSL CLI path one word that still expands ~ and $VARS", () => {
	const script = (cliPath) =>
		cliSpawnSpec({ cliPath, cwd: "C:\\v", useWsl: true }, [], "win32").args[5];
	assert.equal(script("~/.local/bin/claude"), 'exec ~/".local/bin/claude" "$@"');
	assert.equal(script("$HOME/my tools/claude"), 'exec "$HOME/my tools/claude" "$@"');
	assert.equal(script('/odd"`\\path'), 'exec "/odd\\"\\`\\\\path" "$@"');
});

test("cliSpawnSpec refuses to pass cmd.exe metacharacters to a .cmd shim", () => {
	for (const arg of ["a&b", '{"a":1}', "%PATH%", "!x!", "a|b"])
		assert.throws(
			() => cliSpawnSpec({ cliPath: "C:\\npm\\claude.cmd", cwd: "C:\\v" }, [arg], "win32"),
			/cmd\.exe would interpret it/,
			arg
		);
});

test("cliSpawnSpec keeps empty args and trailing backslashes intact through a .cmd shim", () => {
	const spec = cliSpawnSpec(
		{ cliPath: "C:\\npm\\claude.cmd", cwd: "C:\\v" },
		["--system-prompt", "", "--add-dir", "C:\\My Notes\\", "--debug"],
		"win32"
	);
	assert.deepEqual(spec.args, ["--system-prompt", '""', "--add-dir", '"C:\\My Notes\\\\"', "--debug"]);
});

/** A permission flow whose tab answers each form at once with `selections`, keeping what it was shown. */
function answeringFlow(selections) {
	const shown = [];
	const tab = {
		status: { selectedMode: "auto" },
		addCard(key, card) {
			shown.push(card);
			queueMicrotask(() => flow.answer(card.requestId, { type: "submit", selections: selections(card.questions) }, card.key));
		},
		setCard() {},
	};
	const flow = new PermissionFlow({ tab, edits: { readFor: () => null, clear() {} } });
	return { flow, shown };
}

test("PRD-002.R12: the question scenario's single- and multi-select forms go back answered through the permission flow", async () => {
	const { flow, shown } = answeringFlow((questions) =>
		questions.map((q) => (q.multiSelect ? { picked: [0, 2], other: "Energy" } : { picked: [1], other: "" }))
	);
	const { messages } = await run({ scenario: "question", onPermission: (req) => flow.request(req) });
	assert.deepEqual(
		shown.map((card) => [card.kind, card.questions.map((q) => q.multiSelect)]),
		[
			["question", [false, true]],
			["question", [false]],
		]
	);
	const [first, second] = probes(messages, "question_answers").map((probe) => probe.response);
	assert.equal(first.behavior, "allow");
	assert.deepEqual(first.updatedInput.answers, {
		"Where should the template live?": "Journal/Templates/",
		"Which sections should it include?": "Wins, Next week's focus, Energy",
	});
	assert.equal(first.updatedInput.questions.length, 2, "the input is returned with its answers");
	assert.deepEqual(second.updatedInput.answers, { "What should the template be called?": "Week in review" });
	assert.ok(messages.some((m) => m.type === "assistant" && m.message.content[0].text.startsWith("answers: {")));
});

test("PRD-002.R3: the question scenario's process exits while its form waits", async () => {
	let asked = 0;
	const { close, messages } = await run({
		scenario: "question",
		send: "exit now",
		onPermission: () => {
			asked++;
			return new Promise(() => {});
		},
	});
	assert.equal(asked, 1);
	assert.equal(close.code, 3);
	assert.deepEqual(probes(messages, "question_answers"), []);
});
