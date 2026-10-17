import { Events, FileSystemAdapter, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { configuredPathMissing, detectClaudeCli, detectNativeCli, type DetectedCli } from "./cli";
import { noteSelection } from "./context-builder";
import { selectionReference } from "./context-format";
import { TranscriptExporter } from "./export";
import { HistoryStore, type StoredConversation } from "./history";
import { saveFailedText } from "./history-notice";
import { registerAgentIcon } from "./icon";
import { AGENT_ICON } from "./state/agent-icon";
import { loadLocalValue } from "./local-store";
import { serializeSaves } from "./save-queue";
import { isCredibleResolution, isLearnableModel, type CliModel } from "./models";
import type { SlashCommand } from "./suggest";
import { defaultProfile, profileById, type ThemeChoice } from "./settings-core";
import { CliMissing, type CliConfig } from "./state/cli-missing";
import { PROVENANCE_KEY, SessionProvenance } from "./state/session-provenance";
import { ThemeScope } from "./theme-scope";
import { UsageService } from "./usage-core";
import {
	AgentPanelSettingTab,
	settingsFromStores,
	isUpgradeShape,
	writeStores,
	type AgentPanelSettings,
	type CliProfile,
} from "./settings";
import { AgentPanelView, VIEW_TYPE_AGENT_PANEL } from "./view";

/** App.saveLocalStorage key for device-local settings (per vault+machine). */
const LOCAL_SETTINGS_KEY = "ai-agent-panel:local-settings";
/** Key used before the plugin was renamed; read once so CLI paths survive. */
const LEGACY_LOCAL_SETTINGS_KEY = "claude-code:local-settings";

export default class AgentPanelPlugin extends Plugin {
	declare settings: AgentPanelSettings;
	declare history: HistoryStore;
	/** The session ids this device recorded, in device-local storage (ADR-018 Decision 1). */
	declare provenance: SessionProvenance;
	declare exporter: TranscriptExporter;
	declare usage: UsageService;
	/** The panel's mode; panels, modals and the settings tab attach their roots (ADR-017). */
	declare theme: ThemeScope;
	/** Auto-detect results, per profile id - detection is slow and stable. */
	private detectedCli = new Map<string, DetectedCli>();
	/** Which profiles' CLI is known missing, for this run; nothing of it is stored (DES-002 Missing CLI). */
	readonly cliMissing = new CliMissing(() => this.settings.cliProfiles, {
		pathMissing: (cliPath) => this.pathMissing(cliPath),
		detectNative: async () => (await detectNativeCli())?.path ?? null,
		// Cached as an auto-detect hit is: the profile's flag already says native.
		found: (id, path) => {
			if (!this.detectedCli.has(id)) this.detectedCli.set(id, { path, useWsl: false });
		},
	});
	/** Last command list a CLI session reported; seeds "/" autocomplete and /help. */
	cliCommands: SlashCommand[] | null = null;
	/** cliCommands came from an initialize reply, not system/init's bare names. */
	cliCommandsDescribed = false;
	/** `settings`: a setting that reaches open panels changed (DES-003 Events). */
	readonly events = new Events();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.theme = this.addChild(new ThemeScope(this.app, this.events, () => this.settings));
		const pluginDir =
			this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		this.provenance = new SessionProvenance({
			read: () => loadLocalValue(this.app, PROVENANCE_KEY),
			write: (value) => this.app.saveLocalStorage(PROVENANCE_KEY, value),
			log: (message, detail) => console.error(`AI Agent Panel: ${message}`, detail),
			now: () => Date.now(),
		});
		this.history = new HistoryStore(this.app, `${pluginDir}/history`, this.provenance, (stored) =>
			stored === undefined ? defaultProfile(this.settings).id : (profileById(this.settings, stored)?.id ?? null)
		);
		void this.removeLegacyCheckpoints(`${pluginDir}/checkpoints`);
		// The conversation column draws from the store's cache, so it has to be
		// told when the cache moves - it never re-reads the folder itself.
		this.history.onChanged = () => {
			for (const view of this.chatViews()) view.onHistoryChanged();
		};
		// A deleted conversation may be open in any view; each detaches its tabs.
		this.history.onDeleted = (id) => {
			for (const view of this.chatViews()) view.onConversationDeleted(id);
		};
		// One Notice per conversation, whatever the number of open views.
		this.history.onSaveFailed = (_id, title) => {
			new Notice(saveFailedText(title));
		};
		this.exporter = new TranscriptExporter(this.app, () => this.settings);
		this.history.onBeforeSave = (conversation) =>
			this.exporter.maybeAutoExport(conversation);
		this.exporter.onExported = (conversation) => {
			for (const view of this.chatViews()) view.onTranscriptExported(conversation);
		};
		this.usage = new UsageService(
			() => ({ refreshSeconds: this.settings.usageRefreshSeconds }),
			() => {
				for (const view of this.chatViews()) {
					const client = view.liveUsageClient();
					if (client) return client;
				}
				return null;
			}
		);
		this.register(() => this.usage.dispose());

		registerAgentIcon();
		this.registerView(VIEW_TYPE_AGENT_PANEL, (leaf) => new AgentPanelView(leaf, this));
		// Lets the 'Page preview' core plugin preview vault links in replies.
		this.registerHoverLinkSource(VIEW_TYPE_AGENT_PANEL, {
			display: "AI Agent Panel",
			defaultMod: true,
		});
		this.addRibbonIcon(AGENT_ICON, "Open AI Agent Panel", () => void this.activateView());

		this.addCommand({
			id: "open",
			name: "Open chat",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "new-conversation",
			name: "New conversation",
			callback: async () => {
				const view = await this.activateView();
				view?.newConversation();
			},
		});
		this.addCommand({
			id: "previous-conversations",
			name: "Previous conversations",
			callback: async () => {
				const view = await this.activateView();
				await view?.openHistory();
			},
		});
		this.addCommand({
			id: "export-conversation",
			name: "Export conversation to Markdown",
			callback: async () => {
				const view = await this.activateView();
				await view?.exportCurrent();
			},
		});
		this.addCommand({
			id: "focus-prompt",
			name: "Focus prompt box",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "stop-turn",
			name: "Stop Claude's turn",
			checkCallback: (checking) => this.onPanel(checking, (view) => view.turnRunning, (view) => view.stopTurn()),
		});
		this.addCommand({
			id: "next-tab",
			name: "Next conversation tab",
			checkCallback: (checking) => this.onPanel(checking, (view) => view.canStepTab, (view) => view.stepTab(1)),
		});
		this.addCommand({
			id: "previous-tab",
			name: "Previous conversation tab",
			checkCallback: (checking) => this.onPanel(checking, (view) => view.canStepTab, (view) => view.stepTab(-1)),
		});
		this.addCommand({
			id: "add-selection",
			name: "Add selection to chat",
			editorCallback: (editor, ctx) => {
				const selection = noteSelection(editor);
				if (!selection?.text.trim()) {
					new Notice("Select some text first.");
					return;
				}
				// The reference line the context block uses, when the editor shows a file (PRD-001.R13).
				const path = ctx.file?.path;
				const text = path ? `${selectionReference(path, selection)}\n${selection.text}` : selection.text;
				void this.activateView().then((view) => view?.appendToInput(text));
			},
		});

		// File-explorer integration (also fired by community navigators like
		// make.md): right-click → attach to the chat's context.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				menu.addItem((item) =>
					item
						.setTitle("Add to agent chat")
						.setIcon(AGENT_ICON)
						.onClick(async () => {
							const view = await this.activateView();
							view?.addContextItem(file);
						})
				);
			})
		);
		this.registerEvent(
			this.app.workspace.on("files-menu", (menu, files) => {
				menu.addItem((item) =>
					item
						.setTitle("Add to agent chat")
						.setIcon(AGENT_ICON)
						.onClick(async () => {
							const view = await this.activateView();
							for (const file of files) view?.addContextItem(file);
						})
				);
			})
		);

		this.addSettingTab(new AgentPanelSettingTab(this.app, this));
	}

	/**
	 * Hand a changed setting that open panels reflect at once - where the tabs
	 * sit, the theme, the profile list, the usage settings, what the CLI
	 * taught - to every open panel and the theme scope, through the
	 * `settings` event.
	 */
	applyPanelSettings(): void {
		this.events.trigger("settings");
	}

	/** "Show tooltips" (PRD-001.R32), from the settings tab or the panel's menu: store it and apply it to open panels. */
	async setShowTooltips(value: boolean): Promise<void> {
		this.settings.showTooltips = value;
		await this.saveSettings();
		this.applyPanelSettings();
	}

	/** "Theme" (PRD-001.R34), from the settings tab or the panel's menu: store it and apply it to every scope root. */
	async setTheme(choice: ThemeChoice): Promise<void> {
		this.settings.theme = choice;
		await this.saveSettings();
		this.applyPanelSettings();
	}

	/** Hand changed launch settings (profile options, vault instructions, vault tools, bypass) to open chats. */
	applyLaunchSettings(): void {
		for (const view of this.chatViews()) void view.onLaunchSettingsChanged();
	}

	/**
	 * Retitle a conversation (PRD-001.R7), open or not. Every open view's own
	 * object takes the title, so none saves the old one back; a stored one is
	 * read, retitled and written. Renaming is not activity: `touch: false`.
	 */
	async renameConversation(id: string, title: string): Promise<void> {
		const views = this.chatViews();
		const held = (): StoredConversation[] => views.flatMap((view) => view.heldConversations(id));
		let targets = held();
		if (targets.length === 0) {
			const loaded = await this.history.load(id);
			// A tab can open it while the read is in flight; its object is the one to write.
			targets = held();
			if (targets.length === 0 && loaded) targets = [loaded];
		}
		if (targets.length === 0) {
			new Notice("Could not load that conversation.");
			return;
		}
		for (const conversation of targets) conversation.title = title;
		await this.history.save(targets[0], { touch: false });
		for (const view of views) view.onConversationRenamed(id);
	}

	/** All open chat views (usually one, in the right sidebar). */
	chatViews(): AgentPanelView[] {
		return this.app.workspace
			.getLeavesOfType(VIEW_TYPE_AGENT_PANEL)
			.map((leaf) => leaf.view)
			.filter((view): view is AgentPanelView => view instanceof AgentPanelView);
	}

	/** Open this plugin's tab in Obsidian's settings dialog. */
	openSettings(): void {
		// app.setting is not part of the public API typings.
		const setting = (
			this.app as unknown as {
				setting: { open(): void; openTabById(id: string): void };
			}
		).setting;
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	getVaultPath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
		throw new Error("AI Agent Panel requires a vault on the local file system");
	}

	/** A configured native path that is absent where a launch looks: from the vault, the CLI's working directory. */
	private pathMissing(cliPath: string): boolean {
		let cwd: string;
		try {
			cwd = this.getVaultPath();
		} catch {
			// Nothing launches outside a local vault; the start says so itself.
			return false;
		}
		return configuredPathMissing(cliPath, cwd);
	}

	/**
	 * Executable + WSL flag for a profile; auto-detects when its path is empty. `checked` is the profile's configuration
	 * the result belongs to, for the missing state (DES-002 Missing CLI).
	 */
	async resolveCli(
		profile: CliProfile
	): Promise<{ cliPath: string; useWsl: boolean; checked: CliConfig | null } | null> {
		let checked = this.cliMissing.snapshot(profile.id);
		if (profile.cliPath) return { cliPath: profile.cliPath, useWsl: profile.useWsl, checked };
		// Inside WSL the command resolves through the distro's own PATH.
		if (profile.useWsl && process.platform === "win32")
			return { cliPath: "claude", useWsl: true, checked };
		let found = this.detectedCli.get(profile.id);
		if (!found) {
			found = (await detectClaudeCli(profile.useWsl)) ?? undefined;
			if (!found) {
				this.cliMissing.missed(profile.id, checked);
				return null;
			}
			// An edit while the probes ran: the result serves this launch, and leaves the profile as it is now.
			if (!this.cliMissing.holds(profile.id, checked)) return { cliPath: found.path, useWsl: found.useWsl, checked };
			this.detectedCli.set(profile.id, found);
			// Sessions and usage checks spawn per this flag, so it must
			// track where the CLI was actually found.
			if (found.useWsl !== profile.useWsl) {
				profile.useWsl = found.useWsl;
				checked = this.cliMissing.snapshot(profile.id);
				await this.saveSettings();
			}
		}
		this.cliMissing.apply(profile.id, checked, true);
		return { cliPath: found.path, useWsl: found.useWsl, checked };
	}

	/** The panel a command acts on: the focused one, else the first open (PRD-001.R1). */
	private panelLeaf(): WorkspaceLeaf | null {
		const { workspace } = this.app;
		const focused = workspace.getActiveViewOfType(AgentPanelView);
		return focused?.leaf ?? workspace.getLeavesOfType(VIEW_TYPE_AGENT_PANEL)[0] ?? null;
	}

	/**
	 * A command that needs an open panel and something to act on there: not
	 * offered unless `can` holds for the panel; run, it reveals the panel and
	 * acts.
	 */
	private onPanel(checking: boolean, can: (view: AgentPanelView) => boolean, act: (view: AgentPanelView) => void): boolean {
		const leaf = this.panelLeaf();
		const view = leaf?.view instanceof AgentPanelView ? leaf.view : null;
		if (!leaf || !view || !can(view)) return false;
		if (!checking) {
			void this.app.workspace.revealLeaf(leaf);
			act(view);
		}
		return true;
	}

	async activateView(): Promise<AgentPanelView | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = this.panelLeaf();
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: VIEW_TYPE_AGENT_PANEL, active: true });
		}
		await workspace.revealLeaf(leaf);
		if (leaf.view instanceof AgentPanelView) {
			leaf.view.focusInput();
			return leaf.view;
		}
		return null;
	}

	/** This device's settings object: the current key, else the legacy one. */
	private readLocalSettings(): unknown {
		return loadLocalValue(this.app, LOCAL_SETTINGS_KEY) ?? loadLocalValue(this.app, LEGACY_LOCAL_SETTINGS_KEY);
	}

	/** The units the load read as device-only (what a device object without a list means to a save). */
	private loadedLocalGroups: string[] = [];

	async loadSettings(): Promise<void> {
		const local = this.readLocalSettings();
		this.settings = settingsFromStores(await this.loadData(), local);
		this.loadedLocalGroups = [...(this.settings.localGroups ?? [])];
		// An upgrade from 0.5.0 takes its security settings from data.json once;
		// persist the result now so no later load can see the old shape. A failed
		// save is safe: the next load repeats the upgrade or sees the saved shape.
		if (isUpgradeShape(local)) {
			try {
				await this.saveSettings();
			} catch (error) {
				console.error("AI Agent Panel: could not save the upgraded settings", error);
			}
		}
		// Drop learned resolutions that predate the credibility check - e.g.
		// "fable" learned as claude-opus-4-8 from a CLI that fell back to its
		// default model, which mislabeled the alias's picker entry.
		if (this.settings.resolvedModels) {
			this.settings.resolvedModels = Object.fromEntries(
				Object.entries(this.settings.resolvedModels).filter(([alias, id]) =>
					isCredibleResolution(alias, id)
				)
			);
		}
	}

	/**
	 * One save at a time, each splitting the settings as they are when it
	 * runs, so an older device-local list is never written last.
	 */
	private readonly queueSave = serializeSaves(async () => {
		await writeStores(this.settings, {
			loadedLocalGroups: this.loadedLocalGroups,
			readLocal: () => this.readLocalSettings(),
			writeLocal: (local) => this.app.saveLocalStorage(LOCAL_SETTINGS_KEY, local),
			writeData: (synced) => this.saveData(synced),
		});
	});

	async saveSettings(): Promise<void> {
		// Every path and WSL change is saved: its missing results go with it.
		this.cliMissing.sync();
		await this.queueSave();
	}

	/**
	 * The plugin's own pre-edit copies, from before Restore files rewound
	 * through the CLI's checkpoints (ADR-006). A failure is retried on the
	 * next load.
	 */
	private async removeLegacyCheckpoints(dir: string): Promise<void> {
		try {
			if (await this.app.vault.adapter.exists(dir)) await this.app.vault.adapter.rmdir(dir, true);
		} catch (err) {
			console.error("AI Agent Panel: could not remove the legacy checkpoints folder", err);
		}
	}

	/**
	 * Record the model list a profile's CLI reported in its initialize
	 * handshake. The picker then offers exactly what that CLI + account
	 * accept - the reason "some models throw an error" cannot happen once a
	 * session has run: rejected-by-CLI entries simply never appear.
	 */
	async rememberCliModels(profileId: string, models: CliModel[]): Promise<void> {
		const known = this.settings.cliModels ?? {};
		if (JSON.stringify(known[profileId]) === JSON.stringify(models)) return;
		this.settings.cliModels = { ...known, [profileId]: models };
		await this.saveSettings();
		this.applyPanelSettings();
	}

	async rememberStartupMode(profileId: string, mode: string): Promise<void> {
		const known = this.settings.cliStartupModes ?? {};
		if (known[profileId] === mode) return;
		this.settings.cliStartupModes = { ...known, [profileId]: mode };
		await this.saveSettings();
		this.applyPanelSettings();
	}

	/**
	 * The learned model list for a profile; a profile that has not run a
	 * session yet borrows the default profile's list (same account, so the
	 * lists rarely differ), and null falls the picker back to its static
	 * first-run entries.
	 */
	cliModelsFor(profileId: string | undefined): CliModel[] | null {
		const all = this.settings.cliModels;
		if (!all) return null;
		return (
			(profileId ? all[profileId] : undefined) ??
			all[this.settings.defaultProfileId] ??
			null
		);
	}

	/**
	 * Record the model id the CLI resolved an alias to, so the model picker can
	 * label aliases with the version they currently point at instead of a
	 * hard-coded one that goes stale on every model release.
	 */
	async rememberModelResolution(alias: string, resolvedId: string): Promise<void> {
		if (!isLearnableModel(alias) || !isCredibleResolution(alias, resolvedId)) return;
		const known = this.settings.resolvedModels ?? {};
		if (known[alias] === resolvedId) return;
		this.settings.resolvedModels = { ...known, [alias]: resolvedId };
		await this.saveSettings();
		this.applyPanelSettings();
	}
}
