import { Modal, setIcon, type App } from "obsidian";
import { diffText, type DiffRow, type FileDiff } from "./diff";

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
	 * Supplying this adds a "rendered" toggle, which shows the changed section
	 * before and after as Obsidian would draw it. Markdown is what the vault is
	 * made of, so a raw diff of `**bold**` or a table is not always the clearest
	 * way to see what a change does.
	 */
	renderMarkdown?: (markdown: string, el: HTMLElement) => Promise<void>;
}

const EXPANDED_CONTEXT = Number.MAX_SAFE_INTEGER;
const EXPANDED_MAX_ROWS = 20_000;

/**
 * Render `before` → `after` as a gutter diff and return the computed diff so
 * the caller can reuse its counts. Collapsed stretches expand in place on
 * click, which re-diffs with unlimited context rather than keeping every row in
 * memory up front.
 */
export function renderFileDiff(
	container: HTMLElement,
	before: string,
	after: string,
	opts: DiffViewOptions = {}
): FileDiff {
	const diff = diffText(before, after, { context: opts.context });
	const root = container.createDiv({ cls: "ai-agent-panel-diff" });
	if (opts.hideLineNumbers) root.addClass("is-compact");

	if (opts.path || !diff.unchanged || opts.note) {
		const head = root.createDiv({ cls: "ai-agent-panel-diff-head" });
		if (opts.path) head.createSpan({ cls: "ai-agent-panel-diff-path", text: opts.path });
		const stat = head.createSpan({ cls: "ai-agent-panel-diff-stat" });
		if (diff.added)
			stat.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${diff.added}` });
		if (diff.removed)
			stat.createSpan({ cls: "ai-agent-panel-diff-minus", text: `-${diff.removed}` });
		if (diff.unchanged)
			stat.createSpan({ cls: "ai-agent-panel-diff-none", text: "no change" });
		if (opts.badge) head.createSpan({ cls: "ai-agent-panel-diff-badge", text: opts.badge });
		if (opts.renderMarkdown && !diff.unchanged)
			addRenderedToggle(head, root, diff, opts.renderMarkdown);
	}

	if (opts.note) root.createDiv({ cls: "ai-agent-panel-diff-note", text: opts.note });
	if (diff.coarse)
		root.createDiv({
			cls: "ai-agent-panel-diff-note",
			text: "Too large to align line by line - shown as a wholesale replacement.",
		});

	const body = root.createDiv({ cls: "ai-agent-panel-diff-body" });
	renderRows(body, diff.rows, before, after, opts);
	return diff;
}

/** The changed region as it was, and as it will be - context rows included. */
function sidesOf(diff: FileDiff): { before: string; after: string } {
	const before: string[] = [];
	const after: string[] = [];
	for (const row of diff.rows) {
		if (row.type === "gap") continue;
		if (row.type !== "add") before.push(row.text);
		if (row.type !== "remove") after.push(row.text);
	}
	return { before: before.join("\n"), after: after.join("\n") };
}

/**
 * "Rendered" switch in the diff header. The preview is built once, lazily, and
 * covers the shown region only - collapsed stretches are not part of it, which
 * the labels say.
 */
function addRenderedToggle(
	head: HTMLElement,
	root: HTMLElement,
	diff: FileDiff,
	renderMarkdown: (markdown: string, el: HTMLElement) => Promise<void>
): void {
	const button = head.createEl("button", {
		cls: "ai-agent-panel-diff-toggle",
		text: "rendered",
	});
	const icon = button.createSpan();
	setIcon(icon, "eye");
	let preview: HTMLElement | null = null;
	button.addEventListener("click", () => {
		if (!preview) {
			const { before, after } = sidesOf(diff);
			preview = root.createDiv({ cls: "ai-agent-panel-diff-preview" });
			const pane = (label: string, markdown: string, cls: string) => {
				const side = preview!.createDiv({ cls: `ai-agent-panel-diff-pane ${cls}` });
				side.createDiv({ cls: "ai-agent-panel-diff-pane-label", text: label });
				const body = side.createDiv({ cls: "ai-agent-panel-diff-pane-body" });
				if (markdown.trim() === "")
					body.createDiv({ cls: "ai-agent-panel-diff-note", text: "(nothing)" });
				else void renderMarkdown(markdown, body).catch(() => body.setText(markdown));
			};
			pane("Before", before, "is-before");
			pane("After", after, "is-after");
		}
		const showing = root.hasClass("is-previewing");
		root.toggleClass("is-previewing", !showing);
		button.toggleClass("is-active", !showing);
	});
}

function renderRows(
	body: HTMLElement,
	rows: DiffRow[],
	before: string,
	after: string,
	opts: DiffViewOptions
): void {
	for (const row of rows) {
		if (row.type === "gap") {
			const gap = body.createDiv({ cls: "ai-agent-panel-diff-row is-gap" });
			const btn = gap.createEl("button", {
				cls: "ai-agent-panel-diff-gap",
				text: `${row.hidden ?? 0} unchanged ${row.hidden === 1 ? "line" : "lines"}`,
			});
			const icon = btn.createSpan({ cls: "ai-agent-panel-diff-gap-icon" });
			setIcon(icon, "chevrons-up-down");
			btn.addEventListener("click", () => {
				const expanded = diffText(before, after, {
					context: EXPANDED_CONTEXT,
					maxRows: EXPANDED_MAX_ROWS,
				});
				body.empty();
				renderRows(body, expanded.rows, before, after, opts);
			});
			continue;
		}

		const rowEl = body.createDiv({
			cls: `ai-agent-panel-diff-row is-${row.type}`,
		});
		if (!opts.hideLineNumbers) {
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
			text: row.type === "add" ? "+" : row.type === "remove" ? "-" : " ",
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

// ---------------------------------------------------------------------------
// "Changes this session"
// ---------------------------------------------------------------------------

/** One file the conversation touched, tracked from its first pre-image on. */
export interface FileChange {
	/** Vault-relative path, or the reported path when it is outside the vault. */
	path: string;
	/** Whether `path` resolved inside the vault (only those can be opened). */
	inVault: boolean;
	/** Content before the conversation's first edit to this file. */
	before: string;
	/** Content after its most recent edit. */
	after: string;
	/** True when the file did not exist before the conversation touched it. */
	created: boolean;
	/** Number of edit tool calls applied to it. */
	edits: number;
}

export interface ChangeTotals {
	files: number;
	added: number;
	removed: number;
}

export function changeTotals(changes: Iterable<FileChange>): ChangeTotals {
	let files = 0;
	let added = 0;
	let removed = 0;
	for (const change of changes) {
		const diff = diffText(change.before, change.after);
		if (diff.unchanged) continue;
		files++;
		added += diff.added;
		removed += diff.removed;
	}
	return { files, added, removed };
}

/** One file a restore would touch, with the change it would undo. */
export interface RestorePreview {
	path: string;
	/** Contents on disk now, or null when the file is gone. */
	before: string | null;
	/** Contents the restore would write ("" for a file it will delete). */
	after: string;
	/** The file was created by the turn, so restoring removes it. */
	removing: boolean;
}

/** Confirmation for "restore files to before this turn". */
export class RestoreConfirmModal extends Modal {
	constructor(
		app: App,
		private previews: RestorePreview[],
		private skipped: string[],
		private onConfirm: () => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("ai-agent-panel-changes-modal");
		contentEl.createEl("h3", { text: "Restore files to before this turn" });
		contentEl.createDiv({
			cls: "ai-agent-panel-changes-empty",
			text:
				this.previews.length === 0
					? "Nothing from this turn can be restored."
					: "These files go back to how they were when the turn started. Anything you changed yourself since then goes too.",
		});

		for (const preview of this.previews) {
			const item = contentEl.createEl("details", { cls: "ai-agent-panel-changes-file" });
			const head = item.createEl("summary");
			head.createSpan({ cls: "ai-agent-panel-changes-path", text: preview.path });
			head.createSpan({
				cls: "ai-agent-panel-changes-tag",
				text: preview.removing ? "will be deleted" : "will be rewritten",
			});
			renderFileDiff(item.createDiv(), preview.before ?? "", preview.after);
		}

		if (this.skipped.length > 0) {
			contentEl.createDiv({
				cls: "ai-agent-panel-diff-note",
				text: `Not restorable (too large to snapshot): ${this.skipped.join(", ")}`,
			});
		}

		const buttons = contentEl.createDiv({ cls: "ai-agent-panel-permission-buttons" });
		const confirm = buttons.createEl("button", {
			cls: "mod-warning",
			text: "Restore files",
		});
		confirm.disabled = this.previews.length === 0;
		confirm.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
		buttons
			.createEl("button", { text: "Cancel" })
			.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Every file the conversation changed, with its net diff and a link to open. */
export class SessionChangesModal extends Modal {
	constructor(
		app: App,
		private changes: FileChange[],
		private onOpenFile: (path: string) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("ai-agent-panel-changes-modal");
		contentEl.createEl("h3", { text: "Changes this conversation" });

		const net = this.changes
			.map((change) => ({ change, diff: diffText(change.before, change.after) }))
			.filter((entry) => !entry.diff.unchanged);

		if (net.length === 0) {
			contentEl.createDiv({
				cls: "ai-agent-panel-changes-empty",
				text: "No file changes yet. Edits Claude makes in this conversation show up here, including ones it later reverted.",
			});
			return;
		}

		const totals = changeTotals(net.map((e) => e.change));
		const summary = contentEl.createDiv({ cls: "ai-agent-panel-changes-summary" });
		summary.createSpan({
			text: `${totals.files} ${totals.files === 1 ? "file" : "files"}`,
		});
		if (totals.added)
			summary.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${totals.added}` });
		if (totals.removed)
			summary.createSpan({ cls: "ai-agent-panel-diff-minus", text: `-${totals.removed}` });

		for (const { change, diff } of net) {
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
			if (diff.added)
				stat.createSpan({ cls: "ai-agent-panel-diff-plus", text: `+${diff.added}` });
			if (diff.removed)
				stat.createSpan({ cls: "ai-agent-panel-diff-minus", text: `-${diff.removed}` });

			renderFileDiff(item.createDiv(), change.before, change.after);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
