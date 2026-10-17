/**
 * DOM writes that touch the element only when the value differs, the step
 * and agent marks, the icon-only button, hidden names and descriptions, the
 * meter bar, the radio group, subscriptions that follow one event source at
 * a time, and the popover and hover-card contracts, for every `ui/`
 * component (ADR-016: components write only what differs).
 */

import { setTooltip, type Component, type EventRef, type Events, type TooltipPlacement } from "obsidian";
import { drawIcon } from "../icon";
import { thumbLabel, type ViewerImage } from "../state/image-viewer";
import type { Direction } from "../state/popover";
import { rovingIndex } from "../state/roving";
import { MARK_LABEL, type Mark } from "../state/step-groups";
import type { TabCardView, TabItemView } from "../state/tabs";
import type { Ticker } from "../state/ticker";

export function writeText(el: HTMLElement, text: string): void {
	if (el.textContent !== text) el.setText(text);
}

export function writeAttr(el: HTMLElement, name: string, value: string): void {
	if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** A class on or off; `toggleClass` writes the attribute even when it holds already. */
export function writeClass(el: HTMLElement, cls: string, on: boolean): void {
	if (el.hasClass(cls) !== on) el.toggleClass(cls, on);
}

/**
 * An icon, redrawn only when it changes. A list names fallbacks, the first
 * that the Lucide bundled with this Obsidian draws winning (icon names moved
 * between versions).
 */
export function writeIcon(el: HTMLElement, icon: string | readonly string[]): void {
	const names = typeof icon === "string" ? [icon] : icon;
	const key = names.join(" ");
	if (el.dataset.icon === key) return;
	el.dataset.icon = key;
	drawIcon(el, names);
}

/** A step or agent mark's icon shape: a spinner, a check, an x in a circle (DES-003 Keyboard and accessibility). */
const MARK_ICON: Record<Mark, readonly string[]> = {
	running: ["loader-circle", "loader-2"],
	done: ["check"],
	error: ["circle-x", "x-circle"],
};

/**
 * A mark as its icon, an image named "Running", "Done" or "Failed" unless
 * text beside it names it (`named`); nothing for none. `runningAsDots`
 * draws a running mark as three pulsing dots, as a tool-step row does
 * (DES-003 Tool steps), in place of the spinner.
 */
export function writeMark(el: HTMLElement, mark: Mark | null, named = false, runningAsDots = false): void {
	writeAttr(el, "data-mark", mark ?? "none");
	if (!mark) {
		el.empty();
		delete el.dataset.icon;
		el.removeAttribute("role");
		el.removeAttribute("aria-label");
		return;
	}
	if (runningAsDots && mark === "running") {
		if (el.dataset.icon !== "dots") {
			el.dataset.icon = "dots";
			el.empty();
			for (let dot = 0; dot < 3; dot++) el.createSpan({ cls: "ai-agent-panel-step-dot" });
		}
	} else writeIcon(el, MARK_ICON[mark]);
	if (named) return;
	writeAttr(el, "role", "img");
	writeAttr(el, "aria-label", MARK_LABEL[mark]);
}

/**
 * A text tooltip (400 ms, DES-003), set only when its text changes. It sets
 * `aria-label`, so it names an icon-only control; an element with visible
 * text gets one only where a requirement asks (PRD-001.R32).
 */
export function writeTooltip(el: HTMLElement, text: string, placement: TooltipPlacement = "top"): void {
	if (el.dataset.tooltip === text) return;
	el.dataset.tooltip = text;
	setTooltip(el, text, { delay: 400, placement });
}

/** Opens the image viewer on `images[index]` (`ImageViewerModal`). */
export type ViewImages = (images: readonly ViewerImage[], index: number) => void;

/**
 * Each image as a thumbnail button in `parent`, the image classed
 * `imageCls`: a graphic without text, named by its tooltip "View <name>"
 * (PRD-001.R32); a click, Enter or Space views it among the others
 * (PRD-001.R14, R16).
 */
export function thumbButtons(parent: HTMLElement, images: readonly ViewerImage[], imageCls: string, view: ViewImages): void {
	images.forEach((image, index) => {
		const button = parent.createEl("button", { cls: "ai-agent-panel-image-thumb", attr: { type: "button" } });
		const img = button.createEl("img", { cls: imageCls, attr: { alt: "" } });
		img.src = `data:${image.mediaType};base64,${image.base64}`;
		writeTooltip(button, thumbLabel(image.name));
		button.addEventListener("click", () => view(images, index));
	});
}

/** An icon-only button named by its label, which is also its tooltip (DES-003). */
export function iconButton(
	owner: Component,
	parent: HTMLElement,
	icon: string | readonly string[],
	label: string,
	onClick: () => void,
	placement: TooltipPlacement = "top"
): HTMLButtonElement {
	const button = parent.createEl("button", {
		cls: "ai-agent-panel-icon-button",
		attr: { type: "button" },
	});
	writeIcon(button, icon);
	// Names it too: the tooltip sets `aria-label`.
	writeTooltip(button, label, placement);
	owner.registerDomEvent(button, "click", () => onClick());
	return button;
}

let nextHiddenId = 0;

/**
 * Visually hidden text in `host` (`el` itself by default) that names
 * (`aria-labelledby`) or describes (`aria-describedby`) `el`: how an element
 * that is not icon-only is named without an `aria-label`, for which Obsidian
 * would show a tooltip (PRD-001.R32). Hidden from the reading order too, as
 * the relation still reads it. Returns it, for its text to change. Not
 * `aria-describedby` on an element with a hover card: the card sets and
 * removes that attribute (`hover-card-host`).
 */
export function hiddenText(
	el: HTMLElement,
	relation: "aria-labelledby" | "aria-describedby",
	text: string,
	host: HTMLElement = el
): HTMLElement {
	const id = `ai-agent-panel-hidden-${++nextHiddenId}`;
	el.setAttribute(relation, id);
	return host.createSpan({ cls: "ai-agent-panel-visually-hidden", text, attr: { id, "aria-hidden": "true" } });
}

/** One choice of a radio group. */
export interface RadioChoice<V extends string> {
	value: V;
	label: string;
	/** The accessible name when it differs from the label (a mode without its "⚠"). */
	name?: string;
	/** A second, fainter line: the choice's accessible description. */
	description?: string;
	icon?: string;
	checked: boolean;
	disabled?: boolean;
	/** Red, as Auto-approve and Bypass are. */
	warn?: boolean;
}

/**
 * The item a key moves focus to in a radio group or a tab list (DES-003
 * Keyboard and accessibility), from item `at` of `last + 1`; null for a key
 * that moves nothing. Left and Right swap inside a `mod-rtl` ancestor.
 */
export function rovingTarget(evt: KeyboardEvent, el: HTMLElement, at: number, last: number): number | null {
	return rovingIndex(evt.key, el.closest(".mod-rtl") !== null, at, last);
}

/**
 * Roving focus for a key press on `items[at]`: the arrows, Home and End (Left
 * and Right swap in a `mod-rtl` ancestor of `container`; none moves anything
 * when `vertical`) move focus to another item and make it the one tab stop.
 * True when the key moved focus.
 */
export function rovingFocus(
	evt: KeyboardEvent,
	container: HTMLElement,
	items: readonly HTMLElement[],
	at: number,
	vertical = false
): boolean {
	if (vertical && (evt.key === "ArrowLeft" || evt.key === "ArrowRight")) return false;
	const next = rovingTarget(evt, container, at, items.length - 1);
	if (next === null) return false;
	evt.preventDefault();
	items.forEach((item, index) => item.setAttribute("tabindex", index === next ? "0" : "-1"));
	items[next].focus();
	return true;
}

let nextRadioId = 0;

/**
 * A `radiogroup` of buttons named `label` (DES-003 Keyboard and
 * accessibility). The arrows, Home and End move focus among the enabled
 * choices without picking, so a pick that switches the CLI is never sent
 * on the way; a click, Enter or Space picks. One tab stop: returns the
 * control focus goes to, the checked choice when enabled, else the first
 * enabled one.
 */
export function radioGroup<V extends string>(
	owner: Component,
	parent: HTMLElement,
	label: string,
	choices: readonly RadioChoice<V>[],
	onPick: (value: V) => void,
	cls: string
): HTMLButtonElement | null {
	const group = parent.createDiv({ cls: `ai-agent-panel-radio-group ${cls}`, attr: { role: "radiogroup" } });
	hiddenText(group, "aria-labelledby", label);
	const buttons = choices.map((choice) => {
		const id = `ai-agent-panel-radio-${++nextRadioId}`;
		const button = group.createEl("button", {
			cls: "ai-agent-panel-radio",
			attr: {
				type: "button",
				role: "radio",
				"aria-checked": String(choice.checked),
				"aria-labelledby": `${id}-name`,
				tabindex: "-1",
			},
		});
		button.toggleClass("is-checked", choice.checked);
		button.toggleClass("is-warning", choice.warn === true);
		button.disabled = choice.disabled === true;
		writeIcon(button.createSpan({ cls: "ai-agent-panel-radio-mark", attr: { "aria-hidden": "true" } }), "check");
		if (choice.icon) writeIcon(button.createSpan({ cls: "ai-agent-panel-radio-icon" }), choice.icon);
		const text = button.createSpan({ cls: "ai-agent-panel-radio-text" });
		const label = text.createSpan({ cls: "ai-agent-panel-radio-label", text: choice.label });
		if (choice.name !== undefined && choice.name !== choice.label) {
			label.setAttribute("aria-hidden", "true");
			text.createSpan({ cls: "ai-agent-panel-visually-hidden", text: choice.name, attr: { id: `${id}-name` } });
		} else label.id = `${id}-name`;
		if (choice.description) {
			text.createSpan({ cls: "ai-agent-panel-radio-description", text: choice.description, attr: { id: `${id}-description` } });
			button.setAttribute("aria-describedby", `${id}-description`);
		}
		owner.registerDomEvent(button, "click", () => onPick(choice.value));
		return button;
	});
	const enabled = buttons.filter((button) => !button.disabled);
	const target = buttons.find((button, at) => choices[at].checked && !button.disabled) ?? enabled[0] ?? null;
	target?.setAttribute("tabindex", "0");
	owner.registerDomEvent(group, "keydown", (evt) => {
		const at = enabled.findIndex((button) => button === evt.target);
		if (at < 0) return;
		rovingFocus(evt, group, enabled, at);
	});
	return target;
}

/** The controls focus can go to when a popover opens (PRD-001.R32). */
export interface PopoverFocus {
	first: HTMLElement | null;
	/** Controls a trigger can ask for by name, such as the effort control (PRD-001.R23). */
	named?: Readonly<Record<string, HTMLElement | null>>;
}

/**
 * What a popover shows, independent of the host that shows it (DES-003
 * Seams): its title, which names the dialog, and its body. The host loads it
 * as a child while it shows, so its listeners go with it. `picked` closes
 * the popover after a pick, returning focus to its trigger.
 */
export interface PopoverContent extends Component {
	readonly title: string;
	/** The title names the dialog but does not show: the body's first line stands for it. */
	readonly titleHidden?: boolean;
	/** A body of rows that reach the popover's edge (a menu), not one padded as a panel. */
	readonly menu?: boolean;
	/** A class on the dialog, such as the width the content wants. */
	readonly cls?: string;
	/** The dialog is an `alertdialog` that asks a question: its body describes it, and the icon (names, first found) leads its title. */
	readonly alert?: readonly string[];
	/** The dialog is as wide as its trigger. */
	readonly fitTrigger?: boolean;
	/** A tab switch does not close the popover while this is true: its content is closing a tab (the open-tabs list). */
	readonly keepOpenOnTabChange?: boolean;
	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus;
}

/** The parts of the dialog outside the scrolling body, which the host creates when content asks. */
export interface PopoverShell {
	/** The right-aligned meta slot of the header row. */
	meta(): HTMLElement;
	/** The footer band under the body. */
	footer(): HTMLElement;
}

/**
 * The popover host as an intent (DES-003 Modules): `trigger` opens `content`,
 * with focus on the control named `focus` or the first one; the open
 * popover's own trigger closes it.
 */
export type OpenPopover = (trigger: HTMLElement, id: string, content: PopoverContent, focus?: string) => void;

/** Draws a hover card's content into its empty element, each time it shows or is refreshed. */
export type HoverCardRender = (el: HTMLElement) => void;

/** An element's hover card, as the hover-card host keeps it. */
export interface HoverCardHandle {
	/** Redraw the card if it shows; drop it if the element no longer shows. */
	refresh(): void;
	/** Stop showing a card for the element. */
	detach(): void;
}

/**
 * The hover-card host as an intent (DES-003 Modules): `el` shows the card
 * `render` draws after 500 ms of pointer rest, or on keyboard focus until
 * blur (PRD-001.R32), opening `direction` from it (up by default).
 */
export type AttachHoverCard = (el: HTMLElement, render: HoverCardRender, direction?: Direction) => HoverCardHandle;

/**
 * Subscriptions to one source at a time, such as the active tab: `follow`
 * moves them to another source, or drops them with null; unloading the
 * owner drops them too. `E` names the events the source fires, so a
 * misspelled one does not compile.
 */
export class Follower<S extends Events, E extends string> {
	private source: S | null = null;
	private refs: EventRef[] = [];

	constructor(owner: Component, private readonly handlers: Partial<Record<E, (...data: unknown[]) => unknown>>) {
		owner.register(() => this.follow(null));
	}

	get current(): S | null {
		return this.source;
	}

	follow(source: S | null): void {
		if (source === this.source) return;
		for (const ref of this.refs) this.source?.offref(ref);
		this.source = source;
		this.refs = [];
		if (!source) return;
		for (const name of Object.keys(this.handlers) as E[]) {
			const handler = this.handlers[name];
			if (handler) this.refs.push(source.on(name, handler));
		}
	}
}

/**
 * Makes `parent`'s children exactly `children`, in order, moving only the
 * elements out of place: keyed rows are reused, not rebuilt (DES-003 Tabs
 * and conversation column).
 */
export function syncChildren(parent: HTMLElement, children: readonly HTMLElement[]): void {
	children.forEach((child, at) => {
		const current = parent.children.item(at);
		if (current !== child) parent.insertBefore(child, current);
	});
	while (parent.children.length > children.length) parent.lastElementChild?.remove();
}

/**
 * A listener on `el`'s own document, moved with it when the panel moves to
 * another window (`onWindowMigrated`), where it also runs once; removed when
 * `owner` unloads.
 */
export function onOwnDocument(owner: Component, el: HTMLElement, type: string, listener: () => void): void {
	let watched: Document | null = null;
	const watch = (): void => {
		watched?.removeEventListener(type, listener);
		watched = el.doc;
		watched.addEventListener(type, listener);
	};
	watch();
	owner.register(() => watched?.removeEventListener(type, listener));
	owner.register(
		el.onWindowMigrated(() => {
			watch();
			listener();
		})
	);
}

/** How long a touch rests on a row before its menu opens (PRD-001.R9). */
const LONG_PRESS_MS = 500;

/**
 * A row's menu: right-click, Shift+F10 and the context-menu key (each a
 * `contextmenu` event at the focused element), or a 500 ms touch hold. The
 * listeners are the row's own, so they go with it.
 */
export function onRowMenu(el: HTMLElement, open: (x: number, y: number) => void): void {
	el.addEventListener("contextmenu", (evt) => {
		evt.preventDefault();
		evt.stopPropagation();
		open(evt.clientX, evt.clientY);
	});
	let hold: number | null = null;
	const cancel = (): void => {
		if (hold !== null) el.win.clearTimeout(hold);
		hold = null;
	};
	el.addEventListener("pointerdown", (evt) => {
		if (evt.pointerType !== "touch") return;
		cancel();
		const { clientX, clientY } = evt;
		hold = el.win.setTimeout(() => {
			hold = null;
			if (el.isConnected) open(clientX, clientY);
		}, LONG_PRESS_MS);
	});
	for (const type of ["pointerup", "pointercancel", "pointermove"] as const) el.addEventListener(type, cancel);
}

/** A tab's pin or state dot (DES-003 Tab item), titled by `title` while it has one. */
export function writeGlyph(
	el: HTMLElement,
	glyph: "pin" | "dot" | "none",
	title: string,
	placement: TooltipPlacement
): void {
	writeAttr(el, "data-glyph", glyph);
	if (glyph === "pin") writeIcon(el, "pin");
	else if (el.dataset.icon) {
		el.empty();
		delete el.dataset.icon;
	}
	if (title) writeTooltip(el, title, placement);
	else if (el.dataset.tooltip) {
		el.removeAttribute("aria-label");
		delete el.dataset.tooltip;
	}
}

/** The parts of a conversation row that open rows draw and callers listen on. */
export interface ConversationRowEls {
	el: HTMLElement;
	mainEl: HTMLButtonElement;
	glyphEl: HTMLElement;
	titleEl: HTMLElement;
	/** The time, when the row has one (the column's). */
	timeEl: HTMLElement | null;
	/** The visually hidden accessible name of `mainEl`. */
	nameEl: HTMLElement;
	/** The hover pin (the column's). */
	pinEl: HTMLElement | null;
	/** The close button at the row's end; none on a stored row. */
	closeEl: HTMLElement | null;
}

export interface ConversationRowOptions<T extends boolean, P extends boolean> {
	/** The id of the hidden name, unique in the document. */
	nameId: string;
	time: T;
	pin: P;
	close: boolean;
}

/**
 * A row of the conversation column or the open-tabs list (DES-003 Tabs and
 * conversation column): the `listitem` holding a main button (glyph, title,
 * the time, a hidden name), then the hover pin and the close button the
 * options ask for. Detached; the caller listens, places and draws it.
 */
export function conversationRow<T extends boolean, P extends boolean>(
	options: ConversationRowOptions<T, P>
): ConversationRowEls & { timeEl: T extends true ? HTMLElement : null; pinEl: P extends true ? HTMLElement : null } {
	const el = createDiv({ cls: "ai-agent-panel-column-row", attr: { role: "listitem" } });
	const mainEl = el.createEl("button", {
		cls: "ai-agent-panel-column-row-main",
		attr: { type: "button", "aria-labelledby": options.nameId },
	});
	const glyphEl = mainEl.createSpan({ cls: "ai-agent-panel-tab-glyph" });
	const titleEl = mainEl.createSpan({ cls: "ai-agent-panel-column-row-title", attr: { "aria-hidden": "true" } });
	const timeEl = options.time
		? mainEl.createSpan({ cls: "ai-agent-panel-column-row-time", attr: { "aria-hidden": "true" } })
		: null;
	const nameEl = mainEl.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: options.nameId } });
	const button = (cls: string, icon: string): HTMLElement => {
		const buttonEl = el.createEl("button", { cls, attr: { type: "button", tabindex: "-1" } });
		writeIcon(buttonEl, icon);
		return buttonEl;
	};
	const pinEl = options.pin ? button("ai-agent-panel-column-row-pin", "pin") : null;
	const closeEl = options.close ? button("ai-agent-panel-column-row-close", "x") : null;
	// The options' literal types decide which parts exist; the conditional type states it.
	return { el, mainEl, glyphEl, titleEl, timeEl, nameEl, pinEl, closeEl } as unknown as ReturnType<typeof conversationRow<T, P>>;
}

/**
 * An open row's title, state, active mark and accessible name from the tab
 * item `view`: what a column row and an open-tabs list row share. Writes only
 * what changed.
 */
export function drawOpenRow(row: ConversationRowEls, view: TabItemView, active: boolean): void {
	writeText(row.titleEl, view.title);
	writeClass(row.el, "is-active", active);
	if (active) writeAttr(row.mainEl, "aria-current", "true");
	else if (row.mainEl.hasAttribute("aria-current")) row.mainEl.removeAttribute("aria-current");
	writeAttr(row.el, "data-state", view.state);
	writeGlyph(row.glyphEl, view.glyph, view.glyphTitle, "left");
	writeText(row.nameEl, view.label);
	if (row.closeEl) writeTooltip(row.closeEl, `Close ${view.title}`, "left");
}

/** PRD-001.R7's tab hover card, drawn into the card element the hover-card host gives. */
export function drawTabCard(el: HTMLElement, view: TabCardView): void {
	el.addClass("ai-agent-panel-tab-card");
	el.createDiv({ cls: "ai-agent-panel-tab-card-title", text: view.title });
	if (view.state) {
		const state = el.createDiv({ cls: "ai-agent-panel-tab-card-state", attr: { "data-state": view.state.kind } });
		state.createSpan({ cls: "ai-agent-panel-tab-card-dot" });
		state.createSpan({ text: view.state.text });
	}
	el.createDiv({ cls: "ai-agent-panel-tab-card-meta", text: view.meta });
	if (view.cost) el.createDiv({ cls: "ai-agent-panel-tab-card-meta", text: view.cost });
	if (view.costNote) el.createDiv({ cls: "ai-agent-panel-tab-card-meta", text: view.costNote });
}

/**
 * Hover cards whose content ticks: while one of them shows, the shared
 * ticker redraws it each second (the tab hover card's elapsed time,
 * PRD-001.R29), and stops once none shows.
 */
export class TickingCards {
	/** The card showing, and its element's handle. */
	private shown: { cardEl: HTMLElement; handle: HoverCardHandle } | null = null;

	constructor(
		owner: Component,
		private readonly ticker: Ticker,
		private readonly attachCard: AttachHoverCard
	) {
		owner.register(ticker.subscribe({ shown: () => this.isShowing(), tick: () => this.refresh() }));
	}

	attach(el: HTMLElement, render: HoverCardRender, direction?: Direction): HoverCardHandle {
		const handle = this.attachCard(
			el,
			(cardEl) => {
				const was = this.isShowing();
				render(cardEl);
				this.shown = { cardEl, handle };
				if (!was) this.ticker.check();
			},
			direction
		);
		return handle;
	}

	/** Redraws the card that shows, if any. */
	refresh(): void {
		if (this.isShowing()) this.shown?.handle.refresh();
	}

	private isShowing(): boolean {
		return this.shown?.cardEl.isConnected === true;
	}
}
