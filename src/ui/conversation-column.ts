import { Component, Menu, type Events } from "obsidian";
import {
	columnEntries,
	columnKey,
	emptyRecentText,
	groupConversations,
	type ConversationEntry,
	type ConversationSections,
	type StoredSummary,
} from "../conversation-list";
import { tabCard, tabItem, type TabCardInput, type TabSummary } from "../state/tabs";
import type { Ticker } from "../state/ticker";
import {
	conversationRow,
	drawOpenRow,
	drawTabCard,
	hiddenText,
	iconButton,
	onRowMenu,
	syncChildren,
	TickingCards,
	writeAttr,
	writeClass,
	writeGlyph,
	writeIcon,
	writeText,
	writeTooltip,
	type AttachHoverCard,
	type ConversationRowEls,
	type HoverCardHandle,
} from "./dom";

/** An open tab as the column lists it: its stored conversation's id and time, null before one is saved. */
export type ColumnOpenTab = TabSummary & { id: string | null; updatedAt: number | null };

export interface ColumnSource {
	/** The view's events: `tabs`, `active` and `history`. */
	viewEvents: Events;
	/** The open tabs in drag order. */
	tabs: () => readonly ColumnOpenTab[];
	activeKey: () => number | null;
	/** The history store's snapshot of stored conversations. */
	stored: () => readonly StoredSummary[];
	/** The history store's first scan has finished. */
	scanned: () => boolean;
	relativeTime: (time: number) => string;
	/** The collapsed sections stored on this device (DES-005), unparsed. */
	loadCollapsed: () => unknown;
	saveCollapsed: (keys: string[]) => void;
	/** What an open tab's hover card shows; null once it closed. */
	card: (key: number) => TabCardInput | null;
	ticker: Ticker;
}

/** A row the menu acts on: an open tab (`key`), a stored conversation (`id`), or both. */
export interface RowTarget {
	key: number | null;
	id: string | null;
	pinned: boolean;
}

/** The row menu's entries (PRD-001.R9). */
export interface RowMenuIntents {
	onOpenStored: (id: string) => void;
	/** An open tab's own conversation, created for a fresh tab, or a stored one. */
	onPin: (target: RowTarget, pinned: boolean) => void;
	/** Asks for a new title; an open tab's own conversation, created for a fresh tab, or a stored one. */
	onRename: (target: RowTarget) => void;
	onExport: (id: string) => void;
	onClose: (key: number) => void;
	onDelete: (id: string) => void;
	/** The menu shows or goes: a hover card neither shows nor arms meanwhile. */
	onMenuShow: () => void;
	onMenuHide: () => void;
}

export interface ColumnIntents extends RowMenuIntents {
	onSelect: (key: number) => void;
	onNew: () => void;
	/** The unpinned open tabs shown, in their order after a drop. */
	onReorder: (keys: number[]) => void;
	attachHoverCard: AttachHoverCard;
}

/** The row menu on screen. `onRowMenu` stops the `contextmenu` event, so nothing else closes it before another opens. A replaced menu's late hide (phone) no longer lifts the hover-card block. */
let openRowMenu: Menu | null = null;

/**
 * The row menu (PRD-001.R9): Open (stored rows), Pin or Unpin, Rename…, Export to
 * Markdown, Close (open rows) and Delete. The view also opens it for a tab
 * of the strip, parented to the tab: Obsidian's menu then gives it
 * `has-active-menu` while it shows. At most one is open: a new one replaces it.
 */
export function showRowMenu(
	doc: Document,
	x: number,
	y: number,
	row: RowTarget,
	intents: RowMenuIntents,
	parentEl?: HTMLElement
): void {
	const { key, id } = row;
	openRowMenu?.hide();
	const menu = new Menu();
	if (key === null && id !== null)
		menu.addItem((item) => item.setTitle("Open").setIcon("message-square").onClick(() => intents.onOpenStored(id)));
	menu.addItem((item) =>
		item
			.setTitle(row.pinned ? "Unpin" : "Pin")
			.setIcon(row.pinned ? "pin-off" : "pin")
			.onClick(() => intents.onPin(row, !row.pinned))
	);
	menu.addItem((item) => item.setTitle("Rename…").setIcon("pencil").onClick(() => intents.onRename(row)));
	if (id !== null)
		menu.addItem((item) => item.setTitle("Export to Markdown").setIcon("file-down").onClick(() => intents.onExport(id)));
	if (key !== null) menu.addItem((item) => item.setTitle("Close").setIcon("x").onClick(() => intents.onClose(key)));
	if (id !== null) {
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Delete").setIcon("trash-2").onClick(() => intents.onDelete(id)));
	}
	if (parentEl) menu.setParentElement(parentEl);
	menu.onHide(() => {
		if (openRowMenu !== menu) return;
		openRowMenu = null;
		intents.onMenuHide();
	});
	openRowMenu = menu;
	intents.onMenuShow();
	menu.showAtPosition({ x, y }, doc);
}

type SectionKey = "pinned" | "open" | "recent";
const SECTION_KEYS: readonly SectionKey[] = ["pinned", "open", "recent"];

interface Section {
	el: HTMLElement;
	headerEl: HTMLElement;
	countEl: HTMLElement;
	bodyEl: HTMLElement;
}

interface Row extends ConversationRowEls {
	timeEl: HTMLElement;
	pinEl: HTMLElement;
	/** A stored row's description, "Last active <time>"; null for an open row. */
	lastActiveEl: HTMLElement | null;
	/** The open tab it shows, which is its identity; null for a stored conversation. */
	tabKey: number | null;
	/** The entry it shows, as of the last layout. */
	entry: ConversationEntry;
	card: HoverCardHandle | null;
}

let nextColumnId = 0;

/**
 * The conversation column (DES-003 Tabs and conversation column): a filter,
 * "+", and every conversation once under Pinned, Open and Recent
 * (PRD-001.R9) as keyed rows; collapse kept on this device; the row menu,
 * the hover pin, drag order in Open. An unchanged key writes nothing.
 */
export class ConversationColumn extends Component {
	private readonly rootEl: HTMLElement;
	private readonly filterEl: HTMLInputElement;
	private readonly listEl: HTMLElement;
	private readonly sections = new Map<SectionKey, Section>();
	private readonly groups = new Map<string, { el: HTMLElement; listEl: HTMLElement }>();
	private readonly emptyEl: HTMLElement;
	/** Rows by `o<tab key>` for open tabs, `s<id>` for stored conversations. */
	private readonly rows = new Map<string, Row>();
	private readonly cards: TickingCards;
	private readonly id = `ai-agent-panel-column-${++nextColumnId}`;
	private filter = "";
	private collapsed = new Set<SectionKey>();
	private key: string | null = null;
	/** The open tabs as of the last render, which open rows read by index. */
	private tabs: readonly ColumnOpenTab[] = [];
	private dragged: HTMLElement | null = null;
	private dropped = false;

	constructor(
		parent: HTMLElement,
		private readonly source: ColumnSource,
		private readonly intents: ColumnIntents
	) {
		super();
		this.rootEl = parent.createEl("nav", { cls: "ai-agent-panel-conversation-column" });
		hiddenText(this.rootEl, "aria-labelledby", "Conversations");
		const top = this.rootEl.createDiv({ cls: "ai-agent-panel-column-top" });
		const filter = top.createDiv({ cls: "ai-agent-panel-column-filter" });
		writeIcon(filter.createSpan({ cls: "ai-agent-panel-column-filter-icon", attr: { "aria-hidden": "true" } }), "search");
		const filterId = `${this.id}-filter`;
		filter.createEl("label", { cls: "ai-agent-panel-visually-hidden", text: "Filter conversations by title", attr: { for: filterId } });
		this.filterEl = filter.createEl("input", { attr: { type: "text", placeholder: "Filter…", id: filterId } });
		iconButton(this, top, "plus", "New conversation", () => intents.onNew(), "bottom");
		this.listEl = this.rootEl.createDiv({ cls: "ai-agent-panel-column-list" });
		this.emptyEl = createDiv({ cls: "ai-agent-panel-column-empty" });
		this.cards = new TickingCards(this, source.ticker, intents.attachHoverCard);
	}

	onload(): void {
		const stored = this.source.loadCollapsed();
		if (Array.isArray(stored))
			this.collapsed = new Set(stored.filter((key): key is SectionKey => SECTION_KEYS.includes(key as SectionKey)));
		this.registerEvent(this.source.viewEvents.on("tabs", () => this.render()));
		this.registerEvent(this.source.viewEvents.on("history", () => this.render()));
		this.registerEvent(
			this.source.viewEvents.on("active", () => {
				this.render();
				this.revealActive();
			})
		);
		this.registerDomEvent(this.filterEl, "input", () => {
			this.filter = this.filterEl.value;
			this.render();
		});
		this.registerDomEvent(this.filterEl, "keydown", (evt) => {
			// Escape clears the inline filter; there is nothing to dismiss.
			if (evt.key !== "Escape" || evt.isComposing) return;
			evt.preventDefault();
			evt.stopPropagation();
			this.clearFilter();
		});
		this.register(() => {
			for (const row of this.rows.values()) row.card?.detach();
			this.rows.clear();
			this.rootEl.remove();
		});
		this.render();
		this.revealActive();
	}

	/** "New conversation" clears the filter, so the new tab shows (PRD-001.R7). */
	clearFilter(): void {
		if (!this.filter && !this.filterEl.value) return;
		this.filterEl.value = "";
		this.filter = "";
		this.render();
	}

	// --- Rendering -------------------------------------------------------------------

	private render(): void {
		// A render during a drag would lose the drop; the drag's end renders.
		if (this.dragged) return;
		const now = Date.now();
		this.tabs = this.source.tabs();
		const sections = groupConversations(columnEntries(this.tabs, this.source.stored(), now), now, this.filter);
		const key = columnKey(sections, {
			filter: this.filter,
			collapsed: [...this.collapsed],
			scanned: this.source.scanned(),
			now,
			openKeys: this.tabs.map((tab) => tab.key),
		});
		if (key !== this.key) {
			this.key = key;
			this.layout(sections);
		}
		// Activity and the active row are not in the key: set-if-changed writes.
		const active = this.source.activeKey();
		for (const row of this.rows.values()) this.drawOpenState(row, active);
		this.cards.refresh();
	}

	/** Sections, groups and rows in order, reusing every element whose key stays. */
	private layout(sections: ConversationSections): void {
		const used = new Set<string>();
		const rowsOf = (entries: readonly ConversationEntry[]): HTMLElement[] =>
			entries.flatMap((entry) => {
				const row = this.row(entry);
				if (!row) return [];
				used.add(this.rowKey(entry) ?? "");
				return [row.el];
			});
		const shown: HTMLElement[] = [];
		if (sections.pinned.length > 0) shown.push(this.section("pinned", "Pinned", null, rowsOf(sections.pinned)));
		shown.push(this.section("open", "Open", sections.open.length, rowsOf(sections.open)));
		let recent: HTMLElement[];
		if (sections.recent.length === 0) {
			writeText(this.emptyEl, emptyRecentText(sections, this.filter, this.source.scanned()));
			recent = [this.emptyEl];
		} else
			recent = sections.recent.map((group) => {
				const els = this.group(group.label);
				syncChildren(els.listEl, rowsOf(group.entries));
				return els.el;
			});
		shown.push(this.section("recent", "Recent", null, recent));
		syncChildren(this.listEl, shown);
		for (const [key, row] of this.rows) {
			if (used.has(key)) continue;
			row.card?.detach();
			row.el.remove();
			this.rows.delete(key);
		}
	}

	private section(key: SectionKey, label: string, count: number | null, children: HTMLElement[]): HTMLElement {
		let section = this.sections.get(key);
		if (!section) {
			const el = createDiv({ cls: `ai-agent-panel-column-section mod-${key}` });
			const headerEl = el.createEl("button", {
				cls: "ai-agent-panel-column-section-header",
				attr: { type: "button", "aria-expanded": "true" },
			});
			writeIcon(headerEl.createSpan({ cls: "ai-agent-panel-column-section-chevron" }), "chevron-down");
			headerEl.createSpan({ cls: "ai-agent-panel-column-section-label", text: label });
			const countEl = headerEl.createSpan({ cls: "ai-agent-panel-column-section-count" });
			const bodyEl = el.createDiv({
				cls: "ai-agent-panel-column-section-body",
				attr: key === "recent" ? {} : { role: "list" },
			});
			this.registerDomEvent(headerEl, "click", () => this.toggleSection(key));
			section = { el, headerEl, countEl, bodyEl };
			this.sections.set(key, section);
			if (key === "open") this.makeDropZone(bodyEl);
		}
		const collapsed = this.collapsed.has(key);
		writeClass(section.el, "is-collapsed", collapsed);
		writeAttr(section.headerEl, "aria-expanded", String(!collapsed));
		writeText(section.countEl, count === null ? "" : String(count));
		syncChildren(section.bodyEl, children);
		return section.el;
	}

	/** A date group of Recent ("Today", "Yesterday", …): its header, then a list of rows. */
	private group(label: string): { el: HTMLElement; listEl: HTMLElement } {
		let group = this.groups.get(label);
		if (!group) {
			const el = createDiv({ cls: "ai-agent-panel-column-group" });
			el.createDiv({ cls: "ai-agent-panel-column-group-header", text: label });
			group = { el, listEl: el.createDiv({ attr: { role: "list" } }) };
			this.groups.set(label, group);
		}
		return group;
	}

	private toggleSection(key: SectionKey): void {
		if (this.collapsed.has(key)) this.collapsed.delete(key);
		else this.collapsed.add(key);
		this.source.saveCollapsed([...this.collapsed]);
		this.render();
	}

	/** `o<tab key>` for an open row, `s<id>` for a stored one; null for an entry that cannot be drawn. */
	private rowKey(entry: ConversationEntry): string | null {
		if (entry.openIndex !== null) {
			const tab = this.tabs[entry.openIndex];
			return tab ? `o${tab.key}` : null;
		}
		return entry.id === null ? null : `s${entry.id}`;
	}

	/** The entry's row, created or reused, with what the key covers drawn. */
	private row(entry: ConversationEntry): Row | null {
		const key = this.rowKey(entry);
		if (key === null) return null;
		const tab = entry.openIndex === null ? null : this.tabs[entry.openIndex];
		let row = this.rows.get(key);
		if (!row) {
			row = this.createRow(key, tab?.key ?? null, entry);
			this.rows.set(key, row);
		}
		row.entry = entry;
		writeAttr(row.el, "draggable", String(tab !== null && !entry.pinned));
		writeTooltip(row.pinEl, entry.pinned ? "Unpin" : "Pin", "left");
		if (!tab) {
			writeText(row.titleEl, entry.title);
			const time = this.source.relativeTime(entry.updatedAt);
			writeText(row.timeEl, time);
			writeGlyph(row.glyphEl, entry.pinned ? "pin" : "none", "", "left");
			writeText(row.nameEl, entry.pinned ? `${entry.title}, pinned` : entry.title);
			if (row.lastActiveEl) writeText(row.lastActiveEl, `Last active ${time}`);
		}
		return row;
	}

	private createRow(key: string, tabKey: number | null, entry: ConversationEntry): Row {
		const base = conversationRow({ nameId: `${this.id}-${key}`, time: true, pin: true, close: tabKey !== null });
		const { el, mainEl, pinEl, closeEl } = base;
		el.toggleClass("is-stored", tabKey === null);
		// Described, not titled: tooltips are for icon-only controls (PRD-001.R32).
		const lastActiveEl = tabKey === null ? hiddenText(mainEl, "aria-describedby", "") : null;
		if (tabKey !== null && closeEl) {
			closeEl.addEventListener("click", () => this.intents.onClose(tabKey));
			el.addEventListener("auxclick", (evt) => {
				if (evt.button !== 1) return;
				evt.preventDefault();
				this.intents.onClose(tabKey);
			});
			el.addEventListener("mousedown", (evt) => {
				if (evt.button === 1) evt.preventDefault();
			});
		}
		const row: Row = { ...base, lastActiveEl, tabKey, entry, card: null };
		const target = (): RowTarget => ({ key: tabKey, id: row.entry.id, pinned: row.entry.pinned });
		mainEl.addEventListener("click", () => {
			if (tabKey !== null) this.intents.onSelect(tabKey);
			else if (row.entry.id !== null) this.intents.onOpenStored(row.entry.id);
		});
		pinEl.addEventListener("click", () => this.intents.onPin(target(), !row.entry.pinned));
		onRowMenu(el, (x, y) => showRowMenu(el.doc, x, y, target(), this.intents));
		if (tabKey !== null) {
			this.makeDraggable(el, tabKey);
			// Beside the main column, whose layer holds it: up where it fits, else down.
			row.card = this.cards.attach(
				mainEl,
				(cardEl) => {
					const input = this.source.card(tabKey);
					if (input) drawTabCard(cardEl, tabCard(input, Date.now()));
				},
				"auto"
			);
		}
		return row;
	}

	/** An open row's state, active mark and accessible name, which change without the key. */
	private drawOpenState(row: Row, active: number | null): void {
		const tab = row.tabKey === null ? null : this.tabs.find((open) => open.key === row.tabKey);
		if (!tab) return;
		drawOpenRow(row, tabItem(tab), tab.key === active);
	}

	/** Brings the active row into the list's view: on a switch, and after a reopen into the active tab moved it. */
	revealActive(): void {
		const active = this.source.activeKey();
		const row = active === null ? null : this.rows.get(`o${active}`);
		if (row?.el.isShown()) row.el.scrollIntoView({ block: "nearest" });
	}

	// --- Drag ------------------------------------------------------------------------

	/**
	 * HTML5 drag among the unpinned open rows: the dragged row moves past each
	 * row it enters, toward where it came from, so no geometry is read.
	 */
	private makeDraggable(el: HTMLElement, key: number): void {
		el.addEventListener("dragstart", (evt) => {
			this.dragged = el;
			this.dropped = false;
			el.addClass("is-dragging");
			if (evt.dataTransfer) {
				evt.dataTransfer.effectAllowed = "move";
				evt.dataTransfer.setData("text/plain", String(key));
			}
		});
		// A row of the same run takes the drop: entering it moves the dragged row past it.
		const accepts = (): boolean => {
			const dragged = this.dragged;
			return !!dragged && dragged.parentElement === el.parentElement && el.getAttribute("draggable") === "true";
		};
		el.addEventListener("dragenter", (evt) => {
			const dragged = this.dragged;
			const parent = el.parentElement;
			if (!accepts() || !dragged || !parent) return;
			evt.preventDefault();
			if (dragged === el) return;
			const after = Array.prototype.indexOf.call(parent.children, dragged) < Array.prototype.indexOf.call(parent.children, el);
			parent.insertBefore(dragged, after ? el.nextElementSibling : el);
		});
		el.addEventListener("dragover", (evt) => {
			if (!accepts()) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
		});
		el.addEventListener("dragend", () => {
			el.removeClass("is-dragging");
			const dropped = this.dropped;
			this.dragged = null;
			this.dropped = false;
			if (dropped) {
				const body = this.sections.get("open")?.bodyEl;
				const order = Array.from(body?.children ?? [])
					.map((child) => [...this.rows.entries()].find(([, row]) => row.el === child)?.[0])
					.filter((rowKey): rowKey is string => rowKey?.startsWith("o") === true)
					.map((rowKey) => Number(rowKey.slice(1)));
				this.intents.onReorder(order);
			}
			// A cancelled drag left the row where it moved; the render puts it back.
			this.key = null;
			this.render();
		});
	}

	/** The Open section's body takes the drop: rows outside it refuse one. */
	private makeDropZone(bodyEl: HTMLElement): void {
		this.registerDomEvent(bodyEl, "dragover", (evt) => {
			if (!this.dragged || this.dragged.parentElement !== bodyEl) return;
			evt.preventDefault();
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
		});
		this.registerDomEvent(bodyEl, "drop", (evt) => {
			if (!this.dragged) return;
			evt.preventDefault();
			this.dropped = true;
		});
	}
}
