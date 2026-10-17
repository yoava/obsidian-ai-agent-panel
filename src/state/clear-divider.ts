/**
 * The "Context cleared" divider (PRD-001.R38, PRD-003.R9; DES-003 Context-event
 * dividers): a stored clear as the messages draw it, the view
 * `ui/event-divider` draws it from and the name the separator and the exported
 * note share. Pure, so it is tested in plain Node
 * (tests/state-clear-divider.test.mjs).
 */

import type { ClearRecord } from "./boundary-records";
import type { EventAction, EventView } from "./event-view";
import type { UndoState } from "./segments";
import type { MessageItem } from "./tab";

/** A clear as the messages draw it. */
export interface Clear {
	/** When it completed (ms since the epoch); null for a record without a time. */
	at: number | null;
}

export const CLEARED_LABEL = "Context cleared";

/** The disabled Undo's title when the cleared session is not this device's (PRD-001.R38). */
export const FOREIGN_UNDO_TITLE = "The cleared session is not available on this device";
/** The Undo's title while it runs. */
export const UNDOING_TITLE = "Undoing the clear";
/** Why a disabled Undo cannot start yet. */
const UNDO_BLOCKED = {
	working: "A turn or background task is running",
	restoring: "A restore is running",
	starting: "Claude Code is starting",
	picking: "A mode or model change is pending",
} as const;
/** What the messages say when an Undo failed (PRD-001.R38). */
export const UNDO_FAILED = "Could not undo the clear.";

/** The Undo button for `state`; null for none (PRD-001.R38). */
export function undoAction(state: UndoState | null): EventAction | null {
	if (state === null) return null;
	return {
		label: "Undo",
		icon: ["undo-2"],
		disabled: state !== "ready",
		title: state === "ready" ? null : state === "foreign" ? FOREIGN_UNDO_TITLE : state === "pending" ? UNDOING_TITLE : UNDO_BLOCKED[state],
		busy: state === "pending",
	};
}

/** A stored clear as the divider draws it (PRD-003.R9). */
export function clearFromRecord(record: ClearRecord): Clear {
	return { at: record.at ?? null };
}

/** "Context cleared at 14:02": the separator's name and the exported note (PRD-001.R28, PRD-003.R13); the time left out when the record has none. */
export function clearedLine(at: number | null, clock: (time: number) => string): string {
	return at === null ? CLEARED_LABEL : `${CLEARED_LABEL} at ${clock(at)}`;
}

/** The `/clear` message the panel records before a clear's boundary (PRD-001.R38): the bubble its divider follows. */
export function isClearEcho(item: MessageItem | null | undefined): boolean {
	return item?.kind === "prompt" && item.type === "command" && item.text.trim().toLowerCase() === "/clear";
}

/** The divider's pill, sub-line and name for a clear: orange, finished, with no Summary, and the Undo button where the clear offers one (PRD-001.R38). */
export function clearView(clear: Clear, clock: (time: number) => string, undo: UndoState | null = null): EventView {
	return {
		phase: "cleared",
		role: "separator",
		tone: "warning",
		icon: ["eraser"],
		spinning: false,
		label: CLEARED_LABEL,
		sub: [
			...(clear.at === null ? [] : [{ text: clock(clear.at) }]),
			{ text: "Claude can't see anything above", ...(clear.at !== null && { dot: true }) },
		],
		aria: clearedLine(clear.at, clock),
		summary: false,
		summaryText: null,
		action: undoAction(undo),
	};
}
