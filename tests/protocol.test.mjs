import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { ClaudeClient, cliSpawnSpec } = await import("./.build/protocol/client.mjs");

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

test("optional spawn flags appear only when configured", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: {
			model: "sonnet",
			effort: "high",
			permissionMode: "acceptEdits",
			resumeSessionId: "abc",
		},
	});
	const flags = probes(messages, "argv")[0].argv;
	const pair = (flag) => flags[flags.indexOf(flag) + 1];
	assert.equal(pair("--model"), "sonnet");
	assert.equal(pair("--effort"), "high");
	assert.equal(pair("--permission-mode"), "acceptEdits");
	assert.equal(pair("--resume"), "abc");
	assert.equal(flags.includes("--allow-dangerously-skip-permissions"), false);
});

test("default permission mode is not passed as a flag", async () => {
	const { messages } = await run({
		scenario: "basic",
		options: { permissionMode: "default" },
	});
	const flags = probes(messages, "argv")[0].argv;
	assert.equal(flags.includes("--permission-mode"), false);
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
	assert.equal(result.session_id, "fake-session-1");
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
		{ name: "MCP tools (deferred)", tokens: 67_000, isDeferred: true },
		{ name: "no tokens" },
		{ tokens: 100 },
		{ name: 7, tokens: 100 },
	]);
	assert.deepEqual(kept, [{ name: "MCP tools", tokens: 67_000, deferred: true }]);
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

test("cliSpawnSpec leaves the WSL wrapping unchanged", () => {
	const spec = cliSpawnSpec(
		{ cliPath: "claude", cwd: "C:\\vault", useWsl: true },
		["--verbose"],
		"win32"
	);
	assert.equal(spec.command, "wsl.exe");
	assert.deepEqual(spec.args, ["--cd", "C:\\vault", "--", "claude", "--verbose"]);
	assert.equal(spec.shell, false);
	assert.equal(spec.cwd, undefined);
});
