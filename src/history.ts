import {
	FuzzySuggestModal,
	Modal,
	Notice,
	setIcon,
	type App,
	type FuzzyMatch,
} from "obsidian";
import type { ChatPermissionMode } from "./settings-core";

/**
 * Plugin-owned conversation history.
 *
 * The CLI keeps its own transcripts in ~/.claude/projects, but resuming a
 * session does not replay past messages, there is no CLI command to list
 * sessions, and in WSL mode those files live in another filesystem. So the
 * view records what it renders, and we persist that under the plugin folder:
 * .obsidian/plugins/ai-agent-panel/history/<id>.json
 */

export type StoredMessage =
	| {
			kind: "user";
			text: string;
			contextName?: string;
			/** Vault paths sent as context (folders end with "/"); exported as links. */
			contextPaths?: string[];
			/**
			 * How many images were attached. The bytes are not stored - they would
			 * dwarf the transcript - so a restored message shows the count only.
			 */
			images?: number;
	  }
	| {
			/** A "!" shell command the user ran from the composer. */
			kind: "bash";
			command: string;
			stdout?: string;
			stderr?: string;
			code?: number;
			timedOut?: boolean;
			durationMs?: number;
	  }
	| { kind: "assistant"; text: string }
	| { kind: "thinking"; text: string }
	| {
			kind: "tool";
			name: string;
			input: unknown;
			result?: string;
			isError?: boolean;
			/** Lines added/removed, for edit tools whose diff was computed. */
			added?: number;
			removed?: number;
	  }
	| {
			kind: "meta";
			durationMs?: number;
			costUsd?: number;
			error?: string;
			/** 1-based turn number, the key for this turn's file checkpoint. */
			turn?: number;
			/** The turn snapshotted files, so "restore files" is offered. */
			restorable?: boolean;
			/** uuid of the turn's user message, for branching from this point. */
			rewindUuid?: string;
	  };

export interface StoredConversation {
	version: 1;
	/** Stable file id, assigned by the plugin (not the CLI session id). */
	id: string;
	/** CLI session id, once known; used for --resume. */
	sessionId: string | null;
	title: string;
	createdAt: number;
	updatedAt: number;
	model?: string;
	effort?: string;
	permissionMode?: ChatPermissionMode;
	/** Vault path of the exported Markdown note, once one exists. */
	exportPath?: string;
	/**
	 * Kept at the top of the conversation column. A property of the
	 * conversation rather than of this device's layout, so it travels with the
	 * file and syncs with the vault. Absent already means "not pinned", which
	 * is why this needed no version bump.
	 */
	pinned?: boolean;
	/** When it was pinned; orders the Pinned section, oldest pin first. */
	pinnedAt?: number;
	messages: StoredMessage[];
}

export interface ConversationMeta {
	id: string;
	title: string;
	updatedAt: number;
	messageCount: number;
	pinned?: boolean;
	pinnedAt?: number;
}

const SAVE_DEBOUNCE_MS = 1000;

export function newConversationId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Conversation ids become file names (`<id>.json`), so they must not contain
 * path separators or traversal. Generated ids are `<base36>-<base36>`; this
 * matches that shape and rejects anything a tampered/synced file could carry.
 */
function isSafeConversationId(id: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(id);
}

export class HistoryStore {
	private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private dirReady: Promise<void> | null = null;

	/**
	 * Metadata for every conversation the plugin knows about.
	 *
	 * The conversation column is on screen the whole time a side layout is
	 * used, so it cannot afford to ask the disk what exists: a folder scan
	 * reads and JSON-parses every conversation file, and a running turn saves
	 * about once a second. The map is filled once by a scan and then kept
	 * current from save() and delete(), which are the only ways this plugin
	 * changes the folder.
	 */
	private metas = new Map<string, ConversationMeta>();
	/** Whether a full folder scan has happened yet. */
	private scanned = false;
	/** In-flight scan, so two views opening together read the folder once. */
	private scanning: Promise<ConversationMeta[]> | null = null;
	/** Deleted while a scan was in flight - that scan's snapshot predates them. */
	private deletedDuringScan = new Set<string>();

	/**
	 * Runs before each persist and may enrich the conversation (markdown
	 * auto-export sets exportPath), so what it writes lands in the same save.
	 */
	onBeforeSave: ((conversation: StoredConversation) => Promise<void>) | null = null;

	/** Runs after a conversation is deleted, so its side data can go too. */
	onDeleted: ((id: string) => void) | null = null;

	/**
	 * Runs whenever the known set of conversations changes, so a view can
	 * redraw its list without going back to disk.
	 */
	onChanged: (() => void) | null = null;

	constructor(private app: App, private dir: string) {}

	/** What the cache would record for a conversation. */
	private static metaOf(conversation: StoredConversation): ConversationMeta {
		return {
			id: conversation.id,
			title: conversation.title,
			updatedAt: conversation.updatedAt,
			messageCount: conversation.messages.length,
			pinned: conversation.pinned,
			pinnedAt: conversation.pinnedAt,
		};
	}

	/** Cached metadata for one conversation, if it is known. No IO. */
	meta(id: string): ConversationMeta | undefined {
		return this.metas.get(id);
	}

	/** Everything known right now, newest first. No IO - safe to call per render. */
	snapshot(): ConversationMeta[] {
		return [...this.metas.values()].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/** False until the first scan lands, so a view can hold off its empty state. */
	get isScanned(): boolean {
		return this.scanned;
	}

	/** Debounced save; call after every recorded message. */
	queueSave(conversation: StoredConversation): void {
		const existing = this.saveTimers.get(conversation.id);
		if (existing) clearTimeout(existing);
		this.saveTimers.set(
			conversation.id,
			setTimeout(() => {
				this.saveTimers.delete(conversation.id);
				void this.save(conversation);
			}, SAVE_DEBOUNCE_MS)
		);
	}

	async save(
		conversation: StoredConversation,
		options: { touch?: boolean } = {}
	): Promise<void> {
		if (conversation.messages.length === 0) return;
		// Pinning is not activity. Without this, unpinning a months-old
		// conversation would drop it into "Recent" under today's date.
		if (options.touch !== false) conversation.updatedAt = Date.now();
		try {
			await this.onBeforeSave?.(conversation);
		} catch (err) {
			console.error("AI Agent Panel: pre-save hook failed", err);
		}
		try {
			await this.ensureDir();
			await this.app.vault.adapter.write(
				this.pathFor(conversation.id),
				JSON.stringify(conversation)
			);
			this.remember(conversation);
		} catch (err) {
			console.error("AI Agent Panel: failed to save conversation", err);
		}
	}

	/**
	 * Fold a just-written conversation into the cache. Announced only when
	 * something a list would draw actually moved - a save that changes nothing
	 * visible should not cost a re-render.
	 */
	private remember(conversation: StoredConversation): void {
		const meta = HistoryStore.metaOf(conversation);
		const previous = this.metas.get(meta.id);
		this.metas.set(meta.id, meta);
		if (
			!previous ||
			previous.title !== meta.title ||
			previous.updatedAt !== meta.updatedAt ||
			previous.messageCount !== meta.messageCount ||
			previous.pinned !== meta.pinned ||
			previous.pinnedAt !== meta.pinnedAt
		)
			this.onChanged?.();
	}

	/** Flush a pending debounced save immediately (e.g. on view close). */
	async flush(
		conversation: StoredConversation | null,
		options: { touch?: boolean } = {}
	): Promise<void> {
		if (!conversation) return;
		const timer = this.saveTimers.get(conversation.id);
		if (timer) {
			clearTimeout(timer);
			this.saveTimers.delete(conversation.id);
		}
		await this.save(conversation, options);
	}

	/** Everything, scanning the folder the first time it is asked. */
	async list(): Promise<ConversationMeta[]> {
		if (!this.scanned) await this.refresh();
		return this.snapshot();
	}

	/**
	 * Re-read the folder. Only worth doing when files can have appeared behind
	 * the plugin's back - a view opening, or a vault sync landing new files -
	 * since every change this plugin makes goes through save() or delete() and
	 * updates the cache in place.
	 */
	refresh(): Promise<ConversationMeta[]> {
		return (this.scanning ??= this.scan().finally(() => {
			this.scanning = null;
		}));
	}

	private async scan(): Promise<ConversationMeta[]> {
		const found = new Map<string, ConversationMeta>();
		try {
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(this.dir)) {
				const listing = await adapter.list(this.dir);
				for (const file of listing.files) {
					if (!file.endsWith(".json")) continue;
					const conversation = await this.readFile(file);
					if (!conversation) continue;
					// The file name is authoritative for the id (readFile pins it),
					// so load()/delete() always resolve back to this same file.
					found.set(conversation.id, HistoryStore.metaOf(conversation));
				}
			}
		} catch (err) {
			// A folder that cannot be listed must not leave the column saying
			// "Loading…" for the rest of the session, or reject into the void
			// of the caller's `void refresh()`. Fall through with whatever
			// load() and save() have already put in the cache.
			console.error("AI Agent Panel: failed to list conversations", err);
		}
		// A scan takes a while, and saves and deletes keep happening while it
		// runs. Both are newer than anything it read, so they win over it.
		for (const [id, meta] of this.metas) {
			const scannedMeta = found.get(id);
			if (!scannedMeta || scannedMeta.updatedAt < meta.updatedAt) found.set(id, meta);
		}
		for (const id of this.deletedDuringScan) found.delete(id);
		this.deletedDuringScan.clear();
		this.metas = found;
		this.scanned = true;
		this.onChanged?.();
		return this.snapshot();
	}

	async load(id: string): Promise<StoredConversation | null> {
		if (!isSafeConversationId(id)) return null;
		const conversation = await this.readFile(this.pathFor(id));
		// Opening a conversation is not a change, so this fills the cache
		// silently - restoring a dozen tabs must not fire a dozen re-renders.
		if (conversation)
			this.metas.set(conversation.id, HistoryStore.metaOf(conversation));
		return conversation;
	}

	/**
	 * Returns false when the file is still on disk afterwards. Callers must
	 * check: detaching an open tab from a conversation that still exists would
	 * strand it - the tab loses its resume id and starts a second record, and
	 * the next scan brings the original back alongside it.
	 */
	async delete(id: string): Promise<boolean> {
		const timer = this.saveTimers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.saveTimers.delete(id);
		}
		try {
			await this.app.vault.adapter.remove(this.pathFor(id));
		} catch (err) {
			console.error("AI Agent Panel: failed to delete conversation", err);
			// A file that was already gone is a success as far as the caller is
			// concerned. One that is still there is not.
			const survived = await this.app.vault.adapter
				.exists(this.pathFor(id))
				.catch(() => false);
			if (survived) {
				new Notice("Could not delete that conversation.");
				return false;
			}
		}
		this.metas.delete(id);
		if (this.scanning) this.deletedDuringScan.add(id);
		this.onDeleted?.(id);
		this.onChanged?.();
		return true;
	}

	private pathFor(id: string): string {
		// Never build a path from an untrusted id - it names a file on disk.
		if (!isSafeConversationId(id))
			throw new Error(`Unsafe conversation id: ${id}`);
		return `${this.dir}/${id}.json`;
	}

	private async readFile(path: string): Promise<StoredConversation | null> {
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as StoredConversation;
			if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.messages))
				return null;
			// Pin the id to the file name so a tampered internal id can never
			// steer a later save() or delete() to a different path.
			const stem = path.split("/").pop()?.replace(/\.json$/, "") ?? "";
			if (!isSafeConversationId(stem)) return null;
			parsed.id = stem;
			return parsed;
		} catch (err) {
			console.error(`AI Agent Panel: could not read ${path}`, err);
		}
		return null;
	}

	private ensureDir(): Promise<void> {
		if (!this.dirReady) {
			this.dirReady = (async () => {
				const adapter = this.app.vault.adapter;
				if (!(await adapter.exists(this.dir))) await adapter.mkdir(this.dir);
			})().catch((err) => {
				this.dirReady = null;
				throw err;
			});
		}
		return this.dirReady;
	}
}

// ---------------------------------------------------------------------------

export function relativeTime(timestamp: number): string {
	const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
	if (seconds < 60) return "just now";
	const minutes = seconds / 60;
	if (minutes < 60) return `${Math.floor(minutes)}m ago`;
	const hours = minutes / 60;
	if (hours < 24) return `${Math.floor(hours)}h ago`;
	const days = hours / 24;
	if (days < 30) return `${Math.floor(days)}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

/**
 * Deleting a conversation removes its file and its checkpoints for good, and
 * unlike closing a tab there is nothing to undo it with - so it asks first,
 * wherever it is triggered from.
 */
export class DeleteConversationModal extends Modal {
	constructor(app: App, private title: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Delete conversation" });
		contentEl.createEl("p", {
			text:
				`"${this.title}" and everything said in it will be removed from ` +
				"this vault, along with the file checkpoints that let its turns be " +
				"undone. Any transcript already exported stays where it is.",
		});
		const buttons = contentEl.createDiv({ cls: "ai-agent-panel-permission-buttons" });
		buttons.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
			this.close();
		});
		const confirm = buttons.createEl("button", {
			cls: "mod-warning",
			text: "Delete",
		});
		confirm.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
		confirm.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class ConversationPickerModal extends FuzzySuggestModal<ConversationMeta> {
	constructor(
		app: App,
		private store: HistoryStore,
		private items: ConversationMeta[],
		private onPick: (conversation: StoredConversation) => void,
		private onDelete?: (id: string) => void
	) {
		super(app);
		this.setPlaceholder("Search previous conversations…");
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "open" },
		]);
	}

	getItems(): ConversationMeta[] {
		return this.items;
	}

	getItemText(item: ConversationMeta): string {
		return item.title;
	}

	renderSuggestion(match: FuzzyMatch<ConversationMeta>, el: HTMLElement): void {
		el.addClass("ai-agent-panel-history-item");
		const main = el.createDiv({ cls: "ai-agent-panel-history-main" });
		main.createDiv({ cls: "ai-agent-panel-history-title", text: match.item.title });
		main.createDiv({
			cls: "ai-agent-panel-history-meta",
			text: `${relativeTime(match.item.updatedAt)} · ${match.item.messageCount} messages`,
		});
		const deleteBtn = el.createEl("button", {
			cls: "clickable-icon ai-agent-panel-history-delete",
			attr: { "aria-label": "Delete conversation" },
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			void this.store.delete(match.item.id).then((deleted) => {
				// A delete that failed leaves the conversation on disk, so the
				// row stays and no open tab may be detached from it.
				if (!deleted) return;
				// Detach any open tab first so its next save can't rewrite the
				// file we just removed.
				this.onDelete?.(match.item.id);
				this.items = this.items.filter((i) => i.id !== match.item.id);
				// Re-run the query so the list refreshes.
				this.inputEl.dispatchEvent(new Event("input"));
			});
		});
	}

	onChooseItem(item: ConversationMeta): void {
		void this.store.load(item.id).then((conversation) => {
			if (conversation) this.onPick(conversation);
			else new Notice("Could not load that conversation.");
		});
	}
}
