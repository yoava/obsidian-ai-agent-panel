import { Component, type Events } from "obsidian";
import type { EventAction, EventView } from "../state/event-view";
import { writeIcon } from "./dom";

/**
 * An event divider (DES-003 Compaction dividers; a compaction's, PRD-001.R37): a pill
 * between two waves, and under it the sub-line. In progress it is a status
 * and the waves run; finished it is a separator named with the time and the
 * token counts, with a "Summary" toggle where the CLI supplied one; a
 * compaction that did not finish reads as a status. The status element is
 * created empty and its text set afterwards, so a screen reader announces
 * the text; later redraws change it in place. Redrawn on `item:<id>`.
 */
let nextSummaryId = 0;

export class EventDivider<Item extends { id: number }> extends Component {
	readonly el: HTMLElement;
	private readonly lineEl: HTMLElement;
	private readonly iconEl: HTMLElement;
	private readonly labelEl: HTMLElement;
	private readonly subEl: HTMLElement;
	private boxEl: HTMLElement | null = null;
	private expanded = false;
	/** The summary drawn into the box, so a redraw does not render it again. */
	private rendered: string | null = null;

	constructor(
		parent: HTMLElement,
		private item: Item,
		private readonly describe: (item: Item) => EventView,
		private readonly tab: Events,
		private readonly renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>,
		/** The divider's button was pressed (not while it is disabled). */
		private readonly onAction?: () => void
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-event" });
		this.lineEl = this.el.createDiv({ cls: "ai-agent-panel-event-line" });
		this.lineEl.createSpan({ cls: "ai-agent-panel-event-wave" });
		const pill = this.lineEl.createSpan({ cls: "ai-agent-panel-event-pill" });
		this.iconEl = pill.createSpan({ cls: "ai-agent-panel-event-icon", attr: { "aria-hidden": "true" } });
		this.labelEl = pill.createSpan({ cls: "ai-agent-panel-event-label" });
		this.lineEl.createSpan({ cls: "ai-agent-panel-event-wave" });
		this.subEl = this.el.createDiv({ cls: "ai-agent-panel-event-sub" });
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.registerEvent(this.tab.on(`item:${this.item.id}`, (item) => this.draw(item as Item)));
		this.draw(this.item);
	}

	private draw(item: Item): void {
		this.item = item;
		const view = this.describe(item);
		const separator = view.role === "separator";
		this.el.dataset.phase = view.phase;
		this.el.dataset.tone = view.tone;
		// The rule and pill carry the role and the name, so the Summary button beside the sub-line stays reachable.
		this.lineEl.setAttrs({ role: view.role, "aria-label": view.aria });
		writeIcon(this.iconEl, view.icon);
		if (this.labelEl.textContent !== view.label) this.labelEl.setText(view.label);
		this.subEl.empty();
		this.subEl.toggleClass("is-empty", view.sub.length === 0 && !view.summary);
		for (const part of view.sub) {
			const hide = separator ? { "aria-hidden": "true" } : undefined;
			if (part.dot) this.subEl.createSpan({ text: "·", attr: hide });
			this.subEl.createSpan({ cls: part.mono ? "ai-agent-panel-event-mono" : undefined, text: part.text, attr: hide });
		}
		if (view.action) this.drawAction(view.action);
		if (view.summary) this.drawToggle();
		this.drawSummary(view.summary && this.expanded ? view.summaryText : null);
	}

	/** The divider's button after the sub-line (a clear's Undo, PRD-001.R38); a disabled one says why in its title. */
	private drawAction(action: EventAction): void {
		const button = this.subEl.createEl("button", {
			cls: "ai-agent-panel-event-action",
			attr: { type: "button", "aria-busy": String(action.busy) },
		});
		writeIcon(button.createSpan({ attr: { "aria-hidden": "true" } }), action.icon);
		button.createSpan({ text: action.label });
		// aria-disabled keeps the button focusable, so its title is reachable.
		button.setAttr("aria-disabled", String(action.disabled));
		if (action.title) button.setAttr("title", action.title);
		button.addEventListener("click", () => {
			if (!action.disabled) this.onAction?.();
		});
	}

	private drawToggle(): void {
		const toggle = this.subEl.createEl("button", {
			cls: "ai-agent-panel-event-toggle",
			attr: { type: "button", "aria-expanded": String(this.expanded) },
		});
		toggle.createSpan({ text: "Summary" });
		writeIcon(toggle.createSpan({ attr: { "aria-hidden": "true" } }), this.expanded ? "chevron-up" : "chevron-down");
		toggle.addEventListener("click", () => {
			this.expanded = !this.expanded;
			this.draw(this.item);
			this.subEl.querySelector<HTMLElement>(".ai-agent-panel-event-toggle")?.focus();
		});
	}

	/** The summary box under the sub-line, its text through the reply Markdown path (PRD-001.R17); gone for null. */
	private drawSummary(summary: string | null): void {
		if (summary === null) {
			this.boxEl?.remove();
			this.boxEl = null;
			this.rendered = null;
			return;
		}
		if (this.boxEl && this.rendered === summary) return;
		this.boxEl?.remove();
		const box = this.el.createDiv({ cls: "ai-agent-panel-event-summary" });
		const id = `ai-agent-panel-summary-${++nextSummaryId}`;
		box.createDiv({ cls: "ai-agent-panel-event-kept", text: "What Claude kept", attr: { id } });
		const text = box.createDiv({ cls: "ai-agent-panel-event-text" });
		this.boxEl = box;
		this.rendered = summary;
		// A tab stop, so the keyboard can scroll a long summary (a layout read is not allowed here, DES-001 P4).
		text.tabIndex = 0;
		text.setAttrs({ role: "region", "aria-labelledby": id });
		void this.renderMarkdown(summary, text).catch(() => text.setText(summary));
	}
}
