import { Component, type Events } from "obsidian";
import { titleBlock, type TitleBlockInput } from "../state/tabs";
import { iconButton, writeText, type OpenPopover } from "./dom";
import { MorePopover } from "./popovers/more";

export interface HeaderSource {
	/** The view's events: `active` and `tabs`. */
	viewEvents: Events;
	/** The shell's events: `layout`. */
	shellEvents: Events;
	isColumn: () => boolean;
	/** The active conversation as its title block shows it; null with no tab. */
	titleBlock: () => TitleBlockInput | null;
	/** The active conversation's exported note, if any. */
	exportPath: () => string | null;
}

export interface HeaderIntents {
	onNew: () => void;
	onHistory: () => void;
	onSettings: () => void;
	onExport: () => void;
	onTranscript: () => void;
	/** The popover host, opening down from the top region. */
	openPopover: OpenPopover;
}

/**
 * The header (DES-003 Header and changes bar): its nav area, where the view
 * mounts the tab strip and the switcher and where the column layout shows
 * the title block, and its buttons: "+", a divider, history and settings,
 * and "More" below a 360 px main column, which of them show being container
 * queries and the column's class. Its root is `display: contents`, so the
 * nav area, the actions and the changes bar are items of the top region's
 * grid.
 */
export class Header extends Component {
	readonly navEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private readonly metaEl: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly source: HeaderSource,
		intents: HeaderIntents
	) {
		super();
		const root = parent.createDiv({ cls: "ai-agent-panel-header" });
		this.navEl = root.createDiv({ cls: "ai-agent-panel-header-nav" });
		const block = this.navEl.createDiv({ cls: "ai-agent-panel-title-block" });
		this.titleEl = block.createDiv({ cls: "ai-agent-panel-title-block-title" });
		this.metaEl = block.createDiv({ cls: "ai-agent-panel-title-block-meta" });
		const actions = root.createDiv({ cls: "ai-agent-panel-header-actions" });
		iconButton(this, actions, "plus", "New conversation", intents.onNew, "bottom").addClass("mod-new");
		actions.createDiv({ cls: "ai-agent-panel-header-divider" });
		iconButton(this, actions, "history", "Previous conversations", intents.onHistory, "bottom").addClass(
			"mod-history"
		);
		iconButton(this, actions, "settings", "Plugin settings", intents.onSettings, "bottom").addClass(
			"mod-settings"
		);
		const more: HTMLButtonElement = iconButton(
			this,
			actions,
			["more-horizontal", "ellipsis"],
			"More",
			() =>
				intents.openPopover(
					more,
					"more",
					new MorePopover(this.source.exportPath() !== null, {
						onHistory: intents.onHistory,
						onTranscript: intents.onTranscript,
						onExport: intents.onExport,
						onSettings: intents.onSettings,
					})
				),
			"bottom"
		);
		more.addClass("mod-more");
		more.setAttribute("aria-haspopup", "dialog");
		more.setAttribute("aria-expanded", "false");
	}

	onload(): void {
		this.registerEvent(this.source.viewEvents.on("active", () => this.render()));
		this.registerEvent(this.source.viewEvents.on("tabs", () => this.render()));
		this.registerEvent(this.source.shellEvents.on("layout", () => this.render()));
		this.render();
	}

	/** The title block, drawn while the column shows (PRD-001.R30). */
	private render(): void {
		if (!this.source.isColumn()) return;
		const input = this.source.titleBlock();
		const view = input ? titleBlock(input, Date.now()) : { title: "", meta: "" };
		writeText(this.titleEl, view.title);
		writeText(this.metaEl, view.meta);
	}
}
