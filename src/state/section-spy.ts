/**
 * Where the settings page is scrolled to (DES-001 Settings page): which section the bar's links mark as
 * current, and where a jump to a heading scrolls. Plain numbers in the scroller's viewport coordinates,
 * so the DOM reads stay in `settings`.
 */

/** What `currentSection` reads: each section heading's top, the bar's bottom edge, and the scroller's extent. */
export interface SpyView {
	/** Heading tops in section order. */
	tops: readonly number[];
	barBottom: number;
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
}

/** What `jumpTarget` reads: the heading to bring under the bar, and the scroller's extent. */
export interface Jump {
	headingTop: number;
	barBottom: number;
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
}

/** Sub-pixel layout leaves the scroller's end, and a jumped-to heading, this far (px) off. */
const TOLERANCE = 1;

/**
 * The index of the current section: at the scroller's end the last, else the last whose heading top is
 * at or above the bar's bottom (within a pixel), else the first; -1 when there are no sections.
 */
export function currentSection(view: SpyView): number {
	const last = view.tops.length - 1;
	if (last < 0) return -1;
	if (view.scrollTop + view.clientHeight >= view.scrollHeight - TOLERANCE) return last;
	let current = 0;
	for (let at = 1; at <= last; at++) {
		if (view.tops[at] <= view.barBottom + TOLERANCE) current = at;
	}
	return current;
}

/**
 * Where the bar's bottom edge sits once it is stuck at the scroller's top: the scroller's top plus the
 * bar's height. Its current rect is no use before it sticks, when it still rests lower in the flow.
 */
export function stuckBarBottom(scrollerTop: number, barHeight: number): number {
	return scrollerTop + barHeight;
}

/** The `scrollTop` that puts the heading's top at the bar's bottom, kept inside the scroller. */
export function jumpTarget(jump: Jump): number {
	const wanted = jump.scrollTop + jump.headingTop - jump.barBottom;
	return Math.min(Math.max(wanted, 0), Math.max(jump.scrollHeight - jump.clientHeight, 0));
}
