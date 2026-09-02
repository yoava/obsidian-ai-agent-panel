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
const ok = (request_id, response) =>
	out({ type: "control_response", response: { subtype: "success", request_id, response } });

const SESSION = "fake-session-1";
let nextId = 0;
const pendingOurs = new Map();
function ask(request, onReply) {
	const request_id = `cli_${++nextId}`;
	pendingOurs.set(request_id, onReply);
	out({ type: "control_request", request_id, request });
	return request_id;
}

// Report our own argv so the test can assert on spawn flags.
probe("argv", { argv: process.argv.slice(2) });

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
	if (msg.type === "control_response") {
		const reply = pendingOurs.get(msg.response.request_id);
		pendingOurs.delete(msg.response.request_id);
		probe("got_control_response", { response: msg.response });
		if (reply) reply(msg.response);
		return;
	}

	if (msg.type === "control_request") {
		const sub = msg.request.subtype;
		// Reported as `sub`, not `subtype`: the probe envelope already uses
		// `subtype` and would be overwritten.
		probe("got_control_request", { sub, request: msg.request });
		if (sub === "initialize") {
			ok(msg.request_id, { ready: true });
			return;
		}
		if (sub === "interrupt" || sub === "set_permission_mode" || sub === "set_model") {
			ok(msg.request_id, {});
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
	probe("got_user_turn", { text, session_id: msg.session_id });
	void runTurn(text);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runTurn(text) {
	out({
		type: "system",
		subtype: "init",
		session_id: SESSION,
		cwd: process.cwd(),
		model: "fake-model-1",
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

	if (scenario === "permission") {
		ask(
			{
				subtype: "can_use_tool",
				tool_name: "Edit",
				input: { file_path: "note.md", old_string: "a", new_string: "b" },
				permission_suggestions: [{ type: "addRules" }],
				tool_use_id: "toolu_fake",
			},
			(response) => {
				probe("permission_decision", { response: response.response });
				finish();
			}
		);
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

	if (scenario === "crash") {
		process.stderr.write("fake cli exploded\nsecond stderr line\n");
		process.exit(3);
	}

	out({
		type: "assistant",
		session_id: SESSION,
		parent_tool_use_id: null,
		message: { role: "assistant", content: [{ type: "text", text: `echo: ${text}` }] },
	});
	finish();
}

function finish() {
	out({
		type: "result",
		subtype: "success",
		is_error: false,
		session_id: SESSION,
		duration_ms: 1,
		total_cost_usd: 0.001,
	});
}
