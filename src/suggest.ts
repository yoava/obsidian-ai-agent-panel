import {
	FuzzySuggestModal,
	prepareFuzzySearch,
	setIcon,
	TFile,
	TFolder,
	type App,
	type TAbstractFile,
} from "obsidian";
import { commandList, type SlashCommand } from "./commands";
import { BlurClose, holdsFocus } from "./state/blur-close";
import { rankSlash } from "./state/slash-rank";
import { folderLabel, matchedPrefix } from "./state/suggest-rows";
import { themeModal } from "./theme-scope";

const MAX_FILE_RESULTS = 8;
const BLUR_GRACE_MS = 150;

/** One key hint of a list's footer: the keys, then what they do. */
interface KeyHint {
	keys: readonly string[];
	action: string;
}

interface Trigger {
	/** Index of the trigger character ("@" or "/") in the textarea value. */
	start: number;
	query: string;
}

/**
 * Shared popup machinery for the chat textarea autocompletes: trigger
 * detection on input, arrow/Enter/Tab/Escape handling, and item rendering.
 *
 * Construct instances BEFORE attaching other keydown handlers to the
 * textarea: while open they consume navigation keys with
 * stopImmediatePropagation.
 */
abstract class TextareaSuggest<T> {
	protected popupEl: HTMLElement;
	protected items: T[] = [];
	private selected = 0;
	protected trigger: Trigger | null = null;
	/** Called when the list appears or goes away. */
	onShownChange: ((shown: boolean) => void) | null = null;
	private wasShown = false;

	constructor(
		protected inputEl: HTMLTextAreaElement,
		anchorEl: HTMLElement
	) {
		this.popupEl = anchorEl.createDiv({ cls: "ai-agent-panel-suggest ai-agent-panel-hidden" });

		this.inputEl.addEventListener("input", () => this.update());
		// Reposition/close on caret moves, but don't pop open on a mere click
		// into already-inserted text.
		this.inputEl.addEventListener("click", () => {
			if (this.isOpen) this.update();
		});
		this.inputEl.addEventListener("keydown", (evt) => this.onKeydown(evt));
		// Delay the close so a mousedown on a suggestion can land first, but not
		// past focus returning (the commands button refocuses the textarea).
		const blurClose = new BlurClose(
			() => this.close(),
			() => holdsFocus(this.inputEl),
			BLUR_GRACE_MS,
			this.inputEl.win as typeof window
		);
		this.inputEl.addEventListener("blur", () => blurClose.schedule());
		this.inputEl.addEventListener("focus", () => blurClose.cancel());
	}

	get isOpen(): boolean {
		return this.trigger !== null;
	}

	/** The list is on screen, so it takes Enter, Tab, the arrows and Escape. */
	get isShown(): boolean {
		return this.isOpen && this.items.length > 0;
	}

	/** Where (if anywhere) the trigger token around the cursor starts. */
	protected abstract findTrigger(): Trigger | null;
	protected abstract search(query: string): T[];
	/** Text that replaces the trigger…cursor range when an item is picked. */
	protected abstract insertion(item: T): string;
	protected abstract renderItem(el: HTMLElement, item: T): void;

	/** The group an item is listed under, a header starting each; null lists it with no header. */
	protected groupOf(_item: T): string | null {
		return null;
	}

	/** A group's header, which takes no selection. */
	protected renderGroup(_el: HTMLElement, _group: string): void {}

	/** The label above the rows; null for none. */
	protected headerLabel(): string | null {
		return null;
	}

	/** The keys the list answers to, under the rows; none for no footer. */
	protected footerHints(): readonly KeyHint[] {
		return [];
	}

	private onKeydown(evt: KeyboardEvent): void {
		if (!this.isOpen || this.items.length === 0 || evt.isComposing) return;
		switch (evt.key) {
			case "ArrowDown":
				this.setSelected(this.selected + 1);
				break;
			case "ArrowUp":
				this.setSelected(this.selected - 1);
				break;
			case "Enter":
			case "Tab":
				this.pick(this.items[this.selected]);
				break;
			case "Escape":
				this.close();
				break;
			default:
				return;
		}
		evt.preventDefault();
		evt.stopImmediatePropagation();
	}

	protected update(): void {
		this.trigger = this.findTrigger();
		if (!this.trigger) {
			this.render();
			return;
		}
		this.items = this.search(this.trigger.query);
		this.selected = 0;
		this.render();
	}

	private pick(item: T): void {
		if (!this.trigger) return;
		const { start } = this.trigger;
		const cursor = this.inputEl.selectionStart;
		const value = this.inputEl.value;
		const inserted = this.insertion(item);
		this.inputEl.value = value.slice(0, start) + inserted + value.slice(cursor);
		const pos = start + inserted.length;
		this.inputEl.setSelectionRange(pos, pos);
		this.inputEl.focus();
		this.close();
	}

	private setSelected(index: number): void {
		if (this.items.length === 0) return;
		this.selected = (index + this.items.length) % this.items.length;
		this.render();
	}

	private close(): void {
		this.trigger = null;
		this.items = [];
		this.render();
	}

	private render(): void {
		this.popupEl.empty();
		const visible = this.isOpen && this.items.length > 0;
		this.popupEl.toggleClass("ai-agent-panel-hidden", !visible);
		if (visible !== this.wasShown) {
			this.wasShown = visible;
			this.onShownChange?.(visible);
		}
		if (!visible) return;
		let group: string | null = null;
		const label = this.headerLabel();
		if (label !== null) this.popupEl.createDiv({ cls: "ai-agent-panel-suggest-header", text: label });
		// The rows scroll between the header and the footer, which stay.
		const rows = this.popupEl.createDiv({ cls: "ai-agent-panel-suggest-rows" });
		this.items.forEach((item, index) => {
			const itemGroup = this.groupOf(item);
			if (itemGroup !== null && itemGroup !== group)
				this.renderGroup(rows.createDiv({ cls: "ai-agent-panel-suggest-group" }), itemGroup);
			group = itemGroup;
			const el = rows.createDiv({ cls: "ai-agent-panel-suggest-item" });
			el.toggleClass("is-selected", index === this.selected);
			this.renderItem(el, item);
			el.addEventListener("mousedown", (evt) => {
				evt.preventDefault(); // keep textarea focus
				this.pick(item);
			});
			el.addEventListener("mousemove", () => {
				if (this.selected !== index) {
					this.selected = index;
					this.render();
				}
			});
			if (index === this.selected) el.scrollIntoView({ block: "nearest" });
		});
		const hints = this.footerHints();
		if (hints.length === 0) return;
		const footer = this.popupEl.createDiv({ cls: "ai-agent-panel-suggest-footer" });
		for (const hint of hints) {
			const el = footer.createSpan({ cls: "ai-agent-panel-suggest-hint-keys" });
			for (const key of hint.keys) el.createEl("kbd", { cls: "ai-agent-panel-kbd", text: key });
			// Whitespace between flex items does not draw, but keeps the DOM text apart.
			el.appendText(" ");
			el.createSpan({ text: hint.action });
			footer.appendText(" ");
		}
	}
}

/**
 * "@" file/folder autocomplete. Typing "@" plus a query pops up fuzzy-matched
 * vault files and folders; selecting one inserts its vault-relative path
 * (folders with a trailing "/"), which is also what the CLI resolves, since
 * it runs with cwd = vault root.
 */
export class FileMentionSuggest extends TextareaSuggest<TAbstractFile> {
	constructor(
		private app: App,
		inputEl: HTMLTextAreaElement,
		anchorEl: HTMLElement
	) {
		super(inputEl, anchorEl);
	}

	protected findTrigger(): Trigger | null {
		const cursor = this.inputEl.selectionStart;
		if (cursor !== this.inputEl.selectionEnd) return null;
		const before = this.inputEl.value.slice(0, cursor);
		const start = before.lastIndexOf("@");
		if (start === -1) return null;
		// Must begin a token, not be part of an email or path already typed.
		if (start > 0 && !/[\s([{'"]/.test(before[start - 1])) return null;
		const query = before.slice(start + 1);
		// A leading space means it's prose ("email @ me"), not a mention -
		// inserted mentions never start with one. Bailing here avoids a
		// full-vault fuzzy scan on every keystroke of an ordinary sentence.
		if (query.startsWith(" ") || query.includes("\n") || query.length > 80)
			return null;
		return { start, query };
	}

	protected search(query: string): TAbstractFile[] {
		if (!query) {
			// No query yet: offer the most recently modified notes.
			return this.app.vault
				.getFiles()
				.slice()
				.sort((a, b) => b.stat.mtime - a.stat.mtime)
				.slice(0, MAX_FILE_RESULTS);
		}
		const fuzzy = prepareFuzzySearch(query);
		const scored: Array<{ item: TAbstractFile; score: number }> = [];
		for (const item of this.app.vault.getAllLoadedFiles()) {
			if (item.path === "/") continue; // vault root
			const name = item instanceof TFile ? item.basename : item.name;
			const pathMatch = fuzzy(item.path);
			const nameMatch = fuzzy(name);
			const score = Math.max(
				pathMatch?.score ?? -Infinity,
				// Prefer name hits so short queries surface titles.
				nameMatch ? nameMatch.score + 0.5 : -Infinity
			);
			if (score > -Infinity) scored.push({ item, score });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, MAX_FILE_RESULTS).map((s) => s.item);
	}

	protected insertion(item: TAbstractFile): string {
		return item instanceof TFolder ? `@${item.path}/ ` : `@${item.path} `;
	}

	protected headerLabel(): string {
		return "Files";
	}

	protected footerHints(): readonly KeyHint[] {
		return [
			{ keys: ["↑", "↓"], action: "navigate" },
			{ keys: ["↵"], action: "attach" },
			{ keys: ["esc"], action: "close" },
		];
	}

	protected renderItem(el: HTMLElement, item: TAbstractFile): void {
		const folder = item instanceof TFolder;
		const icon = el.createSpan();
		setIcon(icon, folder ? "folder" : "file-text");
		const label = folder ? `${item.name}/` : item.name;
		const matched = matchedPrefix(label, this.trigger?.query ?? "");
		el.addClass("mod-file");
		const name = el.createSpan({ cls: "ai-agent-panel-suggest-name" });
		if (matched > 0) name.createSpan({ cls: "ai-agent-panel-suggest-match", text: label.slice(0, matched) });
		name.appendText(label.slice(matched));
		el.createSpan({ cls: "ai-agent-panel-suggest-detail mod-path", text: folderLabel(item.path) });
		el.createEl("kbd", { cls: "ai-agent-panel-kbd ai-agent-panel-suggest-enter", text: "↵" });
	}
}

export type { SlashCommand };

/** A row of the command list: a command and the group it is listed in (PRD-001.R19). */
interface SlashEntry extends SlashCommand {
	group: "panel" | "cli";
}

/**
 * "/" slash-command autocomplete (DES-003 Suggests): while the text starts
 * with "/" and the name has no whitespace yet, the commands matching it in
 * two groups, "Answered by the panel" marked "no tokens" and then "Claude
 * Code" (what the CLI last reported, `cliCommands`, or the built-ins before
 * it has), each row with its description and argument hint.
 */
export class SlashCommandSuggest extends TextareaSuggest<SlashEntry> {
	private source: readonly SlashCommand[] | null | undefined = undefined;
	private entries: SlashEntry[] = [];

	constructor(
		inputEl: HTMLTextAreaElement,
		anchorEl: HTMLElement,
		private readonly cliCommands: () => readonly SlashCommand[] | null
	) {
		super(inputEl, anchorEl);
	}

	/** The list for the CLI's commands as last reported, built once per report. */
	private get commands(): SlashEntry[] {
		const cli = this.cliCommands();
		if (cli !== this.source) {
			this.source = cli;
			const list = commandList(cli);
			this.entries = [
				...list.panel.map((cmd): SlashEntry => ({ ...cmd, group: "panel" })),
				...list.cli.map((cmd): SlashEntry => ({ ...cmd, group: "cli" })),
			];
		}
		return this.entries;
	}

	protected findTrigger(): Trigger | null {
		const cursor = this.inputEl.selectionStart;
		if (cursor !== this.inputEl.selectionEnd || cursor < 1) return null;
		// Commands only make sense as the very start of the message.
		if (!this.inputEl.value.startsWith("/")) return null;
		const query = this.inputEl.value.slice(1, cursor);
		// Whitespace means the command is typed and arguments have begun.
		if (/\s/.test(query)) return null;
		return { start: 0, query };
	}

	/** Fuzzy over the names, the exact match first, then the groups in order (`rankSlash`). */
	protected search(query: string): SlashEntry[] {
		return rankSlash(this.commands, query, query ? prepareFuzzySearch(query) : () => null);
	}

	protected insertion(cmd: SlashEntry): string {
		return `/${cmd.name} `;
	}

	protected groupOf(cmd: SlashEntry): string {
		return cmd.group;
	}

	protected renderGroup(el: HTMLElement, group: string): void {
		el.createSpan({ text: group === "panel" ? "Answered by the panel" : "Claude Code" });
		if (group === "panel") el.createSpan({ cls: "ai-agent-panel-suggest-badge", text: "no tokens" });
	}

	protected renderItem(el: HTMLElement, cmd: SlashEntry): void {
		const name = el.createSpan({ cls: "ai-agent-panel-suggest-name mod-command" });
		name.createSpan({ cls: "ai-agent-panel-suggest-slash", text: "/" });
		name.appendText(cmd.name);
		if (cmd.argumentHint)
			name.createSpan({ cls: "ai-agent-panel-suggest-hint", text: ` ${cmd.argumentHint}` });
		if (cmd.description)
			el.createSpan({ cls: "ai-agent-panel-suggest-detail", text: cmd.description });
	}
}

/** The composer's attach picker: a vault file or folder to attach as context. */
export class AddContextModal extends FuzzySuggestModal<TAbstractFile> {
	private detachTheme: (() => void) | null = null;

	constructor(
		app: App,
		private items: TAbstractFile[],
		private onPick: (item: TAbstractFile) => void
	) {
		super(app);
		this.setPlaceholder("Attach a file or folder as context…");
	}

	onOpen(): void {
		void super.onOpen();
		this.detachTheme = themeModal(this);
	}

	onClose(): void {
		super.onClose();
		this.detachTheme?.();
		this.detachTheme = null;
	}

	getItems(): TAbstractFile[] {
		return this.items;
	}

	getItemText(item: TAbstractFile): string {
		// The trailing slash marks folders apart from files.
		return item instanceof TFolder ? `${item.path}/` : item.path;
	}

	onChooseItem(item: TAbstractFile): void {
		this.onPick(item);
	}
}
