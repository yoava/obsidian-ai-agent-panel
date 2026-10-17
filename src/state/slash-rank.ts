/**
 * The order of the slash list (DES-003 Suggests, PRD-001.R19): the commands
 * matching the typed name, the group holding the exact match first, and within
 * a group the exact match, then names it prefixes, then the best fuzzy score.
 */

interface Ranked {
	name: string;
	group: "panel" | "cli";
}

/** Fuzzy match of one name: a score (higher is better), or null for no match. */
export type FuzzyScorer = (name: string) => { score: number } | null;

export function rankSlash<T extends Ranked>(entries: readonly T[], query: string, fuzzy: FuzzyScorer): T[] {
	if (!query) return [...entries];
	const typed = query.toLowerCase();
	const tier = (cmd: T): number => {
		const name = cmd.name.toLowerCase();
		return name === typed ? 0 : name.startsWith(typed) ? 1 : 2;
	};
	const scored: Array<{ cmd: T; score: number; tier: number }> = [];
	for (const cmd of entries) {
		const match = fuzzy(cmd.name);
		if (match) scored.push({ cmd, score: match.score, tier: tier(cmd) });
	}
	const exactGroup = scored.find((s) => s.tier === 0)?.cmd.group;
	const groupRank = (cmd: T): number => (cmd.group === exactGroup ? 0 : cmd.group === "panel" ? 1 : 2);
	scored.sort((a, b) => groupRank(a.cmd) - groupRank(b.cmd) || a.tier - b.tier || b.score - a.score);
	return scored.map((s) => s.cmd);
}
