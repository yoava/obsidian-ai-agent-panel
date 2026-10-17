/**
 * Edit, Write and MultiEdit calls of the main agent and its subagents, from
 * announcement to result: one pre-edit read per call, kept by tool-use id until
 * its result, then the file re-read and the edit handed on; and the change
 * list they make (DES-004 Change list). Pure, no Obsidian import, tested in
 * plain Node (tests/edit-tracker.test.mjs).
 */

import { diffText } from "./diff";
import { editTargetPath, isEditTool } from "./edits";
import type { ApiMessage, ToolResultBlock, ToolUseBlock } from "./protocol/types";

/** A file as read before an edit tool call ran. */
export interface EditPreImage {
	/** Path exactly as the tool reported it. */
	reported: string;
	/** Vault-relative form, or null when the path lies outside the vault. */
	vaultPath: string | null;
	/** Contents before the edit, or null when the file did not exist. */
	before: string | null;
}

/** A call that succeeded: its pre-image and the file now on disk. */
export interface LandedEdit {
	pre: EditPreImage;
	/** Null outside the vault or when the file is gone. */
	after: string | null;
}

/** The vault as the tracker sees it. Neither function throws. */
export interface EditFiles {
	/** Vault-relative form of a reported path, or null outside the vault. */
	resolve(reported: string): string | null;
	/** File contents, or null when it does not exist or cannot be read. */
	read(vaultPath: string): Promise<string | null>;
}

/** An `assistant` or `user` stream message, from the main agent or a subagent. */
interface StreamMessage {
	message: Pick<ApiMessage, "content">;
}

export class EditTracker {
	private readonly kept = new Map<string, { reported: string; read: Promise<EditPreImage> }>();

	/**
	 * `record` gets each successful edit of a file in the vault that exists
	 * afterwards, for the change list.
	 */
	constructor(
		private readonly files: EditFiles,
		private readonly record: (edit: { pre: EditPreImage; after: string }) => void
	) {}

	/**
	 * Start the read of each edit an `assistant` message announces. A call
	 * whose permission request came first keeps that read: the request's input
	 * is what runs.
	 */
	noteAssistant(msg: StreamMessage): void {
		const content = msg.message.content;
		if (typeof content === "string") return;
		for (const block of content) {
			if (block.type !== "tool_use") continue;
			const use = block as ToolUseBlock;
			if (this.kept.has(use.id)) continue;
			void this.readFor(use.name, use.id, use.input);
		}
	}

	/**
	 * The pre-edit read for a call: the one kept for its id when it names the
	 * same file, else a fresh one, kept in its place (a hook's `updatedInput`
	 * may have changed the file). Null for a call that is not an edit or names
	 * no file.
	 */
	readFor(
		toolName: string,
		toolUseId: string | undefined,
		input: Record<string, unknown>
	): Promise<EditPreImage> | null {
		if (!isEditTool(toolName)) return null;
		const reported = editTargetPath(input);
		if (reported === null) return null;
		const kept = toolUseId === undefined ? undefined : this.kept.get(toolUseId);
		if (kept?.reported === reported) return kept.read;
		const vaultPath = this.files.resolve(reported);
		const read = (async (): Promise<EditPreImage> => ({
			reported,
			vaultPath,
			before: vaultPath === null ? null : await this.files.read(vaultPath),
		}))();
		if (toolUseId !== undefined) this.kept.set(toolUseId, { reported, read });
		return read;
	}

	/**
	 * Release the read of each call a `user` message reports on. For one that
	 * succeeded, re-read its file and record it; the returned map holds those
	 * edits by tool-use id, for the call's card.
	 */
	noteResults(msg: StreamMessage): Map<string, Promise<LandedEdit>> {
		const landed = new Map<string, Promise<LandedEdit>>();
		const content = msg.message.content;
		if (typeof content === "string") return landed;
		for (const block of content) {
			if (block.type !== "tool_result") continue;
			const result = block as ToolResultBlock;
			const kept = this.kept.get(result.tool_use_id);
			if (!kept) continue;
			this.kept.delete(result.tool_use_id);
			if (result.is_error !== true) landed.set(result.tool_use_id, this.land(kept.read));
		}
		return landed;
	}

	/** Drop every kept read: the process that would report their results is gone. */
	clear(): void {
		this.kept.clear();
	}

	private async land(read: Promise<EditPreImage>): Promise<LandedEdit> {
		const pre = await read;
		const after = pre.vaultPath === null ? null : await this.files.read(pre.vaultPath);
		if (after !== null) this.record({ pre, after });
		return { pre, after };
	}
}

/** One file the conversation changed (DES-004 Change list). */
export interface ChangedFile {
	/** Vault-relative path. */
	path: string;
	inVault: boolean;
	/** Contents before the conversation's first recorded edit; "" for a file it created. */
	before: string;
	/** Contents after its latest edit, or on disk after a restore. */
	after: string;
	/** The file did not exist before the conversation's first edit to it. */
	created: boolean;
	/** Edit tool calls recorded for it. */
	edits: number;
	/** Net lines added and removed, before to after. */
	added: number;
	removed: number;
}

export interface ChangeTotals {
	files: number;
	added: number;
	removed: number;
}

/**
 * The files a conversation changed, each from its first recorded contents to
 * its latest, its net lines counted once per change. Files with no net change
 * stay known, so a later edit keeps the first contents, but are not listed.
 */
export class ChangeList {
	private readonly byPath = new Map<string, ChangedFile>();

	/** An edit of a vault file, read before it ran and after it landed. */
	record(pre: EditPreImage, after: string): void {
		const path = pre.vaultPath ?? pre.reported;
		const known = this.byPath.get(path);
		const file: ChangedFile = known
			? { ...known, after, edits: known.edits + 1 }
			: {
					path,
					inVault: pre.vaultPath !== null,
					before: pre.before ?? "",
					after,
					created: pre.before === null,
					edits: 1,
					added: 0,
					removed: 0,
				};
		this.byPath.set(path, counted(file));
	}

	/**
	 * After a restore: a listed vault file takes the text now on disk, or
	 * leaves the list when gone; false when the list does not hold it.
	 */
	reread(path: string, current: string | null): boolean {
		const known = this.byPath.get(path);
		if (!known) return false;
		if (current === null) this.byPath.delete(path);
		else this.byPath.set(path, counted({ ...known, after: current }));
		return true;
	}

	/** Whether the list knows the file, listed or not. */
	has(path: string): boolean {
		return this.byPath.has(path);
	}

	/** The files with a net change, in the order first changed. */
	get files(): ChangedFile[] {
		return [...this.byPath.values()].filter((file) => file.added > 0 || file.removed > 0);
	}

	get totals(): ChangeTotals {
		return changeTotals(this.files);
	}

	get isEmpty(): boolean {
		return this.files.length === 0;
	}
}

/** The line totals of listed files, from the counts each already holds: no diff is computed. */
export function changeTotals(files: Iterable<ChangedFile>): ChangeTotals {
	let count = 0;
	let added = 0;
	let removed = 0;
	for (const file of files) {
		count++;
		added += file.added;
		removed += file.removed;
	}
	return { files: count, added, removed };
}

/** The file with its net lines counted. */
function counted(file: ChangedFile): ChangedFile {
	const diff = diffText(file.before, file.after);
	return { ...file, added: diff.added, removed: diff.removed };
}
