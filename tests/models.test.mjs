import { test } from "node:test";
import assert from "node:assert/strict";
import {
	describeModel,
	modelOptions,
	parseCliModels,
} from "./.build/models.mjs";

// Trimmed from a real CLI 2.1.237 initialize response.
const CLI_MODELS_RAW = [
	{
		value: "default",
		resolvedModel: "claude-opus-5[1m]",
		displayName: "Default (recommended)",
		description: "Opus 5 with 1M context · Best for everyday, complex tasks",
		supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
	},
	{
		value: "opus[1m]",
		resolvedModel: "claude-opus-5[1m]",
		displayName: "Opus (1M context)",
		supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
	},
	{
		value: "claude-fable-5[1m]",
		resolvedModel: "claude-fable-5",
		displayName: "Fable",
		supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
	},
	{ value: "sonnet", resolvedModel: "claude-sonnet-5", displayName: "Sonnet" },
	{ value: "haiku", resolvedModel: "claude-haiku-4-5-20251001", displayName: "Haiku" },
];

test("parseCliModels reads the initialize response's models array", () => {
	const models = parseCliModels(CLI_MODELS_RAW);
	assert.equal(models.length, 5);
	// "default" is normalized to the picker's empty value.
	assert.equal(models[0].value, "");
	assert.equal(models[0].resolvedModel, "claude-opus-5[1m]");
	assert.deepEqual(models[1].supportedEffortLevels, [
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	]);
	assert.equal(models[4].supportedEffortLevels, undefined);
});

test("parseCliModels rejects garbage and skips malformed entries", () => {
	assert.equal(parseCliModels(undefined), null);
	assert.equal(parseCliModels("nope"), null);
	assert.equal(parseCliModels([]), null);
	assert.equal(parseCliModels([{ noValue: true }, null]), null);
	const models = parseCliModels([{ value: "opus" }, { value: 7 }]);
	assert.equal(models.length, 1);
});

test("a learned CLI list replaces the static picker entries outright", () => {
	const options = modelOptions(undefined, parseCliModels(CLI_MODELS_RAW));
	assert.deepEqual(
		options.map((o) => o.value),
		["", "opus[1m]", "claude-fable-5[1m]", "sonnet", "haiku"]
	);
	// No opusplan, no sonnet[1m] - this CLI + account does not accept them.
	assert.ok(!options.some((o) => o.value === "opusplan"));
});

test("learned entries label themselves from the resolved id", () => {
	const options = modelOptions(undefined, parseCliModels(CLI_MODELS_RAW));
	const byValue = Object.fromEntries(options.map((o) => [o.value, o]));
	assert.equal(byValue[""].label, "Default model (Opus 5 (1M context))");
	assert.equal(byValue[""].short, "Default");
	assert.equal(byValue["opus[1m]"].label, "Opus 5 (1M context)");
	assert.equal(byValue["opus[1m]"].short, "Opus 5 1M");
	assert.equal(byValue["claude-fable-5[1m]"].label, "Fable 5");
	assert.equal(byValue["haiku"].label, "Haiku 4.5");
	// The CLI's blurb rides along for tooltips.
	assert.match(byValue[""].description ?? "", /everyday/);
});

test("without a learned list the static entries still apply", () => {
	const options = modelOptions();
	assert.ok(options.some((o) => o.value === "opus"));
	assert.ok(options.some((o) => o.value === ""));
});

test("describeModel prefers the learned list, then falls back", () => {
	const cliModels = parseCliModels(CLI_MODELS_RAW);
	assert.equal(describeModel("sonnet", undefined, cliModels).label, "Sonnet 5");
	// A value outside the list (a restored conversation's full id) still labels itself.
	assert.equal(
		describeModel("claude-opus-4-7", undefined, cliModels).label,
		"Opus 4.7"
	);
	// And the resolvedModels cache still applies when there is no list.
	assert.equal(
		describeModel("opus", { opus: "claude-opus-5" }, null).label,
		"Opus 5"
	);
});
