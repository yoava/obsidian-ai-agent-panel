import test from "node:test";
import assert from "node:assert/strict";

const { branchFailureText } = await import("./.build/state/branch-failure.mjs");

const TAIL = " Nothing was sent; your message is back in the message box.";

test("PRD-002.R15: a failed branch says why in the user's words, and that the message is back", () => {
	const unseen =
		"Could not branch from that turn: the original conversation has messages this panel did not see. Send a message there, then branch again." +
		TAIL;
	assert.equal(branchFailureText({ reason: "stale_target", detail: "stale target" }), unseen);
	assert.equal(branchFailureText({ reason: "unseen_later_turn", detail: "unseen later turn" }), unseen);
	assert.equal(
		branchFailureText({ reason: "target_not_found", detail: "target not found" }),
		"Could not branch from that turn: Claude Code no longer has it." + TAIL
	);
	assert.equal(
		branchFailureText({ reason: "exited", detail: "Claude Code process exited" }),
		"Could not branch from that turn: Claude Code exited before cutting the conversation." + TAIL
	);
});

test("PRD-002.R15: a reason the panel does not know is shown as Claude Code gave it", () => {
	assert.equal(
		branchFailureText({ reason: "new_reason", detail: "something else" }),
		"Could not branch from that turn: something else." + TAIL
	);
	assert.equal(
		branchFailureText({ reason: null, detail: "Claude Code refused the request." }),
		"Could not branch from that turn: Claude Code refused the request." + TAIL
	);
});
