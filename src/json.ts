/**
 * Shared JSON guards, Obsidian-free so plain Node tests them. The one place
 * that says what a JSON object is.
 */

/** A JSON object: not `null`, not an array. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `value` when it is a JSON object, else a fresh empty one: a reader of an untrusted reply need not guard each step. */
export function asJsonObject(value: unknown): Record<string, unknown> {
	return isJsonObject(value) ? value : {};
}
