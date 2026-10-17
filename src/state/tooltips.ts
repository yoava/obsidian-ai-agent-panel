/**
 * "Show tooltips" (PRD-001.R32) as the panel's scopes see it (DES-003
 * Popovers, hover cards and tooltips). `styles.css` turns the class into the
 * `--ai-agent-panel-no-tooltip` token that every `--no-tooltip` rule reads,
 * which Obsidian consults before it shows a text tooltip.
 */

/** On a panel scope (the root, a plugin modal) while "Show tooltips" is off. */
export const NO_TOOLTIPS_CLASS = "mod-no-tooltips";

/** Whether a scope carries `NO_TOOLTIPS_CLASS`: the setting is off. */
export function hidesTooltips(showTooltips: boolean): boolean {
	return !showTooltips;
}
