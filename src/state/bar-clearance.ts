/**
 * How far a region's bottom edge must stay clear of Obsidian's status bar,
 * which is drawn over the bottom corner of the workspace (DES-003 Layout
 * model). Geometry only; `ui/shell` reads the rectangles.
 */

/** A rectangle in the window's coordinates, as `getBoundingClientRect` gives. */
export interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

const drawn = (box: Box): boolean => box.right > box.left && box.bottom > box.top;

/**
 * The pixels to keep clear at the bottom of `region`: the part of it the
 * status bar covers, 0 when the bar is absent or hidden (null or no size),
 * does not reach the region horizontally, or sits below it. Whole pixels,
 * never more than the region's height.
 */
export function barClearance(region: Box, bar: Box | null): number {
	if (bar === null || !drawn(bar) || !drawn(region)) return 0;
	if (bar.left >= region.right || bar.right <= region.left) return 0;
	if (bar.top >= region.bottom || bar.bottom <= region.top) return 0;
	return Math.ceil(Math.min(region.bottom - bar.top, region.bottom - region.top));
}
