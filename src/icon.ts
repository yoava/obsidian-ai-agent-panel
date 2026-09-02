import { addIcon } from "obsidian";

/** Id of the plugin's icon in Obsidian's icon registry. */
export const AGENT_ICON = "ai-agent-panel";

/**
 * A chat bubble holding a terminal prompt - the plugin in one glyph: a
 * conversation with a command-line agent. Drawn for Obsidian's 100×100 icon
 * box at lucide's stroke weight so it sits evenly beside the core ribbon
 * icons. Deliberately vendor-neutral: it must not evoke the mark of any
 * agent this plugin talks to.
 */
const AGENT_ICON_SVG =
	'<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">' +
	// Bubble, with a tail dropping from the lower left.
	'<path d="M24 20 H76 A12 12 0 0 1 88 32 V58 A12 12 0 0 1 76 70 H46 L30 84 V70 H24 A12 12 0 0 1 12 58 V32 A12 12 0 0 1 24 20 Z"/>' +
	// The prompt: a chevron and its cursor rule.
	'<path d="M34 36 L45 45 L34 54"/>' +
	'<path d="M52 54 H68"/>' +
	"</g>";

/** Register the icon; call once during plugin load, before any setIcon use. */
export function registerAgentIcon(): void {
	addIcon(AGENT_ICON, AGENT_ICON_SVG);
}
