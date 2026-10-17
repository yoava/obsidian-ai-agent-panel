import type { ThemeChoice } from "../settings-core";
import { ALL_PROMPT_COLOR_CLASSES, CUSTOM_PROPERTY, type PromptSelection } from "./prompt-color";

/** The panel's mode: which of its palettes it draws with (PRD-001.R34). */
export type Mode = "light" | "dark";

/** The class on a scope root that selects each palette (ADR-017 Palettes and mode). */
export const MODE_CLASS: Record<Mode, string> = { light: "is-light", dark: "is-dark" };

/** The class that stops transitions while a root switches palette (ADR-017). */
export const FENCE_CLASS = "is-switching-theme";

/** The mode a setting gives: Light and Dark as set, Auto Obsidian's. */
export function resolveMode(setting: ThemeChoice, hostDark: boolean): Mode {
	if (setting === "match") return hostDark ? "dark" : "light";
	return setting;
}

/** A root element, through Obsidian's class helpers. */
export interface ScopeRoot {
	addClass(...classes: string[]): void;
	removeClass(...classes: string[]): void;
	hasClass(cls: string): boolean;
	/** Obsidian's `setCssProps`: sets each property inline, and removes one set to "". */
	setCssProps(props: Record<string, string>): void;
	/** Reads the inline properties, to find one a released root kept. */
	style: { getPropertyValue(property: string): string };
}

/** Leave `root` with exactly the class of `mode`, whichever mode classes it had. */
export function setModeClass(root: ScopeRoot, mode: Mode): void {
	root.removeClass(MODE_CLASS.light, MODE_CLASS.dark);
	root.addClass(MODE_CLASS[mode]);
}

/**
 * Leave `root` with exactly the prompt color's class and Custom property of
 * `selection` (ADR-017 Prompt color), writing only what differs. Returns
 * whether it wrote anything.
 */
export function setPromptSelection(root: ScopeRoot, selection: PromptSelection): boolean {
	let wrote = false;
	for (const cls of ALL_PROMPT_COLOR_CLASSES) {
		const want = cls === selection.className;
		if (root.hasClass(cls) === want) continue;
		if (want) root.addClass(cls);
		else root.removeClass(cls);
		wrote = true;
	}
	const held = root.style.getPropertyValue(CUSTOM_PROPERTY);
	if (held !== (selection.custom ?? "")) {
		root.setCssProps({ [CUSTOM_PROPERTY]: selection.custom ?? "" });
		wrote = true;
	}
	return wrote;
}

/** An event source shaped like Obsidian's `Events`, for one event name. */
export interface EventHub<Name extends string> {
	on(name: Name, callback: () => void): unknown;
	offref(ref: unknown): void;
}

export interface ModeClassesDeps<Root extends ScopeRoot> {
	/** Fires `css-change` when Obsidian's mode or CSS changes. */
	workspace: EventHub<"css-change">;
	/** The plugin's events; fires `settings` when the Theme setting may have changed. */
	settingsEvents: EventHub<"settings">;
	setting: () => ThemeChoice;
	/** Whether Obsidian is in its dark mode, read from the main window. */
	hostDark: () => boolean;
	/** The prompt color in effect, from the stored values (ADR-017 Prompt color). */
	prompt: () => PromptSelection;
	/** Reads a style value of `root`, so its new classes apply while the fence is on. */
	flush: (root: Root) => void;
}

/**
 * Whose mode a root takes: `"setting"` the Theme setting's (panel roots,
 * plugin modals), `"host"` Obsidian's whatever the setting (a scope inside
 * Obsidian's settings modal, whose background follows the host).
 */
export type Follows = "setting" | "host";

interface Registration {
	mode: Mode;
	follows: Follows;
	/** The prompt color the root was last given. */
	prompt: PromptSelection;
	/** One token per attach; the root stays registered until all are released. */
	owners: Set<object>;
}

/**
 * Keeps every attached root classed `is-light` or `is-dark` as the Theme
 * setting and Obsidian's mode resolve (ADR-017 Palettes and mode), each
 * switch inside the fence so nothing transitions.
 */
export class ModeClasses<Root extends ScopeRoot> {
	private readonly roots = new Map<Root, Registration>();
	private refs: { hub: EventHub<string>; ref: unknown }[] = [];

	constructor(private readonly deps: ModeClassesDeps<Root>) {}

	/** Listen for changes; a second call while loaded does nothing. */
	load(): void {
		if (this.refs.length > 0) return;
		const refresh = (): void => this.refresh();
		this.refs = [
			{ hub: this.deps.workspace, ref: this.deps.workspace.on("css-change", refresh) },
			{ hub: this.deps.settingsEvents, ref: this.deps.settingsEvents.on("settings", refresh) },
		];
	}

	unload(): void {
		for (const { hub, ref } of this.refs) hub.offref(ref);
		this.refs = [];
		this.roots.clear();
	}

	/** The mode a root that follows `follows` takes now. */
	mode(follows: Follows = "setting"): Mode {
		return resolveMode(follows === "host" ? "match" : this.deps.setting(), this.deps.hostDark());
	}

	/**
	 * Class `root` now and on every change; returns this attach's detach. A
	 * root attached twice stays classed until both detaches run; the later
	 * attach sets whose mode it follows. A root attached again after its
	 * release takes the classes and property as they are now, whatever it kept.
	 */
	attach(root: Root, follows: Follows = "setting"): () => void {
		const owner = {};
		const registration = this.roots.get(root);
		const owners = registration?.owners ?? new Set<object>();
		owners.add(owner);
		const mode = this.mode(follows);
		const prompt = this.deps.prompt();
		if (registration) registration.follows = follows;
		if (registration?.mode !== mode || !samePrompt(registration.prompt, prompt)) this.apply(root, mode, follows, owners, prompt, registration?.mode !== mode);
		return () => {
			if (this.roots.get(root)?.owners !== owners) return;
			owners.delete(owner);
			if (owners.size === 0) this.roots.delete(root);
		};
	}

	private refresh(): void {
		const prompt = this.deps.prompt();
		for (const [root, { mode, follows, owners, prompt: held }] of this.roots) {
			const next = this.mode(follows);
			if (next !== mode || !samePrompt(held, prompt)) this.apply(root, next, follows, owners, prompt, next !== mode);
		}
	}

	private apply(root: Root, mode: Mode, follows: Follows, owners: Set<object>, prompt: PromptSelection, modeChanged: boolean): void {
		this.roots.set(root, { mode, follows, owners, prompt });
		root.addClass(FENCE_CLASS);
		try {
			if (modeChanged) setModeClass(root, mode);
			setPromptSelection(root, prompt);
		} finally {
			this.deps.flush(root);
			root.removeClass(FENCE_CLASS);
		}
	}
}

function samePrompt(a: PromptSelection, b: PromptSelection): boolean {
	return a.className === b.className && a.custom === b.custom;
}

/**
 * Detaches held one per key: setting a key releases the detach it held, so a
 * redrawn row does not keep its old root registered.
 */
export class Registrations<Key> {
	private readonly held = new Map<Key, () => void>();

	set(key: Key, detach: () => void): void {
		this.held.get(key)?.();
		this.held.set(key, detach);
	}

	releaseAll(): void {
		for (const detach of this.held.values()) detach();
		this.held.clear();
	}

	get size(): number {
		return this.held.size;
	}
}
