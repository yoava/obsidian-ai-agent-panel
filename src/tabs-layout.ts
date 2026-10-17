/**
 * The conversation column's width (PRD-001.R8): its default while none is
 * stored, the range a drag may set, and what a stored value reads as. Strip
 * or column is `state/layout`'s.
 */

/** Dragging stops here: below it titles stop being readable. */
export const COLUMN_MIN_PX = 140;
/** A conversation list is a list, not a second pane. */
export const COLUMN_MAX_PX = 480;
/** The column never takes more than this share of the panel. */
export const COLUMN_MAX_FRACTION = 0.5;
/** Unset, the column takes this share of the panel... */
export const COLUMN_DEFAULT_FRACTION = 0.26;
/** ...within this range. */
export const COLUMN_DEFAULT_MIN_PX = 220;
export const COLUMN_DEFAULT_MAX_PX = 300;
/** Earlier versions stored their 180 px default; that value reads as unset. */
export const COLUMN_LEGACY_DEFAULT_PX = 180;

/** A panel that has not been laid out reports 0 px. */
const measured = (panelWidth: number): boolean => Number.isFinite(panelWidth) && panelWidth > 0;

/** The column with no stored width: 26% of the panel within 220 to 300 px, and at most half the panel. */
export function defaultColumnWidth(panelWidth: number): number {
	if (!measured(panelWidth)) return COLUMN_DEFAULT_MIN_PX;
	const width = Math.min(COLUMN_DEFAULT_MAX_PX, Math.max(COLUMN_DEFAULT_MIN_PX, panelWidth * COLUMN_DEFAULT_FRACTION));
	return Math.round(Math.min(width, panelWidth * COLUMN_MAX_FRACTION));
}

/**
 * A dragged width: 140 px to the smaller of 480 px and half the panel, the
 * minimum winning when both cannot hold; an unmeasured panel caps at 480 px
 * only, so a restored width survives the first pass.
 */
export function clampColumnWidth(width: number, panelWidth: number): number {
	const upper = measured(panelWidth) ? Math.min(COLUMN_MAX_PX, panelWidth * COLUMN_MAX_FRACTION) : COLUMN_MAX_PX;
	return Math.round(Math.max(COLUMN_MIN_PX, Math.min(upper, width)));
}

/** The width drawn in this panel: the stored one, or the default when none is. */
export function columnWidth(stored: number | null, panelWidth: number): number {
	return stored === null ? defaultColumnWidth(panelWidth) : clampColumnWidth(stored, panelWidth);
}

/** A width read back from device-local storage: clamped, or null (unset) for junk and for 180 px. */
export function parseStoredColumnWidth(raw: unknown): number | null {
	if (typeof raw !== "number" || !Number.isFinite(raw) || raw === COLUMN_LEGACY_DEFAULT_PX) return null;
	return clampColumnWidth(raw, 0);
}
