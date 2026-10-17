import { Events, type DataAdapter } from "obsidian";
import { placeInVault } from "../edits";
import {
	ChangeList,
	EditTracker,
	type ChangedFile,
	type ChangeTotals,
	type EditPreImage,
	type LandedEdit,
} from "../edit-tracker";
import type { ApiMessage } from "../protocol/types";

/** The vault as one tab's edits see it. */
export interface EditVault {
	adapter: DataAdapter;
	/** The vault root; throws when the vault is not on a local file system. */
	root: () => string;
}

/** An `assistant` or `user` stream message, from the main agent or a subagent. */
interface StreamMessage {
	message: Pick<ApiMessage, "content">;
}

/**
 * One tab's edits (ADR-016 `tab/edit-tracker`; DES-004): the pre-edit reads
 * of the main agent's and subagents' Edit, Write and MultiEdit calls, the
 * vault reads behind them, and the change list they make, firing `changes`
 * when the list changes (DES-003 Events). The logic is `edit-tracker`'s.
 */
export class TabEditTracker extends Events {
	private readonly reads: EditTracker;
	private readonly list = new ChangeList();

	constructor(private readonly vault: EditVault) {
		super();
		this.reads = new EditTracker(
			{ resolve: (reported) => this.resolve(reported), read: (path) => this.read(path) },
			({ pre, after }) => {
				this.list.record(pre, after);
				this.trigger("changes");
			}
		);
	}

	/** The files with a net change, in the order first changed. */
	get files(): ChangedFile[] {
		return this.list.files;
	}

	get totals(): ChangeTotals {
		return this.list.totals;
	}

	get isEmpty(): boolean {
		return this.list.isEmpty;
	}

	/** Vault-relative form of a path the CLI reported, or null outside the vault. */
	resolve(reported: string): string | null {
		return placeInVault(reported, () => this.vault.root());
	}

	/** File contents, or null when it does not exist or cannot be read. */
	async read(vaultPath: string): Promise<string | null> {
		try {
			const adapter = this.vault.adapter;
			if (!(await adapter.exists(vaultPath))) return null;
			return await adapter.read(vaultPath);
		} catch {
			return null;
		}
	}

	/** An `assistant` message: start the read of each edit it announces. */
	noteAssistant(msg: StreamMessage): void {
		this.reads.noteAssistant(msg);
	}

	/** A `user` message: the edits it reports landed, by tool-use id, for their cards. */
	noteResults(msg: StreamMessage): Map<string, Promise<LandedEdit>> {
		return this.reads.noteResults(msg);
	}

	/** The pre-edit read for a permission request's call, shared with its `tool_use`. */
	readFor(
		toolName: string,
		toolUseId: string | undefined,
		input: Record<string, unknown>
	): Promise<EditPreImage> | null {
		return this.reads.readFor(toolName, toolUseId, input);
	}

	/** Drop every kept read: the process that would report their results is gone. */
	clear(): void {
		this.reads.clear();
	}

	/** After a restore: each listed vault file re-read into the change list (DES-004 Restore). */
	async reread(listed: readonly string[]): Promise<void> {
		let changed = false;
		for (const reported of listed) {
			const path = this.resolve(reported);
			if (path === null || !this.list.has(path)) continue;
			changed = this.list.reread(path, await this.read(path)) || changed;
		}
		if (changed) this.trigger("changes");
	}
}
