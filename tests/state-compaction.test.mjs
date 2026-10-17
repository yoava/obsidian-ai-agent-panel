import { test } from "node:test";
import assert from "node:assert/strict";
import {
	COMPACTION_FAILED,
	NO_COMPACTION,
	compactedLine,
	compactionFromRecord,
	compactionSignal,
	compactionView,
	nextTurn,
	queueSend,
	reduceCompaction,
	settleCompaction,
	startsCompaction,
} from "./.build/state/compaction.mjs";
import { formatClock } from "./.build/state/usage-segment.mjs";

// Shapes from docs/records/verification/2026-10-13-real-cli-context-events.md (E3)
// and 2026-10-13-real-cli-clear-undo.md (V5); the fake CLI's compact-* scenarios emit them.
const status = (fields) => ({ type: "system", subtype: "status", session_id: "s", ...fields });
const compacting = status({ status: "compacting", compact_output_chars: 0 });
const success = status({ status: null, compact_result: "success" });
const failure = status({ status: null, compact_result: "failed", compact_error: "API Error: Request was aborted." });
const boundary = (trigger, pre, post) => ({
	type: "system",
	subtype: "compact_boundary",
	session_id: "s",
	compact_metadata: { trigger, pre_tokens: pre, post_tokens: post, cumulative_dropped_tokens: 67477, duration_ms: 6200 },
});
const synthetic = (content) => ({
	type: "user",
	isSynthetic: true,
	session_id: "s",
	parent_tool_use_id: null,
	message: { role: "user", content },
});

const NOW = 1_700_000_000_000;
const ctx = (extra = {}) => ({ manualTurn: false, percent: 95.2, now: NOW, ...extra });

/** Every message through the signals and the reducer, as `chat-tab` does; the item as drawn and the records written. */
function run(messages, context = ctx()) {
	let state = NO_COMPACTION;
	let shown = null;
	const records = [];
	for (const message of messages) {
		const signal = compactionSignal(message);
		if (!signal) continue;
		const step = reduceCompaction(state, signal, context);
		state = step.state;
		if (step.show) shown = step.show.data;
		if (step.record?.type === "add") records.push({ ...step.record.record });
		if (step.record?.type === "patch") Object.assign(records.at(-1), step.record.patch);
	}
	return { state, shown, records };
}

test("PRD-001.R37: the compaction messages of E3 and V5 are told apart from other status messages", () => {
	assert.deepEqual(compactionSignal(compacting), { type: "compacting" });
	assert.deepEqual(compactionSignal(success), { type: "success" });
	assert.deepEqual(compactionSignal(failure), { type: "failed" });
	assert.deepEqual(compactionSignal(status({ status: null, compact_result: "weird" })), { type: "failed" });
	assert.equal(compactionSignal(status({ status: "requesting" })), null);
	assert.equal(compactionSignal(status({ status: null })), null);
	assert.equal(compactionSignal(status({ permissionMode: "plan" })), null);
	assert.equal(compactionSignal({ type: "result", subtype: "success" }), null);
});

test("PRD-001.R37: the boundary carries the trigger and the token counts, each only as a count", () => {
	assert.deepEqual(compactionSignal(boundary("auto", 81240, 13763)), { type: "boundary", trigger: "auto", preTokens: 81240, postTokens: 13763 });
	assert.deepEqual(compactionSignal(boundary("manual", 30423, 3973)), { type: "boundary", trigger: "manual", preTokens: 30423, postTokens: 3973 });
	assert.deepEqual(compactionSignal(boundary("other", "many", -1)), { type: "boundary", trigger: null, preTokens: null, postTokens: null });
	assert.deepEqual(compactionSignal({ type: "system", subtype: "compact_boundary" }), { type: "boundary", trigger: null, preTokens: null, postTokens: null });
	assert.deepEqual(compactionSignal({ type: "system", subtype: "compact_boundary", compact_metadata: "x" }), { type: "boundary", trigger: null, preTokens: null, postTokens: null });
});

test("PRD-001.R37: only a synthetic user message is the summary, read from a string or its text blocks", () => {
	assert.deepEqual(compactionSignal(synthetic("This session is being continued… Summary: x")), { type: "summary", text: "This session is being continued… Summary: x" });
	assert.deepEqual(compactionSignal(synthetic([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])), { type: "summary", text: "a\nb" });
	assert.equal(compactionSignal(synthetic("")), null);
	assert.equal(compactionSignal(synthetic([{ type: "tool_result", tool_use_id: "t", content: "x" }])), null);
	assert.equal(compactionSignal({ type: "user", message: { role: "user", content: "hello" } }), null);
	assert.equal(compactionSignal({ ...synthetic("x"), isSynthetic: "yes" }), null);
});

test("PRD-001.R37: a message starts a compaction when it is /compact, with or without instructions", () => {
	assert.equal(startsCompaction("/compact"), true);
	assert.equal(startsCompaction("/compact keep owners and due dates"), true);
	assert.equal(startsCompaction("/compact\nkeep dates"), true);
	assert.equal(startsCompaction("/compactor"), false);
	assert.equal(startsCompaction("please /compact"), false);
	assert.equal(startsCompaction("/clear"), false);
});

test("PRD-001.R37, E3: an automatic compaction shows 'Compacting automatically…', then the divider with the boundary's counts, then the summary", () => {
	let state = NO_COMPACTION;
	let step = reduceCompaction(state, compactionSignal(compacting), ctx());
	assert.deepEqual(step.show, {
		isNew: true,
		data: { phase: "compacting", trigger: "auto", percent: 95.2, at: null, preTokens: null, postTokens: null, summary: null },
	});
	assert.equal(step.record, null);
	state = step.state;

	step = reduceCompaction(state, compactionSignal(success), ctx());
	assert.equal(step.show.isNew, false);
	assert.equal(step.show.data.phase, "compacted");
	assert.equal(step.show.data.at, NOW);
	assert.equal(step.record, null, "the record waits for the boundary (ADR-018)");
	state = step.state;

	step = reduceCompaction(state, compactionSignal(boundary("auto", 81240, 13763)), ctx());
	assert.equal(step.show.isNew, false);
	assert.deepEqual([step.show.data.preTokens, step.show.data.postTokens], [81240, 13763]);
	assert.deepEqual(step.record, { type: "add", record: { kind: "compaction", at: NOW, trigger: "auto", preTokens: 81240, postTokens: 13763 } });
	state = step.state;

	step = reduceCompaction(state, compactionSignal(synthetic("Summary: kept the plan")), ctx());
	assert.equal(step.show.data.summary, "Summary: kept the plan");
	assert.deepEqual(step.record, { type: "patch", patch: { summary: "Summary: kept the plan" } });
});

test("PRD-001.R37, V5: a manual compaction in a /compact turn is 'Compacting…' and records the manual trigger", () => {
	const manual = ctx({ manualTurn: true });
	const step = reduceCompaction(NO_COMPACTION, compactionSignal(compacting), manual);
	assert.equal(step.show.data.trigger, "manual");
	const { shown, records } = run(
		[
			compacting,
			success,
			boundary("manual", 30423, 3973),
			synthetic("S"),
			{ type: "user", message: { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" } },
		],
		manual
	);
	assert.equal(shown.phase, "compacted");
	assert.deepEqual(records, [{ kind: "compaction", at: NOW, trigger: "manual", preTokens: 30423, postTokens: 3973, summary: "S" }]);
});

test("PRD-001.R37: a boundary with no status before it still draws the divider and records it", () => {
	const { shown, records } = run([boundary("auto", 100, 10)]);
	assert.equal(shown.phase, "compacted");
	assert.deepEqual(records, [{ kind: "compaction", at: NOW, trigger: "auto", preTokens: 100, postTokens: 10 }]);
});

test("PRD-001.R37: a success with no boundary draws the divider without counts and writes no record", () => {
	const { shown, records } = run([compacting, success]);
	assert.deepEqual([shown.phase, shown.preTokens, shown.postTokens], ["compacted", null, null]);
	assert.deepEqual(records, []);
});

const synthetic2 = (text) => ({ type: "assistant", message: { model: "<synthetic>", content: [{ type: "text", text }] } });

test("PRD-001.R37, V5: the CLI's empty-session notice shows 'Compaction did not finish.' and writes no record", () => {
	const { shown, records } = run([synthetic2("Error: No messages to compact")], ctx({ manualTurn: true }));
	assert.equal(shown.phase, "failed");
	assert.equal(compactionView(shown).label, COMPACTION_FAILED);
	assert.deepEqual(records, []);
});

test("PRD-001.R37, V5: 'Compaction canceled.' after a failure adds nothing, and alone it is a failed divider", () => {
	const notice = synthetic2("Compaction canceled.");
	const failedFirst = run([compacting, failure, notice]);
	assert.equal(failedFirst.shown.phase, "failed");
	assert.equal(reduceCompaction(failedFirst.state, compactionSignal(notice), ctx()).show, null);
	assert.equal(run([notice]).shown.phase, "failed");
});

test("PRD-001.R37: sends made while a turn runs are taken in order, one per result", () => {
	let queue = [];
	queue = queueSend(queue, "/compact keep dates");
	queue = queueSend(queue, "and then?");
	queue = queueSend(queue, "/compact");
	const first = nextTurn(queue);
	assert.equal(first.manual, true);
	const second = nextTurn(first.queue);
	assert.equal(second.manual, false);
	const third = nextTurn(second.queue);
	assert.equal(third.manual, true);
	assert.deepEqual(nextTurn(third.queue), { manual: false, queue: [] });
});

test("PRD-001.R37: a queued /compact that finds nothing to compact ends with the notice, not a 'did not finish' divider", () => {
	const { manual } = nextTurn(queueSend([], "/compact"));
	const ended = run([synthetic2("Error: No messages to compact")], ctx({ manualTurn: manual }));
	assert.equal(compactionView(ended.shown).label, COMPACTION_FAILED);
	assert.equal(settleCompaction(ended.state, ctx({ manualTurn: manual })).show, null);
});

test("PRD-001.R37, V5: a compaction the CLI reports as failed shows the failure and writes no record", () => {
	const { shown, records } = run([compacting, failure]);
	assert.equal(shown.phase, "failed");
	assert.deepEqual(records, []);
});

test("PRD-001.R37: the summary is taken once, after the compaction was reported, and never before it", () => {
	assert.equal(run([synthetic("early")]).shown, null);
	const { shown, records } = run([compacting, synthetic("too early"), success, boundary("auto", 1, 1), synthetic("first"), synthetic("second")]);
	assert.equal(shown.summary, "first");
	assert.equal(records[0].summary, "first");
});

test("PRD-001.R37: a summary after the turn ended is dropped", () => {
	const { state } = run([compacting, success, boundary("auto", 1, 1)]);
	const settled = settleCompaction(state, ctx());
	assert.equal(reduceCompaction(settled.state, compactionSignal(synthetic("late")), ctx()).show, null);
});

test("PRD-001.R37, V5: a turn ending while the status is 'compacting' shows 'Compaction did not finish.' in its place", () => {
	const { state } = run([compacting]);
	const step = settleCompaction(state, ctx());
	assert.equal(step.show.isNew, false);
	assert.equal(step.show.data.phase, "failed");
	assert.equal(step.record, null);
	assert.deepEqual(step.state, NO_COMPACTION);
});

test("PRD-001.R37, V5: a /compact turn that ends without any compaction report shows a failed divider of its own", () => {
	const step = settleCompaction(NO_COMPACTION, ctx({ manualTurn: true }));
	assert.equal(step.show.isNew, true);
	assert.equal(step.show.data.phase, "failed");
	assert.equal(step.show.data.trigger, "manual");
});

test("PRD-001.R37: a turn that never compacted, and one whose compaction was reported, add nothing when they end", () => {
	assert.equal(settleCompaction(NO_COMPACTION, ctx()).show, null);
	const { state } = run([compacting, success]);
	assert.equal(settleCompaction(state, ctx({ manualTurn: true })).show, null);
	const failed = run([failure], ctx({ manualTurn: true })).state;
	assert.equal(settleCompaction(failed, ctx({ manualTurn: true })).show, null);
});

test("PRD-001.R37: a second compaction in the turn gets a divider of its own", () => {
	const first = run([compacting, success, boundary("auto", 9, 3)]);
	const step = reduceCompaction(first.state, compactionSignal(compacting), ctx());
	assert.equal(step.show.isNew, true);
	assert.equal(step.show.data.phase, "compacting");
});

test("PRD-001.R37: while compacting, the status reads the last known context percentage, or leaves it out", () => {
	const auto = compactionView({ phase: "compacting", trigger: "auto", percent: 94.6, at: null, preTokens: null, postTokens: null, summary: null });
	assert.equal(auto.label, "Compacting automatically…");
	assert.equal(auto.role, "status");
	assert.equal(auto.aria, "Compacting automatically");
	assert.deepEqual(auto.sub, [{ text: "Context 95% full" }, { text: "Claude picks up where it left off", dot: true }]);
	const manual = compactionView({ phase: "compacting", trigger: "manual", percent: null, at: null, preTokens: null, postTokens: null, summary: null });
	assert.equal(manual.label, "Compacting…");
	assert.equal(manual.aria, "Compacting");
	assert.deepEqual(manual.sub, [{ text: "Claude picks up where it left off" }]);
	assert.equal(manual.summary, false);
});

test("PRD-001.R37, PRD-001.R28: a finished divider is a separator with the time and the counts, and leaves out a count not reported", () => {
	const at = NOW;
	const time = formatClock(at);
	const base = { phase: "compacted", trigger: "auto", percent: null, at, preTokens: 131000, postTokens: 18000, summary: null };
	const both = compactionView(base);
	assert.equal(both.role, "separator");
	assert.equal(both.label, "Compacted");
	assert.deepEqual(both.sub, [{ text: time }, { text: "131k → 18k", mono: true, dot: true }, { text: "tokens" }]);
	assert.equal(both.aria, `Compacted at ${time}, 131k to 18k tokens`);
	const onlyAfter = compactionView({ ...base, preTokens: null });
	assert.deepEqual(onlyAfter.sub, [{ text: time }, { text: "18k", mono: true, dot: true }, { text: "tokens" }]);
	assert.equal(onlyAfter.aria, `Compacted at ${time}, 18k tokens`);
	const none = compactionView({ ...base, preTokens: null, postTokens: null });
	assert.deepEqual(none.sub, [{ text: time }]);
	assert.equal(none.aria, `Compacted at ${time}`);
	const bare = compactionView({ ...base, at: null, preTokens: null, postTokens: null });
	assert.deepEqual(bare.sub, []);
	assert.equal(bare.aria, "Compacted");
});

test("PRD-001.R37: the Summary toggle is offered only where the CLI supplied a summary", () => {
	const base = { phase: "compacted", trigger: "auto", percent: null, at: NOW, preTokens: 1, postTokens: 1, summary: null };
	assert.equal(compactionView(base).summary, false);
	assert.equal(compactionView({ ...base, summary: "S" }).summary, true);
	assert.equal(compactionView({ ...base, summary: "" }).summary, false);
});

test("PRD-001.R37: a failed compaction reads 'Compaction did not finish.' in place of the status", () => {
	const view = compactionView({ phase: "failed", trigger: "auto", percent: 90, at: null, preTokens: null, postTokens: null, summary: null });
	assert.equal(COMPACTION_FAILED, "Compaction did not finish.");
	assert.equal(view.label, COMPACTION_FAILED);
	assert.equal(view.role, "status");
	assert.equal(view.tone, "warning");
	assert.deepEqual(view.sub, []);
});

test("PRD-003.R1, PRD-003.R9: a stored record reads back as a finished compaction", () => {
	assert.deepEqual(compactionFromRecord({ kind: "compaction", at: NOW, trigger: "manual", preTokens: 5, postTokens: 2, summary: "S" }), {
		phase: "compacted",
		trigger: "manual",
		percent: null,
		at: NOW,
		preTokens: 5,
		postTokens: 2,
		summary: "S",
	});
	assert.deepEqual(compactionFromRecord({ kind: "compaction" }), {
		phase: "compacted",
		trigger: "auto",
		percent: null,
		at: null,
		preTokens: null,
		postTokens: null,
		summary: null,
	});
});

test("PRD-003.R13: the note line and the separator's label are one text", () => {
	const clock = () => "14:20";
	assert.equal(compactedLine(NOW, 131000, 18000, clock), "Compacted at 14:20, 131k to 18k tokens");
	assert.equal(compactedLine(NOW, null, 18000, clock), "Compacted at 14:20, 18k tokens");
	assert.equal(compactedLine(NOW, 131000, null, clock), "Compacted at 14:20, 131k tokens");
	assert.equal(compactedLine(NOW, null, null, clock), "Compacted at 14:20");
	assert.equal(compactedLine(null, 131000, 18000, clock), "Compacted, 131k to 18k tokens");
	assert.equal(compactedLine(null, null, null, clock), "Compacted");
});
