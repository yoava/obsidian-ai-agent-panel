import { conversationCost } from "./commands";
import type { StoredConversation, StoredMessage } from "./history";
import { breakInlineFields, breakTemplateCommands, cutForExport, fenceForExport } from "./inert-markdown";
import { asJsonObject } from "./json";
import { clearedLine } from "./state/clear-divider";
import { compactedLine } from "./state/compaction";
import { formatClock } from "./state/usage-segment";
import { figuresText, turnCosts } from "./state/turn-cost";
import { baseName, summarizeToolInput } from "./tool-labels";

/**
 * A conversation as the Markdown note the exporter writes (DES-005). No
 * `obsidian` import, so the whole note is testable in plain Node.
 */
export function conversationToMarkdown(
	conversation: StoredConversation,
	vaultName?: string
): string {
	const parts: string[] = [frontmatter(conversation)];
	const costs = turnCosts(conversation.messages, conversation.forkBase);
	conversation.messages.forEach((msg, at) => {
		const rendered = renderMessage(msg, costs[at], vaultName);
		if (!rendered) return;
		// A rule before each user turn separates the exchanges visually
		// (skipped right after the frontmatter, where it would be ambiguous).
		if (msg.kind === "user" && parts.length > 1) parts.push("---");
		parts.push(rendered);
	});
	// Templater and Dataview read the whole file and every rendered text node (DES-005).
	return breakInlineFields(breakTemplateCommands(parts.join("\n\n") + "\n"));
}

function frontmatter(conversation: StoredConversation): string {
	const cost = conversationCost(conversation.messages, conversation.forkBase);
	const lines = [
		"---",
		`title: ${JSON.stringify(conversation.title || "Conversation")}`,
		`created: ${formatDateTime(conversation.createdAt)}`,
		`updated: ${formatDateTime(conversation.updatedAt)}`,
	];
	const model = conversation.resolvedModel || conversation.model;
	if (model) lines.push(`model: ${JSON.stringify(model)}`);
	if (conversation.effort) lines.push(`effort: ${JSON.stringify(conversation.effort)}`);
	if (conversation.sessionId) lines.push(`session: ${JSON.stringify(conversation.sessionId)}`);
	if (cost > 0) lines.push(`cost_usd: ${cost.toFixed(4)}`);
	lines.push("---");
	return lines.join("\n");
}

/** One message; a turn record with its turn's cost (PRD-005.R7). */
function renderMessage(msg: StoredMessage, cost: number | null, vaultName?: string): string | null {
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
			return `> [!question]+ ${title}\n${contextLine}${imageLine}${quote(cutForExport(msg.text))}`;
		}
		case "bash": {
			const title = escapeCalloutTitle(`Shell · ${msg.command}`);
			// Whitespace is output too; only an empty stream is left out.
			const streams = [msg.stdout, msg.stderr].filter((stream): stream is string => !!stream);
			const body = streams.length ? `\n${quote(fenceForExport(streams.join("\n")))}` : "";
			const status = msg.timedOut
				? "timed out"
				: msg.code !== undefined && msg.code !== 0
					? `exit ${msg.code}`
					: null;
			return `> [!example]- ${title}${status ? ` (${status})` : ""}${body}`;
		}
		case "assistant":
			return msg.text.trim() ? cutForExport(msg.text.trim()) : null;
		case "thinking":
			return `> [!quote]- Thinking\n${quote(cutForExport(msg.text))}`;
		case "tool": {
			const summary = summarizeToolInput(msg.name, asJsonObject(msg.input));
			const title = escapeCalloutTitle(
				`${msg.isError ? "Failed: " : ""}${msg.name}${summary ? ` · ${summary}` : ""}`
			);
			const body = msg.result ? `\n${quote(fenceForExport(msg.result))}` : "";
			return `> [!example]- ${title}${body}`;
		}
		case "compaction":
			return `*${compactedLine(msg.at ?? null, msg.preTokens ?? null, msg.postTokens ?? null, formatClock)}*`;
		case "clear":
			return `*${clearedLine(msg.at ?? null, formatClock)}*`;
		// A fresh start draws nothing (ADR-018).
		case "fresh-start":
			return null;
		case "meta": {
			// The CLI's error text can carry what the model or a server wrote.
			if (msg.error) return `> [!failure] Turn failed\n${quote(cutForExport(msg.error))}`;
			const figures = figuresText({ durationMs: msg.durationMs ?? null, costUsd: cost, error: null });
			return figures ? `*${figures}*` : null;
		}
	}
}

/**
 * A context path as the plugin records one (`context-format`): no control
 * character and none of the characters a vault path never holds, which would
 * end the wiki link, the code span or the callout line it is written in
 * (PRD-003.R13). A stored path with one is left out of the note.
 */
const SAFE_CONTEXT_PATH = /^[^\p{Cc}\\[\]|#^`<>]+$/u;

/**
 * Context paths as clickable references: files become wiki links; folders
 * (trailing "/") have no native link form, so they link to an Obsidian
 * search scoped to the folder when the vault name is known. Only paths that
 * pass {@link SAFE_CONTEXT_PATH} are written; none left gives null.
 */
function renderContextLinks(
	paths: string[] | undefined,
	vaultName?: string
): string | null {
	const safe = paths?.filter((path) => SAFE_CONTEXT_PATH.test(path)) ?? [];
	if (safe.length === 0) return null;
	const links = safe.map((path) => {
		if (path.endsWith("/")) {
			const name = baseName(path);
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
 * `%` and `$` too, so no comment hides part of a command and no math forms.
 * One line: a later line would end the callout and could open a block (a
 * comment, math) that swallows the fenced output below it.
 */
function escapeCalloutTitle(text: string): string {
	return text.replace(/\s*[\r\n]\s*/g, " ").replace(/[\\`*_~=<>[\]%$]/g, (c) => `\\${c}`);
}

function quote(text: string): string {
	return text
		.split("\n")
		.map((line) => (line ? `> ${line}` : ">"))
		.join("\n");
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
