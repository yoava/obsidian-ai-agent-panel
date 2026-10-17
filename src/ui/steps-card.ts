import { Component } from "obsidian";
import { stepViewerImages } from "../state/image-viewer";
import { editStat, groupHeader, headShown, rowMark } from "../state/step-groups";
import type { StepRow, StepsBlock } from "../state/tab";
import { jsonPreview, summarizeToolInput, toolDisplayName, toolIcon } from "../tool-labels";
import { syncChildren, thumbButtons, writeAttr, writeClass, writeIcon, writeMark, writeText, type ViewImages } from "./dom";

/** A row's input in its details is cut to this (PRD-001.R16). */
const INPUT_CHARS = 2000;

export interface StepsCardIntents {
	/**
	 * An edit's diff into `el`, which is on the page: from the file as read
	 * to `after`, or of the call's own strings when `after` is null; false
	 * when the call has none (DES-004 Diff sources).
	 */
	renderDiff: (el: HTMLElement, name: string, input: Record<string, unknown>, before: string | null, after: string | null) => boolean;
	/** A file path a call reports, vault-relative when it is inside the vault, else null (a row's summary). */
	toVaultPath: (reported: string) => string | null;
	viewImages: ViewImages;
}

/** One drawn row: its parts, whether its details show, and the row they were drawn from. */
interface RowView {
	row: StepRow;
	el: HTMLElement;
	button: HTMLButtonElement;
	tile: HTMLElement;
	summary: HTMLElement;
	count: HTMLElement;
	stat: HTMLElement;
	added: HTMLElement;
	removed: HTMLElement;
	mark: HTMLElement;
	details: HTMLElement;
	expanded: boolean;
	drawn: StepRow | null;
}

let nextId = 0;

/**
 * A tool-step group (DES-003 Tool steps; PRD-001.R16): one call as a single
 * row; two or more as rows alone while they work, then under a header button
 * with the group's mark, "N steps" and its duration, open until the user
 * closes it. A row is a button with the tool's icon tile, name, summary, a
 * mark (dots while it runs, none once done), count and an edit's `+x -y`; it
 * toggles its details: the input as JSON, then an edit's diff or the result,
 * and the images the tool returned. Every text is the model's or the tool's,
 * set as text.
 */
export class StepsCard extends Component {
	readonly el: HTMLElement;
	private readonly headEl: HTMLButtonElement;
	private readonly headMarkEl: HTMLElement;
	private readonly headLabelEl: HTMLElement;
	private readonly headDurationEl: HTMLElement;
	private readonly rowsEl: HTMLElement;
	private readonly rows = new Map<string, RowView>();
	private expanded: boolean;

	constructor(
		parent: HTMLElement,
		private block: StepsBlock,
		private readonly intents: StepsCardIntents
	) {
		super();
		this.el = parent.createDiv({ cls: "ai-agent-panel-steps" });
		const rowsId = `ai-agent-panel-steps-${++nextId}`;
		this.headEl = this.el.createEl("button", {
			cls: "ai-agent-panel-steps-head",
			attr: { type: "button", "aria-controls": rowsId },
		});
		this.headMarkEl = this.headEl.createSpan({ cls: "ai-agent-panel-step-mark" });
		this.headLabelEl = this.headEl.createSpan({ cls: "ai-agent-panel-steps-label" });
		this.headDurationEl = this.headEl.createSpan({ cls: "ai-agent-panel-steps-duration" });
		writeIcon(this.headEl.createSpan({ cls: "ai-agent-panel-steps-chevron", attr: { "aria-hidden": "true" } }), "chevron-down");
		this.rowsEl = this.el.createDiv({ cls: "ai-agent-panel-steps-rows", attr: { id: rowsId } });
		this.expanded = true;
	}

	onload(): void {
		this.register(() => this.el.remove());
		this.registerDomEvent(this.headEl, "click", () => {
			this.expanded = !this.expanded;
			this.draw();
		});
		this.draw();
	}

	update(block: StepsBlock): void {
		if (block === this.block) return;
		this.block = block;
		this.draw();
	}

	private draw(): void {
		const doc = this.el.doc;
		const hadFocus = this.rowsEl.contains(doc.activeElement);
		const header = groupHeader(this.block);
		// Two or more calls working are rows alone; the header comes when they are done.
		const headed = header !== null && headShown(header);
		this.headEl.toggle(headed);
		writeClass(this.el, "is-single", header === null);
		if (header && headed) {
			writeMark(this.headMarkEl, header.mark);
			writeText(this.headLabelEl, header.label);
			writeText(this.headDurationEl, header.duration ?? "");
			writeAttr(this.headEl, "aria-expanded", String(this.expanded));
			writeClass(this.el, "is-collapsed", !this.expanded);
		} else writeClass(this.el, "is-collapsed", false);
		const rowsShown = !headed || this.expanded;
		this.rowsEl.toggle(rowsShown);
		this.drawRows();
		// A focused row the group collapsed over, or a card took: focus goes to the header, else the first row.
		if (hadFocus && (!rowsShown || !this.rowsEl.contains(doc.activeElement)))
			(headed ? this.headEl : this.rowsEl.querySelector<HTMLElement>(".ai-agent-panel-step-row"))?.focus();
	}

	/** Keyed by tool-use id, or by place once reopened; rows a card took out leave. */
	private drawRows(): void {
		const keys = this.block.rows.map((row, at) => row.toolUseId ?? `@${at}`);
		const keep = new Set(keys);
		for (const [key, view] of this.rows) {
			if (keep.has(key)) continue;
			view.el.remove();
			this.rows.delete(key);
		}
		const els = this.block.rows.map((row, at) => {
			const view = this.rows.get(keys[at]) ?? this.createRow(keys[at], row);
			this.updateRow(view, row);
			return view.el;
		});
		syncChildren(this.rowsEl, els);
	}

	private createRow(key: string, row: StepRow): RowView {
		const el = createDiv({ cls: "ai-agent-panel-step" });
		const detailsId = `ai-agent-panel-step-${++nextId}`;
		const button = el.createEl("button", {
			cls: "ai-agent-panel-step-row",
			attr: { type: "button", "aria-expanded": "false", "aria-controls": detailsId },
		});
		const tile = button.createSpan({ cls: "ai-agent-panel-step-tile", attr: { "aria-hidden": "true" } });
		writeIcon(tile, toolIcon(row.name));
		button.createSpan({ cls: "ai-agent-panel-step-name", text: toolDisplayName(row.name) });
		const summary = button.createSpan({ cls: "ai-agent-panel-step-summary" });
		const count = button.createSpan({ cls: "ai-agent-panel-step-count" });
		const stat = button.createSpan({ cls: "ai-agent-panel-step-stat" });
		const added = stat.createSpan({ cls: "ai-agent-panel-step-added" });
		const removed = stat.createSpan({ cls: "ai-agent-panel-step-removed" });
		stat.toggle(false);
		const mark = button.createSpan({ cls: "ai-agent-panel-step-mark" });
		const details = el.createDiv({ cls: "ai-agent-panel-step-details", attr: { id: detailsId } });
		details.toggle(false);
		const view: RowView = { row, el, button, tile, summary, count, stat, added, removed, mark, details, expanded: false, drawn: null };
		// The row's own listener, gone with the row when a card takes it out.
		button.addEventListener("click", () => {
			view.expanded = !view.expanded;
			writeAttr(button, "aria-expanded", String(view.expanded));
			writeClass(el, "is-expanded", view.expanded);
			details.toggle(view.expanded);
			this.drawDetails(view);
		});
		this.rows.set(key, view);
		return view;
	}

	private updateRow(view: RowView, row: StepRow): void {
		view.row = row;
		writeText(view.summary, summarizeToolInput(row.name, row.input, this.intents.toVaultPath));
		writeText(view.count, row.count ?? "");
		const stat = editStat(row);
		writeText(view.added, stat.added ?? "");
		writeText(view.removed, stat.removed ?? "");
		view.stat.toggle(stat.added !== null || stat.removed !== null);
		writeMark(view.mark, rowMark(row), false, true);
		writeClass(view.el, "is-running", row.status === "running");
		writeClass(view.el, "is-error", row.status === "error");
		writeClass(view.el, "is-edit", row.edit !== null);
		this.drawDetails(view);
	}

	/**
	 * The details, drawn while shown and again when the row changes (PRD-001.R16,
	 * PRD-002.R6): the input as JSON (2000 characters); for an edit that did
	 * not fail its diff, from the file as read to the file on disk once it
	 * landed, else of its own strings; otherwise the result (1500
	 * characters); then the images, live only.
	 */
	private drawDetails(view: RowView): void {
		const row = view.row;
		if (!view.expanded || view.drawn === row) return;
		view.drawn = row;
		const el = view.details;
		el.empty();
		el.createDiv({ cls: "ai-agent-panel-step-label", text: "Input" });
		el.createEl("pre", { cls: "ai-agent-panel-step-pre", text: jsonPreview(row.input, INPUT_CHARS) });
		const diffEl = el.createDiv({ cls: "ai-agent-panel-step-diff" });
		const diffed =
			row.status !== "error" &&
			this.intents.renderDiff(diffEl, row.name, row.input, row.landed?.before ?? null, row.landed?.after ?? null);
		if (!diffed) diffEl.remove();
		if (!diffed && row.result !== null) {
			el.createDiv({ cls: "ai-agent-panel-step-label", text: "Result" });
			el.createEl("pre", { cls: "ai-agent-panel-step-pre", text: row.result });
		}
		if (row.images.length === 0) return;
		const strip = el.createDiv({ cls: "ai-agent-panel-step-images" });
		thumbButtons(strip, stepViewerImages(row.images), "ai-agent-panel-step-image", this.intents.viewImages);
	}
}
