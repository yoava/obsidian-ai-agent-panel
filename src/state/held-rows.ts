/**
 * The held tray's texts and rows (PRD-001.R38; DES-003 Held messages): the
 * `/clear` sent while a turn runs and the messages behind it as the tray draws
 * them, the screen-reader announcements and the note a clear that could not
 * run leaves. Pure, so it is tested in plain Node.
 */

import { STOP_FAILED } from "./clear-dialog";

/** Under a `/clear` sent while a turn runs. */
export const HELD_CLEAR_STATUS = "Queued · clears when this turn ends";
/** Under a message sent behind a held `/clear`, an open clear or an Undo. */
export const HELD_SEND_STATUS = "Queued · sends in order";

/** What keeps a `/clear` from running without asking: agents or background tasks run (the dialog asks), or a restore is under way. */
export type ClearBlock = "tasks" | "restore";

/** Why a `/clear` that was held, or replayed from the held messages, did not run. */
export type Declined = "restore" | "cancelled" | "stop-failed";

/** What the messages say of a declined `/clear`: a note, or an error for a stop that failed; null when the user cancelled. */
export function declineNote(cause: Declined): { text: string; error: boolean } | null {
	switch (cause) {
		case "restore":
			return { text: "Not cleared: a restore is under way.", error: false };
		case "stop-failed":
			return { text: STOP_FAILED, error: true };
		case "cancelled":
			return null;
	}
}

/** What changed in the tray, for the one live region to say once. */
export type HeldNote = "clear" | "message" | "cancelled";

export const HELD_ANNOUNCEMENT: Record<HeldNote, string> = {
	clear: "Clear queued until this turn ends",
	message: "Message queued",
	cancelled: "Clear cancelled",
};

/** One held message as the tray draws it: the bubble, the status line under it, and whether "Cancel" shows. */
export interface HeldRow {
	key: string;
	text: string;
	status: string;
	cancel: boolean;
}

/** What the tray needs of the held `/clear` and the held messages behind it. */
export interface HeldInput {
	clear: string | null;
	sends: readonly { id: number; text: string; images: readonly unknown[] }[];
}

/** The tray's rows, oldest first: the held `/clear`, which "Cancel" drops, then the messages behind it. */
export function heldRows(held: HeldInput): HeldRow[] {
	const rows: HeldRow[] = [];
	if (held.clear !== null) rows.push({ key: "clear", text: held.clear, status: HELD_CLEAR_STATUS, cancel: true });
	for (const send of held.sends) {
		const images = send.images.length === 0 ? "" : ` · ${send.images.length} ${send.images.length === 1 ? "image" : "images"}`;
		rows.push({ key: `send-${send.id}`, text: send.text, status: `${HELD_SEND_STATUS}${images}`, cancel: false });
	}
	return rows;
}
