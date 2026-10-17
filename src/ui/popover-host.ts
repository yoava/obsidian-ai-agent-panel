import { Component, type Events } from "obsidian";
import {
	CLOSED,
	lostTrigger,
	placeAbove,
	placeBelow,
	placeInline,
	POPOVER_EDGE,
	POPOVER_GAP,
	popoverStep,
	type Direction,
	type FocusMove,
	type Place,
	type PopoverEvent,
	type PopoverState,
} from "../state/popover";
import { writeIcon, type PopoverContent, type PopoverFocus, type PopoverShell } from "./dom";

export interface PopoverHostSource {
	/** The view's events: `active` when the active tab changes. */
	viewEvents: Events;
	focusComposer: () => void;
	/** A popover opened: the hover card goes, and none shows while it is open (DES-003 Popover and hover card). */
	onShow: () => void;
	/** The popover closed. */
	onHide: () => void;
	/** Focus is about to return to `trigger`, which shows it no hover card. */
	onReturnFocus: (trigger: HTMLElement) => void;
}

let nextTitleId = 0;

/**
 * A DOM node from any window. Obsidian creates elements in the main document
 * and a pop-out adopts them, so `instanceof` the pop-out's `Node` fails.
 */
function isNode(target: EventTarget | null): target is Node {
	return !!target && typeof (target as Partial<Node>).nodeType === "number";
}

/**
 * The panel's one popover (DES-003 Popovers; ADR-016 Popovers): a dialog in
 * the main column's layer, named by its title, driven by `state/popover`'s
 * machine. It opens up from its trigger, placed and bounded once on open.
 * Its document listeners are added on open to the dialog's own document, so
 * a panel in a pop-out window is served there.
 */
export class PopoverHost extends Component {
	private state: PopoverState<HTMLElement> = CLOSED;
	private dialogEl: HTMLElement | null = null;
	private content: PopoverContent | null = null;
	private focusTargets: PopoverFocus = { first: null };
	private observer: MutationObserver | null = null;
	/** Sees the trigger hidden by any rule: its box goes to zero. */
	private triggerObserver: ResizeObserver | null = null;
	/** The document the listeners below are on while a popover shows. */
	private listenedDoc: Document | null = null;
	/** Focus went into the popover and has not moved to an element outside it since. */
	private focusWithin = false;
	/** Where the popover being opened goes from its trigger. */
	private direction: Exclude<Direction, "auto"> = "up";

	constructor(
		private readonly layerEl: HTMLElement,
		/** The main column: the popover's bounds, and where its trigger lives. */
		private readonly mainEl: HTMLElement,
		private readonly source: PopoverHostSource
	) {
		super();
	}

	/** The composer's Escape reads it (PRD-001.R11). */
	get isOpen(): boolean {
		return this.state.open;
	}

	/** Focus is inside an open popover that stays open across a tab switch: the switch must not take it to the composer. */
	get keepsFocus(): boolean {
		return this.state.open && this.content?.keepOpenOnTabChange === true && this.focusInside();
	}

	onload(): void {
		this.registerEvent(
			this.source.viewEvents.on("active", () =>
				this.dispatch({
					type: "tab-changed",
					focusInside: this.focusInside(),
					keepOpen: this.content?.keepOpenOnTabChange === true,
				})
			)
		);
	}

	onunload(): void {
		if (this.state.open) this.hide(this.state.trigger);
		this.state = CLOSED;
	}

	/**
	 * A trigger was activated: open `content` from it, focus on the control
	 * named `focus` or the first one; the open popover's own trigger closes it.
	 * It opens up from the composer area, or `down` from the top region.
	 */
	open(
		trigger: HTMLElement,
		id: string,
		content: PopoverContent,
		focus?: string,
		direction: Exclude<Direction, "auto"> = "up"
	): void {
		this.direction = direction;
		this.dispatch({ type: "activate", id, trigger, focus: focus ?? null }, content);
	}

	private readonly onPointerDown = (evt: PointerEvent): void =>
		this.dispatch({ type: "pointerdown", on: this.placeOf(evt.target) });

	private readonly onFocusIn = (evt: FocusEvent): void => this.dispatch({ type: "focus", to: this.placeOf(evt.target) });

	private readonly onKeyDown = (evt: KeyboardEvent): void => {
		if (evt.key !== "Escape" || evt.isComposing || !this.state.open) return;
		if (this.placeOf(evt.target) === "outside") return;
		evt.preventDefault();
		evt.stopPropagation();
		this.dispatch({ type: "escape" });
	};

	private dispatch(event: PopoverEvent<HTMLElement>, content?: PopoverContent): void {
		const before = this.state;
		if (!before.open && event.type !== "activate") return;
		const step = popoverStep(before, event);
		this.state = step.state;
		if (step.state !== before) {
			if (before.open) this.hide(before.trigger);
			if (step.state.open && content) this.show(step.state.trigger, content);
		}
		this.moveFocus(step.focus, before);
	}

	private moveFocus(move: FocusMove, before: PopoverState<HTMLElement>): void {
		const state = this.state;
		if (move === "target" && state.open) {
			const named = state.focus ? this.focusTargets.named?.[state.focus] : null;
			(named ?? this.focusTargets.first ?? this.dialogEl)?.focus();
		} else if (move === "trigger" && before.open) {
			this.source.onReturnFocus(before.trigger);
			before.trigger.focus();
		}
		else if (move === "dialog") this.dialogEl?.focus();
		else if (move === "composer") this.source.focusComposer();
	}

	private show(trigger: HTMLElement, content: PopoverContent): void {
		const titleId = `ai-agent-panel-popover-title-${++nextTitleId}`;
		const bodyId = `ai-agent-panel-popover-body-${nextTitleId}`;
		const dialog = this.layerEl.createDiv({
			cls: "ai-agent-panel-popover",
			attr: { role: content.alert ? "alertdialog" : "dialog", "aria-labelledby": titleId, tabindex: "-1" },
		});
		this.dialogEl = dialog;
		if (content.cls) dialog.addClass(content.cls);
		dialog.toggleClass("mod-menu", content.menu === true);
		const head = dialog.createDiv({ cls: "ai-agent-panel-popover-head" });
		if (content.alert)
			writeIcon(head.createSpan({ cls: "ai-agent-panel-popover-alert-icon", attr: { "aria-hidden": "true" } }), content.alert);
		const title = head.createDiv({ cls: "ai-agent-panel-popover-title", text: content.title, attr: { id: titleId } });
		if (content.titleHidden) {
			head.addClass("mod-bare");
			title.addClass("ai-agent-panel-visually-hidden");
		}
		const body = dialog.createDiv({ cls: "ai-agent-panel-popover-body" });
		if (content.alert) {
			body.id = bodyId;
			dialog.setAttribute("aria-describedby", bodyId);
		}
		const shell: PopoverShell = {
			meta: () => head.createDiv({ cls: "ai-agent-panel-popover-meta" }),
			footer: () => dialog.createDiv({ cls: "ai-agent-panel-popover-footer" }),
		};
		this.content = this.addChild(content);
		this.focusTargets = content.render(body, () => this.dispatch({ type: "pick" }), shell);
		const doc = dialog.doc;
		doc.addEventListener("pointerdown", this.onPointerDown, true);
		doc.addEventListener("focusin", this.onFocusIn);
		doc.addEventListener("keydown", this.onKeyDown);
		this.listenedDoc = doc;
		// Focus left to nothing: a disabled control fires focusout without a
		// target; a removed one may fire nothing, which the observer below sees.
		this.focusWithin = false;
		dialog.addEventListener("focusin", () => (this.focusWithin = true));
		dialog.addEventListener("focusout", (evt) => {
			if (evt.relatedTarget) {
				this.focusWithin = isNode(evt.relatedTarget) && dialog.contains(evt.relatedTarget);
				return;
			}
			dialog.win.setTimeout(() => this.checkFocusLost(dialog), 0);
		});
		this.place(dialog, trigger);
		this.source.onShow();
		trigger.setAttribute("aria-expanded", "true");
		trigger.addClass("is-open");
		// While open: the trigger leaving the DOM or hidden (`toggle(false)`, and
		// below a fit step's class or a container query, whose zero box the resize
		// observer reports) closes the popover; a focused control removed from it
		// leaves focus nowhere.
		const win = this.mainEl.win as typeof window;
		this.observer = new win.MutationObserver(() => {
			if (this.state.open && !this.closeIfTriggerLost(this.state.trigger.style.display !== "none"))
				this.checkFocusLost(dialog);
		});
		this.observer.observe(this.mainEl, { childList: true, subtree: true });
		this.observer.observe(trigger, { attributes: true, attributeFilter: ["style"] });
		// Its callback runs after layout, so reading whether the trigger shows costs no forced layout.
		this.triggerObserver = new win.ResizeObserver(() => {
			if (this.state.open) this.closeIfTriggerLost(this.state.trigger.isShown());
		});
		this.triggerObserver.observe(trigger);
	}

	/** Closes the popover when its trigger left the DOM or does not show; true when it did. */
	private closeIfTriggerLost(shown: boolean): boolean {
		if (!this.state.open) return false;
		const type = lostTrigger(this.state.trigger.isConnected, shown);
		if (type) this.dispatch({ type, focusInside: this.focusInside() });
		return type !== null;
	}

	/** Focus was inside `dialog`, which still shows, and is now nowhere (not a window switch). */
	private checkFocusLost(dialog: HTMLElement): void {
		const doc = dialog.doc;
		if (this.dialogEl !== dialog || !this.focusWithin || !doc.hasFocus()) return;
		if (doc.activeElement && doc.activeElement !== doc.body) return;
		this.dispatch({ type: "focus", to: "nothing" });
	}

	/**
	 * Up from the trigger, as tall as the space above it, or down from it, as
	 * tall as the space below it, aligned by `placeInline` (DES-003 Popovers);
	 * offsets run from the column's inline-start edge, as the CSS places it.
	 */
	private place(dialog: HTMLElement, trigger: HTMLElement): void {
		const main = this.mainEl.getBoundingClientRect();
		const anchor = trigger.getBoundingClientRect();
		const rtl = this.mainEl.win.getComputedStyle(this.mainEl).direction === "rtl";
		if (this.direction === "down") {
			const { top, maxHeight } = placeBelow(main, anchor, POPOVER_GAP.down);
			dialog.addClass("mod-down");
			dialog.setCssProps({
				"--ai-agent-panel-popover-top": `${top}px`,
				"--ai-agent-panel-popover-max-height": `${maxHeight}px`,
			});
		} else {
			const { bottom, maxHeight } = placeAbove(main, anchor, POPOVER_GAP.up);
			dialog.setCssProps({
				"--ai-agent-panel-popover-bottom": `${bottom}px`,
				"--ai-agent-panel-popover-max-height": `${maxHeight}px`,
			});
		}
		if (this.content?.fitTrigger) dialog.setCssProps({ "--ai-agent-panel-popover-width": `${anchor.width}px` });
		const start = placeInline(main, anchor, dialog.getBoundingClientRect().width, rtl, POPOVER_EDGE);
		dialog.setCssProps({ "--ai-agent-panel-popover-start": `${start}px` });
	}

	private hide(trigger: HTMLElement): void {
		this.observer?.disconnect();
		this.observer = null;
		this.triggerObserver?.disconnect();
		this.triggerObserver = null;
		const doc = this.listenedDoc;
		if (doc) {
			doc.removeEventListener("pointerdown", this.onPointerDown, true);
			doc.removeEventListener("focusin", this.onFocusIn);
			doc.removeEventListener("keydown", this.onKeyDown);
		}
		this.listenedDoc = null;
		if (this.content) this.removeChild(this.content);
		this.content = null;
		this.dialogEl?.remove();
		this.dialogEl = null;
		this.focusTargets = { first: null };
		trigger.setAttribute("aria-expanded", "false");
		trigger.removeClass("is-open");
		this.source.onHide();
	}

	private focusInside(): boolean {
		const active = this.dialogEl?.doc.activeElement ?? null;
		return !!active && !!this.dialogEl?.contains(active);
	}

	private placeOf(target: EventTarget | null): Place {
		const state = this.state;
		if (!state.open || !isNode(target)) return "outside";
		if (this.dialogEl?.contains(target)) return "popover";
		return state.trigger.contains(target) ? "trigger" : "outside";
	}
}
