import { MIN_USAGE_REFRESH_SECONDS } from "./settings-core";
import { clearRepeatingTimer, setRepeatingTimer } from "./timers";

/**
 * Plan usage without spending tokens and without touching a credential: the
 * running CLI is asked for it over the stdio channel the plugin already owns
 * (`get_usage`), and the CLI makes the authenticated call itself. Results are
 * cached; the refresh interval is a setting, and even forced refreshes are
 * floored so a session is never hammered. The service also owns the one
 * background timer, which runs only while some panel view shows its
 * plan-usage segment.
 *
 * Because the data comes from a session, it is only available while one is
 * running - there is deliberately no path that starts a CLI process, or reads
 * `~/.claude/.credentials.json`, just to draw the plan-usage segment.
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

/** Time and repetition, injected so tests control both. */
export interface UsageClock {
	now(): number;
	/** Call `callback` every `ms` milliseconds until the returned function runs. */
	every(callback: () => void, ms: number): () => void;
}

const systemClock: UsageClock = {
	now: () => Date.now(),
	every(callback, ms) {
		const handle = setRepeatingTimer(callback, ms);
		return () => clearRepeatingTimer(handle);
	},
};

/** The timer ticks at the refresh interval but at least this often, so countdowns stay current. */
const MAX_TICK_MS = 30_000;

export class UsageService {
	snapshot: UsageSnapshot | null = null;
	lastError: string | null = null;
	private inFlight: Promise<UsageSnapshot | null> | null = null;
	private lastAttempt = 0;
	/** When the last attempt failed; null after a success. */
	private failedAt: number | null = null;
	private listeners = new Set<() => void>();
	/** The status lines whose plan-usage segment can be seen. */
	private visibleSegments = new Set<object>();
	private stopTimer: (() => void) | null = null;
	private periodMs = 0;

	constructor(
		private getConfig: () => UsageConfig,
		/** A running session's client, or null when none is up. */
		private getClient: () => UsageClient | null,
		private clock: UsageClock = systemClock
	) {}

	/** Notifies whenever a fetch settles (success or failure) and on every timer tick. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** A request is in flight; false by the time the listeners hear that it settled. */
	get refreshing(): boolean {
		return this.inFlight !== null;
	}

	/**
	 * Return the freshest snapshot available, fetching only when the cache is
	 * older than the configured interval (or `force`, still floored to
	 * MIN_FETCH_INTERVAL_MS). After a failure an unforced call waits out one
	 * refresh interval, so an outage is not retried on every tick.
	 */
	refresh(force = false): Promise<UsageSnapshot | null> {
		if (this.inFlight) return this.inFlight;
		const now = this.clock.now();
		const maxAgeMs = this.refreshMs();
		if (!force && this.snapshot && now - this.snapshot.fetchedAt < maxAgeMs)
			return Promise.resolve(this.snapshot);
		if (!force && this.failedAt !== null && now - this.failedAt < maxAgeMs)
			return Promise.resolve(this.snapshot);
		if (now - this.lastAttempt < MIN_FETCH_INTERVAL_MS)
			return Promise.resolve(this.snapshot);
		this.lastAttempt = now;
		this.inFlight = this.fetchUsage()
			.then((snap) => {
				this.snapshot = snap;
				this.lastError = null;
				this.failedAt = null;
				return snap;
			})
			.catch((err) => {
				this.lastError = err instanceof Error ? err.message : String(err);
				this.failedAt = this.clock.now();
				return this.snapshot;
			})
			.finally(() => {
				this.inFlight = null;
				this.notify();
			});
		return this.inFlight;
	}

	/**
	 * A status line reports whether its plan-usage segment can be seen
	 * (PRD-005.R3), after each fit and on its triggers. One timer serves all
	 * of them: it runs while any segment is visible, and a segment that just
	 * became visible gets a redraw and a request at once.
	 */
	setSegmentVisible(owner: object, visible: boolean): void {
		const becameVisible = visible && !this.visibleSegments.has(owner);
		if (visible) this.visibleSegments.add(owner);
		else this.visibleSegments.delete(owner);
		this.schedule();
		if (!becameVisible) return;
		void this.refresh();
		this.notify();
	}

	/** A turn finished: a forced refresh when any segment can be seen, none otherwise. */
	refreshIfVisible(): void {
		if (this.visibleSegments.size > 0) void this.refresh(true);
	}

	/** The plugin unloads: stop the timer and drop every subscription. */
	dispose(): void {
		this.visibleSegments.clear();
		this.listeners.clear();
		this.schedule();
	}

	private refreshMs(): number {
		return Math.max(MIN_USAGE_REFRESH_SECONDS, this.getConfig().refreshSeconds) * 1000;
	}

	/** Start, re-time or stop the timer to match the visible segments and the interval. */
	private schedule(): void {
		if (this.visibleSegments.size === 0) {
			this.stopTimer?.();
			this.stopTimer = null;
			return;
		}
		const periodMs = Math.min(MAX_TICK_MS, this.refreshMs());
		if (this.stopTimer && periodMs === this.periodMs) return;
		this.stopTimer?.();
		this.periodMs = periodMs;
		this.stopTimer = this.clock.every(() => {
			void this.refresh();
			this.notify();
		}, periodMs);
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
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
		return parseUsage(raw, this.clock.now());
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

export function parseUsage(data: Record<string, unknown>, fetchedAt: number): UsageSnapshot {
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
		fetchedAt,
		fiveHour: parseWindow(limits.five_hour),
		sevenDay: parseWindow(limits.seven_day),
		sevenDaySonnet: parseWindow(limits.seven_day_sonnet),
		modelLimits,
		extraUsage,
	};
}
