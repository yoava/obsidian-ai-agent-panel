/**
 * Style-rule parsing for the CSS tests: the rules of a stylesheet with their
 * at-rule context, a selector list split, and a complex selector split on its
 * combinators. Shared by styles.test.mjs and every test that reads rules, so
 * that importing one does not rerun another suite.
 */

/**
 * Style rules with the at-rule preludes around them, and at-rules that hold
 * declarations rather than rules (`@font-face`), with no selectors. Comments
 * and strings are blanked first; a `{` inside a style rule is nesting and
 * throws.
 */
export function parseRules(css) {
	const clean = css
		.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
		.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
	const rules = [];
	const stack = [];
	let buf = "";
	for (let i = 0; i < clean.length; i++) {
		const ch = clean[i];
		if (ch === "{") {
			const prelude = buf.trim();
			buf = "";
			if (prelude.startsWith("@")) {
				const end = clean.indexOf("}", i);
				const next = clean.indexOf("{", i + 1);
				if (end !== -1 && (next === -1 || next > end)) {
					rules.push({ prelude, selectors: [], body: clean.slice(i + 1, end), context: [...stack] });
					i = end;
				} else stack.push(prelude);
				continue;
			}
			const end = clean.indexOf("}", i);
			const body = clean.slice(i + 1, end);
			if (body.includes("{")) throw new Error(`nested rule in "${prelude}"`);
			rules.push({ prelude, selectors: splitList(prelude), body, context: [...stack] });
			i = end;
		} else if (ch === "}") {
			stack.pop();
			buf = "";
		} else if (ch === ";" && buf.trim().startsWith("@")) buf = "";
		else buf += ch;
	}
	return rules;
}

export function splitList(prelude) {
	const parts = [];
	let depth = 0;
	let current = "";
	for (const ch of prelude) {
		if (ch === "(") depth++;
		else if (ch === ")") depth--;
		if (ch === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
		} else current += ch;
	}
	parts.push(current.trim());
	return parts.filter(Boolean);
}

/**
 * One complex selector split on its top-level combinators: each compound with
 * what `:has()`, `:is()`, `:where()` and `:not()` hold blanked out (`flat`), and
 * the combinator before each compound after the first (" ", ">", "+" or "~").
 */
export function splitComplex(selector) {
	const compounds = [];
	const combinators = [];
	let depth = 0;
	let flat = "";
	let pending = null;
	for (const ch of selector.trim()) {
		if (depth === 0 && /[\s>+~]/.test(ch)) {
			if (flat) {
				compounds.push(flat);
				flat = "";
				pending = " ";
			}
			if (ch !== " " && !/\s/.test(ch)) pending = ch;
			continue;
		}
		if (pending !== null) {
			combinators.push(pending);
			pending = null;
		}
		if (ch === "(") depth++;
		else if (ch === ")") depth--;
		else if (depth === 0) flat += ch;
	}
	if (flat) compounds.push(flat);
	return { compounds, combinators };
}
