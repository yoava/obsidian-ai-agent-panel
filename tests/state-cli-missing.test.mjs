import { test } from "node:test";
import assert from "node:assert/strict";
import { CliMissing, bannerText, missingWhere, noticeText, startMessage, wslNotFound } from "./.build/state/cli-missing.mjs";

const profile = (id, fields = {}) => ({ id, name: id.toUpperCase(), cliPath: "", useWsl: false, ...fields });

/** Lets the stand-in detection's promise settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A state over a list the test edits in place, as the settings do. `absent` lists the paths the stand-in file check
 * misses; `detect` is what the stand-in native auto-detect answers (a path, null, or a function returning a promise).
 */
function setup(profiles, { platform = "linux", absent = [], detect = null } = {}) {
	const calls = { pathMissing: [], detects: 0, found: [] };
	const checks = {
		pathMissing: (cliPath) => (calls.pathMissing.push(cliPath), absent.includes(cliPath)),
		detectNative: () => (calls.detects++, typeof detect === "function" ? detect() : Promise.resolve(detect)),
		found: (id, path) => calls.found.push([id, path]),
	};
	const state = new CliMissing(() => profiles, checks, platform);
	return { state, profiles, calls };
}

test("PRD-001.R39: nothing is missing before any check, and nothing is known", () => {
	const { state } = setup([profile("a")]);
	assert.equal(state.isMissing("a"), false);
	assert.equal(state.known("a"), false);
	assert.deepEqual(state.missing(), []);
});

test("PRD-001.R39: a native path reported absent is missing; a successful check of it clears the state", () => {
	const { state } = setup([profile("a", { cliPath: "/x/claude" })]);
	assert.equal(state.apply("a", state.snapshot("a"), false), true);
	assert.equal(state.isMissing("a"), true);
	assert.deepEqual(state.missing().map((p) => p.id), ["a"]);
	state.reached(profile("a"), state.snapshot("a"));
	assert.equal(state.isMissing("a"), false);
	assert.equal(state.known("a"), true);
});

test("PRD-001.R39: missing lists the profiles in the settings' order", () => {
	const { state } = setup([profile("a", { cliPath: "/a" }), profile("b", { cliPath: "/b" }), profile("c", { cliPath: "/c" })]);
	state.apply("c", state.snapshot("c"), false);
	state.apply("a", state.snapshot("a"), false);
	assert.deepEqual(state.missing().map((p) => p.id), ["a", "c"]);
});

test("PRD-001.R39: a path or WSL edit, from wherever it came, drops the result and tells the listeners", () => {
	const { state, profiles } = setup([profile("a", { cliPath: "/x/claude" })], { platform: "win32" });
	let heard = 0;
	state.onChange(() => heard++);
	state.apply("a", state.snapshot("a"), false);
	assert.equal(heard, 1);
	// A reset or an Undo writes the settings directly: the next sync, run on every save, sees it.
	profiles[0].cliPath = "/y/claude";
	assert.equal(state.isMissing("a"), false);
	state.sync();
	assert.equal(heard, 2);
	assert.equal(state.known("a"), false);
	state.apply("a", state.snapshot("a"), false);
	profiles[0].useWsl = true;
	state.sync();
	assert.equal(heard, 4);
	assert.equal(state.known("a"), false);
});

test("PRD-001.R39: a result checked before an edit does not apply after the edit is undone (A, B, A)", () => {
	const { state, profiles } = setup([profile("a", { cliPath: "/x/claude" })]);
	const early = state.snapshot("a");
	profiles[0].cliPath = "/y/claude";
	state.sync();
	profiles[0].cliPath = "/x/claude";
	state.sync();
	assert.equal(state.holds("a", early), false);
	assert.equal(state.apply("a", early, false), false);
	assert.equal(state.known("a"), false);
	assert.equal(state.holds("a", state.snapshot("a")), true);
});

test("PRD-001.R39: a late asynchronous result applies only to the configuration it checked", () => {
	const { state, profiles } = setup([profile("a", { cliPath: "/x/claude" })]);
	const early = state.snapshot("a");
	profiles[0].cliPath = "/y/claude";
	const current = state.snapshot("a");
	// The newer check lands first, the older one after it.
	state.apply("a", current, true);
	assert.equal(state.apply("a", early, false), false);
	assert.equal(state.isMissing("a"), false);
	assert.equal(state.known("a"), true);
});

test("PRD-001.R39: a result for a profile that was removed is dropped", () => {
	const { state, profiles } = setup([profile("a"), profile("b", { cliPath: "/b" })]);
	const checked = state.snapshot("b");
	state.apply("b", checked, false);
	profiles.splice(1, 1);
	state.sync();
	assert.deepEqual(state.missing(), []);
	assert.equal(state.snapshot("b"), null);
	assert.equal(state.apply("b", checked, false), false);
	assert.equal(state.apply("b", null, false), false);
});

test("PRD-001.R39: a configured native path is looked for on disk at each check", () => {
	const { state, calls } = setup([profile("a", { cliPath: "/x/claude" })], { absent: ["/x/claude"] });
	state.check("a");
	assert.equal(state.isMissing("a"), true);
	state.check("a");
	assert.deepEqual(calls.pathMissing, ["/x/claude", "/x/claude"]);
	assert.equal(calls.detects, 0);
});

test("PRD-001.R39: an empty path is auto-detected on this device once per configuration, and a hit is handed over", async () => {
	const { state, profiles, calls } = setup([profile("a")], { detect: "/usr/bin/claude" });
	state.check("a");
	// A second page show while the first detection runs does not start another.
	state.check("a");
	await settle();
	assert.equal(calls.detects, 1);
	assert.deepEqual(calls.found, [["a", "/usr/bin/claude"]]);
	assert.equal(state.known("a"), true);
	assert.equal(state.isMissing("a"), false);
	state.check("a");
	await settle();
	assert.equal(calls.detects, 1);
	// An edit and its undo make a new configuration: the next page show detects again.
	profiles[0].cliPath = "/x";
	state.sync();
	profiles[0].cliPath = "";
	state.check("a");
	await settle();
	assert.equal(calls.detects, 2);
});

test("PRD-001.R39: an auto-detect that finds nothing marks an empty path missing, except on Windows", async () => {
	const linux = setup([profile("a")]);
	linux.state.check("a");
	await settle();
	assert.equal(linux.state.isMissing("a"), true);
	// On Windows the page looks on this device only, and the CLI may be in WSL: a miss says nothing.
	const win = setup([profile("a")], { platform: "win32" });
	win.state.check("a");
	await settle();
	assert.equal(win.calls.detects, 1);
	assert.equal(win.state.known("a"), false);
	// Once per configuration all the same.
	win.state.check("a");
	await settle();
	assert.equal(win.calls.detects, 1);
});

test("PRD-001.R39: a detection that answers after an edit is dropped and hands nothing over", async () => {
	let answer;
	const { state, profiles, calls } = setup([profile("a")], { detect: () => new Promise((resolve) => (answer = resolve)) });
	state.check("a");
	profiles[0].cliPath = "/typed/claude";
	answer("/usr/bin/claude");
	await settle();
	assert.deepEqual(calls.found, []);
	assert.equal(state.known("a"), false);
});

test("PRD-001.R39: a detection that fails says nothing and can run again", async () => {
	const { state, calls } = setup([profile("a")], { detect: () => Promise.reject(new Error("spawn failed")) });
	state.check("a");
	await settle();
	assert.equal(state.known("a"), false);
	state.check("a");
	await settle();
	assert.equal(calls.detects, 2);
});

test("PRD-001.R39: a WSL profile on Windows is never probed and keeps its state", () => {
	const { state, calls } = setup([profile("w", { useWsl: true }), profile("v", { useWsl: true, cliPath: "/opt/claude" })], { platform: "win32" });
	state.apply("w", state.snapshot("w"), false);
	state.check("w");
	state.check("v");
	assert.equal(calls.detects, 0);
	assert.deepEqual(calls.pathMissing, []);
	assert.equal(state.isMissing("w"), true);
	assert.equal(state.known("v"), false);
});

test("PRD-001.R39: where WSL does not apply, the flag does not stop detection", async () => {
	const { state, calls } = setup([profile("w", { useWsl: true })]);
	state.check("w");
	await settle();
	assert.equal(calls.detects, 1);
});

test("PRD-001.R39: a Detect that finds nothing marks the profile missing only for an empty or absent path", () => {
	const { state } = setup(
		[profile("e"), profile("x", { cliPath: "/gone/claude" }), profile("p", { cliPath: "/here/claude" }), profile("w", { useWsl: true, cliPath: "claude" })],
		{ platform: "win32", absent: ["/gone/claude", "claude"] }
	);
	for (const id of ["e", "x", "p", "w"]) state.missed(id, state.snapshot(id));
	assert.deepEqual(state.missing().map((p) => p.id), ["e", "x"]);
	assert.equal(state.known("p"), true);
	assert.equal(state.known("w"), false);
	state.missed("e", null);
});

test("PRD-001.R39: a Detect that finds nothing clears a missing path that exists by then", () => {
	const absent = ["/x/claude"];
	const { state } = setup([profile("a", { cliPath: "/x/claude" })], { absent });
	state.check("a");
	assert.equal(state.isMissing("a"), true);
	absent.length = 0;
	state.missed("a", state.snapshot("a"));
	assert.equal(state.isMissing("a"), false);
});

test("PRD-001.R39: a Detect miss judges a configured path by a check made when it answers, not when it began", () => {
	const absent = ["/x/claude"];
	const { state } = setup([profile("a", { cliPath: "/x/claude" })], { absent });
	const asked = state.snapshot("a");
	state.check("a");
	assert.equal(state.isMissing("a"), true);
	absent.length = 0;
	state.missed("a", asked);
	assert.equal(state.isMissing("a"), false);
});

test("PRD-001.R39: an older detection that finds nothing does not replace a later start's success", async () => {
	let answer;
	const { state } = setup([profile("a")], { detect: () => new Promise((resolve) => (answer = resolve)) });
	state.check("a");
	state.reached(profile("a"), state.snapshot("a"));
	assert.equal(state.isMissing("a"), false);
	answer(null);
	await settle();
	assert.equal(state.isMissing("a"), false);
});

test("PRD-001.R39: a Detect miss that began before a start's success does not replace it", () => {
	const { state } = setup([profile("a")]);
	const asked = state.snapshot("a");
	state.reached(profile("a"), state.snapshot("a"));
	state.missed("a", asked);
	assert.equal(state.isMissing("a"), false);
});

test("PRD-001.R39: a Detect that finds nothing after an edit marks nothing", () => {
	const { state, profiles } = setup([profile("a")]);
	const asked = state.snapshot("a");
	profiles[0].cliPath = "/typed/claude";
	state.missed("a", asked);
	assert.equal(state.known("a"), false);
});

test("PRD-001.R39: a start checks the configuration it resolved, not the one the profile has by then", () => {
	const { state, profiles } = setup([profile("a", { cliPath: "/gone/claude" })], { absent: ["/gone/claude"] });
	const checked = state.snapshot("a");
	profiles[0].cliPath = "/here/claude";
	const message = state.absent(profiles[0], checked);
	assert.equal(message, "Claude Code was not found at /gone/claude (the A profile). Fix the path in Settings → AI Agent Panel.");
	// The result belongs to the old path: the profile's new path is not marked.
	assert.equal(state.isMissing("a"), false);
});

test("PRD-001.R39: a start whose configured native path exists goes on and clears the state", () => {
	const { state, profiles } = setup([profile("a", { cliPath: "/x/claude" })]);
	state.apply("a", state.snapshot("a"), false);
	assert.equal(state.absent(profiles[0], state.snapshot("a")), null);
	assert.equal(state.isMissing("a"), false);
	assert.equal(state.known("a"), true);
});

test("PRD-001.R39: a start with an empty path, a WSL launch or nothing resolved is not checked on disk", () => {
	const { state, profiles, calls } = setup([profile("e"), profile("w", { useWsl: true, cliPath: "/opt/claude" })], { platform: "win32" });
	assert.equal(state.absent(profiles[0], state.snapshot("e")), null);
	assert.equal(state.absent(profiles[1], state.snapshot("w")), null);
	assert.equal(state.absent(profiles[0], null), null);
	assert.deepEqual(calls.pathMissing, []);
});

test("PRD-001.R39: exit 127 counts as a missing CLI only for a WSL launch", () => {
	assert.equal(wslNotFound(127, true), true);
	assert.equal(wslNotFound(127, false), false);
	assert.equal(wslNotFound(1, true), false);
	assert.equal(wslNotFound(null, true), false);
});

test("PRD-001.R39: a WSL exit 127 before init marks the profile missing, and a later start reaching init clears it", () => {
	const { state, profiles } = setup([profile("w", { name: "WSL", useWsl: true })], { platform: "win32" });
	assert.equal(state.exitedBeforeInit(profiles[0], state.snapshot("w"), { code: 1, useWsl: true }), null);
	assert.equal(state.known("w"), false);
	assert.equal(
		state.exitedBeforeInit(profiles[0], state.snapshot("w"), { code: 127, useWsl: true }),
		"Claude Code was not found in WSL (the WSL profile). Install it in the distro, or set the path in Settings → AI Agent Panel."
	);
	assert.equal(state.isMissing("w"), true);
	state.reached(profiles[0], state.snapshot("w"));
	assert.equal(state.isMissing("w"), false);
});

test("PRD-001.R39: a start that reaches init after an edit leaves the new configuration's state alone", () => {
	const { state, profiles } = setup([profile("a", { cliPath: "/x/claude" })]);
	const checked = state.snapshot("a");
	profiles[0].cliPath = "/y/claude";
	state.apply("a", state.snapshot("a"), false);
	state.reached(profiles[0], checked);
	assert.equal(state.isMissing("a"), true);
});

test("PRD-001.R39: a listener hears each change of a profile's missing state, and only a change", () => {
	const { state } = setup([profile("a", { cliPath: "/x/claude" })]);
	let heard = 0;
	const stop = state.onChange(() => heard++);
	state.apply("a", state.snapshot("a"), false);
	assert.equal(heard, 1);
	state.apply("a", state.snapshot("a"), false);
	assert.equal(heard, 1);
	state.apply("a", state.snapshot("a"), true);
	assert.equal(heard, 2);
	stop();
	state.apply("a", state.snapshot("a"), false);
	assert.equal(heard, 2);
});

test("PRD-001.R39: the banner and notice say where the CLI was looked for: in WSL, at the path, or on this device", () => {
	const wsl = profile("w", { name: "WSL", useWsl: true });
	const path = profile("p", { name: "Work", cliPath: "/opt/claude" });
	const auto = profile("d", { name: "Default" });
	assert.equal(missingWhere(wsl, "win32"), "in WSL");
	assert.equal(missingWhere(path, "linux"), "at /opt/claude");
	assert.equal(missingWhere(auto, "linux"), "on this device");
	// A WSL path is read inside the distro: WSL is where it was not found.
	assert.equal(missingWhere({ ...wsl, cliPath: "claude" }, "win32"), "in WSL");
	// Off Windows the flag launches nothing.
	assert.equal(missingWhere(wsl, "linux"), "on this device");
	assert.equal(bannerText(wsl, "win32"), "Claude Code was not found in WSL, so the WSL profile can’t start conversations.");
	assert.equal(bannerText(path, "linux"), "Claude Code was not found at /opt/claude, so the Work profile can’t start conversations.");
	assert.equal(bannerText(auto, "linux"), "Claude Code was not found on this device, so the Default profile can’t start conversations.");
	assert.equal(noticeText(wsl, "win32"), "Claude Code was not found in WSL. Install it in the distro, or set the path and press Detect.");
	assert.equal(noticeText(path, "linux"), "Claude Code was not found at /opt/claude. Install it, or set the path and press Detect.");
	assert.equal(noticeText(auto, "linux"), "Claude Code was not found on this device. Install it, or set the path and press Detect.");
});

test("PRD-001.R39: a profile without a name is called Unnamed in the banner", () => {
	assert.equal(bannerText(profile("u", { name: "" }), "linux"), "Claude Code was not found on this device, so the Unnamed profile can’t start conversations.");
});

test("PRD-001.R6: the message of a start that finds no CLI names the path or WSL, the profile and the settings", () => {
	assert.equal(
		startMessage(profile("p", { name: "Work", cliPath: "/opt/claude" }), "linux"),
		"Claude Code was not found at /opt/claude (the Work profile). Fix the path in Settings → AI Agent Panel."
	);
	assert.equal(
		startMessage(profile("w", { name: "WSL", useWsl: true }), "win32"),
		"Claude Code was not found in WSL (the WSL profile). Install it in the distro, or set the path in Settings → AI Agent Panel."
	);
	assert.equal(
		startMessage(profile("w", { name: "WSL", useWsl: true, cliPath: "claude" }), "win32"),
		"Claude Code was not found in WSL at claude (the WSL profile). Install it in the distro, or set the path in Settings → AI Agent Panel."
	);
});
