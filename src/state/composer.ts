/** The composer's state (DES-003 Composer state): its strings, what Escape does, the command font, and its chips with their one-line fit. */

import { lineRange, selectedLinesName, type LineRange } from "../context-format";
import { formatBytes } from "./image-viewer";
import type { Activity, ChipKind } from "./tab";

const EMPTY_PLACEHOLDER = "Ask about your vault… (@ mentions a note, / runs a command)";
const IDLE_PLACEHOLDER = "Reply, or @ to mention a note…";
const WORKING_PLACEHOLDER = "Claude is working. Enter queues another message…";
const WAITING_PLACEHOLDER = "Claude is waiting for your answer above…";

/** The Stop button's tooltip and accessible name (PRD-001.R11). */
export const STOP_LABEL = "Stop Claude's turn (Esc)";

export interface ComposerView {
	placeholder: string;
	sendLabel: "Send" | "Queue message";
	/** Waiting for a card: the button looks dimmed and still sends. */
	/** Waiting for a card: the composer card and Send look dimmed; Send still sends. */
	waiting: boolean;
	stopShown: boolean;
}

export function composerView(activity: Activity, hasMessages: boolean): ComposerView {
	if (activity === "waiting")
		return { placeholder: WAITING_PLACEHOLDER, sendLabel: "Queue message", waiting: true, stopShown: true };
	if (activity !== "idle")
		return { placeholder: WORKING_PLACEHOLDER, sendLabel: "Queue message", waiting: false, stopShown: true };
	return {
		placeholder: hasMessages ? IDLE_PLACEHOLDER : EMPTY_PLACEHOLDER,
		sendLabel: "Send",
		waiting: false,
		stopShown: false,
	};
}

/**
 * Escape in the composer: nothing during IME composition or while a list or
 * popover reports open (it takes the key), else an interrupt of a running
 * turn. Never a stop of background tasks.
 */
export function escapeAction(state: {
	composing: boolean;
	listOpen: boolean;
	popoverOpen: boolean;
	turnRunning: boolean;
}): "interrupt" | "none" {
	return !state.composing && !state.listOpen && !state.popoverOpen && state.turnRunning ? "interrupt" : "none";
}

/** `text` added after the composer's `current` text, a blank line between ("Add output to chat", an unsent branch message). */
export function appendText(current: string, text: string): string {
	return current ? `${current.trimEnd()}\n\n${text}` : text;
}

/** The textarea is monospace while its text is a slash command. */
export function isCommandText(text: string): boolean {
	return text.startsWith("/");
}

/**
 * The composer's text with `/<name>` and a space at its start (a /help row,
 * PRD-001.R20): a lone `/` or one of the `known` command names typed there,
 * in any case, with the space after it, is replaced; other text, a path
 * included, follows.
 */
export function withCommand(text: string, name: string, known: readonly string[]): string {
	const typed = /^\/(\S*)\s?/.exec(text);
	const replaced = typed && (typed[1] === "" || known.includes(typed[1].toLowerCase()));
	return `/${name} ${replaced ? text.slice(typed[0].length) : text}`;
}

// --- Chips (DES-003 Context block and chips) -----------------------------------

/** An on or attached chip's tooltip. */
export const CHIP_ON_TOOLTIP = "Sent with your message · click to leave out";

const OFFER_LABEL: Readonly<Record<ChipKind, string>> = {
	note: "Click to attach the active note",
	folder: "Click to attach the active folder",
	links: "Click to attach links and properties",
};

const CHIP_ICON: Readonly<Record<ChipKind, string>> = { note: "file-text", folder: "folder", links: "git-fork" };

/** A chip's kind: a pasted image, a context chip, or an attached file or folder. */
export type ChipSlot = "image" | ChipKind | "file" | "folder-item";

export interface ChipsInput {
	/** The active note's file name and the active folder's name, when there is one. */
	note: string | null;
	/** The lines selected in the note's editor, which the note chip then names. */
	selection: LineRange | null;
	folder: string | null;
	on: Readonly<Record<ChipKind, boolean>>;
	/** `name`: a file's base name or a folder's name. */
	attached: readonly { name: string; path: string; folder: boolean }[];
	images: readonly { name: string; bytes: number }[];
}

export interface ChipView {
	slot: ChipSlot;
	/** The image's or attached item's index in the input; -1 for a context chip. */
	index: number;
	/** On or attached, in the accent; false for an offer chip. */
	on: boolean;
	name: string;
	/** Null for an image, which shows its thumbnail. */
	icon: string | null;
	tooltip: string;
	/** The accessible name. */
	label: string;
	/** The hidden-chips list's button for it (PRD-001.R30). */
	actionLabel: string;
}

export interface ChipsView {
	/** Images, then the note, folder and "links & properties" chips, then the attached items. */
	chips: ChipView[];
	/**
	 * No context chip on and nothing attached: the chips row gives way to the
	 * active-note offer chip after the commands button (PRD-001.R12).
	 */
	inline: boolean;
}

/** The composer's chips (PRD-001.R12, R13, R14). */
export function composerChips(input: ChipsInput): ChipsView {
	const chips: ChipView[] = input.images.map((image, index) => {
		const tooltip = `${image.name} (${formatBytes(image.bytes)}) · Sent with your message · click to view`;
		return { slot: "image", index, on: true, name: image.name, icon: null, tooltip, label: tooltip, actionLabel: `Remove ${image.name}` };
	});
	const toggle = (kind: ChipKind, name: string, detail?: string): void => {
		const on = input.on[kind];
		const tooltip = on ? CHIP_ON_TOOLTIP : OFFER_LABEL[kind];
		chips.push({
			slot: kind,
			index: -1,
			on,
			name,
			icon: on ? CHIP_ICON[kind] : "plus",
			tooltip,
			// Its visible text first, offered or on (PRD-001.R28; WCAG 2.5.3).
			label: [name, detail, tooltip].filter(Boolean).join(" · "),
			actionLabel: `Turn off ${kind === "note" && input.note !== null ? input.note : name}`,
		});
	};
	// With a selection the note chip names it, the note and its lines following in the chip's name.
	if (input.note !== null)
		if (input.selection) toggle("note", selectedLinesName(input.selection), `${input.note}, ${lineRange(input.selection)}`);
		else toggle("note", input.note);
	if (input.folder !== null) toggle("folder", `${input.folder}/`);
	if (input.note !== null) toggle("links", "links & properties");
	input.attached.forEach((item, index) => {
		const name = item.folder ? `${item.name}/` : item.name;
		const tooltip = item.folder ? `${item.path}/ · Sent with your message` : `${item.path} · Sent with your message · click to open`;
		chips.push({
			slot: item.folder ? "folder-item" : "file",
			index,
			on: true,
			name,
			icon: item.folder ? "folder" : "paperclip",
			tooltip,
			label: tooltip,
			actionLabel: `Remove ${name}`,
		});
	});
	return { chips, inline: !chips.some((chip) => chip.on) };
}

/**
 * How many chips the one-line form shows (PRD-001.R30): all of them when
 * they fit `available`, else the most that fit in order with `gap` between
 * them and "+N" after the last. When not even the first fits, it shows
 * anyway, shrunk into the room left (`squeeze`), while that room is at
 * least "+N"'s width; a lone chip, with no "+N" beside it, always shows.
 */
export function fitChips(
	available: number,
	gap: number,
	plusWidth: number,
	chipWidths: readonly number[]
): { count: number; squeeze: boolean } {
	const all = chipWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, chipWidths.length - 1);
	if (all <= available) return { count: chipWidths.length, squeeze: false };
	let used = plusWidth;
	let count = 0;
	for (const width of chipWidths) {
		used += width + gap;
		if (used > available) break;
		count++;
	}
	if (count > 0) return { count, squeeze: false };
	if (chipWidths.length === 1) return { count: 1, squeeze: true };
	return available - plusWidth - gap >= plusWidth ? { count: 1, squeeze: true } : { count: 0, squeeze: false };
}
