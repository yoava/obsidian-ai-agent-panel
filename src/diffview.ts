import { Modal, setIcon, type App } from "obsidian";
import {
	diffText,
	drawInChunks,
	expandGap,
	sidesOf,
	splitLines,
	type DiffRow,
	type FileDiff,
} from "./diff";
import { changeTotals, type ChangedFile } from "./edit-tracker";
import { rovingIndex } from "./state/roving";
import { themeModal } from "./theme-scope";

/**
 * DOM for a diff. Kept out of view.ts, which is large enough, and out of
 * diff.ts, which stays pure so it can be tested in plain Node.
 *
 * Every string here reaches the DOM through setText/createEl text options -
 * diff content is model output and file content, so nothing may be parsed as
 * HTML.
 */

export interface DiffViewOptions {
	/** Shown as the diff's heading, usually the file path. */
	path?: string;
	/** Caveat line under the heading (e.g. "the search text did not match"). */
	note?: string;
	/** Unchanged lines kept either side of a change. Default 3. */
	context?: number;
	/** Hide the line-number columns (fragment diffs have no real numbers). */
	hideLineNumbers?: boolean;
	/** Extra text after the +/- counts. */
	badge?: string;
	/**
	 * Where the Diff / Rendered tabs go, when the caller draws the heading
	 * itself: the diff then has no heading of its own (a permission card).
	 */
	tabsHost?: HTMLElement;
	/**
	 * Supplying this adds the Diff / Rendered tabs, which shows the changed section
	 * before and after as Obsidian would draw it. Markdown is what the vault is
	 * made of, so a raw diff of `**bold**` or a table is not always the clearest
	 * way to see what a change does.
	 */
	renderMarkdown?: (markdown: string, el: HTMLElement) => Promise<void>;
}

/** What drawing rows needs: the view options and the old text's lines, split on first use. */
interface RowContext {
	opts: DiffViewOptions;
	oldLines: () => string[];
}

/**
 * Render `before` → `after` as a gutter diff and return the computed diff so
 * the caller can reuse its counts. Collapsed stretches expand in place on
 * click: that gap's lines are taken from the text by line range, in chunks,
 * rather than keeping every row in memory up front.
 *
 * Rows after the first chunk arrive on later animation frames, so the returned
 * diff is complete before the DOM is. Drawing stops once the diff has left the
 * page, and a diff attached to the page after its first frame keeps only its
 * first chunk: attach `container` before calling.
 */
export function renderFileDiff(
	container: HTMLElement,
	before: string,
	after: string,
	opts: DiffViewOptions = {}
): FileDiff {
	const diff = diffText(before, after, { context: opts.context });
	let oldLines: string[] | null = null;
	const ctx: RowContext = { opts, oldLines: () => (oldLines ??= splitLines(before)) };
	const root = container.createDiv({ cls: "ai-agent-panel-diff" });
	if (opts.hideLineNumbers) root.addClass("is-compact");

	if (!opts.tabsHost && (opts.path || !diff.unchanged || opts.note)) {
		const head = root.createDiv({ cls: "ai-agent-panel-diff-head" });
		if (opts.path) head.createSpan({ cls: "ai-agent-panel-diff-path", text: opts.path });
		const stat = head.createSpan({ cls: "ai-agent-panel-diff-stat" });
		writeDiffStat(stat, diff.added, diff.removed);
		if (diff.unchanged)
			stat.createSpan({ cls: "ai-agent-panel-diff-none", text: "no change" });
		if (opts.badge) head.createSpan({ cls: "ai-agent-panel-diff-badge", text: opts.badge });
	}

	// With no heading of its own the badge is a note: "New file", "Excerpt".
	if (opts.tabsHost && opts.badge)
		root.createDiv({ cls: "ai-agent-panel-diff-note", text: opts.badge.charAt(0).toUpperCase() + opts.badge.slice(1) });
	if (opts.note) root.createDiv({ cls: "ai-agent-panel-diff-note", text: opts.note });
	if (diff.coarse)
		root.createDiv({
			cls: "ai-agent-panel-diff-note",
			text: "Too large to align line by line - shown as a wholesale replacement.",
		});

	// The first chunk is drawn now, so a short diff looks as if drawn whole.
	const body = root.createDiv({ cls: "ai-agent-panel-diff-body" });
	drawRows(body, diff.rows, (chunk) => renderRows(body, chunk, ctx));
	if (opts.renderMarkdown && !diff.unchanged) {
		const host = opts.tabsHost ?? root.querySelector<HTMLElement>(".ai-agent-panel-diff-head");
		if (host) addDiffTabs(host, root, body, diff, opts.renderMarkdown, opts.tabsHost !== undefined);
	}
	return diff;
}

/**
 * Draw `rows` through `draw` a chunk per animation frame of `anchor`'s own
 * window, the first now, so no UI-thread task passes 100 ms (PRD-001.R29).
 * Drawing stops once `anchor` has left the page: a card removed, a view
 * closed, a container emptied to draw its diff again.
 */
function drawRows(
	anchor: HTMLElement,
	rows: DiffRow[],
	draw: (chunk: DiffRow[], last: boolean) => void
): void {
	drawInChunks(
		rows,
		draw,
		(step) => anchor.win.requestAnimationFrame(step),
		() => anchor.isConnected
	);
}

/** The line totals "+x" and "−y" (U+2212) in `el`, each only when not zero: the one writer for every diff heading and card. */
export function writeDiffStat(el: HTMLElement, added: number, removed: number): void {
	if (added) el.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${added}` });
	if (removed) el.createSpan({ cls: "ai-agent-panel-diff-minus", text: `−${removed}` });
}

let nextTabsId = 0;

/**
 * The Diff / Rendered switch (PRD-002.R5): a tablist in `host`, Diff over the
 * rows and Rendered over the changed section as Obsidian would draw it. The
 * preview is built once, lazily, and covers the shown region only -
 * collapsed stretches are not part of it, which the labels say. Arrow keys,
 * Home and End move between the tabs and select the one reached.
 */
function addDiffTabs(
	host: HTMLElement,
	root: HTMLElement,
	body: HTMLElement,
	diff: FileDiff,
	renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>,
	named: boolean
): void {
	const id = `ai-agent-panel-diff-${++nextTabsId}`;
	const list = host.createDiv({ cls: "ai-agent-panel-diff-tabs", attr: { role: "tablist" } });
	// Named by the file's path in a heading of its own, else by hidden text; a caller that draws the heading names it.
	if (!named) {
		const path = host.querySelector<HTMLElement>(".ai-agent-panel-diff-path");
		const label = path ?? host.createSpan({ cls: "ai-agent-panel-visually-hidden", text: "Diff view" });
		label.id ||= `${id}-label`;
		list.setAttribute("aria-labelledby", label.id);
	}
	body.setAttribute("role", "tabpanel");
	body.setAttribute("aria-labelledby", `${id}-tab-0`);
	body.id = `${id}-panel-0`;
	const tabs = ["Diff", "Rendered"].map((name, index) => {
		const tab = list.createEl("button", {
			cls: "ai-agent-panel-diff-tab",
			attr: { type: "button", role: "tab", id: `${id}-tab-${index}`, "aria-controls": `${id}-panel-${index}` },
		});
		if (index === 1) setIcon(tab.createSpan({ cls: "ai-agent-panel-diff-tab-icon", attr: { "aria-hidden": "true" } }), "eye");
		tab.appendText(name);
		return tab;
	});
	// The Rendered panel exists from the start, so the tab's aria-controls resolves; its panes are drawn on first use.
	const preview = root.createDiv({
		cls: "ai-agent-panel-diff-preview",
		attr: { id: `${id}-panel-1`, role: "tabpanel", "aria-labelledby": `${id}-tab-1` },
	});
	let filled = false;
	const fillPreview = (): void => {
		filled = true;
		const { before, after } = sidesOf(diff);
		const pane = (label: string, markdown: string, cls: string) => {
			const side = preview.createDiv({ cls: `ai-agent-panel-diff-pane ${cls}` });
			side.createDiv({ cls: "ai-agent-panel-diff-pane-label", text: label });
			const paneBody = side.createDiv({ cls: "ai-agent-panel-diff-pane-body" });
			if (markdown.trim() === "") paneBody.createDiv({ cls: "ai-agent-panel-diff-note", text: "(nothing)" });
			else void renderMarkdown(markdown, paneBody).catch(() => paneBody.setText(markdown));
		};
		pane("Before", before, "is-before");
		pane("After", after, "is-after");
	};
	const select = (index: number): void => {
		if (index === 1 && !filled) fillPreview();
		root.toggleClass("is-previewing", index === 1);
		tabs.forEach((tab, at) => {
			tab.setAttribute("aria-selected", String(at === index));
			tab.tabIndex = at === index ? 0 : -1;
			tab.toggleClass("is-active", at === index);
		});
	};
	tabs.forEach((tab, index) => {
		tab.addEventListener("click", () => select(index));
		tab.addEventListener("keydown", (evt) => {
			const target = rovingIndex(evt.key, tab.closest(".mod-rtl") !== null, index, tabs.length - 1);
			if (target === null) return;
			evt.preventDefault();
			select(target);
			tabs[target].focus();
		});
	});
	select(0);
}

function renderRows(parent: Node, rows: DiffRow[], ctx: RowContext): void {
	for (const row of rows) {
		if (row.type === "gap") {
			drawGap(parent, row, ctx);
			continue;
		}
		if (row.type === "cut") {
			const n = row.hidden ?? 0;
			parent.createDiv({
				cls: "ai-agent-panel-diff-row is-cut",
				text: `${n} more ${n === 1 ? "row" : "rows"} not shown`,
			});
			continue;
		}

		const rowEl = parent.createDiv({
			cls: `ai-agent-panel-diff-row is-${row.type}`,
		});
		if (!ctx.opts.hideLineNumbers) {
			rowEl.createSpan({
				cls: "ai-agent-panel-diff-ln",
				text: row.oldLine === undefined ? "" : String(row.oldLine),
			});
			rowEl.createSpan({
				cls: "ai-agent-panel-diff-ln",
				text: row.newLine === undefined ? "" : String(row.newLine),
			});
		}
		rowEl.createSpan({
			cls: "ai-agent-panel-diff-sign",
			text: row.type === "add" ? "+" : row.type === "remove" ? "−" : " ",
		});
		const textEl = rowEl.createSpan({ cls: "ai-agent-panel-diff-text" });
		if (row.segments) {
			for (const seg of row.segments) {
				if (seg.text === "") continue;
				if (seg.changed)
					textEl.createSpan({ cls: "ai-agent-panel-diff-word", text: seg.text });
				else textEl.createSpan({ text: seg.text });
			}
		} else {
			// A blank line still needs height, and setText("") collapses it.
			textEl.setText(row.text === "" ? "​" : row.text);
		}
	}
}

/**
 * A button for a run of unchanged lines. A click shows those lines in its
 * place, a chunk per animation frame so a big gap never holds the UI thread.
 * The emptied row stays as the insertion point until the last chunk, and a gap
 * too big to show whole is replaced by a gap row for what is left.
 */
function drawGap(parent: Node, row: DiffRow, ctx: RowContext): void {
	const gap = parent.createDiv({ cls: "ai-agent-panel-diff-row is-gap" });
	const btn = gap.createEl("button", { cls: "ai-agent-panel-diff-gap" });
	const icon = btn.createSpan({ cls: "ai-agent-panel-diff-gap-icon", attr: { "aria-hidden": "true" } });
	setIcon(icon, "chevrons-up-down");
	btn.appendText(`${row.hidden ?? 0} unchanged ${row.hidden === 1 ? "line" : "lines"}`);
	btn.addEventListener("click", () => {
		const { rows, rest } = expandGap(row, ctx.oldLines());
		const hadFocus = gap.doc.activeElement === btn;
		gap.empty();
		drawRows(gap, rest ? [...rows, rest] : rows, (chunk, last) => {
			const fragment = createFragment();
			renderRows(fragment, chunk, ctx);
			if (!last) {
				gap.before(fragment);
				return;
			}
			const leftover = fragment.querySelector("button");
			gap.replaceWith(fragment);
			// The focused button is gone; pass focus on unless the user moved it.
			const { activeElement, body } = gap.doc;
			if (hadFocus && activeElement === body) leftover?.focus();
		});
	});
}

// ---------------------------------------------------------------------------
// "Changes this session"
// ---------------------------------------------------------------------------

/** One file a restore would rewind, as Claude Code reported it. */
export interface RestoreFile {
	path: string;
	/** The path lies outside this vault. */
	outside: boolean;
}

/**
 * Confirmation for "restore files to before this turn" (DES-004): the files
 * Claude Code's dry run listed, the line totals, and what the rewind loses.
 * Closing it any way but Restore files cancels.
 */
export class RestoreConfirmModal extends Modal {
	private confirmed = false;
	private detachTheme: (() => void) | null = null;

	constructor(
		app: App,
		private files: RestoreFile[],
		private totals: { insertions: number; deletions: number },
		private onConfirm: () => void,
		private onCancel: () => void
	) {
		super(app);
	}

	onOpen(): void {
		this.detachTheme = themeModal(this);
		const { contentEl } = this;
		contentEl.addClass("ai-agent-panel-changes-modal");
		contentEl.createEl("h3", { text: "Restore files to before this turn" });
		const summary = contentEl.createDiv({ cls: "ai-agent-panel-changes-summary" });
		summary.createSpan({ text: `${this.files.length} ${this.files.length === 1 ? "file" : "files"}` });
		summary.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${this.totals.insertions}` });
		summary.createSpan({ cls: "ai-agent-panel-diff-minus", text: `-${this.totals.deletions}` });
		for (const file of this.files) {
			const row = contentEl.createDiv({ cls: "ai-agent-panel-changes-file ai-agent-panel-restore-file" });
			row.createSpan({ cls: "ai-agent-panel-changes-path", text: file.path });
			if (file.outside) row.createSpan({ cls: "ai-agent-panel-changes-tag is-warning", text: "outside this vault" });
		}
		contentEl.createDiv({
			cls: "ai-agent-panel-changes-empty",
			text:
				"Later edits to these files are lost, whether by later turns, by you, in another tab or by another tool. " +
				"Listed files that did not exist before this turn are deleted permanently.",
		});

		const buttons = contentEl.createDiv({ cls: "ai-agent-panel-modal-buttons" });
		buttons
			.createEl("button", { cls: "mod-warning", text: "Restore files" })
			.addEventListener("click", () => {
				this.confirmed = true;
				this.close();
				this.onConfirm();
			});
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.detachTheme?.();
		this.detachTheme = null;
		this.contentEl.empty();
		if (!this.confirmed) this.onCancel();
	}
}

/**
 * Every file the conversation changed, with its net diff and a link to open.
 * The list arrives with each file's lines counted (`ChangeList`), so opening
 * computes no diff; a file's rows are diffed and drawn when its section first
 * opens (PRD-001.R29).
 */
export class SessionChangesModal extends Modal {
	private detachTheme: (() => void) | null = null;

	constructor(
		app: App,
		private changes: readonly ChangedFile[],
		private onOpenFile: (path: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		this.detachTheme = themeModal(this);
		const { contentEl } = this;
		contentEl.addClass("ai-agent-panel-changes-modal");
		contentEl.createEl("h3", { text: "Changes this conversation" });

		if (this.changes.length === 0) {
			contentEl.createDiv({
				cls: "ai-agent-panel-changes-empty",
				text: "No file changes yet. Edits Claude makes in this conversation show up here, including ones it later reverted.",
			});
			return;
		}

		const totals = changeTotals(this.changes);
		const summary = contentEl.createDiv({ cls: "ai-agent-panel-changes-summary" });
		summary.createSpan({
			text: `${totals.files} ${totals.files === 1 ? "file" : "files"}`,
		});
		if (totals.added)
			summary.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${totals.added}` });
		if (totals.removed)
			summary.createSpan({ cls: "ai-agent-panel-diff-minus", text: `-${totals.removed}` });

		for (const change of this.changes) {
			const item = contentEl.createEl("details", { cls: "ai-agent-panel-changes-file" });
			const head = item.createEl("summary");
			const name = head.createSpan({ cls: "ai-agent-panel-changes-path", text: change.path });
			if (change.inVault) {
				name.addClass("is-link");
				name.addEventListener("click", (evt) => {
					// Inside a <summary>, a click would otherwise just toggle it.
					evt.preventDefault();
					evt.stopPropagation();
					this.onOpenFile(change.path);
					this.close();
				});
			}
			if (change.created)
				head.createSpan({ cls: "ai-agent-panel-changes-tag", text: "new" });
			const stat = head.createSpan({ cls: "ai-agent-panel-diff-stat" });
			writeDiffStat(stat, change.added, change.removed);

			// Diffed and drawn once, when the section first opens; the container is attached first (renderFileDiff).
			const body = item.createDiv();
			let drawn = false;
			item.addEventListener("toggle", () => {
				if (drawn || !item.open) return;
				drawn = true;
				renderFileDiff(body, change.before, change.after);
			});
		}
	}

	onClose(): void {
		this.detachTheme?.();
		this.detachTheme = null;
		this.contentEl.empty();
	}
}
