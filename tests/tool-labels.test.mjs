import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
	CHROME_MCP_SERVER,
	OBSIDIAN_MCP_SERVER,
	jsonPreview,
	obsidianToolPrompt,
	parseAskUserQuestions,
	planOf,
	resultCount,
	toolIcon,
	summarizeToolInput,
	toolDisplayName,
} = await import("./.build/tool-labels.mjs");

const prompt = (tool, input = {}) => obsidianToolPrompt(`mcp__obsidian__${tool}`, input);

// Server names ---------------------------------------------------------------

test("PRD-004.R10: the panel's own tools appear as mcp__obsidian__<tool>", () => {
	assert.equal(OBSIDIAN_MCP_SERVER, "obsidian");
	assert.equal(CHROME_MCP_SERVER, "claude-in-chrome");
});

// Display name ----------------------------------------------------------------

test("PRD-001.R16: an MCP tool is named by its server label and tool name", () => {
	assert.equal(toolDisplayName("mcp__claude-in-chrome__navigate"), "Chrome · navigate");
	assert.equal(toolDisplayName("mcp__obsidian__obsidian_rename"), "Obsidian · rename");
	assert.equal(toolDisplayName("mcp__obsidian__search"), "Obsidian · search");
});

test("PRD-001.R16: another server shows its id, and drops only its own repeated prefix", () => {
	assert.equal(toolDisplayName("mcp__github__create_issue"), "github · create_issue");
	assert.equal(toolDisplayName("mcp__github__github_search"), "github · search");
	assert.equal(toolDisplayName("mcp__github__obsidian_search"), "github · obsidian_search");
	// The first `__` after the server ends it; the rest is the tool.
	assert.equal(toolDisplayName("mcp__srv__a__b"), "srv · a__b");
});

test("PRD-001.R16: a name that is not mcp__<server>__<tool> is unchanged", () => {
	for (const name of ["Bash", "Read", "Task", "mcp__obsidian", "mcp__obsidian__", "obsidian_rename", ""]) {
		assert.equal(toolDisplayName(name), name, name);
	}
});

// Summary ---------------------------------------------------------------------

test("PRD-001.R16: the summary is the first non-empty of path, command, pattern, URL, then description", () => {
	assert.equal(summarizeToolInput("Read", { file_path: "a.md" }), "a.md");
	assert.equal(summarizeToolInput("mcp__obsidian__obsidian_open", { path: "b.md" }), "b.md");
	assert.equal(summarizeToolInput("NotebookEdit", { notebook_path: "n.ipynb" }), "n.ipynb");
	assert.equal(summarizeToolInput("Bash", { command: "ls -la" }), "ls -la");
	assert.equal(summarizeToolInput("Grep", { pattern: "todo" }), "todo");
	assert.equal(summarizeToolInput("WebFetch", { url: "https://example.com" }), "https://example.com");
	assert.equal(summarizeToolInput("Task", { description: "d", prompt: "p" }), "d");
	assert.equal(summarizeToolInput("Task", { prompt: "p", query: "q" }), "p");
	assert.equal(summarizeToolInput("WebSearch", { query: "q" }), "q");
});

test("PRD-001.R16: a file path inside the vault shows vault-relative when the caller can place it, else as reported", () => {
	const place = (reported) => (reported.startsWith("/v/") ? reported.slice(3) : null);
	assert.equal(summarizeToolInput("Read", { file_path: "/v/Projects/Hiring plan.md" }, place), "Projects/Hiring plan.md");
	assert.equal(summarizeToolInput("NotebookEdit", { notebook_path: "/v/n.ipynb" }, place), "n.ipynb");
	assert.equal(summarizeToolInput("Grep", { pattern: "x", path: "/v/Meetings" }, place), "Meetings");
	assert.equal(summarizeToolInput("Read", { file_path: "/etc/hosts" }, place), "/etc/hosts", "outside the vault");
	assert.equal(summarizeToolInput("Bash", { command: "/v/run.sh" }, place), "/v/run.sh", "only path keys are placed");
	assert.equal(summarizeToolInput("mcp__obsidian__obsidian_open", { path: "/v/b.md" }, place), "/v/b.md", "a vault tool's subject is the model's own text");
	assert.equal(summarizeToolInput("Read", { file_path: "/v/a.md" }), "/v/a.md", "no placer, no change");
});

test("PRD-001.R16: an earlier key wins, in the order file_path, path, notebook_path, command, pattern, url", () => {
	const all = {
		query: "q",
		prompt: "p",
		description: "d",
		url: "u",
		pattern: "pat",
		command: "cmd",
		notebook_path: "nb",
		path: "pa",
		file_path: "fp",
	};
	const order = ["file_path", "path", "notebook_path", "command", "pattern", "url", "description", "prompt", "query"];
	const input = { ...all };
	for (const key of order) {
		assert.equal(summarizeToolInput("Any", input), all[key], key);
		delete input[key];
	}
	assert.equal(summarizeToolInput("Any", input), "");
});

test("PRD-001.R16: blank and non-string values are skipped, and a value is kept as written", () => {
	assert.equal(summarizeToolInput("Read", { file_path: "   ", command: "ls" }), "ls");
	assert.equal(summarizeToolInput("Read", { file_path: 42, path: null, command: "ls" }), "ls");
	assert.equal(summarizeToolInput("Read", { file_path: " a.md " }), " a.md ");
	assert.equal(summarizeToolInput("Read", {}), "");
});

test("PRD-001.R16: a summary is cut to 96 characters, ending in an ellipsis", () => {
	assert.equal(summarizeToolInput("Bash", { command: "x".repeat(96) }), "x".repeat(96));
	const cut = summarizeToolInput("Bash", { command: "x".repeat(97) });
	assert.equal(cut, "x".repeat(93) + "…");
	assert.equal(cut.length, 94);
	assert.equal(summarizeToolInput("Bash", { command: "y".repeat(500) }), "y".repeat(93) + "…");
});

test("PRD-002.R12: the summary of AskUserQuestion is its first question", () => {
	const questions = [
		{ question: "Which one?", options: [{ label: "A" }] },
		{ question: "And then?", options: [{ label: "B" }] },
	];
	assert.equal(summarizeToolInput("AskUserQuestion", { questions, description: "d" }), "Which one?");
	const long = [{ question: "q".repeat(120), options: [{ label: "A" }] }];
	assert.equal(summarizeToolInput("AskUserQuestion", { questions: long }), "q".repeat(93) + "…");
});

test("PRD-002.R12: an AskUserQuestion of an unexpected shape is summarized like any tool", () => {
	assert.equal(summarizeToolInput("AskUserQuestion", { questions: [], description: "d" }), "d");
	assert.equal(summarizeToolInput("AskUserQuestion", { questions: "nope", command: "c" }), "c");
	// Only AskUserQuestion reads `questions`.
	const questions = [{ question: "Which one?", options: [{ label: "A" }] }];
	assert.equal(summarizeToolInput("Task", { questions }), "");
});

// AskUserQuestion input ---------------------------------------------------------

test("PRD-002.R12: a well-formed list of questions is parsed, optional fields defaulted", () => {
	const parsed = parseAskUserQuestions({
		questions: [
			{
				question: "Which one?",
				header: "Pick",
				multiSelect: true,
				options: [{ label: "A", description: "first" }, { label: "B" }],
			},
			{ question: "Why?", options: [{ label: "C", description: 7 }] },
		],
	});
	assert.deepEqual(parsed, [
		{
			question: "Which one?",
			header: "Pick",
			multiSelect: true,
			options: [
				{ label: "A", description: "first" },
				{ label: "B", description: "" },
			],
		},
		{ question: "Why?", header: "", multiSelect: false, options: [{ label: "C", description: "" }] },
	]);
});

test("PRD-002.R12: multiSelect is true only for the boolean true; unknown fields are dropped", () => {
	const options = [{ label: "A", extra: 1 }];
	const parse = (multiSelect) => parseAskUserQuestions({ questions: [{ question: "q", multiSelect, options, x: 1 }] });
	assert.equal(parse(true)[0].multiSelect, true);
	for (const value of [false, "true", 1, undefined, null]) assert.equal(parse(value)[0].multiSelect, false, String(value));
	assert.deepEqual(Object.keys(parse(true)[0]), ["question", "header", "multiSelect", "options"]);
	assert.deepEqual(Object.keys(parse(true)[0].options[0]), ["label", "description"]);
});

test("PRD-002.R12: any other shape parses to null, so the request stays an ordinary permission card", () => {
	const ok = { question: "q", options: [{ label: "A" }] };
	const bad = [
		{},
		{ questions: null },
		{ questions: "q" },
		{ questions: {} },
		{ questions: [] },
		{ questions: [null] },
		{ questions: ["q"] },
		{ questions: [{ options: [{ label: "A" }] }] },
		{ questions: [{ question: 1, options: [{ label: "A" }] }] },
		{ questions: [{ question: "q" }] },
		{ questions: [{ question: "q", options: "A" }] },
		{ questions: [{ question: "q", options: [] }] },
		{ questions: [{ question: "q", options: [null] }] },
		{ questions: [{ question: "q", options: [{ description: "d" }] }] },
		{ questions: [{ question: "q", options: [{ label: 1 }] }] },
		{ questions: [{ question: "q", options: [{ label: "A" }, { description: "d" }] }] },
		// One bad entry spoils the list.
		{ questions: [ok, { question: "q", options: [] }] },
		{ questions: [ok, null] },
	];
	for (const input of bad) assert.equal(parseAskUserQuestions(input), null, JSON.stringify(input));
	assert.equal(parseAskUserQuestions({ questions: [ok] }).length, 1);
});

// Vault tool cards ------------------------------------------------------------

test("PRD-004.R10: each vault tool titles its card with a sentence and an icon", () => {
	const note = { path: "Notes/a.md" };
	assert.deepEqual(prompt("obsidian_rename", { path: "a.md", newPath: "b.md" }), {
		title: "Rename a.md to b.md, updating backlinks?",
		icon: "pencil",
	});
	assert.deepEqual(prompt("obsidian_properties", note), { title: "Read Notes/a.md's properties?", icon: "list" });
	assert.deepEqual(prompt("obsidian_properties", { ...note, patch: { status: "done" } }), {
		title: "Update Notes/a.md's properties?",
		icon: "list",
	});
	assert.deepEqual(prompt("obsidian_links", note), {
		title: "Look up Notes/a.md's links and backlinks?",
		icon: "link",
	});
	assert.deepEqual(prompt("obsidian_search", { query: "tag:#x" }), {
		title: `Search the vault's metadata for "tag:#x"?`,
		icon: "search",
	});
	assert.deepEqual(prompt("obsidian_open", note), { title: "Open Notes/a.md in your window?", icon: "file-text" });
	assert.deepEqual(prompt("obsidian_active"), {
		title: "Read which note you have open, and your selection?",
		icon: "file-text",
	});
});

test("PRD-004.R10: a title without its argument names a note, a new path or notes", () => {
	assert.equal(prompt("obsidian_open").title, "Open a note in your window?");
	assert.equal(prompt("obsidian_links", { path: 3 }).title, "Look up a note's links and backlinks?");
	assert.equal(prompt("obsidian_rename", { path: "a.md" }).title, "Rename a.md to a new path, updating backlinks?");
	assert.equal(prompt("obsidian_rename", {}).title, "Rename a note to a new path, updating backlinks?");
	assert.equal(prompt("obsidian_search").title, "Search the vault's metadata for notes?");
	assert.equal(prompt("obsidian_search", { query: 5 }).title, "Search the vault's metadata for notes?");
});

test("PRD-004.R10: properties are read unless the input carries a patch", () => {
	const title = (input) => prompt("obsidian_properties", { path: "a.md", ...input }).title;
	assert.equal(title({}), "Read a.md's properties?");
	assert.equal(title({ patch: undefined }), "Read a.md's properties?");
	assert.equal(title({ patch: null }), "Read a.md's properties?");
	assert.equal(title({ patch: {} }), "Update a.md's properties?");
	assert.equal(title({ patch: "x" }), "Update a.md's properties?");
});

test("PRD-004.R10: only the panel's own tools get a sentence; the CLI's title wins for the rest", () => {
	assert.equal(obsidianToolPrompt("Bash", { command: "ls" }), null);
	assert.equal(obsidianToolPrompt("mcp__claude-in-chrome__navigate", { url: "u" }), null);
	assert.equal(obsidianToolPrompt("obsidian_rename", { path: "a.md" }), null);
	assert.equal(obsidianToolPrompt("mcp__obsidian__obsidian_unknown", { path: "a.md" }), null);
	assert.equal(obsidianToolPrompt("mcp__obsidian__", {}), null);
	// A server whose id merely has the same length does not borrow the sentences.
	assert.equal(obsidianToolPrompt("mcp__evilserv__obsidian_rename", { path: "a.md", newPath: "b.md" }), null);
});

test("PRD-004.R10: a vault tool's card names the note in `path`, never a decoy file_path", () => {
	const decoy = { file_path: "decoy.md", path: "real.md" };
	assert.equal(prompt("obsidian_open", decoy).title, "Open real.md in your window?");
	assert.equal(prompt("obsidian_links", decoy).title, "Look up real.md's links and backlinks?");
	assert.equal(prompt("obsidian_properties", decoy).title, "Read real.md's properties?");
	assert.equal(prompt("obsidian_properties", { ...decoy, patch: { a: 1 } }).title, "Update real.md's properties?");
	assert.equal(
		prompt("obsidian_rename", { ...decoy, newPath: "new.md" }).title,
		"Rename real.md to new.md, updating backlinks?"
	);
});

test("PRD-004.R10: a file_path alone names no note, and a path that is not a string is not replaced by it", () => {
	assert.equal(prompt("obsidian_open", { file_path: "decoy.md" }).title, "Open a note in your window?");
	assert.equal(prompt("obsidian_open", { file_path: "decoy.md", path: 1 }).title, "Open a note in your window?");
	assert.equal(prompt("obsidian_rename", { file_path: "decoy.md", newPath: "b.md" }).title, "Rename a note to b.md, updating backlinks?");
});

const vaultSummary = (tool, input) => summarizeToolInput(`mcp__obsidian__${tool}`, input);
const decoys = {
	file_path: "decoy.md",
	notebook_path: "nb",
	command: "rm -rf /",
	pattern: "pat",
	url: "u",
	description: "d",
	prompt: "p",
};

test("PRD-004.R10: the summary of a note tool is its `path` alone, whatever else the input carries", () => {
	for (const tool of ["obsidian_open", "obsidian_links", "obsidian_properties", "obsidian_rename"]) {
		assert.equal(vaultSummary(tool, { ...decoys, path: "real.md", query: "q" }), "real.md", tool);
		// No path to name: the decoys and a query name nothing.
		assert.equal(vaultSummary(tool, { ...decoys, query: "q" }), "", tool);
		assert.equal(vaultSummary(tool, { ...decoys, path: "  ", query: "q" }), "", tool);
		assert.equal(vaultSummary(tool, { ...decoys, path: 3, query: "q" }), "", tool);
	}
	assert.equal(vaultSummary("obsidian_rename", { path: "real.md", newPath: "new.md" }), "real.md");
});

test("PRD-004.R10: the summary of obsidian_search is its `query` alone", () => {
	assert.equal(vaultSummary("obsidian_search", { ...decoys, path: "p.md", query: "tag:#x" }), "tag:#x");
	assert.equal(vaultSummary("obsidian_search", { ...decoys, path: "p.md" }), "");
	assert.equal(vaultSummary("obsidian_search", { ...decoys, path: "p.md", query: " " }), "");
});

test("PRD-004.R10: obsidian_active has no summary", () => {
	assert.equal(vaultSummary("obsidian_active", {}), "");
	assert.equal(vaultSummary("obsidian_active", { ...decoys, path: "p.md", query: "q" }), "");
});

test("PRD-004.R10: only the panel's six vault tools take their own summary; every other name keeps the generic order", () => {
	const input = { file_path: "f.md", path: "p.md", query: "q" };
	assert.equal(summarizeToolInput("Read", input), "f.md");
	assert.equal(summarizeToolInput("mcp__evilserv__obsidian_open", input), "f.md");
	assert.equal(summarizeToolInput("mcp__obsidian_open", input), "f.md");
	// A tool of our server that the panel does not know.
	assert.equal(vaultSummary("obsidian_unknown", input), "f.md");
	assert.equal(vaultSummary("", input), "f.md");
	assert.equal(vaultSummary("constructor", { command: "c" }), "c");
	assert.equal(vaultSummary("__proto__", { command: "c" }), "c");
});

test("PRD-004.R10: a tool name that is not a string is summarized like any tool and gets no sentence", () => {
	// The exporter passes names read from stored conversations.
	for (const name of [undefined, null, 7, {}]) {
		assert.equal(summarizeToolInput(name, { command: "ls" }), "ls", String(name));
		assert.equal(obsidianToolPrompt(name, { path: "a.md" }), null, String(name));
	}
});

// ExitPlanMode's plan ------------------------------------------------------------

test("PRD-002.R17: the plan is the input's `plan` string, whole and unchanged", () => {
	const plan = "# Plan\n\n1. Do a\n2. Do b\n\n```ts\ncode\n```\n" + "x".repeat(5000);
	assert.equal(planOf({ plan }), plan);
	assert.equal(planOf({ plan: "  padded\n" }), "  padded\n");
	assert.equal(planOf({ plan, allowedPrompts: [{ tool: "Bash", prompt: "run tests" }] }), plan);
});

test("PRD-002.R17: a missing, blank or non-string plan is null", () => {
	const none = [
		{},
		{ plan: "" },
		{ plan: "  \n\t" },
		{ plan: null },
		{ plan: 5 },
		{ plan: ["a"] },
		{ plan: { text: "x" } },
		{ Plan: "x" },
		{ planFilePath: "x" },
	];
	for (const input of none) assert.equal(planOf(input), null, JSON.stringify(input));
});

test("DES-006 F3: every tool mcp/vault-tools defines has a card sentence", () => {
	const source = readFileSync(fileURLToPath(new URL("../src/mcp/vault-tools.ts", import.meta.url)), "utf8");
	const names = [...source.matchAll(/\bname: "(obsidian_\w+)"/g)].map((match) => match[1]);
	assert.deepEqual(names.sort(), [
		"obsidian_active",
		"obsidian_links",
		"obsidian_open",
		"obsidian_properties",
		"obsidian_rename",
		"obsidian_search",
	]);
	for (const name of names) assert.notEqual(prompt(name, { path: "a.md" }), null, name);
});

test("PRD-002.R1: an input preview is indented JSON, cut to its limit with a closing ellipsis line", () => {
	assert.equal(jsonPreview({ a: 1 }, 2000), '{\n  "a": 1\n}');
	const cut = jsonPreview({ text: "x".repeat(100) }, 20);
	assert.equal(cut, '{\n  "text": "xxxxxxx\n…');
	assert.equal(jsonPreview(undefined, 20), "");
	const loop = {};
	loop.self = loop;
	assert.equal(jsonPreview(loop, 2000), "[object Object]");
});

test("PRD-001.R16: a Glob, Grep or obsidian_search result counts the number its first line states, else its non-empty lines", () => {
	assert.equal(resultCount("Grep", "Found 3 files\na.md\nb.md\nc.md"), "3 results");
	assert.equal(resultCount("mcp__obsidian__obsidian_search", "12 note(s) matched `tag:x`.\n\n- a.md"), "12 notes");
	assert.equal(resultCount("Glob", "a.md\n\nb.md\n"), "2 files");
	assert.equal(resultCount("Glob", "2026-10-02 Planning.md\n2026-10-09 Sync.md"), "2 files", "a path is not a count");
	assert.equal(resultCount("Glob", "No files found"), "0 files");
	assert.equal(resultCount("Glob", "only.md"), "1 file");
	assert.equal(resultCount("Grep", "Found 1 file\na.md"), "1 result");
	assert.equal(resultCount("Glob", ""), "0 files");
});

test("PRD-001.R16: other tools and missing results count nothing", () => {
	assert.equal(resultCount("Read", "Found 3 files"), null);
	assert.equal(resultCount("mcp__obsidian__obsidian_links", "3 links"), null);
	assert.equal(resultCount("Glob", null), null);
});

test("PRD-001.R16: a step row's icon follows the tool; a vault tool keeps its own", () => {
	assert.equal(toolIcon("Read"), "file-text");
	assert.equal(toolIcon("MultiEdit"), "pencil");
	assert.equal(toolIcon("Grep"), "search");
	assert.equal(toolIcon("Bash"), "terminal");
	assert.equal(toolIcon("WebFetch"), "globe");
	assert.equal(toolIcon(`mcp__${CHROME_MCP_SERVER}__navigate`), "globe");
	assert.equal(toolIcon(`mcp__${OBSIDIAN_MCP_SERVER}__obsidian_links`), "link");
	assert.equal(toolIcon("mcp__tracker__delete_issue"), "wrench");
});

test("PRD-001.R16: a count is read only from the known phrasings, never from a file name, and summary lines are not results", () => {
	assert.equal(resultCount("Glob", "1 Projects/a.md\n2 Areas/b.md"), "2 files", "a numbered folder");
	assert.equal(resultCount("Glob", "2024 Plans.md"), "1 file");
	assert.equal(resultCount("Grep", "12 Rules For Life.md"), "1 result");
	assert.equal(resultCount("Grep", "Found 1,234 files\na.md"), "1234 results");
	assert.equal(resultCount("Glob", "a.md\nb.md\n(Results are truncated. Consider using a more specific path or pattern.)"), "2 files");
	assert.equal(resultCount("Grep", "a.md:3\nb.md:1\n\nFound 4 total occurrences across 2 files."), "2 results");
	assert.equal(resultCount("mcp__obsidian__obsidian_search", "1,024 note(s) matched `x`."), "1024 notes");
	assert.equal(resultCount("Grep", "No matches found"), "0 results");
});
