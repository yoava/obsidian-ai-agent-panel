import { test } from "node:test";
import assert from "node:assert/strict";
import { diffText, MAX_ALIGN_WORK, refineWork } from "./.build/diff.mjs";

test("PRD-002.R5: a paragraph re-wrapped to fewer lines pairs the lines that share words", () => {
	const before = [
		"This week was honestly a lot, and I'm not",
		"sure where to start, but the main thing",
		"is we shipped the beta, which took longer",
		"than expected because of the auth bug.",
	].join("\n");
	const after = ["We shipped the beta a week late, held up", "by the auth bug. Next up: onboarding."].join("\n");
	const d = diffText(before, after);
	const removes = d.rows.filter((r) => r.type === "remove");
	const adds = d.rows.filter((r) => r.type === "add");
	assert.equal(removes.length, 4);
	assert.equal(adds.length, 2);
	assert.equal(removes[0].segments, undefined);
	assert.equal(removes[1].segments, undefined);
	assert.ok(removes[2].segments && adds[0].segments, "the lines sharing the beta clause pair");
	assert.ok(removes[3].segments && adds[1].segments, "the lines sharing the auth bug clause pair");
	for (const row of [...removes, ...adds]) if (row.segments) assert.equal(row.segments.map((s) => s.text).join(""), row.text);
});

test("PRD-002.R5: an unequal block with nothing in common marks no words", () => {
	const d = diffText("alpha beta\ngamma delta\nepsilon zeta", "wholly different content here");
	assert.ok(d.rows.every((r) => r.segments === undefined));
});

const dense = (seed) => Array.from({ length: 40 }, (_, k) => `(x${(k * 7 + seed) % 5}n${seed})`).join(",");

test("PRD-002.R5: 20 dense unequal blocks cost no more token work than offset pairing", () => {
	const cells = (removed, added) => {
		const before = [];
		const after = [];
		for (let b = 0; b < 20; b++) {
			before.push(`keep ${b} a`, ...Array.from({ length: removed }, (_, k) => dense(b + k)), `keep ${b} z`);
			after.push(`keep ${b} a`, ...Array.from({ length: added }, (_, k) => dense(b + k + 30)), `keep ${b} z`);
		}
		refineWork.cells = 0;
		diffText(before.join("\n"), after.join("\n"));
		return refineWork.cells;
	};
	const offset = cells(5, 5);
	assert.ok(offset > 20 * MAX_ALIGN_WORK, "the case is over budget per block");
	assert.equal(cells(6, 5), offset);
});

test("PRD-002.R5: a block over the work budget pairs by offset", () => {
	const six = Array.from({ length: 6 }, (_, k) => dense(k));
	const five = Array.from({ length: 5 }, (_, k) => dense(k + 10));
	const run = (removed, added) => diffText(["top", ...removed, "end"].join("\n"), ["top", ...added, "end"].join("\n"));
	const over = run(six, five);
	const offset = run(six.slice(0, 5), five);
	const segs = (d, type) => d.rows.filter((r) => r.type === type).map((r) => r.segments);
	assert.deepEqual(segs(over, "add"), segs(offset, "add"));
	assert.deepEqual(segs(over, "remove").slice(0, 5), segs(offset, "remove"));
	assert.equal(segs(over, "remove")[5], undefined);
});
