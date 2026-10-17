/**
 * Window-scoped timers, with a fallback for when there is no window.
 *
 * Obsidian asks plugins to schedule through `window.setTimeout` and
 * `window.setInterval` rather than the bare globals: a popout window is a
 * separate `Window`, and a timer scheduled on it should die with it instead of
 * firing into a closed document. Each function takes the window to schedule
 * on, the element's own (`el.win`, ADR-016), and defaults to the main one.
 * The modules that use this helper - the shell runner, the conversation
 * store, the protocol client, the usage service and the ticker - are also
 * bundled for `node --test`, where `window` does not exist, so the default
 * host is resolved once here instead of being branched on at every call site.
 */

/**
 * Whatever the host's `setTimeout` returned - a browser id or a Node `Timeout`.
 * It is only ever handed back to {@link clearTimer}, so nothing else needs to
 * know which.
 */
export type TimerHandle = ReturnType<typeof setTimeout> | number;

/** The subset of the timer API this module uses: a window's, or Node's.
 *  Declared with method syntax so both `window` and the Node globals satisfy it. */
export interface TimerHost {
	setTimeout(callback: () => void, ms: number): TimerHandle;
	clearTimeout(handle: TimerHandle): void;
	setInterval(callback: () => void, ms: number): TimerHandle;
	clearInterval(handle: TimerHandle): void;
}

const host: TimerHost =
	typeof window === "undefined"
		? { setTimeout, clearTimeout, setInterval, clearInterval }
		: window;

/** Schedule `callback` after `ms` milliseconds. */
export function setTimer(callback: () => void, ms: number, on: TimerHost = host): TimerHandle {
	return on.setTimeout(callback, ms);
}

/** Cancel a timer on the window it was set on. Ignores `undefined`, so callers need no guard. */
export function clearTimer(handle: TimerHandle | undefined, on: TimerHost = host): void {
	if (handle !== undefined) on.clearTimeout(handle);
}

/**
 * The promise's value, or `fallback` when it rejects or has not settled after
 * `ms`; a value that lands later is ignored.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
	return new Promise<T>((resolve) => {
		const timer = setTimer(() => resolve(fallback), ms);
		promise.then(
			(value) => {
				clearTimer(timer);
				resolve(value);
			},
			() => {
				clearTimer(timer);
				resolve(fallback);
			}
		);
	});
}

/** Call `callback` every `ms` milliseconds until {@link clearRepeatingTimer}. */
export function setRepeatingTimer(callback: () => void, ms: number, on: TimerHost = host): TimerHandle {
	return on.setInterval(callback, ms);
}

/** Stop a repeating timer on the window it was set on. Ignores `undefined`, like {@link clearTimer}. */
export function clearRepeatingTimer(handle: TimerHandle | undefined, on: TimerHost = host): void {
	if (handle !== undefined) on.clearInterval(handle);
}
