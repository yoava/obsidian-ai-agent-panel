/**
 * Reset to default (DES-001 Settings page Reset, DES-005 Reset and Undo): the plan for a row, a section or
 * everything, the patches that apply it, the inverse an Undo applies, and the words of the dialog and the
 * notices. No DOM and no Obsidian; `settings` applies a plan and holds the Undo while its notice shows.
 */
import { SYNC_UNITS, sanitizeLocalGroups, type AgentPanelSettings } from "../settings-core";
import { rowReset, type ResetPatch } from "./settings-rows";

/** A reset writes keys or a profile field (`settings-rows`), or, with "Also reset what syncs", the sync choices. */
export type Patch = ResetPatch | { kind: "groups"; value: string[] };

/** The two extra choices of "Reset all…", both off by default. */
export interface ResetOptions {
	/** Also reset the Claude Code section. */
	claudeCode: boolean;
	/** Also put every sync badge back to its default. */
	syncs: boolean;
}

export type ResetScope = { kind: "row"; id: string } | { kind: "section"; section: string } | { kind: "all" };

/** A row the plan may reset: its id, section key and name as the dialog shows it (a profile row prefixed with the profile). */
export interface PlanRow {
	id: string;
	section: string;
	name: string;
}

/** One change the dialog lists. */
export interface PlanChange {
	id: string;
	section: string;
	name: string;
	/** The value now as shown; typed text by its first line (`shownText`). */
	old: string;
	/** The value after the reset, as shown. */
	new: string;
	/** Where the unit stores the value once the plan is applied. */
	store: "synced" | "device";
	/** The reset switches a capability on. */
	turnsOn: boolean;
}

/** What an Undo does for one patch: the patch the reset wrote, which a target must still hold, and the values before it. */
export interface InverseEntry {
	name: string;
	wrote: Patch;
	restore: Patch;
}

export interface ResetPlan {
	scope: ResetScope;
	options: ResetOptions;
	/** What the notice calls it: the row's name, the section's, or "All settings". */
	label: string;
	/** What the dialog lists, in page order. */
	changes: PlanChange[];
	/** The Claude Code changes the option adds to everything; listed whether or not it is on. */
	claudeCode: PlanChange[];
	/** This device's sync choices differ from the defaults. */
	syncsDiffer: boolean;
	patches: Patch[];
	inverse: InverseEntry[];
	/** The sections the changes are in, with their titles, in page order. */
	sections: { key: string; label: string }[];
}

/** The Undo a notice holds in memory; never stored. */
export interface UndoRecord {
	label: string;
	/** The rows the reset touched, to redraw. */
	rows: string[];
	/** The reset moved sync choices: every row's badge changes. */
	moved: boolean;
	inverse: InverseEntry[];
	/** `reset` until an Undo has restored memory; then `restored`, so asking again does not restore a second time. */
	phase: "reset" | "restored";
	/** What the restore left, named. */
	skipped: string[];
}

export interface PlanInput {
	rows: readonly PlanRow[];
	sections: readonly { key: string; label: string }[];
	settings: AgentPanelSettings;
	scope: ResetScope;
	options?: Partial<ResetOptions>;
}

/** Settings whose reset from off to on switches a capability on. */
const CAPABILITIES: readonly string[] = ["enableObsidianMcp", "enableBashMode", "includeContextByDefault"];

/** The name of the sync choices in an Undo's account of what it left. */
const SYNC_NAME = "Sync choices";

const MAX_SHOWN = 60;

/** The default-local sync units: what "Also reset what syncs" puts `localGroups` back to. */
const defaultGroups = (): string[] => sanitizeLocalGroups(undefined);

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === new Set(a).size && new Set(a).size === new Set(b).size && a.every((key) => b.includes(key));

/** `text` by its first non-blank line, cut at 60 characters; an ellipsis marks anything left out. */
export function shownText(text: string): string {
	const lines = text.split(/\r?\n/);
	const at = lines.findIndex((line) => line.trim() !== "");
	if (at < 0) return "";
	const characters = Array.from(lines[at].trim());
	const more = characters.length > MAX_SHOWN || lines.slice(at + 1).some((line) => line.trim() !== "");
	return characters.slice(0, MAX_SHOWN).join("") + (more ? "…" : "");
}

/** The sync unit that stores a patch's setting. */
function unitOf(patch: Patch): string | undefined {
	if (patch.kind === "profile") return "cli";
	if (patch.kind === "groups") return undefined;
	const key = Object.keys(patch.set)[0];
	return SYNC_UNITS.find((unit) => (unit.settings as string[]).includes(key))?.key;
}

const valueOf = (settings: AgentPanelSettings, key: string): unknown => (settings as unknown as Record<string, unknown>)[key];

/** The patch that puts back what `patch` overwrites, read from `settings` before it is applied. */
function restoreOf(settings: AgentPanelSettings, patch: Patch): Patch {
	switch (patch.kind) {
		case "keys":
			return { kind: "keys", set: Object.fromEntries(Object.keys(patch.set).map((key) => [key, valueOf(settings, key)])) };
		case "profile": {
			const profile = settings.cliProfiles.find((candidate) => candidate.id === patch.id);
			return { ...patch, value: profile?.[patch.field] ?? "" };
		}
		case "groups":
			return { kind: "groups", value: [...(settings.localGroups ?? [])] };
	}
}

/** Whether the target of `patch` holds the value the patch writes. */
function holds(settings: AgentPanelSettings, patch: Patch): boolean {
	switch (patch.kind) {
		case "keys":
			return Object.entries(patch.set).every(([key, value]) => valueOf(settings, key) === value);
		case "profile":
			return settings.cliProfiles.find((candidate) => candidate.id === patch.id)?.[patch.field] === patch.value;
		case "groups":
			return sameSet(settings.localGroups ?? [], patch.value);
	}
}

/** Write `patches` into the loaded settings, in place: a key set to `undefined` is removed, a profile that is gone is left out. */
export function applyPatches(settings: AgentPanelSettings, patches: readonly Patch[]): void {
	const target = settings as unknown as Record<string, unknown>;
	for (const patch of patches) {
		switch (patch.kind) {
			case "keys":
				for (const [key, value] of Object.entries(patch.set)) {
					if (value === undefined) delete target[key];
					else target[key] = value;
				}
				break;
			case "profile": {
				const profile = settings.cliProfiles.find((candidate) => candidate.id === patch.id);
				if (profile) profile[patch.field] = patch.value as never;
				break;
			}
			case "groups":
				settings.localGroups = [...patch.value];
				break;
		}
	}
}

/** The plan for `scope` (DES-005 Reset and Undo): what changes, how to apply it and how to take it back. */
export function planReset(input: PlanInput): ResetPlan {
	const { settings, scope } = input;
	const options: ResetOptions = { claudeCode: false, syncs: false, ...input.options };
	const current = settings.localGroups ?? [];
	const groups = options.syncs ? defaultGroups() : current;
	const entries: { change: PlanChange; patches: Patch[] }[] = [];
	for (const row of input.rows) {
		if (scope.kind === "row" ? row.id !== scope.id : scope.kind === "section" && row.section !== scope.section) continue;
		const reset = rowReset(row.id, settings);
		if (!reset) continue;
		const unit = unitOf(reset.patches[0]);
		const turnsOn = reset.patches.some((patch) => patch.kind === "keys" && Object.entries(patch.set).some(([key, value]) => CAPABILITIES.includes(key) && value === true && valueOf(settings, key) === false));
		entries.push({
			change: {
				id: row.id,
				section: row.section,
				name: row.name,
				old: reset.text ? shownText(reset.value) : reset.value,
				new: reset.defaultText,
				store: unit !== undefined && groups.includes(unit) ? "device" : "synced",
				turnsOn,
			},
			patches: reset.patches,
		});
	}
	const claudeCode = entries.filter((entry) => entry.change.section === "cli").map((entry) => entry.change);
	const used = scope.kind === "all" && !options.claudeCode ? entries.filter((entry) => entry.change.section !== "cli") : entries;
	const patches: Patch[] = used.flatMap((entry) => entry.patches);
	const inverse: InverseEntry[] = used.flatMap((entry) => entry.patches.map((patch) => ({ name: entry.change.name, wrote: patch, restore: restoreOf(settings, patch) })));
	const syncsDiffer = !sameSet(current, defaultGroups());
	if (scope.kind === "all" && options.syncs && syncsDiffer) {
		const patch: Patch = { kind: "groups", value: defaultGroups() };
		inverse.push({ name: SYNC_NAME, wrote: patch, restore: restoreOf(settings, patch) });
		patches.push(patch);
	}
	const changes = used.map((entry) => entry.change);
	const label = scope.kind === "all" ? "All settings" : scope.kind === "section" ? (input.sections.find((section) => section.key === scope.section)?.label ?? scope.section) : (input.rows.find((row) => row.id === scope.id)?.name ?? scope.id);
	return {
		scope,
		options,
		label,
		changes,
		claudeCode,
		syncsDiffer,
		patches,
		inverse,
		sections: input.sections.filter((section) => changes.some((change) => change.section === section.key)).map(({ key, label: title }) => ({ key, label: title })),
	};
}

/** Per section key, how many rows a reset of that section changes: every modified row in it, shown or not. */
export function resetCounts(input: Omit<PlanInput, "scope" | "options">): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const change of planReset({ ...input, scope: { kind: "all" }, options: { claudeCode: true } }).changes) counts[change.section] = (counts[change.section] ?? 0) + 1;
	return counts;
}

/** Whether two plans would do the same: the dialog's plan against the one built again at Confirm. */
export function samePlan(a: ResetPlan, b: ResetPlan): boolean {
	const key = (plan: ResetPlan): string =>
		JSON.stringify({ options: plan.options, changes: plan.changes, patches: plan.patches, inverse: plan.inverse }, (_, value: unknown) => (value === undefined ? "\u0000undefined" : value));
	return key(a) === key(b);
}

/** The Undo for a plan that has just been applied. */
export function startUndo(plan: ResetPlan): UndoRecord {
	return {
		label: plan.label,
		rows: plan.changes.map((change) => change.id),
		moved: plan.patches.some((patch) => patch.kind === "groups"),
		inverse: plan.inverse,
		phase: "reset",
		skipped: [],
	};
}

/**
 * Put back each value still holding what the reset wrote, in memory, and name what it left. A target that
 * holds another value now, or a profile since removed, is left. The restore happens once: asking again, after
 * its save failed, answers the same without restoring over later edits.
 */
export function undoReset(settings: AgentPanelSettings, record: UndoRecord): { skipped: string[] } {
	if (record.phase === "restored") return { skipped: record.skipped };
	const skipped: string[] = [];
	for (const entry of record.inverse) {
		if (holds(settings, entry.wrote)) applyPatches(settings, [entry.restore]);
		else if (!skipped.includes(entry.name)) skipped.push(entry.name);
	}
	record.phase = "restored";
	record.skipped = skipped;
	return { skipped };
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The dialog's title. */
export function planTitle(plan: ResetPlan): string {
	return plan.scope.kind === "all" ? "Reset all settings to default?" : `Reset ${plan.label} to default?`;
}

/** The dialog's count line and where the changes are stored. */
export function planSummary(plan: ResetPlan): string {
	const n = plan.changes.length;
	if (n === 0) return plan.options.syncs && plan.syncsDiffer ? "Only the sync choices change." : "No settings differ from their defaults.";
	const head =
		plan.scope.kind === "all"
			? `${count(n, "setting", "settings")} in ${count(plan.sections.length, "section", "sections")} ${n === 1 ? "changes" : "change"}.`
			: `${count(n, "setting", "settings")} ${n === 1 ? "changes" : "change"}.`;
	if (plan.changes.some((change) => change.store === "synced")) return `${head} Synced ones (cloud) change on every device that syncs this vault.`;
	return `${head} ${n === 1 ? "It is" : n === 2 ? "Both are" : "All are"} stored on this device only.`;
}

/** The confirming button's text. */
export function confirmLabel(plan: ResetPlan): string {
	const n = plan.changes.length;
	if (n === 0 && plan.options.syncs && plan.syncsDiffer) return "Reset sync choices";
	return `Reset ${count(n, "setting", "settings")}`;
}

/** What "Also reset Claude Code" adds, as the checkbox describes it. */
export function claudeCodeNote(plan: ResetPlan): string {
	return plan.claudeCode.length === 0 ? "No Claude Code setting differs from its default." : `${plan.claudeCode.map((change) => `${change.name} to ${change.new}`).join("; ")}.`;
}

/** The notice after a reset. */
export function resetNotice(plan: ResetPlan): string {
	return plan.scope.kind === "all" ? "All settings reset to default." : `${plan.label} reset to default.`;
}

/** The notice after an Undo; names what it left. */
export function undoneNotice(skipped: readonly string[]): string {
	if (skipped.length === 0) return "Undone.";
	const named = skipped.length === 1 ? skipped[0] : `${skipped.slice(0, -1).join(", ")} and ${skipped[skipped.length - 1]}`;
	return `Undone, except ${named}, changed since.`;
}

/** The notice when a save fails. */
export function failureNotice(message: string): string {
	return `Could not save the settings: ${message}`;
}
