import { test } from "node:test";
import assert from "node:assert/strict";
import { HeldSends } from "./.build/tab/held-sends.mjs";

const settle = async () => {
	for (let turn = 0; turn < 20; turn++) await Promise.resolve();
};

/** A queue over a scripted host: the results `deliver` gives, a gate the test sets, and what was delivered. */
function rig() {
	const state = { gate: { kind: "free" }, results: [], delivered: [], changed: [], pending: [], defer: false };
	const queue = new HeldSends({
		deliver: (send) => {
			state.delivered.push(send.text);
			const next = state.results.shift() ?? "sent";
			if (next instanceof Error) return Promise.reject(next);
			return state.defer ? new Promise((resolve) => state.pending.push(() => resolve(next))) : Promise.resolve(next);
		},
		changed: (note) => state.changed.push(note ?? null),
		gate: () => state.gate,
	});
	return { queue, state };
}

test("PRD-001.R38: held messages go one at a time in the order they were made, each kept, equal ones too", async () => {
	const { queue, state } = rig();
	for (const text of ["one", "two", "one"]) queue.add(text, [], null);
	await settle();
	assert.deepEqual(state.delivered, ["one", "two", "one"]);
	assert.equal(queue.size, 0);
	assert.equal(state.changed[0], "message", "adding says Message queued");
});

test("PRD-001.R38: a halted queue sends nothing until it resumes, and keeps what was added", async () => {
	const { queue, state } = rig();
	state.gate = { kind: "halt" };
	queue.add("a", [], null);
	queue.add("b", [], null);
	await settle();
	assert.deepEqual(state.delivered, []);
	assert.deepEqual(queue.view().map((send) => send.text), ["a", "b"]);
	state.gate = { kind: "free" };
	queue.resume();
	await settle();
	assert.deepEqual(state.delivered, ["a", "b"]);
});

test("PRD-001.R38: a waiting queue sends when what it waits for settles, and not before", async () => {
	const { queue, state } = rig();
	let open;
	state.gate = { kind: "wait", until: new Promise((resolve) => (open = resolve)) };
	queue.add("a", [], null);
	await settle();
	assert.deepEqual(state.delivered, []);
	state.gate = { kind: "free" };
	open();
	await settle();
	assert.deepEqual(state.delivered, ["a"]);
});

test("PRD-001.R38: a message returned as `again` keeps its place and is tried before the ones behind it", async () => {
	const { queue, state } = rig();
	state.results = ["again", "sent", "sent"];
	queue.add("p", [], null);
	queue.add("q", [], null);
	await settle();
	assert.deepEqual(state.delivered, ["p", "p", "q"]);
});

test("PRD-001.R38: a delivery that rejects is logged and counts as returned, so the messages behind it still go", async () => {
	const { queue, state } = rig();
	const log = console.error;
	const logged = [];
	console.error = (...args) => logged.push(args);
	try {
		state.results = [new Error("boom"), "sent"];
		queue.add("x", [], null);
		queue.add("y", [], null);
		await settle();
	} finally {
		console.error = log;
	}
	assert.deepEqual(state.delivered, ["x", "y"]);
	assert.equal(queue.size, 0, "nothing is left at the head");
	assert.equal(logged.length, 1);
});

test("PRD-001.R38: taking the queue leaves the message being delivered to finish, and returns the others oldest first", async () => {
	const { queue, state } = rig();
	state.defer = true;
	queue.add("one", [], null);
	await settle();
	queue.add("two", [], null);
	queue.add("three", [], null);
	await settle();
	assert.deepEqual(queue.take().map((send) => send.text), ["two", "three"]);
	assert.deepEqual(queue.view().map((send) => send.text), ["one"]);
	state.pending.shift()();
	await settle();
	assert.equal(queue.size, 0);
	assert.deepEqual(state.delivered, ["one"], "what was taken is not sent");
});

test("PRD-001.R38: a message keeps its images and the context it was sent with", () => {
	const { queue, state } = rig();
	state.gate = { kind: "halt" };
	const context = { block: "<b>", label: "N.md", paths: [] };
	queue.add("hi", [{ name: "a" }], context);
	assert.equal(queue.view()[0].images.length, 1);
	assert.equal(queue.view()[0].context, context);
});

test("PRD-001.R38: a disposed queue drops what it held and sends nothing more", async () => {
	const { queue, state } = rig();
	state.gate = { kind: "halt" };
	queue.add("a", [], null);
	queue.dispose();
	state.gate = { kind: "free" };
	queue.add("late", [], null);
	await settle();
	assert.deepEqual(state.delivered, []);
	assert.equal(queue.size, 0);
});
