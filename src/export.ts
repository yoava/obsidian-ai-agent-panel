import { moment, normalizePath, TFile, type App } from "obsidian";
import type { StoredConversation, StoredMessage } from "./history";
import type { AgentPanelSettings } from "./settings";
import { summarizeToolInput } from "./view";

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

// ---------------------------------------------------------------------------
// Markdown serialization
// ---------------------------------------------------------------------------

export function conversationToMarkdown(
	conversation: StoredConversation,
	vaultName?: string
): string {
	const parts: string[] = [frontmatter(conversation)];
	for (const msg of conversation.messages) {
		const rendered = renderMessage(msg, vaultName);
		if (!rendered) continue;
		// A rule before each user turn separates the exchanges visually
		// (skipped right after the frontmatter, where it would be ambiguous).
		if (msg.kind === "user" && parts.length > 1) parts.push("---");
		parts.push(rendered);
	}
	return parts.join("\n\n") + "\n";
}

function frontmatter(conversation: StoredConversation): string {
	const lastCost = [...conversation.messages]
		.reverse()
		.find(
			(m): m is Extract<StoredMessage, { kind: "meta" }> =>
				m.kind === "meta" && typeof m.costUsd === "number"
		);
	const lines = [
		"---",
		`title: ${JSON.stringify(conversation.title || "Conversation")}`,
		`created: ${formatDateTime(conversation.createdAt)}`,
		`updated: ${formatDateTime(conversation.updatedAt)}`,
	];
	if (conversation.model) lines.push(`model: ${conversation.model}`);
	if (conversation.effort) lines.push(`effort: ${conversation.effort}`);
	if (conversation.sessionId) lines.push(`session: ${conversation.sessionId}`);
	if (lastCost?.costUsd !== undefined)
		lines.push(`cost_usd: ${lastCost.costUsd.toFixed(4)}`);
	lines.push("---");
	return lines.join("\n");
}

function renderMessage(msg: StoredMessage, vaultName?: string): string | null {
	switch (msg.kind) {
		case "user": {
			const context = renderContextLinks(msg.contextPaths, vaultName);
			// With linked paths the compact label would be redundant.
			const title =
				!context && msg.contextName
					? `You - ${escapeCalloutTitle(msg.contextName)}`
					: "You";
			const contextLine = context ? `> **Context:** ${context}\n>\n` : "";
			const imageLine = msg.images
				? `> **Attached:** ${msg.images} ${msg.images === 1 ? "image" : "images"}\n>\n`
				: "";
			return `> [!question]+ ${title}\n${contextLine}${imageLine}${quote(msg.text)}`;
		}
		case "bash": {
			const title = escapeCalloutTitle(`Shell · ${msg.command}`);
			const streams = [msg.stdout, msg.stderr].filter(
				(stream): stream is string => !!stream?.trim()
			);
			const body = streams.length ? `\n${quote(fence(streams.join("\n")))}` : "";
			const status = msg.timedOut
				? "timed out"
				: msg.code !== undefined && msg.code !== 0
					? `exit ${msg.code}`
					: null;
			return `> [!example]- ${title}${status ? ` (${status})` : ""}${body}`;
		}
		case "assistant":
			return msg.text.trim() || null;
		case "thinking":
			return `> [!quote]- Thinking\n${quote(msg.text)}`;
		case "tool": {
			const summary = summarizeToolInput(msg.name, asRecord(msg.input));
			const title = escapeCalloutTitle(
				`${msg.isError ? "Failed: " : ""}${msg.name}${summary ? ` · ${summary}` : ""}`
			);
			const body = msg.result ? `\n${quote(fence(msg.result))}` : "";
			return `> [!example]- ${title}${body}`;
		}
		case "meta": {
			if (msg.error) return `> [!failure] Turn failed\n${quote(msg.error)}`;
			const bits: string[] = [];
			if (typeof msg.durationMs === "number")
				bits.push(`${(msg.durationMs / 1000).toFixed(1)}s`);
			if (typeof msg.costUsd === "number") bits.push(`$${msg.costUsd.toFixed(4)}`);
			return bits.length ? `*${bits.join(" · ")}*` : null;
		}
	}
}

/**
 * Context paths as clickable references: files become wiki links; folders
 * (trailing "/") have no native link form, so they link to an Obsidian
 * search scoped to the folder when the vault name is known.
 */
function renderContextLinks(
	paths: string[] | undefined,
	vaultName?: string
): string | null {
	if (!paths || paths.length === 0) return null;
	const links = paths.map((path) => {
		if (path.endsWith("/")) {
			const name = path.split("/").filter(Boolean).pop() ?? path;
			if (!vaultName) return `\`${path}\``;
			const url = `obsidian://search?vault=${encodeURIComponent(
				vaultName
			)}&query=${encodeURIComponent(`path:"${path}"`)}`
				.replace(/\(/g, "%28")
				.replace(/\)/g, "%29");
			return `[${name}/](${url})`;
		}
		const base = path.split("/").pop() ?? path;
		const display = base.replace(/\.md$/, "");
		return `[[${path}|${display}]]`;
	});
	return links.join(" · ");
}

/**
 * Callout titles are rendered as Markdown, so tool names like `mcp__a__b`
 * come out with bold runs and a stray `*` or `[` in an input summary breaks
 * the line. Escape the formatting characters; Obsidian honors backslashes.
 */
function escapeCalloutTitle(text: string): string {
	return text.replace(/[\\`*_~=<>[\]]/g, (c) => `\\${c}`);
}

function quote(text: string): string {
	return text
		.split("\n")
		.map((line) => (line ? `> ${line}` : ">"))
		.join("\n");
}

function fence(text: string): string {
	return "````\n" + text.replace(/````/g, "```​`") + "\n````";
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

/**
 * True when a stored export path is safe to write to: a `.md` note that
 * stays within the configured folder, with no traversal segments. Guards the
 * reuse path in export() against a tampered `exportPath`.
 */
function isSafeExportPath(path: string, folder: string): boolean {
	if (!path.endsWith(".md")) return false;
	if (!path.startsWith(folder + "/")) return false;
	// No empty/"."/".." segments - those are the only way to escape the folder
	// once the prefix is fixed (normalizePath does NOT collapse "..").
	return path
		.split("/")
		.every((segment) => segment !== "" && segment !== "." && segment !== "..");
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

function formatDate(timestamp: number): string {
	const d = new Date(timestamp);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(timestamp: number): string {
	const d = new Date(timestamp);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${formatDate(timestamp)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
