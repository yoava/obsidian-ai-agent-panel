import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Well-known install locations for the Claude Code CLI, checked in order. */
function candidatePaths(): string[] {
	const home = os.homedir();
	if (process.platform === "win32") {
		const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
		return [
			path.join(home, ".local", "bin", "claude.exe"),
			path.join(appData, "npm", "claude.cmd"),
		];
	}
	return [
		path.join(home, ".local", "bin", "claude"),
		path.join(home, ".claude", "local", "claude"),
		"/usr/local/bin/claude",
		"/opt/homebrew/bin/claude",
	];
}

function lookupInPath(): Promise<string | null> {
	const finder = process.platform === "win32" ? "where" : "which";
	return new Promise((resolve) => {
		execFile(finder, ["claude"], { timeout: 5000 }, (err, stdout) => {
			if (err) return resolve(null);
			resolve(pickLookupResult(stdout, process.platform));
		});
	});
}

/**
 * Choose a runnable line from `which`/`where` output. `where` lists every
 * match, and for an npm install the first is the extensionless POSIX sh shim,
 * which Windows cannot execute - prefer the real .exe, then the .cmd shim.
 */
export function pickLookupResult(
	stdout: string,
	platform: NodeJS.Platform = process.platform
): string | null {
	const lines = stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (platform !== "win32") return lines[0] ?? null;
	return (
		lines.find((line) => /\.exe$/i.test(line)) ??
		lines.find((line) => /\.(cmd|bat)$/i.test(line)) ??
		null
	);
}

/** Resolve claude inside the default WSL distro; a login shell gets the distro's PATH. */
function lookupInWsl(): Promise<string | null> {
	return new Promise((resolve) => {
		execFile(
			"wsl.exe",
			["--", "sh", "-lc", "command -v claude"],
			{ timeout: 15000 },
			(err, stdout) => {
				if (err) return resolve(null);
				const first = stdout.split("\n")[0]?.trim();
				resolve(first || null);
			}
		);
	});
}

export interface DetectedCli {
	/** Executable path — a Windows/mac path, or a distro path when useWsl is set. */
	path: string;
	/** True when the CLI was found inside WSL rather than on the host. */
	useWsl: boolean;
}

/**
 * Locate the claude executable. Checks well-known install locations first
 * (GUI apps often launch without the user's full shell PATH), then PATH.
 * On Windows the WSL distro is probed too; `preferWsl` decides which side
 * is checked first.
 */
export async function detectClaudeCli(preferWsl = false): Promise<DetectedCli | null> {
	const native = async (): Promise<DetectedCli | null> => {
		for (const candidate of candidatePaths()) {
			if (existsSync(candidate)) return { path: candidate, useWsl: false };
		}
		const found = await lookupInPath();
		return found ? { path: found, useWsl: false } : null;
	};
	const wsl = async (): Promise<DetectedCli | null> => {
		if (process.platform !== "win32") return null;
		const found = await lookupInWsl();
		return found ? { path: found, useWsl: true } : null;
	};
	for (const probe of preferWsl ? [wsl, native] : [native, wsl]) {
		const result = await probe();
		if (result) return result;
	}
	return null;
}
