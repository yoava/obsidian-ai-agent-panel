import { FileSystemAdapter, Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { CheckpointStore } from "./checkpoints";
import { detectClaudeCli, type DetectedCli } from "./cli";
import { TranscriptExporter } from "./export";
import { HistoryStore } from "./history";
import { AGENT_ICON, registerAgentIcon } from "./icon";
import { isCredibleResolution, isLearnableModel, type CliModel } from "./models";
import { UsageService } from "./usage";
import {
	AgentPanelSettingTab,
	DEFAULT_SETTINGS,
	mergeLocalSettings,
	migrateRawSettings,
	normalizeSettings,
	sanitizeLocalGroups,
	splitSettings,
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
	declare exporter: TranscriptExporter;
	declare usage: UsageService;
	declare checkpoints: CheckpointStore;
	/** Auto-detect results, per profile id - detection is slow and stable. */
	private detectedCli = new Map<string, DetectedCli>();
	/** Last slash-command list a CLI session reported; seeds new views' "/" autocomplete. */
	slashCommands: string[] | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		const pluginDir =
			this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
		this.history = new HistoryStore(this.app, `${pluginDir}/history`);
		// The adapter already exposes exactly the IO the store needs, which is why
		// CheckpointStore takes it as an interface and stays Obsidian-free.
		this.checkpoints = new CheckpointStore(
			this.app.vault.adapter,
			`${pluginDir}/checkpoints`
		);
		this.history.onDeleted = (id) => void this.checkpoints.forget(id);
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
			id: "add-selection",
			name: "Add selection to chat",
			editorCallback: (editor) => {
				const selection = editor.getSelection();
				if (!selection.trim()) {
					new Notice("Select some text first.");
					return;
				}
				void this.activateView().then((view) => view?.appendToInput(selection));
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

	/** Re-apply usage-related settings (visibility, interval) to open views. */
	applyUsageSettings(): void {
		for (const view of this.chatViews()) view.onUsageSettingsChanged();
	}

	/**
	 * Re-apply settings the chat's own chrome reflects - where the tabs sit, and
	 * whether there are enough CLI profiles for the composer to offer a choice.
	 */
	applyViewSettings(): void {
		for (const view of this.chatViews()) view.onViewSettingsChanged();
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

	/** Executable + WSL flag for a profile; auto-detects when its path is empty. */
	async resolveCli(
		profile: CliProfile
	): Promise<{ cliPath: string; useWsl: boolean } | null> {
		if (profile.cliPath) return { cliPath: profile.cliPath, useWsl: profile.useWsl };
		// Inside WSL the command resolves through the distro's own PATH.
		if (profile.useWsl && process.platform === "win32")
			return { cliPath: "claude", useWsl: true };
		let found = this.detectedCli.get(profile.id);
		if (!found) {
			found = (await detectClaudeCli(profile.useWsl)) ?? undefined;
			if (!found) return null;
			this.detectedCli.set(profile.id, found);
			// Sessions and usage checks spawn per this flag, so it must
			// track where the CLI was actually found.
			if (found.useWsl !== profile.useWsl) {
				profile.useWsl = found.useWsl;
				await this.saveSettings();
			}
		}
		return { cliPath: found.path, useWsl: found.useWsl };
	}

	async activateView(): Promise<AgentPanelView | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_AGENT_PANEL)[0] ?? null;
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

	async loadSettings(): Promise<void> {
		const data = migrateRawSettings(
			((await this.loadData()) ?? {}) as Record<string, unknown>
		);
		const merged = Object.assign({}, DEFAULT_SETTINGS, data) as AgentPanelSettings;
		merged.localGroups = sanitizeLocalGroups(data.localGroups);
		// This device's values override synced ones for device-local groups; a
		// value still in data.json only seeds a device that has none of its own.
		mergeLocalSettings(
			merged,
			this.app.loadLocalStorage(LOCAL_SETTINGS_KEY) ??
				this.app.loadLocalStorage(LEGACY_LOCAL_SETTINGS_KEY)
		);
		this.settings = normalizeSettings(merged);
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

	async saveSettings(): Promise<void> {
		const { synced, local } = splitSettings(this.settings);
		await this.saveData(synced);
		this.app.saveLocalStorage(LOCAL_SETTINGS_KEY, local);
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
		for (const view of this.chatViews()) view.refreshModelLabels();
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
		for (const view of this.chatViews()) view.refreshModelLabels();
	}
}
