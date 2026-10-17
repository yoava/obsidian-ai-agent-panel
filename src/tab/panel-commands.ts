import { sandboxAvailable } from "../cli-args";
import { costNote } from "../state/fork-base";
import {
	chromeReport,
	contextReport,
	conversationCost,
	costReport,
	couldNotAnswer,
	DID_NOT_START,
	failureMarkdown,
	helpReport,
	hooksReport,
	mcpActionRequests,
	mcpReport,
	memoryReport,
	pendingMarkdown,
	permissionsReport,
	reportMarkdown,
	sandboxReport,
	skillsReport,
	statusReport,
	USAGE_COMMANDS,
	type CommandReport,
	type ControlRequest,
	type ReportAction,
	type SlashCommand,
} from "../commands";
import type { StoredConversation, StoredMessage } from "../history";
import { effortLabel } from "../models";
import type { ClaudeSession } from "../session";
import { defaultProfile, profileById, profileLabel, type AgentPanelSettings } from "../settings-core";
import type { NewPrompt } from "../state/tab";
import { creditsReport, usageReport, usageThresholds } from "../state/usage-segment";
import type { UsageSnapshot } from "../usage-core";
import type { ChatTab } from "./chat-tab";
import type { Recorder } from "./recorder";
import type { SessionLink } from "./session-link";

/** Report requests and row actions wait this long; connecting a server can take a while (DES-003 Panel commands). */
const REQUEST_TIMEOUT_MS = 60_000;

/** The usage service as the usage cards read it (DES-007). */
export interface UsageSource {
	refresh(force: boolean): Promise<UsageSnapshot | null>;
	readonly lastError: string | null;
}

/** What a tab's panel commands reach outside its state. */
export interface PanelCommandsHost {
	tab: ChatTab;
	link: SessionLink;
	recorder: Recorder;
	conversation: () => StoredConversation | null;
	/** The tab is still open. */
	open: () => boolean;
	settings: () => AgentPanelSettings;
	pluginVersion: string;
	/** Claude Code's commands as last reported, or null. */
	cliCommands: () => readonly SlashCommand[] | null;
	usage: UsageSource;
	/** The tab's permission mode as the status line names it in full. */
	modeLabel: () => string;
	queueSave: (conversation: StoredConversation) => void;
	/** Scroll-follow after a card changed. */
	follow: () => void;
	/** A Notice: a row action's failure (PRD-001.R21). */
	notify: (message: string) => void;
	/** A restore of this tab is between its preview and its end: nothing runs (PRD-002.R14). */
	restoring: () => boolean;
	/** A usage command starts (+1) or ends (-1): a reopen does not reuse a tab one runs in. */
	countRun: (delta: 1 | -1) => void;
}

/** A card this tab drew: its command, and where it was recorded. */
interface Card {
	command: string;
	/** The last attempt's arguments, which Try again repeats: as typed at first, none for Refresh and row actions. */
	args: string;
	/** The conversation it belongs to; a card whose conversation was deleted meanwhile is not saved. */
	conversation: StoredConversation | null;
	/** Its recorded `assistant` message, whose text follows the card; null when a turn ran as it started (PRD-001.R20). */
	stored: Extract<StoredMessage, { kind: "assistant" }> | null;
	/** A load is running; Refresh and row actions wait for it. */
	busy: boolean;
}

/**
 * One tab's panel commands (DES-003 Panel commands): the command as a
 * compact message and its card loading, the `CommandReport` built from the
 * CLI's read-only replies or the usage service, the card answered or failed,
 * and the command and `reportMarkdown` recorded unless a turn ran; Refresh,
 * Try again and the row actions re-run into the same card, replacing its
 * recorded Markdown. Nothing reaches the model.
 */
export class PanelCommands {
	private readonly cards = new Map<number, Card>();

	constructor(private readonly host: PanelCommandsHost) {}

	/** Step 4 of the send path, and "/usage in chat", "/context details" and "open /mcp". */
	run(text: string, name: string, args: string): void {
		const host = this.host;
		host.tab.addPrompt(compact(text));
		// Mid-turn, the turn's own text is recorded only when it finishes, so a
		// card recorded now would land out of order: it stays on screen only.
		let stored: Card["stored"] = null;
		if (!host.link.busy) {
			host.recorder.record({ kind: "user", text });
			// Recorded with its command, so a reply recorded while it loads cannot
			// take its place on reopen; its text follows the card.
			stored = { kind: "assistant", text: pendingMarkdown(name) };
			host.recorder.record(stored);
		}
		const item = host.tab.addReport(name);
		const card: Card = { command: name, args, conversation: host.conversation(), stored, busy: false };
		this.cards.set(item.id, card);
		void this.load(item.id, card, args);
	}

	/** Refresh and Try again: the command again, into the same card; Try again repeats the failed attempt's arguments. */
	refresh(id: number): void {
		const card = this.cards.get(id);
		if (!card || card.busy) return;
		const failed = this.host.tab.card(id, "report")?.state === "failed";
		void this.load(id, card, failed ? card.args : "");
	}

	/** A row's button: its request, then the list again (/mcp); or a panel command (/status's "open /mcp"). */
	act(id: number, action: ReportAction): void {
		if ("command" in action) {
			if (!this.host.restoring()) this.run(`/${action.command}`, action.command, "");
			return;
		}
		const card = this.cards.get(id);
		if (!card || card.busy) return;
		void this.load(id, card, "", action);
	}

	/** The card loading, then answered or failed; its recorded text follows, whether or not the tab is still open. */
	private async load(id: number, card: Card, args: string, action?: { label: string; request: ControlRequest }): Promise<void> {
		const host = this.host;
		const loading = host.tab.card(id, "report");
		if (!loading) return;
		card.busy = true;
		card.args = args;
		host.tab.updateItem({ ...loading, state: "loading", report: null, error: null });
		const usage = USAGE_COMMANDS.includes(card.command);
		if (usage) host.countRun(1);
		let report: CommandReport | null = null;
		let error = "";
		try {
			if (action) await this.perform(action);
			report = await this.build(card.command, args);
		} catch (err) {
			error = message(err);
		} finally {
			card.busy = false;
			if (usage) host.countRun(-1);
		}
		this.recordCard(card, report ? reportMarkdown(report) : failureMarkdown(card.command, error));
		const item = host.tab.card(id, "report");
		if (!item || !host.open()) return;
		host.tab.updateItem(
			report ? { ...item, state: "answered", report, error: null } : { ...item, state: "failed", report: null, error }
		);
		host.follow();
	}

	/** A row's request; its failure is said (PRD-001.R21) and the list still comes again. */
	private async perform(action: { label: string; request: ControlRequest }): Promise<void> {
		try {
			const session = await this.host.link.ensure();
			await session?.control(action.request, REQUEST_TIMEOUT_MS);
		} catch (err) {
			if (this.host.open()) this.host.notify(`${action.label} failed: ${message(err)}`);
		}
	}

	/** The recorded card's text follows the card: its answer, failure, or a re-run's (PRD-001.R20). */
	private recordCard(card: Card, markdown: string): void {
		if (!card.stored) return;
		card.stored.text = markdown;
		// Deleted from history meanwhile: saving would bring it back.
		if (card.conversation && this.host.conversation() === card.conversation) this.host.queueSave(card.conversation);
	}

	/** One command's report; throws with the text its failed card shows. */
	private async build(name: string, args: string): Promise<CommandReport> {
		const host = this.host;
		const settings = host.settings();
		if (name === "help") return helpReport(host.cliCommands(), settings.enableBashMode);
		if (USAGE_COMMANDS.includes(name)) {
			// A forced, rate-floored `get_usage` to a running CLI; none is started for it (DES-007).
			const snapshot = await host.usage.refresh(true);
			const error = host.usage.lastError;
			return name === "usage"
				? usageReport(snapshot, error, usageThresholds(settings), Date.now())
				: creditsReport(snapshot, error);
		}
		if (name === "cost") {
			// Only an already running CLI has numbers of its own; not worth a spawn.
			const live = host.link.session?.running ? host.link.session : null;
			const reply = await live?.control({ subtype: "get_session_cost" }).catch(() => null);
			const cliText = (reply as { text?: unknown } | null | undefined)?.text;
			const conversation = host.conversation();
			return costReport(
				host.tab.status.usage,
				conversationCost(conversation?.messages ?? [], conversation?.forkBase),
				typeof cliText === "string" ? cliText : null,
				costNote(conversation?.messages ?? [], conversation?.forkBase)
			);
		}
		const session = await host.link.ensure();
		if (!session) throw new Error(DID_NOT_START);
		const ask = async (request: ControlRequest) => {
			try {
				return await session.control(request, REQUEST_TIMEOUT_MS);
			} catch (err) {
				throw new Error(couldNotAnswer(message(err)));
			}
		};
		const profile = profileById(settings, session.profileId) ?? defaultProfile(settings);
		switch (name) {
			case "context":
				return contextReport(await ask({ subtype: "get_context_usage" }));
			case "mcp": {
				if (args) {
					const status = await ask({ subtype: "mcp_status" });
					const plan = mcpActionRequests(args, status);
					// A wrong argument is answered, with the servers to pick from; nothing to try again.
					if ("error" in plan) return { ...mcpReport(status), lead: plan.error };
					for (const request of plan.requests) await ask(request);
				}
				return mcpReport(await ask({ subtype: "mcp_status" }));
			}
			case "status":
				return statusReport(await ask({ subtype: "get_status" }), this.panelStatusRows(session, settings));
			case "memory":
				return memoryReport(await ask({ subtype: "get_memory_dialog" }));
			case "hooks":
				return hooksReport(await ask({ subtype: "get_hooks_listing" }));
			case "permissions":
				return permissionsReport(await ask({ subtype: "list_permission_rules" }));
			case "skills":
				return skillsReport(await ask({ subtype: "get_skills_dialog" }));
			case "chrome":
				return chromeReport(await ask({ subtype: "get_chrome_dialog" }), profile.chrome);
			case "sandbox":
				return sandboxReport(
					await ask({ subtype: "get_sandbox_dialog" }),
					profile.sandbox,
					sandboxAvailable(session.launchTarget.useWsl)
				);
		}
		throw new Error(`/${name} is not answered by the panel.`);
	}

	/** The panel's own rows at the top of /status (PRD-001.R20). */
	private panelStatusRows(session: ClaudeSession, settings: AgentPanelSettings): Array<[string, string]> {
		const profile = profileById(settings, session.profileId) ?? defaultProfile(settings);
		const target = session.launchTarget;
		const rows: Array<[string, string]> = [
			["Plugin", `AI Agent Panel ${this.host.pluginVersion}`],
			["Profile", profileLabel(profile)],
			["CLI", `${target.cliPath}${target.useWsl ? " (in WSL)" : ""}`],
			["Permission mode", this.host.modeLabel()],
		];
		const effort = this.host.tab.status.effort;
		if (effort) rows.push(["Effort", effortLabel(effort)]);
		return rows;
	}
}

/** A panel command as a compact, unnumbered message (PRD-001.R33). */
function compact(text: string): NewPrompt {
	return { type: "command", text, contextName: null, images: 0, sentAt: null };
}

function message(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
