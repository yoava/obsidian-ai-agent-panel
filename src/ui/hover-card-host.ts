import { Component } from "obsidian";
import {
	HOVER_DELAY_MS,
	HOVER_IDLE,
	controlUnder,
	hoverStep,
	opensDown,
	placeAbove,
	placeBelow,
	placeInline,
	pointerMoved,
	returnedFromInner,
	type Direction,
	type HoverEvent,
	type HoverState,
	type PathNode,
	type Point,
} from "../state/popover";
import type { HoverCardHandle, HoverCardRender } from "./dom";

let nextCardId = 0;

/** What counts as a control for the pointer: any interactive element of the panel. */
const CONTROL =
	'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"], [role="menuitem"], [role="link"]';

const armedEl = (state: HoverState<HTMLElement>) => (state.phase === "armed" ? state.el : null);
const shownEl = (state: HoverState<HTMLElement>) => (state.phase === "shown" ? state.el : null);

/**
 * The panel's one hover card (DES-003 Popovers, hover cards and tooltips;
 * ADR-016): a tooltip in the main column's layer for an attached element,
 * driven by `state/popover`'s hover machine. It shows after 500 ms of
 * pointer rest, or on keyboard focus until blur, but not on the focus a
 * closing popover returns to its trigger; while it shows, the element's
 * `aria-describedby` names it. The element leaving the DOM drops it, as
 * does the pointer reaching another control of the panel; a popover opening
 * drops it, and none arms or shows until that closes.
 */
export class HoverCardHost extends Component {
	private state: HoverState<HTMLElement> = HOVER_IDLE;
	private readonly attached = new Map<
		HTMLElement,
		{ render: HoverCardRender; direction: Direction; unlisten: () => void }
	>();
	private cardEl: HTMLElement | null = null;
	private timer: number | null = null;
	private observer: MutationObserver | null = null;
	/** The trigger a closing popover is giving focus back to, until that focus arrives. */
	private returning: HTMLElement | null = null;
	/** Where the last `pointerover` in the panel happened. */
	private lastPointer: Point | null = null;
	/** The control the last `pointerover` in the panel reached. */
	private pointerControl: HTMLElement | null = null;

	constructor(
		private readonly layerEl: HTMLElement,
		/** The main column: the card's bounds, and where its elements live. */
		private readonly mainEl: HTMLElement,
		/** The panel: the pointer reaching a control anywhere in it drops another element's card. */
		private readonly panelEl: HTMLElement
	) {
		super();
	}

	onload(): void {
		this.registerDomEvent(this.panelEl, "pointerover", (evt) => {
			const at = { x: evt.clientX, y: evt.clientY };
			const moved = pointerMoved(this.lastPointer, at);
			this.lastPointer = at;
			const control = this.controlAt(evt.target as Node | null);
			// `pointerenter` follows this event: it arms nothing for an element whose inner control the pointer is on.
			const from = this.pointerControl;
			this.pointerControl = control;
			if (!moved || !control || this.state.phase === "blocked") return;
			if (this.state.phase !== "idle") this.dispatch({ type: "control", el: control });
			// Back from an inner control onto the element itself: no `pointerenter` fires.
			if (this.attached.has(control) && returnedFromInner(from, control, (outer, inner) => outer.contains(inner)))
				this.dispatch({ type: "enter", el: control });
		});
	}

	onunload(): void {
		this.apply(HOVER_IDLE);
		for (const { unlisten } of this.attached.values()) unlisten();
		this.attached.clear();
	}

	attach(el: HTMLElement, render: HoverCardRender, direction: Direction = "up"): HoverCardHandle {
		this.attached.get(el)?.unlisten();
		const listeners: Array<[string, () => void]> = [
			[
				"pointerenter",
				() => {
					const on = this.pointerControl;
					if (!(on && on !== el && el.contains(on))) this.dispatch({ type: "enter", el });
				},
			],
			["pointerleave", () => this.dispatch({ type: "leave", el })],
			// A click focuses a button too; only keyboard focus shows the card.
			[
				"focus",
				() => {
					const returned = this.returning === el;
					this.returning = null;
					if (el.matches(":focus-visible")) this.dispatch({ type: "focus", el, returned });
				},
			],
			["blur", () => this.dispatch({ type: "blur", el })],
		];
		for (const [type, listener] of listeners) el.addEventListener(type, listener);
		const unlisten = () => {
			for (const [type, listener] of listeners) el.removeEventListener(type, listener);
		};
		this.attached.set(el, { render, direction, unlisten });
		return {
			refresh: () => this.refresh(el),
			detach: () => {
				if (this.attached.get(el)?.render !== render) return;
				unlisten();
				this.attached.delete(el);
				this.dispatch({ type: "removed", el });
			},
		};
	}

	/**
	 * The control under the pointer (`controlUnder`); `instanceOf` holds for
	 * nodes of a pop-out window.
	 */
	private controlAt(target: Node | null): HTMLElement | null {
		if (!target || typeof target.instanceOf !== "function" || !target.instanceOf(Element)) return null;
		const path: Array<PathNode<HTMLElement>> = [];
		for (let el: HTMLElement | null = target.instanceOf(HTMLElement) ? target : target.parentElement; el; el = el.parentElement) {
			path.push({ el, attached: this.attached.has(el), interactive: el.matches(CONTROL) });
			if (el === this.panelEl) break;
		}
		return controlUnder(path);
	}

	/** A popover opened: the card goes, and none arms or shows until it closes (DES-003 Popover and hover card). */
	popoverOpened(): void {
		this.dispatch({ type: "popover-opened" });
	}

	popoverClosed(): void {
		this.dispatch({ type: "popover-closed" });
	}

	/** A closing popover is about to focus `trigger`: that focus shows no card. */
	focusReturning(trigger: HTMLElement): void {
		this.returning = trigger;
		// Focusing an element that already has focus fires nothing; the mark lasts this task only.
		trigger.win.setTimeout(() => {
			if (this.returning === trigger) this.returning = null;
		}, 0);
	}

	private dispatch(event: HoverEvent<HTMLElement>): void {
		const next = hoverStep(this.state, event);
		if (next !== this.state) this.apply(next);
	}

	/** Moves to `next`: the delay, the card and the removal watch follow the change. */
	private apply(next: HoverState<HTMLElement>): void {
		const before = this.state;
		this.state = next;
		if (armedEl(before) !== armedEl(next)) {
			if (this.timer !== null) this.layerEl.win.clearTimeout(this.timer);
			this.timer = null;
			const el = armedEl(next);
			if (el)
				this.timer = this.layerEl.win.setTimeout(() => {
					this.timer = null;
					// Hidden meanwhile (a fit step): no card for an element that does not show.
					this.dispatch(el.isShown() ? { type: "elapsed", el } : { type: "removed", el });
				}, HOVER_DELAY_MS);
		}
		const hidden = shownEl(before);
		const shown = shownEl(next);
		if (hidden !== shown) {
			if (hidden) this.hide(hidden);
			if (shown) this.show(shown);
		}
		this.watch(next.phase === "armed" || next.phase === "shown");
	}

	private show(el: HTMLElement): void {
		const entry = this.attached.get(el);
		if (!entry) return;
		const id = `ai-agent-panel-hover-card-${++nextCardId}`;
		const card = this.layerEl.createDiv({ cls: "ai-agent-panel-hover-card", attr: { role: "tooltip", id } });
		this.cardEl = card;
		entry.render(card);
		el.setAttribute("aria-describedby", id);
		this.place(card, el);
	}

	private hide(el: HTMLElement): void {
		el.removeAttribute("aria-describedby");
		this.cardEl?.remove();
		this.cardEl = null;
	}

	/** The element's content changed: redraw a card that shows; one whose element no longer shows goes. */
	private refresh(el: HTMLElement): void {
		if (shownEl(this.state) !== el || !this.cardEl) return;
		if (!el.isShown()) {
			this.dispatch({ type: "removed", el });
			return;
		}
		const entry = this.attached.get(el);
		if (!entry) return;
		this.cardEl.empty();
		entry.render(this.cardEl);
		this.place(this.cardEl, el);
	}

	/** While a card waits or shows, its element leaving the DOM drops it. */
	private watch(on: boolean): void {
		if (on === (this.observer !== null)) return;
		if (!on) {
			this.observer?.disconnect();
			this.observer = null;
			return;
		}
		const Observer = (this.mainEl.win as typeof window).MutationObserver;
		this.observer = new Observer(() => {
			const state = this.state;
			if ((state.phase === "armed" || state.phase === "shown") && !state.el.isConnected)
				this.dispatch({ type: "removed", el: state.el });
		});
		this.observer.observe(this.mainEl, { childList: true, subtree: true });
	}

	/**
	 * Up from the element, or down from it for one in the top region or a
	 * column row with no room above; aligned as a popover is (DES-003 Popovers).
	 */
	private place(card: HTMLElement, el: HTMLElement): void {
		const main = this.mainEl.getBoundingClientRect();
		const anchor = el.getBoundingClientRect();
		const rtl = this.mainEl.win.getComputedStyle(this.mainEl).direction === "rtl";
		const size = card.getBoundingClientRect();
		const down = opensDown(this.attached.get(el)?.direction ?? "up", main, anchor, size.height);
		card.toggleClass("mod-down", down);
		if (down) card.setCssProps({ "--ai-agent-panel-hover-card-top": `${placeBelow(main, anchor).top}px` });
		else card.setCssProps({ "--ai-agent-panel-hover-card-bottom": `${placeAbove(main, anchor).bottom}px` });
		const start = placeInline(main, anchor, size.width, rtl);
		card.setCssProps({ "--ai-agent-panel-hover-card-start": `${start}px` });
	}
}
