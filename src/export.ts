import { moment, normalizePath, TFile, type App } from "obsidian";
import type { StoredConversation } from "./history";
import { isSafeExportPath } from "./history-file";
import type { AgentPanelSettings } from "./settings-core";
import { conversationToMarkdown } from "./transcript-markdown";

const DEFAULT_FOLDER = "Agent Chats";
const DEFAULT_FILE_PATTERN = "{date} {title}";
const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
const MAX_NAME_CHARS = 60;

// Obsidian ships Moment, but its typings re-export it as a namespace that
// TypeScript won't let us call directly.
const momentFn = moment as unknown as (input: number) => {
	format(fmt: string): string;
};

/**
 * Writes conversations as Markdown notes into a vault folder. The plugin's
 * JSON history stays the source of truth; the note is regenerated in full on
 * every save, so it always mirrors the transcript.
 */
export class TranscriptExporter {
	/** Fires after a note is written; lets open views show a transcript link. */
	onExported: ((conversation: StoredConversation) => void) | null = null;

	constructor(
		private app: App,
		private getSettings: () => AgentPanelSettings
	) {}

	/** Called before every history save; exports when the toggle is on. */
	async maybeAutoExport(conversation: StoredConversation): Promise<void> {
		if (!this.getSettings().exportEnabled) return;
		try {
			await this.export(conversation);
		} catch (err) {
			console.error("AI Agent Panel: transcript export failed", err);
		}
	}

	/** Write/refresh the conversation's note; returns its vault path. */
	async export(conversation: StoredConversation): Promise<string> {
		const folder = this.targetFolder();
		// Reuse the assigned path so re-exports overwrite the same note; a
		// changed target folder - or a tampered path - gets a fresh assignment.
		// The stored path is re-validated here, not trusted: it comes back from
		// a JSON file that other tools (or a synced vault) can edit, and a "../"
		// path would otherwise let the exporter write outside the folder.
		let path = conversation.exportPath;
		if (!path || !isSafeExportPath(path, folder))
			path = await this.assignPath(conversation, folder);
		await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
		const markdown = conversationToMarkdown(conversation, this.app.vault.getName());
		// Through the Vault API rather than the adapter, so the file explorer,
		// the metadata cache and other plugins see the note as it is written.
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile)
			await this.app.vault.process(existing, () => markdown);
		else await this.app.vault.create(path, markdown);
		this.onExported?.(conversation);
		return path;
	}

	private targetFolder(): string {
		const raw = this.getSettings().exportFolder || DEFAULT_FOLDER;
		const segments = normalizePath(raw)
			.split("/")
			.filter((s) => s && s !== "." && s !== "..");
		return segments.join("/") || DEFAULT_FOLDER;
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) return;
		let current = "";
		for (const part of folder.split("/")) {
			current = current ? `${current}/${part}` : part;
			if (this.app.vault.getAbstractFileByPath(current)) continue;
			try {
				await this.app.vault.createFolder(current);
			} catch {
				// Already there but not yet in the vault's index (a folder made
				// outside Obsidian, or a concurrent export). A genuine failure
				// surfaces on the write that follows.
			}
		}
	}

	private async assignPath(
		conversation: StoredConversation,
		folder: string
	): Promise<string> {
		const settings = this.getSettings();
		const date = momentFn(conversation.createdAt).format(
			settings.exportDateFormat?.trim() || DEFAULT_DATE_FORMAT
		);
		const title = sanitizeName(conversation.title) || "Conversation";
		const pattern = settings.exportFilePattern?.trim() || DEFAULT_FILE_PATTERN;
		const name =
			patternToPath(pattern, { date, title, id: conversation.id }) || title;
		const base = `${folder}/${name}`;
		let candidate = `${base}.md`;
		for (let n = 2; await this.app.vault.adapter.exists(candidate); n++)
			candidate = `${base} ${n}.md`;
		// Persisted by the history save this export runs inside of.
		conversation.exportPath = candidate;
		return candidate;
	}
}

function sanitizeName(title: string): string {
	return title
		.replace(/[\\/:*?"<>|#^[\]]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_NAME_CHARS)
		.trim();
}

/**
 * Expand a note-name pattern's {date}/{title}/{id} placeholders into a
 * folder-relative path: "/" separates subfolders (so a date format like
 * "YYYY/MM" nests by month) and every segment is sanitized on its own.
 */
function patternToPath(
	pattern: string,
	vars: { date: string; title: string; id: string }
): string {
	const raw = pattern.replace(
		/\{(date|title|id)\}/g,
		(_, key: "date" | "title" | "id") => vars[key]
	);
	return normalizePath(raw)
		.split("/")
		.map((segment) =>
			segment
				.replace(/[\\:*?"<>|#^[\]]/g, " ")
				.replace(/\s+/g, " ")
				.trim()
		)
		.filter((segment) => segment && segment !== "." && segment !== "..")
		.join("/");
}
