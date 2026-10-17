/**
 * Whether a CLI profile's Claude Code is known missing, for this run (DES-002 Missing CLI): the checks that cost
 * nothing, what a start reports, and the wording the settings page and a failed start draw from it. No DOM, no Node:
 * the caller gives the checks. Nothing here is stored; a result belongs to the configuration, and the edit of it, it
 * checked.
 */
import { profileLabel, type CliProfile } from "../settings-core";

export type MissingProfile = Pick<CliProfile, "id" | "name" | "cliPath" | "useWsl">;

/** The configuration a check ran against: where the CLI is looked for, and which edit of the profile that was. */
export interface CliConfig {
	cliPath: string;
	useWsl: boolean;
	/** Counts the profile's path and WSL changes this run, so a path changed and changed back is a new configuration. */
	revision: number;
	/** When it was taken: a search that began then reports as of then, so it never replaces a later observation. */
	at: number;
}

/** The checks the state runs itself; the caller owns the file system and the processes. */
export interface CliChecks {
	/** Whether a configured native path is absent where a launch would look; false when that cannot be told. */
	pathMissing(cliPath: string): boolean;
	/** Look for the CLI on this device only, with no WSL probe: its path, or null. */
	detectNative(): Promise<string | null>;
	/** A native auto-detect found the CLI for a configuration the profile still has. */
	found(id: string, path: string): void;
}

/** The reports a session link gives about a start (DES-002 Missing CLI); `checked` is the configuration it resolved. */
export interface CliStartReports {
	/** Before the session is created: the message when the configured native path does not exist, else null. */
	absent(profile: MissingProfile, checked: CliConfig | null): string | null;
	/** A process reached `system/init`. */
	reached(profile: MissingProfile, checked: CliConfig | null): void;
	/** A process exited before `system/init`; the message to show for it when that means the CLI is missing, else null. */
	exitedBeforeInit(profile: MissingProfile, checked: CliConfig | null, info: { code: number | null; useWsl: boolean }): string | null;
}

/** One profile's last result, and the configuration it belongs to. */
interface Result {
	key: string;
	revision: number;
	missing: boolean;
	/** When it was observed, on the state's own clock. */
	at: number;
}

export class CliMissing implements CliStartReports {
	/** The configuration last seen per profile, and its revision. */
	private readonly seen = new Map<string, { key: string; revision: number }>();
	private readonly results = new Map<string, Result>();
	/** Detections under way, by profile and configuration, so a page shown twice runs one. */
	private readonly claims = new Set<string>();
	/** Detections that answered, by profile and configuration: on Windows a miss leaves no result, and is not run again. */
	private readonly tried = new Set<string>();
	private readonly listeners = new Set<() => void>();
	/** Orders observations: a later one wins, whichever answers first. */
	private clock = 0;

	constructor(
		private readonly profiles: () => readonly MissingProfile[],
		private readonly checks: CliChecks,
		private readonly platform: NodeJS.Platform = process.platform
	) {}

	/**
	 * Take in path and WSL edits, from wherever they came (an edit, Detect, a reset, its Undo): a profile whose
	 * configuration differs from the one last seen gets a new revision and loses its result; a removed one is forgotten.
	 * Run on every save of the settings, and before every check.
	 */
	sync(): void {
		let dropped = false;
		const ids = new Set<string>();
		for (const profile of this.profiles()) {
			ids.add(profile.id);
			const key = this.keyOf(profile);
			const seen = this.seen.get(profile.id);
			if (seen?.key === key) continue;
			this.seen.set(profile.id, { key, revision: seen ? seen.revision + 1 : 0 });
			dropped = this.results.delete(profile.id) || dropped;
		}
		for (const id of [...this.seen.keys()]) {
			if (ids.has(id)) continue;
			this.seen.delete(id);
			dropped = this.results.delete(id) || dropped;
		}
		if (dropped) this.notify();
	}

	/** The profile's configuration now, to check against; null for a profile that does not exist. */
	snapshot(id: string): CliConfig | null {
		this.sync();
		const profile = this.profile(id);
		const seen = this.seen.get(id);
		return profile && seen ? { cliPath: profile.cliPath, useWsl: profile.useWsl, revision: seen.revision, at: ++this.clock } : null;
	}

	/** Whether the profile still has the configuration `checked` was taken of. */
	holds(id: string, checked: CliConfig | null): boolean {
		const now = this.snapshot(id);
		return checked !== null && now !== null && now.revision === checked.revision && this.keyOf(now) === this.keyOf(checked);
	}

	/** Whether a result is known for the profile's configuration now. */
	known(id: string): boolean {
		return this.current(id) !== undefined;
	}

	isMissing(id: string): boolean {
		return this.current(id)?.missing === true;
	}

	/** The profiles whose CLI is known missing, in the settings' order. */
	missing(): MissingProfile[] {
		return this.profiles().filter((profile) => this.isMissing(profile.id));
	}

	/**
	 * Record what a check of `checked` found, observed at `at` (now, unless a search that began earlier answers); dropped
	 * unless the profile still has that configuration and nothing later was observed. Whether it applied.
	 */
	apply(id: string, checked: CliConfig | null, found: boolean, at = ++this.clock): boolean {
		if (!checked || !this.holds(id, checked)) return false;
		if ((this.current(id)?.at ?? -1) > at) return false;
		const before = this.isMissing(id);
		this.results.set(id, { key: this.keyOf(checked), revision: checked.revision, missing: !found, at });
		if (this.isMissing(id) !== before) this.notify();
		return true;
	}

	/**
	 * A Detect or an auto-detect of `checked` found nothing: with no path the profile is missing, as of when the search
	 * began; a configured native path is judged by its own check, made now, as `check` does; a path read inside WSL is
	 * not judged.
	 */
	missed(id: string, checked: CliConfig | null): void {
		if (!checked) return;
		if (checked.cliPath === "") this.apply(id, checked, false, checked.at);
		else if (!this.effectiveWsl(checked)) this.apply(id, checked, !this.checks.pathMissing(checked.cliPath));
	}

	/**
	 * Look where that costs nothing (the settings page shows, a path or WSL edit): a configured native path on disk, each
	 * time; an empty one auto-detected on this device once per configuration. WSL is not probed: a WSL profile keeps its
	 * state, and on Windows a native miss says nothing, since the CLI may be in WSL.
	 */
	check(id: string): void {
		const config = this.snapshot(id);
		if (!config || this.effectiveWsl(config)) return;
		if (config.cliPath !== "") {
			this.apply(id, config, !this.checks.pathMissing(config.cliPath));
			return;
		}
		const claim = `${id}\0${config.revision}`;
		if (this.known(id) || this.claims.has(claim) || this.tried.has(claim)) return;
		this.claims.add(claim);
		void this.checks
			.detectNative()
			.then((path) => {
				this.tried.add(claim);
				if (path !== null) {
					if (this.holds(id, config)) this.checks.found(id, path);
					this.apply(id, config, true, config.at);
				} else if (this.platform !== "win32") this.apply(id, config, false, config.at);
			})
			.catch(() => undefined)
			.finally(() => this.claims.delete(claim));
	}

	absent(profile: MissingProfile, checked: CliConfig | null): string | null {
		if (!checked || checked.cliPath === "" || this.effectiveWsl(checked)) return null;
		const missing = this.checks.pathMissing(checked.cliPath);
		this.apply(profile.id, checked, !missing);
		return missing ? startMessage({ ...profile, cliPath: checked.cliPath, useWsl: checked.useWsl }, this.platform) : null;
	}

	reached(profile: MissingProfile, checked: CliConfig | null): void {
		this.apply(profile.id, checked, true);
	}

	exitedBeforeInit(profile: MissingProfile, checked: CliConfig | null, info: { code: number | null; useWsl: boolean }): string | null {
		if (!checked || !wslNotFound(info.code, info.useWsl)) return null;
		this.apply(profile.id, checked, false);
		return startMessage({ ...profile, cliPath: checked.cliPath, useWsl: checked.useWsl }, this.platform);
	}

	/** Called when a profile's missing state may have changed; returns what takes the listener back. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => void this.listeners.delete(listener);
	}

	private profile(id: string): MissingProfile | undefined {
		return this.profiles().find((candidate) => candidate.id === id);
	}

	/** The result for the profile's configuration now; an edit not yet synced leaves none. */
	private current(id: string): Result | undefined {
		const profile = this.profile(id);
		const result = this.results.get(id);
		const seen = this.seen.get(id);
		return profile && result && seen && result.revision === seen.revision && result.key === this.keyOf(profile) ? result : undefined;
	}

	private effectiveWsl(config: Pick<CliConfig, "useWsl">): boolean {
		return config.useWsl && this.platform === "win32";
	}

	private keyOf(config: Pick<CliConfig, "cliPath" | "useWsl">): string {
		return `${this.effectiveWsl(config) ? "wsl" : "native"}\0${config.cliPath}`;
	}

	private notify(): void {
		for (const listener of [...this.listeners]) listener();
	}
}

const inWsl = (profile: MissingProfile, platform: NodeJS.Platform): boolean => profile.useWsl && platform === "win32";

/** Where Claude Code was looked for: in WSL, at the configured path, or on this device (auto-detect). */
export function missingWhere(profile: MissingProfile, platform: NodeJS.Platform = process.platform): string {
	if (inWsl(profile, platform)) return "in WSL";
	return profile.cliPath !== "" ? `at ${profile.cliPath}` : "on this device";
}

/** The banner's sentence for a profile whose CLI is missing (DES-001 Settings page). */
export function bannerText(profile: MissingProfile, platform: NodeJS.Platform = process.platform): string {
	return `Claude Code was not found ${missingWhere(profile, platform)}, so the ${profileLabel(profile)} profile can’t start conversations.`;
}

/** The notice in the profile's own rows. */
export function noticeText(profile: MissingProfile, platform: NodeJS.Platform = process.platform): string {
	const fix = inWsl(profile, platform) ? "Install it in the distro, or set the path and press Detect." : "Install it, or set the path and press Detect.";
	return `Claude Code was not found ${missingWhere(profile, platform)}. ${fix}`;
}

/** What a conversation shows when its profile's CLI is not found at a start (PRD-001.R6, DES-002 failures): the path, the profile, the settings. */
export function startMessage(profile: MissingProfile, platform: NodeJS.Platform = process.platform): string {
	const wsl = inWsl(profile, platform);
	const where = wsl && profile.cliPath !== "" ? `in WSL at ${profile.cliPath}` : missingWhere(profile, platform);
	const fix = wsl ? "Install it in the distro, or set the path in Settings → AI Agent Panel." : "Fix the path in Settings → AI Agent Panel.";
	return `Claude Code was not found ${where} (the ${profileLabel(profile)} profile). ${fix}`;
}

/** An exit code of 127 from a WSL launch: the distro's shell did not find the binary. */
export function wslNotFound(code: number | null, useWsl: boolean): boolean {
	return useWsl && code === 127;
}
