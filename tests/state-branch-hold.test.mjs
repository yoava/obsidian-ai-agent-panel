import test from "node:test";
import assert from "node:assert/strict";

const hold = await import("./.build/state/branch-hold.mjs");
const { BranchHold } = hold;

const rewind = { target: "t", latest: () => null };

test("PRD-002.R15: a branch's rewind goes to each session the tab gets until a rewind succeeds, once per session", () => {
	const hold = new BranchHold();
	const given = [];
	const s1 = { name: "s1" };
	const s2 = { name: "s2" };
	hold.give(s1, (r) => given.push([s1, r]));
	assert.deepEqual(given, []);
	hold.set(rewind);
	hold.give(s1, (r) => given.push([s1, r]));
	// The same session asking again is not armed twice.
	hold.give(s1, (r) => given.push([s1, r]));
	assert.deepEqual(given, [[s1, rewind]]);
	// The session was dropped (a profile change) before any rewind succeeded: the next one gets it.
	hold.give(s2, (r) => given.push([s2, r]));
	assert.deepEqual(given, [
		[s1, rewind],
		[s2, rewind],
	]);
	// A rewind succeeded: nothing more is given.
	hold.cut();
	hold.give({ name: "s3" }, (r) => given.push(["s3", r]));
	assert.equal(given.length, 2);
});

test("PRD-002.R15: a new branch replaces the held rewind, and a dropped resume clears it", () => {
	const hold = new BranchHold();
	const given = [];
	hold.set(rewind);
	hold.clear();
	hold.give({}, (r) => given.push(r));
	assert.deepEqual(given, []);
	const other = { target: "u", latest: () => null };
	hold.set(rewind);
	hold.set(other);
	hold.give({}, (r) => given.push(r));
	assert.deepEqual(given, [other]);
});

test("PRD-002.R15: a branch is handed out for recording once, and not at all when it is opened and closed unused", () => {
	const { BranchIntent } = hold;
	const intent = new BranchIntent();
	// Opened and closed unused: nothing took it, so nothing was stored.
	intent.set({ source: "s", target: "t" });
	// The first send takes it; a retry finds nothing to record again.
	assert.deepEqual(intent.take(), { source: "s", target: "t" });
	assert.equal(intent.take(), null);
	// A reopened branch is already recorded.
	intent.set(null);
	assert.equal(intent.take(), null);
});
