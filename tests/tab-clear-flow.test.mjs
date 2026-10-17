import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { ClearFlow } = await import("./.build/tab/clear-flow.mjs");

const OLD = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
const NEW = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const G = 5;

const RESET = { type: "conversation_reset", trigger: "clear", session_id: OLD, new_conversation_id: NEW };
const initOf = (id, extra = {}) => ({ type: "system", subtype: "init", session_id: id, ...extra });
const RESULT = { type: "result", subtype: "success", num_turns: 0 };
const TURN = [{ kind: "user", text: "hi", sentAt: 1 }, { kind: "meta", turn: 1 }];

/** A host over a conversation, a fake session and timers the test advances by hand. */
function rig({ messages = TURN, running = true, session = true, branch = false, writes = true, sessionId = OLD, effective = {} } = {}) {
	const conversation = messages === null ? null : { sessionId: OLD, messages: [...messages] };
	const log = [];
	/** A mode pick waiting for the CLI, and what the tab was told to show when the clear ended. */
	const flags = { picking: false };
	const shown = [];
	const sentValues = [];
	const fake = {
		generation: G,
		sessionId,
		running,
		writeClear() {
			if (hold.throwIn.has("writeClear")) throw new Error("writeClear");
			log.push("write");
			return writes;
		},
		restart: () => log.push("restart"),
		abandon: () => log.push("abandon"),
		effective,
		stopTask(taskId) {
			log.push(`stopTask ${taskId}`);
			return hold.stopRejects ? Promise.reject(new Error("stop")) : Promise.resolve();
		},
		interrupt() {
			log.push("interrupt");
			return Promise.resolve();
		},
		reapply(values) {
			log.push(`reapply ${JSON.stringify(values)}`);
			sentValues.push(values);
			return new Promise((resolve, reject) => (answer = { resolve, reject }));
		},
	};
	let answer = null;
	let clock = 1000;
	const pending = new Map();
	let nextTimer = 1;
	const timers = {
		setTimeout(callback, ms) {
			const id = nextTimer++;
			pending.set(id, { callback, at: clock + ms });
			return id;
		},
		clearTimeout: (id) => pending.delete(id),
		setInterval: () => 0,
		clearInterval: () => {},
	};
	const host = {
		conversation: () => (hold.throwIn.has("conversation") ? thrown("conversation") : conversation),
		session: () => (hold.throwIn.has("session") ? thrown("session") : session ? fake : null),
		resumeId: () => OLD,
		unstartedBranch: () => branch,
		dropBranch: () => log.push("dropBranch"),
		recordSession: (id) => log.push(`recordSession ${id}`),
		record: (message) => {
			conversation.messages.push(message);
			log.push(`record ${message.kind}`);
		},
		cleared: (id) => log.push(`cleared ${id}`),
		onCleared: () => log.push("onCleared"),
		resolvedModels: () => ({}),
		reapplied: (values) => log.push(`reapplied ${JSON.stringify(values)}`),
		picking: () => flags.picking,
		released: (values) => shown.push(values),
		foreignSession: (id) => undoer.foreign.has(id),
		facts: () => undoer.facts,
		launchGeneration: () => undoer.generation,
		startUndo: (id, gate) => {
			log.push(`startUndo ${id}`);
			undoer.gate = gate;
			return new Promise((resolve) => (undoer.started = resolve));
		},
		probeUndo: () => {
			log.push("probeUndo");
			return new Promise((resolve, reject) => (undoer.probed = { resolve, reject }));
		},
		stopUndo: () => log.push("stopUndo"),
		adoptUndo: (id) => {
			log.push(`adoptUndo ${id}`);
			if (undoer.throwOnAdopt) throw new Error("adopt");
			return undoer.adoptOk;
		},
		undone: (usage) => {
			log.push(`undone ${usage ? usage.totalTokens : null}`);
			// A save the test settles by hand, or one that throws at once.
			if (undoer.undone === "throw") throw new Error("undone");
			if (undoer.undone === "deferred") return new Promise((resolve, reject) => (undoer.saved = { resolve, reject }));
		},
		undoFailed: () => log.push("undoFailed"),
		undoChanged: () => undoer.changes++,
		heldChanged: (note) => {
			if (hold.throwIn.has("heldChanged")) thrown("heldChanged");
			hold.changes++;
			if (note) hold.notes.push(note);
		},
		deliver: (send) => {
			hold.delivered.push(send.text);
			log.push(`deliver ${send.text}`);
			const result = hold.results.shift() ?? hold.onDeliver?.(send) ?? "sent";
			if (result instanceof Error) return Promise.reject(result);
			return hold.deferred ? new Promise((resolve) => hold.pendingDeliveries.push(() => resolve(result))) : Promise.resolve(result);
		},
		clearBlock: () => (hold.throwIn.has("clearBlock") ? thrown("clearBlock") : hold.block),
		tasks: () => (hold.throwIn.has("tasks") ? thrown("tasks") : hold.tasks),
		turnRunning: () => (hold.throwIn.has("turnRunning") ? thrown("turnRunning") : hold.turn),
		denyCards: (on) => log.push(`deny ${on}`),
		processReplaced: () => log.push("processReplaced"),
		confirmStop: () => {
			log.push("confirmStop");
			return new Promise((resolve) => (hold.asked = (answer) => resolve(answer === true ? "stop" : answer === false ? "cancel" : answer)));
		},
		declined: (cause, text, sends) => {
			if (hold.throwIn.has("declined")) thrown("declined");
			log.push(`declined ${cause} ${text} [${sends.map((send) => send.text)}]`);
			hold.declinedImages.push(sends.map((send) => send.images.length));
		},
	};
	const thrown = (where) => {
		throw new Error(where);
	};
	/** The held messages as the test drives them: what was delivered, the results the tab gives, and whether a delivery waits for the test. */
	const hold = { changes: 0, notes: [], delivered: [], results: [], onDeliver: null, block: null, throwIn: new Set(), declinedImages: [], deferred: false, pendingDeliveries: [], tasks: [], turn: false, asked: null, stopRejects: false };
	/** The Undo's CLI as the test drives it. */
	const undoer = { foreign: new Set(), facts: { working: false, restoring: false, starting: false, picking: false }, generation: 1, changes: 0, undone: null, throwOnAdopt: false, adoptOk: true, gate: null, started: null, probed: null };
	const flow = new ClearFlow(host, timers, () => clock);
	// The tab announces a turn once its state changed: the host reads the same.
	const announce = flow.turnChanged.bind(flow);
	flow.turnChanged = (running, queued = false) => {
		hold.turn = running || queued;
		announce(running, queued);
	};
	const advance = (ms) => {
		clock += ms;
		for (const [id, timer] of [...pending]) {
			if (timer.at <= clock) {
				pending.delete(id);
				timer.callback();
			}
		}
	};
	return { hold, undoer, flow, conversation, log, flags, shown, sentValues, advance, fake, pending, at: (ms) => (clock += ms), answer: () => answer };
}

test("PRD-001.R38: a conversation with no message to Claude Code since it began or its last clear, or none, records nothing", () => {
	for (const options of [{ messages: null }, { messages: [] }, { messages: [{ kind: "user", text: "!ls" }] }, { messages: [...TURN, { kind: "clear", at: 1 }] }]) {
		const { flow, log } = rig(options);
		flow.request();
		assert.deepEqual(log, []);
		assert.equal(flow.held(), null);
	}
});

test("PRD-001.R38: a branch before its first message drops the fork and rewind and records nothing", () => {
	const { flow, log } = rig({ branch: true });
	flow.request();
	assert.deepEqual(log, ["dropBranch"]);
});

test("PRD-001.R38: with no running CLI the clear is recorded with the ended session and the resume id dropped", () => {
	for (const options of [{ running: false }, { session: false }]) {
		const { flow, log, conversation } = rig(options);
		flow.request();
		assert.deepEqual(log, ["record user", "record clear", "cleared null", "onCleared"]);
		assert.deepEqual(conversation.messages.at(-1), { kind: "clear", at: 1000, sessionId: OLD });
		assert.equal(conversation.sessionId, null);
		assert.equal(flow.held(), null);
	}
});

test("PRD-001.R38: a running CLI is written /clear and the tab's sends are held", async () => {
	const { flow, log } = rig();
	flow.request();
	assert.deepEqual(log, ["write"]);
	assert.equal(flow.open, true);
	let released = false;
	void flow.held().then(() => (released = true));
	await Promise.resolve();
	assert.equal(released, false);
});

test("PRD-001.R38: the reset, the new session and the zero result complete the clear, store the new id and release the sends", async () => {
	const { flow, log, conversation } = rig();
	flow.request();
	const held = flow.held();
	assert.equal(flow.message(G, RESET), "consume");
	assert.deepEqual(log, ["write"]);
	// The init reaches the session too.
	assert.equal(flow.message(G, initOf(NEW)), "pass");
	assert.deepEqual(log.slice(1), [`recordSession ${NEW}`, "record user", "record clear", `cleared ${NEW}`, "onCleared"]);
	assert.deepEqual(conversation.messages.at(-1), { kind: "clear", at: 1000, sessionId: OLD });
	assert.equal(conversation.sessionId, NEW);
	assert.equal(flow.message(G, RESULT), "consume");
	assert.equal(flow.open, false);
	await held;
	assert.equal(flow.held(), null);
	// A later result is a turn's.
	assert.equal(flow.message(G, RESULT), "pass");
});

test("PRD-001.R38: the clear is recorded once the committing id is recorded, so the file never holds an unrecorded id", () => {
	const { flow, log } = rig();
	flow.request();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	assert.ok(log.indexOf(`recordSession ${NEW}`) < log.indexOf("record clear"));
});

test("PRD-001.R38: no new session within 15 s stops the CLI and completes the clear as with none", async () => {
	const { flow, log, conversation, advance } = rig();
	flow.request();
	const held = flow.held();
	advance(14_999);
	assert.equal(flow.open, true);
	advance(1);
	assert.deepEqual(log.slice(1), ["abandon", "record user", "record clear", "cleared null", "onCleared"]);
	assert.equal(conversation.sessionId, null);
	assert.equal(flow.open, false);
	await held;
});

test("PRD-001.R38: no answer within 15 s of the new session restarts the CLI on it and sends the held messages", async () => {
	const { flow, log, conversation, advance } = rig();
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	advance(15_000);
	assert.equal(log.at(-1), "restart");
	assert.equal(conversation.sessionId, NEW);
	assert.equal(flow.open, false);
	await held;
	// The restarted process's answer is nobody's.
	assert.equal(flow.message(G, RESULT), "pass");
});

test("PRD-001.R38: the CLI exiting before the new session completes the clear as with none", async () => {
	const { flow, log, conversation } = rig();
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.closed(G);
	assert.deepEqual(log.slice(1), ["abandon", "record user", "record clear", "cleared null", "onCleared"]);
	assert.equal(conversation.sessionId, null);
	await held;
});

test("PRD-001.R38: the CLI exiting after the new session keeps the clear and the new id", async () => {
	const { flow, log, conversation } = rig();
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.closed(G);
	assert.equal(conversation.sessionId, NEW);
	assert.equal(log.filter((entry) => entry === "record clear").length, 1);
	assert.equal(flow.open, false);
	await held;
});

test("PRD-001.R38: a write no process took ends as an exit would", () => {
	const { flow, log, conversation } = rig({ writes: false });
	flow.request();
	assert.deepEqual(log, ["write", "abandon", "record user", "record clear", "cleared null", "onCleared"]);
	assert.equal(conversation.sessionId, null);
	assert.equal(flow.open, false);
});

test("ADR-018: messages and exits of another process generation are ignored, and a crash respawn does not touch a finished clear", () => {
	const { flow, log } = rig();
	flow.request();
	assert.equal(flow.message(G + 1, RESET), "pass");
	assert.equal(flow.message(G - 1, initOf(NEW)), "pass");
	flow.closed(G + 1);
	assert.equal(flow.open, true);
	flow.closed(G);
	assert.equal(flow.open, false);
	const before = log.length;
	assert.equal(flow.message(G + 1, RESET), "pass");
	assert.equal(flow.message(G + 1, initOf(NEW)), "pass");
	assert.equal(flow.message(G + 1, RESULT), "pass");
	assert.equal(log.length, before);
});

test("PRD-001.R38: an init with the old or an invalid id is not the new session", () => {
	const { flow, log } = rig();
	flow.request();
	flow.message(G, RESET);
	for (const id of [OLD, "--resume", undefined]) assert.equal(flow.message(G, initOf(id)), "pass");
	assert.deepEqual(log, ["write"]);
	assert.equal(flow.open, true);
});

test("PRD-001.R38: a turn of the CLI's own before the reset is its turn, and the 15 s do not run during it", () => {
	const { flow, log, advance } = rig();
	flow.request();
	advance(5_000);
	assert.equal(flow.message(G, { type: "assistant", message: { role: "assistant", content: [] } }), "pass");
	advance(60_000);
	assert.deepEqual(log, ["write"]);
	// Its result is the turn's, not the clear's.
	assert.equal(flow.message(G, RESULT), "pass");
	advance(9_999);
	assert.equal(flow.open, true);
	advance(1);
	assert.equal(flow.open, false);
	assert.equal(log[1], "abandon");
});

test("PRD-001.R38: disposing the flow records nothing and lets the sends go", async () => {
	const { flow, log, advance } = rig();
	flow.request();
	const held = flow.held();
	flow.dispose();
	await held;
	advance(60_000);
	assert.deepEqual(log, ["write"]);
	assert.equal(flow.open, false);
});

test("PRD-001.R38: a second request while a clear is open does nothing", () => {
	const { flow, log } = rig();
	flow.request();
	flow.request();
	assert.deepEqual(log, ["write"]);
});

// --- The held /clear (PRD-001.R38) ------------------------------------------------

/** Let the flow's microtasks, its drain loop and the deliveries it awaits run. */
const settle = async () => {
	for (let turn = 0; turn < 30; turn++) await Promise.resolve();
};

/** The held sends as the tab shows them. */
const texts = (flow) => flow.heldView().sends.map((send) => send.text);

test("PRD-001.R38: a /clear sent while a turn runs is held, writes nothing and is drawn in the tray", () => {
	const { flow, log, hold } = rig();
	assert.equal(flow.holdClear("/clear"), true);
	assert.deepEqual(log, []);
	assert.equal(flow.blocked(), true);
	assert.equal(flow.holds(), true);
	assert.equal(flow.open, false, "no clear is open yet");
	assert.deepEqual(flow.heldView(), { clear: "/clear", sends: [] });
	assert.deepEqual(hold.notes, ["clear"], "the live region says it once");
	// One is held at a time; a second is the send path's to keep.
	assert.equal(flow.holdClear("/clear"), false);
});

test("PRD-001.R38: the turn ending writes /clear after the result's handler, and the messages behind it go in order once the clear completes", async () => {
	const { flow, log, hold, conversation } = rig();
	flow.holdClear("/clear");
	flow.hold("first", [], null);
	flow.hold("second", [], null);
	flow.hold("third", [], null);
	await settle();
	assert.deepEqual(hold.delivered, [], "held behind the /clear");
	assert.deepEqual(texts(flow), ["first", "second", "third"]);
	flow.turnChanged(false);
	assert.deepEqual(log, [], "not inside the handler that announced the end, so a restart it owed runs first");
	await settle();
	assert.deepEqual(log, ["write"]);
	assert.equal(flow.heldView().clear, null);
	assert.deepEqual(hold.delivered, [], "held behind the clear until it completes");
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.deepEqual(hold.delivered, ["first", "second", "third"], "each distinct send, in order, none dropped");
	assert.equal(conversation.sessionId, NEW);
	assert.deepEqual(flow.heldView(), { clear: null, sends: [] });
	assert.equal(flow.holds(), false);
});

test("PRD-001.R38: the held /clear is written after what runs in the turn's end handler, not inside it", async () => {
	const { flow, log } = rig();
	flow.holdClear("/clear");
	// What the tab does at a result: announce the end, then the session restarts for an owed effort change.
	flow.turnChanged(false);
	log.push("owed restart");
	await settle();
	assert.deepEqual(log, ["owed restart", "write"]);
});

test("PRD-001.R38: a second submit behind a held one is kept, not ignored", async () => {
	const { flow, hold } = rig();
	flow.hold("one", [], null);
	flow.hold("two", [], null);
	flow.hold("one", [], null);
	await settle();
	assert.deepEqual(hold.delivered, ["one", "two", "one"]);
});

test("PRD-001.R38: Cancel drops the held /clear and sends the messages behind it in order, writing nothing", async () => {
	const { flow, log, hold, advance } = rig();
	flow.holdClear("/clear");
	flow.hold("a", [], null);
	flow.hold("b", [], null);
	flow.cancelHeld();
	await settle();
	assert.deepEqual(hold.delivered, ["a", "b"]);
	assert.deepEqual(flow.heldView(), { clear: null, sends: [] });
	assert.deepEqual(hold.notes.filter((note) => note === "cancelled"), ["cancelled"], "the live region says Clear cancelled once");
	// The turn ending later runs nothing.
	flow.turnChanged(false);
	advance(60_000);
	await settle();
	assert.deepEqual(log.filter((entry) => entry === "write"), []);
	assert.equal(flow.blocked(), false);
	// Cancel with nothing held says nothing.
	const before = hold.notes.length;
	flow.cancelHeld();
	assert.equal(hold.notes.length, before);
});

test("PRD-001.R38: a turn that ends with a message queued behind it waits for that turn, and a steered one for 3 s", async () => {
	const queued = rig();
	queued.flow.holdClear("/clear");
	queued.flow.turnChanged(false, true);
	await settle();
	assert.deepEqual(queued.log, [], "the queued turn runs first");
	queued.flow.turnChanged(true);
	queued.advance(10_000);
	await settle();
	assert.deepEqual(queued.log, [], "the queued turn is running");
	queued.flow.turnChanged(false);
	await settle();
	assert.deepEqual(queued.log, ["write"]);

	const steered = rig();
	steered.flow.holdClear("/clear");
	steered.flow.turnChanged(false, true);
	steered.advance(2_999);
	await settle();
	assert.deepEqual(steered.log, []);
	steered.advance(1);
	await settle();
	assert.deepEqual(steered.log, ["write"], "no turn followed: the CLI ran the message in the first");
});

test("PRD-001.R38: the held /clear with no CLI running is recorded, the resume id dropped, then the held messages go", async () => {
	const { flow, log, hold, conversation } = rig({ running: false });
	flow.holdClear("/clear");
	flow.hold("after", [], null);
	flow.turnChanged(false);
	await settle();
	assert.deepEqual(log.slice(0, 4), ["record user", "record clear", "cleared null", "onCleared"]);
	assert.equal(conversation.sessionId, null);
	assert.deepEqual(hold.delivered, ["after"]);
});

test("PRD-001.R38: a held /clear with nothing to clear records nothing and the messages behind it still go", async () => {
	const { flow, log, hold } = rig({ messages: [] });
	flow.holdClear("/clear");
	flow.hold("after", [], null);
	flow.turnChanged(false);
	await settle();
	assert.deepEqual(log.filter((entry) => entry !== "deliver after"), []);
	assert.deepEqual(hold.delivered, ["after"]);
});

test("PRD-001.R38: a held /clear that meets a restore is not written, and it and the messages behind it go back to the tab, never into the old context", async () => {
	for (const block of ["restore"]) {
		const { flow, log, hold } = rig();
		hold.block = block;
		flow.holdClear("/clear");
		flow.hold("after", [{ name: "i1" }], null);
		flow.hold("later", [], null);
		flow.turnChanged(false);
		await settle();
		assert.deepEqual(log, [`declined ${block} /clear [after,later]`], block);
		assert.deepEqual(hold.delivered, [], "nothing is sent");
		assert.deepEqual(hold.declinedImages, [[1, 0]], "its images travel with it");
		assert.equal(flow.holds(), false);
		assert.deepEqual(flow.heldView(), { clear: null, sends: [] });
	}
});

test("PRD-001.R38: a /clear replayed from the held messages that meets a restore hands the tab the messages behind it, and they are not sent", async () => {
	const { flow, log, hold } = rig();
	hold.onDeliver = (send) => (send.text === "/clear" ? (flow.decline("restore", "/clear"), "sent") : "sent");
	// Held behind an open clear, so all three are queued when the head's turn comes.
	flow.request();
	flow.hold("/clear", [], null);
	flow.hold("tail", [], null);
	flow.hold("tail 2", [], null);
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.deepEqual(log.filter((entry) => entry.startsWith("declined")), ["declined restore /clear [tail,tail 2]"]);
	assert.deepEqual(hold.delivered, ["/clear"]);
	assert.deepEqual(texts(flow), []);
});

test("PRD-001.R38: messages sent while a clear is open are held and go, in order, when it settles", async () => {
	const { flow, hold } = rig();
	flow.request();
	assert.equal(flow.blocked(), true);
	flow.hold("x", [], null);
	flow.hold("y", [], null);
	await settle();
	assert.deepEqual(hold.delivered, []);
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.deepEqual(hold.delivered, ["x", "y"]);
});

test("PRD-001.R38: a message the send path keeps in its place stays first, and one it took or returned leaves the tray", async () => {
	const { flow, hold } = rig();
	hold.results = ["again", "kept", "sent"];
	flow.hold("p", [], null);
	flow.hold("q", [], null);
	await settle();
	// "p" again (its place kept), then "p" returned to the composer, then "q" sent.
	assert.deepEqual(hold.delivered, ["p", "p", "q"]);
	assert.deepEqual(texts(flow), []);
});

test("PRD-001.R38: a message made while another is being sent goes after it, one at a time", async () => {
	const { flow, hold } = rig();
	hold.deferred = true;
	flow.hold("one", [], null);
	await settle();
	flow.hold("two", [], null);
	await settle();
	assert.deepEqual(hold.delivered, ["one"], "two waits for one");
	hold.pendingDeliveries.shift()();
	await settle();
	assert.deepEqual(hold.delivered, ["one", "two"]);
	hold.pendingDeliveries.shift()();
	await settle();
	assert.deepEqual(texts(flow), []);
});

test("PRD-001.R38: a /clear held behind a clear stays held behind it, with the message after it, when the send path holds it for the turn's end", async () => {
	const { flow, hold, log } = rig();
	// The send path takes a replayed "/clear" as a held /clear while a turn runs.
	hold.onDeliver = (send) => (send.text === "/clear" ? (flow.holdClear("/clear") ? "sent" : "again") : "sent");
	flow.hold("/clear", [], null);
	flow.hold("behind", [], null);
	await settle();
	assert.deepEqual(hold.delivered, ["/clear"], "behind is not delivered");
	assert.deepEqual(flow.heldView().clear, "/clear");
	assert.deepEqual(texts(flow), ["behind"]);
	assert.deepEqual(log.filter((entry) => entry === "write"), [], "nothing written");
	flow.turnChanged(false);
	await settle();
	assert.deepEqual(log.filter((entry) => entry === "write"), ["write"]);
	assert.deepEqual(hold.delivered, ["/clear"], "behind still held until the clear completes");
	assert.deepEqual(texts(flow), ["behind"]);
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.deepEqual(hold.delivered, ["/clear", "behind"], "behind goes exactly once");
	assert.deepEqual(texts(flow), []);
});

test("PRD-001.R38: a /clear replayed from the held messages that writes at once holds the message behind it until the clear completes", async () => {
	const { flow, hold, log } = rig();
	hold.onDeliver = (send) => (send.text === "/clear" ? (flow.request(), "sent") : "sent");
	flow.hold("/clear", [], null);
	flow.hold("behind", [], null);
	await settle();
	assert.deepEqual(log, ["deliver /clear", "write"]);
	assert.deepEqual(hold.delivered, ["/clear"]);
	assert.deepEqual(texts(flow), ["behind"]);
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.deepEqual(hold.delivered, ["/clear", "behind"]);
});

test("PRD-001.R38: closing the tab drops the held /clear and the held messages without sending or writing", async () => {
	const { flow, log, hold, advance } = rig();
	flow.holdClear("/clear");
	flow.hold("a", [], null);
	flow.turnChanged(false, true);
	flow.dispose();
	advance(60_000);
	await settle();
	assert.deepEqual(log, []);
	assert.deepEqual(hold.delivered, []);
	assert.deepEqual(flow.heldView(), { clear: null, sends: [] });
	flow.hold("late", [], null);
	await settle();
	assert.deepEqual(hold.delivered, [], "a disposed flow sends nothing");
});

test("PRD-001.R38: closing the tab between the turn's end and the held /clear writing writes nothing", async () => {
	const { flow, log } = rig();
	flow.holdClear("/clear");
	flow.turnChanged(false);
	flow.dispose();
	await settle();
	assert.deepEqual(log, []);
});

test("PRD-001.R38: a host call that throws when the held /clear fires cannot strand the messages behind it, which go in order", async () => {
	const log = console.error;
	console.error = () => {};
	try {
		for (const where of ["heldChanged", "clearBlock", "declined", "conversation", "session"]) {
			const { flow, hold } = rig();
			hold.block = where === "declined" ? "restore" : null;
			flow.holdClear("/clear");
			flow.hold("a", [], null);
			flow.hold("b", [], null);
			hold.throwIn.add(where);
			flow.turnChanged(false);
			await settle();
			hold.throwIn.clear();
			flow.message(G, RESET);
			flow.message(G, initOf(NEW));
			flow.message(G, RESULT);
			await settle();
			if (where !== "declined") assert.deepEqual(hold.delivered, ["a", "b"], where);
			else assert.deepEqual(hold.delivered, [], "declined sends none; the tab has them back");
			assert.equal(flow.holds(), false, where);
			assert.deepEqual(flow.heldView(), { clear: null, sends: [] }, where);
		}
	} finally {
		console.error = log;
	}
});

test("PRD-001.R38: a delivery that rejects once is logged and the messages behind it still go, in order", async () => {
	const log = console.error;
	console.error = () => {};
	try {
		const { flow, hold } = rig();
		hold.results = [new Error("deliver"), "sent", "sent"];
		flow.hold("a", [], null);
		flow.hold("b", [], null);
		flow.hold("c", [], null);
		await settle();
		assert.deepEqual(hold.delivered, ["a", "b", "c"]);
		assert.equal(flow.holds(), false);
		assert.deepEqual(texts(flow), [], "nothing is left at the head");
	} finally {
		console.error = log;
	}
});

// --- The flow over a real session and the fake CLI ------------------------------

const { ClaudeSession } = await import("./.build/session.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = path.join(here, "fake-cli.mjs");
const F001 = "00000000-0000-4000-8000-00000000f001";
const F002 = "00000000-0000-4000-8000-00000000f002";

/** A flow and a session over the fake CLI, its timers fired by hand. */
async function live(clearMode, { env = {}, config = {}, resolved = {}, undoEnv = {} } = {}) {
	const messages = [];
	/** The tab's side of the held messages, and the permission requests the test answers by hand once `hold` is set. */
	const tab = { delivered: [], onResult: () => {} };
	const permit = { hold: false, pending: [] };
	const probes = [];
	const conversation = { sessionId: null, messages: [{ kind: "user", text: "hello", sentAt: 1 }] };
	const log = [];
	const session = new ClaudeSession(
		{ cliPath: FAKE_CLI, cwd: here, ...config, env: { FAKE_CLI_SCENARIO: "basic", ...(clearMode ? { FAKE_CLI_CLEAR: clearMode } : {}), ...env } },
		{
			onStreamMessage: (msg) => {
				if (msg.subtype === "probe") probes.push(msg);
				else messages.push(msg);
				if (msg.type === "result") tab.onResult();
			},
			onPermissionRequest: (req) =>
				permit.hold
					? new Promise((resolve) => permit.pending.push(() => resolve({ behavior: "allow", updatedInput: req.input })))
					: Promise.resolve({ behavior: "allow", updatedInput: req.input }),
			onPermissionCancelled: () => {},
			onBusyChanged: (busy) => log.push(`busy ${busy}`),
			onEnded: () => {},
		},
		"profile-1"
	);
	const timers = [];
	const host = {
		conversation: () => conversation,
		session: () => session,
		resumeId: () => conversation.sessionId,
		unstartedBranch: () => false,
		dropBranch: () => {},
		recordSession: (id) => log.push(`recordSession ${id}`),
		record: (message) => conversation.messages.push(message),
		cleared: (id) => log.push(`cleared ${id}`),
		onCleared: () => log.push("onCleared"),
		resolvedModels: () => resolved,
		reapplied: (values) => log.push(`reapplied ${JSON.stringify(values)}`),
		picking: () => false,
		released: () => {},
		// The Undo's CLI is a second fake process (PRD-001.R38).
		foreignSession: () => false,
		facts: () => ({ working: false, restoring: false, starting: false, picking: false }),
		launchGeneration: () => 1,
		startUndo: async (id, gate) => {
			undone.session = new ClaudeSession(
				{ cliPath: FAKE_CLI, cwd: here, resumeSessionId: id, env: { FAKE_CLI_SCENARIO: "basic", ...env, ...undoEnv } },
				{
					onStreamMessage: (msg) => msg.subtype === "probe" && probes.push(msg),
					onPermissionRequest: async (req) => ({ behavior: "allow", updatedInput: req.input }),
					onPermissionCancelled: () => {},
					onBusyChanged: () => {},
					onEnded: () => {},
				},
				"profile-1"
			);
			undone.session.setClearGate(gate);
			return true;
		},
		probeUndo: () => undone.session.probe(),
		stopUndo: () => {
			log.push("stopUndo");
			undone.session?.dispose();
		},
		adoptUndo: (id) => (log.push(`adoptUndo ${id}`), true),
		undone: (usage) => log.push(`undone ${usage ? usage.totalTokens : null}`),
		undoFailed: () => log.push("undoFailed"),
		undoChanged: () => changes.push(1),
		heldChanged: () => {},
		deliver: async (send) => (tab.delivered.push(send.text), "sent"),
		mayClear: () => true,
		declined: (cause) => log.push(`declined ${cause}`),
		tasks: () => messages.filter((m) => m.subtype === "task_started").map((m) => ({ taskId: m.task_id })),
		turnRunning: () => false,
		denyCards: (on) => log.push(`deny ${on}`),
		confirmStop: async () => "stop",
		processReplaced: () => {},
	};
	const undone = { session: null };
	const changes = [];
	const flow = new ClearFlow(host, {
		setTimeout: (callback, ms) => timers.push({ callback, ms }) - 1,
		clearTimeout: (id) => (timers[id] = { callback() {}, ms: 0 }),
		setInterval: () => 0,
		clearInterval: () => {},
	});
	session.setClearGate(flow);
	session.send("hello");
	await waitUntil(() => messages.some((m) => m.type === "result"));
	conversation.sessionId = session.sessionId;
	return { flow, session, conversation, messages, probes, log, timers, undone, changes, tab, permit };
}

const waitUntil = async (predicate, ms = 5000) => {
	const end = Date.now() + ms;
	while (!predicate()) {
		if (Date.now() > end) throw new Error("timed out waiting for the fake CLI");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
};

test("PRD-001.R38, E1: a clear over the fake CLI stores the new session, records no turn and does not end a later one", async () => {
	const { flow, session, conversation, messages, log } = await live();
	try {
		const results = messages.filter((m) => m.type === "result").length;
		flow.request();
		const held = flow.held();
		await held;
		assert.equal(conversation.sessionId, F002);
		assert.deepEqual(conversation.messages.at(-1), { kind: "clear", at: conversation.messages.at(-1).at, sessionId: F001 });
		assert.deepEqual(log, ["busy true", "busy false", `recordSession ${F002}`, `cleared ${F002}`, "onCleared"]);
		assert.equal(messages.filter((m) => m.type === "result").length, results, "the zero result reached nothing");
		assert.equal(messages.some((m) => m.type === "conversation_reset"), false);
		assert.equal(session.sessionId, F002);
		assert.equal(session.busy, false);
		// The next turn runs on the new session and ends normally.
		session.send("again");
		await waitUntil(() => messages.filter((m) => m.type === "result").length === results + 1);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a CLI that never answers is stopped after 15 s and the clear completes without a session", async () => {
	const { flow, session, conversation, timers, log } = await live("silent");
	try {
		flow.request();
		assert.equal(timers.at(-1).ms, 15_000);
		timers.at(-1).callback();
		await flow.held();
		assert.equal(conversation.sessionId, null);
		assert.equal(conversation.messages.at(-1).kind, "clear");
		assert.equal(session.running, false);
		assert.equal(log.at(-2), "cleared null");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a CLI that exits on /clear completes the clear without a session", async () => {
	const { flow, session, conversation } = await live("exit");
	try {
		flow.request();
		await flow.held();
		assert.equal(conversation.sessionId, null);
		assert.equal(conversation.messages.at(-1).kind, "clear");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a CLI that starts the new session and sends no result is restarted resuming it after 15 s", async () => {
	const { flow, session, conversation, probes, timers } = await live("no-result");
	try {
		flow.request();
		await waitUntil(() => conversation.sessionId === F002);
		assert.equal(flow.open, true);
		timers.at(-1).callback();
		await flow.held();
		assert.equal(conversation.messages.filter((m) => m.kind === "clear").length, 1);
		await waitUntil(() => probes.filter((p) => p.what === "argv").length === 2);
		const argv = probes.filter((p) => p.what === "argv")[1].argv;
		assert.equal(argv[argv.indexOf("--resume") + 1], F002);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a CLI that resets but starts no session, or reports the old id, is stopped after 15 s and the clear completes without a session", async () => {
	for (const mode of ["no-init", "same-id"]) {
		const { flow, session, conversation, timers, log } = await live(mode);
		try {
			flow.request();
			await new Promise((resolve) => setTimeout(resolve, 250));
			assert.equal(flow.open, true, `${mode}: no commit`);
			assert.equal(conversation.messages.some((m) => m.kind === "clear"), false);
			timers.at(-1).callback();
			await flow.held();
			assert.equal(conversation.sessionId, null, mode);
			assert.equal(conversation.messages.at(-1).kind, "clear");
			assert.equal(session.running, false);
			assert.equal(log.some((entry) => entry.startsWith("recordSession")), false, `${mode}: no id joined the record`);
		} finally {
			session.dispose();
		}
	}
});

test("PRD-001.R38: a turn of the CLI's own before the reset is recorded as a turn and the clear still completes", async () => {
	const { flow, session, conversation, messages } = await live("self-turn");
	try {
		const results = messages.filter((m) => m.type === "result").length;
		flow.request();
		await flow.held();
		assert.equal(conversation.sessionId, F002);
		assert.equal(messages.filter((m) => m.type === "result").length, results + 1, "its own turn's result passed");
		assert.ok(messages.some((m) => m.type === "assistant" && JSON.stringify(m).includes("background task")));
	} finally {
		session.dispose();
	}
});

// --- The picks a clear did not keep ----------------------------------------------

const LOST_INIT = initOf(NEW, { permissionMode: "default", model: "claude-opus-5-5" });
const HELD = { permissionMode: "acceptEdits", model: "claude-sonnet-5" };
const PICKS = 'reapply {"permissionMode":"acceptEdits","model":"claude-sonnet-5"}';

test("PRD-001.R38: a new session that lost the mode or model sets them again and holds the sends until the CLI answers", async () => {
	const { flow, log, answer } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	assert.equal(flow.message(G, RESULT), "consume");
	assert.equal(log.at(-1), PICKS);
	assert.equal(flow.open, true);
	let released = false;
	void held.then(() => (released = true));
	await Promise.resolve();
	assert.equal(released, false);
	answer().resolve();
	await held;
	assert.equal(log.at(-1), 'reapplied {"permissionMode":"acceptEdits","model":"claude-sonnet-5"}');
	assert.equal(log.includes("restart"), false);
	assert.equal(flow.open, false);
});

test("PRD-001.R38: a new session that kept the mode and model sets nothing again", async () => {
	const { flow, log } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW, { permissionMode: "acceptEdits", model: "claude-sonnet-5" }));
	flow.message(G, RESULT);
	await held;
	assert.equal(log.some((entry) => entry.startsWith("reapply")), false);
});

test("PRD-001.R38: a refused set-again restarts the CLI resuming the new session, keeping the clear", async () => {
	const { flow, log, answer, conversation } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	answer().reject(new Error("Refused model"));
	await held;
	assert.equal(log.at(-1), "restart");
	assert.equal(conversation.sessionId, NEW);
	assert.equal(flow.open, false);
});

test("PRD-001.R38: no answer to the set-again within 15 s restarts the CLI resuming the new session", async () => {
	const { flow, log, advance, conversation } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	advance(14_999);
	assert.equal(flow.open, true);
	advance(1);
	await held;
	assert.equal(log.at(-1), "restart");
	assert.equal(conversation.sessionId, NEW);
	assert.equal(flow.open, false);
});

test("PRD-001.R38: a set-again answered after the restart is ignored", async () => {
	const { flow, log, advance, answer } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	advance(15_000);
	await held;
	const before = log.length;
	answer().resolve();
	await Promise.resolve();
	assert.equal(log.length, before);
});

test("PRD-001.R38: over the fake CLI a permission request of the running turn stays answerable while a /clear is held, and /clear is written only after the turn's result", async () => {
	const { flow, session, messages, conversation, tab, permit } = await live(undefined, { env: { FAKE_CLI_SCENARIO: "permission" } });
	try {
		const results = () => messages.filter((m) => m.type === "result").length;
		const before = results();
		permit.hold = true;
		tab.onResult = () => flow.turnChanged(false);
		session.send("edit the note");
		await waitUntil(() => permit.pending.length === 1);
		assert.equal(flow.holdClear("/clear"), true);
		flow.hold("after the clear", [], null);
		await new Promise((resolve) => setTimeout(resolve, 150));
		assert.equal(flow.open, false, "nothing is written while the card waits");
		assert.equal(session.sessionId, F001);
		assert.deepEqual(tab.delivered, []);
		// Answering the card is accepted, the turn ends, and only then is /clear written.
		permit.pending.shift()();
		await waitUntil(() => results() === before + 1);
		await waitUntil(() => conversation.sessionId === F002);
		assert.equal(session.sessionId, F002);
		assert.deepEqual(conversation.messages.filter((m) => m.kind === "clear").length, 1);
		await waitUntil(() => tab.delivered.length === 1);
		assert.deepEqual(tab.delivered, ["after the clear"]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, E1: over the fake CLI a new session that lost the mode and model has them set again, with no restart", async () => {
	const { flow, session, conversation, probes, log } = await live("", {
		config: { permissionMode: "acceptEdits", model: "claude-sonnet-5" },
		env: { FAKE_CLI_CLEAR_RESETS: "mode,model" },
	});
	try {
		flow.request();
		await flow.held();
		assert.equal(conversation.sessionId, F002);
		const sets = probes.filter((p) => p.what === "got_control_request" && (p.sub === "set_permission_mode" || p.sub === "set_model"));
		assert.deepEqual(sets.map((p) => [p.sub, p.request.mode ?? p.request.model]), [["set_permission_mode", "acceptEdits"], ["set_model", "claude-sonnet-5"]]);
		assert.equal(probes.filter((p) => p.what === "argv").length, 1, "the process was kept");
		assert.deepEqual(session.effective, { permissionMode: "acceptEdits", model: "claude-sonnet-5" });
		assert.equal(log.at(-1), 'reapplied {"permissionMode":"acceptEdits","model":"claude-sonnet-5"}');
		assert.equal(session.model, "claude-sonnet-5", "the launch config is as it was");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, E1: over the fake CLI a CLI that keeps the picks is sent nothing, under Auto-approve's default mode too", async () => {
	// The panel's Auto-approve launches the CLI in default; the flow compares CLI modes, never the panel's policy.
	const { flow, session, conversation, probes } = await live("", { config: { permissionMode: "default", model: "claude-sonnet-5" } });
	try {
		flow.request();
		await flow.held();
		assert.equal(conversation.sessionId, F002);
		assert.equal(probes.some((p) => p.what === "got_control_request" && /^set_/.test(p.sub)), false);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, E1: over the fake CLI a refused set-again restarts the CLI on the new session with the conversation's flags", async () => {
	const { flow, session, conversation, probes } = await live("", {
		config: { model: "claude-sonnet-5" },
		env: { FAKE_CLI_CLEAR_RESETS: "model", FAKE_CLI_REFUSE_MODEL: "claude-sonnet-5" },
	});
	try {
		flow.request();
		await flow.held();
		assert.equal(conversation.sessionId, F002);
		await waitUntil(() => probes.filter((p) => p.what === "argv").length === 2);
		const argv = probes.filter((p) => p.what === "argv")[1].argv;
		assert.equal(argv[argv.indexOf("--resume") + 1], F002);
		assert.equal(argv[argv.indexOf("--model") + 1], "claude-sonnet-5");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, E1: over the fake CLI a refused mode set-again restarts the CLI with the kept mode flag", async () => {
	const { flow, session, conversation, probes } = await live("", {
		config: { permissionMode: "acceptEdits" },
		env: { FAKE_CLI_CLEAR_RESETS: "mode", FAKE_CLI_REFUSE_MODE: "acceptEdits" },
	});
	try {
		flow.request();
		await flow.held();
		assert.equal(conversation.sessionId, F002);
		await waitUntil(() => probes.filter((p) => p.what === "argv").length === 2);
		const argv = probes.filter((p) => p.what === "argv")[1].argv;
		assert.equal(argv[argv.indexOf("--resume") + 1], F002);
		assert.equal(argv[argv.indexOf("--permission-mode") + 1], "acceptEdits");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, E1: over the fake CLI a mode picked while the clear is open is the one the CLI ends in, whether or not the clear undid it", async () => {
	for (const resets of ["", "mode"]) {
		const { flow, session, probes } = await live("", { config: { permissionMode: "acceptEdits" }, env: { FAKE_CLI_CLEAR_RESETS: resets } });
		try {
			flow.request();
			assert.equal(await session.setPermissionMode("plan"), true);
			await flow.held();
			const modes = probes.filter((p) => p.what === "got_control_request" && p.sub === "set_permission_mode").map((p) => p.request.mode);
			assert.deepEqual(modes, resets ? ["plan", "plan"] : ["plan"], `resets=${resets}`);
			assert.equal(session.effective.permissionMode, "plan");
			assert.equal(session.permissionMode, "plan");
		} finally {
			session.dispose();
		}
	}
});

test("PRD-001.R38: a pick accepted after the new session started, with a CLI that kept the picks, sends nothing", async () => {
	const { flow, log } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW, HELD));
	flow.picked(G, { permissionMode: "plan" });
	flow.message(G, RESULT);
	await held;
	assert.equal(log.some((entry) => entry.startsWith("reapply")), false);
});

test("PRD-001.R38: a pick accepted while the picks are set again is what the tab shows at the end", async () => {
	const { flow, log, answer } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	flow.picked(G, { permissionMode: "plan" });
	answer().resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(log.at(-1), 'reapply {"permissionMode":"plan"}');
	assert.equal(flow.open, true);
	answer().resolve();
	await held;
	assert.equal(log.at(-1), 'reapplied {"permissionMode":"plan"}');
});

test("PRD-001.R38: a set-again that took leaves the mode to a pick still waiting for the CLI", async () => {
	const { flow, log, flags, answer } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	flags.picking = true;
	answer().resolve();
	await held;
	assert.equal(log.at(-1), 'reapplied {"model":"claude-sonnet-5"}');
});

test("PRD-001.R38: when the clear ends the tab is told the mode the CLI runs, unless a pick waits", async () => {
	for (const picking of [false, true]) {
		const { flow, flags, shown, answer } = rig({ effective: HELD });
		flags.picking = picking;
		flow.request();
		const held = flow.held();
		flow.message(G, RESET);
		flow.message(G, LOST_INIT);
		flow.message(G, RESULT);
		answer().resolve();
		await held;
		assert.deepEqual(shown, picking ? [] : [HELD]);
	}
});

test("PRD-001.R38: a clear that restarted the CLI leaves the mode to the replacement's init", async () => {
	const { flow, shown, answer } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	answer().reject(new Error("Refused"));
	await held;
	assert.deepEqual(shown, []);
});

test("PRD-001.R38: a Default model pick during the set-again is sent as Default, with no model", async () => {
	const { flow, sentValues, answer } = rig({ effective: HELD });
	flow.request();
	const held = flow.held();
	flow.message(G, RESET);
	flow.message(G, LOST_INIT);
	flow.message(G, RESULT);
	flow.picked(G, { model: undefined });
	answer().resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(sentValues.length, 2);
	assert.equal("model" in sentValues[1] && sentValues[1].model === undefined && !("permissionMode" in sentValues[1]), true);
	answer().resolve();
	await held;
});

test("PRD-001.R38: the flow tells the view when the reset has come", () => {
	const { flow } = rig({ effective: HELD });
	assert.equal(flow.resetSeen, false);
	flow.request();
	assert.equal(flow.resetSeen, false, "committing, the CLI's own turn may still report");
	flow.message(G, RESET);
	assert.equal(flow.resetSeen, true);
	flow.message(G, initOf(NEW, HELD));
	flow.message(G, RESULT);
	assert.equal(flow.resetSeen, false);
});

test("PRD-001.R38: a new session that reports no mode while one is kept has it set again", async () => {
	const { flow, log, answer } = rig({ effective: { permissionMode: "plan" } });
	flow.request();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	assert.equal(log.at(-1), 'reapply {"permissionMode":"plan"}');
	answer().resolve();
});

test("PRD-001.R38: a mode status during the wait for the answer that is not the kept one is set again", async () => {
	const { flow, log } = rig({ effective: HELD });
	flow.request();
	flow.message(G, RESET);
	flow.message(G, initOf(NEW, HELD));
	assert.equal(flow.message(G, { type: "system", subtype: "status", permissionMode: "default" }), "pass");
	flow.message(G, RESULT);
	assert.equal(log.at(-1), 'reapply {"permissionMode":"acceptEdits"}');
});

// --- Undo (PRD-001.R38) -----------------------------------------------------------------

const CLEARED = [...TURN, { kind: "clear", at: 500, sessionId: OLD }];
const USAGE = { totalTokens: 1234, maxTokens: 200000, categories: [] };
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A rig whose conversation ends in a clear, with an Undo pressed. */
function pressed(options = {}) {
	const r = rig({ messages: CLEARED, ...options });
	r.flow.undo();
	return r;
}
/** The same, with the Undo's CLI started and asked. */
async function started(options) {
	const r = pressed(options);
	r.undoer.started(true);
	await tick();
	return r;
}

test("PRD-001.R38: the offer is the latest clear, foreign when the device did not record its session", () => {
	const { flow, undoer } = rig({ messages: CLEARED });
	assert.equal(flow.offer().sessionId, OLD);
	assert.equal(flow.offer().foreign, false);
	undoer.foreign.add(OLD);
	assert.equal(flow.offer().foreign, true);
	assert.equal(rig({ messages: TURN }).flow.offer(), null);
	assert.equal(rig({ messages: null }).flow.offer(), null);
});

test("PRD-001.R38: pressing Undo starts the CLI for the ended session, holds the sends and arms 15 s", () => {
	const { flow, log, pending } = pressed();
	assert.equal(flow.undoing, true);
	assert.notEqual(flow.held(), null);
	assert.ok(log.includes(`startUndo ${OLD}`));
	assert.equal([...pending.values()].length, 1);
});

test("PRD-001.R38: Undo does nothing for a foreign session, with no offer, while a turn runs, or while another Undo is pending", () => {
	const foreign = rig({ messages: CLEARED });
	foreign.undoer.foreign.add(OLD);
	foreign.flow.undo();
	assert.deepEqual(foreign.log, []);
	const none = rig({ messages: TURN });
	none.flow.undo();
	assert.deepEqual(none.log, []);
	const busy = rig({ messages: CLEARED });
	busy.undoer.facts.working = true;
	busy.flow.undo();
	assert.deepEqual(busy.log, []);
	const { flow, log } = pressed();
	const before = log.length;
	flow.undo();
	assert.equal(log.length, before);
});

test("PRD-001.R38: a parsed success makes the CLI the tab's, removes the clear's record, stores the resumed id and releases the sends", async () => {
	const { flow, log, conversation, undoer } = await started();
	const held = flow.held();
	undoer.probed.resolve(USAGE);
	await held;
	assert.ok(log.includes(`adoptUndo ${OLD}`));
	assert.ok(log.includes("undone 1234"));
	assert.equal(log.includes("stopUndo"), false);
	assert.equal(log.includes("undoFailed"), false);
	assert.equal(conversation.messages.some((m) => m.kind === "clear"), false);
	assert.equal(conversation.sessionId, OLD);
	assert.equal(flow.undoing, false);
	assert.equal(flow.held(), null);
});

test("PRD-001.R38: an error reply, a CLI that did not start, an error result and an exit each fail the Undo and leave the record", async () => {
	const cases = {
		"error reply": (r) => r.undoer.probed.reject(new Error("no")),
		"not started": () => {},
		"error result": (r) => r.undoer.gate.message(9, { type: "result", subtype: "error_during_execution", is_error: true }),
		exit: (r) => r.undoer.gate.closed(9),
	};
	for (const [name, act] of Object.entries(cases)) {
		const r = pressed();
		if (name === "not started") r.undoer.started(false);
		else {
			r.undoer.started(true);
			await tick();
		}
		act(r);
		await r.flow.held();
		assert.ok(r.log.includes("stopUndo"), `${name}: stopped`);
		assert.ok(r.log.includes("undoFailed"), `${name}: failure shown`);
		assert.equal(r.log.some((e) => e.startsWith("adoptUndo")), false, name);
		assert.equal(r.conversation.messages.at(-1).kind, "clear", `${name}: record kept`);
		assert.equal(r.flow.undoing, false, name);
	}
});

test("PRD-001.R38: no reply within 15 s fails the Undo, and a late reply changes nothing", async () => {
	const { flow, log, undoer, advance, conversation } = await started();
	advance(15_000);
	await flow.held();
	assert.ok(log.includes("stopUndo") && log.includes("undoFailed"));
	undoer.probed.resolve(USAGE);
	await tick();
	assert.equal(log.some((e) => e.startsWith("adoptUndo") || e.startsWith("undone")), false);
	assert.equal(conversation.messages.at(-1).kind, "clear");
});

test("PRD-001.R38: a tab that refuses the adoption (its launch settings or profile changed) fails the Undo", async () => {
	const { flow, log, undoer, conversation } = await started();
	undoer.adoptOk = false;
	undoer.probed.resolve(USAGE);
	await flow.held();
	assert.ok(log.includes("stopUndo") && log.includes("undoFailed"));
	assert.equal(log.some((e) => e.startsWith("undone")), false);
	assert.equal(conversation.messages.at(-1).kind, "clear");
});

test("PRD-001.R38: a message that now follows the clear, a newer clear, or a busy tab fails the Undo", async () => {
	const follow = await started();
	follow.conversation.messages.push({ kind: "user", text: "later", sentAt: 2 }, { kind: "meta", turn: 2 });
	follow.undoer.probed.resolve(USAGE);
	await follow.flow.held();
	assert.ok(follow.log.includes("undoFailed"));
	assert.equal(follow.log.some((e) => e.startsWith("adoptUndo")), false);
	const second = await started();
	second.conversation.messages.push({ kind: "user", text: "x", sentAt: 2 }, { kind: "meta", turn: 2 }, { kind: "clear", at: 900, sessionId: NEW });
	second.undoer.probed.resolve(USAGE);
	await second.flow.held();
	assert.ok(second.log.includes("undoFailed"), "a newer clear is not the one pressed");
	const busy = await started();
	busy.undoer.facts.working = true;
	busy.undoer.probed.resolve(USAGE);
	await busy.flow.held();
	assert.ok(busy.log.includes("undoFailed"));
});

test("PRD-001.R38: a /clear request while an Undo runs does nothing", () => {
	const { flow, log } = pressed();
	const before = log.length;
	flow.request();
	assert.equal(log.length, before);
});

test("PRD-001.R38: closing the tab stops the Undo's CLI and releases the sends without a failure", async () => {
	const { flow, log, advance } = await started();
	const held = flow.held();
	flow.dispose();
	await held;
	assert.ok(log.includes("stopUndo"));
	assert.equal(log.includes("undoFailed"), false);
	advance(20_000);
	assert.equal(log.filter((e) => e === "stopUndo").length, 1);
});

test("PRD-001.R38, V1: over the fake CLI, a clear and its Undo resume the ended session and adopt its usage", async () => {
	const { flow, session, conversation, log, undone } = await live();
	try {
		flow.request();
		await flow.held();
		assert.equal(flow.offer().sessionId, F001);
		flow.undo();
		await flow.held();
		assert.deepEqual(log.slice(-2), [`adoptUndo ${F001}`, "undone " + log.at(-1).split(" ")[1]]);
		assert.equal(conversation.messages.some((m) => m.kind === "clear"), false);
		assert.equal(conversation.sessionId, F001);
		assert.equal(log.includes("undoFailed"), false);
		assert.ok(Number(log.at(-1).split(" ")[1]) > 0, "the resumed session's usage");
		undone.session.dispose();
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, V1: over the fake CLI, a session the CLI does not hold fails the Undo and leaves the clear", async () => {
	const { flow, session, conversation, log, undone } = await live(undefined, { undoEnv: { FAKE_CLI_UNKNOWN_SESSION: "1" } });
	try {
		flow.request();
		await flow.held();
		flow.undo();
		await flow.held();
		assert.ok(log.includes("undoFailed"));
		assert.ok(log.includes("stopUndo"));
		assert.equal(log.some((e) => e.startsWith("adoptUndo")), false);
		assert.equal(conversation.messages.at(-1).kind, "clear");
		assert.equal(conversation.sessionId, F002);
		undone.session?.dispose();
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: over the fake CLI, a reply without the categories fails the Undo", async () => {
	const { flow, session, conversation, log, undone } = await live(undefined, { undoEnv: { FAKE_CLI_USAGE: "bare" } });
	try {
		flow.request();
		await flow.held();
		flow.undo();
		await flow.held();
		assert.ok(log.includes("undoFailed"));
		assert.equal(conversation.messages.at(-1).kind, "clear");
		undone.session?.dispose();
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a mode or model pick pending at the press blocks the Undo, and the button says why", () => {
	const r = rig({ messages: CLEARED });
	r.undoer.facts.picking = true;
	assert.equal(r.flow.undoView(), "picking");
	r.flow.undo();
	assert.deepEqual(r.log, []);
	assert.equal(r.flow.undoing, false);
});

test("PRD-001.R38: a pick made during the Undo, Bypass from Ask, fails it at adoption: never a CLI looser than the tab shows", async () => {
	const { flow, log, undoer, conversation } = await started();
	// The pick is pending when the probe answers; the old CLI could still refuse it after the swap.
	undoer.facts.picking = true;
	undoer.probed.resolve(USAGE);
	await flow.held();
	assert.equal(log.some((e) => e.startsWith("adoptUndo")), false);
	assert.ok(log.includes("stopUndo") && log.includes("undoFailed"));
	assert.equal(conversation.messages.at(-1).kind, "clear");
});

test("PRD-001.R38: a turn, a restore or a CLI start at adoption fails the Undo", async () => {
	for (const fact of ["working", "restoring", "starting"]) {
		const r = await started();
		r.undoer.facts[fact] = true;
		r.undoer.probed.resolve(USAGE);
		await r.flow.held();
		assert.ok(r.log.includes("undoFailed"), fact);
		assert.equal(r.log.some((e) => e.startsWith("adoptUndo")), false, fact);
	}
});

test("PRD-001.R38: a change of the CLI path, WSL or profile settings during the lookup, the start or the probe fails the Undo", async () => {
	const probing = await started();
	probing.undoer.generation = 2;
	probing.undoer.probed.resolve(USAGE);
	await probing.flow.held();
	assert.ok(probing.log.includes("undoFailed"));
	assert.equal(probing.log.some((e) => e.startsWith("adoptUndo")), false);
	// Changed while the CLI was still starting: the generation is the one at the press.
	const starting = pressed();
	starting.undoer.generation = 2;
	starting.undoer.started(true);
	await tick();
	starting.undoer.probed.resolve(USAGE);
	await starting.flow.held();
	assert.ok(starting.log.includes("undoFailed"));
	assert.equal(starting.log.some((e) => e.startsWith("adoptUndo")), false);
});

test("PRD-001.R38: no Undo is offered while a clear is open, and the dividers draw again when it settles", async () => {
	const { flow, session, changes } = await live();
	try {
		flow.request();
		assert.equal(flow.undoView(), null, "the clear's answer has not arrived");
		flow.undo();
		assert.equal(flow.undoing, false);
		const before = changes.length;
		await flow.held();
		assert.equal(flow.undoView(), "ready");
		assert.ok(changes.length > before, "redrawn at the release");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: the button state follows the tab: ready, blocked with the reason, pending while the Undo runs, none without an offer", () => {
	const r = rig({ messages: CLEARED });
	assert.equal(r.flow.undoView(), "ready");
	for (const fact of ["working", "restoring", "starting", "picking"]) {
		r.undoer.facts[fact] = true;
		assert.equal(r.flow.undoView(), fact);
		r.undoer.facts[fact] = false;
	}
	r.undoer.foreign.add(OLD);
	assert.equal(r.flow.undoView(), "foreign");
	assert.equal(rig({ messages: TURN }).flow.undoView(), null);
	const running = pressed();
	assert.equal(running.flow.undoView(), "pending");
});

test("PRD-001.R38: the sends are released only once the Undo's save has resolved, or failed", async () => {
	for (const settle of ["resolve", "reject"]) {
		const r = await started();
		r.undoer.undone = "deferred";
		const held = r.flow.held();
		let released = false;
		void held.then(() => (released = true));
		r.undoer.probed.resolve(USAGE);
		await tick();
		assert.ok(r.log.includes("undone 1234"));
		assert.equal(released, false, `${settle}: not before the save`);
		assert.equal(r.flow.undoing, false, "the Undo itself is over");
		r.undoer.saved[settle](new Error("disk"));
		await held;
		await tick();
		assert.equal(released, true, settle);
	}
});

test("PRD-001.R38: a save that never settles releases the sends after 5 s, not before", async () => {
	const r = await started();
	r.undoer.undone = "deferred";
	const held = r.flow.held();
	let released = false;
	void held.then(() => (released = true));
	r.undoer.probed.resolve(USAGE);
	await tick();
	r.advance(4_999);
	await tick();
	assert.equal(released, false, "inside the bound");
	r.advance(1);
	await held;
	assert.equal(released, true, "at the bound");
	assert.equal(r.flow.held(), null);
	r.undoer.saved.resolve();
	await tick();
});

test("PRD-001.R38: a bound that fires after a settled save does not release a later hold", async () => {
	const r = await started();
	r.undoer.undone = "deferred";
	const first = r.flow.held();
	r.undoer.probed.resolve(USAGE);
	await tick();
	r.undoer.saved.resolve();
	await first;
	await tick();
	assert.equal(r.pending.size, 0, "the bound is cancelled once the save settles");
	// A later hold: a new clear holds the sends again; no earlier timer may let it go.
	r.flow.dispose();
	assert.equal(r.flow.held(), null);
});

test("PRD-001.R38: a callback that throws cannot strand the hold:the sends are released and the state is consistent", async () => {
	const saving = await started();
	saving.undoer.undone = "throw";
	saving.undoer.probed.resolve(USAGE);
	await saving.flow.held();
	assert.equal(saving.flow.undoing, false);
	assert.equal(saving.flow.held(), null);
	// The adoption itself throws: the Undo failed, the CLI is stopped, the record stays.
	const adopting = await started();
	adopting.undoer.throwOnAdopt = true;
	adopting.undoer.probed.resolve(USAGE);
	await adopting.flow.held();
	assert.ok(adopting.log.includes("stopUndo") && adopting.log.includes("undoFailed"));
	assert.equal(adopting.conversation.messages.at(-1).kind, "clear");
	assert.equal(adopting.flow.undoing, false);
});

test("PRD-001.R38: the Undo's CLI messages never reach the tab", async () => {
	const { undoer } = await started();
	assert.equal(undoer.gate.message(9, { type: "assistant", message: { content: [] } }), "consume");
	assert.equal(undoer.gate.message(9, { type: "system", subtype: "init" }), "consume");
});

// --- Stop and clear (PRD-001.R38, DES-002 Stop and clear) --------------------------------

const ended = (taskId, status = "stopped") => ({ type: "system", subtype: "task_notification", task_id: taskId, status });
const taskStarted = (taskId) => ({ type: "system", subtype: "task_started", task_id: taskId });
const updated = (taskId, status) => ({ type: "system", subtype: "task_updated", task_id: taskId, patch: { status } });

/** A rig with running tasks and a turn, a Stop and clear begun for "/clear". */
function stopping({ turn = true, ids = ["a", "b"], ...options } = {}) {
	const made = rig(options);
	made.hold.tasks = ids.map((taskId) => ({ taskId }));
	made.hold.turn = turn;
	assert.equal(made.flow.stopAndClear("/clear"), true);
	return made;
}

/** Every write the stop made, in order. */
const writes = (log) => log.filter((entry) => /^(deny|stopTask|interrupt|write)/.test(entry));

test("PRD-001.R38: Stop and clear denies the cards, stops each task, then interrupts, and writes nothing while a turn or a task runs", async () => {
	const { flow, log } = stopping();
	await settle();
	assert.deepEqual(writes(log), ["deny true", "stopTask a", "stopTask b", "interrupt"]);
	assert.equal(flow.stopping, true);
	assert.equal(flow.blocked(), true);
	// A stop reply is no proof: nothing is written until the reports and the turn's end come.
	flow.message(G, ended("a"));
	flow.turnChanged(false);
	await settle();
	assert.equal(writes(log).includes("write"), false);
	flow.message(G, ended("b"));
	await settle();
	assert.deepEqual(writes(log).slice(4), ["write", "deny false"]);
});

test("PRD-001.R38: the clear completes after Stop and clear and releases the held messages, in order, into the new context", async () => {
	const { flow, hold, conversation } = stopping();
	flow.hold("after", [], null);
	flow.message(G, ended("a"));
	flow.message(G, ended("b"));
	flow.turnChanged(false);
	await settle();
	assert.deepEqual(hold.delivered, []);
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.equal(conversation.messages.at(-1).kind, "clear");
	assert.deepEqual(hold.delivered, ["after"]);
	assert.equal(flow.stopping, false);
});

test("PRD-001.R38: a task that starts mid-stop is stopped too and waited for", async () => {
	const { flow, log } = stopping({ ids: ["a"] });
	flow.message(G, ended("a"));
	flow.message(G, taskStarted("late"));
	flow.turnChanged(false);
	await settle();
	assert.ok(log.includes("stopTask late"));
	assert.equal(log.includes("write"), false);
	flow.message(G, ended("late"));
	await settle();
	assert.equal(log.includes("write"), true);
});

test("PRD-001.R38: a task whose status is unknown counts as running, so the clear waits and the bound fails it", async () => {
	const { flow, log, advance } = stopping({ ids: ["a"], turn: false });
	flow.message(G, updated("a", "paused"));
	await settle();
	assert.equal(log.includes("write"), false);
	advance(15_000);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(log.at(-1), "declined stop-failed /clear []");
});

test("PRD-001.R38: an interrupt with no turn running leaves nothing to wait for but the tasks", async () => {
	const { flow, log } = stopping({ ids: ["a"], turn: false });
	assert.ok(log.includes("interrupt"));
	flow.message(G, updated("a", "killed"));
	await settle();
	assert.equal(log.includes("write"), true);
});

test("PRD-001.R38: a stop that draws no events fails after 15 s: nothing is cleared, the cards are taken again and the held messages return to the tab", async () => {
	const { flow, log, hold, advance } = stopping();
	flow.hold("after", [], null);
	await settle();
	advance(14_999);
	assert.equal(flow.stopping, true);
	advance(1);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.deepEqual(log.slice(-2), ["deny false", "declined stop-failed /clear [after]"]);
	assert.deepEqual(hold.delivered, []);
	assert.equal(flow.stopping, false);
	assert.equal(flow.blocked(), false);
});

test("PRD-001.R38: the CLI exiting during the stop abandons it: nothing is written, and a late report finds nothing", async () => {
	const { flow, log } = stopping();
	flow.closed(G);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(log.at(-1), "declined stop-failed /clear []");
	flow.message(G, ended("a"));
	await settle();
	assert.equal(log.includes("write"), false);
});

test("PRD-001.R38: the exit of another process generation changes nothing", () => {
	const { flow } = stopping();
	flow.closed(G + 1);
	assert.equal(flow.stopping, true);
});

test("PRD-001.R38: the tab closing during the stop writes nothing and leaves no timer", async () => {
	const { flow, log, advance, pending } = stopping();
	flow.dispose();
	advance(15_000);
	flow.message(G, ended("a"));
	flow.message(G, ended("b"));
	flow.turnChanged(false);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(pending.size, 0);
	assert.equal(log.some((entry) => entry.startsWith("declined")), false);
});

test("PRD-001.R38: a second /clear while a stop runs is refused, and a typed /clear request is ignored", async () => {
	const { flow, log } = stopping();
	assert.equal(flow.stopAndClear("/clear"), false);
	flow.request();
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(log.filter((entry) => entry === "interrupt").length, 1);
});

test("PRD-001.R38: a turn that starts mid-stop is interrupted too, and the clear waits for it", async () => {
	const { flow, log } = stopping({ turn: false, ids: [] });
	// No task and no turn: the clear ran at once.
	await settle();
	assert.equal(log.includes("write"), true);
	assert.equal(flow.stopping, false);
	const second = stopping({ turn: false, ids: ["a"] });
	second.flow.turnChanged(true);
	assert.equal(second.log.filter((entry) => entry === "interrupt").length, 2);
	second.flow.message(G, ended("a"));
	await settle();
	assert.equal(second.log.includes("write"), false);
	second.flow.turnChanged(false);
	await settle();
	assert.equal(second.log.includes("write"), true);
});

test("PRD-001.R38: a write the CLI refuses proves nothing: the bound still decides", async () => {
	const { flow, log, hold, advance } = rig();
	hold.tasks = [{ taskId: "a" }];
	hold.stopRejects = true;
	flow.stopAndClear("/clear");
	await settle();
	assert.equal(flow.stopping, true);
	advance(15_000);
	await settle();
	assert.equal(log.at(-1), "declined stop-failed /clear []");
});

test("PRD-001.R38: with no running CLI Stop and clear clears as for an idle tab", async () => {
	const { flow, log, hold } = rig({ running: false });
	hold.tasks = [{ taskId: "a" }];
	flow.stopAndClear("/clear");
	await settle();
	assert.equal(log.includes("stopTask a"), false);
	assert.deepEqual(log.filter((entry) => entry.startsWith("record")), ["record user", "record clear"]);
});

test("PRD-001.R38: a held /clear released over a running task asks first; Cancel hands the tab the /clear and the messages behind it, unsent", async () => {
	const { flow, log, hold } = rig();
	hold.block = "tasks";
	flow.holdClear("/clear");
	flow.hold("after", [], null);
	flow.turnChanged(false);
	await settle();
	assert.equal(log.includes("confirmStop"), true);
	assert.equal(flow.stopping, true);
	hold.asked(false);
	await settle();
	assert.deepEqual(log.filter((entry) => entry.startsWith("declined")), ["declined cancelled /clear [after]"]);
	assert.deepEqual(hold.delivered, []);
	assert.equal(flow.stopping, false);
	assert.equal(flow.blocked(), false);
});

test("PRD-001.R38: a held /clear released over a running task and confirmed stops the tasks, then clears, then the messages go", async () => {
	const { flow, log, hold } = rig();
	hold.block = "tasks";
	hold.tasks = [{ taskId: "a" }];
	flow.holdClear("/clear");
	flow.hold("after", [], null);
	flow.turnChanged(false);
	await settle();
	hold.asked(true);
	await settle();
	assert.deepEqual(writes(log), ["deny true", "stopTask a", "interrupt"]);
	flow.message(G, ended("a"));
	await settle();
	assert.equal(log.includes("write"), true);
	assert.deepEqual(hold.delivered, []);
	flow.message(G, RESET);
	flow.message(G, initOf(NEW));
	flow.message(G, RESULT);
	await settle();
	assert.deepEqual(hold.delivered, ["after"]);
});

test("PRD-001.R38: a CLI exit that reads as an idle turn never completes the stop: nothing is cleared and the messages return", async () => {
	// session.ts ends the turn (setBusy false) before it reports the close.
	const exit = (made) => {
		made.fake.running = false;
		made.flow.turnChanged(false);
	};
	for (const lateClose of [false, true]) {
		const made = stopping({ ids: ["a"] });
		made.flow.hold("after", [], null);
		made.flow.message(G, ended("a"));
		exit(made);
		if (lateClose) made.flow.closed(G);
		await settle();
		assert.equal(made.log.includes("write"), false, `close ${lateClose}`);
		assert.equal(made.log.some((entry) => entry.startsWith("record")), false, `close ${lateClose}`);
		assert.equal(made.log.at(-1), "declined stop-failed /clear [after]", `close ${lateClose}`);
		assert.deepEqual(made.hold.delivered, [], `close ${lateClose}`);
		assert.equal(made.flow.stopping, false);
	}
	// An idle stop: no task, no turn; the process ends before the last look.
	const idle = stopping({ turn: false, ids: [] });
	idle.fake.running = false;
	await settle();
	assert.equal(idle.log.some((entry) => entry.startsWith("record")), false);
	assert.equal(idle.log.at(-1), "declined stop-failed /clear []");
});

test("PRD-001.R38: a process restarted under the stop (another generation) is not the stop's: nothing is cleared", async () => {
	const made = stopping({ turn: false, ids: [] });
	made.fake.generation = G + 1;
	await settle();
	assert.equal(made.log.includes("write"), false);
	assert.equal(made.log.at(-1), "declined stop-failed /clear []");
});

test("PRD-001.R38: a turn that begins between the last report and the clear keeps the stop going, the cards denied", async () => {
	const { flow, log, hold } = stopping({ ids: ["a"], turn: false });
	flow.message(G, ended("a"));
	// The tab's turn state changes with no message the stop reads.
	hold.turn = true;
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(flow.stopping, true);
	assert.equal(log.includes("deny false"), false);
	assert.equal(log.filter((entry) => entry === "interrupt").length, 2);
	flow.turnChanged(false);
	await settle();
	assert.deepEqual(writes(log).slice(-2), ["write", "deny false"]);
});

test("PRD-001.R38: a task the tab holds running at the last look is stopped and waited for, within the same deadline", async () => {
	const { flow, log, hold, advance } = stopping({ ids: ["a"], turn: false });
	flow.message(G, ended("a"));
	hold.tasks = [{ taskId: "a" }, { taskId: "late" }];
	await settle();
	assert.ok(log.includes("stopTask late"));
	assert.equal(log.includes("write"), false);
	advance(15_000);
	await settle();
	assert.equal(log.at(-1), "declined stop-failed /clear []");
});

test("PRD-001.R38: task_started and a turn in the same batch as the last terminal status are caught", async () => {
	const { flow, log } = stopping({ ids: ["a"], turn: false });
	flow.message(G, ended("a"));
	flow.message(G, taskStarted("late"));
	flow.turnChanged(true);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.ok(log.includes("stopTask late"));
	flow.message(G, ended("late"));
	flow.turnChanged(false);
	await settle();
	assert.equal(log.includes("write"), true);
});

test("PRD-001.R38: the cards stay denied until the clear is sent, never taken again earlier", async () => {
	const { flow, log } = stopping({ ids: ["a"], turn: false });
	flow.message(G, ended("a"));
	assert.equal(log.includes("deny false"), false);
	await settle();
	assert.ok(log.indexOf("write") < log.indexOf("deny false"));
});

test("PRD-001.R38: a message queued behind the turn that ended is waited for: its turn is interrupted too", async () => {
	const { flow, log } = stopping({ ids: [], turn: true });
	flow.turnChanged(false, true);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(flow.stopping, true);
	flow.turnChanged(true);
	assert.equal(log.filter((entry) => entry === "interrupt").length, 2);
	flow.turnChanged(false);
	await settle();
	assert.equal(log.includes("write"), true);
});

test("PRD-001.R38: a host call that throws while the stop begins fails it closed: nothing is cleared, the messages return", async () => {
	for (const where of ["session", "tasks", "turnRunning"]) {
		// A held /clear released over a running task, with a message behind it.
		const { flow, log, hold } = rig();
		hold.block = "tasks";
		flow.holdClear("/clear");
		flow.hold("after", [], null);
		flow.turnChanged(false);
		await settle();
		hold.throwIn.add(where);
		hold.asked(true);
		await settle();
		assert.equal(log.includes("write"), false, where);
		assert.equal(log.some((entry) => entry.startsWith("record")), false, where);
		assert.equal(log.at(-1), "declined stop-failed /clear [after]", where);
		assert.deepEqual(hold.delivered, [], where);
		assert.equal(flow.stopping, false, where);
		assert.equal(flow.blocked(), false, where);
	}
});

test("PRD-001.R38: a host call that throws at the last look, or a clear that throws starting, fails closed and drains nothing", async () => {
	const looked = stopping({ ids: ["a"], turn: false });
	looked.flow.hold("after", [], null);
	looked.hold.throwIn.add("tasks");
	looked.flow.message(G, ended("a"));
	await settle();
	assert.equal(looked.log.includes("write"), false);
	assert.equal(looked.log.at(-1), "declined stop-failed /clear [after]");
	assert.deepEqual(looked.hold.delivered, []);
	const clearing = stopping({ ids: ["a"], turn: false });
	clearing.flow.hold("after", [], null);
	clearing.hold.throwIn.add("conversation");
	clearing.flow.message(G, ended("a"));
	await settle();
	assert.equal(clearing.log.includes("write"), false);
	assert.ok(clearing.log.includes("declined stop-failed /clear [after]"));
	assert.equal(clearing.log.at(-1), "deny false");
	assert.deepEqual(clearing.hold.delivered, []);
	assert.equal(clearing.flow.stopping, false);
});

/** A live tab over the fake CLI's "steps" turn, which leaves a background agent and a background shell running. */
test("PRD-001.R38: a held /clear answered with nothing left to stop takes the plain route: sent when no turn runs, held while one does, never stopped", async () => {
	const idle = rig();
	idle.hold.block = "tasks";
	idle.flow.holdClear("/clear");
	idle.flow.hold("after", [], null);
	idle.flow.turnChanged(false);
	await settle();
	// The tasks ended while the question was open: the host answers "clear".
	idle.hold.asked("clear");
	await settle();
	assert.deepEqual(writes(idle.log), ["write"]);
	assert.equal(idle.log.includes("deny true"), false);
	assert.equal(idle.flow.open, true);
	idle.flow.message(G, RESET);
	idle.flow.message(G, initOf(NEW));
	idle.flow.message(G, RESULT);
	await settle();
	assert.deepEqual(idle.hold.delivered, ["after"]);
	const busy = rig();
	busy.hold.block = "tasks";
	busy.flow.holdClear("/clear");
	busy.flow.hold("after", [], null);
	busy.flow.turnChanged(false);
	await settle();
	busy.hold.block = null;
	busy.flow.turnChanged(true);
	busy.hold.asked("clear");
	await settle();
	assert.equal(busy.log.includes("write"), false);
	assert.equal(busy.flow.stopping, false);
	assert.equal(busy.flow.heldView().clear, "/clear");
	assert.deepEqual(busy.hold.delivered, []);
	busy.flow.turnChanged(false);
	await settle();
	assert.equal(busy.log.includes("write"), true);
});

test("PRD-001.R38: a message queued behind the turn that ended before the stop began is waited for", async () => {
	const { flow, log, hold } = rig();
	hold.tasks = [];
	flow.turnChanged(false, true);
	// The host reads no turn at this instant; the remembered queued message still counts.
	hold.turn = false;
	assert.equal(flow.stopAndClear("/clear"), true);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(flow.stopping, true);
	flow.turnChanged(true);
	assert.equal(log.filter((entry) => entry === "interrupt").length, 2);
	flow.turnChanged(false);
	await settle();
	assert.equal(log.includes("write"), true);
});

for (const where of ["turnRunning", "writeClear"]) {
	test(`PRD-001.R38: a held /clear answered "clear" whose ${where} throws declines stop-failed, returns the tail unsent and releases the hold`, async () => {
		const { flow, log, hold } = rig();
		hold.block = "tasks";
		flow.holdClear("/clear");
		flow.hold("after", [], null);
		flow.turnChanged(false);
		await settle();
		hold.block = null;
		hold.throwIn.add(where);
		hold.asked("clear");
		await settle();
		assert.equal(log.includes("write"), false);
		assert.ok(log.includes("declined stop-failed /clear [after]"));
		assert.deepEqual(hold.delivered, []);
		assert.equal(flow.open, false);
		assert.equal(flow.stopping, false);
		assert.equal(flow.heldView().clear, null);
		assert.equal(flow.enterClear(), true);
	});
}

test("PRD-001.R38: a message queued behind a turn does not outlive its process: a stop on the next one does not wait for it", async () => {
	const { flow, log, hold } = rig();
	hold.tasks = [];
	flow.turnChanged(false, true);
	flow.closed(G);
	hold.turn = false;
	assert.equal(flow.stopAndClear("/clear"), true);
	await settle();
	assert.equal(log.includes("write"), true);
	assert.equal(flow.stopping, false);
});

test("PRD-001.R38: while a /clear's question is open a second /clear is refused, the tasks finishing meanwhile or not", async () => {
	const { flow, hold } = rig();
	assert.equal(flow.enterClear(), true);
	assert.equal(flow.enterClear(), false);
	flow.leaveClear();
	assert.equal(flow.enterClear(), true);
	flow.leaveClear();
	// A held /clear's question counts too.
	hold.block = "tasks";
	flow.holdClear("/clear");
	flow.turnChanged(false);
	await settle();
	assert.equal(flow.enterClear(), false);
	hold.asked(false);
	await settle();
	assert.equal(flow.enterClear(), true);
	flow.leaveClear();
	// And a stop under way.
	const stopped = stopping();
	assert.equal(stopped.flow.enterClear(), false);
});

test("PRD-001.R38: a clear that throws after it began is dropped whole: the tab is as it was and a later /clear works", async () => {
	const plain = rig();
	plain.hold.throwIn.add("writeClear");
	assert.throws(() => plain.flow.request(), /writeClear/);
	assert.equal(plain.flow.open, false);
	assert.equal(plain.flow.blocked(), false);
	assert.equal(plain.flow.held(), null);
	plain.hold.throwIn.delete("writeClear");
	plain.flow.request();
	assert.equal(plain.flow.open, true);
	assert.deepEqual(plain.log, ["write"]);
	// After Stop and clear: the messages return, nothing drains, and a later /clear works.
	const { flow, log, hold, advance } = stopping({ ids: ["a"], turn: false });
	flow.hold("after", [], null);
	hold.throwIn.add("writeClear");
	flow.message(G, ended("a"));
	await settle();
	assert.ok(log.includes("declined stop-failed /clear [after]"));
	assert.deepEqual(hold.delivered, []);
	assert.equal(flow.open, false);
	assert.equal(flow.stopping, false);
	assert.equal(flow.blocked(), false);
	assert.equal(advance(60_000), undefined);
	hold.throwIn.delete("writeClear");
	flow.request();
	assert.equal(flow.open, true);
});

test("PRD-001.R38: an adopted Undo's CLI replaces the process: the tab forgets what the old one ran", async () => {
	const { flow, log, undoer } = await started();
	const held = flow.held();
	undoer.probed.resolve(USAGE);
	await held;
	assert.ok(log.indexOf(`adoptUndo ${OLD}`) < log.indexOf("processReplaced"));
	const refused = await started();
	refused.undoer.adoptOk = false;
	const waiting = refused.flow.held();
	refused.undoer.probed.resolve(USAGE);
	await waiting;
	assert.equal(refused.log.includes("processReplaced"), false);
});

const stepDirs = [];
after(() => stepDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
/** The steps scenario writes a note in its working directory: a temp one, as tests/protocol.test.mjs does. */
const liveSteps = (stop) => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), "fake-cli-steps-"));
	stepDirs.push(cwd);
	return live(undefined, { config: { cwd }, env: { FAKE_CLI_SCENARIO: "steps", ...(stop ? { FAKE_CLI_STOP: stop } : {}) } });
};
const notified = (messages, taskId) => messages.find((m) => m.subtype === "task_notification" && m.task_id === taskId);

test("PRD-001.R38: Stop and clear over the fake CLI stops both background tasks, then clears into a new session", async () => {
	const { flow, session, conversation, messages, log } = await liveSteps();
	try {
		const ids = messages.filter((m) => m.subtype === "task_started").map((m) => m.task_id);
		assert.equal(ids.length, 2);
		assert.equal(flow.stopAndClear("/clear"), true);
		await flow.held();
		for (const id of ids) assert.equal(notified(messages, id)?.status, "stopped", id);
		assert.equal(conversation.sessionId, F002);
		assert.equal(conversation.messages.at(-1).kind, "clear");
		assert.ok(log.indexOf("deny true") < log.indexOf("deny false") && log.indexOf("deny false") < log.indexOf("onCleared"));
		assert.equal(session.sessionId, F002);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a task reported ended by task_updated killed lets the clear through", async () => {
	const { flow, session, conversation, messages } = await liveSteps("updated");
	try {
		flow.stopAndClear("/clear");
		await flow.held();
		assert.equal(messages.some((m) => m.subtype === "task_notification" && m.status === "stopped"), false);
		assert.equal(conversation.sessionId, F002);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a task started while the stop runs is stopped and waited for before the clear", async () => {
	const { flow, session, conversation, messages } = await liveSteps("spawn");
	try {
		flow.stopAndClear("/clear");
		await flow.held();
		assert.equal(notified(messages, "task-late")?.status, "stopped");
		assert.equal(conversation.sessionId, F002);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a CLI that answers every stop with {} and reports nothing is waited for 15 s, then nothing is cleared", async () => {
	const { flow, session, conversation, timers, log } = await liveSteps("silent");
	try {
		flow.stopAndClear("/clear");
		await waitUntil(() => timers.some((t) => t.ms === 15_000));
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(conversation.sessionId, F001, "a stop reply is no proof");
		timers.find((t) => t.ms === 15_000).callback();
		await flow.held();
		assert.equal(conversation.sessionId, F001);
		assert.ok(log.includes("declined stop-failed"));
		assert.equal(conversation.messages.some((m) => m.kind === "clear"), false);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a status the panel does not know counts as running over the fake CLI too", async () => {
	const { flow, session, conversation, timers, log } = await liveSteps("unknown");
	try {
		flow.stopAndClear("/clear");
		await waitUntil(() => timers.some((t) => t.ms === 15_000));
		await new Promise((resolve) => setTimeout(resolve, 100));
		assert.equal(conversation.sessionId, F001);
		timers.find((t) => t.ms === 15_000).callback();
		await flow.held();
		assert.ok(log.includes("declined stop-failed"));
		assert.equal(conversation.sessionId, F001);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: the tab closing while the question is open writes nothing and sends nothing", async () => {
	const { flow, log, hold } = rig();
	hold.block = "tasks";
	hold.tasks = [{ taskId: "a" }];
	flow.holdClear("/clear");
	flow.hold("after", [], null);
	flow.turnChanged(false);
	await settle();
	flow.dispose();
	hold.asked(true);
	await settle();
	assert.equal(log.includes("write"), false);
	assert.equal(log.includes("stopTask a"), false);
	assert.deepEqual(hold.delivered, []);
});
