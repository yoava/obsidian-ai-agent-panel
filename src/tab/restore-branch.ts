import { Events, Notice, type App } from "obsidian";
import { FOREIGN_BRANCH_TITLE } from "../state/boundary-records";
import { latestPrompt, SUMMARIZED_BRANCH_TITLE } from "../state/branch-history";
import { branchTitle, displayTitle } from "../conversation-list";
import { RestoreConfirmModal } from "../diffview";
import type { StoredMessage } from "../history";
import { PROCESS_EXITED, type RewindFilesResult } from "../protocol/types";
import {
	clearFollows,
	restoreBefore,
	restoreButtonState,
	restoredNotice,
	turnRestore,
	type RestoreBefore,
	type RestoreContext,
	type TurnMessage,
	type TurnRestore,
} from "../restore";
import type { ClaudeSession } from "../session";
import type { ChatPermissionMode } from "../settings-core";
import type { TabEditTracker } from "./edit-tracker";

/** What restore and branch read of their tab. */
export interface RestoreBranchHost {
	app: App;
	/** The tab's edits: a restore's paths resolve there, and its listed files are re-read into the change list. */
	edits: TabEditTracker;
	turnRunning: () => boolean;
	/** The tab's session, started without a prompt when none runs; null when it cannot be, the tab showing why. */
	ensureSession: () => Promise<ClaudeSession | null>;
	/** The live session's id, else the conversation's stored one when this device recorded it (ADR-018 Decision 1). */
	sessionId: () => string | null;
	/**
	 * The CLI session and profile a branch from `record`'s turn forks (the
	 * turn's own, else the tab's; `record` is null for a turn not recorded
	 * yet): the session id is null when there is none.
	 */
	turnSource: (record: TurnMessage | null) => { sessionId: string | null; profileId: string };
	/**
	 * Why Branch is not offered on `record`'s turn: its session is one this
	 * device did not record, the scan that says is pending (ADR-018 Decision 1),
	 * or a compaction summarized the turn away.
	 */
	branchBlock: (record: TurnMessage | null) => "foreign" | "pending" | "hidden" | "compacted" | null;
	/** The profile the tab's session runs, or the one its next launch takes. */
	profileId: () => string;
	/** What a branch copies (PRD-002.R15). */
	picks: () => { model: string; effort: string; selectedMode: ChatPermissionMode; inheritMode: boolean };
	/** Shows an error in the tab's messages. */
	showError: (message: string) => void;
}

/** A turn whose record offers Restore files; its button on the turn's footer once drawn. */
interface TurnEntry extends TurnRestore {
	record: TurnMessage;
	button: HTMLButtonElement | null;
}

/** Sets a Branch button's tooltip and description to a reason, or to its usual ones with null (`ui/turn`). */
export type BranchRetitle = (reason: string | null) => void;

/** A turn's Branch button on its footer. */
interface BranchEntry {
	button: HTMLButtonElement;
	record: TurnMessage;
	retitle: BranchRetitle;
}

/** What a branch tab takes from its source (DES-004 Branch). */
export interface BranchSpec {
	/** The source's session, which the branch forks. */
	sessionId: string;
	/** The turn's user message, which the fork rewinds to before its first message. */
	uuid: string;
	/** The source session's latest user message as its conversation recorded it, read when the rewind is sent; null when unknown. */
	latest: () => string | null;
	model: string;
	effort: string;
	selectedMode: ChatPermissionMode;
	inheritMode: boolean;
	profileId: string;
	title: string;
	/** The only message the branch tab shows at first. */
	note: string;
}

/**
 * One tab's Restore files and Branch (ADR-016 `tab/restore-branch`;
 * DES-004 Restore, Branch): the turns that offer a restore, the preview,
 * confirmation and rewind through the tab's CLI, the tab's sends held
 * meanwhile, and what a branch takes. The rules are `restore`'s. Fires
 * `restore` when the offered turns, one's availability or whether a restore
 * runs change (DES-003 Events).
 */
export class RestoreBranch extends Events {
	/** In the order recorded. */
	private turns: TurnEntry[] = [];
	private running = false;
	/** The CLI a restore started ended with an error the tab already shows. */
	private endShown = false;
	/** The tab's numbered prompts in conversations deleted while open (`detach`). */
	private priorPrompts = 0;
	/** The Branch buttons drawn on the tab's turn footers, which `update` disables for a session this device did not record. */
	private branches: BranchEntry[] = [];

	constructor(private readonly host: RestoreBranchHost) {
		super();
	}

	/** Between a restore's preview and its end the tab sends nothing (PRD-002.R14). */
	get restoring(): boolean {
		return this.running;
	}

	/** The tab's CLI ended with an error, which the tab shows. */
	noteSessionError(): void {
		if (this.running) this.endShown = true;
	}

	/**
	 * A reopened conversation's turns that offer Restore files, before any is
	 * drawn: a reopen draws older sections later (DES-003 Reopen), and "Restore
	 * to before turn N" needs the earliest. Replaces the tab's earlier turns.
	 */
	load(messages: readonly TurnMessage[]): void {
		this.turns = [];
		this.branches = [];
		this.priorPrompts = 0;
		messages.forEach((record, at) => this.entryOf(record, messages, at));
		this.trigger("restore");
	}

	/**
	 * The tab's conversation, holding `prompts` numbered prompts, was deleted
	 * from history; its next message starts a new conversation record, whose
	 * turns count on from these (PRD-002.R18).
	 */
	detach(prompts: number): void {
		this.priorPrompts += prompts;
	}

	/**
	 * A turn's Restore files button, drawn on its footer: a reopened turn's
	 * or a finished one's, whose record `messages` (the conversation's) now ends with.
	 */
	addTurn(button: HTMLButtonElement, record: TurnMessage, messages: readonly TurnMessage[]): void {
		const entry = this.turns.find((turn) => turn.record === record) ?? this.entryOf(record, messages, messages.indexOf(record));
		if (!entry) return;
		entry.button = button;
		button.addEventListener("click", () => void this.restore(entry));
		this.update();
		this.trigger("restore");
	}

	/** A turn's Branch button, drawn on its footer, takes the state of the tab's session (PRD-002.R15). */
	addBranch(button: HTMLButtonElement, record: TurnMessage, retitle: BranchRetitle): void {
		const entry = { button, record, retitle };
		this.branches.push(entry);
		this.updateBranch(entry);
	}

	/**
	 * Branch is disabled, titled `FOREIGN_BRANCH_TITLE`, when the tab's stored
	 * session is not one this device recorded, titled `SUMMARIZED_BRANCH_TITLE`
	 * when a compaction summarized the turn away, and disabled without a title
	 * until the scan that decides has ended.
	 */
	private updateBranch(entry: BranchEntry): void {
		const block = this.host.branchBlock(entry.record);
		entry.button.disabled = block !== null;
		entry.button.toggleClass("ai-agent-panel-hidden", block === "hidden");
		entry.retitle(block === "foreign" ? FOREIGN_BRANCH_TITLE : block === "compacted" ? SUMMARIZED_BRANCH_TITLE : null);
	}

	/** A new entry, last, for a turn record that offers Restore files, N found from its place in `messages`. */
	private entryOf(record: TurnMessage, messages: readonly TurnMessage[], at: number): TurnEntry | null {
		const offered = turnRestore(messages, at, this.priorPrompts);
		if (!offered) return null;
		const entry: TurnEntry = { ...offered, record, button: null };
		this.turns.push(entry);
		return entry;
	}

	/**
	 * Restore files shows only on turns of the tab's session and profile, whose
	 * checkpoints that CLI holds, and is disabled while a turn or a restore runs.
	 */
	update(): void {
		for (const entry of this.branches) this.updateBranch(entry);
		if (this.turns.length === 0) return;
		const context = this.context();
		for (const entry of this.turns) {
			if (!entry.button) continue;
			const state = restoreButtonState(entry.point, context, entry.gone, entry.cleared);
			entry.button.toggleClass("ai-agent-panel-hidden", state.hidden);
			entry.button.disabled = state.disabled;
		}
	}

	/** A clear completed (PRD-001.R38): every turn offered so far is before it, so Restore files leaves them (PRD-002.R14). */
	cleared(): void {
		for (const entry of this.turns) entry.cleared = true;
		this.update();
		this.trigger("restore");
	}

	/** A clear was undone (PRD-001.R38): the turns its record had cut off offer Restore files again, unless an earlier clear still follows them (PRD-002.R14). */
	uncleared(messages: readonly StoredMessage[]): void {
		for (const entry of this.turns) {
			const at = messages.indexOf(entry.record as StoredMessage);
			if (at >= 0) entry.cleared = clearFollows(messages, at);
		}
		this.update();
		this.trigger("restore");
	}

	/** "Restore to before turn N" (PRD-002.R18), or null while it is left out. */
	before(): RestoreBefore<TurnEntry> | null {
		return restoreBefore(this.turns, this.context(), this.host.edits.isEmpty);
	}

	/** Runs Restore files for the turn "Restore to before turn N" names. */
	restoreBefore(): void {
		const offer = this.before();
		if (offer && !offer.disabled) void this.restore(offer.turn);
	}

	/**
	 * What a branch from the turn whose user message is `uuid` takes, or null,
	 * with the Notice shown, when the tab has no session to fork.
	 */
	branch(uuid: string, conversation: { title: unknown; messages: readonly StoredMessage[] } | null): BranchSpec | null {
		const record = conversation?.messages.find((m) => m.kind === "meta" && m.rewindUuid === uuid) ?? null;
		// Its button is disabled meanwhile; this guards a click that raced the scan.
		if (this.host.branchBlock(record)) return null;
		// The turn's own session and profile: after a fresh start the tab's are another session's.
		const { sessionId, profileId } = this.host.turnSource(record);
		if (!sessionId) {
			new Notice("This conversation has no CLI session to branch from yet.");
			return null;
		}
		const source = conversation ? displayTitle(conversation.title) : "a conversation";
		return {
			sessionId,
			uuid,
			// Read when sent: the source may record more turns before the branch's first message forks it.
			latest: () => (conversation ? latestPrompt(conversation.messages, sessionId) : null),
			...this.host.picks(),
			// The fork resumes a transcript that lives on the original's CLI side.
			profileId,
			title: branchTitle(conversation?.title),
			note: `Branched from "${source}". Claude keeps everything up to that point in context; this conversation's later turns are not part of the branch.`,
		};
	}

	private context(): RestoreContext {
		return {
			sessionId: this.host.sessionId(),
			profileId: this.host.profileId(),
			busy: this.host.turnRunning(),
			restoring: this.running,
		};
	}

	/**
	 * Rewind the files the CLI tracked back to before a turn (ADR-006): a dry
	 * run first, starting the CLI without a prompt if none runs, then the real
	 * rewind once the user confirms. The tab sends nothing in between.
	 */
	private async restore(entry: TurnEntry): Promise<void> {
		if (this.host.turnRunning() || this.running) return;
		this.running = true;
		this.endShown = false;
		this.update();
		this.trigger("restore");
		let released = true;
		try {
			const session = await this.host.ensureSession();
			// A turn may have begun while the session was being created.
			if (!session || this.host.turnRunning()) return;
			let preview: RewindFilesResult;
			try {
				preview = await session.rewindFiles(entry.point.uuid, true);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				// A CLI still running refused; one that exited with an error has shown
				// it (`noteSessionError`); otherwise the tab says why here.
				if (session.running) new Notice(`Could not preview the restore: ${message}`);
				else if (!this.endShown)
					this.host.showError(
						message === PROCESS_EXITED
							? "Claude Code exited before it could preview the restore."
							: `Could not start Claude Code for the restore: ${message}`
					);
				return;
			}
			if (!preview.canRewind) {
				this.gone(entry, preview.error);
				return;
			}
			const listed = preview.filesChanged ?? [];
			if (listed.length === 0) {
				new Notice("Nothing to restore.");
				return;
			}
			const files = listed.map((path) => ({ path, outside: this.host.edits.resolve(path) === null }));
			new RestoreConfirmModal(
				this.host.app,
				files,
				{ insertions: preview.insertions ?? 0, deletions: preview.deletions ?? 0 },
				() => void this.finish(session, entry, listed),
				() => this.release()
			).open();
			released = false;
		} finally {
			if (released) this.release();
		}
	}

	/** The CLI no longer has the point: say so and hide its button. */
	private gone(entry: TurnEntry, error: string | undefined): void {
		new Notice(error || "That restore point is no longer available.");
		entry.gone = true;
		this.update();
		this.trigger("restore");
	}

	/** The confirmed rewind, then the listed vault files re-read into the change list. */
	private async finish(session: ClaudeSession, entry: TurnEntry, listed: string[]): Promise<void> {
		try {
			const result = await session.rewindFiles(entry.point.uuid, false);
			// Refused outright: nothing was rewound.
			if (!result.canRewind) this.gone(entry, result.error);
			else new Notice(restoredNotice(listed.length, result.filesChanged));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Restore failed: ${message.replace(/\.?$/, ".")} Some files may already be restored.`);
		} finally {
			await this.host.edits.reread(listed);
			this.release();
		}
	}

	private release(): void {
		this.running = false;
		this.update();
		this.trigger("restore");
	}
}
