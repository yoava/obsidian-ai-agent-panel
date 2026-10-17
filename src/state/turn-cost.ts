/**
 * A turn's cost and tokens (PRD-005.R7; DES-007 Cost and tokens): the cost
 * from the recorded session totals, the footer's figures, and the token
 * rows of its hover card.
 */

import { formatTokens, type CostRecord } from "../commands";
import { forkTarget, type ForkBase } from "./fork-base";
import { formatSeconds } from "./turn";

/**
 * Each message's turn cost, null for anything but a turn record with a
 * numeric `costUsd`: its `total_cost_usd` minus the previous record's of the
 * same session, the session's first turn costing its whole total. Records
 * without a session id (0.5.0 and earlier) are one session, which the first
 * later session continues when it opens at or above their latest total, as
 * `conversationCost` counts them, so the turns add up to it. A total lower
 * than the turn before (a killed process's spend the CLI lost) costs 0. A
 * branch's fork session starts from its `forkBase`, which its first turn
 * leaves out (PRD-005.R7).
 */
export function turnCosts(messages: readonly CostRecord[], forkBase?: ForkBase): (number | null)[] {
	const target = forkTarget(messages, forkBase);
	const latest = new Map<string, number>();
	let legacy: number | null = null;
	let legacyDecided = false;
	return messages.map((message) => {
		if (message.kind !== "meta") return null;
		const cost = message.costUsd;
		if (typeof cost !== "number" || !Number.isFinite(cost)) return null;
		const id = typeof message.sessionId === "string" ? message.sessionId : "";
		let before = 0;
		if (id === "") {
			before = legacy ?? 0;
			legacy = cost;
		} else {
			const previous = latest.get(id);
			if (previous !== undefined) before = previous;
			else if (forkBase && id === target) before = forkBase.costUsd;
			else if (!legacyDecided && legacy !== null) {
				legacyDecided = true;
				if (cost >= legacy) before = legacy;
			}
			latest.set(id, cost);
		}
		return Math.max(0, cost - before);
	});
}

/** What the footer's figures read of a turn. */
export interface TurnFigures {
	durationMs: number | null;
	costUsd: number | null;
	error: string | null;
}

const costFourDecimals = (usd: number): string => `$${usd.toFixed(4)}`;

/** The cost to three decimals, "<$0.001" for a cost above zero and below $0.001: "$0.021", "$1.500". */
function costThreeDecimals(usd: number): string {
	const text = `$${usd.toFixed(3)}`;
	return usd > 0 && usd < 0.001 ? "<$0.001" : text;
}

function joinFigures(figures: TurnFigures, cost: (usd: number) => string): string {
	if (figures.error !== null) return `Error: ${figures.error}`;
	const parts: string[] = [];
	if (figures.durationMs !== null) parts.push(formatSeconds(figures.durationMs));
	if (figures.costUsd !== null) parts.push(cost(figures.costUsd));
	return parts.join(" · ");
}

/** The exported note's figures: "12.4s · $0.0210", or `Error: <message>` for a turn that failed (PRD-003.R13). */
export function figuresText(figures: TurnFigures): string {
	return joinFigures(figures, costFourDecimals);
}

/** The footer's right side: "12.4s · $0.021", or `Error: <message>` for a turn that failed (PRD-001.R15). */
export function footerFiguresText(figures: TurnFigures): string {
	return joinFigures(figures, costThreeDecimals);
}

/** A turn's tokens from its `result`, kept in memory only (DES-003 Data and security). */
export interface TurnTokens {
	input: number;
	output: number;
	cacheWrite: number;
	cacheRead: number;
}

function count(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The tokens a `result`'s `usage` reports, a malformed count as zero; null without a `usage`. */
export function turnTokens(usage: Record<string, unknown> | undefined): TurnTokens | null {
	if (!usage) return null;
	return {
		input: count(usage.input_tokens),
		output: count(usage.output_tokens),
		cacheWrite: count(usage.cache_creation_input_tokens),
		cacheRead: count(usage.cache_read_input_tokens),
	};
}

/** The duration and cost's hover card (PRD-005.R7): a row per kind of token, then the note. */
export function tokenRows(tokens: TurnTokens): { rows: Array<[string, string]>; note: string } {
	return {
		rows: [
			["Input", formatTokens(tokens.input)],
			["Cache read", formatTokens(tokens.cacheRead)],
			["Cache write", formatTokens(tokens.cacheWrite)],
			["Output", formatTokens(tokens.output)],
		],
		note: "At API prices; plans count usage instead",
	};
}
