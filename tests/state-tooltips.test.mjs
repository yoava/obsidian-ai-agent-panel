import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_TOOLTIPS_CLASS, hidesTooltips } from "./.build/state/tooltips.mjs";

test("PRD-001.R32: a scope carries the no-tooltips class exactly while Show tooltips is off", () => {
	assert.equal(NO_TOOLTIPS_CLASS, "mod-no-tooltips");
	assert.equal(hidesTooltips(true), false);
	assert.equal(hidesTooltips(false), true);
});
