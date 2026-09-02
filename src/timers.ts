/**
 * Window-scoped timers, with a fallback for when there is no window.
 *
 * Obsidian asks plugins to schedule through `window.setTimeout` rather than the
 * bare global: a popout window is a separate `Window`, and a timer scheduled on
 * it should die with it instead of firing into a closed document. The modules
 * that use this helper - the shell runner, the conversation store and the
 * protocol client - are also bundled for `node --test`, where `window` does not
 * exist, so the host is resolved once here instead of being branched on at
 * every call site.
 */

/**
 * Whatever the host's `setTimeout` returned - a browser id or a Node `Timeout`.
 * It is only ever handed back to {@link clearTimer}, so nothing else needs to
 * know which.
 */
export type TimerHandle = ReturnType<typeof setTimeout> | number;

/** The subset of the timer API this module uses. Declared with method syntax so
 *  both `window` and the Node globals satisfy it. */
interface TimerHost {
	setTimeout(callback: () => void, ms: number): TimerHandle;
	clearTimeout(handle: TimerHandle): void;
}

const host: TimerHost = typeof window === "undefined" ? { setTimeout, clearTimeout } : window;

/** Schedule `callback` after `ms` milliseconds. */
export function setTimer(callback: () => void, ms: number): TimerHandle {
	return host.setTimeout(callback, ms);
}

/** Cancel a timer. Ignores `undefined`, so callers need no guard. */
export function clearTimer(handle: TimerHandle | undefined): void {
	if (handle !== undefined) host.clearTimeout(handle);
}
