/**
 * What a branch (PRD-002.R15, DES-004) reads from a conversation's stored
 * records: the latest prompt its rewind names as seen, and the branch a
 * failed one still has to make.
 * Pure, so it is tested in plain Node (tests/state-branch-history.test.mjs).
 */

import type { StoredMessage } from "../history";
import { isBoundary } from "./boundary-records";
import { isSessionId } from "./session-id";

/** Every Branch button's title when it is offered (PRD-002.R15). */
export const BRANCH_TITLE = "Branch from just before this turn, in a new tab";

/**
 * The session a record without a session id belongs to: the one the first
 * later clear or fresh start ended; `undefined` when none follows (the live
 * segment); null when that boundary names none.
 */
function segmentSession(messages: readonly StoredMessage[], at: number): string | null | undefined {
	for (let next = at + 1; next < messages.length; next++) {
		const record = messages[next];
		if (record.kind === "clear" || record.kind === "fresh-start") return typeof record.sessionId === "string" ? record.sessionId : null;
	}
	return undefined;
}

/**
 * The latest user message of CLI session `sessionId` the conversation
 * recorded: from the last turn record of that session with one, the turn's
 * last echoed prompt, else its first. A record without a session (none
 * before 0.6 had one) counts as the session of its segment: the one the
 * first later clear or fresh start ended, else this session's, unless a
 * clear or fresh start ended this session earlier; a wrong uuid
 * only makes Claude Code refuse the rewind. Null when no record has one, or
 * its id is not a lowercase UUID.
 */
export function latestPrompt(messages: readonly StoredMessage[], sessionId: string): string | null {
	// A session a clear or fresh start ended records nothing after it.
	let end = messages.length;
	for (let at = end - 1; at >= 0; at--) {
		const record = messages[at];
		if ((record.kind === "clear" || record.kind === "fresh-start") && record.sessionId === sessionId) {
			end = at;
			break;
		}
	}
	for (let at = end - 1; at >= 0; at--) {
		const record = messages[at];
		if (record.kind !== "meta") continue;
		const owner = record.sessionId ?? segmentSession(messages, at);
		if (owner !== undefined && owner !== sessionId) continue;
		const uuid = record.lastPromptUuid ?? record.rewindUuid;
		// Stored ids reach the rewind: only a lowercase UUID is offered (ADR-018 Decision 1).
		if (uuid) return isSessionId(uuid) ? uuid : null;
	}
	return null;
}

/** Whether the conversation holds `sessionId` in any segment: a turn record, a clear or a fresh start names it. */
export function holdsSession(messages: readonly StoredMessage[], sessionId: string): boolean {
	return messages.some((record) => (record.kind === "meta" || record.kind === "clear" || record.kind === "fresh-start") && record.sessionId === sessionId);
}

type MetaRecord = Extract<StoredMessage, { kind: "meta" }>;

/** A branch still to make: fork `source`, rewind to `target`, naming `latest` (if known) as last seen. */
export interface PendingBranch {
	source: string;
	target: string;
	latest: string | null;
}

/**
 * The meta record of a branch still to make: its fork and rewind, with the
 * error that stopped it when one did. Recorded when the branch opens, so a
 * close before the first rewind is answered loses nothing.
 */
export function branchRecord(branch: PendingBranch, error?: string): MetaRecord {
	const record: MetaRecord = { kind: "meta" };
	if (error !== undefined) record.error = error;
	return withBranch(record, branch);
}

/**
 * `record` carrying a branch still to make: the failure's fields on a turn's
 * end record say its prompts were never sent (the rewind had not succeeded),
 * and a reopen makes the branch.
 */
export function withBranch(record: MetaRecord, branch: PendingBranch): MetaRecord {
	record.branchSession = branch.source;
	record.branchTarget = branch.target;
	if (branch.latest) record.branchLatest = branch.latest;
	return record;
}

/** Whether a `meta` record is a branch alone (`branchRecord` without an error, not a turn's end): it draws nothing. */
export function isBranchIntent(record: MetaRecord): boolean {
	return record.branchSession !== undefined && record.error === undefined && record.turn === undefined;
}

/**
 * Forget every branch still to make (a clear dropped it, PRD-001.R38): intent
 * records go, and a failure record keeps its error and its mark that the
 * prompts were not sent, without the source a reopen would fork.
 */
export function stripBranch(messages: StoredMessage[]): void {
	for (let at = messages.length - 1; at >= 0; at--) {
		const record = messages[at];
		if (record.kind !== "meta" || record.branchSession === undefined) continue;
		if (isBranchIntent(record)) {
			messages.splice(at, 1);
			continue;
		}
		// The target stays: it marks the failed turn's prompts "not sent" on reopen.
		delete record.branchSession;
		delete record.branchLatest;
	}
}

/**
 * The branch a conversation still has to make: one whose CLI never gave it
 * a session of its own (`sessionId` null) and whose latest branch record no
 * session record of the fork follows. Other errors recorded since (a panel
 * command's fork that exited) do not hide it. `invalid` when a stored id is
 * not a lowercase UUID (`isSessionId`, ADR-018 Decision 1; Claude Code's
 * message uuids are UUIDs too), since they reach `--resume` and the rewind:
 * the branch is then not made.
 */
export function pendingBranch(conversation: {
	sessionId: string | null;
	messages: readonly StoredMessage[];
}): PendingBranch | "invalid" | null {
	if (conversation.sessionId) return null;
	const { messages } = conversation;
	for (let at = messages.length - 1; at >= 0; at--) {
		const record = messages[at];
		if (record.kind !== "meta") continue;
		const { branchSession: source, branchTarget: target, branchLatest: latest } = record;
		if (source === undefined) {
			// A record of a session: the fork has its own, and it is not pending. A failure whose retry was dropped is none either.
			if (record.sessionId !== undefined) return null;
			continue;
		}
		if (!isSessionId(source) || !isSessionId(target) || (latest !== undefined && !isSessionId(latest)))
			return "invalid";
		return { source, target, latest: latest ?? null };
	}
	return null;
}

/** The disabled Branch button's title when a compaction summarized the turn away (PRD-002.R15). */
export const SUMMARIZED_BRANCH_TITLE = "Claude Code compacted the conversation after this turn, so it can no longer branch from here";

/**
 * Whether a compaction summarized `record`'s turn away: a compaction record
 * follows it before the next clear or fresh start. Claude Code then refuses a
 * rewind to the turn's prompt (`target_not_found`), while the turn whose
 * prompt triggered an automatic compaction (its record is written after the
 * compaction's) and the turns after it still rewind. False for a record the
 * conversation does not hold.
 */
export function summarizedAway(messages: readonly { kind: string }[], record: object | null): boolean {
	const at = record === null ? -1 : messages.indexOf(record as { kind: string });
	if (at < 0) return false;
	for (const later of messages.slice(at + 1)) {
		if (later.kind === "compaction") return true;
		if (isBoundary(later)) return false;
	}
	return false;
}
