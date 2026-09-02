import {
	AbstractInputSuggest,
	App,
	Notice,
	PluginSettingTab,
	requireApiVersion,
	Setting,
	TFolder,
	type ExtraButtonComponent,
	type SettingControl,
	type SettingDefinitionItem,
	type SettingGroupItem,
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

/**
 * The settings fields a declarative `control` row may bind to by key. All
 * plain strings, so one read/write pair covers every one of them.
 */
const BOUND_KEYS = ["defaultProfileId", "exportFilePattern", "exportDateFormat"] as const;
type BoundKey = (typeof BOUND_KEYS)[number];

function isBoundKey(key: string): key is BoundKey {
	return (BOUND_KEYS as readonly string[]).includes(key);
}

/** The controls this tab binds by key, in the subset both renderers support. */
type PanelControl =
	| { type: "text"; key: BoundKey; placeholder?: string }
	| { type: "dropdown"; key: BoundKey; options: Record<string, string> };

interface PanelRowBase {
	name: string;
	desc?: string;
	/** A SYNC_UNITS key: gives the row its cloud badge and name suffix. */
	unit?: string;
	visible?: () => boolean;
	/** False for rows that are structure rather than settings, e.g. a subheading. */
	searchable?: boolean;
}

/** A row whose controls are built imperatively against a `Setting`. */
interface PanelBuiltRow extends PanelRowBase {
	kind: "build";
	build: (setting: Setting) => void;
}

/** A row that is one control bound to one settings field. */
interface PanelControlRow extends PanelRowBase {
	kind: "control";
	control: PanelControl;
}

type PanelRow = PanelBuiltRow | PanelControlRow;

/** A section: a heading plus its rows. */
interface PanelGroup {
	heading?: string;
	/** A SYNC_UNITS key: gives the heading its cloud badge and name suffix. */
	unit?: string;
	visible?: () => boolean;
	/** Header buttons beyond the sync badge. */
	extraButtons?: ((btn: ExtraButtonComponent) => void)[];
	rows: PanelRow[];
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

/**
 * The plugin's settings tab.
 *
 * Obsidian renders this two different ways. From 1.13 it builds the tab from
 * `getSettingDefinitions()`, which is also what puts these settings into the
 * settings search; before that it calls `display()`. Both walk the single
 * `groups()` description below, so the two renderings cannot drift and every
 * name, description and default is written once.
 *
 * Most rows stay imperative (`kind: "build"`). That is not reluctance about
 * the declarative API: nearly every row carries a per-row cloud badge, a
 * definition has nowhere to put one, and a `render:` row is still indexed for
 * search by its name and description - which is the whole point.
 */
export class AgentPanelSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: AgentPanelPlugin) {
		super(app, plugin);
	}

	// -----------------------------------------------------------------------
	// Rendering - the two entry points, over one description
	// -----------------------------------------------------------------------

	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.groups().map((group) => {
			const buttons = [
				...(group.unit ? [this.syncBadge(group.unit)] : []),
				...(group.extraButtons ?? []),
			];
			return {
				type: "group",
				heading:
					group.heading === undefined
						? undefined
						: group.heading + this.syncSuffix(group.unit),
				visible: group.visible,
				extraButtons: buttons.length > 0 ? buttons : undefined,
				items: group.rows.map((row) => this.definitionFor(row)),
			};
		});
	}

	/** Pre-1.13 fallback. Not called once getSettingDefinitions() has items. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const group of this.groups()) {
			if (group.visible?.() === false) continue;
			if (group.heading !== undefined) {
				const heading = new Setting(containerEl)
					.setName(group.heading + this.syncSuffix(group.unit))
					.setHeading();
				if (group.unit) heading.addExtraButton(this.syncBadge(group.unit));
				for (const button of group.extraButtons ?? []) heading.addExtraButton(button);
			}
			for (const row of group.rows) {
				if (row.visible?.() === false) continue;
				this.renderRow(new Setting(containerEl), row);
			}
		}
	}

	private definitionFor(row: PanelRow): SettingGroupItem {
		const base = {
			name: row.name + this.syncSuffix(row.unit),
			desc: row.desc,
			visible: row.visible,
			searchable: row.searchable,
		};
		if (row.kind === "control") return { ...base, control: this.control(row.control) };
		return {
			...base,
			render: (setting: Setting) => {
				this.renderRow(setting, row);
			},
		};
	}

	/** Fill one `Setting` from a row description; used by both renderings. */
	private renderRow(setting: Setting, row: PanelRow): void {
		setting.setName(row.name + this.syncSuffix(row.unit));
		if (row.desc !== undefined) setting.setDesc(row.desc);
		if (row.kind === "build") row.build(setting);
		else this.addControl(setting, row.control);
		if (row.unit) setting.addExtraButton(this.syncBadge(row.unit));
	}

	private control(control: PanelControl): SettingControl {
		return control.type === "text"
			? { type: "text", key: control.key, placeholder: control.placeholder }
			: { type: "dropdown", key: control.key, options: control.options };
	}

	private addControl(setting: Setting, control: PanelControl): void {
		switch (control.type) {
			case "text":
				setting.addText((text) =>
					text
						.setPlaceholder(control.placeholder ?? "")
						.setValue(this.readBound(control.key))
						.onChange((value) => void this.writeBound(control.key, value))
				);
				return;
			case "dropdown":
				setting.addDropdown((dropdown) =>
					dropdown
						.addOptions(control.options)
						.setValue(this.readBound(control.key))
						.onChange((value) => void this.writeBound(control.key, value))
				);
				return;
		}
	}

	// -----------------------------------------------------------------------
	// Binding by key
	// -----------------------------------------------------------------------

	getControlValue(key: string): unknown {
		return isBoundKey(key) ? this.readBound(key) : undefined;
	}

	setControlValue(key: string, value: unknown): Promise<void> {
		if (!isBoundKey(key)) return Promise.resolve();
		return this.writeBound(key, String(value));
	}

	private readBound(key: BoundKey): string {
		return this.plugin.settings[key];
	}

	private async writeBound(key: BoundKey, value: string): Promise<void> {
		this.plugin.settings[key] = value.trim();
		await this.plugin.saveSettings();
	}

	// -----------------------------------------------------------------------
	// Re-rendering
	// -----------------------------------------------------------------------

	/**
	 * Re-render after a change to the tab's structure (a profile added, a badge
	 * flipped). update() arrived with the declarative API in 1.13; before that
	 * the tab has only display(). The version is spelled out rather than named
	 * as a constant because obsidianmd/no-unsupported-api reads the literal.
	 */
	private rerender(): void {
		if (requireApiVersion("1.13.0")) this.update();
		else this.display();
	}

	/**
	 * Re-evaluate the `visible` predicates after a change that only shows or
	 * hides rows. Cheap where the API exists; a full redraw where it does not.
	 */
	private refreshVisibility(): void {
		if (requireApiVersion("1.13.0")) this.refreshDomState();
		else this.display();
	}

	// -----------------------------------------------------------------------
	// The sync badge
	// -----------------------------------------------------------------------

	/** Marks a device-local row in its name, since the icon alone is subtle. */
	private syncSuffix(unit: string | undefined): string {
		return unit !== undefined && this.isLocal(unit) ? " (not synced)" : "";
	}

	private isLocal(unit: string): boolean {
		return this.plugin.settings.localGroups?.includes(unit) ?? false;
	}

	/**
	 * Notebook Navigator-style cloud badge: shows whether the row's settings
	 * sync across devices (cloud) or stay on this device (cloud-off); clicking
	 * the icon flips it. `unit` is a SYNC_UNITS key.
	 */
	private syncBadge(unit: string): (btn: ExtraButtonComponent) => void {
		const local = this.isLocal(unit);
		return (btn) => {
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
					this.rerender();
				});
		};
	}

	// -----------------------------------------------------------------------
	// The settings themselves
	// -----------------------------------------------------------------------

	private groups(): PanelGroup[] {
		const settings = this.plugin.settings;
		return [
			this.cliGroup(),
			{
				heading: "Conversations",
				rows: [
					{
						kind: "build",
						name: "Model",
						desc:
							'Model alias (e.g. "sonnet", "opus", "fable", "haiku") - always the ' +
							"latest of that family - or a full model id. " +
							"Leave empty to use your Claude Code default. Picking a model " +
							"in the chat overrides this for later conversations.",
						unit: "model",
						build: (setting) => {
							setting.addText((text) =>
								text
									.setPlaceholder("Default")
									.setValue(settings.model)
									.onChange(async (value) => {
										settings.model = value.trim();
										// The freshly chosen default should win over past chat picks.
										delete settings.lastModel;
										await this.plugin.saveSettings();
									})
							);
						},
					},
					{
						kind: "build",
						name: "Default reasoning effort",
						desc:
							"How much thinking Claude does per request. Higher levels are " +
							"slower and cost more. Can be changed per-conversation in the chat.",
						unit: "effort",
						build: (setting) => {
							setting.addDropdown((dropdown) =>
								dropdown
									.addOptions({
										"": "CLI default",
										low: "Low",
										medium: "Medium",
										high: "High",
										xhigh: "Extra high",
										max: "Max",
									})
									.setValue(settings.effort)
									.onChange(async (value) => {
										settings.effort = value;
										delete settings.lastEffort;
										await this.plugin.saveSettings();
									})
							);
						},
					},
					{
						kind: "build",
						name: "Default permission mode",
						desc:
							'How Claude asks before using tools. "Default" prompts in the chat ' +
							'for anything sensitive; "Accept edits" auto-approves file edits ' +
							'inside the vault; "Plan" is read-only. ⚠️ "Auto-approve" ' +
							"answers every prompt for you, so Claude runs shell commands and " +
							"edits files with no confirmation - the CLI's own deny rules and " +
							"hooks still apply. Can be changed per-conversation in the chat.",
						unit: "permissionMode",
						build: (setting) => {
							setting.addDropdown((dropdown) =>
								dropdown
									.addOptions({
										default: "Default (ask)",
										acceptEdits: "Accept edits",
										plan: "Plan (read-only)",
										auto: "⚠️ Auto-approve everything",
									})
									.setValue(settings.defaultPermissionMode)
									.onChange(async (value) => {
										settings.defaultPermissionMode = value as ChatPermissionMode;
										await this.plugin.saveSettings();
									})
							);
						},
					},
					{
						kind: "build",
						name: "Enable bypass-permissions mode",
						desc:
							'⚠️ Adds a "Bypass permissions" option to the chat\'s mode picker. ' +
							"In that mode Claude runs every tool - including shell commands - " +
							"without asking. Only enable this if you understand the risk.",
						unit: "bypass",
						build: (setting) => {
							setting.addToggle((toggle) =>
								toggle.setValue(settings.enableBypassMode).onChange(async (value) => {
									settings.enableBypassMode = value;
									await this.plugin.saveSettings();
								})
							);
						},
					},
					{
						kind: "build",
						name: "Give Claude the vault's link graph and metadata",
						desc:
							"Adds Obsidian-native tools Claude cannot get from the filesystem: " +
							"rename a note without breaking its backlinks, list links and " +
							"backlinks, search by tag or frontmatter property, read and set " +
							"properties, and see which note you have open. They run inside " +
							"Obsidian over the connection the plugin already has - no port, no " +
							"config file, no extra process - and each call still asks permission. " +
							"Needs Claude Code 2.1.210 or newer.",
						unit: "obsidianMcp",
						build: (setting) => {
							setting.addToggle((toggle) =>
								toggle.setValue(settings.enableObsidianMcp).onChange(async (value) => {
									settings.enableObsidianMcp = value;
									await this.plugin.saveSettings();
								})
							);
						},
					},
					{
						kind: "build",
						name: 'Enable the composer\'s "!" shell escape',
						desc:
							'Typing "!" followed by a command in the chat runs it locally with ' +
							"the vault as its working directory and shows the output. You are " +
							"the one issuing it, so it does not go through Claude Code's " +
							"permission prompts, and neither the command nor its output is sent " +
							"to Claude unless you add it to the chat yourself.",
						unit: "bash",
						build: (setting) => {
							setting.addToggle((toggle) =>
								toggle.setValue(settings.enableBashMode).onChange(async (value) => {
									settings.enableBashMode = value;
									await this.plugin.saveSettings();
								})
							);
						},
					},
					{
						kind: "build",
						name: "Include note context by default",
						desc:
							"Attach the active note's path (and your selection, if any) to each " +
							"message. Can be toggled per-message in the chat.",
						unit: "context",
						build: (setting) => {
							setting.addToggle((toggle) =>
								toggle
									.setValue(settings.includeContextByDefault)
									.onChange(async (value) => {
										settings.includeContextByDefault = value;
										await this.plugin.saveSettings();
									})
							);
						},
					},
					{
						kind: "build",
						name: "Conversation tabs",
						desc:
							'Where the open conversations are listed. "Top" is a strip above ' +
							'the transcript; "Side" is a column beside it, which reads ' +
							'better with many conversations; "Automatic" uses the column ' +
							"whenever the panel is wide enough for one.",
						unit: "tabPosition",
						build: (setting) => {
							setting.addDropdown((dropdown) =>
								dropdown
									.addOptions({
										top: "Top",
										side: "Side",
										auto: "Automatic (by panel width)",
									})
									.setValue(settings.tabPosition)
									.onChange(async (value) => {
										settings.tabPosition = value as TabPosition;
										await this.plugin.saveSettings();
										this.plugin.applyViewSettings();
									})
							);
						},
					},
					{
						kind: "build",
						name: "Vault instructions",
						desc:
							"Extra instructions appended to Claude's system prompt for this vault " +
							"(e.g. note conventions, folder structure, tone). You can also keep " +
							"a CLAUDE.md file in the vault root - Claude Code reads it natively.",
						unit: "instructions",
						build: (setting) => {
							setting.addTextArea((text) => {
								text
									.setPlaceholder(
										"E.g. Notes live in areas/, use wiki-links, keep headings in title case…"
									)
									.setValue(settings.vaultInstructions)
									.onChange(async (value) => {
										settings.vaultInstructions = value;
										await this.plugin.saveSettings();
									});
								text.inputEl.rows = 4;
								text.inputEl.addClass("ai-agent-panel-settings-textarea");
							});
						},
					},
				],
			},
			{
				heading: "Plan usage",
				rows: [
					{
						kind: "build",
						name: "Show usage strip",
						desc:
							"Compact plan-usage summary (session and weekly limits) at the " +
							"bottom of the chat. Hover for details, click to refresh. The " +
							"numbers come from the running CLI session, which spends no " +
							"tokens on them - so they appear once a conversation is under way.",
						unit: "showUsage",
						build: (setting) => {
							setting.addToggle((toggle) =>
								toggle.setValue(settings.showUsage).onChange(async (value) => {
									settings.showUsage = value;
									await this.plugin.saveSettings();
									this.plugin.applyUsageSettings();
								})
							);
						},
					},
					{
						kind: "build",
						name: "Usage refresh interval",
						desc:
							'How often usage data is re-fetched while the strip is visible - e.g. "30s", ' +
							'"1m", "5m", "1h" (minimum 10s). Usage checks call a lightweight account ' +
							"endpoint - they never consume tokens or credits.",
						unit: "usageRefresh",
						build: (setting) => {
							setting.addText((text) => {
								text
									.setPlaceholder("5m")
									.setValue(formatDurationSeconds(settings.usageRefreshSeconds))
									.onChange(async (value) => {
										const parsed = parseDurationSeconds(value);
										if (parsed === null) return; // ignore while the value is mid-edit
										settings.usageRefreshSeconds = Math.max(
											MIN_USAGE_REFRESH_SECONDS,
											parsed
										);
										await this.plugin.saveSettings();
										this.plugin.applyUsageSettings();
									});
								text.inputEl.addEventListener("blur", () => {
									// Settle the field on the value that was actually applied.
									text.setValue(formatDurationSeconds(settings.usageRefreshSeconds));
								});
							});
						},
					},
					{
						kind: "build",
						name: "Usage warning threshold",
						desc: "Highlight a usage window in orange from this percentage.",
						unit: "usageWarn",
						build: (setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(0, 100, 5)
									.setValue(settings.usageWarnPercent)
									.onChange(async (value) => {
										settings.usageWarnPercent = value;
										await this.plugin.saveSettings();
										this.plugin.applyUsageSettings();
									})
							);
						},
					},
					{
						kind: "build",
						name: "Usage critical threshold",
						desc: "Highlight a usage window in red from this percentage.",
						unit: "usageCrit",
						build: (setting) => {
							setting.addSlider((slider) =>
								slider
									.setLimits(0, 100, 5)
									.setValue(settings.usageCritPercent)
									.onChange(async (value) => {
										settings.usageCritPercent = value;
										await this.plugin.saveSettings();
										this.plugin.applyUsageSettings();
									})
							);
						},
					},
				],
			},
			{
				heading: "Transcript export",
				rows: [
					{
						kind: "build",
						name: "Export transcripts to Markdown",
						desc:
							"Keep a Markdown transcript of each conversation in your vault, " +
							"updated as it progresses. Past conversations export when they next " +
							'change; the "Export conversation to Markdown" command works ' +
							"anytime. The badge covers the folder, name, and date settings too.",
						unit: "export",
						build: (setting) => {
							setting.addToggle((toggle) =>
								toggle.setValue(settings.exportEnabled).onChange(async (value) => {
									settings.exportEnabled = value;
									await this.plugin.saveSettings();
									this.refreshVisibility(); // reveal/hide the three rows below
								})
							);
						},
					},
					{
						kind: "build",
						name: "Transcript folder",
						desc: "Vault folder the transcripts are written to; created if missing.",
						visible: () => settings.exportEnabled,
						// Kept imperative for its folder autocomplete: the declarative
						// 'folder' control has its own suggester, and swapping to it is a
						// behaviour change that wants checking in a vault first.
						build: (setting) => {
							setting.addText((text) => {
								text
									.setPlaceholder("Agent Chats")
									.setValue(settings.exportFolder)
									.onChange(async (value) => {
										settings.exportFolder = value.trim();
										await this.plugin.saveSettings();
									});
								new FolderSuggest(this.app, text.inputEl);
							});
						},
					},
					{
						kind: "control",
						name: "Note name pattern",
						desc:
							'Name inside the folder. Placeholders: {date}, {title}, {id}; "/" creates ' +
							"subfolders. Applies to conversations exported from now on.",
						visible: () => settings.exportEnabled,
						control: {
							type: "text",
							key: "exportFilePattern",
							placeholder: "{date} {title}",
						},
					},
					{
						kind: "control",
						name: "Date format",
						desc:
							"Moment format for {date} (the conversation's start time) - " +
							'e.g. "YYYY-MM-DD", "YYYY/MM" (subfolder per month).',
						visible: () => settings.exportEnabled,
						control: {
							type: "text",
							key: "exportDateFormat",
							placeholder: "YYYY-MM-DD",
						},
					},
				],
			},
		];
	}

	/**
	 * The CLI section. With a single profile this looks exactly like the old
	 * fixed path + WSL settings (the common case stays uncluttered); the
	 * profile list, names, and the default picker only appear once a second
	 * profile exists.
	 */
	private cliGroup(): PanelGroup {
		const settings = this.plugin.settings;
		const several = settings.cliProfiles.length > 1;
		const rows: PanelRow[] = [];

		for (const profile of settings.cliProfiles) {
			if (several) {
				// Captured by the name row below, so renaming retitles the block
				// as you type rather than at the next redraw.
				let heading: Setting | null = null;
				rows.push({
					kind: "build",
					name: profile.name || "Unnamed profile",
					// A subheading for the block below it, not a setting of its own.
					searchable: false,
					build: (setting) => {
						heading = setting.setHeading().addExtraButton((btn) =>
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
									this.rerender();
								})
						);
					},
				});
				rows.push({
					kind: "build",
					name: "Profile name",
					build: (setting) => {
						setting.addText((text) =>
							text.setValue(profile.name).onChange(async (value) => {
								profile.name = value.trim();
								heading?.setName(profile.name || "Unnamed profile");
								await this.plugin.saveSettings();
							})
						);
					},
				});
			}
			rows.push(...this.profileRows(profile));
		}

		if (several) {
			rows.push({
				kind: "control",
				name: "Default CLI profile",
				desc:
					"Used for new chats and account lookups. Each chat can pick " +
					"another profile from its model button.",
				control: {
					type: "dropdown",
					key: "defaultProfileId",
					options: Object.fromEntries(
						settings.cliProfiles.map((p) => [p.id, p.name || "Unnamed profile"])
					),
				},
			});
		}

		rows.push({
			kind: "build",
			name: "Add CLI profile",
			desc:
				"Another way to launch Claude Code - e.g. a WSL install alongside " +
				"a Windows one. Chats can then choose which one to use.",
			build: (setting) => {
				setting.addButton((btn) =>
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
						this.rerender();
					})
				);
			},
		});

		return { heading: "Claude Code CLI", unit: "cli", rows };
	}

	/** The path (with its Detect button) and, on Windows, the WSL toggle. */
	private profileRows(profile: CliProfile): PanelRow[] {
		const rows: PanelRow[] = [
			{
				kind: "build",
				name: "Claude CLI path",
				desc:
					"Path to the claude executable. Leave empty to auto-detect. " +
					"Requires Claude Code to be installed and logged in.",
				build: (setting) => {
					setting
						.addText((text) =>
							text
								.setPlaceholder("Auto-detect")
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
									this.rerender();
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
				},
			},
		];

		if (process.platform === "win32") {
			rows.push({
				kind: "build",
				name: "Run via WSL",
				desc:
					"Launch the CLI inside WSL instead of Windows. Use this when " +
					"Claude Code is installed in your WSL distro. The CLI path " +
					'above is then interpreted inside WSL (e.g. just "claude").',
				build: (setting) => {
					setting.addToggle((toggle) =>
						toggle.setValue(profile.useWsl).onChange(async (value) => {
							profile.useWsl = value;
							await this.plugin.saveSettings();
						})
					);
				},
			});
		}

		return rows;
	}
}
