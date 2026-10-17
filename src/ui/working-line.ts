import { Component, type Events } from "obsidian";
import type { Activity } from "../state/tab";
import type { Ticker } from "../state/ticker";
import { workingLine } from "../state/working-line";
import { writeIcon, writeText } from "./dom";

/** A tab as the working line reads it: its `activity`, `thinking` and `turn` events. */
export interface WorkingLineTab extends Events {
	readonly activity: Activity;
	readonly thinking: boolean;
	readonly workingSince: number | null;
}

/**
 * The working line (PRD-001.R15; DES-003 Turn): at the live end of the
 * messages while Claude works, a loader mark, what Claude is doing and the
 * elapsed time; hidden while a card waits and once the turn ends. No live
 * region: the turn's own announcements stay the only ones.
 */
export class WorkingLine extends Component {
	readonly el: HTMLElement;
	private readonly labelEl: HTMLElement;
	private readonly elapsedEl: HTMLElement;
	private shown = false;
	private stopTicking: (() => void) | null = null;

	constructor(
		parent: HTMLElement,
		private readonly tab: WorkingLineTab,
		private readonly ticker: Ticker,
		/** The line showing or hiding changes the messages' height: their scroll-follow. */
		private readonly follow: () => void
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-working-line" });
		writeIcon(this.el.createSpan({ cls: "ai-agent-panel-working-mark", attr: { "aria-hidden": "true" } }), ["loader-circle", "loader-2"]);
		this.labelEl = this.el.createSpan({ cls: "ai-agent-panel-working-label" });
		this.elapsedEl = this.el.createSpan({ cls: "ai-agent-panel-working-elapsed" });
		this.el.toggle(false);
	}

	onload(): void {
		this.register(() => {
			this.stopTicking?.();
			this.stopTicking = null;
			this.el.remove();
		});
		for (const name of ["activity", "thinking", "turn"]) this.registerEvent(this.tab.on(name, () => this.draw(Date.now())));
		this.draw(Date.now());
	}

	private draw(now: number): void {
		const view = workingLine({ activity: this.tab.activity, thinking: this.tab.thinking, startedAt: this.tab.workingSince }, now);
		const shown = view !== null;
		if (shown !== this.shown) {
			this.shown = shown;
			this.el.toggle(shown);
			this.follow();
		}
		writeText(this.labelEl, view?.label ?? "");
		writeText(this.elapsedEl, view?.elapsed ?? "");
		this.tick(shown);
	}

	/** The elapsed time ticks while the line shows (PRD-001.R29). */
	private tick(shown: boolean): void {
		if (shown && !this.stopTicking)
			this.stopTicking = this.ticker.subscribe({
				shown: () => !this.el.doc.hidden && this.el.isShown(),
				tick: (now) => this.draw(now),
			});
		else if (!shown && this.stopTicking) {
			this.stopTicking();
			this.stopTicking = null;
		}
	}
}
