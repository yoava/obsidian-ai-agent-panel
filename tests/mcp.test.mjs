import test from "node:test";
import assert from "node:assert/strict";

const { McpServer, textResult, errorResult, requireString } = await import(
	"./.build/mcp/server.mjs"
);
const { parseQuery, matchesQuery, normalizeProperties } = await import(
	"./.build/mcp/query.mjs"
);

function server(tools = []) {
	return new McpServer({ name: "obsidian", version: "1.2.3" }, tools);
}

const echoTool = {
	name: "obsidian_echo",
	description: "Echo.",
	inputSchema: { type: "object", properties: { text: { type: "string" } } },
	async handler(args) {
		return textResult(`echo:${args.text ?? ""}`);
	},
};

// ---- the handshake, exactly as a real CLI performs it ---------------------
// The messages below mirror the CLI's own MCP handshake over the mcp_message transport.

test("initialize echoes the client's protocol version and advertises only tools", async () => {
	const reply = await server([echoTool]).handle({
		method: "initialize",
		params: {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: "claude-code", version: "2.1.220" },
		},
		jsonrpc: "2.0",
		id: 0,
	});
	assert.equal(reply.jsonrpc, "2.0");
	assert.equal(reply.id, 0);
	assert.equal(reply.result.protocolVersion, "2025-11-25");
	assert.deepEqual(reply.result.capabilities, { tools: {} });
	assert.deepEqual(reply.result.serverInfo, { name: "obsidian", version: "1.2.3" });
});

test("initialize without a protocol version still answers", async () => {
	const reply = await server().handle({ method: "initialize", jsonrpc: "2.0", id: 1 });
	assert.equal(typeof reply.result.protocolVersion, "string");
});

test("instructions are included only when set", async () => {
	const withText = new McpServer(
		{ name: "obsidian", version: "1", instructions: "Use me." },
		[]
	);
	const a = await withText.handle({ method: "initialize", id: 1 });
	assert.equal(a.result.instructions, "Use me.");
	const b = await server().handle({ method: "initialize", id: 1 });
	assert.equal("instructions" in b.result, false);
});

test("notifications/initialized is answered with null, not an error", async () => {
	// The CLI's transport feeds whatever comes back into its MCP client, so a
	// notification must produce nothing at all.
	const reply = await server().handle({ method: "notifications/initialized", jsonrpc: "2.0" });
	assert.equal(reply, null);
});

test("any message without an id is treated as a notification", async () => {
	assert.equal(await server().handle({ method: "tools/list", jsonrpc: "2.0" }), null);
	assert.equal(await server().handle({ method: "whatever" }), null);
});

test("tools/list returns name, description and schema only", async () => {
	const reply = await server([echoTool]).handle({ method: "tools/list", jsonrpc: "2.0", id: 1 });
	assert.equal(reply.result.tools.length, 1);
	const [tool] = reply.result.tools;
	assert.deepEqual(Object.keys(tool).sort(), ["description", "inputSchema", "name"]);
	assert.equal(tool.name, "obsidian_echo");
});

test("tools/call runs the handler and returns its content", async () => {
	const reply = await server([echoTool]).handle({
		method: "tools/call",
		params: {
			name: "obsidian_echo",
			arguments: { text: "hi" },
			_meta: { "claudecode/toolUseId": "toolu_1", progressToken: 2 },
		},
		jsonrpc: "2.0",
		id: 2,
	});
	assert.deepEqual(reply.result, { content: [{ type: "text", text: "echo:hi" }] });
});

test("tools/call with no arguments object still calls the handler", async () => {
	const reply = await server([echoTool]).handle({
		method: "tools/call",
		params: { name: "obsidian_echo" },
		id: 3,
	});
	assert.equal(reply.result.content[0].text, "echo:");
});

test("id 0 is a real id, not a missing one", async () => {
	const reply = await server().handle({ method: "ping", jsonrpc: "2.0", id: 0 });
	assert.ok(reply, "id 0 must be answered");
	assert.equal(reply.id, 0);
});

// ---- failure handling -----------------------------------------------------

test("an unknown tool is a JSON-RPC error", async () => {
	const reply = await server([echoTool]).handle({
		method: "tools/call",
		params: { name: "nope" },
		id: 4,
	});
	assert.equal(reply.error.code, -32601);
	assert.match(reply.error.message, /Unknown tool: nope/);
});

test("an unknown method is a JSON-RPC error", async () => {
	const reply = await server().handle({ method: "resources/list", id: 5 });
	assert.equal(reply.error.code, -32601);
});

test("a thrown handler becomes a tool error the model can read, not a protocol error", async () => {
	const throwing = {
		name: "obsidian_boom",
		description: "",
		inputSchema: { type: "object" },
		async handler() {
			throw new Error("disk on fire");
		},
	};
	const reply = await server([throwing]).handle({
		method: "tools/call",
		params: { name: "obsidian_boom" },
		id: 6,
	});
	assert.equal(reply.error, undefined);
	assert.equal(reply.result.isError, true);
	assert.match(reply.result.content[0].text, /obsidian_boom failed: disk on fire/);
});

test("a missing tool name is an invalid-params error", async () => {
	const reply = await server([echoTool]).handle({
		method: "tools/call",
		params: {},
		id: 7,
	});
	assert.equal(reply.error.code, -32602);
});

test("requireString rejects blanks and non-strings", () => {
	assert.equal(requireString({ path: "a.md" }, "path").value, "a.md");
	assert.equal(requireString({ path: "  a.md  " }, "path").value, "a.md");
	assert.equal(requireString({ path: "  " }, "path").ok, false);
	assert.equal(requireString({}, "path").ok, false);
	assert.equal(requireString({ path: 7 }, "path").ok, false);
});

test("errorResult flags itself so the model knows it failed", () => {
	assert.equal(errorResult("nope").isError, true);
	assert.equal(textResult("fine").isError, undefined);
});

// ---- the search query language -------------------------------------------

const note = (over = {}) => ({
	path: "projects/Alpha.md",
	basename: "Alpha",
	tags: ["project", "work/active"],
	headings: ["roadmap", "open questions"],
	properties: { status: ["doing"], due: ["2026-08-01"] },
	...over,
});

const matches = (query, facts = note()) => matchesQuery(parseQuery(query), facts);

test("an empty query matches nothing rather than everything", () => {
	assert.equal(matches(""), false);
	assert.equal(matches("   "), false);
});

test("tags match with or without the hash, and nested tags match their parent", () => {
	assert.equal(matches("tag:project"), true);
	assert.equal(matches("tag:#project"), true);
	assert.equal(matches("tag:PROJECT"), true);
	assert.equal(matches("tag:work"), true, "work/active should match tag:work");
	assert.equal(matches("tag:work/active"), true);
	assert.equal(matches("tag:wor"), false, "partial tag names must not match");
});

test("headings match as substrings and quoting keeps spaces", () => {
	assert.equal(matches("heading:roadmap"), true);
	assert.equal(matches('heading:"open questions"'), true);
	assert.equal(matches("heading:questions"), true);
	assert.equal(matches("heading:missing"), false);
});

test("properties can be tested for existence or for a value", () => {
	assert.equal(matches("prop:status"), true);
	assert.equal(matches("prop:status=doing"), true);
	assert.equal(matches("prop:status=done"), false);
	assert.equal(matches("prop:nonexistent"), false);
	assert.equal(matches("property:due=2026-08-01"), true);
});

test("folder matches the containing folder and its descendants", () => {
	assert.equal(matches("folder:projects"), true);
	assert.equal(matches("folder:projects/"), true);
	assert.equal(matches("folder:proj"), false, "folders match whole segments");
	assert.equal(matches("folder:projects", note({ path: "projects/sub/B.md" })), true);
	assert.equal(matches("folder:projects", note({ path: "other/B.md" })), false);
});

test("bare words match the note name or path", () => {
	assert.equal(matches("alpha"), true);
	assert.equal(matches("projects"), true);
	assert.equal(matches("zebra"), false);
});

test("every term must hold", () => {
	assert.equal(matches("tag:project prop:status=doing"), true);
	assert.equal(matches("tag:project prop:status=done"), false);
});

test("a leading minus negates any term", () => {
	assert.equal(matches("-tag:archive"), true);
	assert.equal(matches("-tag:project"), false);
	assert.equal(matches("tag:project -prop:status=done"), true);
	assert.equal(matches("-folder:other"), true);
});

test("an unrecognized field is matched as text and reported", () => {
	const parsed = parseQuery("titel:alpha");
	assert.deepEqual(parsed.unknownFields, ["titel"]);
	assert.equal(parsed.terms[0].field, "text");
	// It still behaves sensibly rather than silently matching nothing.
	assert.equal(matchesQuery(parsed, note()), false);
});

test("a filter with no value is dropped rather than matching everything", () => {
	const parsed = parseQuery("tag:");
	assert.deepEqual(parsed.terms, []);
	assert.equal(matchesQuery(parsed, note()), false);
});

test("frontmatter is normalized to lower-cased string lists", () => {
	assert.deepEqual(
		normalizeProperties({
			Status: "Doing",
			Tags: ["Work", "Home"],
			Count: 3,
			Nested: { a: 1 },
			Empty: null,
		}),
		{
			status: ["doing"],
			tags: ["work", "home"],
			count: ["3"],
			nested: ['{"a":1}'],
			empty: [],
		}
	);
	assert.deepEqual(normalizeProperties(undefined), {});
});

test("properties survive normalization for matching", () => {
	const facts = note({ properties: normalizeProperties({ Status: "Done", Due: null }) });
	assert.equal(matches("prop:status=done", facts), true);
	assert.equal(matches("prop:due", facts), true, "a null property still exists");
});
