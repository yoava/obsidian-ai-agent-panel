/**
 * Per-turn file snapshots, so a turn's edits can be undone after the fact.
 *
 * The CLI has its own file checkpointing, but it is session-scoped: an effort
 * change or a crash replaces the process, and those checkpoints go with it. It
 * also only tracks Write/Edit/NotebookEdit, missing anything a Bash command or
 * a subagent changed. So the plugin keeps its own, written to its data folder.
 *
 * A snapshot is taken lazily: the first time a turn is about to touch a file,
 * that file's current contents are recorded. Only the *first* pre-image per
 * path per turn is kept, so restoring a turn always returns the vault to how it
 * looked before the turn started, however many times a file was edited.
 *
 * IO is injected, so this file has no Obsidian import and is exercised in plain
 * Node against an in-memory adapter (tests/checkpoints.test.mjs).
 */

/** The subset of Obsidian's DataAdapter this needs. */
export interface CheckpointIo {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	remove(path: string): Promise<void>;
	mkdir(path: string): Promise<void>;
	list(path: string): Promise<{ files: string[] }>;
}

export interface SnapshotFile {
	/** Vault-relative path. */
	path: string;
	/** False when the turn created the file - restoring deletes it again. */
	existed: boolean;
	/** Contents before the turn. Absent when `existed` is false. */
	content?: string;
	/** Set when the file was too large to snapshot; it cannot be restored. */
	skipped?: "too-large";
}

export interface Checkpoint {
	version: 1;
	conversationId: string;
	/** 1-based turn number within the conversation. */
	turn: number;
	createdAt: number;
	files: SnapshotFile[];
}

export interface CheckpointLimits {
	/** Skip files bigger than this. Default 2 MB. */
	maxFileBytes?: number;
	/** Total bytes kept across all conversations. Default 24 MB. */
	maxTotalBytes?: number;
	/** Hard cap on stored checkpoints. Default 400. */
	maxCheckpoints?: number;
}

const DEFAULTS = {
	maxFileBytes: 2 * 1024 * 1024,
	maxTotalBytes: 24 * 1024 * 1024,
	maxCheckpoints: 400,
};

/** `<id>__<turn>.json`; both parts are constrained, so the name is always safe. */
function fileName(conversationId: string, turn: number): string {
	return `${conversationId}__${turn}.json`;
}

const NAME_PATTERN = /^([A-Za-z0-9_-]+)__(\d+)\.json$/;

export function parseCheckpointName(
	name: string
): { conversationId: string; turn: number } | null {
	const match = NAME_PATTERN.exec(name);
	if (!match) return null;
	return { conversationId: match[1], turn: Number(match[2]) };
}

function isSafeConversationId(id: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(id);
}

export class CheckpointStore {
	private ready: Promise<void> | null = null;
	private limits: Required<CheckpointLimits>;
	/** Checkpoints being built for the current turn, keyed `<id>__<turn>`. */
	private open = new Map<string, Checkpoint>();

	constructor(
		private readonly io: CheckpointIo,
		private readonly dir: string,
		limits: CheckpointLimits = {}
	) {
		this.limits = { ...DEFAULTS, ...limits };
	}

	/**
	 * Record a file's pre-image for this turn, unless the turn already has one.
	 * `content` is null when the file does not exist yet.
	 */
	async capture(
		conversationId: string,
		turn: number,
		path: string,
		content: string | null
	): Promise<void> {
		if (!isSafeConversationId(conversationId) || !Number.isInteger(turn) || turn < 1)
			return;
		const key = `${conversationId}__${turn}`;
		let checkpoint = this.open.get(key);
		if (!checkpoint) {
			checkpoint = {
				version: 1,
				conversationId,
				turn,
				createdAt: Date.now(),
				files: [],
			};
			this.open.set(key, checkpoint);
		}
		// First pre-image wins: the point of restoring a turn is to get back to
		// how things were before it, not before its last edit.
		if (checkpoint.files.some((file) => file.path === path)) return;

		if (content === null) checkpoint.files.push({ path, existed: false });
		else if (content.length > this.limits.maxFileBytes)
			checkpoint.files.push({ path, existed: true, skipped: "too-large" });
		else checkpoint.files.push({ path, existed: true, content });

		await this.persist(checkpoint);
	}

	/** True when this turn snapshotted anything. */
	hasOpen(conversationId: string, turn: number): boolean {
		return this.open.has(`${conversationId}__${turn}`);
	}

	/** A turn's checkpoint is finished; stop accumulating into it. */
	closeTurn(conversationId: string, turn: number): void {
		this.open.delete(`${conversationId}__${turn}`);
	}

	async load(conversationId: string, turn: number): Promise<Checkpoint | null> {
		if (!isSafeConversationId(conversationId)) return null;
		const path = `${this.dir}/${fileName(conversationId, turn)}`;
		try {
			if (!(await this.io.exists(path))) return null;
			const parsed = JSON.parse(await this.io.read(path)) as Checkpoint;
			if (parsed?.version !== 1 || !Array.isArray(parsed.files)) return null;
			// Pin identity to the file name: a tampered or synced file must not be
			// able to claim a different conversation.
			if (parsed.conversationId !== conversationId || parsed.turn !== turn) return null;
			return parsed;
		} catch {
			return null;
		}
	}

	async has(conversationId: string, turn: number): Promise<boolean> {
		if (!isSafeConversationId(conversationId)) return false;
		return this.io.exists(`${this.dir}/${fileName(conversationId, turn)}`);
	}

	/** Drop every checkpoint belonging to one conversation. */
	async forget(conversationId: string): Promise<void> {
		if (!isSafeConversationId(conversationId)) return;
		for (const [key] of this.open)
			if (key.startsWith(`${conversationId}__`)) this.open.delete(key);
		for (const name of await this.names())
			if (parseCheckpointName(name)?.conversationId === conversationId)
				await this.io.remove(`${this.dir}/${name}`).catch(() => {});
	}

	private async persist(checkpoint: Checkpoint): Promise<void> {
		await this.ensureDir();
		const path = `${this.dir}/${fileName(checkpoint.conversationId, checkpoint.turn)}`;
		await this.io.write(path, JSON.stringify(checkpoint));
		await this.prune();
	}

	private async ensureDir(): Promise<void> {
		this.ready ??= (async () => {
			if (!(await this.io.exists(this.dir))) await this.io.mkdir(this.dir);
		})();
		try {
			await this.ready;
		} catch {
			// A failed mkdir is retried on the next capture.
			this.ready = null;
		}
	}

	private async names(): Promise<string[]> {
		try {
			const listing = await this.io.list(this.dir);
			return listing.files
				.map((file) => file.split("/").pop() ?? "")
				.filter((name) => parseCheckpointName(name) !== null);
		} catch {
			return [];
		}
	}

	/**
	 * Keep the store bounded, oldest first. Sizes come from the records
	 * themselves rather than from stat(), so this works against any adapter.
	 */
	private async prune(): Promise<void> {
		const names = await this.names();
		if (names.length === 0) return;
		const entries: Array<{ name: string; bytes: number; createdAt: number }> = [];
		for (const name of names) {
			try {
				const raw = await this.io.read(`${this.dir}/${name}`);
				const parsed = JSON.parse(raw) as Checkpoint;
				entries.push({
					name,
					bytes: raw.length,
					createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
				});
			} catch {
				// Unreadable or corrupt: treat as the oldest, so it gets cleared out.
				entries.push({ name, bytes: 0, createdAt: 0 });
			}
		}
		entries.sort((a, b) => a.createdAt - b.createdAt);
		let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
		let count = entries.length;
		const openKeys = new Set(this.open.keys());
		for (const entry of entries) {
			if (total <= this.limits.maxTotalBytes && count <= this.limits.maxCheckpoints)
				break;
			// Never prune a turn that is still being written to.
			const parsed = parseCheckpointName(entry.name);
			if (parsed && openKeys.has(`${parsed.conversationId}__${parsed.turn}`)) continue;
			try {
				await this.io.remove(`${this.dir}/${entry.name}`);
				total -= entry.bytes;
				count--;
			} catch {
				break;
			}
		}
	}
}

/** What restoring a checkpoint would do, without doing it. */
export interface RestorePlan {
	/** Files to write back to their earlier contents. */
	rewrite: Array<{ path: string; content: string }>;
	/** Files the turn created, to be removed again. */
	remove: string[];
	/** Files that were not snapshotted and so cannot be restored. */
	skipped: string[];
}

export function planRestore(checkpoint: Checkpoint): RestorePlan {
	const plan: RestorePlan = { rewrite: [], remove: [], skipped: [] };
	for (const file of checkpoint.files) {
		if (file.skipped) plan.skipped.push(file.path);
		else if (!file.existed) plan.remove.push(file.path);
		else plan.rewrite.push({ path: file.path, content: file.content ?? "" });
	}
	return plan;
}
