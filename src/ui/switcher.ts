import { Component, type Events } from "obsidian";
import { focusAfterClose, openTabsList, switcherLabel, tabItem, type TabSummary } from "../state/tabs";
import {
	conversationRow,
	drawOpenRow,
	hiddenText,
	rovingFocus,
	writeAttr,
	writeIcon,
	writeText,
	type PopoverContent,
	type PopoverFocus,
	type PopoverShell,
} from "./dom";

export interface SwitcherSource {
	/** The view's events: `tabs` and `active`. */
	viewEvents: Events;
	/** The open tabs in drag order. */
	tabs: () => readonly TabSummary[];
	activeKey: () => number | null;
}

export interface SwitcherIntents {
	onOpenTabsList: (trigger: HTMLElement) => void;
}

let nextSwitcherId = 0;

/**
 * The switcher (PRD-001.R30): below a 360 px main column in strip layout,
 * a button with the active conversation's state dot, title and the open
 * count, opening the open-tabs list. Which of it and the strip shows is a
 * container query.
 */
export class Switcher extends Component {
	private readonly buttonEl: HTMLButtonElement;
	private readonly dotEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly countEl: HTMLElement;
	private readonly labelEl: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly source: SwitcherSource,
		intents: SwitcherIntents
	) {
		super();
		const labelId = `ai-agent-panel-switcher-${++nextSwitcherId}`;
		this.buttonEl = parent.createEl("button", {
			cls: "ai-agent-panel-switcher",
			attr: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-labelledby": labelId },
		});
		this.labelEl = this.buttonEl.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: labelId } });
		this.dotEl = this.buttonEl.createSpan({ cls: "ai-agent-panel-tab-glyph", attr: { "aria-hidden": "true" } });
		this.titleEl = this.buttonEl.createSpan({ cls: "ai-agent-panel-switcher-title", attr: { "aria-hidden": "true" } });
		writeIcon(this.buttonEl.createSpan({ cls: "ai-agent-panel-switcher-chevron", attr: { "aria-hidden": "true" } }), "chevron-down");
		this.countEl = this.buttonEl.createSpan({ cls: "ai-agent-panel-switcher-count", attr: { "aria-hidden": "true" } });
		this.registerDomEvent(this.buttonEl, "click", () => intents.onOpenTabsList(this.buttonEl));
	}

	onload(): void {
		this.register(() => this.buttonEl.remove());
		this.registerEvent(this.source.viewEvents.on("tabs", () => this.render()));
		this.registerEvent(this.source.viewEvents.on("active", () => this.render()));
		this.render();
	}

	private render(): void {
		const tabs = this.source.tabs();
		const activeKey = this.source.activeKey();
		const active = tabs.find((tab) => tab.key === activeKey);
		const view = active ? tabItem({ ...active, pinned: false }) : null;
		writeAttr(this.dotEl, "data-glyph", view?.glyph ?? "none");
		writeAttr(this.buttonEl, "data-state", view?.state ?? "none");
		writeText(this.titleEl, view?.title ?? "");
		writeText(this.countEl, String(tabs.length));
		writeText(this.labelEl, switcherLabel(tabs.length));
	}
}

export interface OpenTabsListIntents {
	onSelect: (key: number) => void;
	/** Closes a tab, after the confirmation rule; the list redraws on `tabs`. */
	onClose: (key: number) => void;
	onHistory: () => void;
}

let nextRowId = 0;

/**
 * "Open conversations" (PRD-001.R7, R30): every open tab as the conversation
 * column's open row, pinned first, the active one marked, then "Previous
 * conversations…". The view opens it from the switcher and from the strip's
 * All conversations; it redraws while open as the tabs change, keeping focus
 * on the same tab, or on the row that took a closed tab's place.
 */
export class OpenTabsList extends Component implements PopoverContent {
	readonly title = "Open conversations";
	readonly menu = true;
	/** True while the list closes a tab itself: closing the active row switches tabs, and the list stays open (PRD-001.R7). */
	private closing = false;
	get keepOpenOnTabChange(): boolean {
		return this.closing;
	}

	/** What the list last drew, so a `tabs` event that changes nothing redraws nothing. */
	private drawn = "";
	/** The tab keys of the rows now drawn, in order. */
	private keys: number[] = [];
	/** The rows' main buttons, in order. */
	private mains: HTMLButtonElement[] = [];
	/** The current drawing's listeners, released when it is redrawn. */
	private drawing: Component | null = null;

	constructor(
		private readonly source: SwitcherSource,
		private readonly intents: OpenTabsListIntents
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus {
		const listEl = el.createDiv({ cls: "ai-agent-panel-open-tabs", attr: { role: "list" } });
		// In the body: the list's children are its rows only.
		hiddenText(listEl, "aria-labelledby", "Open conversations", el);
		const footer = shell.footer();
		const history = footer.createEl("button", {
			cls: "ai-agent-panel-text-button",
			attr: { type: "button" },
			text: "Previous conversations…",
		});
		this.registerDomEvent(history, "click", () => {
			picked();
			this.intents.onHistory();
		});
		this.registerDomEvent(listEl, "keydown", (evt) => this.onKeyDown(evt, listEl));
		this.registerEvent(this.source.viewEvents.on("tabs", () => this.draw(listEl, picked)));
		this.registerEvent(this.source.viewEvents.on("active", () => this.draw(listEl, picked)));
		return { first: this.draw(listEl, picked) };
	}

	private close(key: number): void {
		this.closing = true;
		try {
			this.intents.onClose(key);
		} finally {
			this.closing = false;
		}
	}

	/** Up, Down, Home and End move between rows; Delete closes the focused row's tab. */
	private onKeyDown(evt: KeyboardEvent, listEl: HTMLElement): void {
		const at = this.mains.findIndex((main) => main === evt.target);
		if (at < 0) return;
		if (evt.key === "Delete") {
			evt.preventDefault();
			this.close(this.keys[at]);
			return;
		}
		rovingFocus(evt, listEl, this.mains, at, true);
	}

	/** The rows; returns the control focus goes to: the active row's, else the first. */
	private draw(listEl: HTMLElement, picked: () => void): HTMLButtonElement | null {
		const rows = openTabsList(this.source.tabs(), this.source.activeKey());
		const drawn = JSON.stringify(rows);
		if (drawn === this.drawn) return null;
		this.drawn = drawn;
		// No `instanceof`: a pop-out window's elements fail the main window's.
		const focused = listEl.doc.activeElement as HTMLElement | null;
		const focusedKey = focused && listEl.contains(focused) ? Number(focused.closest<HTMLElement>("[data-key]")?.dataset.key) : null;
		const before = this.keys;
		listEl.empty();
		if (this.drawing) this.removeChild(this.drawing);
		const drawing = (this.drawing = this.addChild(new Component()));
		this.keys = rows.map((row) => row.key);
		this.mains = rows.map((row) => {
			const rowEls = conversationRow({ nameId: `ai-agent-panel-open-tab-${++nextRowId}`, time: false, pin: false, close: true });
			rowEls.el.dataset.key = String(row.key);
			rowEls.mainEl.setAttribute("tabindex", "-1");
			drawOpenRow(rowEls, row.item, row.active);
			drawing.registerDomEvent(rowEls.mainEl, "click", () => {
				picked();
				this.intents.onSelect(row.key);
			});
			if (rowEls.closeEl) drawing.registerDomEvent(rowEls.closeEl, "click", () => this.close(row.key));
			listEl.appendChild(rowEls.el);
			return rowEls.mainEl;
		});
		const target = this.mains[Math.max(0, rows.findIndex((row) => row.active))] ?? null;
		const keep = focusedKey === null || Number.isNaN(focusedKey) ? null : focusAfterClose(before, this.keys, focusedKey);
		const kept = keep === null ? undefined : this.mains[this.keys.findIndex((key) => key === keep)];
		// Exactly one tab stop: the row that has focus, else the active row.
		const stop = kept ?? target;
		for (const main of this.mains) main.setAttribute("tabindex", main === stop ? "0" : "-1");
		kept?.focus();
		return target;
	}
}
