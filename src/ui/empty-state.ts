import { Component, type Events } from "obsidian";
import { AGENT_ICON } from "../state/agent-icon";
import { starters, type Starter } from "../state/prompts";
import { onOwnDocument, syncChildren, writeIcon } from "./dom";

export interface EmptyStateSource {
	/** The workspace's events: `active-leaf-change`. */
	workspaceEvents: Events;
	/** The open note, and whether its editor has a selection (PRD-001.R35). */
	context: () => { note: { name: string; path: string } | null; selection: boolean };
}

export interface EmptyStateIntents {
	/** A starter's prompt goes into the composer, unsent. */
	onStarter: (prompt: string) => void;
}

/**
 * The empty conversation (DES-003 Empty conversation): PRD-001.R35's heading
 * and line, then the starters for the open note and selection, re-evaluated
 * on `active-leaf-change` and `selectionchange`, once per frame, while
 * shown.
 */
export class EmptyState extends Component {
	readonly el: HTMLElement;
	private readonly startersEl: HTMLElement;
	private readonly listEl: HTMLElement;
	private shown = false;
	private frame: number | null = null;
	/** The starters drawn, as their prompts, so an unchanged set writes nothing. */
	private key = "";

	constructor(
		parent: HTMLElement,
		private readonly source: EmptyStateSource,
		private readonly intents: EmptyStateIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-empty" });
		this.el.toggle(false);
		writeIcon(this.el.createDiv({ cls: "ai-agent-panel-empty-mark", attr: { "aria-hidden": "true" } }), AGENT_ICON);
		this.el.createEl("h2", { cls: "ai-agent-panel-empty-heading", text: "Ask about your vault" });
		this.el.createDiv({
			cls: "ai-agent-panel-empty-line",
			text: "Summarize, refactor, link or draft notes. Claude reads and edits files only with your permission.",
		});
		this.startersEl = this.el.createDiv({ cls: "ai-agent-panel-starters" });
		this.startersEl.createDiv({ cls: "ai-agent-panel-starters-label", text: "From the open note" });
		this.listEl = this.startersEl.createDiv({ cls: "ai-agent-panel-starters-list" });
		this.startersEl.toggle(false);
	}

	onload(): void {
		this.register(() => {
			if (this.frame !== null) this.el.win.cancelAnimationFrame(this.frame);
			this.el.remove();
		});
		this.registerEvent(this.source.workspaceEvents.on("active-leaf-change", () => this.schedule()));
		onOwnDocument(this, this.el, "selectionchange", () => this.schedule());
	}

	/** Shown while its tab has no messages and is the one showing. */
	setShown(shown: boolean): void {
		if (shown === this.shown) return;
		this.shown = shown;
		this.el.toggle(shown);
		if (shown) this.refresh();
	}

	private schedule(): void {
		if (!this.shown || this.frame !== null) return;
		this.frame = this.el.win.requestAnimationFrame(() => {
			this.frame = null;
			if (this.shown) this.refresh();
		});
	}

	private refresh(): void {
		const { note, selection } = this.source.context();
		const offered = starters(note, selection);
		const key = offered.map((starter) => starter.prompt).join("\n");
		if (key === this.key) return;
		this.key = key;
		this.startersEl.toggle(offered.length > 0);
		syncChildren(
			this.listEl,
			offered.map((starter) => this.starter(starter))
		);
	}

	private starter(starter: Starter): HTMLElement {
		const button = createEl("button", { cls: "ai-agent-panel-starter", attr: { type: "button" } });
		writeIcon(button.createSpan({ cls: "ai-agent-panel-starter-tile", attr: { "aria-hidden": "true" } }), starter.icon);
		const text = button.createSpan({ cls: "ai-agent-panel-starter-text", text: starter.label });
		if (starter.note) {
			text.appendText(" ");
			text.createEl("strong", { text: starter.note });
		}
		writeIcon(button.createSpan({ cls: "ai-agent-panel-starter-chevron", attr: { "aria-hidden": "true" } }), "chevron-right");
		// The button's own listener goes with it when the starters change.
		button.addEventListener("click", () => this.intents.onStarter(starter.prompt));
		return button;
	}
}
