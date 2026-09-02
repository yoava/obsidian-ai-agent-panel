/**
 * Geometry for the conversation column: how wide the user is allowed to drag
 * it, and the pane width at which "auto" switches between the top strip and
 * the side column.
 *
 * Obsidian-free on purpose - this is the arithmetic worth unit-testing, and
 * keeping it out of view.ts means the clamp and the layout threshold cannot
 * drift apart from each other.
 */

/** Column width a fresh install (and a double-clicked handle) gets. */
export const SIDE_WIDTH_DEFAULT_PX = 180;
/** Below this the titles stop being readable, so dragging stops here. */
export const SIDE_WIDTH_MIN_PX = 140;
/** A conversation list is a list, not a second pane - it never grows past this. */
export const SIDE_WIDTH_MAX_PX = 480;
/** The column may never take more than this share of the pane. */
export const SIDE_WIDTH_MAX_FRACTION = 0.5;

/**
 * Transcript width that still reads as a transcript. "auto" puts the tabs on
 * the side once the pane can afford the column plus this - so the threshold
 * moves with the column instead of assuming the 180px default.
 */
export const TABS_SIDE_MIN_TRANSCRIPT_PX = 380;

/**
 * Slack that has to be lost again before the layout flips back, so dragging
 * the pane edge across the threshold cannot make it flicker.
 */
export const TABS_SIDE_HYSTERESIS_PX = 40;

/**
 * The width the column may actually take, given the pane it sits in. The
 * minimum wins over the fraction: in a pane too narrow for both, "auto" has
 * already moved the tabs back to the top strip, and an explicit "side" is the
 * user insisting - neither case is improved by an illegible 70px column.
 */
export function clampSideWidth(
	width: number,
	paneWidth: number,
	options: { keepAutoLayout?: boolean } = {}
): number {
	if (!Number.isFinite(width)) return SIDE_WIDTH_DEFAULT_PX;
	const measured = Number.isFinite(paneWidth) && paneWidth > 0;
	// A pane that has not been laid out yet reports 0; fall back to the plain
	// ceiling rather than clamping every restored width down to the minimum.
	const limits = measured
		? [SIDE_WIDTH_MAX_PX, paneWidth * SIDE_WIDTH_MAX_FRACTION]
		: [SIDE_WIDTH_MAX_PX];
	// In "auto" the column is only shown while the pane clears the threshold
	// that this very width feeds. Without this cap, dragging the handle to the
	// fraction limit in a pane under ~680px pushes the threshold past the pane
	// and the layout flips to the top strip - taking the handle, and the
	// double-click that would undo it, with it.
	if (measured && options.keepAutoLayout)
		limits.push(paneWidth - TABS_SIDE_MIN_TRANSCRIPT_PX + TABS_SIDE_HYSTERESIS_PX);
	const upper = Math.max(SIDE_WIDTH_MIN_PX, Math.min(...limits));
	return Math.round(Math.max(SIDE_WIDTH_MIN_PX, Math.min(upper, width)));
}

/**
 * Pane width from which "auto" uses the side column, for a column of
 * `sideWidth`. Pass whether the tabs are on the side right now: while they
 * are, the threshold drops by the hysteresis so the pane has to shrink past
 * the flip point before the layout goes back to a strip.
 */
export function sideLayoutThreshold(sideWidth: number, onSide: boolean): number {
	const width = Number.isFinite(sideWidth) ? sideWidth : SIDE_WIDTH_DEFAULT_PX;
	return (
		width + TABS_SIDE_MIN_TRANSCRIPT_PX - (onSide ? TABS_SIDE_HYSTERESIS_PX : 0)
	);
}

/** A width read back from device-local storage, or the default if it is junk. */
export function parseStoredSideWidth(raw: unknown): number {
	return typeof raw === "number" && Number.isFinite(raw)
		? clampSideWidth(raw, 0)
		: SIDE_WIDTH_DEFAULT_PX;
}
