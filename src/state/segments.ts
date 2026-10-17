/**
 * The segments of a conversation (PRD-001.R38, ADR-018; DES-003 Dimmed and
 * folded segments): the messages before a clear are dimmed, and a segment of
 * more than four messages folds everything before its last prompt behind an
 * "N earlier messages" button. Works on the sections the messages draw, so
 * a fold is whole sections. Pure, so it is tested in plain Node
 * (tests/state-segments.test.mjs).
 */

import { isTurn } from "./boundary-records";
import { usableSessionId } from "./session-id";
import { sectionsOf, type MessageItem } from "./tab";

/** A segment folds when it holds more messages than this. */
export const FOLD_OVER = 4;

/** What screen readers hear for a dimmed block (PRD-001.R38). */
export const BEFORE_CLEAR = "Before the clear. Claude no longer sees these messages.";

/** One folded run of sections. */
export interface Fold {
	/** The id of the run's first item: stable while the run stays the same. */
	key: number;
	/** The messages folded away. */
	count: number;
	/** Every item the fold hides. */
	ids: ReadonlySet<number>;
}

/** Which items are dimmed and which are folded. */
export interface SegmentPlan {
	dimmed: ReadonlySet<number>;
	folds: readonly Fold[];
	/** The fold hiding an item, by the item's id. */
	foldOf: ReadonlyMap<number, Fold>;
}

export const NO_SEGMENTS: SegmentPlan = { dimmed: new Set(), folds: [], foldOf: new Map() };

/** "6 earlier messages". */
export function foldLabel(count: number): string {
	return `${count} earlier ${count === 1 ? "message" : "messages"}`;
}

type Sections = readonly (readonly MessageItem[])[];

/** What a message is for the fold: a prompt of any kind, or a reply (a turn, not its continuations). */
function messages(section: readonly MessageItem[]): number {
	let count = 0;
	for (const item of section) if (item.kind === "prompt" || (item.kind === "turn" && !item.continuation)) count++;
	return count;
}

function holdsClear(section: readonly MessageItem[]): boolean {
	return section.some((item) => item.kind === "clear");
}

/** Index of the section that opens with the run's last prompt of any kind (to Claude, a command or a `!` run); -1 for none. */
function lastPrompt(sections: Sections, from: number, to: number): number {
	for (let at = to - 1; at >= from; at--) if (sections[at][0]?.kind === "prompt") return at;
	return -1;
}

/** The fold of sections `[from, to)`, or null when it holds no message. */
function foldOfRange(sections: Sections, from: number, to: number): Fold | null {
	let count = 0;
	const ids = new Set<number>();
	for (let at = from; at < to; at++) {
		count += messages(sections[at]);
		for (const item of sections[at]) ids.add(item.id);
	}
	return count === 0 ? null : { key: sections[from][0].id, count, ids };
}

/**
 * The fold of the run `[from, to)` of sections: with more than
 * {@link FOLD_OVER} messages, everything before the run's last prompt; that
 * prompt and all after it (reply, continuations, footer) stay.
 */
function foldOfRun(sections: Sections, from: number, to: number): Fold | null {
	let total = 0;
	for (let at = from; at < to; at++) total += messages(sections[at]);
	if (total <= FOLD_OVER) return null;
	const keep = lastPrompt(sections, from, to);
	return keep === -1 ? null : foldOfRange(sections, from, keep);
}

/**
 * The dimming and folds of a messages model. A section holding a clear (its
 * divider, and the `/clear` message before it) is the boundary and stays at
 * full strength; every other section before the last boundary is dimmed. In
 * each run of sections between boundaries, more than {@link FOLD_OVER}
 * messages fold everything before the last prompt.
 */
export function planSegments(items: readonly MessageItem[]): SegmentPlan {
	const sections = sectionsOf(items);
	let last = -1;
	sections.forEach((section, at) => {
		if (holdsClear(section)) last = at;
	});
	if (last === -1) return NO_SEGMENTS;
	const dimmed = new Set<number>();
	const folds: Fold[] = [];
	const foldOf = new Map<number, Fold>();
	let start = 0;
	for (let at = 0; at <= last; at++) {
		if (!holdsClear(sections[at])) {
			for (const item of sections[at]) dimmed.add(item.id);
			continue;
		}
		const fold = foldOfRun(sections, start, at);
		if (fold) {
			folds.push(fold);
			for (const id of fold.ids) foldOf.set(id, fold);
		}
		start = at + 1;
	}
	return { dimmed, folds, foldOf };
}

/** The clear an Undo would take back (PRD-001.R38). */
export interface UndoOffer {
	/** The clear's record, and its place among the conversation's messages. */
	record: { kind: string; sessionId?: unknown };
	index: number;
	/** The session the clear ended: the one the Undo resumes. */
	sessionId: string;
	/** The session is not one this device recorded: the button shows disabled. */
	foreign: boolean;
}

/**
 * The Undo a conversation offers: only its latest clear, and only while no
 * message to Claude Code follows it (a `/compact` is one, a panel command or a
 * `!` run is not). A clear whose session id is absent or rejected offers none;
 * one the device did not record (`foreign`) offers a disabled button. The same
 * answer live and after a reopen (PRD-001.R38).
 */
export function undoOffer(messages: readonly { kind: string; sessionId?: unknown }[], foreign: (sessionId: string) => boolean): UndoOffer | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (isTurn(message) || message.kind === "fresh-start") return null;
		if (message.kind !== "clear") continue;
		const sessionId = usableSessionId(message.sessionId);
		if (sessionId === null) return null;
		return { record: message, index, sessionId, foreign: foreign(sessionId) };
	}
	return null;
}

/** How the latest clear's divider shows its Undo button. */
export type UndoState = "ready" | "pending" | "foreign" | "working" | "restoring" | "starting" | "picking";

/** What keeps a tab from starting or adopting an Undo's CLI; `clearing` is a clear whose answer has not settled. */
export type UndoBlock = "clearing" | "restoring" | "working" | "starting" | "picking";

/** The tab's facts an Undo reads. */
export interface UndoFacts {
	/** A turn, an agent or a background task runs. */
	working: boolean;
	/** A restore is between its preview and its end. */
	restoring: boolean;
	/** The tab's CLI is starting. */
	starting: boolean;
	/** A mode or model pick waits for the CLI's answer. */
	picking: boolean;
	/** A `/clear` is open. */
	clearOpen: boolean;
}

/**
 * Why the tab cannot start an Undo, or adopt its CLI, now (PRD-001.R38): the
 * first that holds, an open clear before the rest; null when none. A pick
 * still waiting could be refused after the swap, leaving the adopted CLI in
 * another mode than the tab shows.
 */
export function undoBlock(facts: UndoFacts): UndoBlock | null {
	if (facts.clearOpen) return "clearing";
	if (facts.restoring) return "restoring";
	if (facts.working) return "working";
	if (facts.starting) return "starting";
	return facts.picking ? "picking" : null;
}

/** What the adoption of an Undo's CLI is checked against (ADR-018). */
export interface AdoptFacts {
	block: UndoBlock | null;
	sameConversation: boolean;
	/** The latest clear is the one the Undo started from, with no message after it, its session still this device's. */
	sameOffer: boolean;
	/** Bumped by each launch-setting change (the CLI path, WSL, a profile edit): now, and when the Undo began. */
	launchGeneration: number;
	startedGeneration: number;
}

/** Whether the tab takes the Undo's CLI over: nothing blocks, and nothing it was started for has changed. */
export function mayAdopt(facts: AdoptFacts): boolean {
	return facts.block === null && facts.sameConversation && facts.sameOffer && facts.launchGeneration === facts.startedGeneration;
}

/**
 * The button's state: `pending` while an Undo runs, else disabled for a foreign
 * session or what blocks it; null for no button, also while the clear is open
 * (the CLI's answer to it has not arrived).
 */
export function undoState(offer: UndoOffer | null, pending: boolean, block: UndoBlock | null = null): UndoState | null {
	if (!offer || block === "clearing") return null;
	if (pending) return "pending";
	return offer.foreign ? "foreign" : (block ?? "ready");
}

/** The id of the latest clear's divider among the messages' items, the only one that can offer Undo; null when none. */
export function latestClearId(items: readonly MessageItem[]): number | null {
	for (let at = items.length - 1; at >= 0; at--) if (items[at].kind === "clear") return items[at].id;
	return null;
}
