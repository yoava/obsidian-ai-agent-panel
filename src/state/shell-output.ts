/**
 * A `!` run's output as the card draws it (DES-003 Cards): the abbreviated
 * commit hash that opens a line, as in `git log --oneline`, set apart.
 */

export interface OutputPart {
	text: string;
	/** A commit hash. */
	hash: boolean;
}

/** 7 to 40 hex digits at a line's start, then a space or the line's end. */
const LEADING_HASH = /^([0-9a-f]{7,40})(?=\s|$)/;

/** A hash holds a digit and a letter, so a plain number or a word is not one. */
function isHash(token: string): boolean {
	return /[0-9]/.test(token) && /[a-f]/.test(token);
}

/** `text` split into runs, a line-leading hash alone in its own run; the runs joined give `text`. */
export function outputParts(text: string): OutputPart[] {
	const parts: OutputPart[] = [];
	let plain = "";
	for (const line of text.split(/(?<=\n)/)) {
		const match = LEADING_HASH.exec(line);
		if (!match || !isHash(match[1])) {
			plain += line;
			continue;
		}
		if (plain) parts.push({ text: plain, hash: false });
		parts.push({ text: match[1], hash: true });
		plain = line.slice(match[1].length);
	}
	if (plain) parts.push({ text: plain, hash: false });
	return parts;
}
