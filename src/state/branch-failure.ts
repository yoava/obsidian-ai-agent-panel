/**
 * What a failed branch says (PRD-002.R15, DES-004): Claude Code's reason in
 * the user's words, its own text for a reason the panel does not know.
 */

/** Why a branch's rewind failed: Claude Code's `reason` code, or `exited`; and its text. */
export interface BranchFailureReason {
	reason: string | null;
	detail: string;
}

const UNSEEN = "the original conversation has messages this panel did not see. Send a message there, then branch again.";

const WORDS = new Map<string, string>([
	["stale_target", UNSEEN],
	["unseen_later_turn", UNSEEN],
	["target_not_found", "Claude Code no longer has it."],
	["exited", "Claude Code exited before cutting the conversation."],
]);

/** A reopened branch whose stored fork fails the command-line check (`pendingBranch`): it is not made. */
export const INVALID_BRANCH_TEXT =
	"Could not branch from that turn: the stored branch is not valid. Your next message starts a new conversation.";

/** Branch from a turn whose stored message id is not valid: no tab opens. */
export const INVALID_TARGET_TEXT = "Could not branch from that turn: its stored message id is not valid.";

/** The error a failed branch shows and records. */
export function branchFailureText(failure: BranchFailureReason): string {
	const why = (failure.reason !== null ? WORDS.get(failure.reason) : undefined) ?? failure.detail.replace(/\.?$/, ".");
	return `Could not branch from that turn: ${why} Nothing was sent; your message is back in the message box.`;
}
