import { Component, type Events } from "obsidian";
import {
	stripOverflows,
	stripOrder,
	tabCard,
	tabItem,
	type TabCardInput,
	type TabSummary,
} from "../state/tabs";
import type { Ticker } from "../state/ticker";
import {
	drawTabCard,
	hiddenText,
	iconButton,
	onRowMenu,
	rovingTarget,
	syncChildren,
	TickingCards,
	writeAttr,
	writeClass,
	writeGlyph,
	writeIcon,
	writeText,
	writeTooltip,
	type AttachHoverCard,
	type HoverCardHandle,
} from "./dom";
import type { ResizeMeasure, ResizePass } from "./shell";

/** A dragged tab within this distance of an edge scrolls the strip (px). */
const DRAG_EDGE_PX = 28;
const DRAG_SCROLL_PX = 12;
/** An edge's fade past the list's padding (px; styles.css `.is-fade-start`, `.is-fade-end`). */
const FADE_GRADIENT_PX = 20;

export interface TabStripSource {
	/** The view's events: `tabs` and `active`. */
	viewEvents: Events;
	/** The open tabs in drag order. */
	tabs: () => readonly TabSummary[];
	activeKey: () => number | null;
	/** What a tab's hover card shows; null once it closed. */
	card: (key: number) => TabCardInput | null;
	ticker: Ticker;
	resizePass: ResizePass;
}

export interface TabStripIntents {
	onSelect: (key: number) => void;
	onClose: (key: number) => void;
	/** "All conversations" was activated: the open-tabs list opens from `trigger`. */
	onOpenTabsList: (trigger: HTMLElement) => void;
	/** The unpinned tabs shown, in their order after a drop. */
	onReorder: (keys: number[]) => void;
	/** The row menu the column offers, for a tab (right-click, Shift+F10, a touch hold), parented to `tabEl`. */
	onMenu: (key: number, x: number, y: number, tabEl: HTMLElement) => void;
	attachHoverCard: AttachHoverCard;
}

interface Item {
	el: HTMLElement;
	glyphEl: HTMLElement;
	titleEl: HTMLElement;
	nameEl: HTMLElement;
	closeEl: HTMLElement;
	card: HoverCardHandle;
	pinned: boolean;
}

/** What a pass read, for its write. */
interface StripFit {
	/** The strip is laid out: below 360 px the switcher replaces it. */
	shown: boolean;
	/** The tabs overflow: the "All conversations" control shows. */
	overflows: boolean;
	fadeStart: boolean;
	fadeEnd: boolean;
	/** Where to scroll so the active tab shows; null to stay. */
	scrollLeft: number | null;
}

let nextStripId = 0;

/**
 * The tab strip (DES-003 Tabs and conversation column): a `tablist` of the
 * open tabs, pinned first, each with its pin or state dot, title and close
 * button; drag to reorder the unpinned ones; while the tabs overflow,
 * Obsidian's tab-list control at its end, a chevron whose menu lists every
 * tab. Fit and scrolling the active tab into view run in `ui/shell`'s
 * resize pass. It is drawn on Obsidian's tab header markup under
 * `.ai-agent-panel-board` (ADR-017 Tabs); the list between Obsidian's
 * container and its tabs scrolls, since the main area clips Obsidian's own
 * scroller.
 */
export class TabStrip extends Component implements ResizeMeasure {
	private readonly rootEl: HTMLElement;
	private readonly listEl: HTMLElement;
	private readonly tabListEl: HTMLElement;
	private readonly items = new Map<number, Item>();
	private readonly id = `ai-agent-panel-tabs-${++nextStripId}`;
	/** The tab with `tabindex="0"`: the active one, or the one the arrows moved to. */
	private focusKey: number | null = null;
	private dragged: { key: number; el: HTMLElement } | null = null;
	private dropped = false;
	/** The next pass scrolls the active tab into view. */
	private reveal = true;
	private fit: StripFit = {
		shown: false,
		overflows: false,
		fadeStart: false,
		fadeEnd: false,
		scrollLeft: null,
	};
	private tabListShown = false;
	private readonly cards: TickingCards;

	constructor(
		parent: HTMLElement,
		private readonly source: TabStripSource,
		private readonly intents: TabStripIntents
	) {
		super();
		this.rootEl = parent.createDiv({ cls: "ai-agent-panel-board" });
		const containerEl = this.rootEl.createDiv({ cls: "workspace-tab-header-container" });
		const innerEl = containerEl.createDiv({ cls: "workspace-tab-header-container-inner" });
		this.listEl = innerEl.createDiv({ cls: "ai-agent-panel-tab-list", attr: { role: "tablist" } });
		// In the root: the list's children are its tabs only.
		hiddenText(this.listEl, "aria-labelledby", "Conversations", this.rootEl);
		// Obsidian's tab-list control, after the tabs as in a tab group's header.
		this.tabListEl = containerEl.createDiv({ cls: "workspace-tab-header-tab-list" });
		const tabListButton = iconButton(
			this,
			this.tabListEl,
			"chevron-down",
			"All conversations",
			() => intents.onOpenTabsList(tabListButton),
			"bottom"
		);
		tabListButton.addClass("mod-tab-list");
		tabListButton.setAttribute("aria-haspopup", "dialog");
		tabListButton.setAttribute("aria-expanded", "false");
		this.tabListEl.toggle(false);
		this.cards = new TickingCards(this, source.ticker, intents.attachHoverCard);
	}

	onload(): void {
		this.registerEvent(this.source.viewEvents.on("tabs", () => this.render()));
		this.registerEvent(
			this.source.viewEvents.on("active", () => {
				this.focusKey = null;
				this.reveal = true;
				this.render();
			})
		);
		this.register(this.source.resizePass.addMeasure(this));
		this.register(() => {
			for (const item of this.items.values()) item.card.detach();
			this.items.clear();
			this.rootEl.remove();
		});
		// A vertical wheel scrolls the strip sideways while it can move.
		this.registerDomEvent(
			this.listEl,
			"wheel",
			(evt) => {
				const delta = Math.abs(evt.deltaY) > Math.abs(evt.deltaX) ? evt.deltaY : evt.deltaX;
				const max = this.listEl.scrollWidth - this.listEl.clientWidth;
				const next = Math.max(0, Math.min(max, this.listEl.scrollLeft + delta));
				if (max <= 0 || next === this.listEl.scrollLeft) return;
				evt.preventDefault();
				this.listEl.scrollLeft = next;
			},
			{ passive: false }
		);
		this.registerDomEvent(this.listEl, "scroll", () => this.source.resizePass.requestPass());
		// A tab dragged near either edge keeps the hidden tabs coming.
		this.registerDomEvent(this.listEl, "dragover", (evt) => {
			if (!this.dragged) return;
			const rect = this.listEl.getBoundingClientRect();
			if (evt.clientX < rect.left + DRAG_EDGE_PX) this.listEl.scrollLeft -= DRAG_SCROLL_PX;
			else if (evt.clientX > rect.right - DRAG_EDGE_PX) this.listEl.scrollLeft += DRAG_SCROLL_PX;
		});
		this.registerDomEvent(this.listEl, "keydown", (evt) => this.onKeyDown(evt));
		this.render();
	}

	// --- Rendering -------------------------------------------------------------------

	private render(): void {
		// A render during a drag would lose the drop; the drag's end renders.
		if (this.dragged) return;
		const tabs = stripOrder(this.source.tabs());
		const active = this.source.activeKey();
		// A focused tab that closes (Delete) hands focus to the tab now in its place.
		const order = this.domOrder();
		const focusedAt = order.findIndex((key) => this.items.get(key)?.el === this.listEl.doc.activeElement);
		const lostAt = focusedAt >= 0 && !tabs.some((tab) => tab.key === order[focusedAt]) ? focusedAt : -1;
		if (lostAt >= 0) this.focusKey = null;
		if (this.focusKey === null || !tabs.some((tab) => tab.key === this.focusKey))
			this.focusKey = lostAt >= 0 ? (tabs[Math.min(lostAt, tabs.length - 1)]?.key ?? active) : active;
		const shown = new Set<number>();
		const elements = tabs.map((tab) => {
			shown.add(tab.key);
			const item = this.items.get(tab.key) ?? this.createItem(tab.key);
			this.drawItem(item, tab, tab.key === active);
			return item.el;
		});
		for (const [key, item] of this.items) {
			if (shown.has(key)) continue;
			item.card.detach();
			this.items.delete(key);
		}
		syncChildren(this.listEl, elements);
		if (lostAt >= 0 && this.focusKey !== null) this.items.get(this.focusKey)?.el.focus();
		this.cards.refresh();
		this.source.resizePass.requestPass();
	}

	private drawItem(item: Item, tab: TabSummary, active: boolean): void {
		const view = tabItem(tab);
		item.pinned = tab.pinned;
		writeClass(item.el, "is-active", active);
		writeClass(item.el, "is-pinned", tab.pinned);
		writeAttr(item.el, "aria-selected", String(active));
		writeAttr(item.el, "tabindex", tab.key === this.focusKey ? "0" : "-1");
		writeAttr(item.el, "draggable", String(!tab.pinned));
		writeAttr(item.el, "data-state", view.state);
		writeGlyph(item.glyphEl, view.glyph, view.glyphTitle, "bottom");
		writeText(item.titleEl, view.title);
		writeText(item.nameEl, view.label);
		writeTooltip(item.closeEl, `Close ${view.title}`, "bottom");
	}

	private createItem(key: number): Item {
		const nameId = `${this.id}-${key}`;
		const el = createDiv({
			cls: "workspace-tab-header",
			attr: { role: "tab", tabindex: "-1", "aria-selected": "false", "aria-labelledby": nameId, "data-key": String(key) },
		});
		const innerEl = el.createDiv({ cls: "workspace-tab-header-inner" });
		// The pin or the state dot leads, as on the board.
		const iconEl = innerEl.createDiv({ cls: "workspace-tab-header-inner-icon" });
		const glyphEl = iconEl.createSpan({ cls: "ai-agent-panel-tab-glyph" });
		const titleEl = innerEl.createDiv({ cls: "workspace-tab-header-inner-title", attr: { "aria-hidden": "true" } });
		// Change 003's agent badge goes here (DES-003 Seams for changes 002 and 003).
		innerEl.createDiv({ cls: "workspace-tab-header-status-container" });
		const closeEl = innerEl.createEl("button", {
			cls: "workspace-tab-header-inner-close-button",
			attr: { type: "button", tabindex: "-1" },
		});
		const nameEl = el.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: nameId } });
		writeIcon(closeEl, "x");
		el.addEventListener("click", () => this.intents.onSelect(key));
		// Middle-click closes, as in the editor's tab bar; the mousedown guard
		// stops the browser's autoscroll before auxclick arrives.
		el.addEventListener("mousedown", (evt) => {
			if (evt.button === 1) evt.preventDefault();
		});
		el.addEventListener("auxclick", (evt) => {
			if (evt.button !== 1) return;
			evt.preventDefault();
			this.intents.onClose(key);
		});
		closeEl.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.intents.onClose(key);
		});
		onRowMenu(el, (x, y) => this.intents.onMenu(key, x, y, el));
		this.makeDraggable(el, key);
		const item: Item = {
			el,
			glyphEl,
			titleEl,
			nameEl,
			closeEl,
			pinned: false,
			// Down from the top region (DES-003 Popovers).
			card: this.cards.attach(
				el,
				(cardEl) => {
					const input = this.source.card(key);
					if (input) drawTabCard(cardEl, tabCard(input, Date.now()));
				},
				"down"
			),
		};
		this.items.set(key, item);
		return item;
	}

	/** The tabs' keys in the strip's DOM order, which a drag changes before the order does. */
	private domOrder(): number[] {
		return Array.from(this.listEl.children, (el) => Number((el as HTMLElement).dataset.key));
	}

	// --- Keyboard --------------------------------------------------------------------

	/** Left, Right, Home and End move; Enter or Space selects; Delete closes (DES-003). */
	private onKeyDown(evt: KeyboardEvent): void {
		const keys = this.domOrder();
		const at = keys.findIndex((key) => this.items.get(key)?.el === evt.target);
		if (at < 0) return;
		const key = keys[at];
		if (evt.key === "Enter" || evt.key === " ") {
			evt.preventDefault();
			this.intents.onSelect(key);
			return;
		}
		if (evt.key === "Delete") {
			evt.preventDefault();
			this.intents.onClose(key);
			return;
		}
		if (evt.key === "ArrowUp" || evt.key === "ArrowDown") return;
		const next = rovingTarget(evt, this.listEl, at, keys.length - 1);
		if (next === null) return;
		evt.preventDefault();
		this.focusKey = keys[next];
		for (const [itemKey, item] of this.items) writeAttr(item.el, "tabindex", itemKey === this.focusKey ? "0" : "-1");
		this.items.get(this.focusKey)?.el.focus();
	}

	// --- Drag ------------------------------------------------------------------------

	/**
	 * HTML5 drag among the unpinned tabs: the dragged element moves live as
	 * the pointer crosses a tab's middle, and the order is reported on drop.
	 */
	private makeDraggable(el: HTMLElement, key: number): void {
		el.addEventListener("dragstart", (evt) => {
			this.dragged = { key, el };
			this.dropped = false;
			el.addClass("is-dragging");
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = "move";
				// Some platforms start no drag without data.
				evt.dataTransfer.setData("text/plain", String(key));
			}
		});
		// Entering an unpinned tab makes it the drop target (HTML's drag-and-drop model).
		el.addEventListener("dragenter", (evt) => {
			if (this.dragged && !this.items.get(key)?.pinned) evt.preventDefault();
		});
		el.addEventListener("dragover", (evt) => {
			const dragged = this.dragged;
			if (!dragged || this.items.get(key)?.pinned) return;
			// The dragged tab itself, under the pointer once it moved, takes the drop too.
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
			if (dragged.el === el) return;
			const rect = el.getBoundingClientRect();
			const rtl = this.listEl.closest(".mod-rtl") !== null;
			const before = (evt.clientX < rect.left + rect.width / 2) !== rtl;
			this.listEl.insertBefore(dragged.el, before ? el : el.nextElementSibling);
		});
		el.addEventListener("drop", (evt) => {
			evt.preventDefault();
			this.dropped = true;
		});
		el.addEventListener("dragend", () => {
			el.removeClass("is-dragging");
			const dropped = this.dropped;
			this.dragged = null;
			this.dropped = false;
			if (dropped) this.intents.onReorder(this.domOrder().filter((itemKey) => !this.items.get(itemKey)?.pinned));
			// A cancelled drag left the element where dragover put it; the
			// render puts every tab back where the order says.
			this.render();
		});
	}

	// --- Resize pass -----------------------------------------------------------------

	read(): void {
		const list = this.listEl;
		const max = list.scrollWidth - list.clientWidth;
		const overflows = stripOverflows(list.scrollWidth, list.clientWidth);
		let scrollLeft: number | null = null;
		const active = this.source.activeKey();
		const activeEl = active === null ? null : this.items.get(active)?.el;
		if (this.reveal && overflows && activeEl?.isConnected) {
			// Clear of the fades: the list's padding and the gradient past it; the ends have none.
			const fade = (Number.parseFloat(list.win.getComputedStyle(list).paddingInlineEnd) || 0) + FADE_GRADIENT_PX;
			const listRect = list.getBoundingClientRect();
			const tabRect = activeEl.getBoundingClientRect();
			if (tabRect.left < listRect.left + fade) scrollLeft = list.scrollLeft - (listRect.left + fade - tabRect.left);
			else if (tabRect.right > listRect.right - fade)
				scrollLeft = list.scrollLeft + (tabRect.right - (listRect.right - fade));
			if (scrollLeft !== null) scrollLeft = Math.max(0, Math.min(max, scrollLeft));
		}
		const offset = scrollLeft ?? list.scrollLeft;
		this.fit = {
			shown: list.isShown(),
			overflows,
			fadeStart: overflows && offset > 1,
			fadeEnd: overflows && offset < max - 1,
			scrollLeft,
		};
	}

	write(): void {
		const fit = this.fit;
		const revealing = this.reveal;
		// A hidden strip measures 0 and keeps the reveal for when it shows.
		if (fit.shown) this.reveal = false;
		if (fit.scrollLeft !== null) this.listEl.scrollLeft = fit.scrollLeft;
		// A hidden strip measures nothing; the control stays as it was.
		if (fit.shown && this.tabListShown !== fit.overflows) {
			this.tabListShown = fit.overflows;
			this.tabListEl.toggle(fit.overflows);
			// The list's width just changed: reveal the active tab again beside the control.
			if (revealing) {
				this.reveal = true;
				this.source.resizePass.requestPass();
			}
		}
		writeClass(this.listEl, "is-fade-start", fit.fadeStart);
		writeClass(this.listEl, "is-fade-end", fit.fadeEnd);
	}
}
