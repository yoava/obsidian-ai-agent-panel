import { test } from "node:test";
import assert from "node:assert/strict";
import { figuresText, footerFiguresText, tokenRows, turnCosts, turnTokens } from "./.build/state/turn-cost.mjs";
import { conversationCost } from "./.build/commands.mjs";

const meta = (costUsd, sessionId, extra = {}) => ({ kind: "meta", costUsd, ...(sessionId ? { sessionId } : {}), ...extra });

/** The costs of the meta records only, rounded off floating-point noise. */
const costs = (messages, base) =>
	turnCosts(messages, base)
		.filter((_, at) => messages[at].kind === "meta")
		.map((cost) => (cost === null ? null : Math.round(cost * 1e6) / 1e6));

test("PRD-005.R7: a turn costs its session's total minus the previous finished turn's of that session", () => {
	const messages = [
		{ kind: "user", text: "One" },
		{ kind: "assistant", text: "a" },
		meta(0.01, "s1"),
		{ kind: "user", text: "Two" },
		meta(0.025, "s1"),
		meta(0.04, "s1"),
	];
	assert.deepEqual(costs(messages), [0.01, 0.015, 0.015]);
	assert.deepEqual(turnCosts(messages).slice(0, 2), [null, null], "only turn records have a cost");
});

test("PRD-005.R7: the first turn of a session costs its whole total; sessions keep their own baselines", () => {
	assert.deepEqual(costs([meta(0.01, "s1"), meta(0.002, "s2"), meta(0.03, "s1"), meta(0.005, "s2")]), [0.01, 0.002, 0.02, 0.003]);
});

test("PRD-005.R7: a reopened conversation's turns cost the same from the recorded totals, error turns included", () => {
	const messages = [meta(0.01, "s1"), meta(0.02, "s1", { error: "Boom" }), { kind: "meta", error: "exited" }, meta(0.05, "s1")];
	assert.deepEqual(costs(messages), [0.01, 0.01, null, 0.03]);
	const sum = turnCosts(messages).reduce((total, cost) => total + (cost ?? 0), 0);
	assert.ok(Math.abs(sum - conversationCost(messages)) < 1e-12, "the turns add up to the conversation's cost");
});

test("PRD-005.R7: records without a session id join the first later session when it continues their total", () => {
	assert.deepEqual(costs([meta(0.01), meta(0.02), meta(0.03, "s1")]), [0.01, 0.01, 0.01]);
	const restarted = [meta(0.01), meta(0.02), meta(0.005, "s1")];
	assert.deepEqual(costs(restarted), [0.01, 0.01, 0.005], "a lower total is a session of its own");
	for (const messages of [[meta(0.01), meta(0.02), meta(0.03, "s1")], restarted]) {
		const sum = turnCosts(messages).reduce((total, cost) => total + (cost ?? 0), 0);
		assert.ok(Math.abs(sum - conversationCost(messages)) < 1e-12);
	}
});

test("PRD-005.R7: a total lower than the turn before (a killed process's lost spend) costs nothing, not less", () => {
	assert.deepEqual(costs([meta(0.03, "s1"), meta(0.02, "s1")]), [0.03, 0]);
	assert.deepEqual(costs([meta("0.1", "s1"), meta(Number.NaN, "s1")]), [null, null], "a total that is not a number");
});

test("PRD-005.R7: a branch's first turn costs its total minus the fork base; later turns the difference of totals", () => {
	const messages = [meta(0.52, "f1"), meta(0.55, "f1"), meta(0.6, "f1")];
	const base = { costUsd: 0.5, sessionId: "f1" };
	assert.deepEqual(costs(messages, base), [0.02, 0.03, 0.05]);
	assert.deepEqual(costs(messages, undefined), [0.52, 0.03, 0.05]);
	const sum = turnCosts(messages, base).reduce((total, cost) => total + (cost ?? 0), 0);
	assert.ok(Math.abs(sum - conversationCost(messages, base)) < 1e-12, "the turns add up to the conversation's cost");
});

test("PRD-005.R7: the base comes off the fork's session only, and a first turn below it costs nothing", () => {
	const messages = [meta(0.52, "f1"), meta(0.1, "f2"), meta(0.3, "f1")];
	assert.deepEqual(costs(messages, { costUsd: 0.5, sessionId: "f1" }), [0.02, 0.1, 0]);
	assert.deepEqual(costs([meta(0.4, "f1")], { costUsd: 0.5, sessionId: "f1" }), [0]);
	assert.deepEqual(costs([meta(0.3, "fresh")], { costUsd: 0.5 }), [0.3], "a fresh session after an abandoned fork costs in full");
});

test("PRD-003.R13: the exported note keeps the cost at four decimals", () => {
	assert.equal(figuresText({ durationMs: 12_430, costUsd: 0.021, error: null }), "12.4s · $0.0210");
	assert.equal(figuresText({ durationMs: null, costUsd: 0, error: null }), "$0.0000");
});

test("PRD-005.R7: the footer shows the duration to one decimal and the cost to three decimals, under a tenth of a cent as <$0.001, or the error", () => {
	assert.equal(footerFiguresText({ durationMs: 12_430, costUsd: 0.021, error: null }), "12.4s · $0.021");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: 0.0213, error: null }), "$0.021");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: 0.0034, error: null }), "$0.003");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: 0.0004, error: null }), "<$0.001", "above zero, below a tenth of a cent");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: 0.0007, error: null }), "<$0.001", "not rounded up to $0.001");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: 1.5, error: null }), "$1.500");
	assert.equal(footerFiguresText({ durationMs: 1200, costUsd: null, error: null }), "1.2s");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: 0, error: null }), "$0.000");
	assert.equal(footerFiguresText({ durationMs: null, costUsd: null, error: null }), "");
	assert.equal(footerFiguresText({ durationMs: 5, costUsd: 0.1, error: "Overloaded" }), "Error: Overloaded");
});

test("PRD-005.R7: a turn's tokens come from its result's usage, a malformed count as zero", () => {
	assert.deepEqual(
		turnTokens({ input_tokens: 1200, output_tokens: 340, cache_creation_input_tokens: "x", cache_read_input_tokens: 56_000 }),
		{ input: 1200, output: 340, cacheWrite: 0, cacheRead: 56_000 }
	);
	assert.equal(turnTokens(undefined), null, "no usage, no hover card");
});

test("PRD-005.R7: the hover card lists input, cache-read, cache-write and output tokens, with the API-price note", () => {
	assert.deepEqual(tokenRows({ input: 1200, output: 340, cacheWrite: 0, cacheRead: 56_000 }), {
		rows: [
			["Input", "1.2k"],
			["Cache read", "56.0k"],
			["Cache write", "0"],
			["Output", "340"],
		],
		note: "At API prices; plans count usage instead",
	});
});
