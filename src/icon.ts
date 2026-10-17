import { addIcon, setIcon } from "obsidian";
import { AGENT_ICON, AGENT_ICON_SVG, COMPACT_ICON, COMPACT_ICON_SVG } from "./state/agent-icon";

/** Register the icon; call once during plugin load, before any setIcon use. */
export function registerAgentIcon(): void {
	addIcon(AGENT_ICON, AGENT_ICON_SVG);
	addIcon(COMPACT_ICON, COMPACT_ICON_SVG);
}

/** Draw the first of `names` the bundled Lucide knows: icon names differ across the versions Obsidian bundles. */
export function drawIcon(el: HTMLElement, names: readonly string[]): void {
	for (const name of names) {
		setIcon(el, name);
		if (el.querySelector("svg")) return;
	}
}

/**
 * A bar filled to `percent`, clamped to 0 to 100, with its figure in text
 * beside it: hover cards, the plan-usage popover, the usage cards.
 */
export function meterBar(parent: HTMLElement, percent: number): HTMLElement {
	const bar = parent.createDiv({ cls: "ai-agent-panel-meter", attr: { "aria-hidden": "true" } });
	bar.createDiv({ cls: "ai-agent-panel-meter-fill" }).setCssProps({
		"--ai-agent-panel-meter-percent": `${Math.min(100, Math.max(0, percent))}%`,
	});
	return bar;
}
