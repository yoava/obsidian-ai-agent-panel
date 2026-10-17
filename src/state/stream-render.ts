/**
 * When streaming reply text is rendered as Markdown (DES-003 Turn head,
 * thinking and footer; PRD-001.R15, R29). Rendering the whole reply per delta
 * would cost O(deltas x length), so a delta only marks the block dirty and
 * asks for a render, which runs at most once per gap: `RENDER_MIN_GAP_MS`, or
 * `RENDER_COST_FACTOR` times what the last render took when that is longer,
 * so rendering never takes more than a quarter of the time on a slow render.
 * The first delta after a quiet spell renders at once; the last delta always
 * gets a trailing render. While the block is hidden (its tab is not shown,
 * its window is in the background) no render runs; the first one after it
 * shows comes at once. Pure, with the clock passed in, so the schedule is
 * checked in plain Node.
 */

/** The shortest gap between two renders of one streaming block. */
export const RENDER_MIN_GAP_MS = 250;
/** A render may take at most 1 / this share of the time. */
export const RENDER_COST_FACTOR = 4;

export class RenderThrottle {
	private scheduled = false;
	private dirty = false;
	private nextAt = 0;
	private hidden = false;

	/**
	 * A delta arrived at `now`. The wait in ms before the render when the
	 * caller is to schedule one (0 means now), or null when a render is
	 * already scheduled or running and will pick this delta up.
	 */
	request(now: number): number | null {
		this.dirty = true;
		if (this.scheduled || this.hidden) return null;
		this.scheduled = true;
		return Math.max(0, this.nextAt - now);
	}

	/** A scheduled render starts: it renders everything received so far. */
	begin(): void {
		this.dirty = false;
	}

	/**
	 * The render that began at `start` ended at `end`. The wait before the
	 * next render when deltas arrived meanwhile, else null (idle).
	 */
	finished(start: number, end: number): number | null {
		this.nextAt = start + Math.max(RENDER_MIN_GAP_MS, (end - start) * RENDER_COST_FACTOR);
		if (!this.dirty || this.hidden) {
			this.scheduled = false;
			return null;
		}
		return Math.max(0, this.nextAt - end);
	}

	/**
	 * The block was hidden or shown at `now`. When it shows with deltas
	 * unrendered and nothing scheduled, the wait before the render (the gap
	 * since the last one still applies), else null.
	 */
	setHidden(hidden: boolean, now: number): number | null {
		this.hidden = hidden;
		if (hidden || !this.dirty || this.scheduled) return null;
		this.scheduled = true;
		return Math.max(0, this.nextAt - now);
	}

	/** A scheduled render came due while the block is hidden: it does not run, and `setHidden(false)` schedules it. */
	due(): boolean {
		if (!this.hidden) return true;
		this.scheduled = false;
		return false;
	}

	/** The block settled or left: nothing scheduled or running counts any more. */
	reset(): void {
		this.scheduled = false;
		this.dirty = false;
		this.nextAt = 0;
		this.hidden = false;
	}
}
