import { Component, type Events } from "obsidian";
import type { ChangedFile, ChangeTotals } from "../edit-tracker";
import { Follower, hiddenText, writeClass, writeIcon, writeText, writeTooltip, type OpenPopover } from "./dom";
import { ChangedFilesPopover, type RestoreBeforeView } from "./popovers/changed-files";
import type { ResizePass } from "./shell";

/** A tab's change list (`tab/edit-tracker`), firing `changes`. */
export interface ChangeListSource extends Events {
	readonly files: readonly ChangedFile[];
	readonly totals: ChangeTotals;
}

export interface ChangesBarSource {
	/** The view's events: `active`, `tabs` (a reopen or a detach changes the conversation) and `export`. */
	viewEvents: Events;
	/** The active tab's change list. */
	changes: () => ChangeListSource | null;
	/** The active tab's events (`turn`, `status`), which the changed-files popover follows. */
	tabEvents: () => Events | null;
	/** The active tab's restore and branch (`restore`), which the changed-files popover follows. */
	restoreEvents: () => Events | null;
	/** The bar entering or leaving the header row changes the room the strip has (its overflow check). */
	resizePass: ResizePass;
	/** The active conversation's exported note, if any. */
	exportPath: () => string | null;
	/** The active tab's "Restore to before turn N", or null while it is left out. */
	restoreBefore: () => RestoreBeforeView | null;
}

export interface ChangesBarIntents {
	/** The popover host, opening down from the top region. */
	openPopover: OpenPopover;
	onReviewChanges: () => void;
	onRestoreBefore: () => void;
	onTranscript: () => void;
	onOpenFile: (path: string) => void;
}

let nextBarId = 0;

/**
 * The changes bar (DES-003 Header and changes bar; PRD-002.R7, PRD-003.R11):
 * while the active conversation has changed files or an exported note, the
 * changes chip `N files +x -y`, opening "Files this conversation changed",
 * and "Transcript". It is a grid item of the top region: under the header, or
 * in its row while the column shows or the panel is short, where Transcript
 * is an icon; below a 360 px main column the chip drops its file count and
 * Transcript moves into "More". Each of those is a container query or the
 * column's class.
 */
export class ChangesBar extends Component {
	private readonly rootEl: HTMLElement;
	private readonly chipEl: HTMLButtonElement;
	private readonly chipLabelEl: HTMLElement;
	private readonly filesEl: HTMLElement;
	private readonly addedEl: HTMLElement;
	private readonly removedEl: HTMLElement;
	private readonly transcriptEl: HTMLButtonElement;
	private readonly follower: Follower<ChangeListSource, "changes">;

	constructor(
		parent: HTMLElement,
		private readonly source: ChangesBarSource,
		private readonly intents: ChangesBarIntents
	) {
		super();
		const id = `ai-agent-panel-changes-${++nextBarId}`;
		this.rootEl = parent.createDiv({ cls: "ai-agent-panel-changes-bar" });
		this.chipEl = this.rootEl.createEl("button", {
			cls: "ai-agent-panel-changes-chip",
			attr: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-labelledby": `${id}-chip` },
		});
		this.chipLabelEl = this.chipEl.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: `${id}-chip` } });
		writeIcon(this.chipEl.createSpan({ cls: "ai-agent-panel-changes-icon", attr: { "aria-hidden": "true" } }), "file-diff");
		this.filesEl = this.chipEl.createSpan({ cls: "ai-agent-panel-changes-files", attr: { "aria-hidden": "true" } });
		this.addedEl = this.chipEl.createSpan({ cls: "ai-agent-panel-stat-added", attr: { "aria-hidden": "true" } });
		this.removedEl = this.chipEl.createSpan({ cls: "ai-agent-panel-stat-removed", attr: { "aria-hidden": "true" } });
		hiddenText(this.chipEl, "aria-describedby", "Show the files this conversation changed");
		this.transcriptEl = this.rootEl.createEl("button", {
			cls: "ai-agent-panel-changes-transcript",
			attr: { type: "button", "aria-labelledby": `${id}-transcript` },
		});
		writeIcon(
			this.transcriptEl.createSpan({ cls: "ai-agent-panel-changes-icon", attr: { "aria-hidden": "true" } }),
			"file-text"
		);
		this.transcriptEl.createSpan({
			cls: "ai-agent-panel-changes-transcript-label",
			text: "Transcript",
			attr: { id: `${id}-transcript` },
		});
		hiddenText(this.transcriptEl, "aria-describedby", "Open the exported note");
		// Shows only while its label hides (`--no-tooltip` in styles.css, PRD-001.R32); `aria-labelledby` keeps the name.
		writeTooltip(this.transcriptEl, "Transcript", "bottom");
		this.follower = new Follower(this, { changes: () => this.render() });
		this.registerDomEvent(this.chipEl, "click", () => this.openChangedFiles());
		this.registerDomEvent(this.transcriptEl, "click", () => intents.onTranscript());
	}

	onload(): void {
		this.register(() => this.rootEl.remove());
		const follow = (): void => {
			this.follower.follow(this.source.changes());
			this.render();
		};
		this.registerEvent(this.source.viewEvents.on("active", follow));
		this.registerEvent(this.source.viewEvents.on("tabs", () => this.render()));
		this.registerEvent(this.source.viewEvents.on("export", () => this.render()));
		follow();
	}

	private render(): void {
		const totals = this.follower.current?.totals ?? { files: 0, added: 0, removed: 0 };
		// Which parts show, and where, is CSS: the classes, the column's and two container queries.
		const changed = totals.files > 0;
		const exported = this.source.exportPath() !== null;
		// In the header row the bar takes room from the strip, which re-checks its overflow in the pass.
		if (changed !== this.rootEl.hasClass("has-changes") || exported !== this.rootEl.hasClass("has-transcript"))
			this.source.resizePass.requestPass();
		writeClass(this.rootEl, "has-changes", changed);
		writeClass(this.rootEl, "has-transcript", exported);
		if (totals.files === 0) return;
		const files = `${totals.files} ${totals.files === 1 ? "file" : "files"}`;
		const added = totals.added ? `+${totals.added}` : "";
		const removed = totals.removed ? `-${totals.removed}` : "";
		writeText(this.filesEl, files);
		writeText(this.addedEl, added);
		writeText(this.removedEl, removed);
		writeText(this.chipLabelEl, [files, added, removed].filter(Boolean).join(" "));
	}

	/** "Files this conversation changed", down from the chip. */
	private openChangedFiles(): void {
		const changes = this.follower.current;
		const tabEvents = this.source.tabEvents();
		const restoreEvents = this.source.restoreEvents();
		if (!changes || !tabEvents || !restoreEvents) return;
		this.intents.openPopover(
			this.chipEl,
			"changed-files",
			new ChangedFilesPopover(
				{
					changes,
					tabEvents,
					restoreEvents,
					files: () => changes.files,
					restoreBefore: () => this.source.restoreBefore(),
				},
				{
					onOpenFile: this.intents.onOpenFile,
					onReviewChanges: this.intents.onReviewChanges,
					onRestoreBefore: this.intents.onRestoreBefore,
				}
			)
		);
	}
}
