/**
 * The save-failure Notice: which conversations it has been raised for, and its
 * text. Obsidian-free so plain Node tests it; `main` shows the Notice.
 */

import { displayTitle } from "./conversation-list";

/**
 * Lets each conversation id through once. A failing write repeats with every
 * save, about once a second while a turn runs, and the store sits below every
 * view, so the rule lives here rather than in a view: with several panel views
 * open it still yields one Notice per conversation. Lasts as long as the
 * instance, so until the plugin reloads.
 */
export class OncePerId {
	private seen = new Set<string>();

	/** True the first time `id` is claimed, false every time after. */
	claim(id: string): boolean {
		if (this.seen.has(id)) return false;
		this.seen.add(id);
		return true;
	}
}

/** The Notice for a conversation whose history write failed. */
export function saveFailedText(title: unknown): string {
	return `Could not save "${displayTitle(title)}" to history. The conversation stays open; the next save tries again.`;
}
