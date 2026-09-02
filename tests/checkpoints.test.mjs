import test from "node:test";
import assert from "node:assert/strict";

const { CheckpointStore, planRestore, parseCheckpointName } = await import(
	"./.build/checkpoints.mjs"
);

/** In-memory stand-in for Obsidian's DataAdapter. */
function memoryIo() {
	const files = new Map();
	const dirs = new Set();
	return {
		files,
		dirs,
		async exists(path) {
			return files.has(path) || dirs.has(path);
		},
		async read(path) {
			if (!files.has(path)) throw new Error("ENOENT " + path);
			return files.get(path);
		},
		async write(path, data) {
			files.set(path, data);
		},
		async remove(path) {
			files.delete(path);
		},
		async mkdir(path) {
			dirs.add(path);
		},
		async list(path) {
			return {
				files: [...files.keys()].filter((file) => file.startsWith(path + "/")),
			};
		},
	};
}

const DIR = "plugins/ai-agent-panel/checkpoints";

test("names round-trip and reject anything unexpected", () => {
	assert.deepEqual(parseCheckpointName("abc-123__4.json"), {
		conversationId: "abc-123",
		turn: 4,
	});
	assert.equal(parseCheckpointName("../escape__1.json"), null);
	assert.equal(parseCheckpointName("abc__x.json"), null);
	assert.equal(parseCheckpointName("abc.json"), null);
});

test("a captured pre-image round-trips", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await store.capture("conv1", 1, "notes/a.md", "before");
	const loaded = await store.load("conv1", 1);
	assert.equal(loaded.turn, 1);
	assert.equal(loaded.conversationId, "conv1");
	assert.deepEqual(loaded.files, [
		{ path: "notes/a.md", existed: true, content: "before" },
	]);
});

test("the first pre-image per path per turn is the one kept", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await store.capture("conv1", 1, "a.md", "original");
	await store.capture("conv1", 1, "a.md", "after the first edit");
	const loaded = await store.load("conv1", 1);
	assert.equal(loaded.files.length, 1);
	assert.equal(loaded.files[0].content, "original");
});

test("separate turns keep separate snapshots of the same file", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await store.capture("conv1", 1, "a.md", "v1");
	store.closeTurn("conv1", 1);
	await store.capture("conv1", 2, "a.md", "v2");
	assert.equal((await store.load("conv1", 1)).files[0].content, "v1");
	assert.equal((await store.load("conv1", 2)).files[0].content, "v2");
});

test("a file that did not exist is recorded as a creation", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await store.capture("conv1", 1, "new.md", null);
	const loaded = await store.load("conv1", 1);
	assert.deepEqual(loaded.files, [{ path: "new.md", existed: false }]);
	const plan = planRestore(loaded);
	assert.deepEqual(plan.remove, ["new.md"]);
	assert.deepEqual(plan.rewrite, []);
});

test("oversized files are flagged rather than stored", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR, { maxFileBytes: 10 });
	await store.capture("conv1", 1, "big.md", "x".repeat(50));
	const loaded = await store.load("conv1", 1);
	assert.equal(loaded.files[0].skipped, "too-large");
	assert.equal(loaded.files[0].content, undefined);
	const plan = planRestore(loaded);
	assert.deepEqual(plan.skipped, ["big.md"]);
	assert.deepEqual(plan.rewrite, []);
});

test("a restore plan separates rewrites, deletions and gaps", () => {
	const plan = planRestore({
		version: 1,
		conversationId: "c",
		turn: 1,
		createdAt: 0,
		files: [
			{ path: "keep.md", existed: true, content: "old" },
			{ path: "made.md", existed: false },
			{ path: "huge.md", existed: true, skipped: "too-large" },
		],
	});
	assert.deepEqual(plan.rewrite, [{ path: "keep.md", content: "old" }]);
	assert.deepEqual(plan.remove, ["made.md"]);
	assert.deepEqual(plan.skipped, ["huge.md"]);
});

test("an existing file with no stored content restores as empty, not undefined", () => {
	const plan = planRestore({
		version: 1,
		conversationId: "c",
		turn: 1,
		createdAt: 0,
		files: [{ path: "a.md", existed: true }],
	});
	assert.deepEqual(plan.rewrite, [{ path: "a.md", content: "" }]);
});

test("the store prunes oldest-first past its checkpoint cap", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR, { maxCheckpoints: 3 });
	for (let turn = 1; turn <= 6; turn++) {
		await store.capture("conv1", turn, `f${turn}.md`, "x");
		store.closeTurn("conv1", turn);
	}
	const remaining = [...io.files.keys()].sort();
	assert.equal(remaining.length, 3);
	// The three newest survive.
	assert.equal(await store.has("conv1", 1), false);
	assert.equal(await store.has("conv1", 6), true);
});

test("pruning respects the byte budget", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR, { maxTotalBytes: 400 });
	for (let turn = 1; turn <= 8; turn++) {
		await store.capture("conv1", turn, `f${turn}.md`, "y".repeat(120));
		store.closeTurn("conv1", turn);
	}
	const total = [...io.files.values()].reduce((sum, data) => sum + data.length, 0);
	assert.ok(total <= 400, `expected <= 400 bytes, got ${total}`);
	assert.ok(io.files.size >= 1, "at least the newest must survive");
});

test("the turn still being written to is never pruned", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR, { maxCheckpoints: 1 });
	await store.capture("conv1", 1, "a.md", "x".repeat(50));
	// Turn 1 stays open, so adding turn 2 must not evict it.
	await store.capture("conv1", 2, "b.md", "y".repeat(50));
	assert.equal(await store.has("conv1", 1), true);
});

test("forget removes only that conversation's checkpoints", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await store.capture("keep", 1, "a.md", "x");
	await store.capture("drop", 1, "b.md", "y");
	await store.forget("drop");
	assert.equal(await store.has("keep", 1), true);
	assert.equal(await store.has("drop", 1), false);
});

test("a record whose identity does not match its file name is refused", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await io.write(
		`${DIR}/victim__1.json`,
		JSON.stringify({
			version: 1,
			conversationId: "attacker",
			turn: 1,
			createdAt: 0,
			files: [{ path: "a.md", existed: true, content: "x" }],
		})
	);
	assert.equal(await store.load("victim", 1), null);
});

test("unsafe conversation ids and turns are refused outright", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await store.capture("../escape", 1, "a.md", "x");
	await store.capture("conv1", 0, "a.md", "x");
	await store.capture("conv1", 1.5, "a.md", "x");
	assert.equal(io.files.size, 0);
	assert.equal(await store.load("../escape", 1), null);
});

test("corrupt records load as null instead of throwing", async () => {
	const io = memoryIo();
	const store = new CheckpointStore(io, DIR);
	await io.write(`${DIR}/conv1__1.json`, "{not json");
	assert.equal(await store.load("conv1", 1), null);
});
