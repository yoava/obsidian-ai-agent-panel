/**
 * A branch's fork base (PRD-005.R7, ADR-018 fork base, DES-007 Cost and
 * tokens): the source session's whole total when the fork started, which the
 * fork's own totals include. Pure, so it is tested in plain Node
 * (tests/state-fork-base.test.mjs).
 */

/** Stored on a branch conversation (DES-005). */
export interface ForkBase {
	/** The source session's latest `total_cost_usd` when the fork started; raw, so nested forks subtract correctly. */
	costUsd: number;
	/** The fork's own session, once it reported one. */
	sessionId?: string;
	/** The panel may not have recorded every turn of the source: the figure can include spend it never saw. */
	estimate?: boolean;
}

/** The note on a branch whose base is unknown. */
export const NO_BASE_NOTE = "Includes the cost of the conversation it branched from";

/** The note on a branch whose base may miss spend. */
export const ESTIMATE_NOTE = "Estimate: can include some cost of the conversation it branched from";

/** What a stored message holds of its cost. */
interface TotalRecord {
	kind: string;
	costUsd?: unknown;
	sessionId?: unknown;
	branchSession?: unknown;
}

/** The latest `total_cost_usd` the records hold for a session; null when none. */
export function sessionTotal(messages: readonly TotalRecord[], sessionId: string): number | null {
	for (let at = messages.length - 1; at >= 0; at--) {
		const record = messages[at];
		if (record.kind !== "meta" || record.sessionId !== sessionId) continue;
		if (typeof record.costUsd === "number" && Number.isFinite(record.costUsd)) return record.costUsd;
	}
	return null;
}

/** What the panel knows when a fork starts. */
export interface ForkStart {
	/** The source's latest recorded total; null when none is recorded. */
	total: number | null;
	/** A turn runs in the source session. */
	turnRunning: boolean;
	/** The source is in its conversation's `started` list: this panel began it. */
	began: boolean;
	/** Another open tab holds or runs the source session. */
	otherTabRan: boolean;
	/** Agents or background tasks run in the source. */
	tasksRunning: boolean;
}

/**
 * The base for a fork starting now, or null when it is unknown: no recorded
 * total, or a turn running in the source (unknown is never zero). Exact only
 * when the panel recorded every turn of the source since it began.
 */
export function decideForkBase(start: ForkStart): ForkBase | null {
	const { total } = start;
	if (total === null || !Number.isFinite(total) || total < 0 || start.turnRunning) return null;
	const exact = start.began && !start.otherTabRan && !start.tasksRunning;
	return exact ? { costUsd: total } : { costUsd: total, estimate: true };
}

/**
 * The session id the base is taken off: the fork's own, only once it is among
 * the records. Any other session (a fresh one after an abandoned fork) counts
 * in full; null with no base or no such record.
 */
export function forkTarget(messages: readonly TotalRecord[], base: ForkBase | undefined): string | null {
	const id = base?.sessionId;
	if (!id) return null;
	return messages.some((record) => record.kind === "meta" && record.sessionId === id) ? id : null;
}

/** The note under a branch's cost; null for an exact base and for a conversation that is no branch. */
export function costNote(messages: readonly TotalRecord[], base: ForkBase | undefined): string | null {
	if (base) return base.estimate ? ESTIMATE_NOTE : null;
	return messages.some((record) => record.kind === "meta" && record.branchSession !== undefined) ? NO_BASE_NOTE : null;
}
