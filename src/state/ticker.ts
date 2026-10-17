/**
 * The shared ticker (PRD-001.R29; ADR-016 Size, visibility, timers): every
 * per-second label subscribes, and it runs only while a subscriber reports
 * itself shown, on the window its labels are in. A subscriber whose label
 * changes more slowly (a countdown in whole minutes) names its period, and
 * the timer wakes once a second only while a per-second subscriber is shown.
 */

import { clearRepeatingTimer, setRepeatingTimer, type TimerHandle, type TimerHost } from "../timers";

export const TICK_MS = 1000;
/** A slower subscriber is due this much before its period has passed, so timer jitter does not skip a beat. */
const JITTER_MS = 100;

export interface TickSubscriber {
	/** Whether its label can be seen now. */
	shown(): boolean;
	/** How often its label needs a tick, read at each check; every second when absent. */
	periodMs?(): number;
	/** What its period counts from: when it changes, the timer starts again, so a minute label flips a minute after it. */
	phase?(): unknown;
	tick(now: number): void;
}

export class Ticker {
	private readonly subscribers = new Set<TickSubscriber>();
	private handle: TimerHandle | undefined;
	/** The running timer's interval. */
	private interval = TICK_MS;
	/** When each slower subscriber last ticked. */
	private readonly lastTick = new Map<TickSubscriber, number>();
	/** Each subscriber's phase at the last look. */
	private readonly phases = new Map<TickSubscriber, unknown>();
	/** The window the running timer is on; null while stopped. */
	private host: TimerHost | null = null;

	constructor(
		/** The window of the labels, read at each check so a panel moved to another window follows. */
		private readonly windowOf: () => TimerHost,
		private readonly now: () => number = Date.now
	) {}

	get running(): boolean {
		return this.host !== null;
	}

	/** Adds a subscriber and re-checks; the returned function removes it and re-checks. */
	subscribe(subscriber: TickSubscriber): () => void {
		this.subscribers.add(subscriber);
		this.check();
		return () => {
			this.subscribers.delete(subscriber);
			this.lastTick.delete(subscriber);
			this.phases.delete(subscriber);
			this.check();
		};
	}

	/**
	 * Re-reads whether a subscriber is shown and how often: runs while one is,
	 * on the labels' window, at the shortest period of those shown, and stops
	 * at none.
	 */
	check(): void {
		const interval = this.shortestPeriod();
		if (interval === null) {
			this.stop();
			return;
		}
		const host = this.windowOf();
		const rephased = this.rephased();
		if (host === this.host && interval === this.interval && !rephased) return;
		this.stop();
		this.host = host;
		this.interval = interval;
		this.handle = setRepeatingTimer(() => this.tick(), interval, host);
	}

	/** Whether a shown subscriber's phase changed since the last look; its throttle starts over. */
	private rephased(): boolean {
		let changed = false;
		for (const subscriber of this.subscribers) {
			if (!subscriber.phase || !subscriber.shown()) continue;
			const phase = subscriber.phase();
			if (this.phases.has(subscriber) && this.phases.get(subscriber) !== phase) {
				changed = true;
				this.lastTick.delete(subscriber);
			}
			this.phases.set(subscriber, phase);
		}
		return changed;
	}

	/** The shortest period of the shown subscribers; null when none is shown. */
	private shortestPeriod(): number | null {
		let shortest: number | null = null;
		for (const subscriber of this.subscribers) {
			if (!subscriber.shown()) continue;
			const period = subscriber.periodMs?.() ?? TICK_MS;
			shortest = shortest === null ? period : Math.min(shortest, period);
		}
		return shortest;
	}

	stop(): void {
		if (this.host) clearRepeatingTimer(this.handle, this.host);
		this.host = null;
		this.handle = undefined;
	}

	private tick(): void {
		const now = this.now();
		let shown = false;
		for (const subscriber of [...this.subscribers]) {
			if (!subscriber.shown()) continue;
			shown = true;
			if (subscriber.periodMs) {
				const last = this.lastTick.get(subscriber);
				if (last !== undefined && now - last < subscriber.periodMs() - JITTER_MS) continue;
				this.lastTick.set(subscriber, now);
			}
			subscriber.tick(now);
		}
		// The periods may have changed with the ticks.
		if (shown) this.check();
		else this.stop();
	}
}
