import { test } from "node:test";
import assert from "node:assert/strict";
import { PermissionFlow, PRE_EDIT_READ_MS } from "./.build/tab/permission-flow.mjs";

/** An answer as a card gives it: with the card's own key. */
PermissionFlow.prototype.say = function say(id, answer) {
	// The newest card under the id: a late redraw of an older one must not stand in for it.
	const keys = [...this.host.tab.byKey].filter(([, card]) => card.requestId === id).map(([key]) => key);
	return this.answer(id, answer, keys.at(-1));
};

const EDIT_INPUT = { file_path: "note.md", old_string: "a", new_string: "b" };
const PRE = { reported: "note.md", vaultPath: "note.md", before: "a" };
const QUESTIONS_INPUT = {
	questions: [{ question: "Where?", header: "Location", options: [{ label: "Templates/" }, { label: "Journal/" }] }],
};

const request = (fields = {}) => ({ requestId: "r1", toolName: "Bash", input: { command: "ls" }, ...fields });
const edit = (fields = {}) => request({ toolName: "Edit", input: EDIT_INPUT, toolUseId: "toolu_1", ...fields });

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((ok, fail) => {
		resolve = ok;
		reject = fail;
	});
	return { promise, resolve, reject };
}

/** A tab that keeps each card's latest state and every change in order. */
function fakeTab(mode) {
	const cards = new Map();
	const keys = new Map();
	const byKey = new Map();
	const log = [];
	return {
		status: { selectedMode: mode },
		addCard(key, card) {
			assert.equal(keys.has(key), false, "a key is given once");
			keys.set(key, card.requestId);
			byKey.set(key, card);
			cards.set(card.requestId, card);
			log.push(`add ${card.requestId} ${card.kind} ${card.phase}`);
		},
		setCard(key, card) {
			assert.equal(keys.get(key), card.requestId, "a card keeps its key");
			byKey.set(key, card);
			cards.set(card.requestId, card);
			log.push(`set ${card.requestId} ${card.phase}${card.outcome ? ` ${card.outcome}` : ""}`);
		},
		cards,
		byKey,
		log,
	};
}

/** The tab's pre-edit reads: `read` for an edit with a path, else none. */
function setup(mode = "default", { read = null, readMs } = {}) {
	const tab = fakeTab(mode);
	const calls = { reads: [], cleared: 0 };
	const edits = {
		readFor(toolName, toolUseId, input) {
			calls.reads.push([toolName, toolUseId, input]);
			return ["Edit", "Write", "MultiEdit"].includes(toolName) && typeof input.file_path === "string" ? read : null;
		},
		clear() {
			calls.cleared++;
		},
	};
	const flow = new PermissionFlow({ tab, edits }, readMs);
	return { tab, calls, flow };
}

/** Whether the promise has settled, checked after pending callbacks ran. */
function watch(promise) {
	const state = { done: false, value: undefined };
	void promise.then((value) => {
		state.done = true;
		state.value = value;
	});
	return state;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("PRD-002.R6: the pre-edit read holds an answer at most 5 s", () => {
	assert.equal(PRE_EDIT_READ_MS, 5000);
});

test("PRD-002.R1: outside Auto-approve a request gets a card, and Allow answers with the input unchanged", async () => {
	for (const mode of ["default", "acceptEdits", "plan", "bypassPermissions"]) {
		const { tab, flow } = setup(mode);
		const req = request({ decisionReasonType: "mode" });
		const answer = watch(flow.request(req));
		await flush();
		assert.equal(answer.done, false, mode);
		assert.deepEqual(tab.log, ["add r1 permission waiting"], mode);
		flow.say("r1", { type: "allow" });
		await flush();
		assert.deepEqual(answer.value, { behavior: "allow", updatedInput: req.input }, mode);
		assert.equal(answer.value.updatedInput, req.input, mode);
		assert.equal(tab.cards.get("r1").outcome, "Allowed", mode);
	}
});

test("PRD-002.R1: Deny answers with the denial; Always allow with the CLI's suggestions", async () => {
	const { tab, flow } = setup();
	const denied = flow.request(request());
	flow.say("r1", { type: "deny" });
	assert.deepEqual(await denied, { behavior: "deny", message: "The user denied this action in Obsidian." });
	assert.equal(tab.cards.get("r1").outcome, "Denied");
	const suggestions = [{ type: "addRules" }];
	const always = flow.request(request({ requestId: "r2", suggestions }));
	flow.say("r2", { type: "always-allow" });
	const result = await always;
	assert.deepEqual(result, { behavior: "allow", updatedInput: { command: "ls" }, updatedPermissions: suggestions });
	assert.equal(result.updatedPermissions, suggestions);
});

test("PRD-002.R9: in Auto-approve an unflagged request is allowed at once, with no card", async () => {
	const { tab, flow } = setup("auto");
	const req = request({ decisionReasonType: "mode" });
	const result = await flow.request(req);
	assert.deepEqual(result, { behavior: "allow", updatedInput: req.input });
	assert.equal(result.updatedInput, req.input);
	assert.deepEqual(tab.log, []);
});

test("PRD-002.R9: in Auto-approve a flagged request gets a card that answers at once", async () => {
	for (const flags of [
		{ decisionReasonType: "rule" },
		{ decisionReasonType: "safetyCheck" },
		{ classifierApprovable: false },
		{ matchedAskRule: true },
		{ decisionReasonCode: "org_ask_ceiling" },
		{ requiresUserInteraction: true },
		{ mistypedFlags: ["decision_reason_type"] },
		{ input: { command: "ls", dangerouslyDisableSandbox: true } }, // no reason fields at all
	]) {
		const { tab, flow } = setup("auto");
		const answer = flow.request(request(flags));
		assert.deepEqual(tab.log, ["add r1 permission waiting"], JSON.stringify(flags));
		flow.say("r1", { type: "allow" });
		assert.equal((await answer).behavior, "allow");
	}
});

test("PRD-002.R6: in Auto-approve an unflagged edit is allowed only after its pre-edit read, with no card", async () => {
	const read = deferred();
	const { tab, calls, flow } = setup("auto", { read: read.promise });
	const req = edit({ decisionReasonType: "mode" });
	const answer = watch(flow.request(req));
	await flush();
	assert.equal(answer.done, false);
	assert.deepEqual(calls.reads, [["Edit", "toolu_1", EDIT_INPUT]]);
	read.resolve(PRE);
	await flush();
	assert.deepEqual(answer.value, { behavior: "allow", updatedInput: req.input });
	assert.deepEqual(tab.log, []);
});

test("PRD-002.R6: a pre-edit read that never settles holds an Auto-approve answer only to the deadline", async () => {
	const { tab, flow } = setup("auto", { read: new Promise(() => {}), readMs: 30 });
	const answer = watch(flow.request(edit()));
	await sleep(10);
	assert.equal(answer.done, false);
	await sleep(40);
	assert.deepEqual(answer.value, { behavior: "allow", updatedInput: EDIT_INPUT });
	assert.deepEqual(tab.log, []);
});

test("PRD-002.R9: in Auto-approve an edit with no file to read gets a card, whose Allow answers at once", async () => {
	const { tab, flow } = setup("auto", { read: deferred().promise });
	const answer = flow.request(edit({ input: { content: "x" } }));
	assert.deepEqual(tab.log, ["add r1 permission waiting"]);
	assert.equal(tab.cards.get("r1").diff, "none");
	flow.say("r1", { type: "allow" });
	assert.deepEqual(await answer, { behavior: "allow", updatedInput: { content: "x" } });
});

test("PRD-002.R6: a flagged edit's Allow in Auto-approve waits for its pre-edit read, the buttons disabled meanwhile", async () => {
	const read = deferred();
	const { tab, flow } = setup("auto", { read: read.promise });
	const answer = watch(flow.request(edit({ decisionReasonType: "hook" })));
	flow.say("r1", { type: "allow" });
	flow.say("r1", { type: "deny" });
	await flush();
	assert.equal(answer.done, false);
	assert.equal(tab.cards.get("r1").phase, "answering");
	read.resolve(PRE);
	await flush();
	assert.deepEqual(answer.value, { behavior: "allow", updatedInput: EDIT_INPUT });
	assert.deepEqual(tab.log.slice(0, 2), ["add r1 permission waiting", "set r1 answering"]);
	assert.equal(tab.log.at(-1), "set r1 settled Allowed");
	assert.deepEqual(tab.cards.get("r1").diff, PRE);
});

test("PRD-002.R6: a flagged edit's Allow in Auto-approve goes ahead after the deadline when the read never settles", async () => {
	const { tab, flow } = setup("auto", { read: new Promise(() => {}), readMs: 30 });
	const answer = watch(flow.request(edit({ requiresUserInteraction: true })));
	flow.say("r1", { type: "allow" });
	await sleep(10);
	assert.equal(tab.cards.get("r1").phase, "answering");
	await sleep(40);
	assert.deepEqual(answer.value, { behavior: "allow", updatedInput: EDIT_INPUT });
	assert.equal(tab.cards.get("r1").outcome, "Allowed");
	assert.equal(tab.cards.get("r1").diff, "reading", "the diff still waits for the read");
});

test("PRD-002.R6: outside Auto-approve an edit card's Allow answers at once, its read pending", async () => {
	const { flow } = setup("default", { read: deferred().promise });
	const answer = flow.request(edit());
	flow.say("r1", { type: "allow" });
	assert.deepEqual(await answer, { behavior: "allow", updatedInput: EDIT_INPUT });
});

test("PRD-002.R4: an edit card reads the file until its read arrives, also after it settled; a failed read shows none", async () => {
	const read = deferred();
	const { tab, flow } = setup("default", { read: read.promise });
	const answer = flow.request(edit());
	assert.equal(tab.cards.get("r1").diff, "reading");
	flow.say("r1", { type: "deny" });
	await answer;
	read.resolve(PRE);
	await flush();
	assert.equal(tab.cards.get("r1").phase, "settled");
	assert.deepEqual(tab.cards.get("r1").diff, PRE);
	const failed = deferred();
	const second = setup("default", { read: failed.promise });
	void second.flow.request(edit());
	failed.reject(new Error("EACCES"));
	await flush();
	assert.equal(second.tab.cards.get("r1").diff, "none");
	assert.equal(second.tab.cards.get("r1").phase, "waiting");
	const plain = setup("default", { read: read.promise });
	void plain.flow.request(request());
	assert.equal(plain.tab.cards.get("r1").diff, "none", "no read, no diff");
});

test("PRD-002.R12: a well-formed AskUserQuestion gets its form in every mode, and Submit answers with the answers", async () => {
	for (const mode of ["default", "acceptEdits", "plan", "auto", "bypassPermissions"]) {
		const { tab, flow } = setup(mode);
		const answer = flow.request(request({ toolName: "AskUserQuestion", input: QUESTIONS_INPUT, decisionReasonType: "mode" }));
		assert.deepEqual(tab.log, ["add r1 question waiting"], mode);
		flow.say("r1", { type: "submit", selections: [{ picked: [1], other: "" }] });
		assert.deepEqual(
			await answer,
			{ behavior: "allow", updatedInput: { ...QUESTIONS_INPUT, answers: { "Where?": "Journal/" } } },
			mode
		);
		assert.equal(tab.cards.get("r1").outcome, "Answered: Journal/", mode);
	}
});

test("PRD-002.R12: Dismiss answers the form with the dismissal", async () => {
	const { tab, flow } = setup("auto");
	const answer = flow.request(request({ toolName: "AskUserQuestion", input: QUESTIONS_INPUT }));
	flow.say("r1", { type: "dismiss" });
	assert.deepEqual(await answer, { behavior: "deny", message: "The user dismissed the question without answering." });
	assert.equal(tab.cards.get("r1").outcome, "Dismissed");
});

test("PRD-002.R9: an AskUserQuestion its form cannot show gets a permission card, in Auto-approve too", async () => {
	for (const mode of ["default", "auto"]) {
		const { tab, flow } = setup(mode);
		void flow.request(request({ toolName: "AskUserQuestion", input: { questions: "which?" }, decisionReasonType: "mode" }));
		assert.deepEqual(tab.log, ["add r1 permission waiting"], mode);
	}
});

test("PRD-002.R3: a withdrawn request settles its card Cancelled and is answered as a denial; an unknown id changes nothing", async () => {
	const { tab, flow } = setup();
	const answer = flow.request(request());
	flow.cancelled("nope");
	flow.cancelled("r1");
	assert.deepEqual(await answer, { behavior: "deny", message: "Cancelled" });
	assert.equal(tab.cards.get("r1").outcome, "Cancelled");
	flow.cancelled("r1");
	flow.say("r1", { type: "allow" });
	assert.deepEqual(tab.log, ["add r1 permission waiting", "set r1 settled Cancelled"]);
});

test("PRD-002.R3: the process ending settles every open card Session ended, answers each as denied and drops the kept reads", async () => {
	const read = deferred();
	const { tab, calls, flow } = setup("auto", { read: read.promise });
	const card = watch(flow.request(request({ decisionReasonType: "rule" })));
	const answering = watch(flow.request(edit({ requestId: "r2", decisionReasonType: "rule" })));
	const form = watch(flow.request(request({ requestId: "r3", toolName: "AskUserQuestion", input: QUESTIONS_INPUT })));
	const answered = watch(flow.request(request({ requestId: "r4", decisionReasonType: "rule" })));
	flow.say("r2", { type: "allow" });
	flow.say("r4", { type: "deny" });
	flow.ended();
	await flush();
	const ended = { behavior: "deny", message: "The agent session ended before this was answered." };
	assert.deepEqual([card.value, answering.value, form.value], [ended, ended, ended]);
	assert.equal(answered.value.message, "The user denied this action in Obsidian.");
	assert.deepEqual(
		["r1", "r2", "r3", "r4"].map((id) => tab.cards.get(id).outcome),
		["Session ended", "Session ended", "Session ended", "Denied"]
	);
	assert.equal(calls.cleared, 1);
	read.resolve(PRE);
	await flush();
	assert.equal(tab.cards.get("r2").outcome, "Session ended", "the read settling answers nothing more");
	flow.ended();
	assert.equal(calls.cleared, 2, "an end with no card still drops the reads");
});

test("PRD-002.R1: a card answered twice answers once", async () => {
	const { tab, flow } = setup();
	const answer = flow.request(request());
	flow.say("r1", { type: "allow" });
	flow.say("r1", { type: "deny" });
	flow.say("r1", { type: "allow" });
	assert.equal((await answer).behavior, "allow");
	assert.deepEqual(tab.log, ["add r1 permission waiting", "set r1 settled Allowed"]);
});

test("PRD-002.R3: a request whose id already waits is denied, and the card waiting under it is cancelled, so both answers agree", async () => {
	for (const mode of ["default", "auto"]) {
		const { tab, flow } = setup(mode);
		const first = watch(flow.request(request({ decisionReasonType: "rule" })));
		const second = await flow.request(request({ toolName: "Write", decisionReasonType: "mode" }));
		assert.equal(second.behavior, "deny", mode);
		await flush();
		assert.deepEqual(first.value, { behavior: "deny", message: "Cancelled" }, mode);
		flow.say("r1", { type: "allow" });
		assert.deepEqual(tab.log, ["add r1 permission waiting", "set r1 settled Cancelled"], mode);
	}
});

test("PRD-002.R3: a duplicate starts no pre-edit read, and an answering card under its id is cancelled", async () => {
	const first = deferred();
	const tab = fakeTab("auto");
	let reads = 0;
	const flow = new PermissionFlow({
		tab,
		edits: {
			readFor: () => {
				reads++;
				return first.promise;
			},
			clear() {},
		},
	});
	const answer = watch(flow.request(edit({ decisionReasonType: "rule" })));
	flow.say("r1", { type: "allow" });
	assert.equal((await flow.request(edit({ decisionReasonType: "rule" }))).behavior, "deny");
	assert.equal(reads, 1);
	await flush();
	assert.deepEqual(answer.value, { behavior: "deny", message: "Cancelled" });
	first.resolve(PRE);
	await flush();
	assert.equal(tab.cards.get("r1").outcome, "Cancelled");
	assert.deepEqual(tab.cards.get("r1").diff, PRE, "its diff still arrives");
});

test("PRD-002.R3: a request whose id waits on a pre-edit read with no card is refused, and the waiting one is answered as a denial", async () => {
	const read = deferred();
	const { tab, flow } = setup("auto", { read: read.promise });
	const first = watch(flow.request(edit({ decisionReasonType: "mode" })));
	const second = await flow.request(request({ decisionReasonType: "rule" }));
	assert.equal(second.behavior, "deny");
	await flush();
	assert.deepEqual(first.value, { behavior: "deny", message: "Cancelled" });
	assert.deepEqual(tab.log, [], "no card");
	read.resolve(PRE);
	await flush();
	assert.deepEqual(first.value, { behavior: "deny", message: "Cancelled" }, "the read settling allows nothing");
	const third = watch(flow.request(request({ decisionReasonType: "rule" })));
	assert.deepEqual(tab.log, ["add r1 permission waiting"], "the id is free once both are answered");
	flow.say("r1", { type: "allow" });
	await flush();
	assert.equal(third.value.behavior, "allow");
});

test("PRD-002.R3: an Auto-approve edit still waiting for its read when its process ends or withdraws it leaves its id free, and its read settling later answers nothing", async () => {
	for (const end of ["ended", "cancelled"]) {
		const reads = [deferred(), deferred()];
		let next = 0;
		const tab = fakeTab("auto");
		const flow = new PermissionFlow({ tab, edits: { readFor: () => reads[next++].promise, clear() {} } });
		const first = watch(flow.request(edit({ decisionReasonType: "mode" })));
		if (end === "ended") flow.ended();
		else flow.cancelled("r1");
		await flush();
		assert.equal(first.value?.behavior, "deny", `${end}: answered, and written nowhere`);
		// The next process numbers its requests from 1 again.
		const second = watch(flow.request(edit({ decisionReasonType: "mode" })));
		reads[0].resolve(PRE);
		await flush();
		assert.equal(first.value.behavior, "deny", `${end}: the late read allows nothing`);
		assert.equal(second.done, false, `${end}: the reused id waits for its own read`);
		reads[1].resolve(PRE);
		await flush();
		assert.deepEqual(second.value, { behavior: "allow", updatedInput: EDIT_INPUT }, end);
		assert.deepEqual(tab.log, [], `${end}: no card`);
	}
});

test("PRD-002.R3: a drawing failure reported for a settled card, or for an earlier card under the id, changes nothing", async () => {
	const { tab, flow } = setup();
	void flow.request(request());
	const earlier = tab.cards.get("r1");
	flow.say("r1", { type: "deny" });
	const settled = tab.cards.get("r1");
	const next = watch(flow.request(request({ toolName: "Write" })));
	flow.failed(settled, new Error("draw failed"));
	flow.failed(earlier, new Error("draw failed"));
	await flush();
	assert.equal(next.done, false);
	assert.equal(tab.cards.get("r1").phase, "waiting");
	flow.say("r1", { type: "allow" });
	await flush();
	assert.equal(next.value.behavior, "allow");
});

test("PRD-002.R1: an answer reaches the CLI before the card is redrawn, so a redraw that throws holds no answer", async (t) => {
	t.mock.method(console, "error", () => {});
	const { tab, flow } = setup();
	const answers = [flow.request(request()), flow.request(request({ requestId: "r2" }))];
	tab.setCard = () => {
		throw new Error("redraw failed");
	};
	flow.say("r1", { type: "deny" });
	flow.ended();
	assert.deepEqual(
		(await Promise.all(answers)).map((answer) => answer.message),
		["The user denied this action in Obsidian.", "The agent session ended before this was answered."]
	);
});

test("PRD-002.R3: a card or form that cannot be drawn gets an error reply, and nothing waits under its id", async () => {
	for (const failure of ["intent", "throw"]) {
		const tab = fakeTab("default");
		const flow = new PermissionFlow({ tab, edits: { readFor: () => null, clear() {} } });
		const addCard = tab.addCard;
		tab.addCard = (key, card) => {
			addCard(key, card);
			// The view reports a component that could not be built (`onCardFailed`), or the model throws.
			if (failure === "intent") flow.failed(card, new Error("draw failed"));
			else throw new Error("draw failed");
		};
		const answer = flow.request(request());
		await assert.rejects(answer, /draw failed/, failure);
		assert.equal(tab.cards.get("r1").phase, "settled", failure);
		tab.addCard = addCard;
		const next = flow.request(request({ toolName: "Write" }));
		assert.equal(tab.cards.get("r1").phase, "waiting", `${failure}: the id is free again`);
		flow.say("r1", { type: "allow" });
		assert.equal((await next).behavior, "allow", failure);
	}
});

test("PRD-002.R3: a card whose content cannot be built gets an error reply, and its pre-edit read is still handled", async () => {
	const failing = Promise.reject(new Error("EACCES"));
	const tab = fakeTab("default");
	const flow = new PermissionFlow({ tab, edits: { readFor: () => failing, clear() {} } });
	const input = {
		get command() {
			throw new Error("bad input");
		},
	};
	const answer = flow.request(request({ input }));
	await assert.rejects(answer, /bad input/);
	await flush();
	assert.deepEqual(tab.log, []);
	void flow.request(request({ toolName: "Write" }));
	assert.deepEqual(tab.log, ["add r1 permission waiting"], "the id is free");
});

test("PRD-002.R1: a request id answered before can wait again, as a new process counts from 1, and an old read reaches only its own card", async () => {
	const reads = [deferred(), deferred()];
	let next = 0;
	const tab = fakeTab("default");
	const flow = new PermissionFlow({ tab, edits: { readFor: () => reads[next++].promise, clear() {} } });
	const first = flow.request(edit());
	flow.say("r1", { type: "deny" });
	await first;
	flow.ended();
	const second = watch(flow.request(edit({ input: { file_path: "other.md" } })));
	assert.deepEqual(tab.log.slice(-1), ["add r1 permission waiting"]);
	reads[0].resolve(PRE);
	await flush();
	assert.deepEqual([...tab.byKey.keys()], [1, 2]);
	assert.deepEqual(tab.byKey.get(1).diff, PRE);
	assert.equal(tab.byKey.get(2).diff, "reading", "the first card's read is not the second's");
	flow.say("r1", { type: "allow" });
	await flush();
	assert.deepEqual(second.value, { behavior: "allow", updatedInput: { file_path: "other.md" } });
});

test("PRD-001.R38: refusing for Stop and clear denies every open card, and an answer that comes later is dropped", async () => {
	const { tab, flow } = setup("default");
	const first = watch(flow.request(request()));
	const second = watch(flow.request(request({ requestId: "r2" })));
	await flush();
	flow.refuse(true);
	await flush();
	// One message for the cards open at the press and the requests that come after.
	assert.deepEqual(first.value, { behavior: "deny", message: "The conversation is being cleared." });
	assert.deepEqual(second.value, { behavior: "deny", message: "The conversation is being cleared." });
	assert.equal(tab.cards.get("r1").outcome, "Stopped");
	const log = [...tab.log];
	// The Allow click that raced the deny finds nothing.
	flow.say("r1", { type: "allow" });
	flow.say("r2", { type: "allow" });
	await flush();
	assert.deepEqual(tab.log, log);
	assert.equal(first.value.behavior, "deny");
});

test("PRD-001.R38: while refusing, a request is denied at once with no card, in every mode, and cards return when it ends", async () => {
	for (const mode of ["default", "acceptEdits", "plan", "bypassPermissions"]) {
		const { tab, flow } = setup(mode);
		flow.refuse(true);
		const denied = await flow.request(request({ requestId: "r9", decisionReasonType: "mode" }));
		assert.equal(denied.behavior, "deny", mode);
		assert.deepEqual(tab.log, [], mode);
		flow.refuse(false);
		const waiting = watch(flow.request(request({ requestId: "r10", decisionReasonType: "mode" })));
		await flush();
		assert.equal(waiting.done, false, mode);
		assert.deepEqual(tab.log, ["add r10 permission waiting"], mode);
	}
});

test("PRD-001.R38: while refusing, an edit is denied before its pre-edit read is taken", async () => {
	const { flow, calls } = setup("auto", { read: new Promise(() => {}) });
	flow.refuse(true);
	const denied = await flow.request(edit());
	assert.equal(denied.behavior, "deny");
	assert.deepEqual(calls.reads, []);
});

test("PRD-001.R38: an answer with no card key is dropped, one with the card's key settles it", async () => {
	const { tab, flow } = setup("default");
	const pending = watch(flow.request(request()));
	await flush();
	flow.answer("r1", { type: "allow" }, undefined);
	await flush();
	assert.equal(pending.done, false);
	flow.answer("r1", { type: "allow" }, tab.cards.get("r1").key);
	await flush();
	assert.equal(pending.value.behavior, "allow");
});

test("PRD-001.R38: an answer names its card, so one for a denied card cannot settle a new card under the same request id", async () => {
	const { tab, flow } = setup("default");
	const first = watch(flow.request(request()));
	await flush();
	const keyA = tab.cards.get("r1").key;
	flow.refuse(true);
	flow.refuse(false);
	await flush();
	assert.equal(first.value.behavior, "deny");
	const second = watch(flow.request(request()));
	await flush();
	const keyB = tab.cards.get("r1").key;
	assert.notEqual(keyA, keyB);
	// The late click on card A.
	flow.answer("r1", { type: "allow" }, keyA);
	await flush();
	assert.equal(second.done, false);
	flow.answer("r1", { type: "allow" }, keyB);
	await flush();
	assert.equal(second.value.behavior, "allow");
});
