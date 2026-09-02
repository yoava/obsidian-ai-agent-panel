import {
	prepareFuzzySearch,
	setIcon,
	TFile,
	TFolder,
	type App,
	type TAbstractFile,
} from "obsidian";

const MAX_FILE_RESULTS = 8;

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
		this.inputEl.addEventListener("blur", () => {
			// Delay so a mousedown on a suggestion can land first.
			window.setTimeout(() => this.close(), 150);
		});
	}

	get isOpen(): boolean {
		return this.trigger !== null;
	}

	/** Where (if anywhere) the trigger token around the cursor starts. */
	protected abstract findTrigger(): Trigger | null;
	protected abstract search(query: string): T[];
	/** Text that replaces the trigger…cursor range when an item is picked. */
	protected abstract insertion(item: T): string;
	protected abstract renderItem(el: HTMLElement, item: T): void;

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
		if (!visible) return;
		this.items.forEach((item, index) => {
			const el = this.popupEl.createDiv({ cls: "ai-agent-panel-suggest-item" });
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

	protected renderItem(el: HTMLElement, item: TAbstractFile): void {
		const folder = item instanceof TFolder;
		const icon = el.createSpan();
		setIcon(icon, folder ? "folder" : "file-text");
		el.createSpan({
			cls: "ai-agent-panel-suggest-name",
			text: item instanceof TFile ? item.basename : item.name,
		});
		el.createSpan({
			cls: "ai-agent-panel-suggest-detail",
			text: folder ? `${item.path}/` : item.path,
		});
	}
}

export interface SlashCommand {
	name: string;
	description?: string;
}

/**
 * Commands the plugin answers itself (see the view's local-command handling)
 * - they never reach the CLI or the model, so they cost nothing.
 */
export const LOCAL_USAGE_COMMANDS = ["usage", "usage-credits", "extra-usage"] as const;

/**
 * Built-in commands the CLI supports over stream-JSON, shown until the
 * session's init message reports the real list. Also decorates CLI-reported
 * names with descriptions.
 */
const BUILTIN_DESCRIPTIONS: Record<string, string> = {
	compact: "Summarize the conversation to free up context",
	context: "Show what is using up the context window",
	cost: "Show total cost and duration of this session",
	init: "Create a CLAUDE.md with codebase documentation",
	"pr-comments": "Fetch comments from a GitHub pull request",
	"release-notes": "Show Claude Code release notes",
	review: "Review a GitHub pull request",
	"security-review": "Security review of pending changes",
	todos: "List current todo items",
	usage: "Show plan usage limits (answered by the plugin - no tokens)",
	"usage-credits": "Show extra-usage credit status (answered by the plugin)",
	"extra-usage": "Show extra-usage credit status (answered by the plugin)",
};

/**
 * "/" slash-command autocomplete. Typing "/" at the start of the message
 * lists available commands - built-ins plus, once a session is running,
 * whatever the CLI reports (custom commands and skills included).
 */
export class SlashCommandSuggest extends TextareaSuggest<SlashCommand> {
	private commands: SlashCommand[] = Object.entries(BUILTIN_DESCRIPTIONS).map(
		([name, description]) => ({ name, description })
	);

	/**
	 * Replace the list with the CLI-reported one (from the init message),
	 * keeping the plugin-answered usage commands in the list.
	 */
	setCommands(names: string[]): void {
		this.commands = [...new Set([...names, ...LOCAL_USAGE_COMMANDS])]
			.map((name) => ({ name, description: BUILTIN_DESCRIPTIONS[name] }))
			.sort((a, b) => a.name.localeCompare(b.name));
		if (this.isOpen) this.update();
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

	protected search(query: string): SlashCommand[] {
		if (!query) return this.commands;
		const fuzzy = prepareFuzzySearch(query);
		const scored: Array<{ cmd: SlashCommand; score: number }> = [];
		for (const cmd of this.commands) {
			const match = fuzzy(cmd.name);
			if (match) scored.push({ cmd, score: match.score });
		}
		scored.sort((a, b) => b.score - a.score);
		return scored.map((s) => s.cmd);
	}

	protected insertion(cmd: SlashCommand): string {
		return `/${cmd.name} `;
	}

	protected renderItem(el: HTMLElement, cmd: SlashCommand): void {
		const name = el.createSpan({ cls: "ai-agent-panel-suggest-name" });
		name.createSpan({ cls: "ai-agent-panel-suggest-slash", text: "/" });
		name.appendText(cmd.name);
		if (cmd.description)
			el.createSpan({ cls: "ai-agent-panel-suggest-detail", text: cmd.description });
	}
}
