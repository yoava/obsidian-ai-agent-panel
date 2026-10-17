/**
 * Id of the plugin's icon in Obsidian's icon registry. Obsidian puts a
 * registered id on the drawn `<svg>` as a class, so the id must be no class a
 * stylesheet rule names: the panel's own classes all start with
 * `ai-agent-panel`, which the root rule `.ai-agent-panel` colors and fills.
 */
export const AGENT_ICON = "aiap-agent-mark";

/**
 * A chat bubble holding a terminal prompt - the plugin in one glyph: a
 * conversation with a command-line agent. Drawn for Obsidian's 100×100 icon
 * box at lucide's stroke weight so it sits evenly beside the core ribbon
 * icons. Outline only, in the text color around it, with no filled shape.
 * Deliberately vendor-neutral: it must not evoke the mark of any agent this
 * plugin talks to.
 */
export const AGENT_ICON_SVG =
	'<g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">' +
	// Bubble, with a tail dropping from the lower left.
	'<path d="M24 20 H76 A12 12 0 0 1 88 32 V58 A12 12 0 0 1 76 70 H46 L30 84 V70 H24 A12 12 0 0 1 12 58 V32 A12 12 0 0 1 24 20 Z"/>' +
	// The prompt: a chevron and its cursor rule.
	'<path d="M34 36 L45 45 L34 54"/>' +
	'<path d="M52 54 H68"/>' +
	"</g>";

/** Id of the Compact button's icon (the mock's: two arrows folding toward the middle, no dashes). */
export const COMPACT_ICON = "aiap-compact";

/** The board's four paths, drawn on lucide's 24 grid and scaled to Obsidian's 100x100 icon box. */
export const COMPACT_ICON_SVG =
	'<g transform="scale(4.1667)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
	'<path d="M12 22v-6"/><path d="M12 8V2"/><path d="m15 19-3-3-3 3"/><path d="m15 5-3 3-3-3"/>' +
	"</g>";
