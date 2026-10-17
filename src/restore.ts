/**
 * Restore files through Claude Code's file checkpoints (ADR-006, DES-004):
 * which turns offer it, when the button shows, which turn "Restore to
 * before turn N" runs, and what its result says.
 * Pure, so it is tested in plain Node (tests/restore.test.mjs).
 */

import { isEditTool } from "./edits";
import { turnPromptNumber, type CountedMessage } from "./state/prompts";

/** The main agent's tools whose writes the CLI's file checkpoints track. */
export function isCheckpointedTool(name: string): boolean {
	return isEditTool(name) || name === "NotebookEdit";
}

/** The fields of a turn's `meta` record that locate its restore point. */
export interface TurnRecord {
	rewindUuid?: string;
	sessionId?: string;
	profileId?: string;
	edited?: boolean;
}

/** Where a turn's restore point lives: its user message, in that session, on that profile. */
export interface RestorePoint {
	uuid: string;
	sessionId: string;
	profileId: string;
}

/**
 * A turn offers Restore files only with the full turn record; older records
 * have none. A stored `rewindUuid` arrives as a lowercase UUID or not at all
 * (`history-file`), so what is offered is what the CLI's rewind takes.
 */
export function restorePoint(record: TurnRecord): RestorePoint | null {
	const { rewindUuid, sessionId, profileId, edited } = record;
	return rewindUuid && sessionId && profileId && edited ? { uuid: rewindUuid, sessionId, profileId } : null;
}

/** The tab a restore button sits in: its session, the profile it runs, what it is doing. */
export interface RestoreContext {
	/** The live session's id, else the conversation's stored one. */
	sessionId: string | null;
	profileId: string;
	busy: boolean;
	restoring: boolean;
}

/**
 * Shown only while the point's session and profile are the tab's, whose CLI
 * holds the checkpoints; disabled while a turn or a restore runs. `gone`: the
 * CLI said the point is no longer available; `cleared`: a clear followed the
 * turn, so its context is gone (PRD-002.R14), until an Undo removes the clear.
 */
export function restoreButtonState(
	point: RestorePoint,
	context: RestoreContext,
	gone: boolean,
	cleared = false
): { hidden: boolean; disabled: boolean } {
	return {
		hidden: gone || cleared || point.sessionId !== context.sessionId || point.profileId !== context.profileId,
		disabled: context.busy || context.restoring,
	};
}

/** A turn whose record offers Restore files, as its tab holds it. */
export interface TurnRestore {
	point: RestorePoint;
	/** The CLI said the point is no longer available. */
	gone: boolean;
	/** A clear record follows the turn (PRD-002.R14). */
	cleared: boolean;
	/** The number of the prompt that opened the turn (`state/prompts`); null when unknown. */
	prompt: number | null;
}

/** Whether a clear record comes after `messages[at]`; a fresh start does not count, being another session, which hides the button already. */
export function clearFollows(messages: readonly { kind: string }[], at: number): boolean {
	for (let i = at + 1; i < messages.length; i++) if (messages[i].kind === "clear") return true;
	return false;
}

/** A conversation record, as `turnRestore` reads it. */
export type TurnMessage = CountedMessage & TurnRecord;

/**
 * The turn whose record is `messages[at]`, when it offers Restore files.
 * `prompts` are the tab's numbered prompts before this conversation record
 * began: those of a conversation deleted from history while open, whose tab
 * records its next message in a new one but keeps numbering on screen; a
 * turn with no prompt in this record was opened by the last of them.
 */
export function turnRestore(messages: readonly TurnMessage[], at: number, prompts: number): TurnRestore | null {
	const record = messages[at];
	const point = record?.kind === "meta" ? restorePoint(record) : null;
	if (!point) return null;
	const number = turnPromptNumber(messages, at);
	// None in this record: a turn running at the delete, opened by the deleted record's last prompt.
	const prompt = number !== null ? number + prompts : prompts > 0 ? prompts : null;
	return { point, gone: false, cleared: clearFollows(messages, at), prompt };
}

/** "Restore to before turn N" in the changed-files popover. */
export interface RestoreBefore<T extends TurnRestore> {
	/** The turn whose Restore files it runs. */
	turn: T;
	label: string;
	/** Its tooltip: what the rewind covers. */
	title: string;
	disabled: boolean;
}

/**
 * "Restore to before turn N" (PRD-002.R18): Restore files of the earliest
 * turn, in `turns`' recorded order, whose button shows and whose N is known,
 * N being the prompt that opened it; left out while the change list is
 * empty, and disabled as that button is.
 */
export function restoreBefore<T extends TurnRestore>(
	turns: readonly T[],
	context: RestoreContext,
	changeListEmpty: boolean
): RestoreBefore<T> | null {
	if (changeListEmpty) return null;
	const earliest = turns.find(
		(turn) => turn.prompt !== null && !restoreButtonState(turn.point, context, turn.gone, turn.cleared).hidden
	);
	if (!earliest) return null;
	const n = earliest.prompt;
	return {
		turn: earliest,
		label: `Restore to before turn ${n}`,
		title:
			`Rewinds every file Claude edited from turn ${n} on, including files this list does not show. ` +
			"Changes by subagents, shell commands, vault tools and linked files stay.",
		disabled: restoreButtonState(earliest.point, context, earliest.gone, earliest.cleared).disabled,
	};
}

/**
 * The Notice after a rewind: the files restored, and those the preview listed
 * that the rewind skipped. A reply without its list counts the preview's.
 */
export function restoredNotice(listed: number, restored: string[] | undefined): string {
	const count = restored?.length ?? listed;
	const skipped = listed - count;
	return `Files restored: ${count}.${skipped > 0 ? ` ${skipped} skipped.` : ""}`;
}
