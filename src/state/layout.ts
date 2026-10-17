/**
 * Strip or column (PRD-001.R8), with hysteresis so a resize across the
 * threshold cannot flicker between them.
 */

import type { TabPosition } from "../settings-core";

/** Automatic shows the column from this panel width (px). */
export const COLUMN_FROM_PX = 820;
/** ...and keeps a shown column down to this one. */
export const COLUMN_KEEP_PX = 780;

/**
 * Whether the conversations show as the column rather than the strip. A
 * panel not laid out (0 px wide: hidden) keeps the layout it has.
 */
export function columnLayout(position: TabPosition, panelWidth: number, columnShown: boolean): boolean {
	if (position === "side") return true;
	if (position === "top") return false;
	if (!(panelWidth > 0)) return columnShown;
	return panelWidth >= (columnShown ? COLUMN_KEEP_PX : COLUMN_FROM_PX);
}
