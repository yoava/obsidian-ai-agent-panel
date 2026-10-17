import test from "node:test";
import assert from "node:assert/strict";

const { diffText, splitLines, formatDiffStat, expandGap, sidesOf, drawInChunks } =
	await import("./.build/diff.mjs");

const types = (d) => d.rows.map((r) => r.type).join("");
const texts = (d, type) => d.rows.filter((r) => r.type === type).map((r) => r.text);

test("identical text produces no rows", () => {
	const d = diffText("a\nb\nc", "a\nb\nc");
	assert.equal(d.unchanged, true);
	assert.deepEqual(d.rows, []);
	assert.equal(d.added, 0);
	assert.equal(d.removed, 0);
	assert.equal(formatDiffStat(d), null);
});

test("a trailing newline alone is not a change", () => {
	assert.equal(diffText("a\nb", "a\nb\n").unchanged, true);
	assert.equal(diffText("a\nb\n", "a\nb").unchanged, true);
	assert.deepEqual(splitLines("a\nb\n"), ["a", "b"]);
	assert.deepEqual(splitLines(""), []);
	assert.deepEqual(splitLines("\n"), [""]);
});

test("CRLF and CR line endings split the same as LF", () => {
	assert.deepEqual(splitLines("a\r\nb\rc"), ["a", "b", "c"]);
	assert.equal(diffText("a\r\nb", "a\nb").unchanged, true);
});

test("empty to non-empty is all additions", () => {
	const d = diffText("", "x\ny");
	assert.equal(d.added, 2);
	assert.equal(d.removed, 0);
	assert.deepEqual(texts(d, "add"), ["x", "y"]);
});

test("non-empty to empty is all removals", () => {
	const d = diffText("x\ny", "");
	assert.equal(d.added, 0);
	assert.equal(d.removed, 2);
	assert.deepEqual(texts(d, "remove"), ["x", "y"]);
});

test("one changed line in the middle keeps surrounding context", () => {
	const d = diffText("a\nb\nc", "a\nB\nc");
	assert.equal(types(d), "contextremoveaddcontext");
	assert.equal(d.added, 1);
	assert.equal(d.removed, 1);
	assert.equal(formatDiffStat(d), "+1 -1");
	const [ctxBefore] = d.rows;
	assert.equal(ctxBefore.oldLine, 1);
	assert.equal(ctxBefore.newLine, 1);
});

test("line numbers track both sides across an insertion", () => {
	const d = diffText("a\nb", "a\nnew\nb");
	const add = d.rows.find((r) => r.type === "add");
	assert.equal(add.text, "new");
	assert.equal(add.newLine, 2);
	assert.equal(add.oldLine, undefined);
	const last = d.rows[d.rows.length - 1];
	assert.equal(last.text, "b");
	assert.equal(last.oldLine, 2);
	assert.equal(last.newLine, 3);
});

test("removals are emitted before additions in a change block", () => {
	const d = diffText("one\ntwo\n", "uno\ndos\n");
	assert.equal(types(d), "removeremoveaddadd");
});

test("unchanged stretches collapse into a gap carrying its line count", () => {
	const oldText = ["head", ...Array.from({ length: 20 }, (_, i) => `line${i}`), "tail"].join("\n");
	const newText = oldText.replace("head", "HEAD").replace("tail", "TAIL");
	const d = diffText(oldText, newText, { context: 2 });
	const gaps = d.rows.filter((r) => r.type === "gap");
	assert.equal(gaps.length, 1);
	// 20 middle lines, 2 kept after the first change and 2 before the last.
	assert.equal(gaps[0].hidden, 16);
	assert.equal(d.added, 2);
	assert.equal(d.removed, 2);
});

test("a gap that would hide a single line keeps the line instead", () => {
	const oldText = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
	const newText = ["A", "b", "c", "d", "e", "f", "G"].join("\n");
	const d = diffText(oldText, newText, { context: 2 });
	assert.equal(
		d.rows.some((r) => r.type === "gap"),
		false
	);
	assert.equal(d.rows.filter((r) => r.type === "context").length, 5);
});

test("word-level refinement marks only the words that differ", () => {
	const d = diffText(
		"The quick brown fox jumps over the lazy dog",
		"The quick red fox jumps over the lazy dog"
	);
	const remove = d.rows.find((r) => r.type === "remove");
	const add = d.rows.find((r) => r.type === "add");
	assert.ok(remove.segments, "removal should be refined");
	assert.ok(add.segments, "addition should be refined");
	assert.deepEqual(
		remove.segments.filter((s) => s.changed).map((s) => s.text),
		["brown"]
	);
	assert.deepEqual(
		add.segments.filter((s) => s.changed).map((s) => s.text),
		["red"]
	);
	// Segments must reconstruct the line exactly.
	assert.equal(remove.segments.map((s) => s.text).join(""), remove.text);
	assert.equal(add.segments.map((s) => s.text).join(""), add.text);
});

test("refinement leaves unrelated lines whole", () => {
	const d = diffText("alpha beta gamma", "wholly different content here");
	const remove = d.rows.find((r) => r.type === "remove");
	const add = d.rows.find((r) => r.type === "add");
	assert.equal(remove.segments, undefined);
	assert.equal(add.segments, undefined);
});

test("refinement pairs by offset inside a multi-line block", () => {
	const d = diffText("one fish\ntwo fish", "one bird\ntwo bird");
	const removes = d.rows.filter((r) => r.type === "remove");
	const adds = d.rows.filter((r) => r.type === "add");
	assert.equal(removes.length, 2);
	assert.equal(adds.length, 2);
	for (const row of [...removes, ...adds]) assert.ok(row.segments);
	assert.deepEqual(
		adds[1].segments.filter((s) => s.changed).map((s) => s.text),
		["bird"]
	);
});

test("segments always reconstruct their line", () => {
	const pairs = [
		["a b c", "a x c"],
		["  indented line", "  indented LINE"],
		["punct: (a, b)", "punct: (a, c)"],
		["trailing space ", "trailing space  "],
		["tabs\tand\tstuff", "tabs\tand\tthings"],
	];
	for (const [before, after] of pairs) {
		const d = diffText(before, after);
		for (const row of d.rows) {
			if (!row.segments) continue;
			assert.equal(row.segments.map((s) => s.text).join(""), row.text);
		}
	}
});

test("oversized inputs degrade to a coarse block instead of hanging", () => {
	const a = Array.from({ length: 400 }, (_, i) => `a${i}`).join("\n");
	const b = Array.from({ length: 400 }, (_, i) => `b${i}`).join("\n");
	const d = diffText(a, b, { maxCells: 1000 });
	assert.equal(d.coarse, true);
	assert.equal(d.removed, 400);
	assert.equal(d.added, 400);
	// No refinement is attempted on a coarse diff.
	assert.equal(
		d.rows.every((r) => r.segments === undefined),
		true
	);
});

test("a real LCS runs when the budget allows it", () => {
	const a = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
	const b = a.replace("line 100", "LINE 100");
	const d = diffText(a, b);
	assert.equal(d.coarse, false);
	assert.equal(d.added, 1);
	assert.equal(d.removed, 1);
});

test("row output is capped and says so", () => {
	const a = Array.from({ length: 300 }, (_, i) => `a${i}`).join("\n");
	const d = diffText(a, "", { maxRows: 50 });
	assert.equal(d.truncated, true);
	assert.equal(d.rows.length, 51);
	assert.equal(d.rows[50].type, "cut");
	assert.equal(d.rows[50].hidden, 250);
	// The counts still describe the whole change, not the shown rows.
	assert.equal(d.removed, 300);
});

test("moving a block reports it as a move, not a rewrite of everything", () => {
	const d = diffText("a\nb\nc\nd", "c\nd\na\nb");
	// LCS keeps c,d as context and moves a,b - 2 added and 2 removed, not 4/4.
	assert.equal(d.added, 2);
	assert.equal(d.removed, 2);
});

test("blank-line-only changes are counted", () => {
	const d = diffText("a\n\nb", "a\nb");
	assert.equal(d.removed, 1);
	assert.equal(d.added, 0);
	assert.equal(formatDiffStat(d), "-1");
});

const numbered = (n, prefix = "line") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test("PRD-002.R5: three lines of context each side by default", () => {
	const oldText = numbered(21).join("\n");
	const newText = oldText.replace("line10", "LINE10");
	const d = diffText(oldText, newText);
	assert.deepEqual(
		d.rows.map((r) => r.text),
		["", "line7", "line8", "line9", "line10", "LINE10", "line11", "line12", "line13", ""]
	);
	assert.equal(types(d), "gapcontextcontextcontextremoveaddcontextcontextcontextgap");
	assert.equal(d.rows[0].hidden, 7);
	assert.equal(d.rows[9].hidden, 7);
});

test("PRD-002.R5: an option set to undefined keeps its default", () => {
	const oldText = numbered(21).join("\n");
	const newText = oldText.replace("line10", "LINE10");
	const unset = {
		context: undefined,
		maxCells: undefined,
		maxInlineChars: undefined,
		maxRows: undefined,
		minSimilarity: undefined,
	};
	assert.deepEqual(diffText(oldText, newText, unset), diffText(oldText, newText));
	const big = diffText(numbered(4500).join("\n"), "", unset);
	assert.equal(big.truncated, true);
	assert.equal(big.rows.length, 4001);
	assert.equal(big.rows[4000].hidden, 500);
});

test("PRD-002.R5: a context of zero is a number the caller set", () => {
	const oldText = numbered(21).join("\n");
	const d = diffText(oldText, oldText.replace("line10", "LINE10"), { context: 0 });
	assert.equal(types(d), "gapremoveaddgap");
});

test("PRD-002.R5: a gap carries the first line it hides on each side", () => {
	const middle = numbered(20);
	const shifted = diffText(
		["a", ...middle, "z"].join("\n"),
		["A", "A2", ...middle, "Z"].join("\n"),
		{ context: 2 }
	);
	const gap = shifted.rows.find((r) => r.type === "gap");
	// line2 is the 4th old line and the 5th new line; 16 lines are hidden.
	assert.equal(gap.hidden, 16);
	assert.equal(gap.oldLine, 4);
	assert.equal(gap.newLine, 5);

	const head = diffText(numbered(20).join("\n"), numbered(19).concat("last").join("\n"));
	assert.equal(head.rows[0].type, "gap");
	assert.equal(head.rows[0].oldLine, 1);
	assert.equal(head.rows[0].newLine, 1);
});

test("PRD-002.R5: the row cut is a row of its own, distinct from a gap row", () => {
	// Changes ten lines apart leave a gap between each; the cap lands after them.
	const oldLines = numbered(100);
	const newLines = oldLines.map((line, i) => (i % 10 === 0 ? line.toUpperCase() : line));
	const full = diffText(oldLines.join("\n"), newLines.join("\n"), { context: 1 });
	const shown = 12;
	const d = diffText(oldLines.join("\n"), newLines.join("\n"), { context: 1, maxRows: shown });
	assert.equal(d.truncated, true);
	assert.equal(d.rows.length, shown + 1);
	assert.deepEqual(d.rows.slice(0, shown), full.rows.slice(0, shown));
	assert.ok(d.rows.slice(0, shown).some((r) => r.type === "gap"));
	const cut = d.rows[shown];
	assert.equal(cut.type, "cut");
	assert.equal(cut.hidden, full.rows.length - shown);
	assert.equal(cut.oldLine, undefined);
	assert.equal(cut.newLine, undefined);
	assert.equal(d.rows.filter((r) => r.type === "cut").length, 1);
	assert.equal(full.truncated, false);
	assert.equal(
		full.rows.some((r) => r.type === "cut"),
		false
	);
});

test("PRD-002.R5: expanding a gap returns exactly its lines, matching a full-context diff", () => {
	const oldText = ["head", ...numbered(20), "tail"].join("\n");
	const newText = ["HEAD", "HEAD2", ...numbered(20), "TAIL"].join("\n");
	const gap = diffText(oldText, newText, { context: 2 }).rows.find((r) => r.type === "gap");
	const { rows, rest } = expandGap(gap, splitLines(oldText));
	assert.equal(rest, null);
	assert.equal(rows.length, gap.hidden);
	assert.ok(rows.every((r) => r.type === "context"));
	const expected = diffText(oldText, newText, { context: 1000 }).rows.filter(
		(r) => r.type === "context" && r.oldLine >= gap.oldLine && r.oldLine < gap.oldLine + gap.hidden
	);
	assert.deepEqual(rows, expected);
	assert.equal(rows[0].text, "line2");
	assert.equal(rows[0].oldLine, 4);
	assert.equal(rows[0].newLine, 5);
});

test("PRD-002.R5: a gap past the row limit leaves the rest as a gap row", () => {
	const oldLines = numbered(30_000);
	// One line becomes two, so the gap starts on a later line in the new text.
	const newLines = ["added", "changed", ...oldLines.slice(1)];
	const d = diffText(oldLines.join("\n"), newLines.join("\n"));
	const gap = d.rows.find((r) => r.type === "gap");
	assert.equal(gap.hidden, 29_996);
	assert.equal(gap.oldLine, 5);
	assert.equal(gap.newLine, 6);
	const first = expandGap(gap, oldLines);
	assert.equal(first.rows.length, 20_000);
	assert.equal(first.rows[0].text, "line4");
	assert.equal(first.rows[0].newLine, 6);
	assert.deepEqual(first.rest, {
		type: "gap",
		text: "",
		hidden: 9996,
		oldLine: 5 + 20_000,
		newLine: 6 + 20_000,
	});
	const second = expandGap(first.rest, oldLines);
	assert.equal(second.rows.length, 9996);
	assert.equal(second.rest, null);
	assert.equal(second.rows[9995].text, "line29999");
	assert.equal(second.rows[9995].oldLine, 30_000);
	assert.equal(second.rows[9995].newLine, 30_001);
});

test("PRD-002.R5: expanding with a smaller limit chains to the whole gap", () => {
	const oldLines = numbered(40);
	const gap = { type: "gap", text: "", hidden: 25, oldLine: 6, newLine: 9 };
	const all = [];
	let next = gap;
	while (next) {
		const step = expandGap(next, oldLines, 10);
		assert.ok(step.rows.length <= 10);
		all.push(...step.rows);
		next = step.rest;
	}
	assert.deepEqual(
		all.map((r) => r.text),
		oldLines.slice(5, 30)
	);
	assert.deepEqual(
		all.map((r) => r.oldLine),
		Array.from({ length: 25 }, (_, i) => 6 + i)
	);
	assert.deepEqual(
		all.map((r) => r.newLine),
		Array.from({ length: 25 }, (_, i) => 9 + i)
	);
});

test("PRD-002.R5: the Rendered sides leave out gap and cut rows", () => {
	const sides = sidesOf({
		rows: [
			{ type: "gap", text: "", hidden: 3, oldLine: 1, newLine: 1 },
			{ type: "context", text: "a" },
			{ type: "remove", text: "b" },
			{ type: "add", text: "B" },
			{ type: "context", text: "c" },
			{ type: "cut", text: "", hidden: 9 },
		],
	});
	assert.deepEqual(sides, { before: "a\nb\nc", after: "a\nB\nc" });
	const real = diffText(numbered(100).join("\n"), numbered(100).join("\n").replace("line50", "L"), {
		context: 1,
		maxRows: 4,
	});
	assert.ok(real.rows.some((r) => r.type === "cut"));
	assert.equal(sidesOf(real).before.split("\n").includes(""), false);
});

/** A scheduler that runs nothing until flushed, as the next animation frame would. */
function fakeFrames() {
	const queue = [];
	return {
		schedule: (step) => queue.push(step),
		pending: () => queue.length,
		flush() {
			while (queue.length) queue.shift()();
		},
	};
}

const rowsOf = (n, length = 1) =>
	Array.from({ length: n }, (_, i) => ({
		type: "context",
		text: "x".repeat(length),
		oldLine: i + 1,
		newLine: i + 1,
	}));

test("PRD-001.R29: the first chunk is drawn at once, then at most 500 rows per frame", () => {
	const frames = fakeFrames();
	const drawn = [];
	const rows = rowsOf(1200);
	drawInChunks(rows, (chunk, last) => drawn.push({ chunk, last }), frames.schedule, () => true);
	assert.equal(drawn.length, 1);
	assert.equal(drawn[0].chunk.length, 500);
	assert.equal(frames.pending(), 1);
	frames.flush();
	assert.deepEqual(
		drawn.map((d) => [d.chunk.length, d.last]),
		[
			[500, false],
			[500, false],
			[200, true],
		]
	);
	assert.deepEqual(
		drawn.flatMap((d) => d.chunk),
		rows
	);
});

test("PRD-001.R29: a chunk also ends at about 50,000 characters of row text", () => {
	const frames = fakeFrames();
	const sizes = [];
	// 100 paragraph-length lines: 50 fill the budget, so two chunks, not one of 100.
	drawInChunks(rowsOf(100, 1000), (chunk) => sizes.push(chunk.length), frames.schedule, () => true);
	frames.flush();
	assert.deepEqual(sizes, [50, 50]);

	// One line longer than the budget still draws, alone with what came before it.
	const long = [...rowsOf(2), { type: "context", text: "y".repeat(80_000) }, ...rowsOf(2)];
	const sizesLong = [];
	drawInChunks(long, (chunk) => sizesLong.push(chunk.length), frames.schedule, () => true);
	frames.flush();
	assert.deepEqual(sizesLong, [3, 2]);
});

test("PRD-001.R29: chunking stops when the diff has left the page", () => {
	const frames = fakeFrames();
	let alive = true;
	let calls = 0;
	drawInChunks(
		rowsOf(1200),
		() => {
			calls++;
			alive = false;
		},
		frames.schedule,
		() => alive
	);
	assert.equal(frames.pending(), 1);
	frames.flush();
	assert.equal(calls, 1);
	assert.equal(frames.pending(), 0);
});

test("PRD-001.R29: the first chunk draws before the target is on the page; later ones need it there", () => {
	const frames = fakeFrames();
	let onPage = false;
	const drawn = [];
	drawInChunks(
		rowsOf(1200),
		(chunk, last) => drawn.push([chunk.length, last]),
		frames.schedule,
		() => onPage
	);
	assert.deepEqual(drawn, [[500, false]]);
	assert.equal(frames.pending(), 1);

	// Attached by the next frame: drawing goes on.
	onPage = true;
	frames.flush();
	assert.deepEqual(drawn, [
		[500, false],
		[500, false],
		[200, true],
	]);

	// Never attached: the first chunk is all that is drawn.
	const detached = [];
	drawInChunks(rowsOf(1200), (chunk) => detached.push(chunk.length), frames.schedule, () => false);
	frames.flush();
	assert.deepEqual(detached, [500]);
	assert.equal(frames.pending(), 0);
});

test("PRD-001.R29: a diff at the 4,000-row cap draws in eight chunks of 500 and a ninth with the cut row", () => {
	const before = Array.from({ length: 5000 }, (_, i) => `old ${i}`).join("\n");
	const after = Array.from({ length: 5000 }, (_, i) => `new ${i}`).join("\n");
	const d = diffText(before, after);
	assert.equal(d.truncated, true);
	assert.equal(d.rows.length, 4001);
	const frames = fakeFrames();
	const drawn = [];
	drawInChunks(d.rows, (chunk, last) => drawn.push({ chunk, last }), frames.schedule, () => true);
	assert.equal(drawn.length, 1);
	frames.flush();
	assert.deepEqual(
		drawn.map((x) => x.chunk.length),
		[500, 500, 500, 500, 500, 500, 500, 500, 1]
	);
	assert.deepEqual(
		drawn.map((x) => x.last),
		[false, false, false, false, false, false, false, false, true]
	);
	assert.equal(drawn.at(-1).chunk[0].type, "cut");
	assert.deepEqual(
		drawn.flatMap((x) => x.chunk),
		d.rows
	);
});

test("PRD-001.R29: the leftover gap row is drawn last, in the final chunk", () => {
	const gap = { type: "gap", text: "", hidden: 5, oldLine: 600, newLine: 600 };
	const frames = fakeFrames();
	const drawn = [];
	drawInChunks(
		[...rowsOf(600), gap],
		(chunk, last) => drawn.push({ chunk, last }),
		frames.schedule,
		() => true
	);
	frames.flush();
	assert.deepEqual(
		drawn.map((d) => [d.chunk.length, d.last]),
		[
			[500, false],
			[101, true],
		]
	);
	assert.equal(drawn[1].chunk[100], gap);

	// Exactly full chunks: the gap row alone makes the last one.
	const exact = [];
	drawInChunks([...rowsOf(500), gap], (chunk, last) => exact.push([chunk.length, last]), frames.schedule, () => true);
	frames.flush();
	assert.deepEqual(exact, [
		[500, false],
		[1, true],
	]);
});

test("PRD-001.R29: nothing to draw still ends with one empty final chunk", () => {
	const drawn = [];
	drawInChunks([], (chunk, last) => drawn.push([chunk.length, last]), () => assert.fail("no frame needed"), () => true);
	assert.deepEqual(drawn, [[0, true]]);
});
