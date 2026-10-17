import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = ["@fontsource-variable/geist", "@fontsource-variable/geist-mono"];

test("ADR-007 legal row: the built main.js carries each bundled font's full license text and copyright notice", () => {
	execFileSync(process.execPath, ["esbuild.config.mjs", "production"], { cwd: ROOT, stdio: "pipe" });
	const bundle = readFileSync(path.join(ROOT, "main.js"), "utf8");
	const header = bundle.slice(0, bundle.indexOf("*/") + 2);
	for (const pkg of PACKAGES) {
		const license = readFileSync(path.join(ROOT, "node_modules", pkg, "LICENSE"), "utf8").trim();
		assert.ok(header.includes(license), `${pkg}: LICENSE in the header, whole`);
		assert.match(license, /^Copyright 2024 The Geist Project Authors/);
	}
	assert.equal(header.match(/^Copyright 2024 The Geist Project Authors/gm)?.length, 2, "both copyright lines");
	assert.equal(header.match(/SIL OPEN FONT LICENSE Version 1\.1/g)?.length, 2, "the OFL text twice");
});
