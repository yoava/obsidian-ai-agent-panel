import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { ClaudeSession, holdAll } = await import("./.build/session.mjs");
const { DEFAULT_SETTINGS, settingsLaunchOptions } = await import("./.build/settings-core.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = path.join(here, "fake-cli.mjs");
const BYPASS_FLAG = "--allow-dangerously-skip-permissions";

/**
 * A ClaudeSession against the fake CLI. `until` resolves once a predicate over
 * every message seen so far holds, so tests wait on events, not on time.
 */
function makeSession(scenario, config = {}, onPermission, events = {}) {
	const messages = [];
	const waiters = new Set();
	const session = new ClaudeSession(
		{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: scenario }, ...config },
		{
			onStreamMessage: (msg) => {
				messages.push(msg);
				for (const check of [...waiters]) check();
			},
			onPermissionRequest: onPermission ?? (async (req) => ({ behavior: "allow", updatedInput: req.input })),
			onPermissionCancelled: () => {},
			onBusyChanged: () => {},
			onEnded: () => {},
			...events,
		},
		"profile-1"
	);
	const until = (predicate, ms = 10000) =>
		new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				waiters.delete(check);
				reject(new Error("timed out waiting for the fake CLI"));
			}, ms);
			function check() {
				const value = predicate(messages);
				if (!value) return;
				clearTimeout(timer);
				waiters.delete(check);
				resolve(value);
			}
			waiters.add(check);
			check();
		});
	return { session, messages, until };
}

const argvs = (messages) =>
	messages.filter((m) => m.subtype === "probe" && m.what === "argv").map((m) => m.argv);
const flagValue = (argv, flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
const nthArgv = (n) => (messages) => argvs(messages)[n - 1];
const turns = (messages) => messages.filter((m) => m.what === "got_user_turn");

/** A fake CLI that SIGTERM ends only `ms` later (PRD-001.R5). */
const slowStop = (ms, env = {}) => ({
	env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_SIGTERM_DELAY_MS: String(ms), ...env },
});

/** A branch's launch: the source session forked (PRD-002.R15). The fake rewinds only a resumed session. */
const BRANCH = { resumeSessionId: "00000000-0000-4000-8000-00000000f002", forkSession: true };
const rewindRequests = (messages) =>
	messages.filter((m) => m.what === "got_control_request" && m.sub === "rewind_conversation").map((m) => m.request);

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** The second process's report, asserting the first had ended when it came. */
async function replacementOf(first, messages, until, ms) {
	await until(nthArgv(2), ms);
	assert.equal(alive(first.pid), false, "the old process ran beside its replacement");
	return argvProbes(messages)[1];
}

test("PRD-002.R10: leaving Bypass restarts the CLI without the bypass flag and in default mode", async () => {
	const { session, until } = makeSession("basic", {
		allowBypassPermissions: true,
		permissionMode: "bypassPermissions",
	});
	try {
		session.warmUp();
		const first = await until(nthArgv(1));
		assert.ok(first.includes(BYPASS_FLAG));
		assert.equal(flagValue(first, "--permission-mode"), "bypassPermissions");
		session.leaveBypass(true);
		const second = await until(nthArgv(2));
		assert.ok(!second.includes(BYPASS_FLAG));
		assert.equal(flagValue(second, "--permission-mode"), "default");
		assert.equal(session.permissionMode, "default");
	} finally {
		session.dispose();
	}
});

test("PRD-002.R10: a session outside Bypass loses the bypass flag and keeps its mode", async () => {
	const { session, until } = makeSession("basic", {
		allowBypassPermissions: true,
		permissionMode: "acceptEdits",
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		session.leaveBypass(false);
		const second = await until(nthArgv(2));
		assert.ok(!second.includes(BYPASS_FLAG));
		assert.equal(flagValue(second, "--permission-mode"), "acceptEdits");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: setLaunchOptions restarts the CLI only when an option changed", async () => {
	const { session, until } = makeSession("basic", { extraArgs: ["--chrome"] });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const first = session.liveClient;
		session.setLaunchOptions({ extraArgs: ["--chrome"], allowBypassPermissions: false });
		assert.equal(session.liveClient, first);
		session.setLaunchOptions({ extraArgs: ["--chrome", "--debug"] });
		assert.notEqual(session.liveClient, first);
		const second = await until(nthArgv(2));
		assert.deepEqual(second.slice(-2), ["--chrome", "--debug"]);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R7: a deliberate restart reports the replaced process, so its edits' reads are dropped", async () => {
	let restarted = 0;
	let ended = 0;
	const { session, until } = makeSession("basic", { extraArgs: ["--chrome"] }, undefined, {
		onRestarted: () => restarted++,
		onEnded: () => ended++,
	});
	try {
		session.setLaunchOptions({ extraArgs: ["--debug"] });
		assert.equal(restarted, 0);
		session.warmUp();
		await until(nthArgv(1));
		session.setLaunchOptions({ extraArgs: ["--debug"] });
		assert.equal(restarted, 0);
		session.setLaunchOptions({ extraArgs: ["--chrome"] });
		assert.equal(restarted, 1);
		await until(nthArgv(2));
		assert.equal(ended, 0);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: a session that has not started takes the options without spawning", () => {
	const { session } = makeSession("basic", { allowBypassPermissions: true });
	session.setLaunchOptions({ allowBypassPermissions: false });
	session.leaveBypass(true);
	assert.equal(session.liveClient, null);
	assert.equal(session.permissionMode, "default");
	session.dispose();
});

test("PRD-002.R10: leaving Bypass mid-turn switches the running CLI at once and restarts it after the turn", async () => {
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	let asked;
	const askedOnce = new Promise((resolve) => {
		asked = resolve;
	});
	const { session, until } = makeSession(
		"permission",
		{ allowBypassPermissions: true, permissionMode: "bypassPermissions" },
		async (req) => {
			asked();
			await held;
			return { behavior: "allow", updatedInput: req.input };
		}
	);
	try {
		session.send("go");
		await askedOnce;
		const first = session.liveClient;
		session.leaveBypass(true);
		assert.equal(session.liveClient, first, "the turn must finish first");
		await until((messages) =>
			messages.some(
				(m) =>
					m.what === "got_control_request" &&
					m.sub === "set_permission_mode" &&
					m.request.mode === "default"
			)
		);
		release();
		const second = await until(nthArgv(2));
		assert.notEqual(session.liveClient, first);
		assert.ok(!second.includes(BYPASS_FLAG));
		assert.equal(flagValue(second, "--permission-mode"), "default");
	} finally {
		release();
		session.dispose();
	}
});

test("PRD-002.R10: a mode switch Claude Code answers after leaving Bypass does not bring Bypass back", async () => {
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	let asked;
	const askedOnce = new Promise((resolve) => {
		asked = resolve;
	});
	const { session, until } = makeSession(
		"permission",
		{ allowBypassPermissions: true, env: { FAKE_CLI_SCENARIO: "permission", FAKE_CLI_MODE_DELAY_MS: "150" } },
		async (req) => {
			asked();
			await held;
			return { behavior: "allow", updatedInput: req.input };
		}
	);
	try {
		session.send("go");
		await askedOnce;
		const pick = session.setPermissionMode("bypassPermissions");
		session.leaveBypass(true);
		assert.equal(await pick, false, "the superseded switch reported itself current");
		assert.equal(session.permissionMode, "default");
		release();
		const second = await until(nthArgv(2));
		assert.ok(!second.includes(BYPASS_FLAG));
		assert.equal(flagValue(second, "--permission-mode"), "default");
	} finally {
		release();
		session.dispose();
	}
});

test("PRD-002.R10: a switch the restart cut off is superseded, not an error", async () => {
	const { session, until } = makeSession("basic", {
		allowBypassPermissions: true,
		env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_MODE_DELAY_MS: "150" },
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const pick = session.setPermissionMode("bypassPermissions");
		session.leaveBypass(true);
		assert.equal(await pick, false);
		assert.equal(session.permissionMode, "default");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: turning bypass on reaches a running session with the flag", async () => {
	const { session, until } = makeSession("basic", {});
	try {
		session.warmUp();
		assert.ok(!(await until(nthArgv(1))).includes(BYPASS_FLAG));
		session.setLaunchOptions({ allowBypassPermissions: true });
		assert.ok((await until(nthArgv(2))).includes(BYPASS_FLAG));
	} finally {
		session.dispose();
	}
});

const delayed = (scenario, extra = {}) => ({
	env: { FAKE_CLI_SCENARIO: scenario, FAKE_CLI_MODE_DELAY_MS: "100", ...extra },
});

test("PRD-002.R8: a newer pick wins over an older one, both answered in order", async () => {
	const { session, until } = makeSession("basic", delayed("basic"));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const older = session.setPermissionMode("plan");
		const newer = session.setPermissionMode("acceptEdits");
		assert.equal(await older, true);
		assert.equal(await newer, true);
		assert.equal(session.permissionMode, "acceptEdits");
	} finally {
		session.dispose();
	}
});

test("PRD-002.R8: an older pick Claude Code accepted stays when the newer one is refused", async () => {
	const { session, until } = makeSession("basic", delayed("basic", { FAKE_CLI_REFUSE_MODE: "acceptEdits" }));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const older = session.setPermissionMode("plan");
		const newer = session.setPermissionMode("acceptEdits");
		assert.equal(await older, true);
		await assert.rejects(newer, /Refused mode acceptEdits/);
		assert.equal(session.permissionMode, "plan");
	} finally {
		session.dispose();
	}
});

test("PRD-002.R8: a pick made after leaving Bypass is kept", async () => {
	const { session, until } = makeSession("basic", { allowBypassPermissions: true, permissionMode: "bypassPermissions" });
	try {
		session.warmUp();
		await until(nthArgv(1));
		session.leaveBypass(true);
		await until(nthArgv(2));
		assert.equal(await session.setPermissionMode("plan"), true);
		assert.equal(session.permissionMode, "plan");
	} finally {
		session.dispose();
	}
});

test("PRD-002.R10: leaving Bypass on a session without the flag, not in Bypass, keeps its process", async () => {
	const { session, until } = makeSession("basic", { permissionMode: "acceptEdits" });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const first = session.liveClient;
		session.leaveBypass(false);
		assert.equal(session.liveClient, first);
		assert.equal(session.permissionMode, "acceptEdits");
	} finally {
		session.dispose();
	}
});

const refusing = (model) => ({ env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_REFUSE_MODEL: model } });
const modelOf = (argv) => flagValue(argv, "--model");

test("PRD-001.R22: a model the CLI rejects is not kept for the session or its restarts", async () => {
	const { session, until } = makeSession("basic", { model: "sonnet", ...refusing("opus") });
	try {
		session.warmUp();
		assert.equal(modelOf(await until(nthArgv(1))), "sonnet");
		await assert.rejects(session.setModel("opus"), /Refused model opus/);
		assert.equal(session.model, "sonnet");
		session.setEffort("high");
		assert.equal(modelOf(await until(nthArgv(2))), "sonnet");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R22: a model the CLI accepts is the session's, and the next spawn uses it", async () => {
	const { session, until } = makeSession("basic", { model: "sonnet", ...refusing("opus") });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await session.setModel("haiku");
		assert.equal(session.model, "haiku");
		session.setEffort("high");
		assert.equal(modelOf(await until(nthArgv(2))), "haiku");
		await session.setModel(undefined);
		assert.equal(session.model, undefined);
		session.setEffort("low");
		assert.equal(modelOf(await until(nthArgv(3))), undefined);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R22: the replayed stdout of an idle model change is not turn activity, so the session stays idle", async () => {
	const { session, until, messages } = makeSession("basic", { model: "sonnet" });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await session.setModel("haiku");
		await until((all) => all.some((m) => m.type === "user" && m.isReplay === true));
		assert.equal(session.busy, false);
		assert.equal(messages.filter((m) => m.type === "user").length, 1, "the message still reaches the panel");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R22: with no process the model is taken at once and the first spawn uses it", async () => {
	const { session, until } = makeSession("basic", { model: "sonnet" });
	try {
		await session.setModel("haiku");
		assert.equal(session.model, "haiku");
		assert.equal(session.liveClient, null);
		session.warmUp();
		assert.equal(modelOf(await until(nthArgv(1))), "haiku");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R22: of two picks in flight, the last one the CLI accepted is the session's", async () => {
	const { session, until } = makeSession("basic", { model: "sonnet", ...refusing("opus") });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const older = session.setModel("haiku");
		const newer = session.setModel("opus");
		await older;
		await assert.rejects(newer, /Refused model opus/);
		assert.equal(session.model, "haiku");
		const refusedFirst = session.setModel("opus");
		const acceptedAfter = session.setModel("fable");
		await assert.rejects(refusedFirst, /Refused model opus/);
		await acceptedAfter;
		assert.equal(session.model, "fable");
	} finally {
		session.dispose();
	}
});

const argvProbes = (messages) => messages.filter((m) => m.subtype === "probe" && m.what === "argv");
const requestsTo = (messages, pid, sub) =>
	messages.filter((m) => m.what === "got_control_request" && m.pid === pid && m.sub === sub).map((m) => m.request);

test("PRD-001.R22: a model switch in flight when the process is replaced reaches the replacement", async () => {
	// The old process answers before it closes, so the replacement spawns with the model.
	const { session, messages, until } = makeSession("basic", { model: "sonnet", ...slowStop(300) });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const pick = session.setModel("haiku");
		session.setEffort("high");
		await pick;
		assert.equal(session.model, "haiku");
		await until((all) => argvProbes(all).length >= 2);
		assert.equal(modelOf(argvProbes(messages)[1].argv), "haiku");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R22: a refused switch stays refused after the process was replaced", async () => {
	const { session, messages, until } = makeSession("basic", { model: "sonnet", ...refusing("opus") });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const pick = session.setModel("opus");
		session.setEffort("high");
		await assert.rejects(pick, /Refused model opus/);
		assert.equal(session.model, "sonnet");
		assert.equal(modelOf(argvProbes(messages).at(-1).argv), "sonnet");
	} finally {
		session.dispose();
	}
});

test("PRD-002.R8: a mode switch in flight when the process is replaced reaches the replacement", async () => {
	// The old process closes before it answers, so the switch is resent to the replacement.
	const { session, messages, until } = makeSession("basic", { permissionMode: "default", ...delayed("basic") });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const pick = session.setPermissionMode("plan");
		session.setEffort("high");
		assert.equal(await pick, true);
		assert.equal(session.permissionMode, "plan");
		await until((all) => argvProbes(all).length >= 2);
		const second = argvProbes(messages)[1];
		assert.equal(flagValue(second.argv, "--permission-mode"), "default", "spawned before the switch took");
		await until(() => requestsTo(messages, second.pid, "set_permission_mode").length > 0);
		assert.deepEqual(requestsTo(messages, second.pid, "set_permission_mode"), [
			{ subtype: "set_permission_mode", mode: "plan" },
		]);
	} finally {
		session.dispose();
	}
});

/** The initialize request the nth CLI process of a session received. */
async function handshakeOf(messages, until, n) {
	await until(nthArgv(n));
	const { pid } = argvProbes(messages)[n - 1];
	await until((all) => requestsTo(all, pid, "initialize").length > 0);
	return requestsTo(messages, pid, "initialize")[0];
}

test("PRD-001.R25: new vault instructions restart the CLI, whose handshake carries them", async () => {
	const { session, messages, until } = makeSession("basic", {});
	try {
		session.warmUp();
		assert.equal((await handshakeOf(messages, until, 1)).appendSystemPrompt, undefined);
		const first = session.liveClient;
		session.setLaunchOptions({ appendSystemPrompt: "Use wiki-links." });
		assert.notEqual(session.liveClient, first);
		assert.equal((await handshakeOf(messages, until, 2)).appendSystemPrompt, "Use wiki-links.");
		session.setLaunchOptions({ appendSystemPrompt: undefined });
		assert.equal((await handshakeOf(messages, until, 3)).appendSystemPrompt, undefined);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: the vault-tools switch restarts the CLI, whose handshake registers or drops the server", async () => {
	const { session, messages, until } = makeSession("basic", {});
	try {
		session.warmUp();
		assert.equal((await handshakeOf(messages, until, 1)).sdkMcpServers, undefined);
		session.setLaunchOptions({ sdkMcpServers: ["obsidian"] });
		assert.deepEqual((await handshakeOf(messages, until, 2)).sdkMcpServers, ["obsidian"]);
		session.setLaunchOptions({ sdkMcpServers: undefined });
		assert.equal((await handshakeOf(messages, until, 3)).sdkMcpServers, undefined);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: empty instructions and an empty server list are the same as none", async () => {
	const { session, until } = makeSession("basic", {});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const first = session.liveClient;
		session.setLaunchOptions({ appendSystemPrompt: "", sdkMcpServers: [] });
		assert.equal(session.liveClient, first);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: instructions changed mid-turn restart the CLI after the turn", async () => {
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	let asked;
	const askedOnce = new Promise((resolve) => {
		asked = resolve;
	});
	const { session, messages, until } = makeSession("permission", {}, async (req) => {
		asked();
		await held;
		return { behavior: "allow", updatedInput: req.input };
	});
	try {
		session.send("go");
		await askedOnce;
		const first = session.liveClient;
		session.setLaunchOptions({ appendSystemPrompt: "Use wiki-links.", sdkMcpServers: ["obsidian"] });
		assert.equal(session.liveClient, first, "the turn must finish first");
		assert.equal(argvProbes(messages).length, 1);
		release();
		const init = await handshakeOf(messages, until, 2);
		assert.notEqual(session.liveClient, first);
		assert.equal(init.appendSystemPrompt, "Use wiki-links.");
		assert.deepEqual(init.sdkMcpServers, ["obsidian"]);
	} finally {
		release();
		session.dispose();
	}
});

test("PRD-001.R25: a settings-close restart passes what a new conversation would get, once", async () => {
	const closed = { ...DEFAULT_SETTINGS, vaultInstructions: "Use wiki-links.", enableObsidianMcp: false, enableBypassMode: true };
	const { session, messages, until } = makeSession("basic", { ...settingsLaunchOptions(DEFAULT_SETTINGS), extraArgs: ["--chrome"] });
	try {
		session.warmUp();
		const first = await handshakeOf(messages, until, 1);
		assert.deepEqual(first.sdkMcpServers, ["obsidian"]);
		assert.equal(first.appendSystemPrompt, undefined);
		const client = session.liveClient;
		session.setLaunchOptions({ ...settingsLaunchOptions(DEFAULT_SETTINGS), extraArgs: ["--chrome"] });
		assert.equal(session.liveClient, client, "unchanged settings keep the process");
		session.setLaunchOptions({ ...settingsLaunchOptions(closed), extraArgs: ["--chrome"] });
		const second = await handshakeOf(messages, until, 2);
		assert.equal(second.appendSystemPrompt, "Use wiki-links.");
		assert.equal(second.sdkMcpServers, undefined);
		assert.ok(argvs(messages)[1].includes(BYPASS_FLAG));
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		session.dispose();
	}
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("PRD-001.R25: leaving Bypass together with another launch change restarts the CLI once", async () => {
	let restarts = 0;
	const { session, messages, until } = makeSession(
		"basic",
		{ allowBypassPermissions: true, permissionMode: "bypassPermissions" },
		undefined,
		{ onRestarted: () => restarts++ }
	);
	try {
		session.warmUp();
		await handshakeOf(messages, until, 1);
		const first = session.liveClient;
		const release = session.hold();
		session.leaveBypass(true);
		session.setLaunchOptions({ appendSystemPrompt: "Use wiki-links.", sdkMcpServers: ["obsidian"] });
		assert.equal(session.liveClient, first, "nothing restarts while held");
		release();
		assert.notEqual(session.liveClient, first);
		assert.equal(restarts, 1);
		const init = await handshakeOf(messages, until, 2);
		const second = session.liveClient;
		assert.equal(init.appendSystemPrompt, "Use wiki-links.");
		assert.deepEqual(init.sdkMcpServers, ["obsidian"]);
		const argv = argvs(messages)[1];
		assert.ok(!argv.includes(BYPASS_FLAG));
		assert.equal(flagValue(argv, "--permission-mode"), "default");
		await sleep(150);
		assert.equal(restarts, 1, "one replacement process");
		assert.equal(session.liveClient, second);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: a held session that changed nothing keeps its process, and a busy one restarts after its turn", async () => {
	const { session, until } = makeSession("basic", {});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const first = session.liveClient;
		const release = session.hold();
		session.setLaunchOptions({ appendSystemPrompt: "" });
		release();
		assert.equal(session.liveClient, first);
	} finally {
		session.dispose();
	}
	let done;
	const turnHeld = new Promise((resolve) => {
		done = resolve;
	});
	let asked;
	const askedOnce = new Promise((resolve) => {
		asked = resolve;
	});
	const busy = makeSession("permission", {}, async (req) => {
		asked();
		await turnHeld;
		return { behavior: "allow", updatedInput: req.input };
	});
	try {
		busy.session.send("go");
		await askedOnce;
		const first = busy.session.liveClient;
		const release = busy.session.hold();
		busy.session.setLaunchOptions({ appendSystemPrompt: "Use wiki-links." });
		release();
		assert.equal(busy.session.liveClient, first, "the turn must finish first");
		done();
		await busy.until(nthArgv(2));
		assert.notEqual(busy.session.liveClient, first);
	} finally {
		done();
		busy.session.dispose();
	}
});

test("PRD-001.R25: a send while restarts are held runs on a process with the new launch options", async () => {
	const { session, messages, until } = makeSession("basic", {
		allowBypassPermissions: true,
		permissionMode: "bypassPermissions",
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const first = session.liveClient;
		const release = session.hold();
		session.leaveBypass(true);
		assert.equal(session.liveClient, first, "the restart is held");
		session.send("hello");
		assert.notEqual(session.liveClient, first, "the turn must not run on the Bypass process");
		const turn = await until((all) => all.find((m) => m.what === "got_user_turn"));
		const second = argvProbes(messages)[1];
		assert.equal(turn.pid, second.pid);
		assert.ok(!second.argv.includes(BYPASS_FLAG));
		assert.equal(flagValue(second.argv, "--permission-mode"), "default");
		release();
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: a restart already due after the turn is not repeated when the hold is released", async () => {
	let done;
	const turnHeld = new Promise((resolve) => {
		done = resolve;
	});
	let asked;
	const askedOnce = new Promise((resolve) => {
		asked = resolve;
	});
	let restarts = 0;
	const { session, messages, until } = makeSession(
		"permission",
		{},
		async (req) => {
			asked();
			await turnHeld;
			return { behavior: "allow", updatedInput: req.input };
		},
		{ onRestarted: () => restarts++ }
	);
	try {
		session.send("go");
		await askedOnce;
		session.setEffort("high");
		const release = session.hold();
		session.setLaunchOptions({ appendSystemPrompt: "Use wiki-links." });
		done();
		assert.equal((await handshakeOf(messages, until, 2)).appendSystemPrompt, "Use wiki-links.");
		assert.equal(restarts, 1);
		release();
		await sleep(150);
		assert.equal(restarts, 1, "the restart after the turn already carried the options");
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		done();
		session.dispose();
	}
});

test("PRD-001.R25: a process that exited during the hold is replaced by the send, not restarted again at release", async () => {
	let restarts = 0;
	const { session, messages, until } = makeSession("basic", {}, undefined, { onRestarted: () => restarts++ });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const release = session.hold();
		session.setLaunchOptions({ appendSystemPrompt: "Use wiki-links." });
		session.liveClient.stop();
		while (session.liveClient) await sleep(10);
		session.send("hello");
		assert.equal((await handshakeOf(messages, until, 2)).appendSystemPrompt, "Use wiki-links.");
		await until((all) => all.some((m) => m.type === "result"));
		const second = session.liveClient;
		release();
		await sleep(150);
		assert.equal(restarts, 0);
		assert.equal(session.liveClient, second);
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: a release that throws cannot leave the other sessions held", async () => {
	const failing = makeSession("basic", {}, undefined, {
		onRestarted: () => {
			throw new Error("boom");
		},
	});
	const healthy = makeSession("basic", {});
	try {
		failing.session.warmUp();
		healthy.session.warmUp();
		await failing.until(nthArgv(1));
		await healthy.until(nthArgv(1));
		const release = holdAll([failing.session, null, healthy.session]);
		failing.session.setLaunchOptions({ appendSystemPrompt: "a" });
		healthy.session.setLaunchOptions({ appendSystemPrompt: "a" });
		const before = healthy.session.liveClient;
		assert.throws(release, /boom/);
		assert.notEqual(healthy.session.liveClient, before, "the later session was released");
		assert.doesNotThrow(release, "a release runs once");
	} finally {
		failing.session.dispose();
		healthy.session.dispose();
	}
});

/** Leave Bypass while held, as the settings-close pass does before its CLI lookups, then send during them. */
async function sendWhileLookingUp(options) {
	let restarts = 0;
	const made = makeSession(
		"basic",
		{ allowBypassPermissions: true, permissionMode: "bypassPermissions" },
		undefined,
		{ onRestarted: () => restarts++ }
	);
	const { session, messages, until } = made;
	session.warmUp();
	await handshakeOf(messages, until, 1);
	const first = session.liveClient;
	const release = session.hold();
	session.leaveBypass(true);
	await sleep(20); // the lookups
	session.send("hello");
	assert.notEqual(session.liveClient, first, "the turn must not run on the Bypass process");
	const turn = await until((all) => all.find((m) => m.what === "got_user_turn"));
	await until((all) => all.some((m) => m.type === "result"));
	const second = argvProbes(messages)[1];
	assert.equal(turn.pid, second.pid);
	assert.ok(!second.argv.includes(BYPASS_FLAG));
	assert.equal(flagValue(second.argv, "--permission-mode"), "default");
	session.setLaunchOptions(options);
	release();
	return { ...made, restarts: () => restarts, second: session.liveClient };
}

test("PRD-001.R25: a send during the CLI lookups runs without Bypass, and unchanged options add no restart", async () => {
	const { session, messages, restarts, second } = await sendWhileLookingUp({ allowBypassPermissions: false });
	try {
		await sleep(150);
		assert.equal(restarts(), 1, "the send's restart only");
		assert.equal(session.liveClient, second);
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: a send during the CLI lookups runs without Bypass, and changed options add one restart", async () => {
	const { session, messages, until, restarts } = await sendWhileLookingUp({ appendSystemPrompt: "Use wiki-links." });
	try {
		assert.equal((await handshakeOf(messages, until, 3)).appendSystemPrompt, "Use wiki-links.");
		await sleep(150);
		assert.equal(restarts(), 2);
		assert.equal(argvProbes(messages).length, 3);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R25: an owed restart is consumed before a throwing busy callback", () => {
	let restarts = 0;
	const { session } = makeSession("basic", {}, undefined, {
		onBusyChanged: (busy) => {
			if (!busy) throw new Error("boom");
		},
		onRestarted: () => restarts++,
	});
	try {
		session.warmUp();
		const first = session.liveClient;
		session.setBusy(true);
		session.setEffort("high");
		assert.equal(session.liveClient, first, "the turn must finish first");
		assert.throws(() => session.setBusy(false, "result"), /boom/);
		assert.equal(restarts, 1);
		assert.notEqual(session.liveClient, first);
		assert.doesNotThrow(() => session.setBusy(true));
	} finally {
		session.dispose();
	}
});

test("PRD-001.R4: a replacement process resumes the session its predecessor learned", async () => {
	const { session, until } = makeSession("basic", {});
	try {
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		assert.equal(session.sessionId, "00000000-0000-4000-8000-00000000f001");
		assert.equal(flagValue(await until(nthArgv(1)), "--resume"), undefined);
		session.setEffort("high");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--resume"), "00000000-0000-4000-8000-00000000f001");
	} finally {
		session.dispose();
	}
});

test("PRD-003.R4: a respawn resumes the learned session only if the host still vouches for it, else it starts fresh", async () => {
	let vouch = "trusted";
	const refused = [];
	const { session, until } = makeSession("basic", {}, undefined, {
		mayResume: () => vouch,
		onResumeRefused: (id) => refused.push(id),
	});
	try {
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		vouch = "foreign";
		session.setEffort("high");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--resume"), undefined);
		assert.equal(second.includes("--fork-session"), false);
		assert.deepEqual(refused, ["00000000-0000-4000-8000-00000000f001"]);
		assert.equal(session.sessionId, null);
	} finally {
		session.dispose();
	}
});

test("PRD-003.R4: a launch that resumes or forks a session the host does not vouch for starts fresh, with no rewind", async () => {
	const refused = [];
	const { session, until } = makeSession("basic", BRANCH, undefined, {
		mayResume: () => "foreign",
		onResumeRefused: (id) => refused.push(id),
	});
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => null);
		session.send("hello");
		const first = await until(nthArgv(1));
		assert.equal(flagValue(first, "--resume"), undefined);
		assert.equal(first.includes("--fork-session"), false);
		assert.deepEqual(refused, ["00000000-0000-4000-8000-00000000f002"]);
		await until((all) => all.some((m) => m.type === "result"));
	} finally {
		session.dispose();
	}
});

test("PRD-003.R4: a launch whose resume is pending starts nothing, drops nothing, and goes through once the host vouches", async () => {
	let verdict = "pending";
	const refused = [];
	const { session, until } = makeSession("basic", BRANCH, undefined, {
		mayResume: () => verdict,
		onResumeRefused: (id) => refused.push(id),
	});
	try {
		assert.throws(() => session.send("hello"), /could not be read/);
		assert.equal(session.busy, false);
		assert.deepEqual(refused, []);
		verdict = "trusted";
		session.send("hello");
		const first = await until(nthArgv(1));
		assert.equal(flagValue(first, "--resume"), "00000000-0000-4000-8000-00000000f002");
		assert.equal(first.includes("--fork-session"), true);
	} finally {
		session.dispose();
	}
});

test("PRD-003.R4: checkResume throws only for a pending resume, and changes nothing", () => {
	let verdict = "pending";
	const { session } = makeSession("basic", BRANCH, undefined, { mayResume: () => verdict });
	try {
		assert.throws(() => session.checkResume(), /could not be read/);
		assert.throws(() => session.checkResume(), /could not be read/);
		verdict = "foreign";
		session.checkResume();
		verdict = "trusted";
		session.checkResume();
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a restart spawns the replacement once the old process has closed, and reports no end", async () => {
	let ended = 0;
	const { session, messages, until } = makeSession("basic", slowStop(400), undefined, { onEnded: () => ended++ });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		assert.equal(session.liveClient, null, "no process runs while the old one closes");
		const second = await replacementOf(first, messages, until);
		assert.equal(flagValue(second.argv, "--effort"), "high");
		assert.equal(ended, 0, "a deliberate stop is not a session end");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a send while the Bypass process closes waits for the replacement, which has left Bypass", async () => {
	const { session, messages, until } = makeSession("basic", {
		allowBypassPermissions: true,
		permissionMode: "bypassPermissions",
		...slowStop(400),
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.leaveBypass(true);
		session.send("hello");
		assert.equal(session.busy, true);
		const second = await replacementOf(first, messages, until);
		const turn = await until((all) => turns(all)[0]);
		await until((all) => all.some((m) => m.type === "result"));
		assert.equal(argvProbes(messages).length, 2);
		assert.equal(turn.pid, second.pid);
		assert.ok(!second.argv.includes(BYPASS_FLAG));
		assert.equal(flagValue(second.argv, "--permission-mode"), "default");
		assert.equal(session.busy, false);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a warm-up, sends, a panel command and a Stop during the wait reach one replacement", async () => {
	const { session, messages, until } = makeSession("basic", slowStop(400));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		session.warmUp();
		session.send("one");
		const command = session.control({ subtype: "interrupt" }, 5000);
		session.send("two");
		const stop = session.interrupt();
		const { pid: second } = await replacementOf(first, messages, until);
		await Promise.all([command, stop]);
		await until((all) => turns(all).length === 2);
		assert.equal(argvProbes(messages).length, 2, "one replacement");
		assert.deepEqual(
			turns(messages).map((t) => [t.text, t.pid]),
			[
				["one", second],
				["two", second],
			]
		);
		assert.equal(requestsTo(messages, first.pid, "interrupt").length, 0);
		assert.equal(requestsTo(messages, second, "interrupt").length, 2);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a process that ignores SIGTERM holds the replacement back until its SIGKILL, no longer", async () => {
	// A child holds its stdout open past the SIGKILL, so its close comes 5 s after it started.
	const { session, messages, until } = makeSession("basic", slowStop(60_000, { FAKE_CLI_HOLD_STDOUT_MS: "5000" }));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		const stoppedAt = Date.now();
		session.setEffort("high");
		session.send("hello");
		const second = await replacementOf(first, messages, until, 10_000);
		const waited = Date.now() - stoppedAt;
		assert.ok(waited >= 2900, `the replacement ran ${waited} ms after the stop, before the SIGKILL`);
		assert.ok(waited < 4500, `the replacement waited ${waited} ms, past the SIGKILL`);
		assert.equal((await until((all) => turns(all)[0])).pid, second.pid);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a tab closed while the old process closes starts no replacement", async () => {
	let ended = 0;
	const { session, messages, until } = makeSession("basic", slowStop(400), undefined, { onEnded: () => ended++ });
	session.warmUp();
	await until(nthArgv(1));
	const [first] = argvProbes(messages);
	session.setEffort("high");
	await sleep(150);
	session.send("hello");
	session.dispose();
	while (alive(first.pid)) await sleep(20);
	await sleep(200);
	assert.equal(argvProbes(messages).length, 1);
	assert.equal(turns(messages).length, 0);
	assert.equal(ended, 0, "a closed tab reports nothing");
});

test("PRD-001.R6: a replacement that cannot start ends the turn that waited for it, with the error", async () => {
	const ended = [];
	const busy = [];
	const { session, messages, until } = makeSession("basic", slowStop(200), undefined, {
		onEnded: (error) => ended.push(error),
		onBusyChanged: (value) => busy.push(value),
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		// A NUL byte makes spawn throw, as a launch refused at spawn time would.
		session.setLaunchOptions({ extraArgs: ["bad\0arg"] });
		session.send("hello");
		assert.equal(session.busy, true);
		while (ended.length === 0) await sleep(20);
		assert.equal(ended.length, 1);
		assert.match(ended[0], /null bytes/);
		assert.equal(session.busy, false);
		assert.deepEqual(busy, [true, false]);
		assert.equal(session.liveClient, null);
		assert.equal(argvProbes(messages).length, 1);
	} finally {
		session.dispose();
	}
});

/** Resolves once `predicate()` holds, or rejects after `ms`. */
async function waitFor(predicate, ms = 3000) {
	const deadline = Date.now() + ms;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error("timed out");
		await sleep(20);
	}
}

test("PRD-001.R5: what the old process writes while it closes does not reach the session", async () => {
	let permissions = 0;
	let cancels = 0;
	let mcp = 0;
	const busy = [];
	const { session, messages, until } = makeSession(
		"basic",
		slowStop(400, { FAKE_CLI_TALK_ON_SIGTERM: "1" }),
		async (req) => {
			permissions++;
			return { behavior: "allow", updatedInput: req.input };
		},
		{
			onPermissionCancelled: () => cancels++,
			onMcpMessage: async () => {
				mcp++;
				return null;
			},
			onBusyChanged: (value) => busy.push(value),
		}
	);
	try {
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		session.send("again");
		await replacementOf(first, messages, until);
		await until((all) => all.filter((m) => m.type === "result").length === 2);
		assert.equal(messages.filter((m) => m.stale).length, 0, "a stale message reached the session");
		assert.equal(permissions + cancels + mcp, 0, "a stale request reached the session");
		assert.equal(session.sessionId, "00000000-0000-4000-8000-00000000f001");
		assert.deepEqual(busy, [true, false, true, false], "a stale result ended the waiting turn");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: the old process's late handshake reply does not reach the session", async () => {
	const infos = [];
	const { session, messages, until } = makeSession(
		"basic",
		slowStop(400, { FAKE_CLI_INIT_DELAY_MS: "150" }),
		undefined,
		{ onInitInfo: (info) => infos.push(info) }
	);
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		const second = await replacementOf(first, messages, until);
		await waitFor(() => infos.length > 0);
		await sleep(100);
		assert.deepEqual(
			infos.map((info) => info.pid),
			[second.pid]
		);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R22: a model answer from the old process does not overwrite a pick made during the wait", async () => {
	const { session, messages, until } = makeSession("basic", { model: "sonnet", ...slowStop(300) });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const older = session.setModel("haiku");
		session.setEffort("high");
		const newer = session.setModel("opus");
		assert.equal(await newer, true);
		assert.equal(await older, false, "the old process's answer counted");
		assert.equal(session.model, "opus");
		const second = await until(nthArgv(2));
		assert.equal(modelOf(second), "opus");
		await sleep(100);
		assert.deepEqual(requestsTo(messages, argvProbes(messages)[1].pid, "set_model"), []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R10: a Bypass answer from the old process does not overwrite Ask picked during the wait", async () => {
	const { session, messages, until } = makeSession("basic", {
		allowBypassPermissions: true,
		permissionMode: "acceptEdits",
		...slowStop(300),
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const bypass = session.setPermissionMode("bypassPermissions");
		session.setEffort("high");
		const ask = session.setPermissionMode("default");
		assert.equal(await ask, true);
		assert.equal(await bypass, false, "the old process's answer counted");
		assert.equal(session.permissionMode, "default");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--permission-mode"), "default");
		await sleep(100);
		assert.deepEqual(requestsTo(messages, argvProbes(messages)[1].pid, "set_permission_mode"), []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R8: a mode switch the close cut off is not resent when a newer pick was made during the wait", async () => {
	const { session, messages, until } = makeSession("basic", { permissionMode: "default", ...delayed("basic") });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const older = session.setPermissionMode("plan");
		session.setEffort("high");
		const newer = session.setPermissionMode("acceptEdits");
		assert.equal(await newer, true);
		assert.equal(await older, false);
		assert.equal(session.permissionMode, "acceptEdits");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--permission-mode"), "acceptEdits");
		await sleep(250);
		assert.deepEqual(requestsTo(messages, argvProbes(messages)[1].pid, "set_permission_mode"), []);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a background task's Stop during the wait reaches the replacement", async () => {
	const { session, messages, until } = makeSession("basic", slowStop(300));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		await session.stopTask("task-1");
		const second = await replacementOf(first, messages, until);
		assert.deepEqual(requestsTo(messages, second.pid, "stop_task"), [{ subtype: "stop_task", task_id: "task-1" }]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: turns that waited for the replacement keep their order behind a pending rewind", async () => {
	const { session, messages, until } = makeSession("basic", { ...slowStop(300), ...BRANCH });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		session.send("one");
		session.send("two");
		const second = await replacementOf(first, messages, until);
		await until((all) => turns(all).length === 2);
		const order = messages
			.filter((m) => m.pid === second.pid && (m.what === "got_user_turn" || m.sub === "rewind_conversation"))
			.map((m) => m.text ?? m.sub);
		assert.deepEqual(order, ["rewind_conversation", "one", "two"]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R6: a replacement that cannot start ends the waiting turn even when the callbacks throw", async () => {
	const ended = [];
	const logged = [];
	const rejections = [];
	const onRejection = (err) => rejections.push(err);
	process.on("unhandledRejection", onRejection);
	const consoleError = console.error;
	console.error = (...args) => logged.push(args);
	const { session, until } = makeSession("basic", slowStop(200), undefined, {
		onBusyChanged: (value) => {
			if (!value) throw new Error("busy boom");
		},
		onEnded: (error) => {
			ended.push(error);
			throw new Error("ended boom");
		},
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		session.setLaunchOptions({ extraArgs: ["bad\0arg"] });
		session.send("hello");
		await waitFor(() => ended.length + logged.length + rejections.length > 0).catch(() => {});
		await sleep(50);
		assert.equal(ended.length, 1, "the waiting turn did not end");
		assert.match(ended[0], /null bytes/);
		assert.equal(session.busy, false);
		assert.equal(logged.length, 1);
		assert.match(String(logged[0][0]), /^AI Agent Panel:/);
		assert.deepEqual(rejections, []);
	} finally {
		console.error = consoleError;
		process.off("unhandledRejection", onRejection);
		session.dispose();
	}
});

test("PRD-001.R5: a restore preview during the wait goes to the replacement, once", async () => {
	const { session, messages, until } = makeSession("rewind", slowStop(300, { FAKE_CLI_SCENARIO: "rewind" }));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		session.setEffort("high");
		const preview = await session.rewindFiles("u-ok", true);
		assert.equal(preview.canRewind, true);
		const second = await replacementOf(first, messages, until);
		assert.equal(requestsTo(messages, second.pid, "rewind_files").length, 1);
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a panel command during the wait fails when the tab closes, and nothing spawns", async () => {
	const { session, messages, until } = makeSession("basic", slowStop(300));
	session.warmUp();
	await until(nthArgv(1));
	const [first] = argvProbes(messages);
	session.setEffort("high");
	const command = session.control({ subtype: "interrupt" }, 5000);
	session.dispose();
	await assert.rejects(command, /Session disposed/);
	while (alive(first.pid)) await sleep(20);
	await sleep(200);
	assert.equal(argvProbes(messages).length, 1);
});

test("PRD-001.R5: a send right after the replacement started waits behind the turn queued for the rewind", async () => {
	const { session, messages, until } = makeSession("basic", { ...slowStop(300), ...BRANCH });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.warmUp();
		await until(nthArgv(1));
		session.setEffort("high");
		session.send("A");
		while (!session.liveClient) await sleep(2);
		session.send("B");
		await until((all) => turns(all).length === 2);
		const { pid } = argvProbes(messages)[1];
		const order = messages
			.filter((m) => m.pid === pid && (m.what === "got_user_turn" || m.sub === "rewind_conversation"))
			.map((m) => m.text ?? m.sub);
		assert.deepEqual(order, ["rewind_conversation", "A", "B"]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a Stop right after the replacement started reaches it after the turn queued for the rewind", async () => {
	const { session, messages, until } = makeSession("basic", { ...slowStop(300), ...BRANCH });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.warmUp();
		await until(nthArgv(1));
		session.setEffort("high");
		session.send("A");
		while (!session.liveClient) await sleep(2);
		await session.interrupt();
		await until((all) => turns(all).length === 1);
		const { pid } = argvProbes(messages)[1];
		const order = messages
			.filter((m) => m.pid === pid && (m.what === "got_user_turn" || ["rewind_conversation", "interrupt"].includes(m.sub)))
			.map((m) => m.text ?? m.sub);
		assert.deepEqual(order, ["rewind_conversation", "A", "interrupt"]);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: a branch's rewind names the source's latest prompt, cuts the fork there, then sends the message", async () => {
	const failed = [];
	const { session, messages, until } = makeSession("basic", BRANCH, undefined, { onBranchFailed: (failure) => failed.push(failure) });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.send("hello");
		await until((all) => turns(all).length === 1);
		assert.deepEqual(rewindRequests(messages), [
			{
				subtype: "rewind_conversation",
				target_message_uuid: "00000000-0000-4000-8000-000000000002",
				interrupt_if_running: true,
				last_seen_user_message_uuid: "00000000-0000-4000-8000-000000000003",
			},
		]);
		const order = messages.filter((m) => m.what === "rewound" || m.what === "got_user_turn").map((m) => m.what);
		assert.deepEqual(order, ["rewound", "got_user_turn"]);
		assert.deepEqual(failed, []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: a refused branch rewind sends nothing, ends the forked process and says why", async () => {
	const failed = [];
	const busy = [];
	const { session, messages } = makeSession("basic", BRANCH, undefined, {
		onBranchFailed: (failure) => failed.push(failure),
		onBusyChanged: (value, ended) => busy.push([value, ended]),
	});
	try {
		// The source moved on since: its latest prompt is no longer this one.
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000001");
		session.send("hello");
		session.send("and this");
		await waitFor(() => failed.length > 0);
		assert.deepEqual(failed, [
			{
				reason: "unseen_later_turn",
				detail: "unseen later turn",
				retry: { source: "00000000-0000-4000-8000-00000000f002", target: "00000000-0000-4000-8000-000000000002", latest: "00000000-0000-4000-8000-000000000001" },
			},
		]);
		assert.deepEqual(busy, [
			[true, undefined],
			[false, "exit"],
		]);
		assert.equal(session.liveClient, null);
		const [{ pid }] = argvProbes(messages);
		await waitFor(() => !alive(pid));
		assert.deepEqual(turns(messages), []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: a branch whose target is not a message id is reported as a failed branch, with nothing sent", async () => {
	const failed = [];
	const { session, messages } = makeSession("basic", BRANCH, undefined, { onBranchFailed: (failure) => failed.push(failure) });
	try {
		session.rewindOnStart("--not-an-id", () => "00000000-0000-4000-8000-000000000003");
		session.send("hello");
		await waitFor(() => failed.length > 0);
		assert.match(failed[0].detail, /not a valid message id/);
		// A last-seen id that is not one fails the same way.
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "--not-an-id");
		session.send("again");
		await waitFor(() => failed.length > 1);
		assert.match(failed[1].detail, /not a valid message id/);
		assert.deepEqual(rewindRequests(messages), []);
		assert.deepEqual(turns(messages), []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: the session reports the cut once the rewound fork has its session, and not on a failed rewind", async () => {
	const cut = [];
	const rewound = makeSession("basic", BRANCH, undefined, { onBranchCut: () => cut.push("cut") });
	try {
		rewound.session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		rewound.session.send("hello");
		await rewound.until((all) => all.some((m) => m.type === "result"));
		assert.deepEqual(cut, ["cut"]);
	} finally {
		rewound.session.dispose();
	}
	const failedCut = [];
	const failed = [];
	const refused = makeSession("basic", BRANCH, undefined, {
		onBranchCut: () => failedCut.push("cut"),
		onBranchFailed: (failure) => failed.push(failure),
	});
	try {
		refused.session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000001");
		refused.session.send("hello");
		await waitFor(() => failed.length > 0);
		assert.deepEqual(failedCut, []);
	} finally {
		refused.session.dispose();
	}
});

test("PRD-002.R15: a rewound fork whose turn ends with a result and no init still gets its session, and a restart resumes it without forking or rewinding", async () => {
	const cut = [];
	const { session, messages, until } = makeSession(
		"basic",
		{ ...BRANCH, env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_NO_INIT: "1" } },
		undefined,
		{ onBranchCut: (id) => cut.push(id) }
	);
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		assert.equal(messages.some((m) => m.subtype === "init"), false);
		assert.deepEqual(cut, ["00000000-0000-4000-8000-00000000f001"]);
		assert.equal(session.sessionId, "00000000-0000-4000-8000-00000000f001");
		session.setEffort("high");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--resume"), "00000000-0000-4000-8000-00000000f001");
		assert.equal(second.includes("--fork-session"), false);
		session.send("two");
		await until((all) => turns(all).length === 2);
		assert.equal(rewindRequests(messages).length, 1);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: a disposed session reports closed only once the fork a failed rewind was stopping has exited", async () => {
	const failed = [];
	const { session, messages } = makeSession("basic", { ...BRANCH, ...slowStop(600) }, undefined, {
		onBranchFailed: (failure) => failed.push(failure),
	});
	session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000001");
	session.send("hello");
	await waitFor(() => failed.length > 0);
	const [{ pid }] = argvProbes(messages);
	session.dispose();
	assert.equal(alive(pid), true, "the failed fork is still closing");
	await session.closed;
	assert.equal(alive(pid), false);
});

test("PRD-002.R15: with the source's latest prompt unknown the rewind names none, and its refusal is reported", async () => {
	const failed = [];
	const { session, messages } = makeSession("basic", BRANCH, undefined, { onBranchFailed: (failure) => failed.push(failure) });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => null);
		session.send("hello");
		await waitFor(() => failed.length > 0);
		assert.equal("last_seen_user_message_uuid" in rewindRequests(messages)[0], false);
		assert.deepEqual(failed, [
			{ reason: "stale_target", detail: "stale target", retry: { source: "00000000-0000-4000-8000-00000000f002", target: "00000000-0000-4000-8000-000000000002", latest: null } },
		]);
		assert.deepEqual(turns(messages), []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: a branch rewind the CLI answers with an error is reported with it, and nothing is sent", async () => {
	const failed = [];
	const { session, messages } = makeSession("bare-error", BRANCH, undefined, { onBranchFailed: (failure) => failed.push(failure) });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.send("hello");
		await waitFor(() => failed.length > 0);
		assert.equal(failed[0].reason, null);
		assert.equal(failed[0].detail, "Claude Code refused the request.");
		assert.deepEqual(turns(messages), []);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: the next send after a failed branch rewind forks the source again and retries the rewind", async () => {
	let latest = "00000000-0000-4000-8000-000000000001";
	const failed = [];
	const { session, messages, until } = makeSession("basic", BRANCH, undefined, { onBranchFailed: (failure) => failed.push(failure) });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => latest);
		session.send("hello");
		await waitFor(() => failed.length > 0);
		latest = "00000000-0000-4000-8000-000000000003";
		session.send("again");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--resume"), "00000000-0000-4000-8000-00000000f002");
		assert.ok(second.includes("--fork-session"));
		await until((all) => turns(all).length === 1);
		assert.deepEqual(
			turns(messages).map((m) => m.text),
			["again"]
		);
		assert.equal(rewindRequests(messages).at(-1).last_seen_user_message_uuid, "00000000-0000-4000-8000-000000000003");
		assert.equal(failed.length, 1);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5, PRD-002.R15: a send right after a failed branch rewind waits for the failed fork to close", async () => {
	let latest = "00000000-0000-4000-8000-000000000001";
	const failed = [];
	let session;
	const made = makeSession("basic", { ...slowStop(300), ...BRANCH }, undefined, {
		onBranchFailed: (failure) => {
			failed.push(failure);
			latest = "00000000-0000-4000-8000-000000000003";
			session.send("again");
		},
	});
	session = made.session;
	const { messages, until } = made;
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => latest);
		session.send("hello");
		const first = await until((all) => argvProbes(all)[0]);
		await replacementOf(first, messages, until);
		await until((all) => turns(all).length === 1);
		assert.deepEqual(
			turns(messages).map((m) => m.text),
			["again"]
		);
		assert.equal(failed.length, 1);
	} finally {
		session.dispose();
	}
});

// A branch whose forked process ends while its rewind is pending: with a code, or killed. The
// end handler does what `SessionLink.endedWith` does (it imports obsidian): a lost resume
// drops the resume, which would drop the branch's rewind.
for (const [how, exit] of [
	["exits with a code", "1"],
	["is killed", "kill"],
]) {
	test(`PRD-002.R15: a forked process that ${how} during the rewind reports only the branch failure, keeps the resume, and the next send forks and rewinds again`, async () => {
		let latest = "00000000-0000-4000-8000-000000000004";
		const failed = [];
		const endings = [];
		let session;
		const made = makeSession(
			"basic",
			{ ...BRANCH, env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_REWIND_EXIT: exit } },
			undefined,
			{
				onBranchFailed: (failure) => failed.push(failure),
				onEnded: (error) => {
					endings.push(error);
					if (error && session.resumeLost) session.clearResume();
				},
			}
		);
		session = made.session;
		const { messages, until } = made;
		try {
			session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => latest);
			session.send("hello");
			await waitFor(() => failed.length > 0);
			assert.deepEqual(endings, [undefined]);
			assert.equal(session.resumeLost, false);
			assert.equal(failed[0].reason, "exited");
			assert.deepEqual(failed[0].retry, { source: "00000000-0000-4000-8000-00000000f002", target: "00000000-0000-4000-8000-000000000002", latest: "00000000-0000-4000-8000-000000000004" });
			assert.equal(session.busy, false);
			latest = "00000000-0000-4000-8000-000000000003";
			session.send("again");
			const second = await until(nthArgv(2));
			assert.equal(flagValue(second, "--resume"), "00000000-0000-4000-8000-00000000f002");
			assert.ok(second.includes("--fork-session"));
			await until((all) => turns(all).length === 1);
			assert.deepEqual(
				turns(messages).map((m) => m.text),
				["again"]
			);
			assert.equal(rewindRequests(messages).length, 2);
			assert.equal(failed.length, 1);
		} finally {
			session.dispose();
		}
	});
}

test("PRD-002.R15: once the branch's first turn gives it a session, a restart resumes that session without forking or rewinding", async () => {
	const { session, messages, until } = makeSession("basic", BRANCH);
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		session.setEffort("high");
		const second = await until(nthArgv(2));
		assert.equal(flagValue(second, "--resume"), "00000000-0000-4000-8000-00000000f001");
		assert.equal(second.includes("--fork-session"), false);
		session.send("two");
		await until((all) => turns(all).length === 2);
		assert.equal(rewindRequests(messages).length, 1);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R15: a resumed session that ends before reporting its id has lost its resume, unless a branch's rewind is pending", async () => {
	const plain = makeSession("basic", { resumeSessionId: "00000000-0000-4000-8000-00000000f002" });
	const branch = makeSession("basic", BRANCH);
	try {
		assert.equal(plain.session.resumeLost, true);
		branch.session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		assert.equal(branch.session.resumeLost, false);
		branch.session.send("hello");
		await branch.until((all) => all.some((m) => m.type === "result"));
		assert.equal(branch.session.resumeLost, false);
	} finally {
		plain.session.dispose();
		branch.session.dispose();
	}
});

test("PRD-002.R15: a dropped resume drops the branch's rewind, and the next send starts a fresh session", async () => {
	const failed = [];
	const { session, messages, until } = makeSession("basic", BRANCH, undefined, { onBranchFailed: (failure) => failed.push(failure) });
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000001");
		session.send("hello");
		await waitFor(() => failed.length > 0);
		session.clearResume();
		session.send("fresh");
		const second = await until(nthArgv(2));
		assert.equal(second.includes("--resume"), false);
		await until((all) => turns(all).length === 1);
		assert.equal(rewindRequests(messages).length, 1);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a prompt open when the CLI restarts is cancelled, and no answer is written to the old process", async () => {
	const asked = [];
	const cancelled = [];
	const answers = new Map();
	let answerMcp;
	const { session, messages, until } = makeSession(
		"background-permission",
		slowStop(300, { FAKE_CLI_SCENARIO: "background-permission" }),
		(req) => {
			asked.push(req.requestId);
			return new Promise((resolve) => answers.set(req.requestId, resolve));
		},
		{
			// As the view does: a cancelled card is settled as denied.
			onPermissionCancelled: (id) => {
				cancelled.push(id);
				answers.get(id)?.({ behavior: "deny", message: "Cancelled" });
			},
			onMcpMessage: () => new Promise((resolve) => (answerMcp = resolve)),
		}
	);
	try {
		session.warmUp();
		await waitFor(() => asked.length === 1 && answerMcp !== undefined);
		assert.equal(session.busy, false);
		const old = session.liveClient;
		const written = [];
		const write = old.proc.stdin.write.bind(old.proc.stdin);
		old.proc.stdin.write = (chunk, ...rest) => {
			written.push(String(chunk));
			return write(chunk, ...rest);
		};
		session.setEffort("high");
		assert.deepEqual(cancelled, asked, "the open prompt was not settled");
		answerMcp({ jsonrpc: "2.0", id: 1, result: { tools: [] } });
		await until(nthArgv(2));
		await sleep(50);
		assert.deepEqual(written, [], "an answer was written to the stopping process");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a prompt answered before a restart is not cancelled by it", async () => {
	const cancelled = [];
	const { session, messages, until } = makeSession(
		"background-permission",
		{ env: { FAKE_CLI_SCENARIO: "background-permission" } },
		undefined,
		{ onPermissionCancelled: (id) => cancelled.push(id), onMcpMessage: async () => null }
	);
	try {
		session.warmUp();
		await until((all) => all.some((m) => m.what === "got_control_response" && m.response.response?.behavior === "allow"));
		session.setEffort("high");
		await until(nthArgv(2));
		assert.deepEqual(cancelled, []);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a late answer from a replaced process leaves its successor's prompt with the same id open, so the next restart cancels it", async () => {
	const asked = [];
	const answers = [];
	const cancelled = [];
	const { session, until } = makeSession(
		"background-permission",
		{ env: { FAKE_CLI_SCENARIO: "background-permission" } },
		(req) => {
			asked.push(req.requestId);
			return new Promise((resolve) => answers.push(resolve));
		},
		// As the flow does for a prompt with no card (an Auto-approve edit waiting for its read): nothing to settle.
		{ onPermissionCancelled: (id) => cancelled.push(id), onMcpMessage: async () => null }
	);
	try {
		session.warmUp();
		await waitFor(() => asked.length === 1);
		session.setEffort("high");
		assert.deepEqual(cancelled, ["cli_1"]);
		await until(nthArgv(2));
		await waitFor(() => asked.length === 2);
		assert.deepEqual(asked, ["cli_1", "cli_1"], "the new process numbers its requests afresh");
		// The first process's prompt is answered only now, after its successor's took the same id.
		answers[0]({ behavior: "allow", updatedInput: {} });
		await sleep(20);
		session.setEffort("low");
		assert.deepEqual(cancelled, ["cli_1", "cli_1"], "the second process's open prompt was not cancelled");
		await until(nthArgv(3));
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: of two prompts one process sent under one id, the one still open is cancelled at a restart after the other was answered", async () => {
	const asked = [];
	const answers = [];
	const cancelled = [];
	const { session, until } = makeSession(
		"background-permission",
		{ env: { FAKE_CLI_SCENARIO: "background-permission", FAKE_CLI_DUPLICATE_PROMPT: "1" } },
		(req) => {
			asked.push(`${req.requestId} ${req.toolName}`);
			return new Promise((resolve) => answers.push(resolve));
		},
		{ onPermissionCancelled: (id) => cancelled.push(id), onMcpMessage: async () => null }
	);
	try {
		session.warmUp();
		await waitFor(() => asked.length === 2);
		assert.deepEqual(asked, ["cli_1 Edit", "cli_1 Bash"]);
		answers[0]({ behavior: "allow", updatedInput: {} });
		await sleep(20);
		session.setEffort("high");
		assert.deepEqual(cancelled, ["cli_1"], "the open prompt was not cancelled");
		await until(nthArgv(2));
	} finally {
		session.dispose();
	}
});

test("PRD-001.R5: a panel command just before a restart starts no process while the old one closes", async () => {
	const { session, messages, until } = makeSession("basic", slowStop(300));
	try {
		session.warmUp();
		await until(nthArgv(1));
		const [first] = argvProbes(messages);
		const command = session.control({ subtype: "interrupt" }, 5000);
		session.setEffort("high");
		await command;
		const second = await replacementOf(first, messages, until);
		assert.equal(flagValue(second.argv, "--effort"), "high");
		await sleep(100);
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R11: a turn's busy state ends with how it ended, its result or the process exiting", async () => {
	const changes = [];
	const done = makeSession("basic", {}, undefined, { onBusyChanged: (...args) => changes.push(args) });
	try {
		done.session.send("hello");
		await done.until((all) => all.some((m) => m.type === "result"));
		assert.deepEqual(changes, [[true, undefined], [false, "result"]]);
	} finally {
		done.session.dispose();
	}
	const crashed = [];
	let ended;
	const exited = new Promise((resolve) => {
		ended = resolve;
	});
	const crash = makeSession("crash", {}, undefined, {
		onBusyChanged: (...args) => crashed.push(args),
		onEnded: () => ended(),
	});
	try {
		crash.session.send("hello");
		await exited;
		assert.deepEqual(crashed, [[true, undefined], [false, "exit"]]);
	} finally {
		crash.session.dispose();
	}
});

const { compactionSignal } = await import("./.build/state/compaction.mjs");

/** The compaction signals a fake-CLI scenario sends for one message, in order, up to its result. */
async function compactionSignals(scenario, text) {
	const { session, messages, until } = makeSession(scenario);
	try {
		session.send(text);
		await until((seen) => seen.some((m) => m.type === "result"));
		return messages.flatMap((m) => compactionSignal(m) ?? []);
	} finally {
		session.dispose();
	}
}

test("PRD-001.R37, E3: the fake CLI's compact-auto turn sends the status, the boundary and the summary", async () => {
	const signals = await compactionSignals("compact-auto", "go");
	assert.deepEqual(
		signals.map((s) => s.type),
		["compacting", "success", "boundary", "summary"]
	);
	assert.deepEqual(signals[2], { type: "boundary", trigger: "auto", preTokens: 131000, postTokens: 18000 });
});

test("PRD-001.R37, V5: compact-manual sends them for /compact, and compact-failed a failure", async () => {
	const manual = await compactionSignals("compact-manual", "/compact");
	assert.deepEqual(
		manual.map((s) => s.type),
		["compacting", "success", "boundary", "summary"]
	);
	assert.equal(manual[2].trigger, "manual");
	const failed = await compactionSignals("compact-failed", "/compact");
	assert.deepEqual(
		failed.map((s) => s.type),
		["compacting", "failed", "notice"]
	);
	assert.equal(failed[2].notice, "canceled");
});

test("PRD-001.R37, V5: compact-empty sends only the CLI's synthetic notice, which is a signal and not a reply", async () => {
	assert.deepEqual(await compactionSignals("compact-empty", "/compact"), [{ type: "notice", notice: "empty" }]);
});

test("PRD-001.R37, V5: the notice of a model other than <synthetic> is an ordinary reply", () => {
	const reply = (model) => ({ type: "assistant", message: { model, content: [{ type: "text", text: "Error: No messages to compact" }] } });
	assert.equal(compactionSignal(reply("claude-opus")), null);
	assert.deepEqual(compactionSignal(reply("<synthetic>")), { type: "notice", notice: "empty" });
});

test("PRD-005.R7: a fork's start is reported with its source at the rewind's send, and again for the retry after a refused rewind", async () => {
	const starts = [];
	const first = makeSession("basic", BRANCH, undefined, { onForkStart: (source) => starts.push(source) });
	try {
		first.session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		assert.deepEqual(starts, [], "nothing starts before the first message");
		first.session.send("hello");
		await first.until(nthArgv(1));
		assert.deepEqual(starts, [BRANCH.resumeSessionId]);
	} finally {
		first.session.dispose();
	}
	const failed = [];
	starts.length = 0;
	const retried = makeSession("bare-error", BRANCH, undefined, {
		onForkStart: (source) => starts.push(source),
		onBranchFailed: (failure) => failed.push(failure),
	});
	try {
		retried.session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		retried.session.send("hello");
		await waitFor(() => failed.length > 0);
		assert.equal(starts.length, 1);
		retried.session.send("again");
		await retried.until(nthArgv(2));
		assert.deepEqual(starts, [BRANCH.resumeSessionId, BRANCH.resumeSessionId]);
	} finally {
		retried.session.dispose();
	}
});

test("PRD-005.R7: a plain resume is no fork, and a fork the device refuses never starts", async () => {
	const starts = [];
	const plain = makeSession("basic", { resumeSessionId: BRANCH.resumeSessionId }, undefined, { onForkStart: (s) => starts.push(s) });
	try {
		plain.session.send("hello");
		await plain.until(nthArgv(1));
	} finally {
		plain.session.dispose();
	}
	const foreign = makeSession("basic", BRANCH, undefined, { onForkStart: (s) => starts.push(s), mayResume: () => "foreign" });
	try {
		foreign.session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => null);
		foreign.session.send("hello");
		await foreign.until(nthArgv(1));
	} finally {
		foreign.session.dispose();
	}
	assert.deepEqual(starts, []);
});

test("PRD-005.R7, V7: a forked fake CLI reports its source's total on top of its own spend", async () => {
	const config = { ...BRANCH, env: { FAKE_CLI_SCENARIO: "turn", FAKE_CLI_SOURCE_TOTAL: "0.5" } };
	const { session, until } = makeSession("turn", config);
	try {
		session.rewindOnStart("00000000-0000-4000-8000-000000000002", () => "00000000-0000-4000-8000-000000000003");
		session.send("hello");
		const result = await until((all) => all.find((m) => m.type === "result"));
		assert.ok(Math.abs(result.total_cost_usd - 0.5123) < 1e-9, String(result.total_cost_usd));
	} finally {
		session.dispose();
	}
});

/** A clear gate that records what it sees and, once armed, consumes the reset and the results. */
function clearGate() {
	const state = { armed: false, seen: [], closed: [] };
	const gate = {
		message(generation, msg) {
			if (!state.armed) return "pass";
			if (msg.subtype !== "probe") state.seen.push({ generation, name: msg.type === "system" ? msg.subtype : msg.type });
			return msg.type === "conversation_reset" || msg.type === "result" ? "consume" : "pass";
		},
		closed: (generation) => state.closed.push(generation),
	};
	return { gate, state };
}

test("PRD-001.R38, ADR-018: writeClear sets no busy, and the gate sees the reset, the new session and the zero result first", async () => {
	const busy = [];
	const { session, messages, until } = makeSession("basic", {}, undefined, { onBusyChanged: (b) => busy.push(b) });
	const { gate, state } = clearGate();
	session.setClearGate(gate);
	try {
		assert.equal(session.writeClear(), false, "no process yet");
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		assert.deepEqual(busy, [true, false]);
		state.armed = true;
		const generation = session.generation;
		assert.equal(session.writeClear(), true);
		await waitFor(() => state.seen.some((m) => m.name === "result"));
		assert.deepEqual(state.seen.map((m) => m.name), ["conversation_reset", "init", "result"]);
		assert.ok(state.seen.every((m) => m.generation === generation));
		// The consumed answer reached nothing; the new session's init did.
		assert.equal(messages.some((m) => m.type === "conversation_reset"), false);
		assert.equal(messages.filter((m) => m.type === "result").length, 1);
		assert.equal(session.sessionId, "00000000-0000-4000-8000-00000000f002");
		assert.deepEqual(busy, [true, false], "the answer is no turn");
		assert.equal(turns(messages).at(-1).text, "/clear");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a clear written mid-turn waits in the CLI for the turn's result, which the gate sees first", async () => {
	const { session, until } = makeSession("turn", {});
	const { gate, state } = clearGate();
	session.setClearGate(gate);
	state.armed = true;
	try {
		session.send("hello");
		await until((all) => all.some((m) => m.what === "got_user_turn"));
		assert.equal(session.writeClear(), true);
		await waitFor(() => state.seen.filter((m) => m.name === "result").length === 2, 15000);
		const names = state.seen.map((m) => m.name);
		assert.deepEqual(names.slice(-3), ["conversation_reset", "init", "result"]);
		assert.ok(names.indexOf("result") < names.indexOf("conversation_reset"), "the turn's result came before the reset");
	} finally {
		session.dispose();
	}
});

const setRequests = (messages) =>
	messages.filter((m) => m.what === "got_control_request" && /^set_/.test(m.sub)).map((m) => [m.sub, m.request.mode ?? m.request.model]);

test("PRD-001.R38: the effective mode and model are the launch's, then the CLI's report, then each accepted switch", async () => {
	const { session, until } = makeSession("basic", { permissionMode: "acceptEdits", model: "claude-sonnet-5" });
	try {
		assert.deepEqual(session.effective, {});
		session.warmUp();
		await until(nthArgv(1));
		assert.deepEqual(session.effective, { permissionMode: "acceptEdits", model: "claude-sonnet-5" });
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		// The init of the turn reports the model it runs.
		assert.equal(session.effective.model, "claude-sonnet-5");
		assert.equal(await session.setPermissionMode("plan"), true);
		assert.equal(await session.setModel("claude-haiku-5"), true);
		assert.deepEqual(session.effective, { permissionMode: "plan", model: "claude-haiku-5" });
		assert.equal(session.effective.model, session.model);
	} finally {
		session.dispose();
	}
});

/** A session whose handshake mode goes to noteHandshakeMode, as the tab's session link does. */
function handshakeSession(config = {}) {
	let session;
	const made = makeSession("handshake-mode", config, undefined, { onInitInfo: (info) => session.noteHandshakeMode(info.current_permission_mode) });
	session = made.session;
	return made;
}

test("PRD-001.R38: a launch with no mode takes the mode the handshake reports as its effective mode", async () => {
	const { session } = handshakeSession();
	try {
		assert.deepEqual(session.effective, {});
		session.warmUp();
		await waitFor(() => session.effective.permissionMode === "plan");
		assert.equal(session.permissionMode, undefined, "the launch config is left as it is");
		session.noteHandshakeMode("yolo");
		session.noteHandshakeMode(undefined);
		assert.equal(session.effective.permissionMode, "plan");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: the handshake mode never replaces the launch's mode, a pick or a report", async () => {
	const launched = handshakeSession({ permissionMode: "acceptEdits" });
	try {
		launched.session.warmUp();
		await launched.until(nthArgv(1));
		await sleep(150);
		assert.equal(launched.session.effective.permissionMode, "acceptEdits");
	} finally {
		launched.session.dispose();
	}
	const picked = handshakeSession();
	try {
		picked.session.warmUp();
		await picked.until(nthArgv(1));
		assert.equal(await picked.session.setPermissionMode("acceptEdits"), true);
		picked.session.noteHandshakeMode("plan");
		assert.equal(picked.session.effective.permissionMode, "acceptEdits");
	} finally {
		picked.session.dispose();
	}
	const reported = makeSession("handshake-mode");
	try {
		reported.session.send("hello");
		await reported.until((all) => all.some((m) => m.type === "result"));
		const report = reported.session.effective.permissionMode;
		assert.ok(report && report !== "plan", "the init report filled the slot first");
		reported.session.noteHandshakeMode("plan");
		assert.equal(reported.session.effective.permissionMode, report, "a handshake after a report does not replace it");
	} finally {
		reported.session.dispose();
	}
});

test("PRD-001.R38: a CLI that starts in Bypass with the bypass setting off is not taken as the mode to keep", async () => {
	const { session } = makeSession("basic", { allowBypassPermissions: false });
	try {
		session.noteHandshakeMode("bypassPermissions");
		assert.equal(session.effective.permissionMode, undefined);
	} finally {
		session.dispose();
	}
	const on = makeSession("basic", { allowBypassPermissions: true });
	try {
		on.session.noteHandshakeMode("bypassPermissions");
		assert.equal(on.session.effective.permissionMode, "bypassPermissions");
	} finally {
		on.session.dispose();
	}
});

test("PRD-001.R38: a pick the CLI refused does not keep the inherited handshake mode from being the effective mode", async () => {
	const { session, until } = makeSession("handshake-mode", { env: { FAKE_CLI_SCENARIO: "handshake-mode", FAKE_CLI_REFUSE_MODE: "acceptEdits" } });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await assert.rejects(session.setPermissionMode("acceptEdits"));
		session.noteHandshakeMode("plan");
		assert.equal(session.effective.permissionMode, "plan");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: the effective mode under Auto-approve is the CLI's default, the panel's policy not being a CLI mode", async () => {
	const { session, until } = makeSession("basic", { permissionMode: "default" });
	try {
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		assert.equal(session.effective.permissionMode, "default");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: reapply sets the mode then the model on the running process and keeps the launch config", async () => {
	const { session, messages, until } = makeSession("basic", { permissionMode: "acceptEdits", model: "claude-sonnet-5" });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await session.reapply({ permissionMode: "plan", model: "claude-haiku-5" });
		await until((all) => setRequests(all).length === 2);
		assert.deepEqual(setRequests(messages), [["set_permission_mode", "plan"], ["set_model", "claude-haiku-5"]]);
		assert.deepEqual(session.effective, { permissionMode: "plan", model: "claude-haiku-5" });
		assert.equal(session.permissionMode, "plan", "a mode that took is the launch config's, so a restart carries it");
		assert.equal(session.model, "claude-sonnet-5", "the model config is left as it is");
		await session.reapply({});
		assert.equal(setRequests(messages).length, 2, "nothing to set sends nothing");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a reapply answered after its process was replaced rejects and writes nothing", async () => {
	const { session, until } = makeSession("basic", {
		permissionMode: "acceptEdits",
		env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_MODE_DELAY_MS: "300" },
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const late = session.reapply({ permissionMode: "plan" });
		session.restart();
		await assert.rejects(() => late);
		assert.equal(session.effective.permissionMode, "acceptEdits");
		assert.equal(session.permissionMode, "acceptEdits");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a reapply of Bypass overtaken by leaving Bypass never launches the replacement in Bypass", async () => {
	const { session, messages, until } = makeSession("basic", {
		allowBypassPermissions: true,
		permissionMode: "acceptEdits",
		env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_MODE_DELAY_MS: "300" },
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const release = session.hold();
		const inFlight = session.reapply({ permissionMode: "bypassPermissions" });
		session.leaveBypass(true);
		await inFlight;
		assert.equal(session.permissionMode, "default", "the config keeps the mode leaving Bypass set");
		assert.notEqual(session.effective.permissionMode, "bypassPermissions");
		release();
		const second = await until(nthArgv(2));
		assert.ok(!second.includes(BYPASS_FLAG));
		assert.equal(flagValue(second, "--permission-mode"), "default");
		assert.equal(argvProbes(messages).length, 2);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a reapply of Bypass writes nothing once the bypass setting is off, and a newer pick wins over it", async () => {
	const off = makeSession("basic", { allowBypassPermissions: false, permissionMode: "acceptEdits", env: { FAKE_CLI_SCENARIO: "basic" } });
	try {
		off.session.warmUp();
		await off.until(nthArgv(1));
		assert.deepEqual(await off.session.reapply({ permissionMode: "bypassPermissions" }), { modeSkipped: true });
		assert.deepEqual(setRequests(off.messages), [], "Bypass is not even sent");
		assert.equal(off.session.permissionMode, "acceptEdits");
		assert.equal(off.session.effective.permissionMode, "acceptEdits");
	} finally {
		off.session.dispose();
	}
	const { session, until } = makeSession("basic", { permissionMode: "acceptEdits", env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_MODE_DELAY_MS: "200" } });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const inFlight = session.reapply({ permissionMode: "plan" });
		assert.equal(await session.setPermissionMode("default"), true);
		await inFlight;
		assert.equal(session.permissionMode, "default", "the newer pick's mode stays the config's");
		assert.equal(session.effective.permissionMode, "default");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a newer mode pick the CLI refused still keeps an older reapply from writing the config", async () => {
	const { session, until } = makeSession("basic", {
		permissionMode: "acceptEdits",
		env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_MODE_DELAY_MS: "200", FAKE_CLI_REFUSE_MODE: "default" },
	});
	try {
		session.warmUp();
		await until(nthArgv(1));
		const inFlight = session.reapply({ permissionMode: "plan" });
		await assert.rejects(() => session.setPermissionMode("default"), /Refused mode/);
		await inFlight;
		assert.equal(session.permissionMode, "acceptEdits");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: reapply with a model key of undefined sets Default, and without the key sends nothing", async () => {
	const { session, messages, until } = makeSession("basic", { model: "claude-sonnet-5" });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await session.reapply({ permissionMode: undefined });
		assert.equal(setRequests(messages).length, 0);
		await session.reapply({ model: undefined });
		await until((all) => setRequests(all).length === 1);
		assert.equal(session.effective.model, undefined);
	} finally {
		session.dispose();
	}
});

test("PRD-002.R10: a Bypass the CLI reported is never adopted once the bypass setting is off", async () => {
	const { session, until } = makeSession("basic", { allowBypassPermissions: true, permissionMode: "acceptEdits" });
	try {
		session.warmUp();
		await until(nthArgv(1));
		const release = session.hold();
		session.leaveBypass(true);
		session.adoptPermissionMode("bypassPermissions");
		assert.equal(session.permissionMode, "default");
		release();
		const second = await until(nthArgv(2));
		assert.ok(!second.includes(BYPASS_FLAG));
		assert.equal(flagValue(second, "--permission-mode"), "default");
		session.adoptPermissionMode("plan");
		assert.equal(session.permissionMode, "plan", "other modes are adopted");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: setModel(undefined), Default, is a pick that reaches the clear gate", async () => {
	const picks = [];
	const { session, until } = makeSession("basic", { model: "claude-sonnet-5" });
	session.setClearGate({ message: () => "pass", closed() {}, picked: (generation, values) => picks.push(values) });
	try {
		session.warmUp();
		await until(nthArgv(1));
		assert.equal(await session.setModel(undefined), true);
		assert.deepEqual(picks, [{ model: undefined }]);
		assert.ok("model" in picks[0]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: an accepted pick reaches the clear gate with the process it was made on", async () => {
	const picks = [];
	const { session, until } = makeSession("basic", {});
	session.setClearGate({ message: () => "pass", closed() {}, picked: (generation, values) => picks.push([generation, values]) });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await session.setPermissionMode("plan");
		await session.setModel("claude-haiku-5");
		await session.reapply({ permissionMode: "acceptEdits" });
		assert.deepEqual(picks, [
			[session.generation, { permissionMode: "plan" }],
			[session.generation, { model: "claude-haiku-5" }],
		]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: reapply rejects when the CLI refuses a switch or no process runs", async () => {
	const none = makeSession("basic", {});
	await assert.rejects(() => none.session.reapply({ model: "claude-haiku-5" }));
	none.session.dispose();
	const { session, until } = makeSession("basic", { env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_REFUSE_MODEL: "claude-haiku-5" } });
	try {
		session.warmUp();
		await until(nthArgv(1));
		await assert.rejects(() => session.reapply({ model: "claude-haiku-5" }), /Refused model/);
		assert.equal(session.effective.model, undefined);
	} finally {
		session.dispose();
	}
});

test("ADR-018: the process number is unique across sessions and grows with every process", async () => {
	const a = makeSession("basic", {});
	const b = makeSession("basic", {});
	try {
		assert.equal(a.session.generation, 0);
		a.session.send("one");
		b.session.send("two");
		await a.until((all) => all.some((m) => m.type === "result"));
		await b.until((all) => all.some((m) => m.type === "result"));
		assert.notEqual(a.session.generation, b.session.generation);
		const first = a.session.generation;
		a.session.restart();
		await a.until(nthArgv(2));
		assert.ok(a.session.generation > first);
	} finally {
		a.session.dispose();
		b.session.dispose();
	}
});

test("ADR-018: the gate hears a process end, however it ended: a restart, an abandon, a dispose, an exit", async () => {
	const first = makeSession("basic", {});
	const one = clearGate();
	first.session.setClearGate(one.gate);
	try {
		first.session.send("hello");
		await first.until((all) => all.some((m) => m.type === "result"));
		const before = first.session.generation;
		first.session.restart();
		assert.deepEqual(one.state.closed, [before]);
		await first.until(nthArgv(2));
		const after = first.session.generation;
		first.session.abandon();
		assert.deepEqual(one.state.closed, [before, after]);
		assert.equal(first.session.running, false);
		first.session.abandon();
		assert.deepEqual(one.state.closed, [before, after], "nothing runs, so nothing ends");
	} finally {
		first.session.dispose();
	}
	assert.equal(one.state.closed.length, 3);
	const exits = makeSession("basic", { env: { FAKE_CLI_SCENARIO: "basic", FAKE_CLI_CLEAR: "exit" } });
	const two = clearGate();
	exits.session.setClearGate(two.gate);
	try {
		exits.session.send("hello");
		await exits.until((all) => all.some((m) => m.type === "result"));
		const generation = exits.session.generation;
		exits.session.writeClear();
		await waitFor(() => two.state.closed.length === 1);
		assert.deepEqual(two.state.closed, [generation]);
	} finally {
		exits.session.dispose();
	}
});

test("PRD-001.R38: a turn's result reaches the view before the restart it owes, and the gate hears the exit after", async () => {
	const order = [];
	let release;
	const held = new Promise((resolve) => (release = resolve));
	let asked;
	const askedOnce = new Promise((resolve) => (asked = resolve));
	const { session } = makeSession(
		"permission",
		{},
		async (req) => {
			asked();
			await held;
			return { behavior: "allow", updatedInput: req.input };
		},
		{
			onStreamMessage: (msg) => {
				if (msg.type === "result") order.push("result");
			},
		}
	);
	session.setClearGate({ message: () => "pass", closed: () => order.push("closed") });
	try {
		session.send("go");
		await askedOnce;
		session.setEffort("high");
		assert.deepEqual(order, []);
		release();
		await waitFor(() => order.includes("closed"));
		assert.deepEqual(order, ["result", "closed"]);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: a result reaches the view even when the busy callback throws, it is logged, and the owed restart follows", (t) => {
	const logged = t.mock.method(console, "error", () => {});
	const order = [];
	const { session } = makeSession("basic", {}, undefined, {
		onStreamMessage: (msg) => order.push(msg.type),
		onBusyChanged: (busy) => {
			if (!busy) throw new Error("boom");
		},
	});
	session.setClearGate({ message: () => "pass", closed: () => order.push("closed") });
	try {
		session.warmUp();
		session.setBusy(true);
		session.setEffort("high");
		assert.doesNotThrow(() => session.handleStreamMessage({ type: "result", subtype: "success" }));
		assert.deepEqual(order, ["result", "closed"]);
		assert.equal(logged.mock.callCount(), 1);
		// The next line of the chunk is processed.
		assert.doesNotThrow(() => session.handleStreamMessage({ type: "assistant", message: { content: [] } }));
		assert.equal(order.at(-1), "assistant");
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: abandon spawns nothing, and the next send starts a process", async () => {
	const { session, until } = makeSession("basic", {});
	try {
		session.send("one");
		await until((all) => all.some((m) => m.type === "result"));
		session.abandon();
		await new Promise((resolve) => setTimeout(resolve, 300));
		assert.equal(session.running, false);
		session.send("two");
		await until(nthArgv(2));
	} finally {
		session.dispose();
	}
});

test("PRD-001.R39: a process that reaches system/init says so, once", async () => {
	let reached = 0;
	const { session, until } = makeSession("basic", {}, undefined, { onReached: () => reached++ });
	try {
		session.send("hello");
		await until((all) => all.some((m) => m.type === "result"));
		assert.equal(reached, 1);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R39: a process that exits before system/init reports its exit code and where it ran", async () => {
	const exits = [];
	let ended;
	const done = new Promise((resolve) => (ended = resolve));
	const { session } = makeSession("exit127", {}, undefined, {
		onReached: () => exits.push("reached"),
		onExitBeforeInit: (info) => exits.push(info),
		onEnded: (error) => ended(error),
	});
	try {
		session.send("hello");
		const error = await done;
		assert.deepEqual(exits, [{ code: 127, useWsl: false }]);
		assert.match(error, /exited with code 127/);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R39: a process that exits after system/init reports no exit before init", async () => {
	const exits = [];
	let ended;
	const done = new Promise((resolve) => (ended = resolve));
	const { session } = makeSession("crash", {}, undefined, {
		onExitBeforeInit: (info) => exits.push(info),
		onEnded: () => ended(),
	});
	try {
		session.send("hello");
		await done;
		assert.deepEqual(exits, []);
	} finally {
		session.dispose();
	}
});
