import type { PendingImage } from "../attachments";
import type { SendContext } from "../context-format";

/**
 * The send path's decisions about held messages (PRD-001.R38; DES-003 Send
 * path), apart from `tab/chat-tab` so they are tested in plain Node.
 */

/**
 * What the send path made of a message: `sent` it went; `kept` it did not go
 * and stays, or is back, in the composer; `again` a hold began meanwhile, so
 * it keeps its place.
 */
export type Delivery = "sent" | "kept" | "again";

/** A message sent while the tab's sends are held, kept until its turn comes. */
export interface HeldSend {
	id: number;
	/** As the user sent it. */
	text: string;
	/** The images it was sent with; they left the composer when it was held. */
	images: readonly PendingImage[];
	/** The context block, label and paths as they were when it was sent. */
	context: SendContext | null;
}

/** What the send path knows once the session is ensured. */
export interface SendFacts {
	restoring: boolean;
	/** A session exists. */
	session: boolean;
	/** A clear, an Undo or a held `/clear` began meanwhile. */
	blocked: boolean;
	/** Whether a pending resume (ADR-018 Decision 1) refuses the send; asked last. */
	resumeRefused: () => boolean;
}

/** `go`, or why the message does not: `kept` in the composer, or `again` in its place. */
export function sendGate(facts: SendFacts): "go" | "kept" | "again" {
	if (facts.restoring || !facts.session) return "kept";
	if (facts.blocked) return "again";
	return facts.resumeRefused() ? "kept" : "go";
}

/** A message made now: held behind what holds the tab, else sent at once. */
export function submitRoute(holds: boolean): "hold" | "deliver" {
	return holds ? "hold" : "deliver";
}

/** A message sent at once whose hold began meanwhile is held in its place. */
export function routeAfter(delivery: Delivery): "hold" | "done" {
	return delivery === "again" ? "hold" : "done";
}

/** The images a send plans from: a held message's own, else the composer's. */
export function pendingImages(held: readonly PendingImage[] | null, composer: readonly PendingImage[]): readonly PendingImage[] {
	return held ?? composer;
}

/** The composer's images after a send: its own stay beside a held message's that wait behind a command. */
export function imagesAfterSend(held: boolean, composer: readonly PendingImage[], keep: readonly PendingImage[]): readonly PendingImage[] {
	return held ? [...composer, ...keep] : keep;
}

/** The composer's images after a held message did not go: its own, then the ones it was held with. */
export function imagesAfterKeep(composer: readonly PendingImage[], held: readonly PendingImage[]): readonly PendingImage[] {
	return [...composer, ...held];
}

/** A declined `/clear` goes back to the composer only when no message was held behind it and the composer is empty, as a `/clear` typed now; never into a draft. */
export function returnsClear(held: number, composerEmpty: boolean): boolean {
	return held === 0 && composerEmpty;
}

/** The context a held message takes: the one captured when it was sent while it takes one, else what the caller reads now. */
export function contextFor(held: HeldSend | null, withContext: boolean, now: () => SendContext): SendContext {
	return held?.context && withContext ? held.context : now();
}
