/**
 * The session-id grammar (ADR-018 Decision 1): a stored id reaches
 * `--resume`, so it is used only as a lowercase UUID (`protocol/types`, which
 * the session checks message ids with too). Tested in plain Node
 * (tests/state-session-id.test.mjs).
 */

import { isCliId } from "../protocol/types";

export { isCliId as isSessionId };

/**
 * A stored session id as it may be used: itself when it passes the grammar,
 * else null. A string that fails is *rejected*, not absent: the file keeps it
 * as stored so a reload rejects it again, and {@link isRejectedSessionId}
 * tells the two apart.
 */
export function usableSessionId(value: unknown): string | null {
	return isCliId(value) ? value : null;
}

/** A stored session id that is present but fails the grammar: never used, kept in the file as stored. */
export function isRejectedSessionId(value: unknown): value is string {
	return typeof value === "string" && !isCliId(value);
}
