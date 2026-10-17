import {
	FuzzySuggestModal,
	Notice,
	setIcon,
	type App,
	type FuzzyMatch,
} from "obsidian";
import { ConfirmModal } from "./confirm-modal";
import { displayTitle } from "./conversation-list";
import { ScanJournal } from "./history-core";
import { checkStoredMessages, checkStoredTimes, dropNonStringText, readForkBase } from "./history-file";
import { OncePerId } from "./history-notice";
import { dropUnsafeArgValues, migrateStoredModel, type ChatPermissionMode } from "./settings-core";
import { fileVersion, isStoredVersion, type ClearRecord, type FreshStartRecord } from "./state/boundary-records";
import {
	MIGRATION_MARKER,
	storedSessionIds,
	type ScanReport,
	type SeedSource,
	type SessionProvenance,
} from "./state/session-provenance";
import type { ForkBase } from "./state/fork-base";
import { hidesTooltips, NO_TOOLTIPS_CLASS } from "./state/tooltips";
import { themeModal } from "./theme-scope";
import { clearTimer, setTimer, type TimerHandle } from "./timers";

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
			/** When a prompt sent to Claude was sent (ms since the epoch); absent in older files (PRD-003.R1). */
			sentAt?: number;
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
			/** A compaction the CLI reported done (PRD-003.R1); an optional addition in version 1 (ADR-018). */
			kind: "compaction";
			/** When it was reported (ms since the epoch). */
			at?: number;
			trigger?: "auto" | "manual";
			/** Tokens before and after, where the CLI reported them. */
			preTokens?: number;
			postTokens?: number;
			/** The CLI's summary of what it kept, where it supplied one. */
			summary?: string;
	  }
	// A session started without `--resume`: a boundary with no divider (ADR-018).
	| FreshStartRecord
	// A completed clear: a boundary with a divider (ADR-018).
	| ClearRecord
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
			/** 1-based turn number in its tab. */
			turn?: number;
			/** uuid of the turn's user message: the CLI's restore point and branch point. */
			rewindUuid?: string;
			/** uuid of the turn's last prompt the CLI echoed, queued and steered ones included: what a branch names as last seen. */
			lastPromptUuid?: string;
			/** CLI session the turn ran in, which holds its file checkpoints. */
			sessionId?: string;
			/** CLI profile of that session. */
			profileId?: string;
			/** The main agent called Edit, Write, MultiEdit or NotebookEdit. */
			edited?: boolean;
			/** On a branch still to make (recorded when it opens, and on a failure that kept the fork): the session it forks, the prompt it rewinds to, the latest it names. */
			branchSession?: string;
			branchTarget?: string;
			branchLatest?: string;
	  };

export interface StoredConversation {
	/** 2 while the conversation holds a clear or a fresh start, which 0.5.x refuses; else 1 (ADR-018 Decision 2). */
	version: 1 | 2;
	/** Stable file id, assigned by the plugin (not the CLI session id). */
	id: string;
	/** CLI session id, once known; used for --resume. */
	sessionId: string | null;
	/** CLI profile of the conversation's session; absent reopens on the default profile. */
	profileId?: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	/** Model pick; "" or absent is Default. */
	model?: string;
	/** Effort pick; "" or absent is Default. */
	effort?: string;
	/** Model id the CLI last reported in system/init, "" until then; never a pick. Absent in 0.5.x files. */
	resolvedModel?: string;
	permissionMode?: ChatPermissionMode;
	/**
	 * The user picked permissionMode, so launches pass it even when it is
	 * "default". Absent in older files, where "default" meant Claude Code's
	 * own default - as it still does without this flag.
	 */
	permissionModePicked?: boolean;
	/** On a branch: the source session's total when the fork started, which the fork's totals include (PRD-005.R7). Optional, so version 1 files hold it and 0.5.x ignores it. */
	forkBase?: ForkBase;
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

/**
 * Conversation ids become file names (`<id>.json`), so they must not contain
 * path separators or traversal. Generated ids are `<base36>-<base36>`; this
 * matches that shape and rejects anything a tampered/synced file could carry.
 */
function isSafeConversationId(id: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(id);
}

export class HistoryStore {
	private saveTimers = new Map<string, TimerHandle>();
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
	/** Saved or deleted while a scan was in flight - that scan's snapshot predates them. */
	private journal = new ScanJournal();
	/** Ids whose failed write has been announced; each is announced once per session. */
	private failedSaves = new OncePerId();

	/**
	 * Runs before each persist and may enrich the conversation (markdown
	 * auto-export sets exportPath), so what it writes lands in the same save.
	 */
	onBeforeSave: ((conversation: StoredConversation) => Promise<void>) | null = null;

	/**
	 * Runs after a conversation is deleted. `main` fans it out so every panel
	 * view detaches its tabs showing it.
	 */
	onDeleted: ((id: string) => void) | null = null;

	/**
	 * Runs when a conversation's write fails, the first time for each id until
	 * the plugin reloads. `main` shows the Notice, so several open views do not
	 * show it more than once.
	 */
	onSaveFailed: ((id: string, title: string) => void) | null = null;

	/**
	 * Runs whenever the known set of conversations changes, so a view can
	 * redraw its list without going back to disk.
	 */
	onChanged: (() => void) | null = null;

	constructor(
		private app: App,
		private dir: string,
		/** The session ids this device recorded: scans migrate and prune it, a delete forgets an entry (ADR-018 Decision 1). */
		private provenance: SessionProvenance,
		/** The profile a conversation's stored profile seeds ids for in the migration; null when this device lacks it. */
		private seedProfile: (stored: string | undefined) => string | null
	) {}

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

	/**
	 * Resolves once a scan has ended, its migration and pruning of the session
	 * record included (success or not): resume, Branch and Undo wait for it
	 * (ADR-018 Decision 1, Grandfathering).
	 */
	async settled(): Promise<void> {
		if (!this.scanned) await this.refresh();
	}

	/** Debounced save; call after every recorded message. */
	queueSave(conversation: StoredConversation): void {
		clearTimer(this.saveTimers.get(conversation.id));
		this.saveTimers.set(
			conversation.id,
			setTimer(() => {
				this.saveTimers.delete(conversation.id);
				void this.save(conversation);
			}, SAVE_DEBOUNCE_MS)
		);
	}

	/** The last save of each conversation still writing: the next waits for it, so an older write never lands after a newer one. */
	private writing = new Map<string, Promise<void>>();
	/** Bumped by a delete: saves queued before it never write. */
	private epochs = new Map<string, number>();

	save(conversation: StoredConversation, options: { touch?: boolean } = {}): Promise<void> {
		const prior = this.writing.get(conversation.id) ?? Promise.resolve();
		const epoch = this.epochs.get(conversation.id) ?? 0;
		// Each write serializes the conversation as it is then, so the last one holds the latest snapshot.
		// A delete between the call and the turn of this write cancels it.
		const run = prior.then(() => ((this.epochs.get(conversation.id) ?? 0) === epoch ? this.write(conversation, options) : undefined));
		const tail = run.catch(() => undefined);
		this.writing.set(conversation.id, tail);
		void tail.then(() => {
			if (this.writing.get(conversation.id) === tail) this.writing.delete(conversation.id);
		});
		return run;
	}

	private async write(
		conversation: StoredConversation,
		options: { touch?: boolean }
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
			// From the snapshot being written, after the awaits: a clear committed meanwhile is in it (ADR-018).
			conversation.version = fileVersion(conversation.messages);
			await this.app.vault.adapter.write(
				this.pathFor(conversation.id),
				JSON.stringify(conversation)
			);
		} catch (err) {
			console.error("AI Agent Panel: failed to save conversation", err);
			this.announceSaveFailure(conversation);
			return;
		}
		// Outside the write's try: the file is on disk, so a redraw that throws
		// is not a failed save and must neither raise the Notice nor use up the
		// conversation's one announcement.
		try {
			this.remember(conversation);
		} catch (err) {
			console.error("AI Agent Panel: failed to update the conversation list", err);
		}
	}

	/** Hand a failed write to `onSaveFailed`, once per id; a handler that throws is only logged. */
	private announceSaveFailure(conversation: StoredConversation): void {
		if (!this.failedSaves.claim(conversation.id)) return;
		try {
			this.onSaveFailed?.(conversation.id, conversation.title);
		} catch (err) {
			console.error("AI Agent Panel: save-failure notice failed", err);
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
		this.journal.noteSaved(meta.id);
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
		clearTimer(this.saveTimers.get(conversation.id));
		this.saveTimers.delete(conversation.id);
		await this.save(conversation, options);
	}

	/** Everything, scanning the folder the first time it is asked. */
	async list(): Promise<ConversationMeta[]> {
		if (!this.scanned) await this.refresh();
		return this.snapshot();
	}

	/**
	 * Re-read the folder. Called when a view opens and on the first list();
	 * nothing re-scans after that, since every change this plugin makes goes
	 * through save() or delete() and updates the cache in place. A file that
	 * appears behind the plugin's back, such as one a vault sync lands, shows up
	 * on the next view open.
	 */
	refresh(): Promise<ConversationMeta[]> {
		return (this.scanning ??= this.scan().finally(() => {
			this.scanning = null;
		}));
	}

	private async scan(): Promise<ConversationMeta[]> {
		this.journal.begin();
		const found = new Map<string, ConversationMeta>();
		// What the session record needs of the scan: whether the listing worked, apart from the names it found.
		const report = { listed: false, names: new Set<string>(), markerPresent: false, sources: [] as SeedSource[] };
		try {
			const adapter = this.app.vault.adapter;
			if (await adapter.exists(this.dir)) {
				const listing = await adapter.list(this.dir);
				// The marker is a dotfile, which a listing may leave out: ask for it too. A failed question fails the listing.
				report.markerPresent =
					listing.files.some((file) => file.endsWith(`/${MIGRATION_MARKER}`)) ||
					(await adapter.exists(`${this.dir}/${MIGRATION_MARKER}`));
				for (const file of listing.files) {
					if (!file.endsWith(".json")) continue;
					const stem = file.split("/").pop()?.replace(/\.json$/, "") ?? "";
					if (isSafeConversationId(stem)) report.names.add(stem);
					const conversation = await this.readFile(file);
					if (!conversation) continue;
					// The file name is authoritative for the id (readFile pins it),
					// so load()/delete() always resolve back to this same file.
					found.set(conversation.id, HistoryStore.metaOf(conversation));
					report.sources.push({
						id: conversation.id,
						profileId: conversation.profileId,
						sessionIds: storedSessionIds(conversation),
					});
				}
			}
			// Only a pass to the end counts: a folder not yet made lists as nothing.
			report.listed = true;
		} catch (err) {
			// A folder that cannot be listed must not leave the column saying
			// "Loading…" for the rest of the session, or reject into the void
			// of the caller's `void refresh()`. Fall through with whatever
			// load() and save() have already put in the cache.
			console.error("AI Agent Panel: failed to list conversations", err);
		}
		// A scan takes a while, and saves and deletes keep happening while it
		// runs. Both are newer than anything it read, so they win over it.
		// The session record sees the scan as the journal corrects it: a conversation saved or deleted meanwhile counts.
		const settled = this.journal.reconcile(report.names, report.sources);
		this.metas = this.journal.finish(found, this.metas);
		await this.updateProvenance({ ...report, ...settled });
		this.scanned = true;
		this.onChanged?.();
		return this.snapshot();
	}

	/** The scan's part of the session record (ADR-018 Decision 1): migration, pruning and the marker. A failure is logged and ends nothing else. */
	private async updateProvenance(report: ScanReport): Promise<void> {
		try {
			const { writeMarker } = await this.provenance.afterScan(report, this.seedProfile);
			if (!writeMarker) return;
			await this.ensureDir();
			await this.app.vault.adapter.write(`${this.dir}/${MIGRATION_MARKER}`, String(Date.now()));
		} catch (err) {
			console.error("AI Agent Panel: failed to update the session record after a scan", err);
		}
	}

	async load(id: string): Promise<StoredConversation | null> {
		if (!isSafeConversationId(id)) return null;
		// A write still in flight holds the newest messages: read after it, not before.
		await this.writing.get(id)?.catch(() => undefined);
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
		clearTimer(this.saveTimers.get(id));
		this.saveTimers.delete(id);
		// Queued saves are void from here; one already writing finishes first, so it cannot recreate the file.
		this.epochs.set(id, (this.epochs.get(id) ?? 0) + 1);
		await this.writing.get(id);
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
		this.journal.noteDeleted(id);
		this.provenance.forget(id);
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
			if (!parsed || !isStoredVersion(parsed.version) || !Array.isArray(parsed.messages))
				return null;
			// Pin the id to the file name so a tampered internal id can never
			// steer a later save() or delete() to a different path.
			const stem = path.split("/").pop()?.replace(/\.json$/, "") ?? "";
			if (!isSafeConversationId(stem)) return null;
			parsed.id = stem;
			// These reach the command line: a tampered value is read as absent.
			// So is a title or export path that is not a string; a time that is
			// not one takes the other's or the epoch; and a message entry or
			// field the readers cannot take is dropped or read as absent.
			const sent = parsed.messages.length;
			const checked = checkStoredMessages(
				readForkBase(dropNonStringText(checkStoredTimes(dropUnsafeArgValues(migrateStoredModel(parsed)))))
			);
			const dropped = sent - checked.messages.length;
			if (dropped > 0)
				console.warn(
					`AI Agent Panel: left out ${dropped} damaged message${dropped === 1 ? "" : "s"} of ${path}`
				);
			return checked;
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
 * Deleting a conversation removes its file for good, and unlike closing a
 * tab there is nothing to undo it with - so it asks first, wherever it is
 * triggered from. On confirm the store deletes it, which detaches every open
 * tab showing it (`onDeleted`). `onDone` runs once: with false when the
 * dialog is dismissed or the file stayed, with true when it went.
 */
export class DeleteConversationModal extends ConfirmModal {
	constructor(
		app: App,
		store: HistoryStore,
		target: { id: string; title: string },
		onDone?: (deleted: boolean) => void
	) {
		super(app, {
			title: "Delete conversation",
			text:
				`"${displayTitle(target.title)}" and everything said in it will be removed from ` +
				"this vault. Any transcript already exported, and Claude Code's own " +
				"file checkpoints, stay where they are.",
			confirmText: "Delete",
			onConfirm: () => void store.delete(target.id).then(onDone),
			afterClose: (confirmed) => {
				if (!confirmed) onDone?.(false);
			},
		});
	}
}

export class ConversationPickerModal extends FuzzySuggestModal<ConversationMeta> {
	private detachTheme: (() => void) | null = null;

	constructor(
		app: App,
		private store: HistoryStore,
		private items: ConversationMeta[],
		private onPick: (conversation: StoredConversation) => void,
		/** "Show tooltips" as the panel has it (PRD-001.R32): the delete button's tooltip follows. */
		private showTooltips: boolean
	) {
		super(app);
		this.setPlaceholder("Search previous conversations…");
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "open" },
		]);
	}

	onOpen(): void {
		void super.onOpen();
		this.detachTheme = themeModal(this);
		this.modalEl.toggleClass(NO_TOOLTIPS_CLASS, hidesTooltips(this.showTooltips));
	}

	onClose(): void {
		super.onClose();
		this.detachTheme?.();
		this.detachTheme = null;
	}

	getItems(): ConversationMeta[] {
		return this.items;
	}

	getItemText(item: ConversationMeta): string {
		return displayTitle(item.title);
	}

	renderSuggestion(match: FuzzyMatch<ConversationMeta>, el: HTMLElement): void {
		el.addClass("ai-agent-panel-history-item");
		const main = el.createDiv({ cls: "ai-agent-panel-history-main" });
		main.createDiv({
			cls: "ai-agent-panel-history-title",
			text: displayTitle(match.item.title),
		});
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
			new DeleteConversationModal(this.app, this.store, match.item, (deleted) => {
				// The dialog took the focus; every outcome gives it back.
				this.inputEl.focus();
				// Dismissed, or the delete failed: the conversation is still on
				// disk, so the row stays.
				if (!deleted) return;
				this.items = this.items.filter((i) => i.id !== match.item.id);
				// Re-run the query so the list refreshes.
				this.inputEl.dispatchEvent(new Event("input"));
			}).open();
		});
	}

	onChooseItem(item: ConversationMeta): void {
		void this.store.load(item.id).then((conversation) => {
			if (conversation) this.onPick(conversation);
			else new Notice("Could not load that conversation.");
		});
	}
}
