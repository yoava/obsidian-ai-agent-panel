import { Component, type App, type Events, type Modal } from "obsidian";
import { disposeAllFonts, disposeFonts, watchFonts } from "./fonts";
import type { AgentPanelSettings } from "./settings-core";
import { promptSelection } from "./state/prompt-color";
import { ModeClasses, resolveMode, setModeClass, type Follows, type Mode } from "./state/theme";

const SCOPE_CLASS = "ai-agent-panel-scope";

/** `CSS.supports("color", value)`, the check `acceptCustomColor` takes; the browser's, so Node tests inject their own. */
export function supportsColor(value: string): boolean {
	return CSS.supports("color", value);
}

/** The plugin's scope, for `themeModal`; null while none is loaded. */
const loaded: { scope: ThemeScope | null } = { scope: null };

/** Whether Obsidian is in its dark mode. A pop-out's body follows the main one late, so read the main. */
function hostDark(): boolean {
	return window.document.body.hasClass("theme-dark");
}

/**
 * Give a plugin modal the panel's tokens and palette. Called in `onOpen`;
 * the returned detach is called in `onClose` (ADR-017). The scope loads in
 * the plugin's `onload` before any view or command exists, so a modal opens
 * without one only after unload; it then takes Obsidian's mode, unclassed later.
 */
export function themeModal(modal: Modal): () => void {
	modal.modalEl.addClass(SCOPE_CLASS);
	if (loaded.scope) return loaded.scope.attach(modal.modalEl);
	setModeClass(modal.modalEl, resolveMode("match", hostDark()));
	return () => undefined;
}

/**
 * The panel's mode and prompt color (PRD-001.R34, R33; mechanism ADR-017
 * Palettes and mode, Prompt color): classes every attached root `is-light`
 * or `is-dark` from the Theme setting and the main window's mode, and gives
 * it the prompt color's class and Custom property from the settings.
 */
export class ThemeScope extends Component {
	private readonly classes: ModeClasses<HTMLElement>;
	private readonly workspace: App["workspace"];

	constructor(app: App, settingsEvents: Events, settings: () => AgentPanelSettings) {
		super();
		this.workspace = app.workspace;
		this.classes = new ModeClasses<HTMLElement>({
			workspace: app.workspace,
			settingsEvents,
			setting: () => settings().theme,
			hostDark,
			prompt: () => promptSelection(settings().promptColor, settings().promptCustomColor, supportsColor),
			flush: (root) => root.win.getComputedStyle(root).getPropertyValue("color"),
		});
	}

	onload(): void {
		loaded.scope = this;
		this.classes.load();
		// A closed pop-out's document goes; the rest go with the plugin.
		this.registerEvent(this.workspace.on("window-close", (_win, window) => disposeFonts(window.document)));
		this.register(() => disposeAllFonts());
	}

	onunload(): void {
		this.classes.unload();
		if (loaded.scope === this) loaded.scope = null;
	}

	/** The mode a root that follows `follows` takes now. */
	mode(follows: Follows = "setting"): Mode {
		return this.classes.mode(follows);
	}

	/**
	 * Class `root` now and on every change, and give its document the panel's
	 * fonts (ADR-017 Typography); returns this attach's detach. `"host"` keeps
	 * Obsidian's mode whatever the Theme setting.
	 */
	attach(root: HTMLElement, follows: Follows = "setting"): () => void {
		const unwatchFonts = watchFonts(root);
		const detachClasses = this.classes.attach(root, follows);
		return () => {
			detachClasses();
			unwatchFonts();
		};
	}
}
