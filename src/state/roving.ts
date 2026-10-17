/**
 * Where an arrow, Home or End moves focus among the items of a radio group
 * or a tab list (DES-003 Keyboard and accessibility), wrapping at the ends.
 */

const ROVING_KEYS = new Map<string, (at: number, last: number) => number>([
	["ArrowDown", (at, last) => (at === last ? 0 : at + 1)],
	["ArrowRight", (at, last) => (at === last ? 0 : at + 1)],
	["ArrowUp", (at, last) => (at === 0 ? last : at - 1)],
	["ArrowLeft", (at, last) => (at === 0 ? last : at - 1)],
	["Home", () => 0],
	["End", (_at, last) => last],
]);

/** Right-to-left (Obsidian's `mod-rtl`): Left moves forward and Right back. */
const RTL_KEYS = new Map([["ArrowLeft", "ArrowRight"], ["ArrowRight", "ArrowLeft"]]);

/** The item a key moves to from item `at` of `last + 1`; null for a key that moves nothing. */
export function rovingIndex(key: string, rtl: boolean, at: number, last: number): number | null {
	const move = ROVING_KEYS.get(rtl ? (RTL_KEYS.get(key) ?? key) : key);
	return move && last >= 0 ? move(at, last) : null;
}
