/**
 * How a tool call is named, summarized and iconned on a card, a step row and
 * in an exported note, what its result counts, and how AskUserQuestion's and
 * ExitPlanMode's input is read (DES-003, DES-004, DES-006). Pure, so the
 * panel and the exporter share it and it is tested in plain Node
 * (tests/tool-labels.test.mjs).
 */

/** Name of the in-process MCP server; tools appear as `mcp__obsidian__…`. */
export const OBSIDIAN_MCP_SERVER = "obsidian";

interface UserQuestionOption {
	label: string;
	description: string;
}

export interface UserQuestion {
	question: string;
	header: string;
	multiSelect: boolean;
	options: UserQuestionOption[];
}

/**
 * A tool input as indented JSON, cut to `maxChars` with a closing "…" line:
 * a permission card's Full input and a tool card's details.
 */
export function jsonPreview(value: unknown, maxChars: number): string {
	let json: string;
	try {
		json = JSON.stringify(value, null, 2) ?? "";
	} catch {
		json = String(value);
	}
	return json.length > maxChars ? json.slice(0, maxChars) + "\n…" : json;
}

/** Extract AskUserQuestion's questions; null when the shape is unexpected. */
export function parseAskUserQuestions(input: Record<string, unknown>): UserQuestion[] | null {
	const raw = input.questions;
	if (!Array.isArray(raw) || raw.length === 0) return null;
	const questions: UserQuestion[] = [];
	for (const item of raw) {
		if (typeof item !== "object" || item === null) return null;
		const q = item as Record<string, unknown>;
		if (typeof q.question !== "string" || !Array.isArray(q.options)) return null;
		const options: UserQuestionOption[] = [];
		for (const rawOpt of q.options) {
			const opt = rawOpt as Record<string, unknown> | null;
			if (typeof opt?.label !== "string") return null;
			options.push({
				label: opt.label,
				description: typeof opt.description === "string" ? opt.description : "",
			});
		}
		if (options.length === 0) return null;
		questions.push({
			question: q.question,
			header: typeof q.header === "string" ? q.header : "",
			multiSelect: q.multiSelect === true,
			options,
		});
	}
	return questions;
}

/** ExitPlanMode's proposed plan; null when `plan` is missing, blank or not a string. */
export function planOf(input: Record<string, unknown>): string | null {
	const plan = input.plan;
	return typeof plan === "string" && plan.trim() ? plan : null;
}

interface VaultTool {
	/** The one argument the tool acts on, which its card names; null when it takes none. */
	subject: "path" | "query" | null;
	icon: string;
	title: (input: Record<string, unknown>) => string;
}

const noteIn = (input: Record<string, unknown>): string =>
	typeof input.path === "string" ? input.path : "a note";

/**
 * The panel's six vault tools by bare name. The card title and the summary
 * line both read this table, so neither names anything but what the tool acts
 * on: a model-added `file_path` or `command` must not rename the card
 * (PRD-004.R10). A Map, so a name like `constructor` finds nothing.
 */
const VAULT_TOOLS = new Map<string, VaultTool>([
	[
		"obsidian_rename",
		{
			subject: "path",
			icon: "pencil",
			title: (input) =>
				`Rename ${noteIn(input)} to ${
					typeof input.newPath === "string" ? input.newPath : "a new path"
				}, updating backlinks?`,
		},
	],
	[
		"obsidian_properties",
		{
			subject: "path",
			icon: "list",
			title: (input) =>
				input.patch === undefined || input.patch === null
					? `Read ${noteIn(input)}'s properties?`
					: `Update ${noteIn(input)}'s properties?`,
		},
	],
	[
		"obsidian_links",
		{
			subject: "path",
			icon: "link",
			title: (input) => `Look up ${noteIn(input)}'s links and backlinks?`,
		},
	],
	[
		"obsidian_search",
		{
			subject: "query",
			icon: "search",
			title: (input) =>
				`Search the vault's metadata for ${
					typeof input.query === "string" ? `"${input.query}"` : "notes"
				}?`,
		},
	],
	[
		"obsidian_open",
		{
			subject: "path",
			icon: "file-text",
			title: (input) => `Open ${noteIn(input)} in your window?`,
		},
	],
	[
		"obsidian_active",
		{
			subject: null,
			icon: "file-text",
			title: () => "Read which note you have open, and your selection?",
		},
	],
]);

/** The vault tool a name stands for; null for any other name, whatever its type. */
function vaultToolOf(name: unknown): VaultTool | null {
	const prefix = `mcp__${OBSIDIAN_MCP_SERVER}__`;
	if (typeof name !== "string" || !name.startsWith(prefix)) return null;
	return VAULT_TOOLS.get(name.slice(prefix.length)) ?? null;
}

/**
 * Our own MCP tools deserve better than "Allow mcp__obsidian__obsidian_rename?".
 * Returns null for anything else, so the CLI's own title still wins.
 */
export function obsidianToolPrompt(
	toolName: string,
	input: Record<string, unknown>
): { title: string; icon: string } | null {
	const tool = vaultToolOf(toolName);
	return tool ? { title: tool.title(input), icon: tool.icon } : null;
}

/** Name of Claude Code's browser MCP server; tools appear as `mcp__claude-in-chrome__…`. */
export const CHROME_MCP_SERVER = "claude-in-chrome";

/** MCP servers whose tool cards carry a friendlier name than the server id. */
const MCP_SERVER_LABELS: Record<string, string> = {
	[CHROME_MCP_SERVER]: "Chrome",
	[OBSIDIAN_MCP_SERVER]: "Obsidian",
};

/** `mcp__claude-in-chrome__navigate` → "Chrome · navigate"; other names unchanged. */
export function toolDisplayName(name: string): string {
	const match = /^mcp__(.+?)__(.+)$/.exec(name);
	if (!match) return name;
	const [, server, tool] = match;
	// Our own tools repeat the server in their names (obsidian_rename).
	const bare = tool.startsWith(`${server}_`) ? tool.slice(server.length + 1) : tool;
	return `${MCP_SERVER_LABELS[server] ?? server} · ${bare}`;
}

function placed(path: string, toVaultPath: ((reported: string) => string | null) | undefined): string {
	return path && toVaultPath ? (toVaultPath(path) ?? path) : path;
}

/**
 * A tool call's one-line summary (PRD-001.R16). `toVaultPath` places a file
 * path the call reports inside the vault (null for any it cannot place), so a
 * step shows `Projects/Plan.md` rather than the absolute path.
 */
export function summarizeToolInput(
	name: string,
	input: Record<string, unknown>,
	toVaultPath?: (reported: string) => string | null
): string {
	const pick = (...keys: string[]): string => {
		for (const key of keys) {
			const value = input[key];
			if (typeof value === "string" && value.trim()) return value;
		}
		return "";
	};
	const vaultTool = vaultToolOf(name);
	let summary = vaultTool
		? vaultTool.subject === null
			? ""
			: pick(vaultTool.subject)
		: placed(pick("file_path", "path", "notebook_path"), toVaultPath) ||
			pick("command") ||
			pick("pattern") ||
			pick("url") ||
			pick("description", "prompt", "query");
	if (name === "AskUserQuestion") {
		const first = (parseAskUserQuestions(input) ?? [])[0];
		if (first) summary = first.question;
	}
	return summary.length > 96 ? summary.slice(0, 93) + "…" : summary;
}

/** The last non-empty segment of a path (either separator), else the path itself. */
export function baseName(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** A step row's tile icon: a vault tool's own, else by the tool's kind. */
export function toolIcon(name: string): string {
	const vaultTool = vaultToolOf(name);
	if (vaultTool) return vaultTool.icon;
	if (name.startsWith(`mcp__${CHROME_MCP_SERVER}__`)) return "globe";
	if (name === "Bash") return "terminal";
	if (name === "AskUserQuestion") return "help-circle";
	if (name === "Read") return "file-text";
	if (name === "Edit" || name === "Write" || name === "MultiEdit" || name === "NotebookEdit") return "pencil";
	if (name.startsWith("Web")) return "globe";
	if (name === "Task" || name === "Agent") return "bot";
	if (name === "Grep" || name === "Glob") return "search";
	return "wrench";
}

/** What a counted tool's result counts, singular and plural (PRD-001.R16). */
const COUNTED = new Map<string, [string, string]>([
	["Glob", ["file", "files"]],
	["Grep", ["result", "results"]],
	[`mcp__${OBSIDIAN_MCP_SERVER}__obsidian_search`, ["note", "notes"]],
]);

/** A first line stating a count: Grep's "Found 3 files", `obsidian_search`'s "12 note(s) matched". */
const STATED_COUNT = /^\s*(?:found\s+([\d,]+)\s+(?:files?|matches|lines?|results?)\b|([\d,]+)\s+note\(s\)\s+matched\b)/i;
/** Lines that are not results: Glob's truncation note, the total of Grep's count mode. */
const NOT_A_RESULT = /^\s*(?:\(results are truncated\b|found\s+[\d,]+\s+total\s+occurrences?\b)/i;

/**
 * A Glob, Grep or `obsidian_search` result's count (PRD-001.R16): the count
 * its first line states in a known phrasing ("Found 1,234 files", "12
 * note(s) matched"), 0 for a first line starting "No " ("No files found"),
 * else its non-empty lines that are results, never a number in a file name;
 * as "N files", "N results" or "N notes". Null for any other tool or no
 * result.
 */
export function resultCount(name: string, result: string | null): string | null {
	const nouns = COUNTED.get(name);
	if (!nouns || result === null) return null;
	const lines = result.split(/\r?\n/).filter((line) => line.trim() !== "");
	const first = lines[0] ?? "";
	const stated = STATED_COUNT.exec(first);
	const n = stated
		? Number((stated[1] ?? stated[2]).replace(/,/g, ""))
		: /^\s*no\s/i.test(first)
			? 0
			: lines.filter((line) => !NOT_A_RESULT.test(line)).length;
	return `${n} ${n === 1 ? nouns[0] : nouns[1]}`;
}
