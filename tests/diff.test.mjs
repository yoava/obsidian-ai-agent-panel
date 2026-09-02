import test from "node:test";
import assert from "node:assert/strict";

const { diffText, splitLines, formatDiffStat } = await import("./.build/diff.mjs");

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
	assert.equal(d.rows[50].type, "gap");
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
