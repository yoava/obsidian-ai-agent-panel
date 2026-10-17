import test from "node:test";
import assert from "node:assert/strict";

const { isSessionId, usableSessionId, isRejectedSessionId } = await import("./.build/state/session-id.mjs");

test("PRD-002.R15: a stored session id is used only as a lowercase UUID (ADR-018 Decision 1)", () => {
	assert.equal(isSessionId("0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c"), true);
	for (const value of [
		"0F8B6A2C-1D3E-4F5A-9B7C-8D6E5F4A3B2C",
		"--dangerously-skip-permissions",
		"../../etc/passwd",
		"0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c\n",
		" 0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c",
		"0f8b6a2c1d3e4f5a9b7c8d6e5f4a3b2c",
		"0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2",
		"g f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c",
		"",
		undefined,
		null,
		42,
	])
		assert.equal(isSessionId(value), false, String(value));
});

test("PRD-003.R4: a rejected session id is told apart from an absent one", () => {
	const good = "0f8b6a2c-1d3e-4f5a-9b7c-8d6e5f4a3b2c";
	assert.equal(usableSessionId(good), good);
	assert.equal(isRejectedSessionId(good), false);
	for (const rejected of ["--resume", "", "../x", good.toUpperCase()]) {
		assert.equal(usableSessionId(rejected), null, rejected);
		assert.equal(isRejectedSessionId(rejected), true, rejected);
	}
	for (const absent of [null, undefined, 7, {}]) {
		assert.equal(usableSessionId(absent), null);
		assert.equal(isRejectedSessionId(absent), false);
	}
});
