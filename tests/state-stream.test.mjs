import { test } from "node:test";
import assert from "node:assert/strict";
import { finishStream, reduceStream, STREAM_IDLE } from "./.build/state/stream.mjs";

// Shaped from the parsing in src/view.ts and src/protocol/types.ts before
// DES-003 slice 7, not from a captured CLI stream.
const event = (inner, parent = null) => ({ type: "stream_event", event: inner, session_id: "s", parent_tool_use_id: parent });
const start = (type) => event({ type: "content_block_start", index: 0, content_block: { type } });
const stop = () => event({ type: "content_block_stop", index: 0 });
const textDelta = (text) => event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
const thinkingDelta = (thinking) =>
	event({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking } });
const assistant = (content, parent = null) => ({
	type: "assistant",
	session_id: "s",
	parent_tool_use_id: parent,
	message: { role: "assistant", content },
});
const user = (content, uuid, parent = null) => ({
	type: "user",
	uuid,
	session_id: "s",
	parent_tool_use_id: parent,
	message: { role: "user", content },
});
const result = { type: "result", subtype: "success", is_error: false, session_id: "s", duration_ms: 1200, total_cost_usd: 0.02 };

/** Every change the messages produce, in order, and the state they leave. */
function run(messages, state = STREAM_IDLE) {
	const changes = [];
	for (const message of messages) {
		const step = reduceStream(state, message);
		state = step.state;
		changes.push(...step.changes);
	}
	return { state, changes };
}

const types = (changes) => changes.map((change) => change.type);

test("PRD-001.R15: text deltas stream into one block, which the assistant message finalizes with its whole text", () => {
	const { state, changes } = run([start("text"), textDelta("Hel"), textDelta("lo"), stop(), assistant([{ type: "text", text: "Hello" }])]);
	assert.deepEqual(changes, [
		{ type: "text-open" },
		{ type: "text-delta", text: "Hel" },
		{ type: "text-delta", text: "lo" },
		{ type: "text-stop" },
		{ type: "text-done", text: "Hello" },
	]);
	assert.deepEqual(state, STREAM_IDLE);
});

test("PRD-001.R15: an open block keeps what its deltas brought, for a finalize without the assistant message", () => {
	const { state } = run([start("text"), textDelta("Hel"), textDelta("lo")]);
	assert.equal(state.text.buffer, "Hello");
	assert.equal(state.streaming, "text");
});

test("PRD-001.R15: a delta before its block's start opens the block, and the start then adopts it", () => {
	const { changes, state } = run([textDelta("Hi"), start("text"), textDelta("!"), stop()]);
	assert.deepEqual(types(changes), ["text-open", "text-delta", "text-delta", "text-stop"]);
	assert.equal(state.text.buffer, "Hi!");
});

test("PRD-001.R15: a text block starting while another waits for its message finalizes that one first", () => {
	const { changes } = run([start("text"), textDelta("One"), stop(), start("text"), textDelta("Two")]);
	assert.deepEqual(changes, [
		{ type: "text-open" },
		{ type: "text-delta", text: "One" },
		{ type: "text-stop" },
		{ type: "text-done", text: "One" },
		{ type: "text-open" },
		{ type: "text-delta", text: "Two" },
	]);
});

test("PRD-001.R15: without stream events each text block of the assistant message is a finished block", () => {
	assert.deepEqual(run([assistant("Plain")]).changes, [{ type: "text-done", text: "Plain" }]);
	assert.deepEqual(
		run([assistant([{ type: "text", text: "A" }, { type: "text", text: "" }, { type: "text", text: "B" }])]).changes,
		[
			{ type: "text-done", text: "A" },
			{ type: "text-done", text: "" },
			{ type: "text-done", text: "B" },
		]
	);
});

test("PRD-001.R15: thinking streams into its own block, timed from its start to its stop", () => {
	const { changes, state } = run([
		start("thinking"),
		thinkingDelta("Let me "),
		thinkingDelta("see"),
		stop(),
		assistant([{ type: "thinking", thinking: "Let me see." }]),
	]);
	assert.deepEqual(changes, [
		{ type: "thinking-open" },
		{ type: "thinking-delta", text: "Let me " },
		{ type: "thinking-delta", text: "see" },
		{ type: "thinking-stop" },
		{ type: "thinking-done", text: "Let me see." },
	]);
	assert.deepEqual(state, STREAM_IDLE);
});

test("PRD-001.R15: a thinking block whose message carries no text keeps what streamed", () => {
	const { changes } = run([start("thinking"), thinkingDelta("streamed"), stop(), assistant([{ type: "thinking", thinking: "" }])]);
	assert.deepEqual(changes.at(-1), { type: "thinking-done", text: "streamed" });
	assert.deepEqual(run([assistant([{ type: "thinking" }])]).changes, [{ type: "thinking-done", text: "" }]);
});

test("PRD-001.R15: a tool call's block stop ends no text or thinking; a block starting ends one still streaming", () => {
	const thinking = run([start("thinking"), thinkingDelta("x"), stop(), start("tool_use"), stop()]);
	assert.deepEqual(types(thinking.changes), ["thinking-open", "thinking-delta", "thinking-stop"]);
	assert.equal(thinking.state.thinking.buffer, "x", "still open until its message");
	const text = run([start("text"), textDelta("a"), start("tool_use"), stop()]);
	assert.deepEqual(types(text.changes), ["text-open", "text-delta", "text-stop"]);
});

test("PRD-001.R15: a tool call in the assistant message reaches its card, after the text before it", () => {
	const use = { type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.md" } };
	const message = assistant([{ type: "text", text: "Reading" }, use]);
	const { changes } = run([message]);
	assert.deepEqual(changes, [
		{ type: "text-done", text: "Reading" },
		{ type: "tool-use", block: use, message },
	]);
});

test("PRD-001.R15, PRD-002.R15: the turn's uuid is its first echo without a tool_result; every later prompt echo is reported too", () => {
	const results = user([{ type: "tool_result", tool_use_id: "t1", content: "ok" }], "u-result");
	const { changes, state } = run([
		results,
		user([{ type: "text", text: "Hi" }], "u-1"),
		user([{ type: "text", text: "mid-turn" }], "u-2"),
		user("plain", "u-3"),
	]);
	assert.deepEqual(changes, [
		{ type: "tool-results", parent: null, results: [{ toolUseId: "t1", isError: false, text: "ok", images: [] }] },
		{ type: "uuid", uuid: "u-1", first: true },
		{ type: "uuid", uuid: "u-2", first: false },
		{ type: "uuid", uuid: "u-3", first: false },
	]);
	assert.equal(state.uuid, true);
	assert.deepEqual(run([user("no uuid", undefined)]).changes, [], "an echo without a uuid gives none");
	const next = run([result, user([{ type: "text", text: "next" }], "u-4")], state);
	assert.deepEqual(next.changes.at(-1), { type: "uuid", uuid: "u-4", first: true }, "the next turn takes its own");
});

const STDOUT = (text, uuid) => ({ ...user(`<local-command-stdout>${text}</local-command-stdout>`, uuid), isReplay: true });
const PROMPT_A = "00000000-0000-4000-8000-00000000000a";
const PROMPT_B = "00000000-0000-4000-8000-00000000000b";
const REPLAY = "00000000-0000-4000-8000-0000000000ff";

test("PRD-001.R15, PRD-002.R15: a replayed <local-command-stdout> message is not a prompt echo", () => {
	assert.deepEqual(run([STDOUT("Set model to `sonnet`", "u-out")]).changes, []);
	assert.deepEqual(run([STDOUT("Compacted ", "u-out")]).changes, []);
	const text = "<local-command-stdout>x</local-command-stdout>";
	const blocks = { ...STDOUT("x", "u-out"), message: { role: "user", content: [{ type: "text", text }] } };
	assert.deepEqual(run([blocks]).changes, []);
	// An idle model change before a turn leaves the turn's first echo to its prompt.
	const idle = run([STDOUT("Set model to `sonnet`", "u-out"), user("Hi", "u-1")]);
	assert.deepEqual(idle.changes, [{ type: "uuid", uuid: "u-1", first: true }]);
	// Nor does the stdout message mark the turn as started.
	assert.equal(run([STDOUT("Compacted ", "u-out")]).state.uuid, false);
});

test("PRD-002.R15: a Branch after a mid-turn model change names the real prompt as last seen", async () => {
	const { latestPrompt } = await import("./.build/state/branch-history.mjs");
	// What the tab records for a turn: its first echo, and its last when it differs (chat-tab.ts).
	const record = (messages) => {
		const uuids = run(messages).changes.filter((change) => change.type === "uuid");
		const first = uuids.find((change) => change.first)?.uuid;
		const last = uuids.at(-1)?.uuid;
		return { kind: "meta", sessionId: "s1", ...(first ? { rewindUuid: first } : {}), ...(last && last !== first ? { lastPromptUuid: last } : {}) };
	};
	const turn = record([user("count to ten", PROMPT_B), STDOUT("Set model to `sonnet`", REPLAY), result]);
	assert.equal(turn.lastPromptUuid, undefined);
	assert.equal(latestPrompt([record([user("one", PROMPT_A), result]), turn], "s1"), PROMPT_B);
});

test("PRD-001.R15: the result finalizes open thinking, then open text, from what streamed", () => {
	const { changes, state } = run([start("thinking"), thinkingDelta("hm"), start("text"), textDelta("partial"), result]);
	assert.deepEqual(changes.slice(-3), [
		{ type: "thinking-done", text: "hm" },
		{ type: "text-done", text: "partial" },
		{ type: "result", message: result },
	]);
	assert.deepEqual(state, STREAM_IDLE);
});

test("PRD-001.R15: the session ending finalizes the open blocks and forgets the turn's uuid", () => {
	const { state } = run([user([{ type: "text", text: "Hi" }], "u-1"), start("text"), textDelta("cut")]);
	const end = finishStream(state);
	assert.deepEqual(end.changes, [{ type: "text-done", text: "cut" }]);
	assert.deepEqual(end.state, STREAM_IDLE);
	assert.deepEqual(finishStream(STREAM_IDLE).changes, []);
});

test("PRD-001.R18: subagent traffic goes to its thread; its stream events and its prompt are ignored", () => {
	const message = assistant([{ type: "text", text: "sub" }], "task-1");
	const results = user([{ type: "tool_result", tool_use_id: "t9", is_error: true }], "u-sub", "task-1");
	const prompt = user([{ type: "text", text: "Survey the notes" }], "u-prompt", "task-1");
	const { changes, state } = run([event({ type: "content_block_start", content_block: { type: "text" } }, "task-1"), prompt, message, results]);
	assert.deepEqual(changes, [
		{ type: "agent-message", parent: "task-1", message },
		{ type: "tool-results", parent: "task-1", results: [{ toolUseId: "t9", isError: true, text: null, images: [] }] },
	]);
	assert.equal(state.uuid, false, "a subagent's echo is not the turn's uuid");
});

test("PRD-001.R16: a result's text blocks are joined, and only base64 PNG, JPEG, GIF or WebP images are kept", () => {
	const png = { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBOR" } };
	const message = user(
		[
			{
				type: "tool_result",
				tool_use_id: "t1",
				content: [
					{ type: "text", text: "Screenshot" },
					png,
					{ type: "image", source: { type: "base64", media_type: "image/svg+xml", data: "PHN2Zz4=" } },
					{ type: "image", source: { type: "url", url: "https://example.com/a.png" } },
					{ type: "text", text: "taken" },
				],
			},
			{ type: "tool_result", tool_use_id: 7, content: "no id" },
		],
		undefined
	);
	assert.deepEqual(run([message]).changes, [
		{
			type: "tool-results",
			parent: null,
			results: [{ toolUseId: "t1", isError: false, text: "Screenshot\ntaken", images: [{ mediaType: "image/png", data: "iVBOR" }] }],
		},
	]);
});

test("PRD-001.R18: background-task messages become task events, with a finished agent's totals", () => {
	const started = { type: "system", subtype: "task_started", task_id: "k1", tool_use_id: "t1", description: "Watch", task_type: "local_agent" };
	const changed = { type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "k1", description: "Watch" }, { nope: 1 }, "x"] };
	const updated = { type: "system", subtype: "task_updated", task_id: "k1", patch: { status: "paused" } };
	const ended = {
		type: "system",
		subtype: "task_notification",
		task_id: "k1",
		tool_use_id: "t1",
		status: "completed",
		usage: { total_tokens: 4200, tool_uses: 7, duration_ms: 65000 },
	};
	assert.deepEqual(run([started, changed, updated, ended]).changes, [
		{ type: "task", event: { type: "started", task: { taskId: "k1", status: "running", description: "Watch", taskType: "local_agent", toolUseId: "t1" } } },
		{ type: "task", event: { type: "running", tasks: [{ taskId: "k1", status: "running", description: "Watch" }] } },
		{ type: "task", event: { type: "updated", taskId: "k1", status: "paused" } },
		{ type: "task", event: { type: "ended", taskId: "k1", toolUseId: "t1", report: { status: "completed", tokens: 4200, toolUses: 7, durationMs: 65000 } } },
	]);
	const bare = { type: "system", subtype: "task_notification", usage: { total_tokens: "many" } };
	assert.deepEqual(run([bare]).changes, [
		{ type: "task", event: { type: "ended", taskId: null, toolUseId: null, report: { status: null, tokens: null, toolUses: null, durationMs: null } } },
	]);
	assert.deepEqual(run([{ type: "system", subtype: "task_started" }, { type: "system", subtype: "task_updated" }]).changes, [], "no task id");
});

test("DES-003: system messages pass on by subtype; other message types change nothing", () => {
	const init = { type: "system", subtype: "init", session_id: "s", model: "m" };
	const status = { type: "system", subtype: "status", permissionMode: "plan" };
	assert.deepEqual(run([init, status]).changes, [
		{ type: "init", message: init },
		{ type: "system", subtype: "status", message: status },
	]);
	assert.deepEqual(run([{ type: "rate_limit_event" }, { type: "stream_event", event: { type: "message_start" } }]).changes, []);
});

// Shapes from the E3 and V5 records (docs/records/verification/2026-10-13-*).
test("PRD-001.R37: the compaction messages become compaction changes, the other status messages stay system changes", () => {
	const { changes } = run([
		{ type: "system", subtype: "status", status: "compacting", compact_output_chars: 0 },
		{ type: "system", subtype: "status", status: null, compact_result: "success" },
		{ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: 81240, post_tokens: 13763 } },
		{ type: "system", subtype: "status", status: "requesting" },
	]);
	assert.deepEqual(changes, [
		{ type: "compaction", signal: { type: "compacting" } },
		{ type: "compaction", signal: { type: "success" } },
		{ type: "compaction", signal: { type: "boundary", trigger: "auto", preTokens: 81240, postTokens: 13763 } },
		{ type: "system", subtype: "status", message: { type: "system", subtype: "status", status: "requesting" } },
	]);
});

test("PRD-001.R37: the synthetic summary is a compaction change, never the turn's prompt uuid", () => {
	const summary = { ...user("Summary: kept the plan", "u-summary"), isSynthetic: true };
	const { changes, state } = run([summary, user("hello", "u-real")]);
	assert.deepEqual(changes, [
		{ type: "compaction", signal: { type: "summary", text: "Summary: kept the plan" } },
		{ type: "uuid", uuid: "u-real", first: true },
	]);
	assert.equal(state.uuid, true);
});

test("PRD-001.R37: a synthetic message with no text changes nothing and is not the turn's uuid", () => {
	const { changes, state } = run([{ ...user([{ type: "image" }], "u-x"), isSynthetic: true }]);
	assert.deepEqual(changes, []);
	assert.equal(state.uuid, false);
});
