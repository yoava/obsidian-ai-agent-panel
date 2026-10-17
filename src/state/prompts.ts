/**
 * The prompts of a conversation (DES-003 Prompts): what counts as one, their
 * numbers across the conversation, the prompt number of a turn, the jump
 * rail's ticks, the send time shown, and the empty conversation's starters.
 * A panel command or a `!` run is no prompt.
 */

import { isBareMessage, parseCardCommand, parsePanelCommand } from "../commands";
import { promptTitle } from "../conversation-list";
import { formatClock } from "./usage-segment";

/** A stored message as far as numbering reads it. */
export interface CountedMessage {
	kind: string;
	text?: unknown;
	turn?: unknown;
}

/** A user message sent to Claude: not a panel command (PRD-001.R19). */
function isPrompt(message: CountedMessage): boolean {
	return message.kind === "user" && typeof message.text === "string" && !parsePanelCommand(message.text);
}

/** The user messages sent to Claude (PRD-001.R7's prompt count). */
export function promptCount(messages: readonly CountedMessage[]): number {
	let count = 0;
	for (const message of messages) if (isPrompt(message)) count++;
	return count;
}

/** A panel command, whose card is recorded after it as an `assistant` message. */
function isPanelCommand(message: CountedMessage): boolean {
	return message.kind === "user" && typeof message.text === "string" && parseCardCommand(message.text) !== null;
}

/**
 * The number of the prompt that opened the turn whose `meta` record is
 * `messages[at]` (DES-003 Header and changes bar; PRD-002.R18), or null when
 * no prompt came before it. The turn is found by its record, since a turn
 * Claude Code takes up from a queued prompt records the same `meta.turn` as
 * the turn before it. Its records run from the previous `meta` record; its
 * first output is Claude's text, thinking or tool call, a panel command's
 * card not counting. The opener is the turn's first prompt recorded before
 * that output: later ones were sent mid-turn. With none, it is the last
 * prompt recorded before the output: a prompt sent during the previous turn
 * that Claude Code took up afterwards.
 */
export function turnPromptNumber(messages: readonly CountedMessage[], at: number): number | null {
	if (messages[at]?.kind !== "meta") return null;
	let number = 0;
	let last: number | null = null;
	/** The turn's first prompt while no output has come. */
	let first: number | null = null;
	/** The opener, fixed at the turn's first output. */
	let opener: number | null = null;
	let output = false;
	/** Panel commands whose card is still to come. */
	let cards = 0;
	for (let i = 0; i < at; i++) {
		const message = messages[i];
		if (message.kind === "meta") {
			first = null;
			opener = null;
			output = false;
		} else if (isPrompt(message)) {
			last = ++number;
			if (!output) first ??= number;
		} else if (isPanelCommand(message)) cards++;
		else if (message.kind === "assistant" && cards > 0) cards--;
		else if (!output && ["assistant", "thinking", "tool"].includes(message.kind)) {
			output = true;
			opener = first ?? last;
		}
	}
	return output ? opener : (first ?? last);
}

/** A rail tick's label and tooltip: "N · <first line>" (PRD-001.R33). */
export function tickLabel(number: number, text: string): string {
	return `${number} · ${promptTitle(text)}`;
}

/**
 * Where each prompt's tick sits on the rail, 0 to 1: its offset in the
 * messages over their scroll height once drawn, else its index fraction
 * (a reopen draws older sections later); every one at its index fraction
 * while nothing is laid out.
 */
export function railFractions(offsets: readonly (number | null)[], scrollHeight: number): number[] {
	return offsets.map((offset, index) =>
		offset === null || scrollHeight <= 0
			? index / offsets.length
			: Math.min(1, Math.max(0, offset / scrollHeight))
	);
}

/**
 * What the rail has drawn (PRD-001.R33): `next` says whether the active tab's
 * tick labels differ from the ones drawn, and `forget` (another tab is
 * active) makes the next call always redraw, so an empty tab clears the
 * previous tab's ticks.
 */
export class RailDrawn {
	/** The labels drawn, joined; null before any, which no label list equals. */
	private key: string | null = null;

	forget(): void {
		this.key = null;
	}

	/** The new key when `labels` differ from the ones drawn (and now count as drawn), else null. */
	next(labels: readonly string[]): string | null {
		const key = labels.join("\n");
		if (key === this.key) return null;
		this.key = key;
		return key;
	}
}

/** A tick is written only when it moves by 1 px or more (DES-003 Prompts). */
export function tickMoved(written: number | null, next: number): boolean {
	return written === null || Math.abs(next - written) >= 1;
}

/** A prompt's send time as HH:MM, or "" when the file recorded none (PRD-003.R1). */
export function sentLabel(sentAt: number | null | undefined): string {
	return typeof sentAt === "number" ? formatClock(sentAt) : "";
}

/**
 * A prompt's context label (PRD-001.R33): what it sent as context, then, for
 * a reopened prompt, its image count; live images show as thumbnails.
 */
export function contextLabel(contextName: string | null, images: readonly unknown[] | number): string {
	const parts = contextName ? [contextName] : [];
	if (typeof images === "number" && images > 0) parts.push(`${images} ${images === 1 ? "image" : "images"}`);
	return parts.join(" · ");
}

/**
 * A context label cut around its "N lines selected" part (PRD-001.R33): `lead`
 * runs up to "N lines", `rest` is what follows "selected". The numbered head
 * and the pin show `lead + rest`; the line under a bubble shows it whole.
 * Null when the label has no selection.
 */
export function splitSelection(label: string): { lead: string; rest: string } | null {
	const match = /^([\s\S]*?\b\d+ lines?) selected([\s\S]*)$/.exec(label);
	return match ? { lead: match[1], rest: match[2] } : null;
}

/**
 * The icon of a prompt's context label (PRD-001.R33): a file for a note, a
 * folder for a folder alone, none for "links & properties" or "N attached"
 * or no context.
 */
export function contextIcon(contextName: string | null): "file" | "folder" | null {
	if (!contextName) return null;
	const first = contextName.split(" · ")[0];
	if (first === "links & properties" || /^\d+ attached$/.test(first)) return null;
	return first.endsWith("/") ? "folder" : "file";
}

/**
 * Whether a user message is drawn as the compact monospace command bubble
 * (PRD-001.R33): a panel command, a `!` run, or a prompt sent bare, such as
 * `/compact`, which stays numbered.
 */
export function isCommandBubble(item: { type: "prompt" | "command" | "shell"; text: string }): boolean {
	return item.type !== "prompt" || isBareMessage(item.text);
}

/** A starter of the empty conversation (PRD-001.R35): `label`, then the note name in `note` when it names one. */
export interface Starter {
	icon: string;
	label: string;
	note: string;
	/** What the composer takes; nothing is sent. */
	prompt: string;
}

/** The open note's starters, and the selection's while the editor has one; none without an open note (PRD-001.R35). */
export function starters(note: { name: string; path: string } | null, selection: boolean): Starter[] {
	if (!note) return [];
	const offered: Starter[] = [
		{ icon: "file-text", label: "Summarize", note: note.path.slice(note.path.lastIndexOf("/") + 1), prompt: `Summarize @${note.path}.` },
		{
			icon: "link",
			label: "Find notes that should link here",
			note: "",
			prompt: `Find notes in this vault that @${note.path} could link to, with one line on why for each.`,
		},
	];
	if (selection)
		offered.push({
			icon: "pencil",
			label: "Draft a follow-up from the selection",
			note: "",
			prompt: `Draft a follow-up from the selected text in @${note.path}.`,
		});
	return offered;
}
