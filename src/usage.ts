import { Modal, type App } from "obsidian";

/**
 * Plan usage without spending tokens and without touching a credential: the
 * running CLI is asked for it over the stdio channel the plugin already owns
 * (`get_usage`), and the CLI makes the authenticated call itself. Results are
 * cached; the refresh interval is a setting, and even forced refreshes are
 * floored so a session is never hammered.
 *
 * Because the data comes from a session, it is only available while one is
 * running - there is deliberately no path that starts a CLI process, or reads
 * `~/.claude/.credentials.json`, just to draw a strip.
 */

/** Floor between two lookups, even when forced. */
const MIN_FETCH_INTERVAL_MS = 10_000;

export interface UsageWindow {
	/** Percent of the limit used (0-100), null when the API reports none. */
	utilization: number | null;
	/** ISO timestamp the window resets at. */
	resetsAt: string | null;
}

export interface UsageExtra {
	isEnabled: boolean;
	/** Monthly cap in minor currency units (cents); null = no cap. */
	monthlyLimit: number | null;
	/** Credits used this period, in minor currency units. */
	usedCredits: number | null;
	utilization: number | null;
	currency: string | null;
	disabledReason: string | null;
}

export interface UsageSnapshot {
	fetchedAt: number;
	fiveHour: UsageWindow | null;
	sevenDay: UsageWindow | null;
	sevenDaySonnet: UsageWindow | null;
	/** Per-model weekly limits (e.g. Opus) from the `limits` array. */
	modelLimits: Array<{ name: string; percent: number; resetsAt: string | null }>;
	extraUsage: UsageExtra | null;
}

interface UsageConfig {
	/** Seconds a snapshot stays fresh before an automatic re-fetch. */
	refreshSeconds: number;
}

/** The slice of the protocol client this service needs. */
export interface UsageClient {
	getPlanUsage(): Promise<Record<string, unknown> | null>;
}

export class UsageService {
	snapshot: UsageSnapshot | null = null;
	lastError: string | null = null;
	private inFlight: Promise<UsageSnapshot | null> | null = null;
	private lastAttempt = 0;
	private listeners = new Set<() => void>();

	constructor(
		private getConfig: () => UsageConfig,
		/** A running session's client, or null when none is up. */
		private getClient: () => UsageClient | null
	) {}

	/** Notifies whenever a fetch settles (success or failure). */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Return the freshest snapshot available, fetching only when the cache is
	 * older than the configured interval (or `force`, still floored to
	 * MIN_FETCH_INTERVAL_MS).
	 */
	refresh(force = false): Promise<UsageSnapshot | null> {
		if (this.inFlight) return this.inFlight;
		const now = Date.now();
		const maxAgeMs = Math.max(10, this.getConfig().refreshSeconds) * 1000;
		if (!force && this.snapshot && now - this.snapshot.fetchedAt < maxAgeMs)
			return Promise.resolve(this.snapshot);
		if (now - this.lastAttempt < MIN_FETCH_INTERVAL_MS)
			return Promise.resolve(this.snapshot);
		this.lastAttempt = now;
		this.inFlight = this.fetchUsage()
			.then((snap) => {
				this.snapshot = snap;
				this.lastError = null;
				return snap as UsageSnapshot | null;
			})
			.catch((err) => {
				this.lastError = err instanceof Error ? err.message : String(err);
				return this.snapshot;
			})
			.finally(() => {
				this.inFlight = null;
				for (const listener of this.listeners) listener();
			});
		return this.inFlight;
	}

	private async fetchUsage(): Promise<UsageSnapshot> {
		const client = this.getClient();
		if (!client)
			throw new Error(
				"Plan usage comes from a running session - send a message first."
			);
		const raw = await client.getPlanUsage();
		if (!raw) throw new Error("This CLI version does not report plan usage.");
		if (raw.rate_limits_available === false)
			throw new Error(
				"No plan limits on this login - API-key and Bedrock/Vertex sessions have none."
			);
		return parseUsage(raw);
	}
}

// ---------------------------------------------------------------------------
// Response parsing

function parseWindow(value: unknown): UsageWindow | null {
	if (!value || typeof value !== "object") return null;
	const o = value as Record<string, unknown>;
	return {
		utilization: typeof o.utilization === "number" ? o.utilization : null,
		resetsAt: typeof o.resets_at === "string" ? o.resets_at : null,
	};
}

function parseUsage(data: Record<string, unknown>): UsageSnapshot {
	// Windows live under `rate_limits`, which is null whenever plan limits do
	// not apply to the logged-in account.
	const limits =
		data.rate_limits && typeof data.rate_limits === "object"
			? (data.rate_limits as Record<string, unknown>)
			: {};

	let extraUsage: UsageExtra | null = null;
	if (limits.extra_usage && typeof limits.extra_usage === "object") {
		const o = limits.extra_usage as Record<string, unknown>;
		extraUsage = {
			isEnabled: o.is_enabled === true,
			monthlyLimit: typeof o.monthly_limit === "number" ? o.monthly_limit : null,
			usedCredits: typeof o.used_credits === "number" ? o.used_credits : null,
			utilization: typeof o.utilization === "number" ? o.utilization : null,
			currency: typeof o.currency === "string" ? o.currency : null,
			disabledReason: typeof o.disabled_reason === "string" ? o.disabled_reason : null,
		};
	}

	const modelLimits: UsageSnapshot["modelLimits"] = [];
	if (Array.isArray(limits.model_scoped)) {
		for (const raw of limits.model_scoped) {
			if (!raw || typeof raw !== "object") continue;
			const o = raw as Record<string, unknown>;
			if (typeof o.display_name !== "string" || typeof o.utilization !== "number")
				continue;
			modelLimits.push({
				name: o.display_name,
				percent: o.utilization,
				resetsAt: typeof o.resets_at === "string" ? o.resets_at : null,
			});
		}
	}

	return {
		fetchedAt: Date.now(),
		fiveHour: parseWindow(limits.five_hour),
		sevenDay: parseWindow(limits.seven_day),
		sevenDaySonnet: parseWindow(limits.seven_day_sonnet),
		modelLimits,
		extraUsage,
	};
}

// ---------------------------------------------------------------------------
// Formatting

/** "2h 27m", "3d 17h", "45m"; empty when already past. */
export function formatRemaining(ms: number): string {
	const minutes = Math.ceil(ms / 60_000);
	if (minutes <= 0) return "";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ${minutes % 60}m`;
	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/** "resets 16:59 (in 2h 27m)" / "resets Thu 08:00 (in 3d 17h)". */
export function formatReset(resetsAt: string | null): string {
	if (!resetsAt) return "";
	const date = new Date(resetsAt);
	if (isNaN(date.getTime())) return "";
	const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	const when =
		date.toDateString() === new Date().toDateString()
			? time
			: `${date.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
	const remaining = formatRemaining(date.getTime() - Date.now());
	return remaining ? `resets ${when} (in ${remaining})` : `resets ${when}`;
}

function formatCredits(minorUnits: number | null, currency: string | null): string {
	if (minorUnits === null) return "-";
	const amount = minorUnits / 100;
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currency || "USD",
		}).format(amount);
	} catch {
		return `${amount.toFixed(2)} ${currency ?? "USD"}`;
	}
}

function fetchedAtLabel(snapshot: UsageSnapshot): string {
	return new Date(snapshot.fetchedAt).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function staleNote(snapshot: UsageSnapshot, error: string | null): string {
	return error
		? `\n\n⚠ Refresh failed (${error}) - showing data fetched at ${fetchedAtLabel(snapshot)}.`
		: "";
}

/** The limit windows a snapshot reports, titled the way the CLI titles them. */
function usageRows(
	snapshot: UsageSnapshot
): Array<{ title: string; percent: number; reset: string }> {
	const rows: Array<{ title: string; percent: number; reset: string }> = [];
	const push = (title: string, window: UsageWindow | null) => {
		if (window?.utilization == null) return;
		rows.push({
			title,
			percent: Math.floor(window.utilization),
			reset: formatReset(window.resetsAt),
		});
	};
	push("Current session (5h)", snapshot.fiveHour);
	push("Current week (all models)", snapshot.sevenDay);
	push("Current week (Sonnet)", snapshot.sevenDaySonnet);
	for (const limit of snapshot.modelLimits)
		push(`Current week (${limit.name})`, {
			utilization: limit.percent,
			resetsAt: limit.resetsAt,
		});
	return rows;
}

/** "Extra usage: $3.50 (no monthly cap)" - null when not enabled. */
function extraUsageLine(extra: UsageExtra | null): string | null {
	if (!extra?.isEnabled) return null;
	const cap =
		extra.monthlyLimit === null
			? "no monthly cap"
			: `of ${formatCredits(extra.monthlyLimit, extra.currency)}`;
	return (
		`Extra usage: ${formatCredits(extra.usedCredits, extra.currency)} (${cap})` +
		(extra.utilization != null ? ` - ${Math.floor(extra.utilization)}%` : "")
	);
}

/** Transcript card for /usage. */
export function usageMarkdown(
	snapshot: UsageSnapshot | null,
	error: string | null
): string {
	if (!snapshot) return `**Claude usage**\n\nCouldn't fetch usage: ${error ?? "unknown error"}`;
	const lines = usageRows(snapshot).map(
		({ title, percent, reset }) =>
			`- **${title}:** ${percent}% used${reset ? ` - ${reset}` : ""}`
	);
	const extra = extraUsageLine(snapshot.extraUsage);
	if (extra) lines.push(`- **${extra.replace(": ", ":** ")}`);
	if (lines.length === 0) lines.push("_No usage limits reported for this account._");
	return `**Claude usage** - as of ${fetchedAtLabel(snapshot)}\n\n${lines.join("\n")}${staleNote(snapshot, error)}`;
}

/** Plain-text summary for the usage strip's hover tooltip. */
export function usageTooltip(
	snapshot: UsageSnapshot | null,
	error: string | null
): string {
	if (!snapshot) return error ?? "Fetching Claude usage…";
	const lines = usageRows(snapshot).map(
		({ title, percent, reset }) => `${title}: ${percent}% used${reset ? ` - ${reset}` : ""}`
	);
	const extra = extraUsageLine(snapshot.extraUsage);
	if (extra) lines.push(extra);
	if (error) lines.unshift(`⚠ Refresh failed: ${error}`);
	lines.push(`Fetched ${fetchedAtLabel(snapshot)} - click for details`);
	return lines.join("\n");
}

/**
 * Detailed plan-usage popup (opened from the usage strip): every limit
 * window as a progress bar, extra-usage credits, and a link to the online
 * usage/credit settings. Live-updates while open via the service's
 * subscribe hook.
 */
export class UsageDetailModal extends Modal {
	private unsubscribe: (() => void) | null = null;

	constructor(
		app: App,
		private usage: UsageService,
		private thresholds: () => { warn: number; crit: number }
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Claude plan usage");
		this.modalEl.addClass("ai-agent-panel-usage-modal");
		this.unsubscribe = this.usage.subscribe(() => this.render());
		this.render();
		void this.usage.refresh();
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const snapshot = this.usage.snapshot;
		const error = this.usage.lastError;
		const { warn, crit } = this.thresholds();

		if (!snapshot) {
			contentEl.createDiv({
				cls: "ai-agent-panel-usage-modal-note",
				text: error ? `Couldn't fetch usage: ${error}` : "Fetching usage…",
			});
		} else {
			const rows = usageRows(snapshot);
			if (rows.length === 0)
				contentEl.createDiv({
					cls: "ai-agent-panel-usage-modal-note",
					text: "No usage limits reported for this account.",
				});
			for (const row of rows) {
				const rowEl = contentEl.createDiv({ cls: "ai-agent-panel-usage-row" });
				if (row.percent >= crit) rowEl.addClass("is-crit");
				else if (row.percent >= warn) rowEl.addClass("is-warn");
				const head = rowEl.createDiv({ cls: "ai-agent-panel-usage-row-head" });
				head.createSpan({ text: row.title });
				head.createSpan({
					cls: "ai-agent-panel-usage-row-pct",
					text: `${row.percent}%`,
				});
				const track = rowEl.createDiv({ cls: "ai-agent-panel-usage-track" });
				track
					.createDiv({ cls: "ai-agent-panel-usage-fill" })
					.style.setProperty("width", `${Math.min(100, Math.max(0, row.percent))}%`);
				if (row.reset)
					rowEl.createDiv({ cls: "ai-agent-panel-usage-row-reset", text: row.reset });
			}
			const extra = extraUsageLine(snapshot.extraUsage);
			if (extra) contentEl.createDiv({ cls: "ai-agent-panel-usage-modal-note", text: extra });
			if (error)
				contentEl.createDiv({
					cls: "ai-agent-panel-usage-modal-error",
					text: `⚠ Refresh failed: ${error} - showing data from ${fetchedAtLabel(snapshot)}.`,
				});
			else
				contentEl.createDiv({
					cls: "ai-agent-panel-usage-modal-note",
					text: `Fetched ${fetchedAtLabel(snapshot)}`,
				});
		}

		const footer = contentEl.createDiv({ cls: "ai-agent-panel-usage-modal-footer" });
		footer.createEl("a", {
			text: "Usage & credit settings ↗",
			href: "https://claude.ai/settings/usage",
		});
		const refreshBtn = footer.createEl("button", { text: "Refresh" });
		refreshBtn.addEventListener("click", () => {
			refreshBtn.setAttribute("disabled", "true");
			void this.usage.refresh(true).finally(() => refreshBtn.removeAttribute("disabled"));
		});
	}
}

/** Transcript card for /usage-credits and /extra-usage. */
export function creditsMarkdown(
	snapshot: UsageSnapshot | null,
	error: string | null
): string {
	if (!snapshot)
		return `**Usage credits**\n\nCouldn't fetch usage: ${error ?? "unknown error"}`;
	const extra = snapshot.extraUsage;
	const lines: string[] = [];
	if (!extra) {
		lines.push(
			"_Extra-usage credits aren't reported for this account (API-key setups and some plans don't have them)._"
		);
	} else {
		const reason = extra.disabledReason
			? ` (${extra.disabledReason.replace(/_/g, " ")})`
			: "";
		lines.push(`- **Status:** ${extra.isEnabled ? "enabled" : "disabled"}${reason}`);
		lines.push(
			`- **Monthly limit:** ${
				extra.monthlyLimit === null
					? extra.isEnabled
						? "unlimited"
						: "-"
					: formatCredits(extra.monthlyLimit, extra.currency)
			}`
		);
		if (extra.usedCredits !== null)
			lines.push(
				`- **Used this period:** ${formatCredits(extra.usedCredits, extra.currency)}` +
					(extra.utilization != null
						? ` (${Math.floor(extra.utilization)}% of the cap)`
						: "")
			);
	}
	lines.push(
		"",
		"Manage extra usage at [claude.ai/settings/usage](https://claude.ai/settings/usage)."
	);
	return `**Usage credits** - as of ${fetchedAtLabel(snapshot)}\n\n${lines.join("\n")}${staleNote(snapshot, error)}`;
}
