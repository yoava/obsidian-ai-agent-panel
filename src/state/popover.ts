/**
 * The panel's one popover and one hover card (DES-003 Popover and hover
 * card): which popover is open, from which trigger, and where focus goes
 * after each event; which element's hover card waits or shows. Triggers and
 * elements are opaque here and compared by identity.
 */

export type PopoverState<T> =
	| { open: false }
	| {
			open: true;
			id: string;
			trigger: T;
			/** The control to focus by name, or null for the first control. */
			focus: string | null;
	  };

export const CLOSED: { open: false } = { open: false };

/** Where a pointer went down or focus went: into the popover, onto its trigger, or elsewhere. */
export type Place = "popover" | "trigger" | "outside";

export type PopoverEvent<T> =
	| { type: "activate"; id: string; trigger: T; focus?: string | null }
	| { type: "pointerdown"; on: Place }
	| { type: "escape" }
	| { type: "pick" }
	/** "nothing": the focused control was disabled or removed. */
	| { type: "focus"; to: Place | "nothing" }
	| { type: "trigger-removed"; focusInside: boolean }
	| { type: "trigger-hidden"; focusInside: boolean }
	/** `keepOpen`: the popover's content stays open across a tab switch (the open-tabs list closing the active tab). */
	| { type: "tab-changed"; focusInside: boolean; keepOpen?: boolean };

/**
 * Where the host moves focus: the opened popover's control, the trigger, the
 * dialog element, the composer, or nowhere (focus stays where it went).
 */
export type FocusMove = "target" | "trigger" | "dialog" | "composer" | "stay";

export interface PopoverStep<T> {
	/** The same object when nothing changed. */
	state: PopoverState<T>;
	focus: FocusMove;
}

export function popoverStep<T>(state: PopoverState<T>, event: PopoverEvent<T>): PopoverStep<T> {
	const stay = (next: PopoverState<T>): PopoverStep<T> => ({ state: next, focus: "stay" });
	if (event.type === "activate") {
		if (state.open && state.trigger === event.trigger) return { state: CLOSED, focus: "trigger" };
		return {
			state: { open: true, id: event.id, trigger: event.trigger, focus: event.focus ?? null },
			focus: "target",
		};
	}
	if (!state.open) return stay(state);
	switch (event.type) {
		case "pointerdown":
			return stay(event.on === "outside" ? CLOSED : state);
		case "escape":
		case "pick":
			return { state: CLOSED, focus: "trigger" };
		case "focus":
			if (event.to === "nothing") return { state, focus: "dialog" };
			return stay(event.to === "outside" ? CLOSED : state);
		case "tab-changed":
			if (event.keepOpen) return stay(state);
		// falls through
		case "trigger-removed":
		case "trigger-hidden":
			return { state: CLOSED, focus: event.focusInside ? "composer" : "stay" };
	}
}

/**
 * What the open popover's trigger losing its place means: removed when it left
 * the DOM, hidden when it no longer shows by any rule (an inline style, a fit
 * step's class, a container query, a hidden ancestor), else nothing.
 */
export function lostTrigger(connected: boolean, shown: boolean): "trigger-removed" | "trigger-hidden" | null {
	if (!connected) return "trigger-removed";
	return shown ? null : "trigger-hidden";
}

// --- Hover card ---------------------------------------------------------------

/** How long the pointer rests on an element before its hover card shows (PRD-001.R32). */
export const HOVER_DELAY_MS = 500;

export type HoverState<T> =
	| { phase: "idle" }
	/** A popover is open: no card arms or shows until it closes. */
	| { phase: "blocked" }
	/** The pointer rests on `el`; its card shows after `HOVER_DELAY_MS`. */
	| { phase: "armed"; el: T }
	| { phase: "shown"; el: T; by: "pointer" | "focus" };

export const HOVER_IDLE: { phase: "idle" } = { phase: "idle" };
const HOVER_BLOCKED: { phase: "blocked" } = { phase: "blocked" };

export type HoverEvent<T> =
	| { type: "enter"; el: T }
	| { type: "leave"; el: T }
	/** The pointer reached a control: an attached element, or any other interactive element of the panel. */
	| { type: "control"; el: T }
	/** `HOVER_DELAY_MS` passed since `el` was armed. */
	| { type: "elapsed"; el: T }
	/** Keyboard focus, not a click's; `returned` when a closing popover gave it back to its trigger. */
	| { type: "focus"; el: T; returned?: boolean }
	| { type: "blur"; el: T }
	| { type: "popover-opened" }
	| { type: "popover-closed" }
	| { type: "removed"; el: T };

/** The next hover state; the same object when nothing changed. */
export function hoverStep<T>(state: HoverState<T>, event: HoverEvent<T>): HoverState<T> {
	if (event.type === "popover-opened") return state.phase === "blocked" ? state : HOVER_BLOCKED;
	if (state.phase === "blocked") return event.type === "popover-closed" ? HOVER_IDLE : state;
	switch (event.type) {
		case "popover-closed":
			return state;
		case "removed":
			return state.phase !== "idle" && state.el === event.el ? HOVER_IDLE : state;
		case "focus":
			if (event.returned) return state;
			return state.phase === "shown" && state.by === "focus" && state.el === event.el
				? state
				: { phase: "shown", el: event.el, by: "focus" };
		case "blur":
			return state.phase === "shown" && state.by === "focus" && state.el === event.el ? HOVER_IDLE : state;
	}
	// The pointer reaching another control drops any card, one shown by focus too.
	switch (event.type) {
		case "control":
			return state.phase !== "idle" && state.el !== event.el ? HOVER_IDLE : state;
		case "enter":
			return state.phase !== "idle" && state.el === event.el ? state : { phase: "armed", el: event.el };
	}
	// Otherwise a card shown by focus stays until blur.
	if (state.phase === "shown" && state.by === "focus") return state;
	switch (event.type) {
		case "elapsed":
			return state.phase === "armed" && state.el === event.el ? { phase: "shown", el: event.el, by: "pointer" } : state;
		case "leave":
			return state.phase !== "idle" && state.el === event.el ? HOVER_IDLE : state;
	}
}

/** One element on the path from the pointer's target up to the panel. */
export interface PathNode<T> {
	el: T;
	/** It has a hover card. */
	attached: boolean;
	/** It is a control of its own: a button, a tab, a segment, a row. */
	interactive: boolean;
}

/**
 * The control under the pointer, given the path from the target up to the
 * panel: a control inside an attached element is its own control (a tab's
 * close button), else the attached element, its descendants counting as it,
 * else the nearest control; null when there is none (PRD-001.R32).
 */
export function controlUnder<T>(path: readonly PathNode<T>[]): T | null {
	let inner: T | null = null;
	for (const node of path) {
		if (node.attached) return inner ?? node.el;
		if (node.interactive && inner === null) inner = node.el;
	}
	return inner;
}

/**
 * Whether the pointer came back onto `control` from a control inside it (a
 * tab's close button): no `pointerenter` fires then, so the host arms the
 * card itself. Movement inside `control` from anywhere else is not a return
 * (PRD-001.R32).
 */
export function returnedFromInner<T>(from: T | null, control: T, contains: (outer: T, inner: T) => boolean): boolean {
	return from !== null && from !== control && contains(control, from);
}

/** A pointer position, as `clientX` and `clientY` give it. */
export interface Point {
	x: number;
	y: number;
}

/**
 * Whether the pointer moved since the last `pointerover` at `last`: one a
 * scroll or a content change fires under a still pointer reaches no control.
 */
export function pointerMoved(last: Point | null, now: Point): boolean {
	return last === null || last.x !== now.x || last.y !== now.y;
}

// --- Placement ------------------------------------------------------------------

/** A rectangle as `getBoundingClientRect` gives it. */
export interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
}

/** Space between a hover card and its trigger (px). */
const GAP = 4;
/** Space kept from the main column's edges (px): half of PRD-001.R32's 16. */
const EDGE = 8;
/** A popover's distance from its trigger (px): above the status line, below the changes chip (the boards' 8 and 6). */
export const POPOVER_GAP = { up: 8, down: 6 } as const;
/** A popover's distance from the main column's edges (px), where the column has room (the boards' 12). */
export const POPOVER_EDGE = 12;

/**
 * Up from the trigger (DES-003 Popovers): the distance from the main
 * column's bottom edge, and the height the space above the trigger allows.
 */
export function placeAbove(main: Box, anchor: Box, gap = GAP): { bottom: number; maxHeight: number } {
	return { bottom: main.bottom - anchor.top + gap, maxHeight: Math.max(0, anchor.top - main.top - gap - EDGE) };
}

/**
 * Down from a trigger in the top region (DES-003 Popovers): the distance from
 * the main column's top edge, and the height the space below the trigger
 * allows.
 */
export function placeBelow(main: Box, anchor: Box, gap = GAP): { top: number; maxHeight: number } {
	return { top: anchor.bottom - main.top + gap, maxHeight: Math.max(0, main.bottom - anchor.bottom - gap - EDGE) };
}

/**
 * Where a popover or hover card opens from its trigger: up from the composer
 * area, down from the top region, or, for a hover card beside the main
 * column (a conversation-column row), up where it fits, else down.
 */
export type Direction = "up" | "down" | "auto";

/** Whether a card `height` px tall opens down from `anchor`. */
export function opensDown(direction: Direction, main: Box, anchor: Box, height: number): boolean {
	if (direction !== "auto") return direction === "down";
	return placeAbove(main, anchor).maxHeight < height;
}

/**
 * The offset from the main column's inline-start edge: aligned to the
 * trigger's start edge when its centre is in the column's first half, else
 * to its end edge, kept `edge` inside the column (never below `EDGE`, and no
 * more than the room beside the card leaves), the start edge winning.
 */
export function placeInline(main: Box, anchor: Box, width: number, rtl: boolean, edge = EDGE): number {
	const triggerStart = rtl ? main.right - anchor.right : anchor.left - main.left;
	const fromStart = triggerStart + anchor.width / 2 < main.width / 2;
	const start = fromStart ? triggerStart : triggerStart + anchor.width - width;
	const inset = Math.min(edge, Math.max(EDGE, (main.width - width) / 2));
	return Math.max(inset, Math.min(start, main.width - inset - width));
}
