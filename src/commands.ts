/**
 * Slash commands the panel answers itself rather than sending them to the CLI
 * as a turn. Over stream-JSON the CLI answers some of them in plain text
 * (`/context`), points at a terminal (`/mcp`), or refuses them outright
 * (`/status`, `/memory`, `/hooks`, `/permissions`); each has a read-only
 * control request behind it, which costs no turn and no tokens. The builders
 * here turn one reply into a report that the view renders as a card and
 * records as Markdown. Obsidian-free so tests can feed it captured replies.
 *
 * The replies are untyped control-protocol payloads, not SDK types, so every
 * field is checked before use and a missing one degrades to a blank cell.
 */
import { asJsonObject } from "./json";
import { describeModelId } from "./models";
import { forkTarget, type ForkBase } from "./state/fork-base";

/** A command in the slash list: the panel's or Claude Code's. */
export interface SlashCommand {
	name: string;
	description?: string;
	argumentHint?: string;
}

export interface PanelCommand extends SlashCommand {
	/** The one description, in the slash list and in /help (PRD-001.R19). */
	description: string;
	/** Its card's title, loading and answered; none for /clear, which draws no card. */
	title?: string;
}

/** Commands answered here (or by the usage service); they never reach the model. */
export const PANEL_COMMANDS: readonly PanelCommand[] = [
	{ name: "chrome", description: "Show Claude in Chrome status", title: "Claude in Chrome" },
	{ name: "clear", description: "Clear Claude's context; messages above stay, dimmed" },
	{ name: "context", description: "Show what is using the context window", title: "Context usage" },
	{ name: "cost", description: "Show this conversation's token use and cost", title: "Cost" },
	{ name: "extra-usage", description: "Show extra-usage credit status", title: "Usage credits" },
	{ name: "help", description: "List the commands available here", title: "Commands" },
	{ name: "hooks", description: "List the hooks Claude Code runs", title: "Hooks" },
	{
		name: "mcp",
		description: "Show MCP servers; reconnect, enable or disable one",
		argumentHint: "[reconnect|enable|disable <server>|all]",
		title: "MCP servers",
	},
	{ name: "memory", description: "Show the instruction and memory files Claude Code loads", title: "Memory" },
	{ name: "permissions", description: "List the allow, ask and deny rules in effect", title: "Permission rules" },
	{ name: "sandbox", description: "Show Bash sandbox status", title: "Sandbox" },
	{ name: "skills", description: "List skills and their context cost", title: "Skills" },
	{ name: "status", description: "Show version, account, model and MCP status", title: "Status" },
	{ name: "usage", description: "Show plan usage limits", title: "Plan usage" },
	{ name: "usage-credits", description: "Show extra-usage credit status", title: "Usage credits" },
];

/** The commands the usage service answers (DES-007): their cards load as "Checking usage…". */
export const USAGE_COMMANDS: readonly string[] = ["usage", "usage-credits", "extra-usage"];

/** A panel command's card title, loading and answered. */
export function reportTitle(name: string): string {
	return PANEL_COMMANDS.find((cmd) => cmd.name === name)?.title ?? `/${name}`;
}

/**
 * Claude Code commands listed until a CLI reports its own (PRD-001.R19); a
 * reported name without a description borrows one of these.
 */
const BUILTIN_DESCRIPTIONS: Readonly<Record<string, string>> = {
	compact: "Free up context by summarizing the conversation so far",
	init: "Create a CLAUDE.md with codebase documentation",
	"security-review": "Security review of pending changes",
};

/** The slash list's two groups (PRD-001.R19). */
export interface CommandList {
	/** "Answered by the panel", sorted by name. */
	panel: SlashCommand[];
	/** "Claude Code": what it reported, or the built-ins before it has, less the names the panel answers; sorted by name. */
	cli: SlashCommand[];
}

const byName = (a: SlashCommand, b: SlashCommand) => a.name.localeCompare(b.name);

/** The panel's commands, then Claude Code's; on a name both have, the panel's description wins, since the panel answers it. */
export function commandList(cli: readonly SlashCommand[] | null): CommandList {
	const panel = new Set(PANEL_COMMANDS.map((cmd) => cmd.name));
	const reported: readonly SlashCommand[] = cli ?? Object.keys(BUILTIN_DESCRIPTIONS).map((name) => ({ name }));
	return {
		panel: PANEL_COMMANDS.map(({ name, description, argumentHint }) => ({ name, description, argumentHint })).sort(byName),
		cli: reported
			.filter((cmd) => !panel.has(cmd.name))
			.map((cmd) => ({ ...cmd, description: cmd.description ?? BUILTIN_DESCRIPTIONS[cmd.name] }))
			.sort(byName),
	};
}

/** A message that is one of PANEL_COMMANDS, split into name and arguments. */
export function parsePanelCommand(text: string): { name: string; args: string } | null {
	const match = /^\/([\w:-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
	if (!match) return null;
	const name = match[1].toLowerCase();
	if (!PANEL_COMMANDS.some((cmd) => cmd.name === name)) return null;
	return { name, args: (match[2] ?? "").trim() };
}

/** A stored or typed panel command that answers with a card: all but `/clear`, which draws a divider (PRD-001.R38). */
export function parseCardCommand(text: string): { name: string; args: string } | null {
	const command = parsePanelCommand(text);
	return command && command.name !== "clear" ? command : null;
}

/**
 * True when the message must reach the CLI as typed, with no context block
 * and no attachments: a leading block makes the CLI read a command such as
 * `/compact` as prose (PRD-001.R12). Takes the text as sent, which the
 * composer has already trimmed.
 */
export function isBareMessage(text: string): boolean {
	return text.startsWith("/");
}

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------

export type ReportStatus = "ok" | "warn" | "error" | "off";

export interface ControlRequest {
	subtype: string;
	[key: string]: unknown;
}

/**
 * A row's button, on live cards only: `request` is sent and the card then
 * lists again (/mcp); `command` runs that panel command (/status's "open /mcp").
 */
export type ReportAction = { label: string; request: ControlRequest } | { label: string; command: string };

export interface ReportRow {
	cells: string[];
	/** Marks the row with a coloured dot, or tones its pill in a list. */
	status?: ReportStatus;
	/** Buttons, offered while the card is live (not on a restored transcript). */
	actions?: ReportAction[];
	/** A command row of /help: on a live card a click puts `/<insert> ` into the composer. */
	insert?: string;
	/** Card only: a line under the row (an MCP server's error); the Markdown keeps it in its cell. */
	detail?: string;
	/** Card only: the row's status pill text (an MCP server's status, an instruction file's "exists"). */
	pill?: string;
	/** Card only, `servers` lists: the meta line, and whether it is the panel's own server. */
	server?: { meta: string; own: boolean };
	/** Card only, `skills` lists: the description tokens listed to Claude, for the token bar. */
	tokens?: number;
	/** Card only, `commands` lists: the command and its argument hint, drawn apart. */
	command?: { name: string; hint: string };
	/** Card only, `tiles` lists: the tile's figure and its label. */
	tile?: { value: string; label: string };
}

/**
 * How a card draws a section's rows in place of a table or pairs (DES-003
 * Report cards); the Markdown is unchanged. Each kind draws its builder's
 * cells: `servers` /mcp's, `rules` /permissions', `hooks` /hooks', `skills`
 * /skills', `files` and `memories` /memory's, `commands` /help's, `tiles`
 * and `figure` /cost's.
 */
export type ReportList =
	| "servers"
	| "rules"
	| "hooks"
	| "skills"
	| "files"
	| "memories"
	| "commands"
	| "tiles"
	| "figure";

export interface ReportSection {
	heading?: string;
	/** Beside the heading: "no tokens" on /help's panel group. */
	badge?: string;
	/** Table header. Without one the rows are label/value pairs. */
	columns?: string[];
	rows: ReportRow[];
	/** Said instead of an empty table. */
	empty?: string;
	/** Shown behind a toggle (/context's memory files, MCP tools, agents and skills). */
	collapsed?: boolean;
	/** Rows shown before "Show all N" when there are more; else `foldedAt`'s rule for long tables. */
	fold?: number;
	/** Card only: the rows as this kind of list. */
	list?: ReportList;
	/** Card only: a dot of this status before the heading and the row count after it (/permissions). */
	marker?: ReportStatus;
	/** Card only: the heading's closing "(…)" as a pill of this status (/memory's "Auto memory (on)"). */
	headingPill?: ReportStatus;
	/** Recorded only: the card shows it another way (/context's categories, in the meter's legend). */
	recordOnly?: boolean;
}

/** A bar's tint: the usage thresholds' levels (PRD-005.R4). */
export type ReportTint = "normal" | "warning" | "critical";

/** One row of the `bars` part: the usage cards' rows (PRD-005.R6). */
export interface ReportBar {
	label: string;
	/** The bar's fill, rounded down; null draws the row without a bar. */
	percent: number | null;
	tint: ReportTint;
	/** The figure beside the label; `<percent>%` when absent. */
	value?: string;
	/** A line under the bar: a reset time, the share of a cap. */
	sub?: string;
	/** Card only: a status dot before the value. */
	status?: ReportStatus;
}

/** Card only: a large figure, its caption, and a figure at the end of its line (/context's tokens). */
export interface ReportFigure {
	value: string;
	caption?: string;
	aside?: string;
}

export interface ReportLink {
	label: string;
	href: string;
	/** Card only: a button in the body instead of a link in the footer (/chrome's). */
	button?: "primary" | "secondary";
}

export interface CommandReport {
	title: string;
	/** One line under the title. */
	lead?: string;
	/** Card only: the line under the title in place of `lead`; "" for none. */
	cardLead?: string;
	/** Card only: drawn above the body's other parts. */
	figure?: ReportFigure;
	/** Context-window occupancy as a stacked bar; `free` is the free space's tokens, the bar's rest. */
	meter?: { max: number; free?: number; segments: Array<{ label: string; tokens: number; reserved?: boolean }> };
	bars?: ReportBar[];
	/** Card only: `bars` as key/value rows, the bar under its value (/usage-credits). */
	barPairs?: boolean;
	sections: ReportSection[];
	notes?: string[];
	/** The recorded Markdown's notes, in place of `notes` (/context: the live card has "/compact now" instead of the hint). */
	recordNotes?: string[];
	links?: ReportLink[];
}

/** A card's state (DES-003 Report cards). */
export type ReportState = "loading" | "answered" | "failed";

/** What a card's header shows (PRD-001.R20). */
export interface ReportHeader {
	title: string;
	/** After the title: the busy text while loading, "Couldn't load" once failed. */
	note: string | null;
	/** The "no tokens" badge, once answered. */
	badge: boolean;
	refresh: boolean;
	copy: boolean;
}

/**
 * A card's header: its title; "Asking Claude Code…" ("Checking usage…" for
 * the usage cards) while loading, "Couldn't load" once failed, with no badge
 * and no actions; answered, "no tokens", and on a live card Refresh (not on
 * /help) and "Copy as Markdown". A recorded card has no actions.
 */
export function reportHeader(command: string, state: ReportState, live: boolean): ReportHeader {
	const answered = state === "answered";
	return {
		title: reportTitle(command),
		note:
			state === "loading"
				? USAGE_COMMANDS.includes(command)
					? "Checking usage…"
					: "Asking Claude Code…"
				: state === "failed"
					? "Couldn't load"
					: null,
		badge: answered,
		refresh: answered && live && command !== "help",
		copy: answered && live,
	};
}

/** The failure text when the CLI could not start for a report (PRD-001.R20). */
export const DID_NOT_START = "Claude Code did not start - see the error above.";

/** The failure text when Claude Code refused a report request, failed it, or did not answer in 60 s (PRD-001.R20). */
export function couldNotAnswer(message: string): string {
	return `Claude Code could not answer: ${message}. Updating it may help.`;
}

/** `couldNotAnswer`'s text around Claude Code's message, which a card sets in mono; null for any other failure. */
export function failureParts(text: string): { before: string; message: string; after: string } | null {
	const match = /^(Claude Code could not answer: )([\s\S]+)(\. Updating it may help\.)$/.exec(text);
	return match ? { before: match[1], message: match[2], after: match[3] } : null;
}

/**
 * A card's message as recorded with its command, before it answers: the
 * card's text replaces it when it settles, so it stays only when Obsidian
 * closed first.
 */
export function pendingMarkdown(command: string): string {
	return `**${escapeMarkdown(reportTitle(command))}** - No answer recorded`;
}

/** A failed card as recorded: its title, "Couldn't load" and the failure text, escaped. */
export function failureMarkdown(command: string, error: string): string {
	return `**${escapeMarkdown(reportTitle(command))}** - Couldn't load\n\n${escapeMarkdown(error)}`;
}

/** Tables longer than this show `FOLD_SHOWN` rows behind "Show all N" (DES-003 Report cards). */
const FOLD_OVER = 14;
const FOLD_SHOWN = 12;

/** How many rows a table shows before "Show all N", or null when it shows all of them. */
export function foldedAt(section: ReportSection): number | null {
	const rows = section.rows.length;
	if (section.fold !== undefined) return rows > section.fold ? section.fold : null;
	return rows > FOLD_OVER ? FOLD_SHOWN : null;
}

/** The report as Markdown: what the transcript records, exports and copies. */
export function reportMarkdown(report: CommandReport): string {
	const out = [`**${escapeMarkdown(report.title)}**`];
	if (report.lead) out.push(escapeMarkdown(report.lead));
	if (report.bars?.length)
		out.push(
			report.bars
				.map((bar) => {
					const value = bar.value ?? `${bar.percent ?? 0}% used`;
					return `- **${escapeMarkdown(bar.label)}:** ${escapeMarkdown(bar.sub ? `${value} · ${bar.sub}` : value)}`;
				})
				.join("\n")
		);
	for (const section of report.sections) {
		if (section.heading)
			out.push(`**${escapeMarkdown(section.heading)}**${section.badge ? ` (${escapeMarkdown(section.badge)})` : ""}`);
		if (section.rows.length === 0) {
			if (section.empty) out.push(`*${escapeMarkdown(section.empty)}*`);
			continue;
		}
		const columns = section.columns;
		if (columns) {
			const line = (cells: string[]) =>
				`| ${columns.map((_, i) => escapeMarkdown(cells[i] ?? "")).join(" | ")} |`;
			out.push(
				[line(columns), `| ${columns.map(() => "---").join(" | ")} |`]
					.concat(section.rows.map((row) => line(row.cells)))
					.join("\n")
			);
		} else {
			out.push(
				section.rows
					.map(
						({ cells: [label, ...values] }) =>
							`- **${escapeMarkdown(label ?? "")}:** ${escapeMarkdown(values.join(" · "))}`
					)
					.join("\n")
			);
		}
	}
	for (const note of report.recordNotes ?? report.notes ?? []) out.push(escapeMarkdown(note));
	const links = (report.links ?? []).filter((link) => isWebLink(link.href));
	if (links.length)
		out.push(links.map((link) => `[${escapeMarkdown(link.label)}](<${link.href}>)`).join(" · "));
	return out.join("\n\n");
}

/**
 * Backslash-escape what Markdown (and Obsidian: `==`, `$`, `[[`, `%%`) would
 * read as formatting, and fold line breaks - a cell may hold a shell command
 * or a glob.
 */
export function escapeMarkdown(text: string): string {
	return text.replace(/\s*[\r\n]\s*/g, " ").replace(/[\\`*_~=<>[\]|$#%]/g, (c) => `\\${c}`);
}

/** An https URL that is safe inside `<…>` in a Markdown link. */
export function isWebLink(href: string): boolean {
	return /^https:\/\/[^\s<>]+$/.test(href);
}

/**
 * `text` cut after each "/", so a report card can let a long path wrap at its
 * separators (Chromium offers no line break there). The pieces join back to `text`.
 */
export function pathSegments(text: string): string[] {
	return text.split(/(?<=\/)/);
}

/** "12.1k" / "1.2M" - compact enough for a one-line meter. */
export function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}

/**
 * Tokens as the context surfaces show them: "950", "3.1k", "68k", "1.5M";
 * a whole thousand or million drops its decimal ("200k", "1M").
 */
export function shortTokens(tokens: number): string {
	const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");
	if (tokens < 1000) return String(tokens);
	if (tokens < 10_000) return `${trim(tokens / 1000)}k`;
	if (tokens < 999_500) return `${Math.round(tokens / 1000)}k`;
	return `${trim(tokens / 1_000_000)}M`;
}

// ---------------------------------------------------------------------------
// Reply readers
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function list(value: unknown): Json[] {
	return Array.isArray(value) ? value.map(asJsonObject) : [];
}

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function count(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function yesNo(value: unknown): string {
	return value === true ? "yes" : value === false ? "no" : "-";
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** A field the reply must have, or the command cannot say anything useful. */
function required<T>(value: T | null | undefined, what: string): T {
	if (value === null || value === undefined)
		throw new Error(`Claude Code's reply had no ${what}. It may need updating.`);
	return value;
}

// ---------------------------------------------------------------------------
// /context  (get_context_usage)
// ---------------------------------------------------------------------------

/**
 * A `get_context_usage` category's kind: the reply's own, else what the name
 * says, since older CLIs send no `kind` ("free" for free space, "buffer" for
 * the autocompact buffer).
 */
export function contextCategoryKind(kind: string, name: string): string {
	if (kind) return kind;
	if (/^free space$/i.test(name)) return "free";
	return /autocompact buffer/i.test(name) ? "buffer" : "";
}

/** The boards' color per category name: `cat-1`…`cat-5` in the boards' order, `cat-6` for any other. */
const CATEGORY_COLORS: Readonly<Record<string, number>> = {
	"system prompt": 1,
	"system tools": 2,
	"mcp tools": 3,
	"memory files": 4,
	messages: 5,
};

/** A context category's color, 1 to 6, by its name (a deferred one's as its loaded one's), not its place. */
export function contextCategoryColor(name: string): number {
	return CATEGORY_COLORS[name.replace(/\s*\(deferred\)\s*$/i, "").trim().toLowerCase()] ?? 6;
}

export function contextReport(raw: unknown): CommandReport {
	const reply = asJsonObject(raw);
	const total = required(count(reply.totalTokens), "token total");
	const max = required(count(reply.maxTokens), "context size");
	const percent = count(reply.percentage) ?? Math.round((total / Math.max(1, max)) * 100);
	const model = text(reply.model);
	const categories = list(reply.categories)
		.map((c) => {
			const name = text(c.name);
			const kind = contextCategoryKind(text(c.kind), name);
			return {
				name,
				tokens: count(c.tokens) ?? 0,
				kind,
				deferred: c.isDeferred === true || kind === "deferred" || /\(deferred\)/i.test(name),
			};
		})
		.filter((c) => c.name);

	const free = categories.filter((c) => c.kind === "free");
	const report: CommandReport = {
		title: reportTitle("context"),
		lead: `${model ? `${model} · ` : ""}${formatTokens(total)} of ${formatTokens(max)} tokens (${percent}%)`,
		cardLead: model ? (describeModelId(model)?.label ?? model) : "",
		figure: { value: formatTokens(total), caption: `of ${formatTokens(max).replace(/\.0+(?=[kM]$)/, "")} tokens`, aside: `${percent}%` },
		meter: {
			max,
			...(free.length ? { free: free.reduce((sum, c) => sum + c.tokens, 0) } : {}),
			// Deferred tools are not in the window yet; free space is the remainder.
			segments: categories
				.filter((c) => !c.deferred && c.kind !== "free" && c.tokens > 0)
				.map((c) => ({ label: c.name, tokens: c.tokens, reserved: c.kind === "buffer" })),
		},
		sections: [
			{
				// The card's legend lists these.
				recordOnly: true,
				columns: ["Category", "Tokens", "Share"],
				rows: categories
					.filter((c) => c.tokens > 0)
					.map((c) => ({
						cells: [
							c.deferred && !/\(deferred\)/i.test(c.name) ? `${c.name} (deferred)` : c.name,
							formatTokens(c.tokens),
							`${((c.tokens / Math.max(1, max)) * 100).toFixed(1)}%`,
						],
					})),
			},
		],
		notes: [],
	};

	const memory = list(reply.memoryFiles);
	if (memory.length)
		report.sections.push({
			heading: "Memory files",
			collapsed: true,
			columns: ["Type", "File", "Tokens"],
			rows: memory.map((f) => ({
				cells: [text(f.type), text(f.path), formatTokens(count(f.tokens) ?? 0)],
			})),
		});

	// One row per server: a tool list can run to hundreds of entries.
	const servers = new Map<string, { tools: number; loaded: number; tokens: number }>();
	for (const tool of list(reply.mcpTools)) {
		const name = text(tool.serverName) || "(unknown)";
		const entry = servers.get(name) ?? { tools: 0, loaded: 0, tokens: 0 };
		entry.tools++;
		if (tool.isLoaded !== false) {
			entry.loaded++;
			entry.tokens += count(tool.tokens) ?? 0;
		}
		servers.set(name, entry);
	}
	if (servers.size)
		report.sections.push({
			heading: "MCP tools",
			collapsed: true,
			columns: ["Server", "Tools loaded", "Tokens"],
			rows: [...servers].map(([name, s]) => ({
				cells: [name, `${s.loaded} of ${s.tools}`, formatTokens(s.tokens)],
			})),
		});

	const agents = list(reply.agents);
	if (agents.length)
		report.sections.push({
			heading: "Custom agents",
			collapsed: true,
			columns: ["Agent", "Source", "Tokens"],
			rows: agents.map((a) => ({
				cells: [text(a.agentType), text(a.source), formatTokens(count(a.tokens) ?? 0)],
			})),
		});

	const skills = asJsonObject(reply.skills);
	const commands = asJsonObject(reply.slashCommands);
	const also: ReportRow[] = [];
	if (count(skills.tokens) !== null)
		also.push({
			cells: [
				"Skills",
				`${plural(count(skills.includedSkills) ?? 0, "skill")}, ${formatTokens(count(skills.tokens) ?? 0)} tokens (/skills lists them)`,
			],
		});
	if (count(commands.tokens) !== null)
		also.push({
			cells: [
				"Slash commands",
				`${plural(count(commands.includedCommands) ?? 0, "command")}, ${formatTokens(count(commands.tokens) ?? 0)} tokens`,
			],
		});
	if (also.length) report.sections.push({ heading: "Listed to Claude", collapsed: true, rows: also });

	const threshold = count(reply.autoCompactThreshold);
	if (reply.isAutoCompactEnabled === true && threshold !== null) {
		const note = `Auto-compacts at ${shortTokens(threshold)} tokens`;
		report.notes?.push(`${note}.`);
		report.recordNotes = [...(report.notes ?? []).slice(0, -1), `${note}; /compact does it now.`];
	}
	else if (reply.isAutoCompactEnabled === false)
		report.notes?.push("Auto-compact is off; /compact frees space by summarizing.");
	return report;
}

// ---------------------------------------------------------------------------
// /mcp  (mcp_status, mcp_reconnect, mcp_toggle)
// ---------------------------------------------------------------------------

/** In the lead's order; `rank` sorts the rows, most severe first (PRD-001.R21). */
const MCP_STATUS: Record<string, { label: string; status: ReportStatus; rank: number }> = {
	connected: { label: "connected", status: "ok", rank: 3 },
	pending: { label: "connecting", status: "warn", rank: 2 },
	"needs-auth": { label: "needs sign-in", status: "warn", rank: 1 },
	failed: { label: "failed", status: "error", rank: 0 },
	disabled: { label: "disabled", status: "off", rank: 4 },
};

interface McpServerInfo {
	name: string;
	status: string;
	error: string;
	transport: string;
	origin: string;
	tools: number | null;
}

function mcpServers(raw: unknown): McpServerInfo[] {
	const servers = asJsonObject(raw).mcpServers;
	if (!Array.isArray(servers)) required(null, "MCP server list");
	return list(servers)
		.map((s) => ({
			name: text(s.name),
			status: text(s.status),
			error: text(s.error),
			transport: text(asJsonObject(s.config).type) || "stdio",
			origin: text(s.source) || text(s.scope),
			tools: Array.isArray(s.tools) ? s.tools.length : null,
		}))
		.filter((s) => s.name);
}

export function mcpReport(raw: unknown): CommandReport {
	const servers = mcpServers(raw).sort(
		(a, b) =>
			(MCP_STATUS[a.status]?.rank ?? 9) - (MCP_STATUS[b.status]?.rank ?? 9) ||
			a.name.localeCompare(b.name)
	);
	const tally = new Map<string, number>(Object.values(MCP_STATUS).map(({ label }) => [label, 0]));
	for (const s of servers) {
		const label = MCP_STATUS[s.status]?.label ?? s.status;
		tally.set(label, (tally.get(label) ?? 0) + 1);
	}
	const counted = (label: string, n: number) =>
		`${n} ${n === 1 ? label : label.replace(/^needs /, "need ")}`;
	const report: CommandReport = {
		title: reportTitle("mcp"),
		lead: servers.length
			? `${plural(servers.length, "server")}: ${[...tally]
					.filter(([, n]) => n > 0)
					.map(([label, n]) => counted(label, n))
					.join(", ")}`
			: undefined,
		sections: [
			{
				columns: ["Server", "Status", "Transport", "From", "Tools"],
				list: "servers",
				empty: "No MCP servers configured.",
				rows: servers.map((s) => {
					const known = MCP_STATUS[s.status];
					// The panel's in-process server is switched in its settings.
					const own = s.transport === "sdk";
					const actions: ReportAction[] =
						own
							? []
							: s.status === "disabled"
								? [{ label: "Enable", request: { subtype: "mcp_toggle", serverName: s.name, enabled: true } }]
								: [
										{ label: "Reconnect", request: { subtype: "mcp_reconnect", serverName: s.name } },
										{ label: "Disable", request: { subtype: "mcp_toggle", serverName: s.name, enabled: false } },
									];
					return {
						cells: [
							s.name,
							(known?.label ?? s.status) + (s.error ? ` - ${s.error}` : ""),
							s.transport,
							s.origin,
							s.tools === null ? "" : String(s.tools),
						],
						status: known?.status,
						actions,
						...(s.error ? { detail: s.error } : {}),
						pill: known?.label ?? s.status,
						server: {
							meta: [
								s.transport,
								own ? "" : s.origin,
								s.tools === null ? "" : plural(s.tools, "tool"),
								own ? "on/off in Settings → AI Agent Panel" : "",
							]
								.filter(Boolean)
								.join(" · "),
							own,
						},
					};
				}),
			},
		],
		notes: [],
	};
	if (servers.some((s) => s.status === "needs-auth"))
		report.notes?.push(
			"Servers that need sign-in authenticate in a terminal: run claude there and use /mcp."
		);
	return report;
}

/**
 * The control requests behind `/mcp reconnect|enable|disable <server>|all`,
 * resolved against the current server list.
 */
export function mcpActionRequests(
	args: string,
	statusRaw: unknown
): { requests: ControlRequest[] } | { error: string } {
	const [verb = "", ...rest] = args.split(/\s+/);
	const target = rest.join(" ");
	const action = verb.toLowerCase();
	if (!["reconnect", "enable", "disable"].includes(action) || !target)
		return { error: "Usage: /mcp [reconnect|enable|disable <server>|all]" };
	const servers = mcpServers(statusRaw);
	let names: string[];
	if (target.toLowerCase() === "all") {
		names = servers
			.filter((s) => s.transport !== "sdk")
			.filter((s) => (action === "enable" ? s.status === "disabled" : s.status !== "disabled"))
			.map((s) => s.name);
	} else {
		const match = servers.find((s) => s.name === target) ?? servers.find((s) => s.name.toLowerCase() === target.toLowerCase());
		if (!match) return { error: `No MCP server named "${target}".` };
		if (match.transport === "sdk")
			return { error: `"${match.name}" is the panel's own server; turn it on or off in Settings → AI Agent Panel.` };
		names = [match.name];
	}
	return {
		requests: names.map((serverName) =>
			action === "reconnect"
				? { subtype: "mcp_reconnect", serverName }
				: { subtype: "mcp_toggle", serverName, enabled: action === "enable" }
		),
	};
}

// ---------------------------------------------------------------------------
// /cost  (get_session_cost, plus the panel's own totals)
// ---------------------------------------------------------------------------

export interface ConversationTotals {
	turns: number;
	inputTokens: number;
	outputTokens: number;
	cacheWriteTokens: number;
	cacheReadTokens: number;
}

/** What `conversationCost` reads of a stored message; a `meta` record carries the cost. */
export interface CostRecord {
	kind: string;
	costUsd?: unknown;
	sessionId?: unknown;
}

/**
 * A conversation's cost: for each Claude Code session id, the latest
 * `total_cost_usd` its turns reported, summed. A session's total already
 * carries over a respawn or a resume, so a second id appears only when a
 * resume fails and the CLI starts a new session (a branch is a new
 * conversation). Records without a session id predate the turn record (0.5.0
 * and earlier); they belong to the first later session if it opens at or
 * above their latest total, since a resumed session's total never drops, and
 * otherwise count as a session of their own; no later session takes them over.
 * A branch's fork session carries its source's total, so its `forkBase` comes
 * off that session's share (PRD-005.R7). The one place this is computed: the
 * composer, `/cost` and the exporter all call it.
 */
export function conversationCost(messages: readonly CostRecord[], forkBase?: ForkBase): number {
	const latest = new Map<string, number>();
	let legacy: number | null = null;
	let legacyDecided = false;
	let legacyJoined = false;
	for (const message of messages) {
		if (message.kind !== "meta") continue;
		const cost = message.costUsd;
		if (typeof cost !== "number" || !Number.isFinite(cost)) continue;
		const id = typeof message.sessionId === "string" ? message.sessionId : "";
		if (id === "") {
			legacy = cost;
			continue;
		}
		if (!legacyDecided && legacy !== null && !latest.has(id)) {
			legacyDecided = true;
			legacyJoined = cost >= legacy;
		}
		latest.set(id, cost);
	}
	const target = forkTarget(messages, forkBase);
	if (forkBase && target !== null) latest.set(target, Math.max(0, (latest.get(target) ?? 0) - forkBase.costUsd));
	let total = legacy !== null && !legacyJoined ? legacy : 0;
	for (const cost of latest.values()) total += cost;
	return total;
}

/** A /cost token row: "1.2k tokens" in the Markdown; on the card a tile "1.2k" labelled "Input tokens". */
function tokenTile(label: string, tokens: number): ReportRow {
	const value = formatTokens(tokens);
	return { cells: [label, `${value} tokens`], tile: { value, label: `${label} tokens` } };
}

/**
 * `costUsd` is the conversation's cost; `cliText` is get_session_cost's text
 * for the running CLI, or null when none runs; `costNote` is a branch's note
 * on what its cost includes (`state/fork-base`).
 */
export function costReport(
	totals: ConversationTotals,
	costUsd: number,
	cliText: string | null,
	costNote: string | null = null
): CommandReport {
	const report: CommandReport = {
		title: reportTitle("cost"),
		sections: [
			{
				// The panel counts from when the conversation was opened here.
				heading: "This conversation, since opened",
				list: "tiles",
				rows: [
					{ cells: ["Turns", String(totals.turns)], tile: { value: String(totals.turns), label: "Turns" } },
					tokenTile("Input", totals.inputTokens),
					tokenTile("Output", totals.outputTokens),
					tokenTile("Cache written", totals.cacheWriteTokens),
					tokenTile("Cache read", totals.cacheReadTokens),
				],
			},
			{
				// From the saved turns, so it also covers the time before this tab opened it.
				heading: "This conversation, all turns",
				list: "figure",
				rows: [{ cells: ["Cost", `$${costUsd.toFixed(4)}`] }],
			},
		],
		notes: [
			"Costs are API prices. On a Claude subscription they come out of your plan's limits instead - /usage shows those.",
			...(costNote === null ? [] : [costNote]),
		],
	};
	const rows = (cliText ?? "")
		.split("\n")
		.map((line) => /^\s*([^:]+?):\s+(.*\S)\s*$/.exec(line))
		.filter((m): m is RegExpExecArray => m !== null)
		.map((m) => ({ cells: [m[1], m[2]] }));
	// The CLI counts from its own start; the panel restarts it on some setting changes.
	if (rows.length) report.sections.push({ heading: "Claude Code, since it last started", rows });
	return report;
}

// ---------------------------------------------------------------------------
// /status  (get_status)
// ---------------------------------------------------------------------------

/** Rows the CLI reports that mean nothing in the panel. */
const STATUS_SKIP = new Set(["Peer address", "Session kind"]);

/** The CLI's hint points at its own TUI's /mcp; here /mcp is the panel's, a click away (PRD-001.R20). */
const MCP_HINT = /\s*·\s*\/mcp$/;

function statusRow(label: string, value: string): ReportRow {
	if (!MCP_HINT.test(value)) return { cells: [label, value] };
	return { cells: [label, value.replace(MCP_HINT, "")], actions: [{ label: "open /mcp", command: "mcp" }] };
}

export function statusReport(raw: unknown, panelRows: Array<[string, string]>): CommandReport {
	const sections = asJsonObject(raw).sections;
	if (!Array.isArray(sections)) required(null, "status sections");
	return {
		title: reportTitle("status"),
		sections: [
			{ heading: "Panel", rows: panelRows.map((cells) => ({ cells })) },
			...list(sections).map((s) => ({
				heading: text(s.title) || undefined,
				rows: list(s.rows)
					.map((r) => [text(r.label), text(r.value)])
					.filter(([label]) => label && !STATUS_SKIP.has(label))
					.map(([label, value]) => statusRow(label, value)),
			})),
		],
	};
}

// ---------------------------------------------------------------------------
// /memory  (get_memory_dialog)
// ---------------------------------------------------------------------------

export function memoryReport(raw: unknown): CommandReport {
	const reply = asJsonObject(raw);
	if (!Array.isArray(reply.files)) required(null, "memory file list");
	const auto = asJsonObject(reply.auto_memory);
	const autoStatus = text(auto.status);
	const folder = list(reply.folders).find((f) => f.kind === "auto");
	const report: CommandReport = {
		title: reportTitle("memory"),
		sections: [
			{
				heading: "Instruction files",
				columns: ["File", "Path", "Exists"],
				list: "files",
				rows: list(reply.files).map((f) => ({
					cells: [text(f.label), text(f.path), f.exists === true ? "yes" : "not created"],
					status: f.exists === true ? "ok" : "off",
					pill: f.exists === true ? "exists" : "not created",
				})),
			},
		],
		notes: ["Edit these files directly; Claude Code reads them when a session starts."],
	};
	if (autoStatus || folder) {
		report.sections.push({
			heading: `Auto memory${autoStatus ? ` (${autoStatus})` : ""}`,
			...(autoStatus ? { headingPill: autoStatus === "on" ? ("ok" as const) : ("off" as const) } : {}),
			columns: ["Memory", "Description"],
			list: "memories",
			empty: folder ? `Nothing saved yet in ${text(folder.path)}` : "Nothing saved yet.",
			rows: list(reply.memories).map((m) => ({ cells: [text(m.name), text(m.description)] })),
		});
	}
	return report;
}

// ---------------------------------------------------------------------------
// /hooks  (get_hooks_listing)
// ---------------------------------------------------------------------------

export function hooksReport(raw: unknown): CommandReport {
	const hooks = asJsonObject(raw).hooks;
	if (!Array.isArray(hooks)) required(null, "hook list");
	return {
		title: reportTitle("hooks"),
		sections: [
			{
				columns: ["Event", "Matcher", "Runs", "Defined in"],
				list: "hooks",
				empty: "No hooks configured.",
				rows: list(hooks).map((h) => ({
					cells: [
						text(h.event),
						text(h.matcher) || "*",
						text(h.displayText) || text(h.commandText) || text(h.type),
						text(h.sourceLabel) || text(h.source),
					],
				})),
			},
		],
		notes: ["Hooks live in your Claude Code settings files; edit them there."],
	};
}

// ---------------------------------------------------------------------------
// /permissions  (list_permission_rules)
// ---------------------------------------------------------------------------

const RULE_SOURCES: Record<string, string> = {
	userSettings: "User settings",
	projectSettings: "Project settings",
	localSettings: "Local project settings",
	policySettings: "Managed policy",
	flagSettings: "--settings",
	cliArg: "Command line",
	command: "Command",
	session: "This session",
};

export function permissionsReport(raw: unknown): CommandReport {
	const state = asJsonObject(asJsonObject(raw).state);
	if (!Array.isArray(state.rules)) required(null, "permission rules");
	const rules = list(state.rules);
	const section = (behavior: string, heading: string, marker: ReportStatus): ReportSection => ({
		heading,
		columns: ["Rule", "From"],
		list: "rules",
		marker,
		empty: "None.",
		rows: rules
			.filter((r) => r.behavior === behavior)
			.map((r) => ({ cells: [text(r.rule), RULE_SOURCES[text(r.source)] ?? text(r.source)] })),
	});
	const report: CommandReport = {
		title: reportTitle("permissions"),
		sections: [
			section("allow", "Allow", "ok"),
			section("ask", "Ask", "warn"),
			section("deny", "Deny", "error"),
		],
		notes: [],
	};
	const extra = (Array.isArray(state.workspaceDirectories) ? state.workspaceDirectories : [])
		.map((d) => (typeof d === "string" ? d : text(asJsonObject(d).path)))
		.filter(Boolean);
	if (extra.length)
		report.sections.push({
			heading: "Additional directories",
			columns: ["Directory"],
			list: "rules",
			rows: extra.map((d) => ({ cells: [d] })),
		});
	if (state.managedOnly === true)
		report.notes?.push("Only managed-policy rules apply on this machine.");
	report.notes?.push("Approving a prompt with \"Always allow\" adds an allow rule.");
	return report;
}

// ---------------------------------------------------------------------------
// /skills  (get_skills_dialog)
// ---------------------------------------------------------------------------

const SKILL_STATES: Record<string, string> = {
	on: "on",
	off: "off",
	"user-invocable-only": "only when you invoke it",
};

export function skillsReport(raw: unknown): CommandReport {
	const skills = asJsonObject(raw).skills;
	if (!Array.isArray(skills)) required(null, "skill list");
	const rows = list(skills).map((s) => ({
		name: text(s.name),
		source: text(s.source),
		tokens: count(s.tokens),
		state: text(s.state),
	}));
	const listed = rows.filter((s) => s.state === "on");
	const tokens = listed.reduce((sum, s) => sum + (s.tokens ?? 0), 0);
	return {
		title: reportTitle("skills"),
		lead: `${plural(rows.length, "skill")}; ${listed.length} listed to Claude, ~${formatTokens(tokens)} tokens of descriptions`,
		sections: [
			{
				columns: ["Skill", "Source", "Tokens", "State"],
				list: "skills",
				empty: "No skills installed.",
				rows: rows.map((s) => ({
					cells: [
						s.name,
						s.source,
						s.tokens === null ? "" : `~${s.tokens}`,
						SKILL_STATES[s.state] ?? s.state,
					],
					status: s.state === "on" ? "ok" : "off",
					...(s.state === "on" && s.tokens ? { tokens: s.tokens } : {}),
				})),
			},
		],
	};
}

// ---------------------------------------------------------------------------
// /chrome  (get_chrome_dialog)  and  /sandbox  (get_sandbox_dialog)
// ---------------------------------------------------------------------------

/** How the conversation's CLI profile sets an on/off launch option. */
export function profileToggleLabel(value: string): string {
	return value === "on" ? "on" : value === "off" ? "off" : "Claude Code default";
}

export function chromeReport(raw: unknown, profileSetting: string): CommandReport {
	const reply = asJsonObject(raw);
	if (typeof reply.installed !== "boolean") required(null, "Chrome status");
	const urls = asJsonObject(reply.urls);
	const report: CommandReport = {
		title: reportTitle("chrome"),
		sections: [
			{
				rows: [
					{ cells: ["Extension installed", yesNo(reply.installed)], ...dotFor(reply.installed, "warn") },
					{
						cells: ["Extension connected", yesNo(reply.connected)],
						...dotFor(reply.connected, reply.installed === true ? "warn" : "off"),
					},
					{ cells: ["On in this session", yesNo(reply.at_startup)], ...dotFor(reply.at_startup, "off") },
					{ cells: ["Claude Code default", reply.enabled_by_default === true ? "on" : "off"] },
					{ cells: ["Profile setting", profileToggleLabel(profileSetting)] },
				],
			},
		],
		notes: [],
		links: [],
	};
	if (reply.wsl === true)
		report.notes?.push("Claude Code does not support Claude in Chrome inside WSL.");
	if (reply.subscriber === false)
		report.notes?.push("Needs a claude.ai login (Pro, Max, Team or Enterprise).");
	if (reply.allowed === false)
		report.notes?.push("Not available for this account or organization.");
	report.notes?.push("Turn it on or off per CLI profile in Settings → AI Agent Panel.");
	const link = (label: string, href: unknown, button: "primary" | "secondary") => {
		if (typeof href === "string" && isWebLink(href)) report.links?.push({ label, href, button });
	};
	if (reply.installed !== true) link("Install the extension", urls.install, "primary");
	else if (reply.connected !== true) link("Reconnect the extension", urls.reconnect, "primary");
	link("Site permissions", urls.permissions, "secondary");
	return report;
}

/** A yes/no row's dot (card only): ok for yes, `no` for no, none when the reply did not say. */
function dotFor(value: unknown, no: ReportStatus): { status?: ReportStatus } {
	return value === true ? { status: "ok" } : value === false ? { status: no } : {};
}

const RESTRICTIONS: Array<[string, string]> = [
	["fs_allow_write", "Writable paths"],
	["fs_deny_write", "Write-protected paths"],
	["fs_allow_read", "Readable paths"],
	["fs_deny_read", "Read-protected paths"],
	["network_allowed_domains", "Allowed domains"],
	["network_denied_domains", "Blocked domains"],
	["unix_sockets", "Unix sockets"],
];

export function sandboxReport(
	raw: unknown,
	profileSetting: string,
	offeredByProfile: boolean
): CommandReport {
	const reply = asJsonObject(raw);
	if (typeof reply.supported !== "boolean") required(null, "sandbox status");
	const mode = text(reply.mode);
	const report: CommandReport = {
		title: reportTitle("sandbox"),
		sections: [
			{
				rows: [
					{ cells: ["Supported here", yesNo(reply.supported)], ...dotFor(reply.supported, "warn") },
					{
						cells: ["On in this session", `${yesNo(reply.enabled)}${mode ? ` (${mode})` : ""}`],
						...dotFor(reply.enabled, "off"),
					},
					{ cells: ["Claude Code settings", reply.enabled_in_settings === true ? "on" : "off"] },
					{
						cells: [
							"Profile setting",
							offeredByProfile ? profileToggleLabel(profileSetting) : "not offered on native Windows",
						],
					},
				],
			},
		],
		notes: [],
	};
	const restrictions = asJsonObject(reply.restrictions);
	const rows: ReportRow[] = [];
	for (const [key, label] of RESTRICTIONS) {
		const values = Array.isArray(restrictions[key])
			? (restrictions[key] as unknown[]).filter((v): v is string => typeof v === "string")
			: [];
		if (values.length) rows.push({ cells: [label, values.join(", ")] });
	}
	if (rows.length) report.sections.push({ heading: "Restrictions", rows });
	const deps = asJsonObject(reply.dependencies);
	for (const error of Array.isArray(deps.errors) ? deps.errors : [])
		if (typeof error === "string") report.notes?.push(`Missing: ${error}`);
	for (const warning of Array.isArray(deps.warnings) ? deps.warnings : [])
		if (typeof warning === "string") report.notes?.push(warning);
	if (offeredByProfile)
		report.notes?.push("Turn it on or off per CLI profile in Settings → AI Agent Panel.");
	return report;
}

// ---------------------------------------------------------------------------
// /help
// ---------------------------------------------------------------------------

/** Claude Code's commands /help shows before "Show all N" (PRD-001.R20). */
const HELP_CLI_SHOWN = 3;

/** The groups a /help card shows the panel's commands in, each in this order (card only; the Markdown lists them by name). */
export const HELP_GROUPS: ReadonlyArray<{ label: string; names: readonly string[] }> = [
	{ label: "Usage & cost", names: ["usage", "usage-credits", "extra-usage", "cost", "context"] },
	{ label: "Setup", names: ["status", "mcp", "memory", "permissions", "hooks", "skills", "chrome", "sandbox"] },
	{ label: "Conversation", names: ["clear", "help"] },
];

/** `cliCommands` is what the CLI's initialize reply listed, or null before any session. */
export function helpReport(cliCommands: readonly SlashCommand[] | null, shellEscape: boolean): CommandReport {
	const panel = new Set(PANEL_COMMANDS.map((cmd) => cmd.name));
	const report: CommandReport = {
		title: reportTitle("help"),
		sections: [
			{
				heading: "Answered by the panel",
				badge: "no tokens",
				columns: ["Command", "What it does"],
				list: "commands",
				fold: PANEL_COMMANDS.length,
				rows: PANEL_COMMANDS.map((cmd) => ({
					cells: [`/${cmd.name}${cmd.argumentHint ? ` ${cmd.argumentHint}` : ""}`, cmd.description],
					insert: cmd.name,
					command: { name: `/${cmd.name}`, hint: cmd.argumentHint ?? "" },
				})),
			},
		],
		notes: [
			`Anything else starting with / goes to Claude Code.${shellEscape ? " ! runs a shell command." : ""}`,
		],
	};
	if (cliCommands)
		report.sections.push({
			heading: "Claude Code commands and skills",
			columns: ["Command", "What it does"],
			list: "commands",
			fold: HELP_CLI_SHOWN,
			rows: cliCommands
				.filter((cmd) => !panel.has(cmd.name))
				.map((cmd) => ({
					cells: [`/${cmd.name}`, firstSentence(cmd.description ?? "")],
					insert: cmd.name,
					command: { name: `/${cmd.name}`, hint: cmd.argumentHint ?? "" },
				})),
		});
	else report.notes?.unshift("Claude Code's own commands are listed once a conversation has started.");
	return report;
}

function firstSentence(description: string): string {
	const sentence = /^(.{20,}?[.!?])\s/.exec(description)?.[1] ?? description;
	return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
}

/** The initialize reply's command list, reduced to what autocomplete and /help show. */
export function parseCliCommands(raw: unknown): SlashCommand[] | null {
	if (!Array.isArray(raw)) return null;
	const commands = list(raw)
		.filter((c) => text(c.name))
		.map((c) => ({
			name: text(c.name),
			description: text(c.description) || undefined,
			argumentHint: text(c.argumentHint) || undefined,
		}));
	return commands.length ? commands : null;
}
