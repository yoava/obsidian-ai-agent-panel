import type { App } from "obsidian";

/**
 * Reads of this vault's device-local storage, typed honestly.
 *
 * `App.loadLocalStorage` is declared to return `any`, so anything read through
 * it enters the plugin unchecked - and the values it returns are exactly the
 * ones a user, a sync conflict or an older plugin version can have left behind
 * in a shape the current code no longer expects. These wrappers hand back
 * `unknown` instead, so every caller has to narrow before it can use the value.
 *
 * Writes go straight to `app.saveLocalStorage`: it already takes `unknown`, so
 * a wrapper would add nothing.
 */

/** One stored value, unnarrowed. `null` when the key is unset. */
export function loadLocalValue(app: App, key: string): unknown {
	return app.loadLocalStorage(key);
}

/**
 * One stored value, but only if it is an object - the shape a stored record is
 * written as. Anything else (a stale string, an array, an unset key) is `null`,
 * so the caller can go straight to reading its fields as `unknown`.
 */
export function loadLocalRecord(app: App, key: string): Record<string, unknown> | null {
	const value = loadLocalValue(app, key);
	if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}
