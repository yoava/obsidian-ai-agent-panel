import { Component, type Events } from "obsidian";
import { HELD_ANNOUNCEMENT, type HeldNote } from "../state/held-rows";
import { Follower } from "./dom";

export interface AnnouncerSource {
	/** The view's events: `active`. */
	viewEvents: Events;
	/** The active tab, firing `card` and `turn`. */
	activeTab: () => Events | null;
}

/** How long the cleared region stays empty, so a repeated message is read again. */
const CLEAR_MS = 100;

/**
 * The panel's one live region (DES-003 Keyboard and accessibility), the only
 * element with `aria-live`: "Claude is waiting for you" when a card starts
 * waiting in the active tab, "Claude finished" when the active tab's turn
 * closes at its `result` (PRD-001.R15), and what the held tray changed
 * ("Clear queued until this turn ends", "Message queued", "Clear cancelled";
 * PRD-001.R38). It is cleared before each message.
 */
export class Announcer extends Component {
	private timer: number | null = null;

	constructor(
		private readonly el: HTMLElement,
		private readonly source: AnnouncerSource
	) {
		super();
		el.setAttribute("aria-live", "polite");
		el.setAttribute("aria-atomic", "true");
	}

	onload(): void {
		const tab = new Follower<Events, "card" | "turn" | "held">(this, {
			held: (change) => {
				const note = (change as { note?: HeldNote } | undefined)?.note;
				if (note) this.say(HELD_ANNOUNCEMENT[note]);
			},
			card: (change) => {
				if ((change as { waiting?: unknown } | undefined)?.waiting === true) this.say("Claude is waiting for you");
			},
			turn: (change) => {
				const turn = change as { open?: unknown; ended?: unknown } | undefined;
				if (turn?.open === false && turn.ended === "result") this.say("Claude finished");
			},
		});
		this.registerEvent(this.source.viewEvents.on("active", () => tab.follow(this.source.activeTab())));
		tab.follow(this.source.activeTab());
		this.register(() => {
			if (this.timer !== null) this.el.win.clearTimeout(this.timer);
			this.timer = null;
			this.el.empty();
		});
	}

	private say(text: string): void {
		this.el.empty();
		if (this.timer !== null) this.el.win.clearTimeout(this.timer);
		this.timer = this.el.win.setTimeout(() => {
			this.timer = null;
			this.el.setText(text);
		}, CLEAR_MS);
	}
}
