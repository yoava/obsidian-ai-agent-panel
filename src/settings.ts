import {
	AbstractInputSuggest,
	App,
	Notice,
	PluginSettingTab,
	Setting,
	TFolder,
} from "obsidian";
import { detectClaudeCli } from "./cli";
import {
	newProfileId,
	type ChatPermissionMode,
	type CliProfile,
	type TabPosition,
} from "./settings-core";
import type AgentPanelPlugin from "./main";

export {
	DEFAULT_SETTINGS,
	SYNC_UNITS,
	cliPermissionMode,
	defaultProfile,
	mergeLocalSettings,
	migrateRawSettings,
	normalizeSettings,
	profileById,
	sanitizeLocalGroups,
	splitSettings,
	type AgentPanelSettings,
	type ChatPermissionMode,
	type CliProfile,
	type TabPosition,
} from "./settings-core";

/** Fetches are never scheduled tighter than this, whatever the setting says. */
export const MIN_USAGE_REFRESH_SECONDS = 10;

/** "90" → 90, "30s" → 30, "2m" → 120, "1.5h" → 5400; null when unparseable. */
export function parseDurationSeconds(raw: string): number | null {
	const match =
		/^\s*(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)?\s*$/i.exec(
			raw
		);
	if (!match) return null;
	const value = Number(match[1]);
	if (!isFinite(value) || value <= 0) return null;
	const unit = (match[2] ?? "s").toLowerCase();
	const multiplier = unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1;
	return Math.round(value * multiplier);
}

/** Canonical display form: 45 → "45s", 120 → "2m", 5400 → "90m", 7200 → "2h". */
export function formatDurationSeconds(seconds: number): string {
	if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
	if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
}

/** Folder-path autocomplete for a text input. */
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	constructor(app: App, private textInputEl: HTMLInputElement) {
		super(app, textInputEl);
	}

	protected getSuggestions(query: string): TFolder[] {
		const needle = query.toLowerCase();
		return this.app.vault
			.getAllLoadedFiles()
			.filter(
				(f): f is TFolder =>
					f instanceof TFolder &&
					f.path !== "/" &&
					f.path.toLowerCase().includes(needle)
			)
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.textInputEl.value = folder.path;
		this.textInputEl.trigger("input");
		this.close();
	}
}

export class AgentPanelSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AgentPanelPlugin) {
		super(app, plugin);
	}

	/**
	 * Notebook Navigator-style cloud badge: shows whether the row's settings
	 * sync across devices (cloud) or stay on this device (cloud-off, plus a
	 * "(not synced)" name suffix); clicking the icon flips it. `unit` is a
	 * SYNC_UNITS key.
	 */
	private addSyncBadge(setting: Setting, unit: string): Setting {
		const local = this.plugin.settings.localGroups?.includes(unit) ?? false;
		if (local) setting.nameEl.appendText(" (not synced)");
		setting.addExtraButton((btn) =>
			btn
				.setIcon(local ? "cloud-off" : "cloud")
				.setTooltip(
					local
						? "Stored on this device only. Click to sync across devices."
						: "Synced across devices with the vault's plugin data. " +
								"Click to store on this device only."
				)
				.onClick(async () => {
					const current = this.plugin.settings.localGroups ?? [];
					this.plugin.settings.localGroups = local
						? current.filter((key) => key !== unit)
						: [...current, unit];
					await this.plugin.saveSettings();
					this.display();
				})
		);
		return setting;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addSyncBadge(
			new Setting(containerEl).setName("Claude Code CLI").setHeading(),
			"cli"
		);
		this.displayCliProfiles(containerEl);

		new Setting(containerEl).setName("Chat").setHeading();

		this.addSyncBadge(
			new Setting(containerEl)
				.setName("Model")
				.setDesc(
					'Model alias (e.g. "sonnet", "opus", "fable", "haiku") - always the ' +
						"latest of that family - or a full model id. " +
						"Leave empty to use your Claude Code default. Picking a model " +
						"in the chat overrides this for later chats."
				)
				.addText((text) =>
					text
						.setPlaceholder("default")
						.setValue(this.plugin.settings.model)
						.onChange(async (value) => {
							this.plugin.settings.model = value.trim();
							// The freshly chosen default should win over past chat picks.
							delete this.plugin.settings.lastModel;
							await this.plugin.saveSettings();
						})
				),
			"model"
		);

		this.addSyncBadge(new Setting(containerEl)
			.setName("Default reasoning effort")
			.setDesc(
				"How much thinking Claude does per request. Higher levels are " +
					"slower and cost more. Can be changed per-conversation in the chat."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						"": "CLI default",
						low: "Low",
						medium: "Medium",
						high: "High",
						xhigh: "Extra high",
						max: "Max",
					})
					.setValue(this.plugin.settings.effort)
					.onChange(async (value) => {
						this.plugin.settings.effort = value;
						delete this.plugin.settings.lastEffort;
						await this.plugin.saveSettings();
					})
			), "effort");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Default permission mode")
			.setDesc(
				"How Claude asks before using tools. \"Default\" prompts in the chat " +
					"for anything sensitive; \"Accept edits\" auto-approves file edits " +
					"inside the vault; \"Plan\" is read-only. ⚠️ \"Auto-approve\" " +
					"answers every prompt for you, so Claude runs shell commands and " +
					"edits files with no confirmation - the CLI's own deny rules and " +
					"hooks still apply. Can be changed per-conversation in the chat."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						default: "Default (ask)",
						acceptEdits: "Accept edits",
						plan: "Plan (read-only)",
						auto: "⚠️ Auto-approve everything",
					})
					.setValue(this.plugin.settings.defaultPermissionMode)
					.onChange(async (value) => {
						this.plugin.settings.defaultPermissionMode = value as ChatPermissionMode;
						await this.plugin.saveSettings();
					})
			), "permissionMode");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Enable bypass-permissions mode")
			.setDesc(
				"⚠️ Adds a \"Bypass permissions\" option to the chat's mode picker. " +
					"In that mode Claude runs every tool - including shell commands - " +
					"without asking. Only enable this if you understand the risk."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBypassMode)
					.onChange(async (value) => {
						this.plugin.settings.enableBypassMode = value;
						await this.plugin.saveSettings();
					})
			), "bypass");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Give Claude the vault's link graph and metadata")
			.setDesc(
				"Adds Obsidian-native tools Claude cannot get from the filesystem: " +
					"rename a note without breaking its backlinks, list links and " +
					"backlinks, search by tag or frontmatter property, read and set " +
					"properties, and see which note you have open. They run inside " +
					"Obsidian over the connection the plugin already has - no port, no " +
					"config file, no extra process - and each call still asks permission. " +
					"Needs Claude Code 2.1.210 or newer."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableObsidianMcp)
					.onChange(async (value) => {
						this.plugin.settings.enableObsidianMcp = value;
						await this.plugin.saveSettings();
					})
			), "obsidianMcp");

		this.addSyncBadge(new Setting(containerEl)
			.setName('Enable the composer\'s "!" shell escape')
			.setDesc(
				'Typing "!" followed by a command in the chat runs it locally with ' +
					"the vault as its working directory and shows the output. You are " +
					"the one issuing it, so it does not go through Claude Code's " +
					"permission prompts, and neither the command nor its output is sent " +
					"to Claude unless you add it to the chat yourself."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBashMode)
					.onChange(async (value) => {
						this.plugin.settings.enableBashMode = value;
						await this.plugin.saveSettings();
					})
			), "bash");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Include note context by default")
			.setDesc(
				"Attach the active note's path (and your selection, if any) to each " +
					"message. Can be toggled per-message in the chat."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeContextByDefault)
					.onChange(async (value) => {
						this.plugin.settings.includeContextByDefault = value;
						await this.plugin.saveSettings();
					})
			), "context");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Conversation tabs")
			.setDesc(
				"Where the open conversations are listed. \"Top\" is a strip above " +
					"the transcript; \"Side\" is a column beside it, which reads " +
					"better with many chats; \"Automatic\" uses the column whenever " +
					"the panel is wide enough for one."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						top: "Top",
						side: "Side",
						auto: "Automatic (by panel width)",
					})
					.setValue(this.plugin.settings.tabPosition)
					.onChange(async (value) => {
						this.plugin.settings.tabPosition = value as TabPosition;
						await this.plugin.saveSettings();
						this.plugin.applyViewSettings();
					})
			), "tabPosition");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Vault instructions")
			.setDesc(
				"Extra instructions appended to Claude's system prompt for this vault " +
					"(e.g. note conventions, folder structure, tone). You can also keep " +
					"a CLAUDE.md file in the vault root - Claude Code reads it natively."
			)
			.addTextArea((text) => {
				text
					.setPlaceholder("e.g. Notes live in Areas/, use wiki-links, keep headings in Title Case…")
					.setValue(this.plugin.settings.vaultInstructions)
					.onChange(async (value) => {
						this.plugin.settings.vaultInstructions = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 4;
				text.inputEl.addClass("ai-agent-panel-settings-textarea");
			}), "instructions");

		new Setting(containerEl).setName("Plan usage").setHeading();

		this.addSyncBadge(new Setting(containerEl)
			.setName("Show usage strip")
			.setDesc(
				"Compact plan-usage summary (session and weekly limits) at the " +
					"bottom of the chat. Hover for details, click to refresh. The " +
					"numbers come from the running CLI session, which spends no " +
					"tokens on them - so they appear once a conversation is under way."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showUsage).onChange(async (value) => {
					this.plugin.settings.showUsage = value;
					await this.plugin.saveSettings();
					this.plugin.applyUsageSettings();
				})
			), "showUsage");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Usage refresh interval")
			.setDesc(
				'How often usage data is re-fetched while the strip is visible - e.g. "30s", ' +
					'"1m", "5m", "1h" (minimum 10s). Usage checks call a lightweight account ' +
					"endpoint - they never consume tokens or credits."
			)
			.addText((text) => {
				text
					.setPlaceholder("5m")
					.setValue(formatDurationSeconds(this.plugin.settings.usageRefreshSeconds))
					.onChange(async (value) => {
						const parsed = parseDurationSeconds(value);
						if (parsed === null) return; // ignore while the value is mid-edit
						this.plugin.settings.usageRefreshSeconds = Math.max(
							MIN_USAGE_REFRESH_SECONDS,
							parsed
						);
						await this.plugin.saveSettings();
						this.plugin.applyUsageSettings();
					});
				text.inputEl.addEventListener("blur", () => {
					// Settle the field on the value that was actually applied.
					text.setValue(
						formatDurationSeconds(this.plugin.settings.usageRefreshSeconds)
					);
				});
			}), "usageRefresh");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Usage warning threshold")
			.setDesc("Highlight a usage window in orange from this percentage.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.usageWarnPercent)
					.onChange(async (value) => {
						this.plugin.settings.usageWarnPercent = value;
						await this.plugin.saveSettings();
						this.plugin.applyUsageSettings();
					})
			), "usageWarn");

		this.addSyncBadge(new Setting(containerEl)
			.setName("Usage critical threshold")
			.setDesc("Highlight a usage window in red from this percentage.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 5)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.usageCritPercent)
					.onChange(async (value) => {
						this.plugin.settings.usageCritPercent = value;
						await this.plugin.saveSettings();
						this.plugin.applyUsageSettings();
					})
			), "usageCrit");

		new Setting(containerEl).setName("Transcript export").setHeading();

		this.addSyncBadge(new Setting(containerEl)
			.setName("Export transcripts to Markdown")
			.setDesc(
				"Keep a Markdown note of each conversation in your vault, updated " +
					"as the chat progresses. Past conversations export when they next " +
					"change; the \"Export conversation to Markdown\" command works " +
					"anytime. The badge covers the folder, name, and date settings too."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.exportEnabled)
					.onChange(async (value) => {
						this.plugin.settings.exportEnabled = value;
						await this.plugin.saveSettings();
						this.display(); // reveal/hide the folder setting
					})
			), "export");

		if (this.plugin.settings.exportEnabled) {
			new Setting(containerEl)
				.setName("Transcript folder")
				.setDesc("Vault folder the notes are written to; created if missing.")
				.addText((text) => {
					text
						.setPlaceholder("Agent Chats")
						.setValue(this.plugin.settings.exportFolder)
						.onChange(async (value) => {
							this.plugin.settings.exportFolder = value.trim();
							await this.plugin.saveSettings();
						});
					new FolderSuggest(this.app, text.inputEl);
				});

			new Setting(containerEl)
				.setName("Note name pattern")
				.setDesc(
					'Name inside the folder. Placeholders: {date}, {title}, {id}; "/" creates ' +
						"subfolders. Applies to conversations exported from now on."
				)
				.addText((text) =>
					text
						.setPlaceholder("{date} {title}")
						.setValue(this.plugin.settings.exportFilePattern)
						.onChange(async (value) => {
							this.plugin.settings.exportFilePattern = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Date format")
				.setDesc(
					"Moment format for {date} (the conversation's start time) - " +
						'e.g. "YYYY-MM-DD", "YYYY/MM" (subfolder per month).'
				)
				.addText((text) =>
					text
						.setPlaceholder("YYYY-MM-DD")
						.setValue(this.plugin.settings.exportDateFormat)
						.onChange(async (value) => {
							this.plugin.settings.exportDateFormat = value.trim();
							await this.plugin.saveSettings();
						})
				);
		}
	}

	/**
	 * CLI profile section. With a single profile this looks exactly like the
	 * old fixed path + WSL settings (the common case stays uncluttered); the
	 * profile list, names, and the default picker only appear once a second
	 * profile exists.
	 */
	private displayCliProfiles(containerEl: HTMLElement): void {
		const settings = this.plugin.settings;
		const several = settings.cliProfiles.length > 1;

		for (const profile of settings.cliProfiles) {
			let heading: Setting | null = null;
			if (several) {
				heading = new Setting(containerEl)
					.setName(profile.name || "Unnamed profile")
					.setHeading()
					.addExtraButton((btn) =>
						btn
							.setIcon("trash")
							.setTooltip("Remove this profile")
							.onClick(async () => {
								settings.cliProfiles = settings.cliProfiles.filter(
									(p) => p.id !== profile.id
								);
								if (settings.defaultProfileId === profile.id)
									settings.defaultProfileId = settings.cliProfiles[0].id;
								await this.plugin.saveSettings();
								// Down to one profile: the composer's Profile control goes.
								this.plugin.applyViewSettings();
								this.display();
							})
					);
				new Setting(containerEl)
					.setName("Profile name")
					.addText((text) =>
						text.setValue(profile.name).onChange(async (value) => {
							profile.name = value.trim();
							heading?.setName(profile.name || "Unnamed profile");
							await this.plugin.saveSettings();
						})
					);
			}

			new Setting(containerEl)
				.setName("Claude CLI path")
				.setDesc(
					"Path to the claude executable. Leave empty to auto-detect. " +
						"Requires Claude Code to be installed and logged in."
				)
				.addText((text) =>
					text
						.setPlaceholder("auto-detect")
						.setValue(profile.cliPath)
						.onChange(async (value) => {
							profile.cliPath = value.trim();
							await this.plugin.saveSettings();
						})
				)
				.addButton((btn) =>
					btn.setButtonText("Detect").onClick(async () => {
						const found = await detectClaudeCli(profile.useWsl);
						if (found) {
							profile.cliPath = found.path;
							profile.useWsl = found.useWsl;
							await this.plugin.saveSettings();
							this.display();
							new Notice(
								found.useWsl
									? `Found Claude Code in WSL: ${found.path}`
									: `Found Claude Code: ${found.path}`
							);
						} else {
							new Notice(
								"Claude Code CLI not found. Install it from https://code.claude.com"
							);
						}
					})
				);

			if (process.platform === "win32") {
				new Setting(containerEl)
					.setName("Run via WSL")
					.setDesc(
						"Launch the CLI inside WSL instead of Windows. Use this when " +
							"Claude Code is installed in your WSL distro. The CLI path " +
							"above is then interpreted inside WSL (e.g. just \"claude\")."
					)
					.addToggle((toggle) =>
						toggle.setValue(profile.useWsl).onChange(async (value) => {
							profile.useWsl = value;
							await this.plugin.saveSettings();
						})
					);
			}
		}

		if (several) {
			new Setting(containerEl)
				.setName("Default CLI profile")
				.setDesc(
					"Used for new chats and account lookups. Each chat can pick " +
						"another profile from its model button."
				)
				.addDropdown((dropdown) => {
					for (const profile of settings.cliProfiles)
						dropdown.addOption(profile.id, profile.name || "Unnamed profile");
					dropdown
						.setValue(settings.defaultProfileId)
						.onChange(async (value) => {
							settings.defaultProfileId = value;
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName("Add CLI profile")
			.setDesc(
				"Another way to launch Claude Code - e.g. a WSL install alongside " +
					"a Windows one. Chats can then choose which one to use."
			)
			.addButton((btn) =>
				btn.setButtonText("Add profile").onClick(async () => {
					// Name the migrated original after its platform so the pair is
					// tellable apart the moment a second profile appears.
					const first = settings.cliProfiles[0];
					if (settings.cliProfiles.length === 1 && first.name === "Default")
						first.name = first.useWsl ? "WSL" : "Default";
					settings.cliProfiles.push({
						id: newProfileId(),
						name: `Profile ${settings.cliProfiles.length + 1}`,
						cliPath: "",
						useWsl: false,
					});
					await this.plugin.saveSettings();
					// A second profile makes the composer's Profile control appear.
					this.plugin.applyViewSettings();
					this.display();
				})
			);
	}
}
