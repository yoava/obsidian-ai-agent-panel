import { test } from "node:test";
import assert from "node:assert/strict";
import { asJsonObject, isJsonObject } from "./.build/json.mjs";

test("isJsonObject accepts objects, empty and nested", () => {
	for (const value of [{}, { a: 1 }, { a: { b: [] } }, JSON.parse('{"a":null}')])
		assert.equal(isJsonObject(value), true);
});

test("isJsonObject refuses null, arrays and every primitive", () => {
	for (const value of [null, undefined, [], [{}], 0, 5, NaN, "", "x", true, false, Symbol("s"), 1n])
		assert.equal(isJsonObject(value), false);
});

test("asJsonObject returns an object itself", () => {
	for (const value of [{}, { a: 1 }, JSON.parse('{"a":null}')]) assert.equal(asJsonObject(value), value);
});

test("asJsonObject reads null, arrays and every primitive as a fresh empty object", () => {
	const seen = new Set();
	for (const value of [null, undefined, [], [{}], 0, 5, "", "x", true, false, Symbol("s"), 1n]) {
		const result = asJsonObject(value);
		assert.deepEqual(result, {});
		assert.equal(Object.getPrototypeOf(result), Object.prototype);
		seen.add(result);
	}
	assert.equal(seen.size, 12, "one caller's write must not reach the next");
});
