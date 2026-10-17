import { test } from "node:test";
import assert from "node:assert/strict";
import {
	contextBlock,
	contextName,
	contextPaths,
	cutSelection,
	findMentionedPaths,
	listedAttachments,
	MAX_LIST_ENTRIES,
	MAX_SELECTION_CHARS,
	selectionLines,
	selectionReference,
	sendContext,
	stringifyProperty,
} from "./.build/context-format.mjs";

const OFF = { note: false, folder: false, links: false };
const NOTE = { path: "Projects/Q4 planning.md", name: "Q4 planning.md" };
const FOLDER = { path: "Projects", name: "Projects" };
const EMPTY_GRAPH = { properties: [], linksTo: [], linkedFrom: [], broken: [] };

function sources(overrides = {}) {
	return { note: NOTE, folder: FOLDER, chips: OFF, selection: null, graph: null, attached: [], ...overrides };
}

/** A selection as the editor reports it: `text` starting on line `from` (1-based), its last line the text's (a trailing break ends it). */
const sel = (text, from = 12) => ({ text, from, to: from + text.replace(/\n$/, "").split("\n").length - 1 });

const frame = (...lines) => ["<context>", "The user is working in an Obsidian vault.", ...lines, "</context>"].join("\n");

test("PRD-001.R12: with nothing to say the block is omitted", () => {
	assert.equal(contextBlock(sources()), null, "every chip off, nothing attached");
	assert.equal(contextBlock(sources({ note: null, folder: null, chips: { note: true, folder: true, links: true } })), null, "chips on, no note or folder");
	assert.equal(contextBlock(sources({ note: null, chips: { ...OFF, links: true }, graph: EMPTY_GRAPH })), null, "links chip, no note");
	assert.equal(contextBlock(sources({ chips: { ...OFF, links: true }, graph: EMPTY_GRAPH })), null, "links chip, an empty graph");
	assert.equal(contextName(sources()), null);
});

test("PRD-001.R12: the note chip names the active note and its selection, by path, not its body", () => {
	assert.equal(contextBlock(sources({ chips: { ...OFF, note: true } })), frame("Active note: Projects/Q4 planning.md"));
	assert.equal(
		contextBlock(sources({ chips: { ...OFF, note: true }, selection: sel("line one\nline two") })),
		frame("Active note: Projects/Q4 planning.md", "Selected text from Projects/Q4 planning.md, lines 12-13:", '"""', "line one\nline two", '"""')
	);
	assert.equal(
		contextBlock(sources({ chips: { ...OFF, note: true }, selection: sel(" \n\t") })),
		frame("Active note: Projects/Q4 planning.md"),
		"a blank selection is left out"
	);
	assert.equal(contextBlock(sources({ selection: sel("picked") })), null, "the selection goes only with the note chip");
});

test("PRD-001.R12: the selection is cut at 8000 characters, never inside a surrogate pair", () => {
	assert.equal(MAX_SELECTION_CHARS, 8000);
	assert.equal(cutSelection("a".repeat(9000)), "a".repeat(8000));
	assert.equal(cutSelection("short"), "short");
	const emoji = "\u{1F600}";
	const straddling = "a".repeat(7999) + emoji + "b";
	assert.equal(cutSelection(straddling), "a".repeat(7999), "the pair at 7999 and 8000 is left out whole");
	const fitting = "a".repeat(7998) + emoji + "b";
	assert.equal(cutSelection(fitting), "a".repeat(7998) + emoji);
	const unpaired = "a".repeat(7999) + "\uD800" + "b";
	assert.equal(cutSelection(unpaired), "a".repeat(7999) + "\uD800", "a lone high surrogate at the cut is no pair to keep whole");
	const block = contextBlock(sources({ chips: { ...OFF, note: true }, selection: sel("x".repeat(8100)) }));
	assert.ok(block.includes(`"""\n${"x".repeat(8000)}\n"""`));
	assert.ok(!block.includes("x".repeat(8001)));
});

test("PRD-001.R12: the selection's lines are as on disk, 1-based, and a selection ending at a line's start leaves that line out", () => {
	assert.deepEqual(selectionLines({ line: 0, ch: 0 }, { line: 0, ch: 5 }), { from: 1, to: 1 });
	assert.deepEqual(selectionLines({ line: 11, ch: 3 }, { line: 17, ch: 2 }), { from: 12, to: 18 });
	assert.deepEqual(selectionLines({ line: 11, ch: 0 }, { line: 14, ch: 0 }), { from: 12, to: 14 }, "ends at line 15's start");
	assert.deepEqual(selectionLines({ line: 11, ch: 4 }, { line: 11, ch: 0 }), { from: 12, to: 12 }, "a one-line selection keeps its line");
});

test("PRD-001.R12, R13: the reference line names the note's path and its line or lines", () => {
	assert.equal(selectionReference("Projects/Q4 planning.md", { from: 12, to: 18 }), "Selected text from Projects/Q4 planning.md, lines 12-18:");
	assert.equal(selectionReference("Q4.md", { from: 3, to: 3 }), "Selected text from Q4.md, line 3:");
});

test("PRD-001.R12: a selection cut at 8000 characters keeps the whole selection's range", () => {
	const text = Array.from({ length: 1200 }, (_, i) => `line ${i}`).join("\n");
	const block = contextBlock(sources({ chips: { ...OFF, note: true }, selection: { text, from: 5, to: 1204 } }));
	assert.ok(text.length > 8000);
	assert.ok(block.includes("Selected text from Projects/Q4 planning.md, lines 5-1204:\n"));
	assert.ok(!block.includes(text));
});

test("PRD-001.R12: the folder chip adds the active folder with a slash", () => {
	assert.equal(contextBlock(sources({ chips: { ...OFF, folder: true } })), frame("Active folder: Projects/"));
	assert.equal(
		contextBlock(sources({ chips: { note: true, folder: true, links: false }, selection: sel("s") })),
		frame("Active note: Projects/Q4 planning.md", "Selected text from Projects/Q4 planning.md, line 12:", '"""', "s", '"""', "Active folder: Projects/")
	);
});

test("PRD-001.R12: links & properties lists the properties and each link list, sorted and once each, up to 40, then '… N more'", () => {
	assert.equal(MAX_LIST_ENTRIES, 40);
	const graph = {
		properties: [["status", "draft"], ["tags", ["a", "b"]], ["due", null]],
		linksTo: ["b.md", "a.md", "b.md"],
		linkedFrom: ["z.md", "y.md"],
		broken: ["Missing", "Gone", "Missing"],
	};
	assert.equal(
		contextBlock(sources({ chips: { ...OFF, links: true }, graph })),
		frame(
			"Properties:",
			"  status: draft",
			"  tags: a, b",
			"  due: null",
			"Links to (2):",
			"  a.md",
			"  b.md",
			"Linked from (2):",
			"  y.md",
			"  z.md",
			"Broken links (2):",
			"  Gone",
			"  Missing"
		)
	);
	const many = Array.from({ length: 45 }, (_, i) => `n${String(i).padStart(2, "0")}.md`);
	const props = Array.from({ length: 42 }, (_, i) => [`k${String(i).padStart(2, "0")}`, i]);
	const block = contextBlock(
		sources({ chips: { ...OFF, links: true }, graph: { ...EMPTY_GRAPH, properties: props, linkedFrom: many } })
	);
	const lines = block.split("\n");
	const at = lines.indexOf("Linked from (45):");
	assert.deepEqual(lines.slice(at + 1, at + 42), [...many.slice(0, 40).map((p) => `  ${p}`), "  … 5 more"]);
	assert.equal(lines[lines.indexOf("Properties:") + 40], "  k39: 39");
	assert.equal(lines[lines.indexOf("Properties:") + 41], "  … 2 more");
	assert.ok(!block.includes("Links to"), "an empty list is left out");
	assert.ok(!block.includes("Broken links"));
});

test("PRD-001.R12: a property value reads as one line", () => {
	assert.equal(stringifyProperty("text"), "text");
	assert.equal(stringifyProperty(3), "3");
	assert.equal(stringifyProperty(true), "true");
	assert.equal(stringifyProperty(null), "null");
	assert.equal(stringifyProperty(["a", 2]), "a, 2");
	assert.equal(stringifyProperty({ a: 1 }), '{"a":1}');
	const circular = { a: 1 };
	circular.self = circular;
	assert.equal(stringifyProperty(circular), "[object Object]", "a value JSON cannot write reads [object Object], not a failed send");
	assert.equal(stringifyProperty({ n: 10n }), "[object Object]");
});

test("PRD-001.R12: only the 40 properties sent are formatted", () => {
	const props = Array.from({ length: 40 }, (_, i) => [`k${i}`, i]);
	let formatted = 0;
	const late = { toJSON() { formatted++; return "late"; } };
	const block = contextBlock(
		sources({ chips: { ...OFF, links: true }, graph: { ...EMPTY_GRAPH, properties: [...props, ["late", late]] } })
	);
	assert.ok(block.endsWith("  k39: 39\n  … 1 more\n</context>"));
	assert.equal(formatted, 0);
});

test("PRD-001.R13: attached files and folders are named by path; one equal to an on note or folder is listed once", () => {
	const attached = [
		{ path: "Projects/Q4 planning.md", folder: false },
		{ path: "Projects", folder: true },
		{ path: "Ideas.md", folder: false },
		{ path: "Archive", folder: true },
	];
	assert.equal(
		contextBlock(sources({ attached })),
		frame(
			"Attached file: Projects/Q4 planning.md",
			"Attached folder: Projects/",
			"Attached file: Ideas.md",
			"Attached folder: Archive/"
		),
		"with their chips off, the active note and folder are listed as attachments"
	);
	const on = { note: true, folder: true, links: false };
	assert.deepEqual(listedAttachments(sources({ chips: on, attached })), attached.slice(2));
	assert.equal(
		contextBlock(sources({ chips: on, attached })),
		frame("Active note: Projects/Q4 planning.md", "Active folder: Projects/", "Attached file: Ideas.md", "Attached folder: Archive/")
	);
});

test("PRD-001.R12: the message's label names what was attached", () => {
	const attached = [
		{ path: "Projects/Q4 planning.md", folder: false },
		{ path: "Ideas.md", folder: false },
		{ path: "Archive", folder: true },
	];
	assert.equal(contextName(sources({ chips: { note: true, folder: true, links: true }, attached })), "Q4 planning.md · Projects/ · links & properties · 2 attached");
	assert.equal(contextName(sources({ attached })), "3 attached");
	assert.equal(contextName(sources({ note: null, chips: { note: true, folder: false, links: true } })), null);
});

test("PRD-001.R33: the label counts the selected lines after the note, and only while the note chip is on", () => {
	const note = { chips: { ...OFF, note: true } };
	assert.equal(contextName(sources({ ...note, selection: sel("a\nb\nc\nd\ne\nf") })), "Q4 planning.md · 6 lines selected");
	assert.equal(contextName(sources({ ...note, selection: sel("one line") })), "Q4 planning.md · 1 line selected");
	assert.equal(contextName(sources({ ...note, selection: sel("a\n\nb\n") })), "Q4 planning.md · 3 lines selected", "blank lines inside count, the trailing break does not");
	assert.equal(contextName(sources({ ...note, selection: sel(" \n\t") })), "Q4 planning.md", "a blank selection is no selection");
	assert.equal(contextName(sources({ selection: sel("a\nb") })), null, "chip off");
	assert.equal(
		contextName(sources({ chips: { note: true, folder: true, links: true }, selection: sel("a\nb") })),
		"Q4 planning.md · 2 lines selected · Projects/ · links & properties"
	);
});

test("PRD-001.R13: the stored paths are the block's and the @ mentions, each once; a message without context stores only its mentions", () => {
	const attached = [
		{ path: "Projects/Q4 planning.md", folder: false },
		{ path: "Archive", folder: true },
	];
	const on = sources({ chips: { note: true, folder: true, links: true }, attached });
	assert.deepEqual(contextPaths(on, true, ["Ideas.md", "Archive/"]), ["Projects/Q4 planning.md", "Projects/", "Archive/", "Ideas.md"]);
	assert.deepEqual(contextPaths(on, false, ["Ideas.md"]), ["Ideas.md"]);
	assert.deepEqual(sendContext(on, false, ["Ideas.md"]), { block: null, label: "Q4 planning.md · Projects/ · links & properties · 1 attached", paths: ["Ideas.md"] });
	const sent = sendContext(sources({ chips: { ...OFF, note: true } }), true, []);
	assert.deepEqual(sent, { block: frame("Active note: Projects/Q4 planning.md"), label: "Q4 planning.md", paths: ["Projects/Q4 planning.md"] });
});

test("PRD-001.R13: an @ mention is the longest vault path after an @ at a token start", () => {
	const vault = [
		{ path: "/", folder: true },
		{ path: "Projects", folder: true },
		{ path: "Projects/Q4 planning.md", folder: false },
		{ path: "Projects/Q4", folder: false },
		{ path: "Ideas.md", folder: false },
	];
	assert.deepEqual(findMentionedPaths("see @Projects/Q4 planning.md and (@Ideas.md).", vault), ["Projects/Q4 planning.md", "Ideas.md"]);
	assert.deepEqual(findMentionedPaths("@Projects/ and @Projects, then @Projects/Q4!", vault), ["Projects/", "Projects/Q4"]);
	assert.deepEqual(findMentionedPaths("mail a@Ideas.md or @Ideas.mdx or @/", vault), [], "not mid-word, not a longer token, not the root");
	assert.deepEqual(findMentionedPaths("@Ideas.md @Ideas.md", vault), ["Ideas.md"], "each once");
	assert.deepEqual(findMentionedPaths("no mentions", vault), []);
});
