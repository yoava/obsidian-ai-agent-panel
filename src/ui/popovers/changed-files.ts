import { Component, type Events } from "obsidian";
import type { ChangedFile } from "../../edit-tracker";
import { syncChildren, writeIcon, writeText, writeTooltip, type PopoverContent, type PopoverFocus, type PopoverShell } from "../dom";

/** "Restore to before turn N" as `restore`'s `restoreBefore` gives it. */
export interface RestoreBeforeView {
	label: string;
	title: string;
	disabled: boolean;
}

export interface ChangedFilesSource {
	/** The tab's change list: `changes`. */
	changes: Events;
	/** The tab's events: `turn` and `status`, which change whether the restore is offered or enabled. */
	tabEvents: Events;
	/** The tab's restore and branch: `restore`, when its turns or a running restore change. */
	restoreEvents: Events;
	files: () => readonly ChangedFile[];
	restoreBefore: () => RestoreBeforeView | null;
}

export interface ChangedFilesIntents {
	onOpenFile: (path: string) => void;
	onReviewChanges: () => void;
	onRestoreBefore: () => void;
}

let nextRestoreId = 0;

/**
 * "Files this conversation changed" (PRD-002.R7, R18): each file with its
 * `+x -y` and "new" when the conversation created it, opening the file;
 * "Review changes"; "Restore to before turn N" while offered. It follows the
 * tab's change list, turn, status and restore while open.
 */
export class ChangedFilesPopover extends Component implements PopoverContent {
	readonly title = "Files this conversation changed";
	readonly titleHidden = true;
	readonly menu = true;
	private listEl: HTMLElement | null = null;
	private restoreEl: HTMLButtonElement | null = null;
	private restoreLabelEl: HTMLElement | null = null;
	private restoreTitleEl: HTMLElement | null = null;
	private readonly rows = new Map<string, { el: HTMLButtonElement; key: string }>();
	private picked: () => void = () => {};

	constructor(
		private readonly source: ChangedFilesSource,
		private readonly intents: ChangedFilesIntents
	) {
		super();
	}

	render(el: HTMLElement, picked: () => void, shell: PopoverShell): PopoverFocus {
		this.picked = picked;
		this.listEl = el.createDiv({ cls: "ai-agent-panel-changed-files" });
		const footer = shell.footer();
		footer.addClass("mod-wrap");
		const review = footer.createEl("button", {
			cls: "ai-agent-panel-text-button",
			attr: { type: "button" },
			text: "Review changes",
		});
		this.registerDomEvent(review, "click", () => {
			picked();
			this.intents.onReviewChanges();
		});
		const id = `ai-agent-panel-restore-before-${++nextRestoreId}`;
		const restore = footer.createEl("button", {
			cls: "ai-agent-panel-text-button mod-restore-before",
			attr: { type: "button", "aria-labelledby": `${id}-label`, "aria-describedby": `${id}-title` },
		});
		writeIcon(restore.createSpan({ cls: "ai-agent-panel-text-button-icon", attr: { "aria-hidden": "true" } }), "rotate-ccw");
		this.restoreLabelEl = restore.createSpan({ attr: { id: `${id}-label` } });
		this.restoreTitleEl = restore.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: `${id}-title` } });
		this.restoreEl = restore;
		this.registerDomEvent(restore, "click", () => {
			picked();
			this.intents.onRestoreBefore();
		});
		this.registerEvent(this.source.changes.on("changes", () => this.draw()));
		this.registerEvent(this.source.tabEvents.on("turn", () => this.draw()));
		this.registerEvent(this.source.tabEvents.on("status", () => this.draw()));
		this.registerEvent(this.source.restoreEvents.on("restore", () => this.draw()));
		this.draw();
		return { first: this.listEl.querySelector<HTMLElement>(".ai-agent-panel-changed-file") ?? review };
	}

	private draw(): void {
		const listEl = this.listEl;
		if (!listEl) return;
		const files = this.source.files();
		syncChildren(
			listEl,
			files.map((file) => this.row(file))
		);
		for (const path of [...this.rows.keys()])
			if (!files.some((file) => file.path === path)) this.rows.delete(path);
		const offer = this.source.restoreBefore();
		const restore = this.restoreEl;
		if (!restore || !this.restoreLabelEl || !this.restoreTitleEl) return;
		restore.toggle(offer !== null);
		if (!offer) return;
		writeText(this.restoreLabelEl, offer.label);
		writeText(this.restoreTitleEl, offer.title);
		// Titled as PRD-002.R18 asks; named by its label (`aria-labelledby` wins over the tooltip's `aria-label`), described by the title.
		writeTooltip(restore, offer.title);
		restore.disabled = offer.disabled;
	}

	/** A file's row, redrawn only when what it shows changed. */
	private row(file: ChangedFile): HTMLButtonElement {
		const key = `${file.created}\u0000${file.added}\u0000${file.removed}`;
		const known = this.rows.get(file.path);
		if (known?.key === key) return known.el;
		const el = known?.el ?? this.newRow(file.path);
		el.empty();
		const name = el.createSpan({ cls: "ai-agent-panel-changed-file-name" });
		name.createSpan({ cls: "ai-agent-panel-changed-file-path", text: file.path });
		if (file.created) name.createSpan({ cls: "ai-agent-panel-changed-file-new", text: "new" });
		const stat = el.createSpan({ cls: "ai-agent-panel-changed-file-stat" });
		if (file.added) stat.createSpan({ cls: "ai-agent-panel-stat-added", text: `+${file.added}` });
		if (file.removed) stat.createSpan({ cls: "ai-agent-panel-stat-removed", text: `\u2212${file.removed}` });
		this.rows.set(file.path, { el, key });
		return el;
	}

	private newRow(path: string): HTMLButtonElement {
		const el = createEl("button", {
			cls: "ai-agent-panel-changed-file",
			attr: { type: "button" },
		});
		this.registerDomEvent(el, "click", () => {
			this.picked();
			this.intents.onOpenFile(path);
		});
		return el;
	}
}
