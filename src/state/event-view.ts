/**
 * What an event divider draws (DES-003 Context-event dividers): the data both
 * the compaction and the clear divider are drawn from by `ui/event-divider`.
 * Types only.
 */

/** One piece of the divider's sub-line: `dot` puts a "·" before it, `mono` sets it in the mono font. */
export interface SubPart {
	text: string;
	mono?: boolean;
	dot?: boolean;
}

/** A button on the divider's sub-line (a clear's Undo, PRD-001.R38). */
export interface EventAction {
	label: string;
	/** Icon names, the first the bundled set draws. */
	icon: readonly string[];
	disabled: boolean;
	/** Its tooltip, explaining why it is disabled; null for none. */
	title: string | null;
	/** The action is under way: the button is disabled and announced as busy. */
	busy: boolean;
}

export interface EventView {
	/** The divider's `data-phase`, which the styles key on. */
	phase: string;
	/** A divider in progress is a status, a finished one a separator (PRD-001.R28). */
	role: "status" | "separator";
	tone: "accent" | "warning";
	/** Icon names, the first the bundled set draws. */
	icon: readonly string[];
	spinning: boolean;
	label: string;
	sub: SubPart[];
	aria: string;
	/** Offers the Summary toggle. */
	summary: boolean;
	/** The text the toggle opens, null when there is none. */
	summaryText: string | null;
	/** A button after the sub-line; absent for none. */
	action?: EventAction | null;
}
