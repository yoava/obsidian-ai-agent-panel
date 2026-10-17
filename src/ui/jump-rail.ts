import { Component, type Events } from "obsidian";
import { railFractions, RailDrawn, tickMoved } from "../state/prompts";
import type { ItemsChange } from "../state/tab";
import { Follower, hiddenText, syncChildren, writeClass, writeTooltip } from "./dom";
import type { ResizeMeasure, ResizePass } from "./shell";

/** A numbered prompt as the rail reads it from the active tab's messages. */
export interface RailPrompt {
	number: number;
	/** "N · <first line>": the tick's name and its tooltip. */
	label: string;
}

/** The active tab's messages, as the rail measures them. */
export interface RailMessages {
	/** The scroller, whose scroll height the ticks are a fraction of. */
	readonly el: HTMLElement;
	railPrompts(): RailPrompt[];
	/** Where prompt `number` is drawn; null before a reopen draws it. */
	railAnchor(number: number): HTMLElement | null;
}

/** The active tab as the rail follows it: `items`, and `activity` ("writing" while a text block streams). */
export interface RailTab extends Events {
	readonly activity: string;
}

export interface JumpRailSource {
	/** The view's events: `active`. */
	viewEvents: Events;
	activeTab: () => RailTab | null;
	activeMessages: () => RailMessages | null;
	resizePass: ResizePass;
}

export interface JumpRailIntents {
	/** Scroll the active tab to prompt `number`. */
	onJump: (number: number) => void;
}

interface Tick {
	el: HTMLButtonElement;
	/** The offset last written, in px; null before the first. */
	written: number | null;
}

/**
 * The jump rail (DES-003 Prompts, Card with "Prompt jump rail" on): on
 * the messages host's right edge, following the active tab, a tick per
 * numbered prompt at its position in the messages, or at its index fraction
 * until drawn. Positions are read in `ui/shell`'s resize pass, which the
 * messages content resizing also runs, and a tick is written only when it
 * moves by 1 px or more. Each tick is a button named "N · <first line>",
 * its 400 ms tooltip, scrolling to its prompt.
 */
export class JumpRail extends Component implements ResizeMeasure {
	/** Read on the messages content's resizes as well as the main column's. */
	readonly content = true;
	private readonly rootEl: HTMLElement;
	/** Its name, kept first among the ticks. */
	private readonly nameEl: HTMLElement;
	private readonly ticks = new Map<number, Tick>();
	private numbers: number[] = [];
	/** The ticks drawn, so an unchanged set writes nothing. */
	private readonly drawn = new RailDrawn();
	private next: number[] = [];
	private current: number | null = null;
	/** A content resize came while a text block streamed: re-read at its end. */
	private owed = false;

	constructor(
		parent: HTMLElement,
		private readonly source: JumpRailSource,
		private readonly intents: JumpRailIntents
	) {
		super();
		this.rootEl = parent.createEl("nav", { cls: "ai-agent-panel-rail" });
		this.nameEl = hiddenText(this.rootEl, "aria-labelledby", "Jump to a prompt");
	}

	onload(): void {
		this.register(() => this.rootEl.remove());
		this.register(this.source.resizePass.addMeasure(this));
		const tab = new Follower<RailTab, "items" | "activity">(this, {
			items: (change) => {
				this.rebuild();
				// A model replaced with the same prompts still moves them.
				if ((change as ItemsChange | undefined)?.type === "reset") this.source.resizePass.requestPass();
			},
			activity: (activity) => {
				if (!this.owed || activity === "writing") return;
				this.owed = false;
				this.source.resizePass.requestPass();
			},
		});
		this.registerEvent(
			this.source.viewEvents.on("active", () => {
				tab.follow(this.source.activeTab());
				// Another tab's messages: every tick is placed again.
				this.drawn.forget();
				for (const tick of this.ticks.values()) tick.written = null;
				this.rebuild();
			})
		);
		tab.follow(this.source.activeTab());
		this.rebuild();
	}

	/** The pinned prompt's tick takes the prompt color (`mod-pin-prompt`). */
	setCurrent(number: number | null): void {
		this.current = number;
		for (const [key, tick] of this.ticks) writeClass(tick.el, "is-current", key === number);
	}

	/**
	 * Tick positions. A resize of the messages content alone while a text
	 * block streams waits for its `content_block_stop` (DES-003 Prompts), so
	 * streamed text costs no layout read.
	 */
	read(_cssChanged: boolean, full: boolean): void {
		if (!full && this.source.activeTab()?.activity === "writing") {
			this.owed = true;
			this.next = [];
			return;
		}
		const messages = this.source.activeMessages();
		const height = this.rootEl.clientHeight;
		if (!messages || height === 0) {
			this.next = [];
			return;
		}
		const offsets = this.numbers.map((number) => messages.railAnchor(number)?.offsetTop ?? null);
		this.next = railFractions(offsets, messages.el.scrollHeight).map((fraction) => fraction * height);
	}

	write(): void {
		this.next.forEach((top, at) => {
			const tick = this.ticks.get(this.numbers[at] ?? -1);
			if (!tick || !tickMoved(tick.written, top)) return;
			tick.written = top;
			tick.el.setCssProps({ "--ai-agent-panel-tick-top": `${Math.round(top)}px` });
		});
	}

	/** The active tab's prompts as ticks, keyed by number; positions follow in the next pass. */
	private rebuild(): void {
		const prompts = this.source.activeMessages()?.railPrompts() ?? [];
		if (this.drawn.next(prompts.map((prompt) => prompt.label)) === null) return;
		this.numbers = prompts.map((prompt) => prompt.number);
		const keep = new Set(prompts.map((prompt) => prompt.number));
		for (const key of [...this.ticks.keys()]) if (!keep.has(key)) this.ticks.delete(key);
		syncChildren(this.rootEl, [
			this.nameEl,
			...prompts.map((prompt) => {
				let tick = this.ticks.get(prompt.number);
				if (!tick) {
					const el = createEl("button", { cls: "ai-agent-panel-rail-tick", attr: { type: "button" } });
					el.addEventListener("click", () => this.intents.onJump(prompt.number));
					tick = { el, written: null };
					this.ticks.set(prompt.number, tick);
				}
				writeTooltip(tick.el, prompt.label, "left");
				writeClass(tick.el, "is-current", prompt.number === this.current);
				return tick.el;
			}),
		]);
		this.rootEl.toggle(prompts.length > 0);
		this.source.resizePass.requestPass();
	}
}
