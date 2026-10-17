import { Component } from "obsidian";
import { iconButton, writeIcon, type PopoverContent, type PopoverFocus } from "../dom";

/** A chip "+N" hides, as its row in the list shows it. */
export interface HiddenChip {
	/** Stable while the chip lives, so focus stays on its row across a redraw. */
	key: string;
	icon: string;
	name: string;
	/** "Remove <name>" or "Turn off <name>". */
	actionLabel: string;
	act: () => void;
}

/**
 * "Hidden context" (PRD-001.R30): the chips the one-line form hides behind
 * "+N", each with its remove or turn-off button. The composer redraws it
 * while open; once nothing is hidden "+N" goes, and the host closes it.
 */
export class ChipsPopover extends Component implements PopoverContent {
	readonly title = "Hidden context";
	readonly menu = true;
	private listEl: HTMLElement | null = null;
	/** The current drawing's listeners, released when it is redrawn. */
	private drawing: Component | null = null;
	private drawn = "";
	private buttons: { key: string; el: HTMLButtonElement }[] = [];

	constructor(private readonly hidden: () => readonly HiddenChip[]) {
		super();
	}

	render(el: HTMLElement): PopoverFocus {
		this.listEl = el.createDiv({ cls: "ai-agent-panel-hidden-chips", attr: { role: "list" } });
		this.draw();
		return { first: this.buttons[0]?.el ?? null };
	}

	/** The hidden chips changed: focus stays on its row's button, or moves to the row now in its place. */
	redraw(): void {
		const listEl = this.listEl;
		if (!listEl) return;
		// No `instanceof`: a pop-out window's elements fail the main window's.
		const focused = listEl.doc.activeElement;
		const at = this.buttons.findIndex((button) => button.el === focused);
		const key = at >= 0 ? this.buttons[at].key : null;
		if (!this.draw() || at < 0) return;
		const target = this.buttons.find((button) => button.key === key) ?? this.buttons[Math.min(at, this.buttons.length - 1)];
		// The popover was placed when it opened; a panel resized since must not scroll to it.
		target?.el.focus({ preventScroll: true });
	}

	/** Draws the rows; false when they are as drawn. */
	private draw(): boolean {
		const listEl = this.listEl;
		if (!listEl) return false;
		const chips = this.hidden();
		const drawn = JSON.stringify(chips.map(({ key, icon, name, actionLabel }) => [key, icon, name, actionLabel]));
		if (drawn === this.drawn) return false;
		this.drawn = drawn;
		listEl.empty();
		if (this.drawing) this.removeChild(this.drawing);
		const drawing = this.addChild(new Component());
		this.drawing = drawing;
		this.buttons = chips.map((chip) => {
			const row = listEl.createDiv({ cls: "ai-agent-panel-hidden-chip", attr: { role: "listitem" } });
			writeIcon(row.createSpan({ cls: "ai-agent-panel-hidden-chip-icon", attr: { "aria-hidden": "true" } }), chip.icon);
			row.createSpan({ cls: "ai-agent-panel-hidden-chip-name", text: chip.name });
			const button = iconButton(drawing, row, "x", chip.actionLabel, () => chip.act());
			return { key: chip.key, el: button };
		});
		return true;
	}
}
