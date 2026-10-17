/**
 * One tab's permission prompts (ADR-016 `tab/permission-flow`; DES-004
 * Permission round trip): the decision for each request, the pending set,
 * the answers from its cards and forms, a withdrawn request, and the
 * process ending. The decision order is `settings-core`'s, the machine
 * `state/permission`'s; the cards are the tab's messages model.
 */

import type { EditPreImage } from "../edit-tracker";
import { isEditTool } from "../edits";
import type { PermissionRequest, PermissionResult } from "../protocol/types";
import { allowAfterRead, allowResult, asksSandboxOff, permissionDecision, type ChatPermissionMode } from "../settings-core";
import {
	CANCELLED_MESSAGE,
	cardStep,
	CLEARING_MESSAGE,
	ENDED_MESSAGE,
	OUTCOME,
	permissionCard,
	questionForm,
	type Card,
	type CardEvent,
	type UserAnswer,
} from "../state/permission";
import { withDeadline } from "../timers";
import { parseAskUserQuestions } from "../tool-labels";

/**
 * In Auto-approve an edit's answer waits for its pre-edit read at most this
 * long; then it goes ahead as if the read had failed (DES-004 Diff sources).
 */
export const PRE_EDIT_READ_MS = 5000;

/** A request id that already waits: Claude Code never sends one, so it is refused. */
const DUPLICATE_MESSAGE = "A permission request with this id is already waiting.";

/**
 * The tab as the flow reads and writes it: its mode, and its cards in the
 * messages model (`tab/chat-tab`), each by the key the flow gives it, as
 * request ids can repeat once answered (a new process counts from 1 again).
 */
export interface FlowTab {
	readonly status: { readonly selectedMode: ChatPermissionMode };
	addCard(key: number, card: Card): void;
	setCard(key: number, card: Card): void;
}

/** The tab's pre-edit reads (`tab/edit-tracker`). */
export interface FlowEdits {
	readFor(toolName: string, toolUseId: string | undefined, input: Record<string, unknown>): Promise<EditPreImage> | null;
	clear(): void;
}

/** A card's latest state, the state it was added in, and its answer while one is still owed to the CLI. */
interface Entry {
	card: Card;
	added: Card;
	owed: { resolve: (result: PermissionResult) => void; reject: (error: Error) => void } | null;
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export class PermissionFlow {
	private nextKey = 0;
	/** The pending set: the card or form waiting under each request id. */
	private readonly waiting = new Map<string, number>();
	/**
	 * Requests answered with no card once their pre-edit read settles
	 * (Auto-approve), each with the denial that answers it first when a
	 * duplicate comes, or when it is withdrawn or its process ends.
	 */
	private readonly gated = new Map<string, (message: string) => void>();
	/** Cards still waiting or still reading their file, by key. */
	private readonly entries = new Map<number, Entry>();
	/** The card being added, and why its drawing failed, if it did (`failed` during `addCard`). */
	private adding: { card: Card; error: Error | null } | null = null;
	/** Stop and clear is under way: no request gets a card. */
	private refusing = false;

	constructor(
		private readonly host: { tab: FlowTab; edits: FlowEdits },
		private readonly readMs = PRE_EDIT_READ_MS
	) {}

	/**
	 * A `can_use_tool` request (DES-004 step 3), first match wins: a
	 * well-formed AskUserQuestion gets its form; in Auto-approve an unflagged
	 * request is allowed at once, an edit once its pre-edit read settled (at
	 * most 5 s); anything else gets a card, whose diff is the edit's read and
	 * whose Allow, in Auto-approve, waits for that read too. A request whose id
	 * already waits for an answer is denied first, and the one waiting
	 * answered as a denial too (its card or form cancelled), so the two
	 * answers written under that id agree.
	 */
	request(req: PermissionRequest): Promise<PermissionResult> {
		if (this.refusing) return Promise.resolve({ behavior: "deny", message: CLEARING_MESSAGE });
		const waiting = this.waiting.get(req.requestId);
		const gated = this.gated.get(req.requestId);
		if (waiting !== undefined || gated) {
			if (waiting !== undefined) this.step(waiting, { type: "cancelled" });
			gated?.(CANCELLED_MESSAGE);
			return Promise.resolve({ behavior: "deny", message: DUPLICATE_MESSAGE });
		}
		const questions = req.toolName === "AskUserQuestion" ? parseAskUserQuestions(req.input) : null;
		// Claude Code's rules and hooks ran before the request reached the panel.
		const decision = permissionDecision(this.host.tab.status.selectedMode, req, {
			questionForm: questions !== null,
			isEdit: isEditTool(req.toolName),
			sandboxOff: asksSandboxOff(req.input),
		});
		if (decision === "form" && questions) return this.open(() => questionForm(req, questions)).answer;
		if (decision === "allow") return Promise.resolve(allowResult(req.input));
		// The call's one pre-edit read: the card's diff, and in Auto-approve what
		// the allow waits for, at most `readMs`, so a hung read cannot hold it.
		const read = this.host.edits.readFor(req.toolName, req.toolUseId, req.input);
		const gate =
			read && (decision === "allow-after-read" || decision === "card-after-read")
				? withDeadline<EditPreImage | null>(read, this.readMs, null)
				: null;
		if (decision === "allow-after-read" && gate) return this.afterRead(req, gate);
		const { key, answer } = this.open(() =>
			permissionCard(req, { gate: gate ? "pending" : "none", diff: read ? "reading" : "none" })
		);
		// Handled whether or not a card opened, so a failed read is never left unhandled.
		if (read)
			void read.then(
				(pre) => this.setDiff(key, pre),
				() => this.setDiff(key, null)
			);
		if (gate && key !== null) void gate.then(() => this.step(key, { type: "read-settled" }));
		return answer;
	}

	/**
	 * A card's or form's button. `key` is the card's own number: an answer meant
	 * for an earlier card under the same request id finds nothing, and an
	 * answer with no key is dropped.
	 */
	answer(requestId: string, answer: UserAnswer, key: number | undefined): void {
		const waiting = this.waiting.get(requestId);
		if (waiting !== undefined && key === waiting) this.step(waiting, answer);
	}

	/** The CLI withdrew the request (`control_cancel_request`), or a restart replaced its process. */
	cancelled(requestId: string): void {
		const key = this.waiting.get(requestId);
		if (key !== undefined) this.step(key, { type: "cancelled" });
		this.gated.get(requestId)?.(CANCELLED_MESSAGE);
	}

	/**
	 * Stop and clear (PRD-001.R38): on, every open card settles as a denial
	 * ("The conversation is being cleared."), so an answer to one that arrives
	 * later finds nothing and is dropped, and every request that comes
	 * meanwhile is denied the same, with no card. Off, requests get their cards
	 * again.
	 */
	refuse(on: boolean): void {
		this.refusing = on;
		if (!on) return;
		for (const key of [...this.waiting.values()]) this.step(key, { type: "clearing" });
		for (const deny of [...this.gated.values()]) deny(CLEARING_MESSAGE);
		this.host.edits.clear();
	}

	/** The process ended: every open card settles, each answer a denial, and no result will release a kept read. */
	ended(): void {
		for (const key of [...this.waiting.values()]) this.step(key, { type: "ended" });
		for (const deny of [...this.gated.values()]) deny(ENDED_MESSAGE);
		this.host.edits.clear();
	}

	/**
	 * A card or form could not be drawn (`ui/turn`'s `onCardFailed`, with the
	 * card it was given): nobody can answer it, so the CLI gets an error reply,
	 * as when drawing threw before, and the tab stops waiting on it. A settled
	 * card, or one the flow no longer waits on under its id, changes nothing.
	 */
	failed(card: Card, error: unknown): void {
		if (card.phase === "settled") return;
		if (this.adding?.card === card) {
			this.adding.error = asError(error);
			return;
		}
		const key = this.waiting.get(card.requestId);
		const entry = key === undefined ? undefined : this.entries.get(key);
		if (key === undefined || !entry?.owed || (card !== entry.added && card !== entry.card)) return;
		const { reject } = entry.owed;
		entry.owed = null;
		this.waiting.delete(card.requestId);
		this.entries.delete(key);
		reject(asError(error));
		this.unshown(key, entry.card);
	}

	/**
	 * Allowed with no card once the pre-edit read settles (PRD-002.R6). While
	 * it waits, a duplicate of its id, a withdrawal or the process ending
	 * answers it as a denial instead, which frees the id; the client writes
	 * that denial nowhere for a withdrawn request or a stopped or closed
	 * process, and the read settling later answers nothing.
	 */
	private afterRead(req: PermissionRequest, gate: Promise<unknown>): Promise<PermissionResult> {
		return new Promise<PermissionResult>((resolve) => {
			const finish = (result: PermissionResult): void => {
				if (this.gated.get(req.requestId) !== deny) return;
				this.gated.delete(req.requestId);
				resolve(result);
			};
			const deny = (message: string): void => finish({ behavior: "deny", message });
			this.gated.set(req.requestId, deny);
			void allowAfterRead(gate, req.input).then(finish);
		});
	}

	/**
	 * A card or form waits for its answer, registered once the tab holds it.
	 * Content that cannot be built, or a card the tab cannot hold or draw,
	 * gets an error reply and leaves nothing waiting.
	 */
	private open(build: () => Card): { key: number | null; answer: Promise<PermissionResult> } {
		const key = ++this.nextKey;
		let card: Card;
		try {
			card = { ...build(), key };
		} catch (error) {
			return { key: null, answer: Promise.reject(asError(error)) };
		}
		const adding = { card, error: null as Error | null };
		this.adding = adding;
		try {
			this.host.tab.addCard(key, card);
		} catch (error) {
			adding.error = asError(error);
		} finally {
			this.adding = null;
		}
		if (adding.error) {
			this.unshown(key, card);
			return { key: null, answer: Promise.reject(adding.error) };
		}
		const answer = new Promise<PermissionResult>((resolve, reject) => {
			this.entries.set(key, { card, added: card, owed: { resolve, reject } });
		});
		this.waiting.set(card.requestId, key);
		return { key, answer };
	}

	/** One event through the machine; an answer it gives goes to the CLI before the card is redrawn. */
	private step(key: number, event: CardEvent): void {
		const entry = this.entries.get(key);
		const owed = entry?.owed;
		if (!entry || !owed) return;
		const next = cardStep(entry.card, event);
		if (next.card === entry.card) return;
		if (next.reply) {
			entry.owed = null;
			this.waiting.delete(next.card.requestId);
			owed.resolve(next.reply);
		}
		this.put(key, entry, next.card);
	}

	/** The read arrived, settled or not: the diff shows it, or nothing when it failed. */
	private setDiff(key: number | null, pre: EditPreImage | null): void {
		const entry = key === null ? undefined : this.entries.get(key);
		if (key === null || entry?.card.kind !== "permission") return;
		this.put(key, entry, { ...entry.card, diff: pre ?? "none" });
	}

	/** The latest state to the tab; a drawing that throws cannot break the flow. */
	private put(key: number, entry: Entry, card: Card): void {
		entry.card = card;
		const reading = card.kind === "permission" && card.diff === "reading";
		if (!entry.owed && !reading) this.entries.delete(key);
		this.draw(key, card);
	}

	/** A card the tab holds but nobody can answer: settled there, so the tab does not wait on it. */
	private unshown(key: number, card: Card): void {
		this.draw(key, { ...card, phase: "settled", outcome: OUTCOME.cancelled });
	}

	private draw(key: number, card: Card): void {
		try {
			this.host.tab.setCard(key, card);
		} catch (error) {
			console.error("AI Agent Panel: drawing a permission card failed", error);
		}
	}
}
