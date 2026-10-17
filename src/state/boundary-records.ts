/**
 * The boundary records a conversation holds between sessions (ADR-018
 * Records, Decision 2) and the notices that go with them: the fresh-start
 * record, when one is due, and the file version a save writes. Pure, so it is
 * tested in plain Node (tests/state-boundary-records.test.mjs).
 */

/** Shown when a conversation's stored session cannot be used on this device (PRD-003.R9). */
export const FOREIGN_SESSION_NOTICE =
	"This conversation's Claude Code session is not available on this device, so this message starts a fresh one (the messages above are kept).";

/** The disabled Branch button's title when the turn's session is not this device's (PRD-002.R15). */
export const FOREIGN_BRANCH_TITLE = "This turn's Claude Code session is not available on this device";

/** A session started without `--resume` in a conversation that had turns: a boundary with no divider. */
export interface FreshStartRecord {
	kind: "fresh-start";
	/** When it started (ms since the epoch). */
	at: number;
	/** The id not resumed, where it was refused or its resume failed; kept as stored even when it fails the grammar (ADR-018 Decision 1). */
	sessionId?: string;
}

/** The record of a fresh start; `sessionId` is left out unless it is a string. */
export function freshStartRecord(at: number, sessionId?: unknown): FreshStartRecord {
	const record: FreshStartRecord = { kind: "fresh-start", at };
	if (typeof sessionId === "string") record.sessionId = sessionId;
	return record;
}

/** A completed clear: a boundary with a divider (PRD-003.R1). */
export interface ClearRecord {
	kind: "clear";
	/** When it completed (ms since the epoch). */
	at: number;
	/** The session it ended, kept as stored even when it fails the grammar (ADR-018 Decision 1). */
	sessionId?: string;
}

/** The record of a clear; `sessionId` is left out unless it is a string. */
export function clearRecord(at: number, sessionId?: unknown): ClearRecord {
	const record: ClearRecord = { kind: "clear", at };
	if (typeof sessionId === "string") record.sessionId = sessionId;
	return record;
}

/** A record that begins a new segment: a clear or a fresh start. */
export function isBoundary(record: { kind: string }): boolean {
	return record.kind === "clear" || record.kind === "fresh-start";
}

interface Recorded {
	kind: string;
	turn?: unknown;
	sentAt?: unknown;
}

/** A prompt sent to Claude (a panel command or a `!` run has no send time) or a turn's end record. */
export function isTurn(record: Recorded): boolean {
	return (record.kind === "meta" && typeof record.turn === "number") || (record.kind === "user" && typeof record.sentAt === "number");
}

/**
 * Whether the conversation holds a message to Claude Code since it began or
 * since its last boundary: its last turn follows its last boundary. A clear
 * with none is a no-op (PRD-001.R38); a session started without `--resume`
 * records a fresh start only when one is due, so two boundaries never stack
 * and a conversation with no turn records none (PRD-003.R1).
 */
export function clearDue(messages: readonly Recorded[]): boolean {
	for (let at = messages.length - 1; at >= 0; at--) {
		if (isBoundary(messages[at])) return false;
		if (isTurn(messages[at])) return true;
	}
	return false;
}

/** Whether a session started without `--resume` records a fresh start: {@link clearDue}'s question. */
export const freshStartDue = clearDue;

/**
 * The file version a save writes: 2, which 0.5.x refuses, while the
 * conversation holds a clear or a fresh start, else 1 (ADR-018 Decision 2).
 */
export function fileVersion(messages: readonly { kind: string }[]): 1 | 2 {
	return messages.some(isBoundary) ? 2 : 1;
}

/** Whether a stored `version` is one this version reads. */
export function isStoredVersion(version: unknown): version is 1 | 2 {
	return version === 1 || version === 2;
}

/**
 * The CLI session and profile a branch from a turn forks (ADR-018 Decision 1):
 * the turn record's own session; for a turn recorded without one, the id of
 * the first fresh-start or clear record after it (the session it ended in; ""
 * when that record names none or a non-string, so no session is offered); only
 * with no such record, the live session's, then the conversation's stored id. The profile is
 * the turn's, else the conversation's, else the tab's. A turn before a fresh
 * start keeps its own session, whatever the tab runs now.
 */
export function turnSource(
	record: { sessionId?: unknown; profileId?: unknown } | null,
	messages: readonly { kind: string; sessionId?: unknown }[],
	live: string | null | undefined,
	conversation: { sessionId?: unknown; profileId?: unknown } | null,
	tabProfileId: string
): { sessionId: unknown; profileId: string } {
	let sessionId = record?.sessionId ?? null;
	if (sessionId === null && record) {
		const at = messages.indexOf(record as never);
		const boundary = at < 0 ? undefined : messages.slice(at + 1).find(isBoundary);
		if (boundary) sessionId = typeof boundary.sessionId === "string" ? boundary.sessionId : "";
	}
	sessionId ??= live ?? conversation?.sessionId ?? null;
	const own = [record?.profileId, conversation?.profileId].find((id): id is string => typeof id === "string" && id !== "");
	return { sessionId, profileId: own ?? tabProfileId };
}
