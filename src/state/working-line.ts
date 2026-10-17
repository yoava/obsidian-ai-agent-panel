/**
 * The working cue (PRD-001.R15; DES-003 Turn): the working line at the end
 * of the messages, and whether the head's mark rings.
 */

import type { Activity } from "./tab";

/** What the working line reads of its tab. */
export interface WorkingInput {
	activity: Activity;
	/** A thinking block of the running turn streams. */
	thinking: boolean;
	/** When the running turn opened; null when unknown. */
	startedAt: number | null;
}

/**
 * The working line while Claude works, wherever the turn's head is: "Writing…"
 * while reply text streams, "Thinking…" while thinking streams, else
 * "Working…", with the elapsed time as the boards' clock ("" when the start
 * is unknown); null while a card waits or no turn runs.
 */
export function workingLine(input: WorkingInput, now: number): { label: string; elapsed: string } | null {
	if (input.activity !== "working" && input.activity !== "writing") return null;
	const label = input.activity === "writing" ? "Writing…" : input.thinking ? "Thinking…" : "Working…";
	return { label, elapsed: input.startedAt === null ? "" : formatClock(now - input.startedAt) };
}

/** "0:42", "10:00", "1:02:05": the working line's elapsed time as the boards draw it; the head keeps `formatElapsed`. */
export function formatClock(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const seconds = String(total % 60).padStart(2, "0");
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}:${seconds}`;
	return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
}

/** The head's mark rings only while its turn runs and no working line shows, which is not the case from the send on in practice: the working line is the cue. */
export function headRings(running: boolean, activity: Activity): boolean {
	return running && activity === "idle";
}
