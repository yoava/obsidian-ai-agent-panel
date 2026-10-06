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

export interface PanelCommand {
	name: string;
	description: string;
	argumentHint?: string;
}

/** Commands answered here (or by the usage service); they never reach the model. */
export const PANEL_COMMANDS: readonly PanelCommand[] = [
	{ name: "chrome", description: "Show Claude in Chrome status" },
	{ name: "context", description: "Show what is using the context window" },
	{ name: "cost", description: "Show this conversation's token use and cost" },
	{ name: "extra-usage", description: "Show extra-usage credit status" },
	{ name: "help", description: "List the commands available here" },
	{ name: "hooks", description: "List the hooks Claude Code runs" },
	{
		name: "mcp",
		description: "Show MCP servers; reconnect, enable or disable one",
		argumentHint: "[reconnect|enable|disable <server>|all]",
	},
	{ name: "memory", description: "Show the instruction and memory files Claude Code loads" },
	{ name: "permissions", description: "List the allow, ask and deny rules in effect" },
	{ name: "sandbox", description: "Show Bash sandbox status" },
	{ name: "skills", description: "List skills and their context cost" },
	{ name: "status", description: "Show version, account, model and MCP status" },
	{ name: "usage", description: "Show plan usage limits" },
	{ name: "usage-credits", description: "Show extra-usage credit status" },
];

/** A message that is one of PANEL_COMMANDS, split into name and arguments. */
export function parsePanelCommand(text: string): { name: string; args: string } | null {
	const match = /^\/([\w:-]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
	if (!match) return null;
	const name = match[1].toLowerCase();
	if (!PANEL_COMMANDS.some((cmd) => cmd.name === name)) return null;
	return { name, args: (match[2] ?? "").trim() };
}

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------

export type ReportStatus = "ok" | "warn" | "error" | "off";

export interface ControlRequest {
	subtype: string;
	[key: string]: unknown;
}

export interface ReportAction {
	label: string;
	/** Sent when the button is clicked; the card then refreshes. */
	request: ControlRequest;
}

export interface ReportRow {
	cells: string[];
	/** Marks the row with a coloured dot. */
	status?: ReportStatus;
	/** Buttons, offered while the card is live (not on a restored transcript). */
	actions?: ReportAction[];
}

export interface ReportSection {
	heading?: string;
	/** Table header. Without one the rows are label/value pairs. */
	columns?: string[];
	rows: ReportRow[];
	/** Said instead of an empty table. */
	empty?: string;
}

export interface CommandReport {
	title: string;
	/** One line under the title. */
	lead?: string;
	/** Context-window occupancy as a stacked bar. */
	meter?: { max: number; segments: Array<{ label: string; tokens: number; reserved?: boolean }> };
	sections: ReportSection[];
	notes?: string[];
	links?: Array<{ label: string; href: string }>;
}

/** The report as Markdown: what the transcript records, exports and copies. */
export function reportMarkdown(report: CommandReport): string {
	const out = [`**${escapeMarkdown(report.title)}**`];
	if (report.lead) out.push(escapeMarkdown(report.lead));
	for (const section of report.sections) {
		if (section.heading) out.push(`**${escapeMarkdown(section.heading)}**`);
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
	for (const note of report.notes ?? []) out.push(escapeMarkdown(note));
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

/** "12.1k" / "1.2M" - compact enough for a one-line meter. */
export function formatTokens(tokens: number): string {
	if (tokens < 1000) return String(tokens);
	if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
	return `${(tokens / 1_000_000).toFixed(2)}M`;
}

// ---------------------------------------------------------------------------
// Reply readers
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function rec(value: unknown): Json {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Json)
		: {};
}

function list(value: unknown): Json[] {
	return Array.isArray(value) ? value.map(rec) : [];
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

export function contextReport(raw: unknown): CommandReport {
	const reply = rec(raw);
	const total = required(count(reply.totalTokens), "token total");
	const max = required(count(reply.maxTokens), "context size");
	const percent = count(reply.percentage) ?? Math.round((total / Math.max(1, max)) * 100);
	const model = text(reply.model);
	const categories = list(reply.categories)
		.map((c) => {
			const name = text(c.name);
			// Older CLIs send no `kind`; their names say the same.
			const kind =
				text(c.kind) ||
				(/^free space$/i.test(name) ? "free" : /autocompact buffer/i.test(name) ? "buffer" : "");
			return {
				name,
				tokens: count(c.tokens) ?? 0,
				kind,
				deferred: c.isDeferred === true || kind === "deferred" || /\(deferred\)/i.test(name),
			};
		})
		.filter((c) => c.name);

	const report: CommandReport = {
		title: "Context usage",
		lead: `${model ? `${model} · ` : ""}${formatTokens(total)} of ${formatTokens(max)} tokens (${percent}%)`,
		meter: {
			max,
			// Deferred tools are not in the window yet; free space is the remainder.
			segments: categories
				.filter((c) => !c.deferred && c.kind !== "free" && c.tokens > 0)
				.map((c) => ({ label: c.name, tokens: c.tokens, reserved: c.kind === "buffer" })),
		},
		sections: [
			{
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
			columns: ["Server", "Tools loaded", "Tokens"],
			rows: [...servers].map(([name, s]) => ({
				cells: [name, `${s.loaded} of ${s.tools}`, formatTokens(s.tokens)],
			})),
		});

	const agents = list(reply.agents);
	if (agents.length)
		report.sections.push({
			heading: "Custom agents",
			columns: ["Agent", "Source", "Tokens"],
			rows: agents.map((a) => ({
				cells: [text(a.agentType), text(a.source), formatTokens(count(a.tokens) ?? 0)],
			})),
		});

	const skills = rec(reply.skills);
	const commands = rec(reply.slashCommands);
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
	if (also.length) report.sections.push({ heading: "Listed to Claude", rows: also });

	const threshold = count(reply.autoCompactThreshold);
	if (reply.isAutoCompactEnabled === true && threshold !== null)
		report.notes?.push(`Auto-compacts at ${formatTokens(threshold)} tokens; /compact does it now.`);
	else if (reply.isAutoCompactEnabled === false)
		report.notes?.push("Auto-compact is off; /compact frees space by summarizing.");
	return report;
}

// ---------------------------------------------------------------------------
// /mcp  (mcp_status, mcp_reconnect, mcp_toggle)
// ---------------------------------------------------------------------------

const MCP_STATUS: Record<string, { label: string; status: ReportStatus; rank: number }> = {
	connected: { label: "connected", status: "ok", rank: 0 },
	pending: { label: "connecting", status: "warn", rank: 1 },
	"needs-auth": { label: "needs sign-in", status: "warn", rank: 2 },
	failed: { label: "failed", status: "error", rank: 3 },
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
	const servers = rec(raw).mcpServers;
	if (!Array.isArray(servers)) required(null, "MCP server list");
	return list(servers)
		.map((s) => ({
			name: text(s.name),
			status: text(s.status),
			error: text(s.error),
			transport: text(rec(s.config).type) || "stdio",
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
	const tally = new Map<string, number>();
	for (const s of servers) {
		const label = MCP_STATUS[s.status]?.label ?? s.status;
		tally.set(label, (tally.get(label) ?? 0) + 1);
	}
	const counted = (label: string, n: number) =>
		`${n} ${n === 1 ? label : label.replace(/^needs /, "need ")}`;
	const report: CommandReport = {
		title: "MCP servers",
		lead: servers.length
			? `${plural(servers.length, "server")}: ${[...tally].map(([label, n]) => counted(label, n)).join(", ")}`
			: undefined,
		sections: [
			{
				columns: ["Server", "Status", "Transport", "From", "Tools"],
				empty: "No MCP servers configured.",
				rows: servers.map((s) => {
					const known = MCP_STATUS[s.status];
					// The panel's in-process server is switched in its settings.
					const actions: ReportAction[] =
						s.transport === "sdk"
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
	costUsd: number;
}

/** `cliText` is get_session_cost's text for the running CLI, or null when none runs. */
export function costReport(totals: ConversationTotals, cliText: string | null): CommandReport {
	const report: CommandReport = {
		title: "Cost",
		sections: [
			{
				// The panel counts from when the conversation was opened here.
				heading: "This conversation, since opened",
				rows: [
					{ cells: ["Turns", String(totals.turns)] },
					{ cells: ["Input", `${formatTokens(totals.inputTokens)} tokens`] },
					{ cells: ["Output", `${formatTokens(totals.outputTokens)} tokens`] },
					{ cells: ["Cache written", `${formatTokens(totals.cacheWriteTokens)} tokens`] },
					{ cells: ["Cache read", `${formatTokens(totals.cacheReadTokens)} tokens`] },
					{ cells: ["Cost", `$${totals.costUsd.toFixed(4)}`] },
				],
			},
		],
		notes: [
			"Costs are API prices. On a Claude subscription they come out of your plan's limits instead - /usage shows those.",
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

export function statusReport(raw: unknown, panelRows: Array<[string, string]>): CommandReport {
	const sections = rec(raw).sections;
	if (!Array.isArray(sections)) required(null, "status sections");
	return {
		title: "Status",
		sections: [
			{ heading: "Panel", rows: panelRows.map((cells) => ({ cells })) },
			...list(sections).map((s) => ({
				heading: text(s.title) || undefined,
				rows: list(s.rows)
					.map((r) => [text(r.label), text(r.value)])
					.filter(([label]) => label && !STATUS_SKIP.has(label))
					// The CLI's hint points at its own TUI; here /mcp is ours.
					.map(([label, value]) => ({ cells: [label, value.replace(/\s*·\s*\/mcp$/, "")] })),
			})),
		],
	};
}

// ---------------------------------------------------------------------------
// /memory  (get_memory_dialog)
// ---------------------------------------------------------------------------

export function memoryReport(raw: unknown): CommandReport {
	const reply = rec(raw);
	if (!Array.isArray(reply.files)) required(null, "memory file list");
	const auto = rec(reply.auto_memory);
	const autoStatus = text(auto.status);
	const folder = list(reply.folders).find((f) => f.kind === "auto");
	const report: CommandReport = {
		title: "Memory",
		sections: [
			{
				heading: "Instruction files",
				columns: ["File", "Path", "Exists"],
				rows: list(reply.files).map((f) => ({
					cells: [text(f.label), text(f.path), f.exists === true ? "yes" : "not created"],
					status: f.exists === true ? "ok" : "off",
				})),
			},
		],
		notes: ["Edit these files directly; Claude Code reads them when a session starts."],
	};
	if (autoStatus || folder) {
		report.sections.push({
			heading: `Auto memory${autoStatus ? ` (${autoStatus})` : ""}`,
			columns: ["Memory", "Description"],
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
	const hooks = rec(raw).hooks;
	if (!Array.isArray(hooks)) required(null, "hook list");
	return {
		title: "Hooks",
		sections: [
			{
				columns: ["Event", "Matcher", "Runs", "Defined in"],
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
	const state = rec(rec(raw).state);
	if (!Array.isArray(state.rules)) required(null, "permission rules");
	const rules = list(state.rules);
	const section = (behavior: string, heading: string): ReportSection => ({
		heading,
		columns: ["Rule", "From"],
		empty: "None.",
		rows: rules
			.filter((r) => r.behavior === behavior)
			.map((r) => ({ cells: [text(r.rule), RULE_SOURCES[text(r.source)] ?? text(r.source)] })),
	});
	const report: CommandReport = {
		title: "Permission rules",
		sections: [
			section("allow", "Allow"),
			section("ask", "Ask"),
			section("deny", "Deny"),
		],
		notes: [],
	};
	const extra = (Array.isArray(state.workspaceDirectories) ? state.workspaceDirectories : [])
		.map((d) => (typeof d === "string" ? d : text(rec(d).path)))
		.filter(Boolean);
	if (extra.length)
		report.sections.push({
			heading: "Additional directories",
			columns: ["Directory"],
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
	const skills = rec(raw).skills;
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
		title: "Skills",
		lead: `${plural(rows.length, "skill")}; ${listed.length} listed to Claude, ~${formatTokens(tokens)} tokens of descriptions`,
		sections: [
			{
				columns: ["Skill", "Source", "Tokens", "State"],
				empty: "No skills installed.",
				rows: rows.map((s) => ({
					cells: [
						s.name,
						s.source,
						s.tokens === null ? "" : `~${s.tokens}`,
						SKILL_STATES[s.state] ?? s.state,
					],
					status: s.state === "on" ? "ok" : "off",
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
	const reply = rec(raw);
	if (typeof reply.installed !== "boolean") required(null, "Chrome status");
	const urls = rec(reply.urls);
	const report: CommandReport = {
		title: "Claude in Chrome",
		sections: [
			{
				rows: [
					{ cells: ["Extension installed", yesNo(reply.installed)] },
					{ cells: ["Extension connected", yesNo(reply.connected)] },
					{ cells: ["On in this session", yesNo(reply.at_startup)] },
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
	const link = (label: string, href: unknown) => {
		if (typeof href === "string" && isWebLink(href)) report.links?.push({ label, href });
	};
	if (reply.installed !== true) link("Install the extension", urls.install);
	else if (reply.connected !== true) link("Reconnect the extension", urls.reconnect);
	link("Site permissions", urls.permissions);
	return report;
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
	const reply = rec(raw);
	if (typeof reply.supported !== "boolean") required(null, "sandbox status");
	const mode = text(reply.mode);
	const report: CommandReport = {
		title: "Sandbox",
		sections: [
			{
				rows: [
					{ cells: ["Supported here", yesNo(reply.supported)] },
					{ cells: ["On in this session", `${yesNo(reply.enabled)}${mode ? ` (${mode})` : ""}`] },
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
	const restrictions = rec(reply.restrictions);
	const rows: ReportRow[] = [];
	for (const [key, label] of RESTRICTIONS) {
		const values = Array.isArray(restrictions[key])
			? (restrictions[key] as unknown[]).filter((v): v is string => typeof v === "string")
			: [];
		if (values.length) rows.push({ cells: [label, values.join(", ")] });
	}
	if (rows.length) report.sections.push({ heading: "Restrictions", rows });
	const deps = rec(reply.dependencies);
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

/** `cliCommands` is what the CLI's initialize reply listed, or null before any session. */
export function helpReport(
	cliCommands: Array<{ name: string; description?: string }> | null,
	shellEscape: boolean
): CommandReport {
	const panel = new Set(PANEL_COMMANDS.map((cmd) => cmd.name));
	const report: CommandReport = {
		title: "Commands",
		sections: [
			{
				heading: "Answered by the panel - no tokens",
				columns: ["Command", "What it does"],
				rows: PANEL_COMMANDS.map((cmd) => ({
					cells: [`/${cmd.name}${cmd.argumentHint ? ` ${cmd.argumentHint}` : ""}`, cmd.description],
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
			rows: cliCommands
				.filter((cmd) => !panel.has(cmd.name))
				.map((cmd) => ({ cells: [`/${cmd.name}`, firstSentence(cmd.description ?? "")] })),
		});
	else report.notes?.unshift("Claude Code's own commands are listed once a conversation has started.");
	return report;
}

function firstSentence(description: string): string {
	const sentence = /^(.{20,}?[.!?])\s/.exec(description)?.[1] ?? description;
	return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence;
}

/** The initialize reply's command list, reduced to what autocomplete and /help show. */
export function parseCliCommands(
	raw: unknown
): Array<{ name: string; description?: string; argumentHint?: string }> | null {
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
