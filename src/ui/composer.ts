import {
	arrayBufferToBase64,
	Component,
	Notice,
	TFile,
	TFolder,
	type App,
	type Events,
	type TAbstractFile,
} from "obsidian";
import { collectImages, composerFiles, notAttachedMessage, type PendingImage } from "../attachments";
import { commandList } from "../commands";
import type { LineRange } from "../context-format";
import { ImageViewerModal } from "../confirm-modal";
import {
	appendText,
	composerChips,
	composerView,
	escapeAction,
	fitChips,
	isCommandText,
	STOP_LABEL,
	withCommand,
	type ChipView,
} from "../state/composer";
import type { Activity, ChipKind, ComposerData, TabEvent } from "../state/tab";
import { AddContextModal, FileMentionSuggest, SlashCommandSuggest, type SlashCommand } from "../suggest";
import {
	Follower,
	hiddenText,
	iconButton,
	onOwnDocument,
	syncChildren,
	writeAttr,
	writeClass,
	writeIcon,
	writeText,
	writeTooltip,
	type OpenPopover,
} from "./dom";
import { ChipsPopover, type HiddenChip } from "./popovers/chips";
import type { ResizeMeasure, ResizePass } from "./shell";

/** What the composer reads of a tab, and its `composer` and `activity` events. */
export type ComposerTab = Events & {
	readonly activity: Activity;
	readonly turnRunning: boolean;
	readonly composer: Readonly<ComposerData<TAbstractFile>>;
};

export interface ComposerSource {
	app: App;
	/** The view's events: `active` when the active tab changes. */
	viewEvents: Events;
	activeTab: () => ComposerTab | null;
	/** The active note, its selected lines and the folder, which the note and folder chips offer. */
	contextTargets(): { file: TFile | null; folder: TFolder | null; selection: LineRange | null };
	/** The CLI's commands as last reported, for the "/" list. */
	cliCommands: () => SlashCommand[] | null;
	/** Whether the panel's popover is open; it takes Escape. */
	popoverOpen: () => boolean;
	/** The one-line form's "+N" fit runs in the shell's resize pass. */
	resizePass: ResizePass;
}

export interface ComposerIntents {
	/** The view clears the text with `clearSent` once it takes it. */
	onSend: (text: string) => void;
	onStop: () => void;
	onToggleChip: (kind: ChipKind) => void;
	onRemoveChip: (item: TAbstractFile) => void;
	onRemoveImage: (image: PendingImage) => void;
	onOpenChip: (file: TFile) => void;
	/** The tab the picker opened for, which may no longer be active. */
	onAttach: (tab: ComposerTab, item: TAbstractFile) => void;
	/** The tab the paste or drop landed in; reading the files takes a while. */
	onImages: (tab: ComposerTab, images: PendingImage[]) => void;
	/** "+N" opens "Hidden context" through the popover host. */
	openPopover: OpenPopover;
}

/** What a chip stands for: a context chip by its kind, an attached item, or a pasted image. */
type ChipRef = ChipKind | TAbstractFile | PendingImage;

/** One chip's elements, kept by its ref so a redraw never replaces it (DES-003 Context block and chips). */
interface Chip {
	/** For the hidden list's focus. */
	readonly id: string;
	readonly ref: ChipRef;
	readonly el: HTMLElement;
	/** The button a click acts on, or a span for an attached folder, which only its remove button acts on. */
	readonly mainEl: HTMLElement;
	readonly iconEl: HTMLElement | null;
	readonly nameEl: HTMLElement;
	readonly labelEl: HTMLElement;
	readonly removeEl: HTMLButtonElement | null;
	view: ChipView;
	/** Its width in the one-line form, read while it shows; null until read, or after a relabel. */
	width: number | null;
}

let nextChipId = 0;
let nextInputId = 0;

/**
 * The composer card (DES-003 Composer): chips, textarea, attach and command
 * buttons, Stop and Send, for the active tab. The textarea's own handlers
 * write only the textarea (PRD-001.R29).
 */
export class Composer extends Component implements ResizeMeasure {
	private readonly cardEl: HTMLElement;
	private readonly chipsEl: HTMLElement;
	/** "+N": the chips the one-line form hides (PRD-001.R30). */
	private readonly plusEl: HTMLButtonElement;
	/** "+N", the text "+N" shows; its name is `plusNameEl`. */
	private readonly plusTextEl: HTMLElement;
	private readonly plusNameEl: HTMLElement;
	private readonly inputEl: HTMLTextAreaElement;
	private readonly stopEl: HTMLButtonElement;
	private readonly sendEl: HTMLButtonElement;
	private readonly mention: FileMentionSuggest;
	private readonly slash: SlashCommandSuggest;
	private readonly commandsEl: HTMLButtonElement;
	private readonly tab: Follower<ComposerTab, TabEvent>;
	/** The chips by what they stand for, in row order. */
	private chips = new Map<ChipRef, Chip>();
	/** The selected lines the note chip last named, and the frame that reads them again. */
	private selectionKey = "";
	private selectionFrame: number | null = null;
	/** The one-line form's measures: the row's gap, read once per `css-change`, and "+N"'s width by its label's length (it is monospace). */
	private gap: number | null = null;
	private plusWidth: { chars: number; width: number } | null = null;
	/** The last read: whether the row shows, whether it is in the one-line form, its on and attached chips, and how many fit. */
	private rowShown = false;
	private oneLine = false;
	private fitting: Chip[] = [];
	private fit = { count: 0, squeeze: false };
	/** The chips "+N" hides, as last written. */
	private hidden: Chip[] = [];
	private hiddenPopover: ChipsPopover | null = null;
	private stopShown = false;

	constructor(
		parent: HTMLElement,
		private readonly source: ComposerSource,
		private readonly intents: ComposerIntents
	) {
		super();
		this.tab = new Follower<ComposerTab, TabEvent>(this, {
			composer: () => this.render(),
			activity: () => this.renderState(),
		});
		this.cardEl = parent.createDiv({ cls: "ai-agent-panel-composer" });
		this.chipsEl = this.cardEl.createDiv({ cls: "ai-agent-panel-composer-chips" });
		this.plusEl = this.chipsEl.createEl("button", {
			cls: "ai-agent-panel-composer-chips-more",
			attr: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false" },
		});
		this.plusTextEl = this.plusEl.createSpan();
		this.plusNameEl = hiddenText(this.plusEl, "aria-labelledby", "");
		const inputId = `ai-agent-panel-composer-input-${++nextInputId}`;
		this.cardEl.createEl("label", { cls: "ai-agent-panel-visually-hidden", text: "Message Claude", attr: { for: inputId } });
		this.inputEl = this.cardEl.createEl("textarea", {
			cls: "ai-agent-panel-composer-input",
			attr: { rows: "2", id: inputId },
		});
		// Before the composer's own keydown handler: while their lists show,
		// they take Enter, Tab, the arrows and Escape.
		this.mention = new FileMentionSuggest(source.app, this.inputEl, this.cardEl);
		this.slash = new SlashCommandSuggest(this.inputEl, this.cardEl, () => source.cliCommands());
		const footer = this.cardEl.createDiv({ cls: "ai-agent-panel-composer-footer" });
		iconButton(this, footer, "paperclip", "Attach a file as context", () => this.openAttachPicker()).addClass(
			"ai-agent-panel-composer-attach"
		);
		// A boxed slash; its name differs across the Lucide versions Obsidian bundles.
		this.commandsEl = iconButton(this, footer, ["square-slash", "slash-square", "slash"], "Show commands", () =>
			this.openCommandList()
		);
		this.commandsEl.addClass("ai-agent-panel-composer-commands");
		// The button is active while the command list shows.
		this.slash.onShownChange = (shown) => this.commandsEl.toggleClass("is-active", shown);
		this.stopEl = iconButton(this, footer, "square", STOP_LABEL, () => intents.onStop());
		this.stopEl.addClass("ai-agent-panel-composer-stop");
		this.stopEl.toggle(false);
		this.sendEl = iconButton(this, footer, "arrow-up", "Send", () => this.send());
		this.sendEl.addClass("ai-agent-panel-composer-send");
	}

	onload(): void {
		this.registerEvent(this.source.viewEvents.on("active", () => this.showActive()));
		onOwnDocument(this, this.cardEl, "selectionchange", () => this.scheduleSelection());
		this.register(() => {
			if (this.selectionFrame !== null) this.cardEl.win.cancelAnimationFrame(this.selectionFrame);
		});
		this.registerDomEvent(this.inputEl, "keydown", (evt) => this.onKeydown(evt));
		this.registerDomEvent(this.inputEl, "input", () => this.updateFont());
		// Paste into the textarea or drop on the card: taken only when the payload
		// holds an image, so Obsidian's own note-link and file drops still work.
		this.registerDomEvent(this.inputEl, "paste", (evt) => this.takeFiles(evt, evt.clipboardData));
		this.registerDomEvent(this.cardEl, "dragover", (evt) => {
			if (!evt.dataTransfer || !Array.from(evt.dataTransfer.types).includes("Files")) return;
			evt.preventDefault();
			this.cardEl.addClass("is-drop-target");
		});
		this.registerDomEvent(this.cardEl, "dragleave", (evt) => {
			if (evt.target === this.cardEl) this.cardEl.removeClass("is-drop-target");
		});
		this.registerDomEvent(this.cardEl, "drop", (evt) => {
			this.cardEl.removeClass("is-drop-target");
			this.takeFiles(evt, evt.dataTransfer);
		});
		this.registerDomEvent(this.plusEl, "click", () => this.openHidden());
		this.register(this.source.resizePass.addMeasure(this));
		this.showActive();
	}

	/** The textarea's text, which the view keeps as the outgoing tab's draft. */
	get text(): string {
		return this.inputEl.value;
	}

	/** The message box's card: the box a popover that spans the composer opens from. */
	get card(): HTMLElement {
		return this.cardEl;
	}

	focus(): void {
		this.inputEl.focus();
	}

	/** Append after a blank line ("Add selection to chat", "Add output to chat", an unsent branch message). */
	append(text: string): void {
		this.inputEl.value = appendText(this.inputEl.value, text);
		this.updateFont();
		this.inputEl.focus();
	}

	/** A starter's prompt (PRD-001.R35): the text replaced, unsent, the caret at its end. */
	setText(text: string): void {
		this.inputEl.value = text;
		this.updateFont();
		this.inputEl.focus();
		this.inputEl.setSelectionRange(text.length, text.length);
	}

	/** A /help row (PRD-001.R20): `/<name>` and a space at the start, unsent, the caret after them. */
	insertCommand(name: string): void {
		const list = commandList(this.source.cliCommands());
		const text = withCommand(this.inputEl.value, name, [...list.panel, ...list.cli].map((cmd) => cmd.name));
		this.setText(text);
		this.inputEl.setSelectionRange(name.length + 2, name.length + 2);
	}

	/** The view took `text` (the trimmed text it was sent): clear it unless edited since. */
	clearSent(text: string): void {
		if (this.inputEl.value.trim() !== text) return;
		this.inputEl.value = "";
		this.updateFont();
	}

	/** A selection changed somewhere: once per frame, the note chip follows the editor's selected lines. */
	private scheduleSelection(): void {
		if (this.selectionFrame !== null) return;
		this.selectionFrame = this.cardEl.win.requestAnimationFrame(() => {
			this.selectionFrame = null;
			if (selectionKey(this.source.contextTargets().selection) !== this.selectionKey) this.renderChips();
		});
	}

	/** The active note or folder changed: the chips that offer them follow. */
	contextChanged(): void {
		this.renderChips();
	}

	private showActive(): void {
		const tab = this.source.activeTab();
		this.tab.follow(tab);
		this.inputEl.value = tab?.composer.draft ?? "";
		this.updateFont();
		this.render();
	}

	private render(): void {
		this.renderState();
		this.renderChips();
	}

	/** Placeholder, Send and Stop per DES-003 Composer state. */
	private renderState(): void {
		const tab = this.tab.current;
		if (!tab) return;
		const view = composerView(tab.activity, tab.composer.hasMessages);
		writeAttr(this.inputEl, "placeholder", view.placeholder);
		writeTooltip(this.sendEl, view.sendLabel);
		this.sendEl.toggleClass("is-dimmed", view.waiting);
		this.cardEl.toggleClass("is-waiting", view.waiting);
		if (this.stopShown === view.stopShown) return;
		this.stopShown = view.stopShown;
		this.stopEl.toggle(view.stopShown);
		// Stop takes room from the one-line form's chips.
		this.source.resizePass.requestPass();
	}

	private updateFont(): void {
		this.inputEl.toggleClass("is-command", isCommandText(this.inputEl.value));
	}

	private onKeydown(evt: KeyboardEvent): void {
		if (evt.key === "Enter" && !evt.shiftKey && !evt.isComposing) {
			evt.preventDefault();
			this.send();
			return;
		}
		if (evt.key !== "Escape") return;
		const action = escapeAction({
			composing: evt.isComposing,
			listOpen: this.mention.isShown || this.slash.isShown,
			popoverOpen: this.source.popoverOpen(),
			turnRunning: this.tab.current?.turnRunning ?? false,
		});
		if (action !== "interrupt") return;
		evt.preventDefault();
		this.intents.onStop();
	}

	private send(): void {
		this.intents.onSend(this.inputEl.value.trim());
	}

	private takeFiles(evt: Event, data: DataTransfer | null): void {
		const files = composerFiles(data?.files ? Array.from(data.files) : []);
		if (files.length === 0) return;
		evt.preventDefault();
		void this.attachImages(files);
	}

	private async attachImages(files: File[]): Promise<void> {
		const tab = this.tab.current;
		if (!tab) return;
		const { images, refusals } = await collectImages(files, tab.composer.images.length, async (file) =>
			arrayBufferToBase64(await file.arrayBuffer())
		);
		this.intents.onImages(tab, images);
		this.inputEl.focus();
		const notice = notAttachedMessage(refusals);
		if (notice) new Notice(notice);
	}

	/** The attach picker: the active folder first, then files by recency, then the other folders. */
	private openAttachPicker(): void {
		const tab = this.tab.current;
		if (!tab) return;
		const { vault } = this.source.app;
		const activeFolder = this.source.contextTargets().folder;
		const files = vault
			.getFiles()
			.slice()
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
		const folders = vault
			.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && f.path !== "/" && f !== activeFolder)
			.sort((a, b) => a.path.localeCompare(b.path));
		const items = [...(activeFolder ? [activeFolder] : []), ...files, ...folders].filter(
			(item) => !tab.composer.attached.includes(item)
		);
		new AddContextModal(this.source.app, items, (item) => {
			this.intents.onAttach(tab, item);
			this.inputEl.focus();
		}).open();
	}

	private openCommandList(): void {
		if (!this.inputEl.value.startsWith("/")) this.inputEl.value = "/" + this.inputEl.value;
		this.inputEl.focus();
		this.inputEl.setSelectionRange(1, 1);
		// The suggests listen to input: this opens the command list.
		this.inputEl.dispatchEvent(new Event("input"));
	}

	/** The chips, a keyed list: a chip is never replaced between mouse-down and mouse-up. */
	private renderChips(): void {
		const tab = this.tab.current;
		if (!tab) return;
		const data = tab.composer;
		const { file, folder, selection } = this.source.contextTargets();
		this.selectionKey = selectionKey(selection);
		const view = composerChips({
			note: file?.name ?? null,
			selection,
			folder: folder?.name ?? null,
			on: { note: data.includeNote, folder: data.includeFolder, links: data.includeLinks },
			attached: data.attached.map((item) => ({
				name: item instanceof TFile ? item.basename : item.name,
				path: item.path,
				folder: item instanceof TFolder,
			})),
			images: data.images,
		});
		const chips = new Map<ChipRef, Chip>();
		for (const chipView of view.chips) {
			const ref: ChipRef =
				chipView.slot === "image"
					? data.images[chipView.index]
					: chipView.index >= 0
						? data.attached[chipView.index]
						: (chipView.slot as ChipKind);
			const chip = this.chips.get(ref) ?? this.createChip(ref, chipView);
			this.writeChip(chip, chipView);
			chips.set(ref, chip);
		}
		this.chips = chips;
		syncChildren(this.chipsEl, [...[...chips.values()].map((chip) => chip.el), this.plusEl]);
		writeClass(this.cardEl, "is-inline-offer", view.inline);
		this.source.resizePass.requestPass();
	}

	private createChip(ref: ChipRef, view: ChipView): Chip {
		const id = `ai-agent-panel-chip-${++nextChipId}`;
		const el = createDiv({ cls: `ai-agent-panel-composer-chip mod-${view.slot}` });
		const clickable = view.slot !== "folder-item";
		const mainEl = clickable
			? el.createEl("button", { cls: "ai-agent-panel-composer-chip-main", attr: { type: "button", "aria-labelledby": `${id}-label` } })
			: el.createSpan({ cls: "ai-agent-panel-composer-chip-main" });
		let iconEl: HTMLElement | null = null;
		if (typeof ref === "object" && "base64" in ref) {
			const thumb = mainEl.createEl("img", { cls: "ai-agent-panel-composer-thumb", attr: { alt: "" } });
			thumb.src = `data:${ref.mediaType};base64,${ref.base64}`;
		} else iconEl = mainEl.createSpan({ cls: "ai-agent-panel-composer-chip-icon", attr: { "aria-hidden": "true" } });
		const nameEl = mainEl.createSpan({ cls: "ai-agent-panel-composer-chip-name" });
		const labelEl = mainEl.createSpan({ cls: "ai-agent-panel-visually-hidden", attr: { id: `${id}-label` } });
		let removeEl: HTMLButtonElement | null = null;
		if (view.slot === "file" || view.slot === "folder-item" || view.slot === "image") {
			removeEl = el.createEl("button", { cls: "ai-agent-panel-composer-chip-remove", attr: { type: "button" } });
			writeIcon(removeEl, "x");
			// Plain listeners: they go with the chip's element when it is dropped.
			removeEl.addEventListener("click", () => this.act(ref));
		}
		if (clickable) mainEl.addEventListener("click", () => this.click(ref));
		return { id, ref, el, mainEl, iconEl, nameEl, labelEl, removeEl, view, width: null };
	}

	private writeChip(chip: Chip, view: ChipView): void {
		if (chip.view.name !== view.name) {
			// Relabelled: read again, so shown whole until the next pass reads it.
			chip.width = null;
			writeClass(chip.el, "is-overflow", false);
			writeClass(chip.el, "is-squeezed", false);
		}
		chip.view = view;
		writeClass(chip.el, "is-offer", !view.on);
		if (chip.iconEl && view.icon) writeIcon(chip.iconEl, view.icon);
		writeText(chip.nameEl, view.name);
		// The name holds what a tooltip would say (PRD-001.R32: none on a chip).
		writeText(chip.labelEl, view.label);
		if (chip.removeEl) writeTooltip(chip.removeEl, view.actionLabel);
	}

	/** A chip's click: a context chip toggles, a file opens, an image shows large among the tab's images. */
	private click(ref: ChipRef): void {
		if (typeof ref === "string") this.intents.onToggleChip(ref);
		else if (ref instanceof TFile) this.intents.onOpenChip(ref);
		else if ("base64" in ref) {
			const images = this.tab.current?.composer.images ?? [ref];
			new ImageViewerModal(this.source.app, images, Math.max(0, images.indexOf(ref))).open();
		}
	}

	/** Its remove or turn-off button (the chip's, or its row in "Hidden context"). */
	private act(ref: ChipRef): void {
		if (typeof ref === "string") this.intents.onToggleChip(ref);
		else if ("base64" in ref) this.intents.onRemoveImage(ref);
		else this.intents.onRemoveChip(ref);
	}

	/**
	 * The resize pass's read (DES-003 Context block and chips): while the row
	 * is in the one-line form (its computed `flex-wrap` is `nowrap`, which
	 * only the short-height container query sets), its width, its gap and
	 * "+N"'s width once per label length, each on or attached chip's width
	 * once per label, all until `css-change`; then `fitChips`.
	 */
	read(cssChanged: boolean): void {
		if (cssChanged) {
			for (const chip of this.chips.values()) chip.width = null;
			this.gap = null;
			this.plusWidth = null;
		}
		// A hidden panel: nothing to measure, and the chips stay as they are.
		this.rowShown = this.chipsEl.isShown();
		if (!this.rowShown) return;
		const win = this.chipsEl.win;
		this.oneLine = win.getComputedStyle(this.chipsEl).flexWrap === "nowrap";
		this.fitting = [...this.chips.values()].filter((chip) => chip.view.on);
		if (!this.oneLine) return;
		this.gap ??= Number.parseFloat(win.getComputedStyle(this.chipsEl).columnGap) || 0;
		const chars = (this.plusTextEl.textContent ?? "").length;
		if (this.plusWidth?.chars !== chars && this.plusEl.isShown())
			this.plusWidth = { chars, width: this.plusEl.getBoundingClientRect().width };
		const widths = this.fitting.map((chip) => {
			// A hidden or squeezed chip keeps its width; one without (relabelled, or after `css-change`) is shown whole by the write, then read.
			if (chip.width === null && !chip.el.hasClass("is-overflow") && !chip.el.hasClass("is-squeezed"))
				chip.width = chip.el.getBoundingClientRect().width;
			return chip.width ?? 0;
		});
		this.fit = fitChips(this.chipsEl.getBoundingClientRect().width, this.gap, this.plusWidth?.width ?? 0, widths);
	}

	/** The resize pass's write: `is-overflow` on the chips past the count, `is-squeezed` on a first chip shrunk beside "+N", and "+N". */
	write(): void {
		if (!this.rowShown) return;
		// A chip not read yet shows whole for one pass, so the next one reads it.
		const hidden = this.oneLine ? this.fitting.slice(this.fit.count).filter((chip) => chip.width !== null) : [];
		const squeezed = this.oneLine && this.fit.squeeze && this.fitting[0]?.width !== null ? this.fitting[0] : null;
		for (const chip of this.chips.values()) {
			writeClass(chip.el, "is-overflow", hidden.includes(chip));
			writeClass(chip.el, "is-squeezed", chip === squeezed);
		}
		writeClass(this.chipsEl, "has-overflow", hidden.length > 0);
		const label = `Show hidden context (${hidden.length})`;
		const text = `+${hidden.length}`;
		writeText(this.plusTextEl, text);
		writeText(this.plusNameEl, label);
		this.hidden = hidden;
		// Redrawn only when a row differs.
		this.hiddenPopover?.redraw();
		// A width not read yet (a chip shown again, "+N" just shown or with more chars): the next pass reads it and fits again.
		const unread =
			this.fitting.some((chip) => chip.width === null) || (hidden.length > 0 && this.plusWidth?.chars !== text.length);
		if (this.oneLine && unread) this.source.resizePass.requestPass();
	}

	/** "+N": "Hidden context", following the hidden chips while open. */
	private openHidden(): void {
		const content = new ChipsPopover(() =>
			this.hidden.map(
				(chip): HiddenChip => ({
					key: chip.id,
					icon: chip.view.icon ?? "image",
					name: chip.view.name,
					actionLabel: chip.view.actionLabel,
					act: () => this.act(chip.ref),
				})
			)
		);
		content.register(() => {
			if (this.hiddenPopover === content) this.hiddenPopover = null;
		});
		this.hiddenPopover = content;
		this.intents.openPopover(this.plusEl, "chips", content);
	}
}

function selectionKey(selection: LineRange | null): string {
	return selection ? `${selection.from}-${selection.to}` : "";
}
