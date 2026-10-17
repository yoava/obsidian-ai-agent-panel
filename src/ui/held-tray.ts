import { Component, type Events } from "obsidian";
import { heldRows, type HeldInput, type HeldRow } from "../state/held-rows";
import { isCommandText } from "../state/composer";
import { writeClass, writeIcon, writeText } from "./dom";

/** Ids for the status lines "Cancel" is described by; an id may repeat across panels' documents, never within one. */
let statusIds = 0;

/** One drawn row: its element and the parts that change. */
interface RowView {
	el: HTMLElement;
	bubbleEl: HTMLElement;
	textEl: HTMLElement;
	statusEl: HTMLElement;
	cancelEl: HTMLButtonElement;
}

/**
 * The held tray (DES-003 Held messages, PRD-001.R38): after the working
 * line, the `/clear` sent while a turn runs and the messages sent behind it,
 * each a dashed, dimmed bubble with its status line under it, and "Cancel"
 * on the `/clear`. A row is drawn once and changed in place, so a focused
 * "Cancel" keeps focus while rows come and go around it. Redrawn on the
 * tab's `held` event.
 */
export class HeldTray extends Component {
	readonly el: HTMLElement;
	private readonly rows = new Map<string, RowView>();

	constructor(
		parent: HTMLElement,
		private readonly tab: Events,
		private readonly held: () => HeldInput,
		/** "Cancel" on the held `/clear`. */
		private readonly onCancel: () => void,
		/** The tray changing height changes the messages' scroll-follow. */
		private readonly follow: () => void
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-held", attr: { role: "group" } });
		this.el.toggle(false);
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.registerEvent(this.tab.on("held", () => this.draw()));
		this.draw();
	}

	private draw(): void {
		const wanted = heldRows(this.held());
		const keys = new Set(wanted.map((row) => row.key));
		for (const [key, view] of this.rows)
			if (!keys.has(key)) {
				view.el.remove();
				this.rows.delete(key);
			}
		wanted.forEach((row, at) => {
			const view = this.rows.get(row.key) ?? this.addRow(row.key);
			this.drawRow(view, row);
			// Only a row out of place moves, so a focused button is not dropped.
			if (this.el.children[at] !== view.el) this.el.insertBefore(view.el, this.el.children[at] ?? null);
		});
		this.el.toggle(wanted.length > 0);
		this.follow();
	}

	private addRow(key: string): RowView {
		const el = this.el.createDiv({ cls: "ai-agent-panel-held-row" });
		const bubbleEl = el.createDiv({ cls: "ai-agent-panel-held-bubble" });
		const textEl = bubbleEl.createSpan({ cls: "ai-agent-panel-held-text" });
		const line = el.createDiv({ cls: "ai-agent-panel-held-line" });
		writeIcon(line.createSpan({ cls: "ai-agent-panel-held-mark", attr: { "aria-hidden": "true" } }), ["circle-dashed"]);
		// Plain text: the panel's one live region says what changed (ui/announcer).
		const statusEl = line.createSpan({ cls: "ai-agent-panel-held-status", attr: { id: `ai-agent-panel-held-status-${++statusIds}` } });
		const cancelEl = line.createEl("button", {
			cls: "ai-agent-panel-held-cancel",
			text: "Cancel",
			attr: { type: "button", "aria-describedby": statusEl.id },
		});
		cancelEl.addEventListener("click", () => this.onCancel());
		const view = { el, bubbleEl, textEl, statusEl, cancelEl };
		this.rows.set(key, view);
		return view;
	}

	private drawRow(view: RowView, row: HeldRow): void {
		writeText(view.textEl, row.text);
		writeClass(view.bubbleEl, "is-command", isCommandText(row.text));
		writeText(view.statusEl, row.status);
		view.cancelEl.toggle(row.cancel);
	}
}
