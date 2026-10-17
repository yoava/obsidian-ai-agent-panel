import {
	Component,
	Keymap,
	Notice,
	parseLinktext,
	type App,
	type HoverParent,
} from "obsidian";
import type { ShellResult } from "../bash";
import type { ReportAction } from "../commands";
import { ImageViewerModal } from "../confirm-modal";
import { opensInOs } from "../inert-markdown";
import { ReportCard } from "../report-view";
import { clearView } from "../state/clear-divider";
import type { HeldInput } from "../state/held-rows";
import { compactionView } from "../state/compaction";
import type { EventView } from "../state/event-view";
import { formatClock } from "../state/usage-segment";
import { cacheView, type PromptCache } from "../state/prompt-cache";
import { tickLabel } from "../state/prompts";
import { BEFORE_CLEAR, foldLabel, NO_SEGMENTS, planSegments, type Fold, type SegmentPlan, type UndoState } from "../state/segments";
import {
	chunkDone,
	firstScreenDone,
	FOLLOW_BOTTOM_PX,
	followsEnd,
	opensSection,
	scrollsUpByHand,
	type FollowState,
	type ScrollInput,
	restoredScrollTop,
	scrollPosition,
	sectionsOf,
	storedCount,
	type ItemsChange,
	type MessageItem,
	type ScrollPosition,
} from "../state/tab";
import type { Ticker } from "../state/ticker";
import { EventDivider } from "./event-divider";
import { copyText } from "./copy";
import { hiddenText, onOwnDocument, writeClass, writeIcon } from "./dom";
import { EmptyState, type EmptyStateSource } from "./empty-state";
import { ErrorBlock } from "./error-block";
import { HeldTray } from "./held-tray";
import type { RailMessages, RailPrompt } from "./jump-rail";
import { PinObserver, PromptView } from "./prompt";
import { ShellCard } from "./shell-card";
import { agentItemView, mountCard, TurnView, type TurnIntents, type TurnTab } from "./turn";
import { WorkingLine, type WorkingLineTab } from "./working-line";

/** A tab as its messages read it: the model, `items`, `item:<id>`, `activity`, `thinking`, the running turn's head, and its streams. */
export type MessagesTab = TurnTab &
	WorkingLineTab & {
		/** The prompt cache a live `/context` card shows (PRD-005.R11). */
		readonly status: { readonly cache: PromptCache };
	};

export interface MessagesSource extends EmptyStateSource {
	app: App;
	tab: MessagesTab;
	/** The page-preview source and its parent, the view (DES-001 hover-link source). */
	hoverSource: string;
	hoverParent: HoverParent;
	/** The shared 1 s ticker of the turn heads (PRD-001.R29). */
	ticker: Ticker;
}

/** What the messages need from the view: the turn's intents, the pin, the starters, the report and shell cards' actions. */
export interface MessagesIntents extends Omit<TurnIntents, "follow" | "revealAfter" | "viewImages"> {
	/** The pinned prompt changed: its number, or null when none is pinned. */
	onPinned: (number: number | null) => void;
	onStarter: (prompt: string) => void;
	/** Refresh or Try again on report card `id`: its command again, into it (DES-003 Report cards). */
	onRefreshReport: (id: number) => void;
	/** A row's button on report card `id`. */
	onReportAction: (id: number, action: ReportAction) => void;
	/** A /help row: `/<name>` and a space into the composer. */
	onInsertCommand: (name: string) => void;
	/** "Add output to chat" on a `!` run's card. */
	onAddOutput: (result: ShellResult) => void;
	/** "/compact now" on a live `/context` card: sends `/compact`; false when the tab cannot send now. */
	onCompact: () => boolean;
	/** A fold's button or hidden sections moved, so the rail's ticks are placed again. */
	onFoldLayout: () => void;
	/** Whether `/compact` can be sent now (`compactAllowed`). */
	canCompact: () => boolean;
	/** What the Undo of clear divider `id` is: null when it offers none (PRD-001.R38). */
	undoState: (id: number) => UndoState | null;
	/** "Undo" on the latest clear's divider. */
	onUndo: () => void;
	/** The held `/clear` and the messages behind it (PRD-001.R38). */
	heldView: () => HeldInput;
	/** "Cancel" on the held `/clear`. */
	onCancelHeld: () => void;
}

/** A drawn section: its element, which of its items are drawn, and how the segments plan treats it (PRD-001.R38). */
interface Section {
	el: HTMLElement;
	items: number;
	ids: Set<number>;
	/** The items drawn into it, in order. */
	list: MessageItem[];
	/** Its numbered prompts, which the pin watches while the section shows. */
	prompts: { view: PromptView; number: number }[];
	/** The fold it belongs to, whether or not that is open. */
	fold: Fold | null;
	/** Its name for screen readers while it is dimmed. */
	label: HTMLElement | null;
}

/**
 * One tab's messages (DES-003 Messages): the model's items in chronological
 * DOM order, a section per user message, bottom-aligned while shorter than
 * the view; the empty state while there are none; a reopen drawn newest
 * sections first until two view heights, older ones in idle-time chunks;
 * scroll-follow once per frame; and the links in it (PRD-001.R17), the only
 * place a URL reaches `window.open`.
 */
export class Messages extends Component implements RailMessages {
	/** The scroller: a `region` "Messages". */
	readonly el: HTMLElement;
	/** The sections; `ui/shell`'s observer watches its size for the rail. */
	readonly contentEl: HTMLElement;
	private readonly empty: EmptyState;
	/** The working line, after the sections. */
	private readonly working: WorkingLine;
	/** The held `/clear` and the messages behind it, after the working line. */
	private readonly held: HeldTray;
	private readonly pins: PinObserver;
	/** Each drawn item: its element, section, and component (none for a note). */
	private readonly drawn = new Map<
		number,
		{
			el: HTMLElement;
			section: Section;
			prompt: PromptView | null;
			view: Component | null;
		}
	>();
	/** The drawn numbered prompts, by number. */
	private readonly numbered = new Map<number, PromptView>();
	/** Drawn sections, oldest first. */
	private sections: Section[] = [];
	/** Which items are dimmed and folded (PRD-001.R38); the user's unfolds are kept by fold key. */
	private plan: SegmentPlan = NO_SEGMENTS;
	private readonly unfolded = new Set<number>();
	/** The "N earlier messages" button of each closed fold, by fold key. */
	private readonly pills = new Map<number, HTMLButtonElement>();
	private readonly sectionOf = new WeakMap<PromptView, Section>();
	/** Sections a reopen has yet to draw, oldest first; the newest of them is drawn next. */
	private pending: MessageItem[][] = [];
	private idle: number | null = null;
	private followFrame: number | null = null;
	/** A send's or a waiting card's forced follow: where the view was when it was asked for; null when none waits. */
	private forceTop: number | null = null;
	/** Whether the view follows its end (`followsEnd`). */
	private follows: FollowState = { following: true, lastTop: 0 };
	/** The next scroll up is the user's: a wheel up or an up key since the last move, or the scroll bar held. */
	private byHand = false;
	private holdingBar = false;
	private shown = false;
	/** What a turn and a card outside a turn need: the view's intents, and the scroll-follow and reveal of this list. */
	private readonly turnIntents: TurnIntents;

	constructor(
		parent: HTMLElement,
		private readonly source: MessagesSource,
		private readonly intents: MessagesIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-messages", attr: { role: "region" } });
		hiddenText(this.el, "aria-labelledby", "Messages");
		this.el.toggle(false);
		this.empty = this.addChild(new EmptyState(this.el, source, intents));
		this.contentEl = this.el.createDiv({ cls: "ai-agent-panel-messages-list" });
		this.working = this.addChild(
			new WorkingLine(this.contentEl, source.tab, source.ticker, () => this.follow())
		);
		this.held = this.addChild(new HeldTray(this.contentEl, source.tab, () => intents.heldView(), () => intents.onCancelHeld(), () => this.follow()));
		this.pins = new PinObserver(this.el, (number) => intents.onPinned(number));
		this.turnIntents = {
			...intents,
			follow: () => this.follow(),
			revealAfter: (el, rendered) => this.revealAfter(el, rendered),
			viewImages: (images, index) => new ImageViewerModal(source.app, images, index).open(),
		};
	}

	onload(): void {
		this.register(() => {
			const win = this.el.win;
			if (this.idle !== null) win.cancelIdleCallback(this.idle);
			if (this.followFrame !== null) win.cancelAnimationFrame(this.followFrame);
			this.pins.disconnect();
			this.el.remove();
		});
		this.registerEvent(this.source.tab.on("items", (change) => this.apply(change as ItemsChange)));
		this.registerEvent(this.source.tab.on("card", (change) => this.onCard(change as { waiting?: unknown } | undefined)));
		// Rendered Markdown carries no link behaviour of its own outside a note (PRD-001.R17).
		this.registerDomEvent(this.el, "click", (evt) => this.onLinkClick(evt));
		this.registerDomEvent(this.el, "auxclick", (evt) => this.onLinkClick(evt));
		this.registerDomEvent(this.el, "mouseover", (evt) => this.onLinkHover(evt));
		this.registerDomEvent(this.el, "scroll", () => this.onScroll(), { passive: true });
		this.registerDomEvent(this.el, "wheel", (evt) => this.noteInput({ kind: "wheel", deltaY: evt.deltaY }), { passive: true });
		this.registerDomEvent(this.el, "keydown", (evt) => {
			const target = evt.target instanceof Element ? evt.target : null;
			const inField = !!target?.closest("input, textarea, select, [contenteditable='true']");
			this.noteInput({ kind: "key", key: evt.key, inField });
		});
		// The scroll bar belongs to the scroller itself; its content is its children.
		this.registerDomEvent(this.el, "pointerdown", (evt) => {
			if (evt.target === this.el) this.holdingBar = scrollsUpByHand({ kind: "scrollbar" });
		});
		onOwnDocument(this, this.el, "pointerup", () => (this.holdingBar = false));
		onOwnDocument(this, this.el, "pointercancel", () => (this.holdingBar = false));
		this.apply({ type: "reset" });
	}

	/** The prompt pinned at the top, or null. */
	get pinned(): number | null {
		return this.pins.pinned;
	}

	/**
	 * The tab shows or hides; a hidden tab skips scroll-follow. A tab reopened
	 * while hidden, where nothing has a height, draws its first screen when it
	 * shows, before the caller restores its scroll position.
	 */
	setShown(shown: boolean): void {
		this.shown = shown;
		this.el.toggle(shown);
		this.syncEmpty();
		if (!shown) return;
		this.fillScreen();
		this.scheduleIdle();
	}

	/** Where the messages are scrolled, kept while hidden, where they cannot be read (PRD-001.R7). */
	scrollPosition(): ScrollPosition {
		const position = scrollPosition(this.el.scrollTop, this.el.scrollHeight, this.el.clientHeight);
		return this.follows.following ? { ...position, nearBottom: true } : position;
	}

	/** Back to where they were, or to the end when they were near it. */
	restoreScroll(position: ScrollPosition): void {
		this.el.scrollTop = restoredScrollTop(position, this.el.scrollHeight);
		this.follows = { following: position.nearBottom, lastTop: this.el.scrollTop };
	}

	/** To the end, now, following it. */
	scrollToEnd(): void {
		this.el.scrollTop = this.el.scrollHeight;
		this.follows = { following: true, lastTop: this.el.scrollTop };
	}

	/** The view's height changed (the composer grew or shrank): one that follows its end stays at it, now. */
	keepEnd(): void {
		if (this.shown && this.follows.following) this.scrollToEnd();
	}

	/** After a jump of the panel's own (the rail, the pinned prompt, a plan's reveal): follows only when it landed near the end. */
	private jumped(): void {
		const el = this.el;
		this.follows = { following: el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_BOTTOM_PX, lastTop: el.scrollTop };
		if (!this.follows.following) this.forceTop = null;
	}

	/** A wheel, a key or the scroll bar: whether the next scroll up is the user's. */
	private noteInput(input: ScrollInput): void {
		if (scrollsUpByHand(input)) this.byHand = true;
	}

	/** A scroll, the user's or anchoring's: whether the view still follows its end. */
	private onScroll(): void {
		const el = this.el;
		const top = el.scrollTop;
		const before = this.follows;
		this.follows = followsEnd(before, top, el.scrollHeight - top - el.clientHeight, this.byHand || this.holdingBar);
		// A move uses up the wheel's or key's mark.
		if (this.follows.lastTop !== before.lastTop) this.byHand = false;
	}

	/**
	 * Scroll-follow (DES-003 Stream to messages): at most once per frame, a
	 * follow while the view follows its end (`followsEnd`); `force` (a user
	 * send, a card starting to wait) follows anyway unless the view moved up
	 * since it was asked for; a hidden tab skips it.
	 */
	follow(force = false): void {
		if (force) this.forceTop = this.el.scrollTop;
		if (this.followFrame !== null) return;
		this.followFrame = this.el.win.requestAnimationFrame(() => {
			this.followFrame = null;
			const forced = this.forceTop !== null && this.el.scrollTop >= this.forceTop - 1;
			this.forceTop = null;
			if (!this.shown) return;
			if (forced || this.follows.following) this.scrollToEnd();
		});
	}

	/** A card starting to wait is followed into view, as a user send is. */
	private onCard(change: { waiting?: unknown } | undefined): void {
		if (change?.waiting === true) this.follow(true);
	}

	/**
	 * A card whose plan renders after it was followed (PRD-002.R17): parked
	 * at the end now, and once the plan has rendered, unless the user
	 * scrolled away meanwhile, brought into view from its top when it is
	 * taller than the messages, so the plan reads from its start, else to its
	 * bottom, so its buttons show.
	 */
	private revealAfter(el: HTMLElement, rendered: Promise<unknown>): void {
		this.scrollToEnd();
		void rendered.then(() => {
			// Where the view is now, a scroll event still to come included.
			this.onScroll();
			if (!this.follows.following) return;
			el.scrollIntoView({ block: el.offsetHeight > this.el.clientHeight ? "start" : "end" });
			this.jumped();
		});
	}

	/** The numbered prompts, for the jump rail. */
	railPrompts(): RailPrompt[] {
		const prompts: RailPrompt[] = [];
		for (const item of this.source.tab.items)
			if (item.kind === "prompt" && item.number !== null)
				prompts.push({ number: item.number, label: tickLabel(item.number, item.text) });
		return prompts;
	}

	/** Where a prompt is drawn; a folded prompt's is its fold's button. */
	railAnchor(number: number): HTMLElement | null {
		const view = this.numbered.get(number);
		const section = view && this.sectionOf.get(view);
		if (section && this.folded(section)) return this.pills.get(section.fold?.key ?? -1) ?? null;
		return view?.sentinelEl ?? null;
	}

	/** Scroll to a numbered prompt's section, drawing what a reopen has not drawn yet. */
	scrollToPrompt(number: number): void {
		const item = this.source.tab.items.find((entry) => entry.kind === "prompt" && entry.number === number);
		if (!item) return;
		// Older sections down to this one, the rest still when idle.
		while (!this.drawn.has(item.id) && this.pending.length > 0) this.drawSection(this.pending.pop() ?? [], true);
		const section = this.drawn.get(item.id)?.section;
		if (!section) return;
		// A folded prompt opens its fold first (PRD-001.R38).
		if (section.fold && this.folded(section)) this.unfold(section.fold.key, false);
		this.scrollToSection(section.el);
	}

	private scrollToSection(el: HTMLElement): void {
		this.el.scrollTop = el.offsetTop;
		this.jumped();
	}

	// --- Drawing the model ------------------------------------------------------

	private apply(change: ItemsChange): void {
		if (change.type === "reset") this.reset();
		else if (change.type === "added") this.add(change.item);
		else this.remove(change.id);
		if (change.type === "removed" || (change.type === "added" && change.item.kind === "clear")) this.applyPlan();
		this.syncEmpty();
	}

	/**
	 * The whole model again (DES-003 Reopen): whole sections newest first,
	 * reading the height once per section, until the messages hold two view
	 * heights; then to the end, and older sections in idle-time chunks.
	 */
	private reset(): void {
		if (this.idle !== null) this.el.win.cancelIdleCallback(this.idle);
		this.idle = null;
		for (const { prompt, view } of this.drawn.values()) {
			if (prompt) this.removeChild(prompt);
			if (view) this.removeChild(view);
		}
		this.pins.disconnect();
		this.numbered.clear();
		this.drawn.clear();
		this.sections = [];
		this.pills.clear();
		this.unfolded.clear();
		this.plan = planSegments(this.source.tab.items);
		this.contentEl.empty();
		this.contentEl.append(this.working.el, this.held.el);
		this.pending = sectionsOf(this.source.tab.items);
		// Before drawing: the empty state leaves, so the heights read are the sections'.
		this.syncEmpty();
		if (this.pending.length > 0) this.drawSection(this.pending.pop() ?? [], true);
		this.fillScreen();
		this.scrollToEnd();
		this.scheduleIdle();
	}

	/**
	 * Older sections until the messages hold two view heights, reading the
	 * height once per section: then the end can be scrolled to, and scroll
	 * anchoring, which does not act at the top, keeps it as the rest arrive.
	 */
	private fillScreen(): void {
		// A folded section adds no height: the idle chunks draw it, not this loop.
		while (
			this.pending.length > 0 &&
			!firstScreenDone(this.el.scrollHeight, this.el.clientHeight) &&
			!this.foldedItems(this.pending[this.pending.length - 1])
		)
			this.drawSection(this.pending.pop() ?? [], true);
	}

	/**
	 * The next idle chunk, while sections wait and the tab shows: prepended
	 * while hidden, they would move the content under a saved scroll position.
	 */
	private scheduleIdle(): void {
		if (this.pending.length === 0 || this.idle !== null || !this.shown) return;
		this.idle = this.el.win.requestIdleCallback(
			(deadline) => {
				this.idle = null;
				if (!this.shown) return;
				this.drawPending(() => deadline.timeRemaining());
				this.scheduleIdle();
			},
			{ timeout: 250 }
		);
	}

	/**
	 * Older sections above the drawn ones, newest first and whole, until
	 * `chunkDone`. Scroll anchoring keeps the view where it was (ADR-016
	 * Reopen).
	 */
	private drawPending(timeLeft: () => number): void {
		let drawn = 0;
		while (this.pending.length > 0) {
			const section = this.pending.pop() ?? [];
			this.drawSection(section, true);
			for (const item of section) drawn += storedCount(item);
			if (chunkDone(drawn, timeLeft())) break;
		}
		// Folded sections drawn hidden add no height, so the rail is told.
		if (drawn > 0 && this.plan.folds.length > 0) this.intents.onFoldLayout();
	}

	/** A live item at the end; a user message forces the scroll-follow (DES-003 Stream to messages). */
	private add(item: MessageItem): void {
		const last = this.sections[this.sections.length - 1];
		if (!last || opensSection(item, last.list[last.list.length - 1])) this.drawSection([item], false);
		else this.drawItem(item, last);
		this.follow(item.kind === "prompt");
	}

	private remove(id: number): void {
		const drawn = this.drawn.get(id);
		if (!drawn) {
			// Not drawn yet: out of the sections a reopen still draws.
			this.pending = this.pending
				.map((section) => section.filter((item) => item.id !== id))
				.filter((section) => section.length > 0);
			return;
		}
		this.drawn.delete(id);
		const section = drawn.section;
		section.ids.delete(id);
		section.list = section.list.filter((entry) => entry.id !== id);
		if (drawn.prompt) {
			section.prompts = section.prompts.filter((entry) => entry.view !== drawn.prompt);
			this.removePrompt(drawn.prompt);
		} else if (drawn.view) this.removeChild(drawn.view);
		else drawn.el.remove();
		if (--section.items > 0) return;
		section.el.remove();
		this.sections = this.sections.filter((entry) => entry !== section);
	}

	private drawSection(items: readonly MessageItem[], prepend: boolean): void {
		const section: Section = {
			el: createDiv({ cls: "ai-agent-panel-section" }),
			items: 0,
			ids: new Set(),
			list: [],
			prompts: [],
			fold: null,
			label: null,
		};
		if (prepend) {
			this.contentEl.prepend(section.el);
			this.sections.unshift(section);
		} else {
			this.contentEl.insertBefore(section.el, this.working.el);
			this.sections.push(section);
		}
		for (const item of items) this.drawItem(item, section);
		this.syncSection(section);
	}

	// --- Dimmed and folded segments (PRD-001.R38) -----------------------------------

	/** The plan again, after a clear came or an item went; every drawn section follows it. */
	private applyPlan(): void {
		this.plan = planSegments(this.source.tab.items);
		for (const section of this.sections) this.syncSection(section);
		for (const [key, pill] of this.pills) {
			if (this.plan.folds.some((fold) => fold.key === key) && !this.unfolded.has(key)) continue;
			pill.remove();
			this.pills.delete(key);
		}
	}

	private folded(section: Section): boolean {
		return section.fold !== null && !this.unfolded.has(section.fold.key);
	}

	/** Whether a section not yet drawn is folded shut. */
	private foldedItems(items: readonly MessageItem[]): boolean {
		const fold = items.length > 0 ? this.plan.foldOf.get(items[0].id) : undefined;
		return fold !== undefined && !this.unfolded.has(fold.key);
	}

	/** One section as the plan has it: dimmed and named for screen readers, folded shut with its fold's button, its prompts pinned only while it shows. */
	private syncSection(section: Section): void {
		const id = section.ids.values().next().value;
		const dimmed = id !== undefined && this.plan.dimmed.has(id);
		writeClass(section.el, "is-before-clear", dimmed);
		// Named by hidden text, not `aria-label`, which Obsidian would show as a tooltip (PRD-001.R32).
		if (dimmed && !section.label) {
			section.el.setAttribute("role", "group");
			section.label = hiddenText(section.el, "aria-labelledby", BEFORE_CLEAR);
		} else if (!dimmed && section.label) {
			section.label.remove();
			section.label = null;
			section.el.removeAttribute("role");
			section.el.removeAttribute("aria-labelledby");
		}
		section.fold = id === undefined ? null : (this.plan.foldOf.get(id) ?? null);
		const hidden = this.folded(section);
		writeClass(section.el, "is-folded", hidden);
		for (const { view, number } of section.prompts) {
			if (hidden) this.pins.unobserve(view);
			else this.pins.observe(view, number);
		}
		if (hidden && section.fold) this.placePill(section.fold, section);
	}

	/** The fold's button, above the oldest of its sections drawn so far. */
	private placePill(fold: Fold, section: Section): void {
		let pill = this.pills.get(fold.key);
		if (!pill) {
			pill = createEl("button", { cls: "ai-agent-panel-fold", attr: { type: "button", "aria-expanded": "false" } });
			writeIcon(pill.createSpan({ attr: { "aria-hidden": "true" } }), "chevron-up");
			pill.createSpan();
			// By key: a replan makes new `Fold` objects for the same run.
			pill.addEventListener("click", () => this.unfold(fold.key, true));
			this.pills.set(fold.key, pill);
		}
		const label = foldLabel(fold.count);
		if (pill.dataset.label !== label) {
			pill.dataset.label = label;
			pill.lastElementChild?.setText(label);
		}
		// Sections draw newest first on a reopen: the button moves up to each older one.
		if (pill.parentElement !== this.contentEl || section.el.compareDocumentPosition(pill) & Node.DOCUMENT_POSITION_FOLLOWING) {
			this.contentEl.insertBefore(pill, section.el);
			this.intents.onFoldLayout();
		}
	}

	/**
	 * Opens a fold for good: its sections show, its button goes. From the
	 * button (`fromButton`) focus moves to the first thing it revealed, so a
	 * keyboard user is not left on the body.
	 */
	private unfold(key: number, fromButton: boolean): void {
		const pill = this.pills.get(key);
		const focused = fromButton && pill !== undefined && pill.ownerDocument.activeElement === pill;
		this.unfolded.add(key);
		const opened = this.sections.filter((section) => section.fold?.key === key);
		for (const section of opened) this.syncSection(section);
		pill?.remove();
		this.pills.delete(key);
		this.intents.onFoldLayout();
		if (focused && opened.length > 0) this.focusFirst(opened[0]);
	}

	/** Focus on a section's first control (not the inert pin's), else on the section. */
	private focusFirst(section: Section): void {
		const control = [...section.el.querySelectorAll<HTMLElement>("button, a[href], [tabindex]")].find((el) => !el.closest("[inert]"));
		const target = control ?? section.el;
		if (target === section.el) {
			section.el.tabIndex = -1;
			section.el.addEventListener("blur", () => section.el.removeAttribute("tabindex"), { once: true });
		}
		target.focus({ preventScroll: true });
	}

	/** A context-event divider (a compaction's or a clear's) in `section`. */
	private drawEvent<Item extends MessageItem>(item: Item, section: Section, describe: (item: Item) => EventView, onAction?: () => void): void {
		const divider = this.addChild(
			new EventDivider(section.el, item, describe, this.source.tab, (markdown, el) => this.intents.renderMarkdown(markdown, el), onAction)
		);
		this.drawn.set(item.id, { el: divider.el, section, prompt: null, view: divider });
	}

	private drawItem(item: MessageItem, section: Section): void {
		section.items++;
		section.ids.add(item.id);
		section.list.push(item);
		if (item.kind === "prompt") {
			const prompt = this.addChild(
				new PromptView(section.el, item, this.source.tab, () => this.scrollToSection(section.el), this.turnIntents.viewImages)
			);
			if (item.number !== null) {
				this.pins.observe(prompt, item.number);
				this.numbered.set(item.number, prompt);
				section.prompts.push({ view: prompt, number: item.number });
				this.sectionOf.set(prompt, section);
			}
			this.drawn.set(item.id, { el: prompt.el, section, prompt, view: null });
			return;
		}
		if (item.kind === "turn") {
			const turn = this.addChild(
				new TurnView(section.el, item, { tab: this.source.tab, ticker: this.source.ticker }, this.turnIntents)
			);
			this.drawn.set(item.id, { el: turn.el, section, prompt: null, view: turn });
			return;
		}
		if (item.kind === "error") {
			const block = this.addChild(new ErrorBlock(section.el, item));
			this.drawn.set(item.id, { el: block.el, section, prompt: null, view: block });
			return;
		}
		if (item.kind === "card") {
			// A card while no turn runs: its item's changes reach it here.
			const card = mountCard(this, section.el, item.card, this.turnIntents);
			if (!card) {
				// Not built, and answered with an error: an empty element keeps the section's count.
				this.drawn.set(item.id, { el: section.el.createDiv(), section, prompt: null, view: null });
				return;
			}
			card.registerEvent(
				this.source.tab.on(`item:${item.id}`, (changed) => {
					const next = changed as MessageItem | undefined;
					if (next?.kind === "card") card.update(next.card);
				})
			);
			this.drawn.set(item.id, { el: card.el, section, prompt: null, view: card });
			return;
		}
		if (item.kind === "report") {
			const intents = this.intents;
			const card = this.addChild(
				new ReportCard(section.el, item, this.source.tab, {
					onRefresh: () => intents.onRefreshReport(item.id),
					onCopy: (text) => void copyText(text),
					onAction: (action) => intents.onReportAction(item.id, action),
					onInsert: (name) => intents.onInsertCommand(name),
					renderMarkdown: (markdown, el) => intents.renderMarkdown(markdown, el),
					cache: {
						view: () => cacheView(this.source.tab.status.cache, Date.now()),
						canCompact: () => intents.canCompact(),
						onCompact: () => intents.onCompact(),
						ticker: this.source.ticker,
					},
				})
			);
			this.drawn.set(item.id, { el: card.el, section, prompt: null, view: card });
			return;
		}
		if (item.kind === "shell") {
			const card = this.addChild(
				new ShellCard(section.el, item, this.source.tab, { onAddOutput: (result) => this.intents.onAddOutput(result) })
			);
			this.drawn.set(item.id, { el: card.el, section, prompt: null, view: card });
			return;
		}
		if (item.kind === "compaction") return this.drawEvent(item, section, compactionView);
		if (item.kind === "clear") {
			return this.drawEvent(item, section, (clear) => clearView(clear, formatClock, this.intents.undoState(clear.id)), () => this.intents.onUndo());
		}
		if (item.kind === "agent") {
			// An agent row on its own while no turn runs (PRD-001.R18).
			const view = this.addChild(agentItemView(section.el, item, { tab: this.source.tab, ticker: this.source.ticker }, this.turnIntents));
			this.drawn.set(item.id, { el: view.el, section, prompt: null, view });
			return;
		}
		// The branch note (PRD-002.R15): text only.
		const el = section.el.createDiv({ cls: "ai-agent-panel-note", text: item.text });
		this.drawn.set(item.id, { el, section, prompt: null, view: null });
	}

	private removePrompt(prompt: PromptView): void {
		this.pins.unobserve(prompt);
		for (const [number, view] of this.numbered) if (view === prompt) this.numbered.delete(number);
		this.removeChild(prompt);
	}

	private syncEmpty(): void {
		const empty = this.source.tab.items.length === 0;
		writeClass(this.el, "is-empty", empty);
		this.empty.setShown(this.shown && empty);
	}

	// --- Links (PRD-001.R17) ----------------------------------------------------

	/** A vault link opens its note; another link goes to the OS only for http, https, mailto and obsidian. */
	private onLinkClick(evt: MouseEvent): void {
		// Left and middle click only; right-click stays Obsidian's context menu.
		if (evt.button !== 0 && evt.button !== 1) return;
		const anchor = linkAnchor(evt);
		if (!anchor) return;
		const linktext = internalLinktext(anchor);
		if (linktext) {
			evt.preventDefault();
			// A bare heading link has no note to open from the messages.
			if (linktext.startsWith("#")) return;
			const resolved = this.resolveLinktext(linktext);
			if (!resolved) {
				new Notice(`No file in this vault matches "${linktext}".`);
				return;
			}
			const newLeaf = evt.button === 1 ? "tab" : Keymap.isModEvent(evt);
			void this.source.app.workspace.openLinkText(resolved, "", newLeaf);
			return;
		}
		// Cancelled first: a `file:` link or an unknown scheme opens nothing.
		evt.preventDefault();
		const href = anchor.getAttribute("href") ?? "";
		if (opensInOs(href)) window.open(href, "_blank");
	}

	/** Feeds the "Page preview" core plugin, so vault links preview on hover. */
	private onLinkHover(evt: MouseEvent): void {
		const anchor = linkAnchor(evt);
		const linktext = anchor && internalLinktext(anchor);
		if (!anchor || !linktext) return;
		const resolved = this.resolveLinktext(linktext);
		if (!resolved) return;
		this.source.app.workspace.trigger("hover-link", {
			event: evt,
			source: this.source.hoverSource,
			hoverParent: this.source.hoverParent,
			targetEl: anchor,
			linktext: resolved,
			sourcePath: "",
		});
	}

	/**
	 * A link target from a reply as a vault file, or null if it hits nothing.
	 * Resolving up front matters: `openLinkText` on an unresolved target
	 * offers to create the note, and a stray click should not.
	 */
	private resolveLinktext(linktext: string): string | null {
		const { path, subpath } = parseLinktext(linktext);
		if (!path) return null;
		for (const candidate of pathCandidates(path)) {
			// The heading half is matched against the note's text, so it wants
			// the decoded form ("#My%20Heading" resolves to nothing).
			if (this.source.app.metadataCache.getFirstLinkpathDest(candidate, "")) return candidate + safeDecode(subpath);
		}
		return null;
	}
}

/** The link an event hit, from any element inside it (SVG and MathML too); `instanceOf` holds for nodes of a pop-out window. */
function linkAnchor(evt: Event): HTMLAnchorElement | null {
	const target = evt.target as Node | null;
	return target && typeof target.instanceOf === "function" && target.instanceOf(Element) ? target.closest("a") : null;
}

/** The vault target of a rendered link, or null if it points outside. */
function internalLinktext(anchor: HTMLAnchorElement): string | null {
	if (anchor.dataset.href) return anchor.dataset.href;
	const href = anchor.getAttribute("href");
	return href && anchor.classList.contains("internal-link") ? href : null;
}

/**
 * Shapes a vault path arrives in: as written, percent-decoded (how Obsidian
 * escapes its own Markdown links), and without a leading slash.
 */
function pathCandidates(path: string): string[] {
	const forms = new Set<string>();
	for (const base of [path, safeDecode(path)]) {
		forms.add(base);
		forms.add(base.replace(/^\/+/, ""));
	}
	return [...forms].filter(Boolean);
}

function safeDecode(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path; // A stray '%' - not percent-encoding after all.
	}
}
