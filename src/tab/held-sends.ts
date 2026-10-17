import type { PendingImage } from "../attachments";
import type { SendContext } from "../context-format";
import type { Delivery, HeldSend } from "../state/held-send";
import type { HeldNote } from "../state/held-rows";

/** What stands between the oldest held message and its send. */
export type HeldGate = { kind: "free" } | { kind: "wait"; until: Promise<void> } | { kind: "halt" };

/** What the queue reaches outside itself. */
export interface HeldSendsHost {
	/** The message's turn, through the send path. */
	deliver: (send: HeldSend) => Promise<Delivery>;
	/** The queue changed: the tray draws again; `note` is what the live region says. */
	changed: (note?: HeldNote) => void;
	/** `wait` while a clear or an Undo is open, `halt` while a `/clear` is held for the turn's end. */
	gate: () => HeldGate;
}

/**
 * The messages sent behind a hold (PRD-001.R38; DES-003 Held messages), oldest
 * first, and the loop that sends them one at a time through the send path.
 * The head keeps its place until the send path has taken or returned it; a
 * delivery that throws is logged and counts as returned, so the messages
 * behind it still go.
 */
export class HeldSends {
	private sends: HeldSend[] = [];
	private seq = 0;
	private inflight: number | null = null;
	private draining = false;
	private disposed = false;

	constructor(private readonly host: HeldSendsHost) {}

	get size(): number {
		return this.sends.length;
	}

	view(): readonly HeldSend[] {
		return this.sends;
	}

	/** A message sent behind a hold: kept in its place, sent when nothing holds it. */
	add(text: string, images: readonly PendingImage[], context: SendContext | null): void {
		if (this.disposed) return;
		this.sends.push({ id: ++this.seq, text, images, context });
		this.host.changed("message");
		void this.drain();
	}

	/** Every message not being delivered, removed and returned oldest first (the caller puts them back in the composer). */
	take(): HeldSend[] {
		const taken = this.sends.filter((send) => send.id !== this.inflight);
		this.sends = this.sends.filter((send) => send.id === this.inflight);
		return taken;
	}

	/** What held the queue ended: send on. */
	resume(): void {
		void this.drain();
	}

	dispose(): void {
		this.disposed = true;
		this.sends = [];
	}

	private async drain(): Promise<void> {
		if (this.draining) return;
		this.draining = true;
		try {
			while (!this.disposed) {
				const head = this.sends[0];
				if (!head) return;
				const gate = this.host.gate();
				if (gate.kind === "halt") return;
				if (gate.kind === "wait") {
					await gate.until;
					continue;
				}
				this.inflight = head.id;
				let result: Delivery;
				try {
					result = await this.host.deliver(head);
				} catch (err) {
					console.error("AI Agent Panel: sending a held message failed", err);
					result = "kept";
				}
				this.inflight = null;
				if (result === "again") {
					await Promise.resolve();
					continue;
				}
				this.sends = this.sends.filter((send) => send.id !== head.id);
				this.host.changed();
			}
		} finally {
			this.draining = false;
			this.inflight = null;
		}
	}
}
