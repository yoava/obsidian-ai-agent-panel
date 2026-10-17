import { Modal, type App } from "obsidian";
import { drawIcon } from "./icon";
import {
	ACTUAL_SIZE_LABEL,
	openViewer,
	shownImage,
	stepViewer,
	toggleSize,
	viewerCaption,
	type ViewerImage,
	type ViewerState,
} from "./state/image-viewer";
import {
	claudeCodeNote,
	confirmLabel,
	planSummary,
	planTitle,
	samePlan,
	type PlanChange,
	type ResetOptions,
	type ResetPlan,
} from "./state/settings-reset";
import { themeModal } from "./theme-scope";

export interface ConfirmOptions {
	title: string;
	text: string;
	confirmText: string;
	cancelText?: string;
	/** Focus the cancelling button, so Enter cannot widen what runs unasked. */
	focusCancel?: boolean;
	onConfirm: () => void;
	/** Runs once when the dialog has closed, however it closed. */
	afterClose?: (confirmed: boolean) => void;
}

/**
 * A yes-or-no question before something the user should agree to first. The
 * confirming button carries the warning style and, unless `focusCancel`,
 * takes the focus; closing the dialog any other way cancels.
 */
export class ConfirmModal extends Modal {
	private confirmed = false;
	private detachTheme: (() => void) | null = null;

	constructor(
		app: App,
		private options: ConfirmOptions
	) {
		super(app);
	}

	onOpen(): void {
		this.detachTheme = themeModal(this);
		const { contentEl, options } = this;
		contentEl.createEl("h3", { text: options.title });
		contentEl.createEl("p", { text: options.text });
		const buttons = contentEl.createDiv({ cls: "ai-agent-panel-modal-buttons" });
		const cancel = buttons.createEl("button", { text: options.cancelText ?? "Cancel" });
		cancel.addEventListener("click", () => {
			this.close();
		});
		const confirm = buttons.createEl("button", { cls: "mod-warning", text: options.confirmText });
		confirm.addEventListener("click", () => {
			this.confirmed = true;
			this.close();
			options.onConfirm();
		});
		(options.focusCancel ? cancel : confirm).focus();
	}

	onClose(): void {
		this.detachTheme?.();
		this.detachTheme = null;
		this.contentEl.empty();
		this.options.afterClose?.(this.confirmed);
	}
}

let nextRenameId = 0;

export interface RenameOptions {
	/** The title shown now: the field's start. */
	title: string;
	/** The normalised title to save for a typed one, or null while there is nothing to save (`renamedTitle`). */
	accept: (typed: string) => string | null;
	onRename: (title: string) => void;
}

/**
 * The "Rename conversation" dialog (PRD-001.R7): a field holding the title,
 * selected; Enter or "Rename" saves, Escape or "Cancel" closes. "Rename" is
 * disabled while the field is blank. A typed title equal to the one shown
 * closes without saving.
 */
export class RenameModal extends Modal {
	private detachTheme: (() => void) | null = null;

	constructor(
		app: App,
		private options: RenameOptions
	) {
		super(app);
	}

	onOpen(): void {
		this.detachTheme = themeModal(this);
		const { contentEl, options } = this;
		contentEl.createEl("h3", { text: "Rename conversation" });
		const id = `ai-agent-panel-rename-${++nextRenameId}`;
		contentEl.createEl("label", { cls: "ai-agent-panel-visually-hidden", text: "Conversation title", attr: { for: id } });
		const input = contentEl.createEl("input", {
			cls: "ai-agent-panel-rename-input",
			attr: { id, type: "text", spellcheck: "false" },
		});
		input.value = options.title;
		const buttons = contentEl.createDiv({ cls: "ai-agent-panel-modal-buttons" });
		const cancel = buttons.createEl("button", { text: "Cancel" });
		const rename = buttons.createEl("button", { cls: "mod-cta", text: "Rename" });
		const blank = (): boolean => input.value.trim() === "";
		const sync = (): void => {
			rename.disabled = blank();
		};
		const submit = (): void => {
			if (blank()) return;
			const title = options.accept(input.value);
			this.close();
			if (title !== null) options.onRename(title);
		};
		sync();
		input.addEventListener("input", sync);
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.isComposing) return;
			event.preventDefault();
			submit();
		});
		cancel.addEventListener("click", () => this.close());
		rename.addEventListener("click", submit);
		input.focus();
		input.select();
	}

	onClose(): void {
		this.detachTheme?.();
		this.detachTheme = null;
		this.contentEl.empty();
	}
}

export interface ResetDialogOptions {
	/** The plan for the two extra choices, from the settings as they are now; asked again at Confirm. */
	build: (options: ResetOptions) => ResetPlan;
	/** The plan to apply: the one the dialog showed, built again at Confirm and found the same. */
	onConfirm: (plan: ResetPlan) => void;
}

/** The text of "Also reset what syncs" (DES-001 Reset). */
const SYNCS_NOTE = "Every cloud badge goes back to its default: Claude Code, permissions and vault instructions on this device, the rest synced.";

/**
 * The reset dialog (PRD-001.R39, DES-001 Reset): the count and where the changes are stored, then each change, grouped
 * by section for everything, with the two extra choices that only everything offers, both off. Cancel has the focus;
 * Escape, a click outside and Cancel change nothing. Confirm builds the plan again: if it is not the one shown (another
 * window or a sync changed a setting) the dialog shows the new one and waits for another confirm.
 */
export class ResetModal extends Modal {
	private detachTheme: (() => void) | null = null;
	private readonly choices: ResetOptions = { claudeCode: false, syncs: false };
	private plan: ResetPlan;
	private summaryEl: HTMLElement | null = null;
	private staleEl: HTMLElement | null = null;
	private listEl: HTMLElement | null = null;
	private claudeNoteEl: HTMLElement | null = null;
	private confirmEl: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly options: ResetDialogOptions
	) {
		super(app);
		this.plan = options.build(this.choices);
	}

	onOpen(): void {
		this.detachTheme = themeModal(this);
		this.modalEl.addClass("ai-agent-panel-reset-modal");
		const { contentEl } = this;
		const everything = this.plan.scope.kind === "all";
		contentEl.createEl("h3", { text: planTitle(this.plan) });
		this.summaryEl = contentEl.createEl("p", { cls: "ai-agent-panel-reset-summary" });
		this.staleEl = contentEl.createEl("p", { cls: "ai-agent-panel-reset-stale", attr: { role: "status" } });
		this.listEl = contentEl.createDiv({ cls: "ai-agent-panel-reset-list" });
		if (everything) {
			this.claudeNoteEl = this.drawChoice("Also reset Claude Code", "claudeCode");
			this.drawChoice("Also reset what syncs", "syncs").setText(SYNCS_NOTE);
		}
		const buttons = contentEl.createDiv({ cls: "ai-agent-panel-modal-buttons" });
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		this.confirmEl = buttons.createEl("button", { cls: everything ? "mod-cta mod-warning" : "mod-cta" });
		this.confirmEl.addEventListener("click", () => this.confirm());
		this.refresh();
		cancel.focus();
	}

	/** A checkbox with its explanation under it; returns the explanation. */
	private drawChoice(label: string, key: keyof ResetOptions): HTMLElement {
		const row = this.contentEl.createEl("label", { cls: "ai-agent-panel-reset-choice" });
		const box = row.createEl("input", { attr: { type: "checkbox" } });
		const text = row.createDiv({ cls: "ai-agent-panel-reset-choice-text" });
		text.createSpan({ text: label });
		const note = text.createDiv({ cls: "ai-agent-panel-reset-choice-note" });
		box.addEventListener("change", () => {
			this.choices[key] = box.checked;
			this.plan = this.options.build(this.choices);
			this.staleEl?.setText("");
			this.refresh();
		});
		return note;
	}

	private confirm(): void {
		const fresh = this.options.build(this.choices);
		if (!samePlan(fresh, this.plan)) {
			this.plan = fresh;
			this.staleEl?.setText("Settings changed while this was open. Check the list, then confirm again.");
			this.refresh();
			return;
		}
		this.close();
		this.options.onConfirm(fresh);
	}

	/** Write the plan into the summary, the list, the Claude Code note and the confirming button. */
	private refresh(): void {
		const { plan } = this;
		this.summaryEl?.setText(planSummary(plan));
		this.claudeNoteEl?.setText(claudeCodeNote(plan));
		if (this.confirmEl) {
			this.confirmEl.setText(confirmLabel(plan));
			this.confirmEl.disabled = plan.changes.length === 0 && !(plan.options.syncs && plan.syncsDiffer);
		}
		const list = this.listEl;
		if (!list) return;
		list.empty();
		for (const section of plan.scope.kind === "all" ? plan.sections : [null]) {
			if (section) list.createDiv({ cls: "ai-agent-panel-reset-group", text: section.label });
			for (const change of plan.changes.filter((candidate) => section === null || candidate.section === section.key)) this.drawChange(list, change);
		}
	}

	private drawChange(list: HTMLElement, change: PlanChange): void {
		const row = list.createDiv({ cls: "ai-agent-panel-reset-change" });
		const name = row.createSpan({ cls: "ai-agent-panel-reset-name" });
		const store = name.createSpan({ cls: "ai-agent-panel-reset-store" });
		drawIcon(store.createSpan({ attr: { "aria-hidden": "true" } }), [change.store === "synced" ? "cloud" : "cloud-off"]);
		store.createSpan({ cls: "ai-agent-panel-visually-hidden", text: change.store === "synced" ? "synced" : "on this device" });
		name.createSpan({ cls: "ai-agent-panel-reset-label", text: change.name });
		if (change.turnsOn) name.createSpan({ cls: "ai-agent-panel-reset-pill", text: "turns on" });
		const values = row.createSpan({ cls: "ai-agent-panel-reset-values" });
		values.createSpan({ cls: "ai-agent-panel-reset-old", text: change.old === "" ? "blank" : change.old });
		values.createSpan({ cls: "ai-agent-panel-visually-hidden", text: " to " });
		drawIcon(values.createSpan({ cls: "ai-agent-panel-reset-arrow", attr: { "aria-hidden": "true" } }), ["arrow-right"]);
		values.createSpan({ cls: "ai-agent-panel-reset-new", text: change.new });
	}

	onClose(): void {
		this.detachTheme?.();
		this.detachTheme = null;
		this.contentEl.empty();
	}
}

let nextCaptionId = 0;

/**
 * The image viewer (DES-003 Image viewer; PRD-001.R14, R16): one of a
 * message's or tool result's images, large, on Obsidian's active window,
 * which the click or key on the thumbnail has made its window. It opens
 * fitted; the image is a toggle button for actual size, the stage scrolling
 * when the image is larger; Left and Right step through the other images;
 * Escape closes. The caption names the image, its file size and, once
 * loaded, its pixels. `state/image-viewer` holds what shows.
 */
export class ImageViewerModal extends Modal {
	private state: ViewerState;
	private detachTheme: (() => void) | null = null;
	private stageEl!: HTMLElement;
	private buttonEl!: HTMLButtonElement;
	private imageEl!: HTMLImageElement;
	private captionEl!: HTMLElement;

	constructor(app: App, images: readonly ViewerImage[], index: number) {
		super(app);
		this.state = openViewer(images, index);
	}

	onOpen(): void {
		this.detachTheme = themeModal(this);
		this.modalEl.addClass("ai-agent-panel-image-viewer");
		const captionId = `ai-agent-panel-viewer-caption-${++nextCaptionId}`;
		this.stageEl = this.contentEl.createDiv({ cls: "ai-agent-panel-image-viewer-stage" });
		this.buttonEl = this.stageEl.createEl("button", {
			cls: "ai-agent-panel-image-viewer-image",
			attr: { type: "button", "aria-describedby": captionId },
		});
		// Named by hidden text, not `aria-label`, which Obsidian shows as a tooltip over the image.
		this.imageEl = this.buttonEl.createEl("img", { attr: { alt: "" } });
		this.buttonEl.createSpan({ cls: "ai-agent-panel-visually-hidden", text: ACTUAL_SIZE_LABEL });
		this.captionEl = this.contentEl.createDiv({ cls: "ai-agent-panel-image-viewer-caption", attr: { id: captionId } });
		this.buttonEl.addEventListener("click", () => this.show(toggleSize(this.state)));
		this.imageEl.addEventListener("load", () => this.writeCaption());
		this.scope.register([], "ArrowLeft", () => this.step(-1));
		this.scope.register([], "ArrowRight", () => this.step(1));
		this.show(this.state, true);
		this.buttonEl.focus();
	}

	onClose(): void {
		this.detachTheme?.();
		this.detachTheme = null;
		this.contentEl.empty();
	}

	/** false: Obsidian takes no other action for the key. */
	private step(delta: -1 | 1): false {
		this.show(stepViewer(this.state, delta));
		return false;
	}

	private show(state: ViewerState, first = false): void {
		const moved = first || state.index !== this.state.index;
		this.state = state;
		const image = shownImage(state);
		if (!image) return;
		if (moved) {
			this.imageEl.src = `data:${image.mediaType};base64,${image.base64}`;
		}
		this.modalEl.toggleClass("is-actual", state.actual);
		this.buttonEl.setAttribute("aria-pressed", String(state.actual));
		if (!state.actual) this.stageEl.scrollTo({ top: 0, left: 0 });
		this.writeCaption();
	}

	/** The pixel size once the image has loaded; until then it is left out. */
	private writeCaption(): void {
		const { naturalWidth: width, naturalHeight: height } = this.imageEl;
		const loaded = this.imageEl.complete && width > 0;
		this.captionEl.setText(viewerCaption(this.state, loaded ? { width, height } : null));
	}
}
