/**
 * The history index's merge rule and the journal of saves and deletes during
 * a scan, Obsidian-free so plain Node tests them.
 */

/**
 * The index at the end of a folder scan. The scan takes a while and reads
 * files that saves and deletes keep changing, so what the plugin did meanwhile
 * wins over what the scan read. A cached entry replaces the scanned one when
 * the scan did not find it, when its `updatedAt` is strictly newer, or when
 * its id was saved during the scan: a pin or an export saves without moving
 * `updatedAt`, so the time alone cannot tell it from the file the scan read.
 * Deleted ids are dropped. The inputs are not changed.
 */
export function mergeScan<T extends { updatedAt: number }>(
	scanned: ReadonlyMap<string, T>,
	cached: ReadonlyMap<string, T>,
	savedIds: ReadonlySet<string>,
	deletedIds: ReadonlySet<string>
): Map<string, T> {
	const merged = new Map(scanned);
	for (const [id, meta] of cached) {
		const scannedMeta = merged.get(id);
		if (!scannedMeta || savedIds.has(id) || scannedMeta.updatedAt < meta.updatedAt)
			merged.set(id, meta);
	}
	for (const id of deletedIds) merged.delete(id);
	return merged;
}

/**
 * What a store saved or deleted while a folder scan ran, which that scan's
 * snapshot predates. Events outside a scan are not recorded. Each id is in at
 * most one set, so the later event wins; both sets are cleared when a scan
 * begins and when it ends.
 */
export class ScanJournal {
	private saved = new Set<string>();
	private deleted = new Set<string>();
	private scanning = false;

	/** A scan starts: records of earlier events are void. */
	begin(): void {
		this.saved.clear();
		this.deleted.clear();
		this.scanning = true;
	}

	noteSaved(id: string): void {
		if (!this.scanning) return;
		this.saved.add(id);
		this.deleted.delete(id);
	}

	noteDeleted(id: string): void {
		if (!this.scanning) return;
		this.deleted.add(id);
		this.saved.delete(id);
	}

	/**
	 * What a scan read, brought up to date with what happened while it ran:
	 * a conversation saved meanwhile has a file, one deleted meanwhile has none
	 * and is not a source. Call before `finish`, which forgets the records.
	 */
	reconcile<S extends { id: string }>(names: ReadonlySet<string>, sources: readonly S[]): { names: Set<string>; sources: S[] } {
		const kept = new Set([...names, ...this.saved]);
		for (const id of this.deleted) kept.delete(id);
		return { names: kept, sources: sources.filter((source) => !this.deleted.has(source.id)) };
	}

	/** The scan ends: merge what it read with the cache, then forget the records. */
	finish<T extends { updatedAt: number }>(
		scanned: ReadonlyMap<string, T>,
		cached: ReadonlyMap<string, T>
	): Map<string, T> {
		const merged = mergeScan(scanned, cached, this.saved, this.deleted);
		this.saved.clear();
		this.deleted.clear();
		this.scanning = false;
		return merged;
	}
}
