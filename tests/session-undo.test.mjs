import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

// A process that resumes a session and is sent no prompt: an Undo's (PRD-001.R38, V1).
const { ClaudeSession, launchKey } = await import("./.build/session.mjs");

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_CLI = path.join(here, "fake-cli.mjs");
const ENDED = "00000000-0000-4000-8000-00000000f00a";

function makeSession(config = {}, env = {}) {
	const messages = [];
	const session = new ClaudeSession(
		{ cliPath: FAKE_CLI, cwd: here, env: { FAKE_CLI_SCENARIO: "basic", ...env }, ...config },
		{
			onStreamMessage: (msg) => messages.push(msg),
			onPermissionRequest: async (req) => ({ behavior: "allow", updatedInput: req.input }),
			onPermissionCancelled: () => {},
			onBusyChanged: () => {},
			onEnded: () => {},
		},
		"profile-1"
	);
	return { session, messages };
}

const argvOf = (messages) => messages.find((m) => m.subtype === "probe" && m.what === "argv")?.argv ?? [];
const turns = (messages) => messages.filter((m) => m.what === "got_user_turn");

test("PRD-001.R38, V1: probe answers with the resumed session's context usage before any turn, and sends no prompt", async () => {
	const { session, messages } = makeSession({ resumeSessionId: ENDED });
	try {
		const usage = await session.probe();
		assert.equal(typeof usage.totalTokens, "number");
		assert.ok(usage.categories.length > 0);
		const argv = argvOf(messages);
		assert.equal(argv[argv.indexOf("--resume") + 1], ENDED);
		assert.equal(argv.includes("--fork-session"), false);
		assert.equal(turns(messages).length, 0);
		assert.equal(session.sessionId, null);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38, V1: a process that resumed nothing has no context to report, so probe rejects with the reason", async () => {
	const { session } = makeSession();
	try {
		await assert.rejects(() => session.probe(), /no turn received yet/);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: probe rejects for an error reply, a reply without the categories, and a process that exits first", async () => {
	for (const [env, pattern] of [
		[{ FAKE_CLI_REFUSE_USAGE: "1" }, /Refused get_context_usage/],
		[{ FAKE_CLI_USAGE: "bare" }, /did not report/],
		[{ FAKE_CLI_USAGE: "exit" }, /./],
	]) {
		const { session } = makeSession({ resumeSessionId: ENDED }, env);
		try {
			await assert.rejects(() => session.probe(), pattern);
		} finally {
			session.dispose();
		}
	}
});

test("PRD-001.R38, V1: an id the CLI does not hold gives an error result and an exit, and probe rejects", async () => {
	const seen = [];
	const { session } = makeSession({ resumeSessionId: ENDED }, { FAKE_CLI_UNKNOWN_SESSION: "1" });
	session.setClearGate({
		message: (_generation, msg) => (seen.push(`${msg.type}${msg.is_error ? " error" : ""}`), "consume"),
		closed: () => seen.push("closed"),
		picked: () => {},
	});
	try {
		await assert.rejects(() => session.probe());
		await new Promise((resolve) => setTimeout(resolve, 200));
		assert.ok(seen.includes("result error"), `an error result: ${seen}`);
		assert.ok(seen.includes("closed"), `an exit: ${seen}`);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: an adopted session takes the id it resumed, so its resume is not taken for lost", () => {
	const { session } = makeSession({ resumeSessionId: ENDED });
	try {
		assert.equal(session.resumeLost, true);
		session.adopt(ENDED);
		assert.equal(session.sessionId, ENDED);
		assert.equal(session.resumeLost, false);
	} finally {
		session.dispose();
	}
});

test("PRD-001.R38: two launches are the same unless their settings differ, whatever session they resume", () => {
	const base = { cliPath: "claude", cwd: "/v", model: "m", permissionMode: "plan", allowBypassPermissions: false, extraArgs: ["--a"] };
	assert.equal(launchKey({ ...base, resumeSessionId: ENDED, forkSession: true }), launchKey({ ...base }));
	for (const change of [{ model: "n" }, { permissionMode: "default" }, { allowBypassPermissions: true }, { extraArgs: ["--b"] }, { effort: "high" }, { appendSystemPrompt: "x" }, { cliPath: "other" }]) {
		assert.notEqual(launchKey({ ...base, ...change }), launchKey(base), JSON.stringify(change));
	}
});
