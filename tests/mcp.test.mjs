import test from "node:test";
import assert from "node:assert/strict";

const { McpServer, textResult, errorResult, requireString, optionalNumber } = await import(
	"./.build/mcp/server.mjs"
);
const { parseQuery, matchesQuery, normalizeProperties, searchLimit } = await import(
	"./.build/mcp/query.mjs"
);
const { renameReply, unadoptedMcp } = await import("./.build/mcp/replies.mjs");
const { renameTargetError, renameTargetPath } = await import("./.build/mcp/paths.mjs");

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

test("PRD-004.R2: a message that is not a JSON object is refused, not answered with null", async () => {
	// The client turns the throw into a control error; null would pass as a
	// notification and answer the control request with success.
	for (const message of [null, undefined, [], [{ method: "ping", id: 1 }], 7, "ping", true])
		await assert.rejects(
			() => server().handle(message),
			/mcp_message carried no JSON-RPC message/,
			JSON.stringify(message) ?? "undefined"
		);
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

test("PRD-004.R5: the search limit is a whole number from 1 to 200, default 50", () => {
	for (const [value, want] of [
		[undefined, 50],
		[10, 10],
		[1, 1],
		[200, 200],
		[201, 200],
		[1e9, 200],
		[2.9, 2],
		[0.5, 1],
		[0, 1],
		[-3, 1],
		[-0.7, 1],
		[Number.NaN, 50],
		[Number.POSITIVE_INFINITY, 50],
		[Number.NEGATIVE_INFINITY, 50],
	])
		assert.equal(searchLimit(value), want, String(value));
	// As the tool reads it, through optionalNumber: only a finite number counts.
	for (const raw of ["7", null, true, {}, []])
		assert.equal(searchLimit(optionalNumber({ limit: raw }, "limit")), 50, String(raw));
});

// ---- the rename reply ------------------------------------------------------

test("PRD-004.R7: the rename reply counts the notes that linked and leaves link updates to the user's preference", () => {
	assert.equal(
		renameReply("notes/Old.md", "archive/Old.md", 3),
		"Renamed notes/Old.md → archive/Old.md. 3 note(s) linked to it; " +
			"Obsidian updates those links as the user's link-update setting directs."
	);
	assert.equal(
		renameReply("Old.md", "New.md", 0),
		"Renamed Old.md → New.md. Nothing linked to it."
	);
	assert.doesNotMatch(renameReply("a.md", "b.md", 1), /updated/);
});

// ---- the rename target ------------------------------------------------------

const CONFIG = ".obsidian";

test("PRD-004.R7: a rename target that is absolute, has a drive letter or a UNC root is refused", () => {
	for (const target of [
		"/x.md",
		"/etc/cron.d/x",
		"\\x.md",
		"\\\\server\\share\\x.md",
		"//server/share/x.md",
		"C:/x.md",
		"C:\\x.md",
		"c:x.md",
		"Z:",
	]) {
		const error = renameTargetError(target, CONFIG);
		assert.match(error ?? "", /vault-relative/, target);
	}
});

test("PRD-004.R7: a rename target with a .. segment is refused, with either separator", () => {
	for (const target of [
		"..",
		"../x.md",
		"a/../b.md",
		"a/..",
		"a\\..\\b.md",
		"a/b/../../../x.md",
		"a/.. /b.md",
		"notes/..\\x.md",
	]) {
		const error = renameTargetError(target, CONFIG);
		assert.match(error ?? "", /vault-relative/, target);
	}
});

test("PRD-004.R7: a rename target that names no file is refused", () => {
	for (const target of [".", "./", ".\\", "./.", "././", ".//."])
		assert.match(renameTargetError(target, CONFIG) ?? "", /name a file/, target);
});

test("PRD-004.R7: dots inside a segment name are not a .. segment", () => {
	for (const target of ["a..md", "notes/v1.2..3.md", "a/b../c.md", "notes/a.b.md", "a.b/c.d.md"])
		assert.equal(renameTargetError(target, CONFIG), null, target);
	// Dots at the start make a hidden name, refused for that (below), not as a parent.
	for (const target of ["..a.md", "a/..b/c.md", "notes/...md"])
		assert.match(renameTargetError(target, CONFIG) ?? "", /hidden/, target);
});

test("PRD-004.R7: a rename target in the configuration folder is refused however it is written", () => {
	for (const target of [
		".obsidian",
		".obsidian/x.md",
		".obsidian/plugins/p/main.js",
		".obsidian/snippets/x.css",
		".OBSIDIAN/x.md",
		".Obsidian/Plugins/P/main.js",
		".obsidian\\x.md",
		".OBSIDIAN\\plugins\\p\\main.js",
		"./.obsidian/x.md",
		".//.obsidian/x.md",
		".\\.obsidian\\x.md",
		"././.obsidian/x.md",
		".obsidian//x.md",
		".obsidian/./x.md",
		".obsidian/",
		".obsidian.",
		".obsidian/x.md.",
		".obsidian /x.md",
		".obsidian\u00a0/x.md",
		".obsidian\u202f/x.md",
		".obsidian:stream/x.md",
		".obsidian::$INDEX_ALLOCATION/x.md",
	]) {
		const error = renameTargetError(target, CONFIG);
		assert.match(error ?? "", /configuration folder \(\.obsidian\)/, target);
	}
});

test("PRD-004.R7: case and invisible-character aliases of the configuration folder are refused", () => {
	for (const target of [
		".ob\u017fidian/plugins/x/main.js", // long s: uppercases to S
		".OB\u017fIDIAN/x.md",
		".obs\u200cidian/x.md", // zero-width non-joiner
		".obs\u200bidian/x.md",
		".obs\u00adidian/x.md", // soft hyphen
		".obsidian\u2060/x.md", // word joiner
		".obs\ufe0fidian/x.md", // variation selector
	])
		assert.match(renameTargetError(target, CONFIG) ?? "", /configuration folder/, JSON.stringify(target));
});

test("PRD-004.R7: a segment named like a Windows 8.3 short name is refused, at any depth, the file name included", () => {
	for (const target of [
		"OBSIDI~1/x.md",
		"OBSIDI~1/plugins/x/main.js",
		"obsidi~1/x.md",
		"Obsidi~1\\x.md",
		"OBSIDI~2/x.md",
		"OB1234~1/x.md", // hashed form
		"./OBSIDI~1/x.md",
		"OBSIDI~1.x/y.md",
		"CLAUDE~1/settings.local.json", // short name of .claude
		"GIT~1/hooks/pre-commit", // short name of .git
		"a/OBSIDI~1/x.md",
		"projects/app/GIT~1/hooks/pre-commit", // a nested repository
		"projects/app/CLAUDE~1/rules/x.md",
		"a/b/c/OB1234~1/d/x.md",
		// A file name too: on NTFS the short name of .mcp.json opens that file.
		"MCP~1.JSO",
		"mcp~1.jso",
		"Draft~1.md",
		"OBSIDI~1.md",
		"a/OBSIDI~1.md",
		"projects/app/Draft~1.md",
		"projects/app/OBSIDI~1",
	])
		assert.match(renameTargetError(target, CONFIG) ?? "", /hidden/, target);
	// Not the shape of a short name: more than six characters before the tilde, a long extension, no digits.
	for (const target of [
		"Meeting~1.md",
		"Draft~1.markdown",
		"Obsidian~/x.md",
		"LONGNAME~1/x.md",
		"notes~1x/y.md",
		"~1/x.md",
		"a/Obsidian~/x.md",
	])
		assert.equal(renameTargetError(target, CONFIG), null, target);
});

test("PRD-004.R7: a path that climbs out and back into the configuration folder is refused", () => {
	for (const target of ["a/../.obsidian/x.md", "a/..\\.OBSIDIAN\\x.md", "notes/../../.obsidian/x.md"])
		assert.notEqual(renameTargetError(target, CONFIG), null, target);
});

test("PRD-004.R7: the configuration folder is compared as Unicode text, case-folded", () => {
	// A decomposed target against a composed configuration folder, and back.
	assert.match(renameTargetError(".bu\u0308cher/x.md", ".b\u00fccher") ?? "", /configuration folder/);
	assert.match(renameTargetError(".b\u00fccher/x.md", ".bu\u0308cher") ?? "", /configuration folder/);
	assert.match(renameTargetError(".B\u00dcCHER/x.md", ".b\u00fccher") ?? "", /configuration folder/);
});

test("PRD-004.R7: the configuration folder is whatever the vault names it", () => {
	assert.match(renameTargetError(".obsidian/x.md", ".OBSIDIAN") ?? "", /configuration folder/);
	assert.match(renameTargetError(".config/x.md", ".config") ?? "", /\(\.config\)/);
	// Another dot folder is not the configuration folder, but is hidden all the same.
	for (const [target, config] of [
		[".obsidian/x.md", ".config"],
		[".config/x.md", ".obsidian"],
	]) {
		const error = renameTargetError(target, config) ?? "";
		assert.match(error, /hidden/, target);
		assert.doesNotMatch(error, /configuration folder/, target);
	}
	// A configuration folder without a leading dot is still guarded, under its own text.
	assert.match(renameTargetError("vault-config/x.md", "vault-config") ?? "", /\(vault-config\)/);
	assert.match(renameTargetError("Vault-Config/plugins/x", "vault-config") ?? "", /configuration folder/);
	assert.equal(renameTargetError("notes/vault-config.md", "vault-config"), null);
});

test("PRD-004.R7: a configuration folder that folds to nothing still guards, and an empty one refuses all", () => {
	assert.match(renameTargetError(".../x.md", "...") ?? "", /configuration folder/);
	assert.match(renameTargetError("./.../x.md", "...") ?? "", /configuration folder/);
	assert.equal(renameTargetError("x.md", "..."), null);
	// Other dot-only segments are hidden names, not the configuration folder.
	assert.match(renameTargetError("a/.../x.md", "...") ?? "", /hidden/);
	assert.match(renameTargetError(". ./x.md", "...") ?? "", /hidden/);
	// No segments: every target lies under it, so nothing passes.
	assert.match(renameTargetError("x.md", "") ?? "", /configuration folder/);
});

test("PRD-004.R7: ordinary rename targets pass", () => {
	for (const target of [
		"New.md",
		"notes/New.md",
		"archive/2026/Old idea.md",
		"./notes/New.md",
		"notes/./New.md",
		"obsidian/x.md",
		"notes/a.b.md",
		"notes/v1.2.md",
		"a.b/c.d.md",
		"a./b.md",
		"Notizen/\u00dcbersicht.md",
		"notes/a;b.md",
		"notes/a,b (2).md",
		"notes/caf\u00e9 & co.md",
		"notes/#tag ^ [x].md",
		"a/b\u200b.c/x.md", // an invisible character inside a name changes nothing
	])
		assert.equal(renameTargetError(target, CONFIG), null, target);
});

test("PRD-004.R7: a rename target with a character Obsidian forbids in a name is refused", () => {
	for (const target of [
		"notes/c:d.md", // on NTFS, stream d.md of notes/c
		"notes/c:d/x.md",
		"cc:d.md", // c:d.md is a drive letter, a shape error
		"what?.md",
		"a|b.md",
		'say "hi".md',
		"<x>.md",
		"star*/x.md",
		"notes/x.md:stream",
	])
		assert.match(renameTargetError(target, CONFIG) ?? "", /character Obsidian forbids/, target);
	// The config-folder and hidden checks come first and keep their own errors.
	assert.match(renameTargetError(".obsidian:stream/x.md", CONFIG) ?? "", /configuration folder/);
	assert.match(renameTargetError(".mcp.json:stream", CONFIG) ?? "", /hidden/);
	assert.match(renameTargetError("OBSIDI~1:x/y.md", CONFIG) ?? "", /hidden/);
});

test("PRD-004.R7: a rename target with a hidden folder or file name is refused", () => {
	for (const target of [
		".claude/settings.local.json",
		".claude/hooks/pre.sh",
		".claude",
		".git/hooks/pre-commit",
		".git/config",
		".git",
		".github/workflows/x.yml",
		".mcp.json",
		".env",
		".envrc",
		".gitignore",
		"notes/.hidden/x.md",
		"notes/.env",
		"notes/.hidden.md",
		"a/b/.c/d.md",
		"a/.b/c/d.md",
		".obsidian-notes/x.md",
		".obsidian2/x.md",
		".obsidianx",
		"x/.obsidian/y.md",
		".hidden/x.md",
		"a/.obsidian/OBSIDI~1/x.md",
	]) {
		const error = renameTargetError(target, CONFIG) ?? "";
		assert.match(error, /hidden/, target);
		assert.doesNotMatch(error, /configuration folder/, target);
	}
});

test("PRD-004.R7: a hidden name is refused however it is written", () => {
	for (const target of [
		".CLAUDE/settings.json",
		".Git/Hooks/pre-commit",
		".claude\\settings.json",
		".git\\hooks\\pre-commit",
		"./.claude/x.md",
		".//.git/hooks/pre-commit",
		".\\.claude\\x.md",
		"././.mcp.json",
		"notes//.hidden/x.md",
		"notes/./.hidden/x.md",
		".claude/",
		".claude.",
		".claude../x.md",
		".claude /x.md",
		".claude\u00a0/x.md",
		".claude:stream/x.md",
		".mcp.json:stream",
		".git::$INDEX_ALLOCATION/hooks/x",
		".cla\u200bude/x.md", // zero-width space inside
		".cl\u00adaude/x.md", // soft hyphen
		// Characters HFS+ ignores in a name, before the dot.
		"\u200c.claude/x.md",
		"\u200d.claude/x.md",
		"\u200f.claude/x.md",
		"\u202e.git/hooks/pre-commit",
		"\u206a.claude/x.md",
		"\ufeff.mcp.json",
		"notes/\u200c.hidden/x.md",
	])
		assert.match(renameTargetError(target, CONFIG) ?? "", /hidden/, JSON.stringify(target));
});

test("PRD-004.R7: a name no file system reads as starting with a dot is not hidden", () => {
	// Win32 and Obsidian's normalizePath trim no leading character, and no file
	// system ignores these: each is a different name from the dot name.
	for (const target of [
		" .claude/x.md",
		"\u00a0.claude/x.md",
		"\t.git/hooks/x",
		"notes/ .hidden/x.md",
		"\u200b.claude/x.md", // zero-width space
		"\u2060.git/hooks/pre-commit", // word joiner
		"\u00ad.mcp.json", // soft hyphen
		" .../x.md",
		"\u200b.../x.md",
	])
		assert.equal(renameTargetError(target, CONFIG), null, JSON.stringify(target));
});

test("PRD-004.R7: a segment of only dots is hidden, whatever its length", () => {
	// "..." is a legal name on Unix and starts with a dot, so it is refused like any hidden name.
	for (const target of [
		"a/.../b.md",
		".../x.md",
		".../.obsidian/x.md",
		"a/..../b.md",
		"x/...",
		". ./x.md",
		". .",
		"a/. ./b.md",
		"..\u200b/x.md",
		"\u200c.../x.md",
	])
		assert.match(renameTargetError(target, CONFIG) ?? "", /hidden/, JSON.stringify(target));
});

test("PRD-004.R7: a parent segment is a shape error, a hidden name is not", () => {
	for (const target of ["../x.md", ".claude/../x.md", "a/../.git/hooks/x"])
		assert.match(renameTargetError(target, CONFIG) ?? "", /vault-relative/, target);
	assert.match(renameTargetError(".obsidian/x.md", CONFIG) ?? "", /configuration folder/);
	assert.match(renameTargetError(".claude/x.md", CONFIG) ?? "", /hidden/);
});

test("PRD-004.R7: the rename target path drops empty and . segments, so ./a/b.md is a/b.md", () => {
	for (const [given, want] of [
		["notes/New.md", "notes/New.md"],
		["./notes/New.md", "notes/New.md"],
		["notes//New.md", "notes/New.md"],
		["notes\\New.md", "notes/New.md"],
		[".\\notes\\.\\New.md", "notes/New.md"],
		["notes/New.md/", "notes/New.md"],
		["a/.../b.md", "a/.../b.md"],
		[".hidden/x.md", ".hidden/x.md"],
		["New.md", "New.md"],
		[".", ""],
		["./", ""],
	])
		assert.equal(renameTargetPath(given), want, given);
});

test("PRD-001.R38: before an Undo's CLI is the tab's, only the handshake, notifications and tool discovery reach the vault server", () => {
	for (const method of ["initialize", "notifications/initialized", "notifications/cancelled", "tools/list"]) {
		assert.deepEqual(unadoptedMcp({ jsonrpc: "2.0", id: 1, method }), { allow: true }, method);
	}
});

test("PRD-001.R38: before adoption a tool call, any other request and a malformed message get a JSON-RPC error, never the server", () => {
	const call = unadoptedMcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "obsidian_rename", arguments: {} } });
	assert.equal(call.allow, false);
	assert.equal(call.reply.id, 7);
	assert.equal(call.reply.jsonrpc, "2.0");
	assert.equal(typeof call.reply.error.code, "number");
	assert.equal(unadoptedMcp({ jsonrpc: "2.0", id: "a", method: "resources/read" }).reply.id, "a");
	assert.equal(unadoptedMcp({ jsonrpc: "2.0", method: "tools/call" }).reply, null, "a notification gets no reply");
	assert.equal(unadoptedMcp("tools/call").allow, false);
	assert.equal(unadoptedMcp(null).allow, false);
	assert.equal(unadoptedMcp({ id: 3, method: 5 }).allow, false);
});
