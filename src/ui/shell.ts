import { Component, Events } from "obsidian";
import { promptLayout, type PromptStyle, type TabPosition } from "../settings-core";
import { barClearance } from "../state/bar-clearance";
import { columnLayout } from "../state/layout";
import { hidesTooltips, NO_TOOLTIPS_CLASS } from "../state/tooltips";
import { clampColumnWidth, columnWidth, parseStoredColumnWidth } from "../tabs-layout";
import { hiddenText, writeClass } from "./dom";

/** The bottom clearance a column keeps from the status bar; the stylesheet reads it. */
const CLEARANCE_PROP = "--ai-agent-panel-bar-clearance";

export interface ShellSource {
	/** The plugin's events: `settings` when a setting that reaches open panels changes. */
	settingsEvents: Events;
	/** The workspace's events: `css-change` when fonts, zoom or the theme change. */
	workspaceEvents: Events;
	tabPosition: () => TabPosition;
	/** The prompt settings the root's classes follow (DES-003 Settings that reach the panel). */
	prompts: () => { style: PromptStyle; pin: boolean; rail: boolean };
	/** "Show tooltips" (PRD-001.R32). */
	showTooltips: () => boolean;
	/** The column width stored on this device (DES-005), unparsed. */
	loadColumnWidth: () => unknown;
	/** Stores the dragged width; null forgets it. */
	saveColumnWidth: (width: number | null) => void;
}

/**
 * A size-dependent fit (the status line's steps): `read` measures and runs
 * its pure fit, `write` applies the result. `cssChanged`: a `css-change`
 * came since the last pass, so cached widths are stale. `full`: false in a
 * pass for the messages content alone.
 */
export interface ResizeMeasure {
	read(cssChanged: boolean, full: boolean): void;
	write(): void;
	/** Read on the active tab's messages content resizing too (the jump rail). */
	readonly content?: boolean;
}

/** The resize pass as the measuring components see it (DES-003 Layout model). */
export interface ResizePass {
	/** Registers a measure; the returned function removes it. */
	addMeasure(measure: ResizeMeasure): () => void;
	/** One more pass on the next frame, as after a label change. */
	requestPass(): void;
}

/**
 * The panel's root and regions (DES-003 Layout model), whether the
 * conversations show as a strip or a column (PRD-001.R8), firing `layout`
 * when that changes, the root's prompt-style classes, the column's width and
 * its resize handle, and the resize pass: one `ResizeObserver` on the main
 * column, the messages host and the active tab's messages content, and
 * `css-change`, coalesced to one pass per frame in which every measure reads,
 * then every measure writes. A pass for the messages content alone runs only
 * the measures that read it. The messages host resizing (the composer growing
 * or shrinking) fires `messages-resize` before the frame paints. The same
 * pass keeps the bottom of the main column and of the conversation column
 * clear of Obsidian's status bar (DES-003 Layout model).
 */
export class Shell extends Component implements ResizePass {
	readonly events = new Events();
	readonly rootEl: HTMLElement;
	readonly mainEl: HTMLElement;
	readonly topEl: HTMLElement;
	readonly messagesHostEl: HTMLElement;
	readonly composerAreaEl: HTMLElement;
	/** Holds the popover host (DES-003 slice 2) and the hover-card host (slice 3). */
	readonly layerEl: HTMLElement;
	/** Visually hidden: `ui/announcer`'s live region. */
	readonly announcerEl: HTMLElement;
	readonly columnEl: HTMLElement;
	private readonly handleEl: HTMLElement;
	private column = false;
	/** The width the user dragged to, kept apart from the drawn one; null while unset. */
	private storedWidth: number | null = null;
	/** The width drawn in the panel as it is now. */
	private drawnWidth = 0;
	private readonly measures = new Set<ResizeMeasure>();
	private frame: number | null = null;
	/** Every measure reads everything on its first pass. */
	private cssChanged = true;
	/** The next pass runs every measure, not only the content ones. */
	private fullPass = true;
	private running = false;
	private observer: ResizeObserver | null = null;
	private contentEl: HTMLElement | null = null;
	/** Watches the status bar's class and style; exists while the shell is loaded. */
	private barWatch: MutationObserver | null = null;
	/** Obsidian's status bar in this panel's document; null while there is none. */
	private barEl: HTMLElement | null = null;
	/** The next pass measures the status bar's clearance although it is not a full one. */
	private clearanceDirty = true;
	/** The messages content resized: the next pass, if not a full one, runs the content measures. */
	private contentDirty = false;
	/** The clearances read in a pass, in px, for the main column and the conversation column (null: not mounted). */
	private mainClearance = 0;
	private columnClearance: number | null = null;
	/** What the custom property holds now; -1 before the first write. */
	private writtenMain = -1;
	private writtenColumn = -1;

	constructor(parent: HTMLElement, private readonly source: ShellSource) {
		super();
		this.rootEl = parent.createDiv({ cls: "ai-agent-panel ai-agent-panel-scope" });
		this.mainEl = this.rootEl.createDiv({ cls: "ai-agent-panel-main" });
		this.topEl = this.mainEl.createDiv({ cls: "ai-agent-panel-top" });
		this.messagesHostEl = this.mainEl.createDiv({ cls: "ai-agent-panel-messages-host" });
		this.composerAreaEl = this.mainEl.createDiv({ cls: "ai-agent-panel-composer-area" });
		this.layerEl = this.mainEl.createDiv({ cls: "ai-agent-panel-layer" });
		this.announcerEl = this.mainEl.createDiv({ cls: "ai-agent-panel-announcer" });
		// Mounted in column layout only.
		this.columnEl = createDiv({ cls: "ai-agent-panel-column" });
		this.handleEl = this.columnEl.createDiv({
			cls: "ai-agent-panel-column-handle",
			attr: { role: "separator", "aria-orientation": "vertical" },
		});
		hiddenText(this.handleEl, "aria-labelledby", "Resize the conversation list");
	}

	onload(): void {
		this.running = true;
		this.storedWidth = parseStoredColumnWidth(this.source.loadColumnWidth());
		this.setupHandle();
		this.writePromptClasses();
		this.writeTooltipsClass();
		this.registerEvent(
			this.source.settingsEvents.on("settings", () => {
				this.writePromptClasses();
				this.writeTooltipsClass();
				this.relayout();
			})
		);
		this.registerEvent(
			this.source.workspaceEvents.on("css-change", () => {
				this.cssChanged = true;
				this.requestPass();
			})
		);
		const win = this.mainEl.win as typeof window;
		// Column drags fire no onResize; the observer sees them (ADR-016).
		const observer = new win.ResizeObserver((entries) => {
			// Before the paint, so a view that follows its end never shows it hidden.
			if (entries.some((entry) => entry.target === this.messagesHostEl)) this.events.trigger("messages-resize");
			if (entries.some((entry) => entry.target === this.mainEl)) this.requestPass();
			else {
				if (entries.some((entry) => entry.target === this.barEl)) this.clearanceDirty = true;
				if (entries.some((entry) => entry.target === this.contentEl)) this.contentDirty = true;
				this.schedule();
			}
		});
		observer.observe(this.mainEl);
		observer.observe(this.messagesHostEl);
		if (this.contentEl) observer.observe(this.contentEl);
		this.observer = observer;
		this.register(() => {
			observer.disconnect();
			this.observer = null;
		});
		this.watchStatusBar(win);
	}

	/**
	 * What moves or hides the status bar without resizing the panel: the
	 * bar's own class and style, the body's classes (`is-screenshotting`
	 * hides it) and the workspace moving panels or resizing. The bar's size
	 * is the resize observer's.
	 */
	private watchStatusBar(win: typeof window): void {
		const bodyWatch = new win.MutationObserver(() => this.requestClearance());
		bodyWatch.observe(this.mainEl.doc.body, { attributes: true, attributeFilter: ["class"] });
		const barWatch = new win.MutationObserver(() => this.requestClearance());
		this.barWatch = barWatch;
		this.register(() => {
			bodyWatch.disconnect();
			barWatch.disconnect();
			this.barWatch = null;
		});
		for (const name of ["layout-change", "resize"])
			this.registerEvent(this.source.workspaceEvents.on(name, () => this.requestClearance()));
	}

	onunload(): void {
		this.running = false;
		if (this.frame !== null) this.mainEl.win.cancelAnimationFrame(this.frame);
		this.frame = null;
		this.measures.clear();
	}

	get isColumn(): boolean {
		return this.column;
	}

	addMeasure(measure: ResizeMeasure): () => void {
		this.measures.add(measure);
		this.requestPass();
		return () => this.measures.delete(measure);
	}

	requestPass(): void {
		this.fullPass = true;
		this.schedule();
	}

	/** The active tab's messages content, whose resizes the content measures read; null for none. */
	observeContent(el: HTMLElement | null): void {
		if (el === this.contentEl) return;
		if (this.contentEl) this.observer?.unobserve(this.contentEl);
		this.contentEl = el;
		if (el) this.observer?.observe(el);
	}

	/** A pass that measures the status bar's clearance, as when the bar hides or a panel moves. */
	private requestClearance(): void {
		this.clearanceDirty = true;
		this.schedule();
	}

	private schedule(): void {
		if (!this.running || this.frame !== null) return;
		this.frame = this.mainEl.win.requestAnimationFrame(() => this.runPass());
	}

	/** Reads, then writes, so no write forces a layout before the next read. */
	private runPass(): void {
		this.frame = null;
		const cssChanged = this.cssChanged;
		const full = this.fullPass || cssChanged;
		this.cssChanged = false;
		this.fullPass = false;
		const clearance = full || this.clearanceDirty;
		const contentOnly = !full && this.contentDirty;
		this.clearanceDirty = false;
		this.contentDirty = false;
		const measures = [...this.measures].filter((measure) => full || (contentOnly && measure.content === true));
		for (const measure of measures) measure.read(cssChanged, full);
		if (clearance) this.readClearance();
		for (const measure of measures) measure.write();
		if (clearance) this.writeClearance();
	}

	/**
	 * The status bar in the panel's own document (a pop-out window has none),
	 * observed while it is the same element; null when there is none.
	 */
	private findStatusBar(): HTMLElement | null {
		const bar = this.mainEl.doc.querySelector<HTMLElement>(".app-container > .status-bar");
		if (bar === this.barEl) return bar;
		if (this.barEl) this.observer?.unobserve(this.barEl);
		this.barWatch?.disconnect();
		this.barEl = bar;
		if (bar) {
			this.observer?.observe(bar);
			this.barWatch?.observe(bar, { attributes: true, attributeFilter: ["class", "style"] });
		}
		return bar;
	}

	/** How far each column's bottom must stay clear of the status bar (`state/bar-clearance`). */
	private readClearance(): void {
		const bar = this.findStatusBar()?.getBoundingClientRect() ?? null;
		this.mainClearance = barClearance(this.mainEl.getBoundingClientRect(), bar);
		this.columnClearance = this.columnEl.isConnected ? barClearance(this.columnEl.getBoundingClientRect(), bar) : null;
	}

	/**
	 * `--ai-agent-panel-bar-clearance` on each column; the stylesheet adds it
	 * to the column's bottom padding. A change from the zero the stylesheet
	 * assumes resizes the messages host after the measures read it, so one more
	 * pass follows; it finds the same values (the clearance does not depend on
	 * the host's height) and ends there.
	 */
	private writeClearance(): void {
		let changed = false;
		if (this.mainClearance !== this.writtenMain) {
			changed ||= this.writtenMain !== -1 || this.mainClearance !== 0;
			this.writtenMain = this.mainClearance;
			this.mainEl.setCssProps({ [CLEARANCE_PROP]: `${this.mainClearance}px` });
		}
		if (this.columnClearance !== null && this.columnClearance !== this.writtenColumn) {
			changed ||= this.writtenColumn !== -1 || this.columnClearance !== 0;
			this.writtenColumn = this.columnClearance;
			this.columnEl.setCssProps({ [CLEARANCE_PROP]: `${this.columnClearance}px` });
		}
		if (changed) this.requestPass();
	}

	/**
	 * `mod-prompt-numbered` (Card) or `mod-prompt-bubble`; `mod-pin-prompt`; and
	 * `mod-prompt-rail` while the rail shows. The prompt color is the theme scope's (ADR-017).
	 */
	private writePromptClasses(): void {
		const { style, pin, rail } = this.source.prompts();
		const layout = promptLayout(style);
		writeClass(this.rootEl, "mod-prompt-numbered", layout.numbered);
		writeClass(this.rootEl, "mod-prompt-bubble", !layout.numbered);
		writeClass(this.rootEl, "mod-pin-prompt", pin);
		writeClass(this.rootEl, "mod-prompt-rail", layout.rail && rail);
	}

	/** `mod-no-tooltips` while "Show tooltips" is off (`state/tooltips`). */
	private writeTooltipsClass(): void {
		writeClass(this.rootEl, NO_TOOLTIPS_CLASS, hidesTooltips(this.source.showTooltips()));
	}

	/**
	 * Strip or column, from "Conversation tabs" and the panel's width, and the
	 * column's drawn width; on the view's resize and a setting.
	 */
	relayout(): void {
		const panelWidth = this.rootEl.clientWidth;
		this.drawWidth(panelWidth);
		const column = columnLayout(this.source.tabPosition(), panelWidth, this.column);
		if (column === this.column) return;
		this.column = column;
		this.rootEl.toggleClass("is-column", column);
		if (column) this.rootEl.appendChild(this.columnEl);
		else this.columnEl.detach();
		this.events.trigger("layout", column);
	}

	/**
	 * The stored width capped by the panel as it is now, so a briefly narrow
	 * panel caps the drawing without losing the preference (DES-003 Layout
	 * model).
	 */
	private drawWidth(panelWidth: number): void {
		const width = columnWidth(this.storedWidth, panelWidth);
		if (width === this.drawnWidth) return;
		this.drawnWidth = width;
		this.rootEl.setCssProps({ "--ai-agent-panel-side-width": `${width}px` });
	}

	/**
	 * The handle on the column's inner edge (PRD-001.R8): a drag sets the
	 * width, stored at its end; a double-click forgets it. Pointer capture
	 * keeps the stream when the pointer outruns the handle or leaves the
	 * window, for mouse, pen and touch alike.
	 */
	private setupHandle(): void {
		const handle = this.handleEl;
		let dragging = false;
		this.registerDomEvent(handle, "pointerdown", (evt) => {
			// A second pointer landing mid-drag would add listeners the first drag's end cannot see.
			if (evt.button !== 0 || dragging) return;
			evt.preventDefault();
			dragging = true;
			const startX = evt.clientX;
			const startWidth = this.drawnWidth;
			const panelWidth = this.rootEl.clientWidth;
			// The column sits at the inline end: moving its edge toward the inline start widens it.
			const sign = this.rootEl.win.getComputedStyle(this.rootEl).direction === "rtl" ? 1 : -1;
			handle.setPointerCapture(evt.pointerId);
			handle.addClass("is-dragging");
			this.rootEl.addClass("is-resizing");
			let moved = false;
			const move = (e: PointerEvent): void => {
				moved = true;
				this.storedWidth = clampColumnWidth(startWidth + sign * (e.clientX - startX), panelWidth);
				this.drawWidth(panelWidth);
			};
			const finish = (): void => {
				dragging = false;
				handle.removeEventListener("pointermove", move);
				handle.removeEventListener("pointerup", finish);
				handle.removeEventListener("pointercancel", finish);
				handle.removeClass("is-dragging");
				this.rootEl.removeClass("is-resizing");
				// A click, as each half of a double-click is, stores nothing.
				if (moved && this.storedWidth !== null) this.source.saveColumnWidth(this.storedWidth);
				// The layout settles once, at the end of the drag.
				this.relayout();
			};
			handle.addEventListener("pointermove", move);
			handle.addEventListener("pointerup", finish);
			handle.addEventListener("pointercancel", finish);
		});
		this.registerDomEvent(handle, "dblclick", (evt) => {
			evt.preventDefault();
			this.storedWidth = null;
			this.source.saveColumnWidth(null);
			this.relayout();
		});
	}
}
