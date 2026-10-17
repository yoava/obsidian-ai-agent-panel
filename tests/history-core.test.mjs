import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeScan, ScanJournal } from "./.build/history-core.mjs";

const meta = (id, updatedAt, extra = {}) => ({ id, updatedAt, messageCount: 2, ...extra });
const mapOf = (...metas) => new Map(metas.map((m) => [m.id, m]));
const none = new Set();

test("PRD-003.R6: a scanned conversation nobody touched is listed as scanned", () => {
	const scanned = mapOf(meta("a", 100));
	const merged = mergeScan(scanned, new Map(), none, none);
	assert.deepEqual([...merged.values()], [meta("a", 100)]);
});

test("PRD-003.R6: a conversation saved before the scan reached it is kept", () => {
	const cached = mapOf(meta("b", 200));
	const merged = mergeScan(mapOf(meta("a", 100)), cached, new Set(["b"]), none);
	assert.deepEqual([...merged.keys()].sort(), ["a", "b"]);
});

test("PRD-003.R6: a folder that could not be listed leaves the conversations already known", () => {
	const merged = mergeScan(new Map(), mapOf(meta("a", 100), meta("b", 200)), none, none);
	assert.deepEqual([...merged.keys()].sort(), ["a", "b"]);
});

test("PRD-003.R6: a save with a newer time wins over what the scan read", () => {
	const merged = mergeScan(mapOf(meta("a", 100)), mapOf(meta("a", 200, { messageCount: 5 })), new Set(["a"]), none);
	assert.equal(merged.get("a").messageCount, 5);
});

test("PRD-003.R6: a pin saved during the scan is listed, though the scan read the unpinned file at the same time", () => {
	const scanned = mapOf(meta("a", 100));
	const cached = mapOf(meta("a", 100, { pinned: true, pinnedAt: 150 }));
	const merged = mergeScan(scanned, cached, new Set(["a"]), none);
	assert.equal(merged.get("a").pinned, true);
	assert.equal(merged.get("a").pinnedAt, 150);
});

test("PRD-003.R6: an unpin saved during the scan is listed unpinned", () => {
	const scanned = mapOf(meta("a", 100, { pinned: true, pinnedAt: 50 }));
	const cached = mapOf(meta("a", 100));
	const merged = mergeScan(scanned, cached, new Set(["a"]), none);
	assert.equal(merged.get("a").pinned, undefined);
});

test("PRD-003.R6: a saved conversation wins whatever time the scan read for it", () => {
	const scanned = mapOf(meta("a", 300));
	const cached = mapOf(meta("a", 100, { pinned: true, pinnedAt: 150 }));
	const merged = mergeScan(scanned, cached, new Set(["a"]), none);
	assert.equal(merged.get("a").pinned, true);
	assert.equal(merged.get("a").updatedAt, 100);
});

test("PRD-003.R6: a cached entry no save made does not hide a file the scan read at the same time", () => {
	// Filled silently by a load, or left over from before the scan.
	const scanned = mapOf(meta("a", 100, { pinned: true, pinnedAt: 50 }));
	const cached = mapOf(meta("a", 100));
	const merged = mergeScan(scanned, cached, none, none);
	assert.equal(merged.get("a").pinned, true);
});

test("PRD-003.R6: a cached entry no save made loses to a newer scanned one", () => {
	const merged = mergeScan(mapOf(meta("a", 300)), mapOf(meta("a", 100)), none, none);
	assert.equal(merged.get("a").updatedAt, 300);
});

test("PRD-003.R6: a conversation deleted during the scan is dropped, scanned or cached", () => {
	const scanned = mapOf(meta("a", 100), meta("b", 100));
	const cached = mapOf(meta("a", 200));
	const merged = mergeScan(scanned, cached, new Set(["a"]), new Set(["a", "b"]));
	assert.deepEqual([...merged.keys()], []);
});

test("PRD-003.R6: an id saved but absent from the cache lists what the scan read", () => {
	const merged = mergeScan(mapOf(meta("a", 100)), new Map(), new Set(["a"]), none);
	assert.deepEqual([...merged.keys()], ["a"]);
});

test("PRD-003.R6: the merge changes none of its inputs", () => {
	const scanned = mapOf(meta("a", 100), meta("c", 100));
	const cached = mapOf(meta("a", 100, { pinned: true }), meta("b", 200));
	const saved = new Set(["a", "b"]);
	const deleted = new Set(["c"]);
	mergeScan(scanned, cached, saved, deleted);
	assert.deepEqual([...scanned.keys()], ["a", "c"]);
	assert.equal(scanned.get("a").pinned, undefined);
	assert.deepEqual([...cached.keys()], ["a", "b"]);
	assert.deepEqual([...saved], ["a", "b"]);
	assert.deepEqual([...deleted], ["c"]);
});

// The ids a store saves or deletes while a folder scan runs.
const scanWith = (journal, scanned, cached) => journal.finish(scanned, cached);

test("PRD-003.R6: an id saved while a scan runs keeps its cached entry over the scanned one", () => {
	const journal = new ScanJournal();
	journal.begin();
	journal.noteSaved("a");
	const merged = scanWith(journal, mapOf(meta("a", 100)), mapOf(meta("a", 100, { pinned: true })));
	assert.equal(merged.get("a").pinned, true);
});

test("PRD-003.R6: an id deleted while a scan runs is dropped", () => {
	const journal = new ScanJournal();
	journal.begin();
	journal.noteDeleted("a");
	const merged = scanWith(journal, mapOf(meta("a", 100)), new Map());
	assert.deepEqual([...merged.keys()], []);
});

test("PRD-003.R6: the later of a save and a delete of one id decides", () => {
	const savedLast = new ScanJournal();
	savedLast.begin();
	savedLast.noteDeleted("a");
	savedLast.noteSaved("a");
	const kept = scanWith(savedLast, mapOf(meta("a", 100)), mapOf(meta("a", 100, { pinned: true })));
	assert.equal(kept.get("a").pinned, true);

	const deletedLast = new ScanJournal();
	deletedLast.begin();
	deletedLast.noteSaved("a");
	deletedLast.noteDeleted("a");
	const dropped = scanWith(deletedLast, mapOf(meta("a", 100)), mapOf(meta("a", 100, { pinned: true })));
	assert.deepEqual([...dropped.keys()], []);
});

test("PRD-003.R6: a save or delete outside a scan is not recorded", () => {
	const journal = new ScanJournal();
	journal.noteSaved("a");
	journal.noteDeleted("b");
	journal.begin();
	const merged = scanWith(
		journal,
		mapOf(meta("a", 100), meta("b", 100)),
		mapOf(meta("a", 100, { pinned: true }))
	);
	// "a" was not saved during this scan, so the scanned entry wins the tie; "b" is kept.
	assert.equal(merged.get("a").pinned, undefined);
	assert.deepEqual([...merged.keys()].sort(), ["a", "b"]);
});

test("PRD-003.R6: a scan that begins forgets what the one before recorded", () => {
	const journal = new ScanJournal();
	journal.begin();
	journal.noteSaved("a");
	journal.noteDeleted("b");
	journal.begin();
	const merged = scanWith(
		journal,
		mapOf(meta("a", 100), meta("b", 100)),
		mapOf(meta("a", 100, { pinned: true }))
	);
	assert.equal(merged.get("a").pinned, undefined);
	assert.deepEqual([...merged.keys()].sort(), ["a", "b"]);
});

test("PRD-003.R6: a scan that ends forgets what it recorded, and records nothing after", () => {
	const journal = new ScanJournal();
	journal.begin();
	journal.noteSaved("a");
	journal.noteDeleted("b");
	scanWith(journal, new Map(), new Map());
	// After the merge: neither the old records nor new events count.
	journal.noteSaved("c");
	journal.noteDeleted("d");
	const merged = scanWith(
		journal,
		mapOf(meta("a", 100), meta("b", 100), meta("c", 100), meta("d", 100)),
		mapOf(meta("a", 100, { pinned: true }), meta("c", 100, { pinned: true }))
	);
	assert.equal(merged.get("a").pinned, undefined);
	assert.equal(merged.get("c").pinned, undefined);
	assert.deepEqual([...merged.keys()].sort(), ["a", "b", "c", "d"]);
});

test("PRD-003.R6, R4: reconcile gives the session record the scan as saves and deletes during it correct it", () => {
	const journal = new ScanJournal();
	journal.begin();
	journal.noteSaved("late");
	journal.noteDeleted("gone");
	const sources = [{ id: "kept" }, { id: "gone" }];
	const out = journal.reconcile(new Set(["kept", "gone"]), sources);
	assert.deepEqual([...out.names].sort(), ["kept", "late"]);
	assert.deepEqual(out.sources, [{ id: "kept" }]);
	// A save after the delete wins, and the other way round.
	journal.noteSaved("gone");
	journal.noteDeleted("late");
	const again = journal.reconcile(new Set(["kept"]), sources);
	assert.deepEqual([...again.names].sort(), ["gone", "kept"]);
	assert.deepEqual(again.sources, sources);
});
