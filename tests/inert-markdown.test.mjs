import test from "node:test";
import assert from "node:assert/strict";

const {
	cutForRender,
	cutForExport,
	breakTemplateCommands,
	breakInlineFields,
	attributeValue,
	freshToken,
	fenceForExport,
	splitPlaceholders,
	plainText,
	opensInOs,
	isAllowedFence,
	loadsResource,
	FENCE_ALLOWLIST,
} = await import("./.build/inert-markdown.mjs");

const TOKEN = "tok";
const render = (markdown) => cutForRender(markdown, TOKEN);
const pieces = (cut) => cut.pieces.map((piece) => [piece.kind, piece.text]);

// Inline code ---------------------------------------------------------------

test("PRD-001.R17: inline code becomes a placeholder holding its text", () => {
	const cut = render("Run `= this.file.name` and `$= dv.pages()`.");
	assert.equal(cut.markdown, "Run tok0z and tok1z.");
	assert.deepEqual(pieces(cut), [
		["code", "= this.file.name"],
		["code", "$= dv.pages()"],
	]);
	assert.equal(cut.pieces[0].source, "`= this.file.name`");
});

test("PRD-001.R17: code spans follow CommonMark backtick runs and padding", () => {
	assert.deepEqual(pieces(render("Use `` a`b `` here")), [["code", "a`b"]]);
	assert.deepEqual(pieces(render("`` `x` ``")), [["code", "`x`"]]);
	assert.deepEqual(pieces(render("`a\nb`")), [["code", "a b"]]);
	// Backslashes are literal inside a span.
	assert.deepEqual(pieces(render("`a\\`b`")), [["code", "a\\"]]);
});

test("PRD-001.R17: backticks that open no span are escaped", () => {
	assert.equal(render("a ` b").markdown, "a \\` b");
	assert.equal(render("\\`x`").markdown, "\\`x\\`");
	assert.equal(render("``x`").markdown, "\\`\\`x\\`");
	// A blank line ends the paragraph, so the span cannot cross it.
	assert.equal(render("`a\n\nb`").markdown, "\\`a\n\nb\\`");
});

test("PRD-001.R17: tilde runs that could open a fence are escaped", () => {
	assert.equal(render("a ~~~ b").markdown, "a \\~~~ b");
	assert.equal(render("~~strike~~").markdown, "~~strike~~");
});

// Fences --------------------------------------------------------------------

test("PRD-001.R17: every fence is cut into its own block", () => {
	const cut = render("Before\n```dataviewjs\ndv.paragraph(1)\n```\nAfter");
	assert.equal(cut.markdown, "Before\n\ntok0z\n\nAfter");
	assert.deepEqual(cut.pieces[0], {
		kind: "fence",
		text: "dv.paragraph(1)",
		lang: "dataviewjs",
		source: "```dataviewjs\ndv.paragraph(1)\n```",
	});
	assert.deepEqual(pieces(render("~~~dataview\nLIST\n~~~")), [["fence", "LIST"]]);
	assert.deepEqual(pieces(render("```mermaid\ngraph TD\n```")), [["fence", "graph TD"]]);
	assert.deepEqual(pieces(render("```Run-Python\nx\n```")), [["fence", "x"]]);
	assert.equal(render("```python\nprint(1)\n```").markdown, "\ntok0z\n");
});

test("PRD-001.R17: an allowlisted fence carries a fence the module built", () => {
	const fence = (markdown) => render(markdown).pieces[0].markdown;
	assert.equal(fence("```python\nprint(`x`)\n```"), "```python\nprint(`x`)\n```");
	// Only the language survives from the info string.
	assert.equal(fence('```JS title="a"\nlet a\n```'), "```js\nlet a\n```");
	// The run outlasts every backtick run inside, so nothing closes it early.
	assert.equal(fence("````md\n```dataviewjs\nx\n```\n````"), "````md\n```dataviewjs\nx\n```\n````");
	assert.equal(fence("~~~js\n`````\n~~~"), "``````js\n`````\n``````");
	assert.equal(fence("```\nhello\n```"), "```\nhello\n```");
	assert.equal(fence("```js\n```"), "```js\n```");
	assert.equal(fence("```dataviewjs\nx\n```"), undefined);
	assert.equal(fence("```\nLIST\n```"), undefined);
});

test("PRD-001.R17: a fence whose text starts with = or $= stays inert code", () => {
	const fence = (markdown) => render(markdown).pieces[0].markdown;
	assert.equal(fence("```text\n$= dv.pages()\n```"), undefined);
	assert.equal(fence("```js\n\n  = this.file.name\n```"), undefined);
	assert.equal(fence("```\n= this.file.name\n```"), undefined);
	assert.equal(fence("```js\nlet a = 1\n```"), "```js\nlet a = 1\n```");
});

test("PRD-001.R17: CRLF line endings read as line endings", () => {
	const cut = render("a\r\n```dataviewjs\r\ndv.x()\r\n```\r\nb");
	assert.equal(cut.markdown, "a\n\ntok0z\n\nb");
	assert.deepEqual(pieces(cut), [["fence", "dv.x()"]]);
	assert.equal(render("```python\r\nx\r\n```").pieces[0].markdown, "```python\nx\n```");
});

test("PRD-001.R17: an unclosed fence runs to the end", () => {
	const cut = render("Text\n```dataviewjs\ndv.x()\nmore");
	assert.equal(cut.markdown, "Text\n\ntok0z\n");
	assert.deepEqual(pieces(cut), [["fence", "dv.x()\nmore"]]);
});

test("PRD-001.R17: a plain fence is allowed unless it reads as a query", () => {
	assert.equal(isAllowedFence("", "hello"), true);
	assert.equal(isAllowedFence("", "\nTABLE file.name"), false);
	assert.equal(isAllowedFence("", "= this.file.name"), false);
	assert.equal(isAllowedFence("", "$= dv.pages()"), false);
	assert.equal(isAllowedFence("Python", "x"), true);
	assert.equal(isAllowedFence("dataviewjs", "x"), false);
});

test("PRD-001.R17: fences in blockquotes and list items are cut with their container", () => {
	const quoted = render("> Look:\n> ```dataviewjs\n> dv.x()\n> ```\n> done");
	assert.equal(quoted.markdown, "> Look:\n>\n> tok0z\n>\n> done");
	assert.deepEqual(pieces(quoted), [["fence", "dv.x()"]]);

	const listed = render("- ```python\n  x = 1\n  ```\n- next");
	// No blank line inside a list item, so a tight list stays tight.
	assert.equal(listed.markdown, "- tok0z\n- next");
	assert.deepEqual(pieces(listed), [["fence", "x = 1"]]);

	const indented = render("1. Step\n   ```dataviewjs\n   dv.x()\n   ```");
	assert.equal(indented.markdown, "1. Step\n   tok0z");
	assert.deepEqual(pieces(indented), [["fence", "dv.x()"]]);
});

test("PRD-001.R17: only a fence the renderer certainly reads is rendered as one", () => {
	const fence = (markdown) => render(markdown).pieces[0].markdown;
	assert.equal(fence("1. Step\n   ```bash\n   ls\n   ```"), "```bash\nls\n```");
	assert.equal(fence("> ```python\n> x\n> ```"), "```python\nx\n```");
	// Paragraph text to the renderer: four spaces in, or after a list marker
	// that cannot interrupt a paragraph. Plain code instead.
	assert.equal(fence("paragraph\n    ```python\n    print(1)\n    ```"), undefined);
	assert.equal(fence("paragraph\n2. ```python\n   print(1)\n   ```"), undefined);
	assert.equal(fence("- ```python\n  x\n  ```"), undefined);
});

test("PRD-001.R17: a fence whose container ends first is cut where the container ends", () => {
	const escaped = render("> ```python\n> x\n```dataviewjs\ny\n```");
	assert.deepEqual(pieces(escaped), [
		["fence", "x"],
		["fence", "y"],
	]);
	const inline = render("> ```python\n> x\n`$= dv.current()`");
	assert.deepEqual(pieces(inline), [
		["fence", "x"],
		["code", "$= dv.current()"],
	]);
});

/** Backticks and tilde fences the renderer could read as code. */
const RAW_CODE = /(?<!\\)`|^(?:[\s>]|[-*+]\s|\d+[.)]\s)*~~~/m;

test("PRD-001.R17: blocks the cut does not model pass no code to the renderer", () => {
	for (const markdown of [
		// Math and comment blocks the renderer closes inside the fence.
		"$$\n```js\n$$\n`$= dv.x()`\n```",
		"%%\n```js\n%%\n`$= dv.x()`\n```",
		// Openers the renderer reads as paragraph text.
		"para\n    ```js\n`$= dv.x()`\n![a](https://e.test/a.png)",
		"- a\n  - b\n        ```js\n`$= dv.x()`",
		"text\n2. ~~~js\n`$= dv.x()`\n~~~",
	]) {
		const cut = render(markdown);
		assert.doesNotMatch(cut.markdown, RAW_CODE, markdown);
		assert.doesNotMatch(cut.markdown, /\]\(https/, markdown);
		assert.ok(cut.pieces.some((piece) => piece.text.includes("$= dv.x()")), markdown);
	}
});

test("PRD-001.R17: a line cannot start indented code with = or $=", () => {
	assert.equal(render("para\n\n    $= dv.pages()").markdown, "para\n\n    \\$= dv.pages()");
	assert.equal(render("    = this.file.name").markdown, "    \\= this.file.name");
	assert.equal(render("> -    = x").markdown, "> -    \\= x");
	assert.equal(render("= x and $= y").markdown, "\\= x and \\$= y");
	// Obsidian parses a callout title and a task item's text as blocks.
	assert.equal(render("> [!note]-     = x").markdown, "> [!note]-     \\= x");
	assert.equal(render("- [ ]     $= x").markdown, "- [ ]     \\$= x");
	assert.equal(render("[^1]: 1)       = x").markdown, "[^1]: 1)       \\= x");
	// A highlight or setext underline stays where it cannot be indented code.
	assert.equal(render("Title\n===").markdown, "Title\n===");
	assert.equal(render("==marked== text").markdown, "==marked== text");
	assert.equal(render("- ==marked==").markdown, "- ==marked==");
	assert.equal(render("    ==").markdown, "    \\==");
	assert.equal(render("1. \t===").markdown, "1. \t\\===");
	assert.equal(render("a = b").markdown, "a = b");
});

test("PRD-001.R17: round-2 review cases pass no code, image or HTML block", () => {
	// Any task-box character, any list-number length.
	assert.equal(render("- [/]     $= dv.x()").markdown, "- [/]     \\$= dv.x()");
	assert.equal(render("1234567890.     = x").markdown, "1234567890.     \\= x");
	assert.equal(render("- [?] <b>").markdown, "- [?] &lt;b>");
	// A `![[` that is no embed falls back to an image.
	for (const markdown of [
		"![[a]b](https://e.test/x.png)",
		"![[]](https://e.test/x.png)",
		"![[a\nb]](https://e.test/x.png)",
		"![[a]b][r]\n\n[r]: https://e.test/r.png",
	])
		assert.match(render(markdown).markdown, /^tok0z/, markdown);
	// A whitespace line holding a tab does not end the paragraph.
	assert.equal(render("![a\n\t\n](https://e.test/x.png)").markdown, "tok0z");
	assert.equal(render("![a\n\nb](x.png)").markdown, "\\![a\n\nb](x.png)");
});

// Math -----------------------------------------------------------------------

test("PRD-001.R17: math is cut whole, so its code and HTML stay TeX", () => {
	const cut = render("$`x`$ and $x<y$ and $$a<b$$");
	assert.equal(cut.markdown, "tok0z and tok1z and tok2z");
	assert.deepEqual(cut.pieces, [
		{ kind: "math", text: "`x`", display: false, source: "$`x`$" },
		{ kind: "math", text: "x<y", display: false, source: "$x<y$" },
		{ kind: "math", text: "a<b", display: true, source: "$$a<b$$" },
	]);
	const block = render("Energy:\n$$\nE=mc^2\n$$\nDone");
	assert.equal(block.markdown, "Energy:\n\ntok0z\n\nDone");
	assert.deepEqual(block.pieces, [
		{ kind: "math", text: "E=mc^2", display: true, source: "$$\nE=mc^2\n$$" },
	]);
});

test("PRD-001.R17: math that sets CSS or links is shown as code", () => {
	// MathJax's style filter lets `cursor: url(…)` through, which fetches.
	const inline = render("$\\style{cursor:url(https://e.test/c.png)}{x}$");
	assert.deepEqual(pieces(inline), [["code", "$\\style{cursor:url(https://e.test/c.png)}{x}$"]]);
	const block = render("$$\n\\bbox[cursor:url(https://e.test/c.png)]{x}\n$$");
	assert.equal(block.pieces[0].kind, "fence");
	assert.equal(block.pieces[0].markdown, undefined);
	assert.equal(render("$\\fcolorbox{red; cursor:url(https://e.test/c.png)}{blue}{x}$").pieces[0].kind, "code");
	assert.equal(render("$\\color{red}{x}$").pieces[0].kind, "math");
	// MathJax output is checked too: CSS that fetches is dropped.
	for (const css of ["cursor: url(https://e.test/c.png), auto", "cursor:URL( x )", "background: image-set(\"a.png\" 1x)"])
		assert.equal(loadsResource(css), true, css);
	for (const css of ["color: red", "background-color: blue", "font-family: urlish"]) assert.equal(loadsResource(css), false, css);
	// \displaystyle is not \style.
	assert.equal(render("$\\displaystyle x$").pieces[0].kind, "math");
});

test("PRD-001.R17: dollar signs that open no math are escaped", () => {
	assert.deepEqual(pieces(render("$5 and `x` and $10")), [["code", "x"]]);
	assert.equal(render("$5 and $10").markdown, "\\$5 and \\$10");
	// Inline math the renderer would read across a line is not left to it.
	assert.equal(render("$\\style{x}\n{y}$").markdown, "\\$\\style{x}\n{y}\\$");
	for (const markdown of ["\\$x$", "$ x$", "$x $", "$x$5", "a $x\ny$"])
		assert.equal(render(markdown).pieces.length, 0, markdown);
	assert.deepEqual(pieces(render("$a\\$b$")), [["math", "a\\$b"]]);
});

// Remote images -------------------------------------------------------------

test("PRD-001.R17: remote images become alt text and URL", () => {
	const cases = [
		["![chart](https://e.test/a.png)", "chart (https://e.test/a.png)"],
		["![](//e.test/a.png)", "//e.test/a.png"],
		['![a b](<https://e.test/a b.png> "t")', "a b (https://e.test/a b.png)"],
		["![a](&#104;ttps://e.test/x)", "a (&#104;ttps://e.test/x)"],
		["![a](https\\://e.test/x)", "a (https\\://e.test/x)"],
		["![a](data:image/png;base64,AAAA)", "a (data:image/png;base64,AAAA)"],
		["![[https://e.test/a.png]]", "https://e.test/a.png"],
		["![[//e.test/a.png|200]]", "//e.test/a.png"],
		// Percent escapes the renderer may decode into a scheme or a leading //.
		["![a](%2F%2Fe.test/a.png)", "a (%2F%2Fe.test/a.png)"],
		["![a](https%3A//e.test/x)", "a (https%3A//e.test/x)"],
		["![a](%68ttps%3a%2f%2fe.test/x)", "a (%68ttps%3a%2f%2fe.test/x)"],
		["![[https%3A//e.test/a.png]]", "https%3A//e.test/a.png"],
		["![a](a%zz.png)", "a (a%zz.png)"],
	];
	for (const [markdown, text] of cases) {
		const cut = render(markdown);
		assert.equal(cut.markdown, "tok0z", markdown);
		assert.deepEqual(pieces(cut), [["text", text]], markdown);
	}
});

test("PRD-001.R17: every reference-style image becomes text", () => {
	const defs = "\n\n[r]: https://e.test/a.png\n[Alt]: <//e.test/b.png>\n[v]: attachments/v.png";
	assert.deepEqual(pieces(render(`![a][r]${defs}`)), [["text", "a (https://e.test/a.png)"]]);
	assert.deepEqual(pieces(render(`![alt][]${defs}`)), [["text", "alt (//e.test/b.png)"]]);
	assert.deepEqual(pieces(render(`![r]${defs}`)), [["text", "r (https://e.test/a.png)"]]);
	// A vault definition too: the cut cannot see every definition the renderer sees.
	assert.deepEqual(pieces(render(`![p][v]${defs}`)), [["text", "p (attachments/v.png)"]]);
	// Labels match as CommonMark folds them: case, Unicode case and spacing.
	const folded = "![ẞ  x][]\n\n[ss x]: https://e.test/f.png";
	assert.deepEqual(pieces(render(folded)), [["text", "ẞ  x (https://e.test/f.png)"]]);
	// Whitespace collapses but does not vanish: `[ab]` is not `[a b]`.
	const distinct = "![ab]\n\n[a b]: https://wrong.example/a.png\n[ab]: attachments/right.png";
	assert.deepEqual(pieces(render(distinct)), [["text", "ab (attachments/right.png)"]]);
	// No definition found: the text the renderer would show.
	const missing = render("![a][missing]");
	assert.equal(missing.markdown, "tok0z");
	assert.deepEqual(pieces(missing), [["text", "![a][missing]"]]);
});

test("PRD-001.R17: reference images the round-1 review found are cut", () => {
	const cases = [
		// A label holding an unmatched backtick.
		["![a`b]\n\n[a`b]: https://e.test/x.png", "a`b (https://e.test/x.png)"],
		// A destination in angle brackets on the next line, or after a blank line.
		["![r]\n\n[r]:\n<https://e.test/x.png>", "r (https://e.test/x.png)"],
		["![r]\n\n[r]:\n\n<https://e.test/x.png>", "r (https://e.test/x.png)"],
		// An inline form that fails falls back to the shortcut reference.
		["![r](x\n\n[r]: https://e.test/x.png", "r (https://e.test/x.png)"],
	];
	for (const [markdown, text] of cases) {
		const cut = render(markdown);
		assert.match(cut.markdown, /^tok0z/, markdown);
		assert.deepEqual(pieces(cut)[0], ["text", text], markdown);
	}
});

test("PRD-001.R17: vault images and images inside code stay", () => {
	for (const markdown of ["![[photo.png]]", "![p](attachments/photo%20(1).png)", "![[Note#Heading|200]]"])
		assert.equal(render(markdown).markdown, markdown);
	assert.deepEqual(pieces(render("`![a](https://e.test/a.png)`")), [
		["code", "![a](https://e.test/a.png)"],
	]);
});

test("PRD-001.R17: an image stays only when its source is a plain vault path", () => {
	// A source a later step could rewrite into a URL is cut.
	const nested = render("![r](![[https://e.test/b.png]][r]:\n)");
	assert.match(nested.markdown, /^tok\d+z/);
	assert.ok(!nested.markdown.includes("!["));
	// Across a line, a block opening on the next line ends the paragraph first.
	const split = render("![r](\n1) b.png)\n\n[r]: https://e.test/r.png");
	assert.deepEqual(pieces(split)[0], ["text", "r (1)"]);
	for (const markdown of ["![a](a&amp;b.png)", "![a](a~~~b.png)", "![[a:b]]", "![[<https://e.test/a.png>]]"])
		assert.match(render(markdown).markdown, /^tok\d+z$/, markdown);
});

test("PRD-001.R17: a remote image inside a link becomes the link's text", () => {
	const cut = render("[![badge](https://e.test/b.svg)](https://e.test)");
	assert.equal(cut.markdown, "[tok0z](https://e.test)");
	assert.deepEqual(pieces(cut), [["text", "badge (https://e.test/b.svg)"]]);
});

test("PRD-001.R17: an unparsable inline image is cut as a reference", () => {
	const cut = render("![a](https://e.test/a.png");
	assert.equal(cut.markdown, "tok0z(https://e.test/a.png");
	assert.deepEqual(pieces(cut), [["text", "![a]"]]);
});

// Raw HTML ------------------------------------------------------------------

test("PRD-001.R17: HTML tags outside the inline allowlist render as text", () => {
	const escaped = [
		['<img src="https://e.test/a.png" alt="a">', '&lt;img src="https://e.test/a.png" alt="a">'],
		['<iframe src="//e.test"></iframe>', '&lt;iframe src="//e.test">&lt;/iframe>'],
		["<video src=https://e.test/v.mp4>", "&lt;video src=https://e.test/v.mp4>"],
		['<span style="background:url(https://e.test)">a</span>', '&lt;span style="background:url(https://e.test)">a&lt;/span>'],
		["<code>= this.file.name</code>", "&lt;code>= this.file.name&lt;/code>"],
		['<svg><image href="https://e.test"/></svg>', '&lt;svg>&lt;image href="https://e.test"/>&lt;/svg>'],
		['<b class="x">a</b>', '&lt;b class="x">a</b>'],
		["<!-- note -->", "&lt;!-- note -->"],
		["<details>\n<summary>x</summary>", "&lt;details>\n&lt;summary>x&lt;/summary>"],
	];
	for (const [markdown, out] of escaped) assert.equal(render(markdown).markdown, out, markdown);
});

test("PRD-001.R17: an allowed tag alone on its line is text, so no HTML block starts", () => {
	const cases = [
		["<b>\n<i>x</i>", "&lt;b>\n<i>x</i>"],
		["> <br/>\n> text", "> &lt;br/>\n> text"],
		["- [ ] </B>  ", "- [ ] &lt;/B>  "],
		["1. <kbd>", "1. &lt;kbd>"],
		["<b\n>", "&lt;b\n>"],
	];
	for (const [markdown, out] of cases) assert.equal(render(markdown).markdown, out, markdown);
	assert.equal(render("> [!tip]+ <b>").markdown, "> [!tip]+ &lt;b>");
	assert.equal(render("[^1]: - <b>").markdown, "[^1]: - &lt;b>");
	for (const markdown of ["a <b>", "<b>x</b>", "Press <kbd>Ctrl</kbd>"])
		assert.equal(render(markdown).markdown, markdown);
});

test("PRD-001.R17: an email autolink whose local part could carry attributes is text", () => {
	assert.equal(
		render("<code/class='language-dataview'/x@e.test>").markdown,
		"&lt;code/class='language-dataview'/x@e.test>"
	);
	assert.equal(render("<a=b@e.test>").markdown, "&lt;a=b@e.test>");
	assert.equal(render("<me.x+y@e.test>").markdown, "<me.x+y@e.test>");
	assert.equal(render("<https://e.test/x/onmouseover=y>").markdown, "&lt;https://e.test/x/onmouseover=y>");
});

test("PRD-001.R17: inline formatting tags, autolinks and comparisons stay", () => {
	for (const markdown of [
		"a<br>b <br/> <sub>2</sub> <kbd>Ctrl</kbd> <B>x</B>",
		"<https://e.test/a> and <me@e.test>",
		"a < b and 1<2",
	])
		assert.equal(render(markdown).markdown, markdown);
});

// Links ---------------------------------------------------------------------

test("PRD-001.R17: a vault image with a percent-encoded space stays an image", () => {
	assert.equal(render("![a](Pics/a%20b.png)").markdown, "![a](Pics/a%20b.png)");
	assert.equal(render("![[Pics/a%20b.png]]").markdown, "![[Pics/a%20b.png]]");
});

test("PRD-001.R17: spaces in link targets are percent-encoded outside code", () => {
	assert.equal(
		render('[Log](Projects/Progress Log.md "Title")').markdown,
		'[Log](Projects/Progress%20Log.md "Title")'
	);
	assert.equal(render("[x](https://a b)").markdown, "[x](https://a b)");
	// Angle brackets go, so the HTML escape cannot break the target.
	assert.equal(render("[x](<a b(1).md>)").markdown, "[x](a%20b%281%29.md)");
	const fenced = "```md\n[Log](a b.md)\n```";
	assert.equal(render(fenced).pieces[0].markdown, fenced);
});

test("PRD-001.R17: only http, https, mailto and obsidian links open in the OS", () => {
	for (const href of ["https://e.test", "HTTP://e.test", "mailto:a@e.test", "obsidian://open?vault=v"])
		assert.equal(opensInOs(href), true, href);
	for (const href of [
		"file:///etc/passwd",
		"FILE:///C:/x",
		"javascript:alert(1)",
		"data:text/html,x",
		"app://local/x",
		"notes/a.md",
		" https://e.test",
		"",
	])
		assert.equal(opensInOs(href), false, href);
});

// Placeholders --------------------------------------------------------------

test("PRD-001.R17: rendered text splits back into text and pieces", () => {
	const cut = render("a `x` b ![i](https://e.test/i.png)");
	const parts = splitPlaceholders("a tok0z b tok1z tok9z", cut);
	assert.deepEqual(parts, ["a ", cut.pieces[0], " b ", cut.pieces[1], " tok9z"]);
	assert.deepEqual(splitPlaceholders("plain", cut), ["plain"]);
});

test("PRD-001.R17: a nested placeholder in alt text comes back as source", () => {
	const cut = render("![a `b`](https://e.test/i.png)");
	assert.deepEqual(pieces(cut).at(-1), ["text", "a `b` (https://e.test/i.png)"]);
});

test("PRD-001.R17: no comment opens, since its closer starts a block mid-line", () => {
	assert.equal(render("%%\na\n%%    = x").markdown, "\\%%\na\n\\%%    = x");
	assert.equal(render("a %% b %%% c").markdown, "a \\%% b \\%\\%% c");
	assert.equal(render("\\%% x").markdown, "\\%% x");
});

test("PRD-001.R17: a definition cannot reach past its line", () => {
	// The renderer reads a label across blank lines and a destination from
	// the next non-blank line: either could swallow a fence the module built.
	assert.equal(render("[r]:\n```js\nx\n```").markdown, "\\[r]:\n\ntok0z\n");
	assert.equal(render("> [a\nb]: x").markdown, "> \\[a\nb]: x");
	assert.equal(render("[r\\]: x").markdown, "\\[r\\]: x");
	assert.equal(render("- [| a |\n\nb").markdown, "- \\[| a |\n\nb");
	// An angle destination or a title that does not close on the line.
	assert.equal(render("[a]: <\n\nx>").markdown, "\\[a]: <\n\nx>");
	assert.equal(render("[a]: u 't\n\nx'").markdown, "\\[a]: u 't\n\nx'");
	assert.equal(render("[a]: u \"t\"").markdown, "[a]: u \"t\"");
	// A link whose text wraps is no definition.
	assert.equal(render("[see\nhere](x.md)").markdown, "[see\nhere](x.md)");
	for (const markdown of ["[r]: url", "[[Note]] and more", "[Note](n.md) here", "- [ ] task", "> [!note] x"])
		assert.equal(render(markdown).markdown, markdown);
});

test("PRD-001.R17: placeholders in attribute text read as the text they stand for", () => {
	// A heading's data-heading and an image's alt are set from rendered text.
	const cut = render("# a `b` $c$ ![d](https://e.test/i.png)");
	assert.equal(cut.markdown, "# a tok0z tok1z tok2z");
	assert.equal(plainText("a tok0z tok1z tok2z tok9z", cut), "a b $c$ d (https://e.test/i.png) tok9z");
});

test("PRD-001.R17: the default token is random letters and digits", () => {
	const a = cutForRender("`x`");
	const b = cutForRender("`x`");
	assert.match(a.token, /^[a-z][a-z0-9]{11,}$/);
	assert.notEqual(a.token, b.token);
	assert.equal(a.markdown, `${a.token}0z`);
});

// Property: nothing executable or remote survives the cut --------------------

const FRAGMENTS = [
	"text ",
	"word",
	"`= this.file.name`",
	"``$= dv.pages() ``",
	"`",
	"``",
	"\\`",
	"~~~",
	"~~",
	"```dataviewjs\ndv.paragraph(1)\n```\n",
	"~~~dataview\nLIST\n~~~\n",
	"```python\nprint(1)\n```\n",
	"```text\n$= dv.x()\n```\n",
	"```\nTABLE x\n```\n",
	"> ```dataviewjs\n> x\n> ```\n",
	"- ```mermaid\n  graph\n  ```\n",
	"    ```js\n",
	"2. ~~~js\n",
	"$$\n",
	"$",
	"$`x`$",
	"%%",
	"    = x\n",
	"$= y",
	"![a](https://e.test/a.png)",
	"![[https://e.test/b.png]]",
	"![r]",
	"![r](",
	"\n\n[r]: https://e.test/r.png\n",
	"\n\n[r]:\n<https://e.test/r.png>\n",
	"<img src=https://e.test/c.png>",
	"<iframe src=//e.test>",
	"<br>",
	"<b>\n",
	"<x/y@e.test>",
	"- [/]     ",
	"1234567890.     ",
	"![[a]b](https://e.test/x.png)",
	"![a\n\t\n](https://e.test/x.png)",
	"\t\n",
	"[a]: <\n",
	">\n",
	"$\\style{cursor:url(https://e.test/c.png)}{x}$",
	"[l](a b.md)",
	"key:: value",
	"(k:: \\!\\[a\\](https://e.test/a.png))",
	"::",
	":",
	"\\:",
	"&#58;",
	"> quoted\n",
	"- item\n",
	"\n",
	"\n\n",
];

function seeded(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

function randomDoc(random) {
	let doc = "";
	const count = 1 + Math.floor(random() * 24);
	for (let i = 0; i < count; i++) doc += FRAGMENTS[Math.floor(random() * FRAGMENTS.length)];
	return doc;
}

/** Text the renderer reads as Markdown must hold none of these. */
function assertInert(text, context) {
	assert.doesNotMatch(text, RAW_CODE, `raw code: ${context}`);
	assert.doesNotMatch(text, /(?<!\\)!\[[^\]]*\]\((?:https?:)?\/\//, `remote image: ${context}`);
	assert.doesNotMatch(text, /!\[\[(?:https?:)?\/\//, `remote embed: ${context}`);
	assert.doesNotMatch(text, /(?<!\\)!\[r\](?!\()/, `reference image: ${context}`);
	assert.doesNotMatch(text, /<(?:img|iframe|x\/)/i, `raw tag: ${context}`);
	assert.doesNotMatch(text, /^[\s>]*<\/?[a-z]+\/?>\s*$/im, `HTML block: ${context}`);
	assert.doesNotMatch(text, /^(?:[^\S\n]|>|[-*+]\s|\d+[.)]\s|\[[^\n]\]\s)*(?:[^\S\n]{4}|\t)\$?=/m, `query start: ${context}`);
	assert.doesNotMatch(text, /^(?:[^\S\n]|>|[-*+]\s|\d+[.)]\s|\[[^\n]\]\s)*\$?=(?!=)/m, `query start: ${context}`);
	assert.doesNotMatch(text, /(?<!\\)\$/, `raw dollar: ${context}`);
	assert.doesNotMatch(text, /(?<!\\)%%/, `comment: ${context}`);
	assert.doesNotMatch(text, /^(?:[\s>]|[-*+]\s|\d+[.)]\s)*\[(?!\^)[^\]\n]*\]:[ \t]*(?:[a-z][a-z0-9+.-]*:|\/\/)/im, `remote definition: ${context}`);
	assert.doesNotMatch(text, /^(?:[^\S\n]|>|[-*+]\s|\d+[.)]\s)*\$\$[^$\n]*$/m, `math block: ${context}`);
	assert.doesNotMatch(decoded(text), /::/, `inline field: ${context}`);
	assert.doesNotMatch(attributeDecoded(text), /::/, `inline field in an attribute: ${context}`);
}

test("PRD-001.R17: property - no code, fence, remote image or tag survives the render cut", () => {
	const random = seeded(17);
	for (let round = 0; round < 3000; round++) {
		const doc = randomDoc(random);
		const cut = render(doc);
		const context = JSON.stringify(doc);
		assertInert(cut.markdown, context);
		for (const [, index] of cut.markdown.matchAll(/tok(\d+)z/g))
			assert.ok(cut.pieces[Number(index)], `unknown placeholder: ${context}`);
		for (const piece of cut.pieces) {
			assert.ok(doc.replace(/\r\n?/g, "\n").includes(piece.source), `source not from input: ${context}`);
			if (piece.kind !== "fence" || piece.markdown === undefined) continue;
			const run = /^`+/.exec(piece.markdown)[0];
			assert.ok(piece.markdown.endsWith(`\n${run}`), `fence not closed: ${context}`);
			assert.ok(!piece.text.includes(run), `fence closes early: ${context}`);
			assert.doesNotMatch(piece.text.trim(), /^\$?=/, `query fence: ${context}`);
		}
	}
});

/** Export output split into the fences the module built and the text around them. */
function exportedText(markdown) {
	const lines = markdown.split("\n");
	const text = [];
	for (let i = 0; i < lines.length; i++) {
		const open = /^(`{3,})(\S*)$/.exec(lines[i]);
		if (!open || (i > 0 && lines[i - 1] !== "")) {
			text.push(lines[i]);
			continue;
		}
		const [, run, lang] = open;
		const close = lines.indexOf(run, i + 1);
		assert.ok(close > i, `unclosed fence: ${JSON.stringify(markdown)}`);
		const body = lines.slice(i + 1, close).join("\n");
		// Built by the module: an allowed language or text, a run no line
		// inside can close, a body no query starts.
		assert.ok(lang === "" || lang === "text" || FENCE_ALLOWLIST.has(lang), `fence language ${lang}`);
		assert.ok(!body.includes(run), `fence closes early: ${JSON.stringify(markdown)}`);
		assert.doesNotMatch(body.trim(), /^\$?=/, "query fence");
		i = close;
	}
	return text.join("\n");
}

test("PRD-003.R13: property - export text outside built fences is inert", () => {
	const random = seeded(29);
	for (let round = 0; round < 3000; round++) {
		const doc = randomDoc(random);
		// As the exporter writes it: the note-wide colon break after the cut.
		const out = breakInlineFields(cutForExport(doc));
		const context = JSON.stringify(doc);
		const text = exportedText(out);
		assertInert(text, context);
		assert.doesNotMatch(decoded(out), /::/, `inline field in a fence: ${context}`);
	}
});

// Export ---------------------------------------------------------------------

test("PRD-003.R13: export writes inline code as escaped literal text", () => {
	assert.equal(cutForExport("Run `= this.file.name` now"), "Run \\`\\= this.file.name\\` now");
	assert.equal(
		cutForExport("`<img src=https://e.test> & [[x]]`"),
		"\\`&lt;img src\\=https\\://e.test&gt; &amp; \\[\\[x\\]\\]\\`"
	);
	assert.equal(cutForExport("`a\nb`"), "\\`a b\\`");
	assert.equal(cutForExport("a ` b ~~~"), "a \\` b \\~~~");
});

test("PRD-003.R13: export writes every fence as one the module built, unindented after a blank line", () => {
	assert.equal(cutForExport("```dataviewjs\ndv.x()\n```"), "```text\ndv.x()\n```");
	assert.equal(cutForExport("~~~~dataview title\nLIST\n~~~~"), "```text\nLIST\n```");
	assert.equal(cutForExport("```\nTABLE x\n```"), "```text\nTABLE x\n```");
	assert.equal(cutForExport("```\nhello\n```"), "```\nhello\n```");
	assert.equal(cutForExport('```Python title="a"\nx\n```'), "```python\nx\n```");
	assert.equal(cutForExport("Look:\n> ```dataview\n> LIST\n> ```"), "Look:\n\n```text\nLIST\n```");
	assert.equal(cutForExport("- a\n  ```bash\n  ls\n  ```\n- b"), "- a\n\n```bash\nls\n```\n- b");
	// A list marker on the opener line stays above the block.
	assert.equal(cutForExport("paragraph\n2. ```python\n   x\n   ```"), "paragraph\n2.\n\n```python\nx\n```");
	assert.equal(
		cutForExport("> ```python\n> x\n```dataviewjs\ny\n```"),
		"```python\nx\n```\n\n```text\ny\n```"
	);
	assert.equal(cutForExport("````md\n```dataviewjs\nx\n```\n````"), "````md\n```dataviewjs\nx\n```\n````");
});

test("PRD-003.R13: export breaks a fence's leading = or $= with a backslash", () => {
	assert.equal(cutForExport("```text\n$= dv.x()\n```"), "```text\n\\$= dv.x()\n```");
	assert.equal(cutForExport("```js\n\n  = x\n```"), "```js\n\n  \\= x\n```");
	assert.equal(cutForExport("para\n\n    = this.file.name"), "para\n\n    \\= this.file.name");
});

test("PRD-003.R13: export escapes the math and comment openers that could swallow a fence", () => {
	assert.equal(
		cutForExport("%%\n```js\n%%\n`$= dv.x()`\n```"),
		"\\%%\n\n```js\n%%\n`$= dv.x()`\n```"
	);
	assert.equal(cutForExport("a %% b %%% c"), "a \\%% b \\%\\%% c");
	// A line the cut does not read as block math still cannot open one.
	assert.equal(cutForExport("\t$$ x"), "\t\\$\\$ x");
});

test("PRD-003.R13: export writes math the renderer cannot misread", () => {
	// Block math is written as its TeX in a `text` fence.
	assert.equal(cutForExport("Energy:\n$$\nE=mc^2\n$$"), "Energy:\n\n```text\n$$\nE=mc^2\n$$\n```");
	assert.equal(cutForExport("$$$\na $$ b\n$$$"), "```text\n$$$\na $$ b\n$$$\n```");
	// Inline math shows as its TeX: a `$` written as-is could pair differently.
	assert.equal(cutForExport("so $\\alpha_1 + 2$ holds"), "so \\$\\\\alpha\\_1 + 2\\$ holds");
	assert.equal(cutForExport("so $x<y$ holds"), "so \\$x&lt;y\\$ holds");
	assert.equal(cutForExport("$`x`$"), "\\$\\`x\\`\\$");
	assert.equal(cutForExport("$\\href{https://e.test}{x}$"), "\\`\\$\\\\href{https\\://e.test}{x}\\$\\`");
	assert.equal(cutForExport("$$\n\\style{a}{x}\n$$"), "```text\n$$\n\\style{a}{x}\n$$\n```");
});

test("PRD-003.R13: export writes remote images and HTML tags as text", () => {
	assert.equal(cutForExport("![chart](https://e.test/a.png)"), "chart \\(https\\://e.test/a.png\\)");
	assert.equal(cutForExport("![](//e.test/a.png)"), "//e.test/a.png");
	assert.equal(cutForExport("![[https://e.test/a.png]]"), "https\\://e.test/a.png");
	assert.equal(cutForExport('<img src="https://e.test/a.png">'), '&lt;img src="https://e.test/a.png">');
	assert.equal(
		cutForExport("![r]\n\n[r]: https://e.test/x.png"),
		"r \\(https\\://e.test/x.png\\)\n\n\\[r]: https://e.test/x.png"
	);
	assert.equal(cutForExport("<b>\n<img src=x>"), "&lt;b>\n&lt;img src=x>");
	assert.equal(cutForExport("[r]:\n$$\n`x`\n$$"), "\\[r]:\n\n```text\n$$\n`x`\n$$\n```");
	assert.equal(
		cutForExport("[a]: <\n\n```js\n>\n`$= dv.x()`\n```"),
		"\\[a]: <\n\n```js\n>\n`$= dv.x()`\n```"
	);
});

test("PRD-003.R13: export keeps allowlisted fences, vault embeds and plain text", () => {
	const markdown =
		"# Title\n\nSee [[Note]] and ![[photo.png]].\n\n```python\nprint(`x`)\n```\n\n[Log](a b.md)";
	assert.equal(cutForExport(markdown), markdown);
});

// Templater -----------------------------------------------------------------

const JOINER = "\u2060";

/** Text decoded twice: covers what an image's alt or a link's title ends up as (unescaped, then decoded), and more. */
function attributeDecoded(text) {
	return decoded(decoded(text).replace(/\\/g, "\\\\"));
}

/** Text as the renderer shows it outside code: backslash escapes and entities decoded in one pass. */
function decoded(text) {
	const named = { lt: "<", LT: "<", amp: "&", AMP: "&", "percnt;": "%", "colon;": ":", "num;": "#", "semi;": ";" };
	return text.replace(
		/\\([!-/:-@[-`{-~])|&(lt|LT|amp|AMP);?|&(percnt;|colon;|num;|semi;)|&#[xX]([0-9a-fA-F]+);?|&#([0-9]+);?/g,
		(_, escape, legacy, name, hex, dec) => {
			if (escape !== undefined) return escape;
			if (legacy ?? name) return named[legacy ?? name];
			const code = hex ? parseInt(hex, 16) : Number(dec);
			return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
		}
	);
}

test("PRD-003.R13: no Templater command opens in an exported note", () => {
	assert.equal(breakTemplateCommands("<%* tR += 'x' %>"), `<${JOINER}%* tR += 'x' %>`);
	assert.equal(
		breakTemplateCommands("```\n<%+ tp.file.title %>\n```\n<%- x -%>"),
		`\`\`\`\n<${JOINER}%+ tp.file.title %>\n\`\`\`\n<${JOINER}%- x -%>`
	);
	// Escapes and entities the renderer decodes; `&lt` and numeric ones need no `;`.
	for (const [lt, percent] of [
		["\\<", "%"],
		["<", "\\%"],
		["&lt;", "%"],
		["&lt", "%"],
		["&LT;", "&#37;"],
		["&#60;", "&percnt;"],
		["&#060", "%"],
		["&#x3C;", "&#x25"],
		["&#X3c", "\\%"],
		// An escaped entity counts too: a joiner costs nothing.
		["<", "\\&#37;"],
		["<", "\\&percnt;"],
		["&lt;", "\\&#x25"],
	])
		assert.equal(breakTemplateCommands(`a ${lt}${percent}* x %>`), `a ${lt}${JOINER}${percent}* x %>`, lt + percent);
	assert.equal(breakTemplateCommands("<<%%"), `<<${JOINER}%%`);
	for (const text of ["a < b % c", "100% <b>x</b> %>", "&#600;%", "&#x3c0;%", "&ltimes;%", "&amp;lt;%", "<&#370;", "<&#x250;"])
		assert.equal(breakTemplateCommands(text), text, text);
});

test("PRD-003.R13: property - no `<%` survives, raw or decoded", () => {
	const atoms = ["<", "\\<", "&lt;", "&lt", "&LT", "&#60;", "&#060", "&#x3C;", "&#x3c", "%", "\\%", "&percnt;", "&#37;", "&#x25", "\\&#37;", "\\&percnt;", "\\&lt;"];
	const others = ["\\", "\\\\", "&", "&amp;", "x", " ", "\n", "`", ">", "%>", "<b>"];
	const pool = [...atoms, ...others];
	const random = seeded(41);
	for (let round = 0; round < 3000; round++) {
		let text = "";
		const count = 1 + Math.floor(random() * 12);
		for (let i = 0; i < count; i++) text += pool[Math.floor(random() * pool.length)];
		const out = breakTemplateCommands(text);
		const context = JSON.stringify(text);
		assert.equal(out.replaceAll(JOINER, ""), text, `changed more than joiners: ${context}`);
		assert.doesNotMatch(out, /<%/, `raw: ${context}`);
		assert.doesNotMatch(decoded(out), /<%/, `decoded: ${context}`);
	}
});

// Dataview inline fields ----------------------------------------------------

test("PRD-001.R17: two colons never meet in rendered text, so Dataview reads no inline field", () => {
	// One placeholder per spelling, so equal labels stay equal.
	const cut = render("a (k:: v) [k:: v] key:: value");
	assert.equal(cut.markdown, "a (k:tok0z v) [k:tok0z v] key:tok0z value");
	assert.deepEqual(cut.pieces, [{ kind: "colon", text: ":", source: ":" }]);
	assert.equal(render(":::").markdown, ":tok0ztok0z");
	// Escapes and entities the renderer decodes; numeric ones need no `;`.
	const forms = render("a\\:\\: b &#58;&#x3A c &colon;: d \\:: e &#058:");
	assert.equal(forms.markdown, "a\\:tok0z b &#58;tok1z c &colon;tok2z d \\:tok2z e &#058tok2z");
	assert.deepEqual(
		forms.pieces.map((piece) => piece.source),
		["\\:", "&#x3A", ":"]
	);
	// An image's alt and a link's title unescape, then decode: `\&colon;` is a colon there.
	assert.equal(
		render("(k![x:\\&colon; \\!\\[a\\]\\(https://e.test/a.png\\)](x.png))").markdown,
		"(k![x:tok0z \\!\\[a\\]\\(https://e.test/a.png\\)](x.png))"
	);
	assert.equal(render('(k[x](y.md "x:\\&colon; t"))').markdown, '(k[x](y.md "x:tok0z t"))');
	// Twice-encoded too: the attribute decode comes after the Markdown decode.
	const twice = render("![x:&amp;colon; :&amp;\\#58; :&amp;&num;58&semi;](x.png)");
	assert.equal(twice.markdown, "![x:tok0z :tok1z :tok2z](x.png)");
	assert.deepEqual(twice.pieces, [
		{ kind: "colon", text: "&colon;", source: "&amp;colon;" },
		{ kind: "colon", text: "&#58;", source: "&amp;\\#58;" },
		{ kind: "colon", text: "&#58;", source: "&amp;&num;58&semi;" },
	]);
	assert.equal(render("&amp;:").markdown, "&amp;:");
	// Text the cut leaves inert that Dataview would render again as Markdown.
	assert.equal(
		render("(k:: \\!\\[x\\]\\(https://e.test/x.png\\))").markdown,
		"(k:tok0z \\!\\[x\\]\\(https://e.test/x.png\\))"
	);
	for (const markdown of ["a: :b", "a:\n:b", ":&#580;", ":&#x3a0;", "<https://e.test/a>"])
		assert.equal(render(markdown).markdown, markdown, markdown);
});

test("PRD-001.R17: labels and link targets holding `::` still work", () => {
	// A reference link and a footnote keep matching their definitions.
	assert.equal(render("[x][a::b]\n\n[a::b]: Note").markdown, "[x][a:tok0zb]\n\n[a:tok0zb]: Note");
	assert.equal(render("x[^a::b]\n\n[^a::b]: note").markdown, "x[^a:tok0zb]\n\n[^a:tok0zb]: note");
	// Attributes get the colon back after rendering; other placeholders only in text attributes.
	const cut = render("[v](https://[fe80::1]/) ![a](https://e.test/a.png)");
	assert.equal(cut.markdown, "[v](https://[fe80:tok1z1]/) tok0z");
	assert.equal(attributeValue("href", "https://[fe80:tok1z1]/", cut), "https://[fe80::1]/");
	assert.equal(attributeValue("href", "x/tok0z", cut), "x/tok0z");
	assert.equal(attributeValue("alt", "a:tok1zb tok0z", cut), "a::b a (https://e.test/a.png)");
});

test("PRD-001.R17: a placeholder token never occurs in its input", () => {
	const tokens = ["iabc", "iabc", "idef"];
	assert.equal(freshToken("x iabc y", () => tokens.shift()), "idef");
	// Nor once its entities are decoded, in text or, decoded again, in an attribute.
	for (const input of ["x &#105;abc y", "x &#x69;abc", "x &amp;#105;abc", "x \\&#105;abc"]) {
		const next = ["iabc", "idef"];
		assert.equal(freshToken(input, () => next.shift()), "idef", input);
	}
	const cut = cutForRender("`x` and some text");
	assert.ok(!"`x` and some text".includes(cut.token));
});

test("PRD-001.R17: code, math and fences keep their colons", () => {
	assert.deepEqual(pieces(render("`std::vector` and $a::b$")), [
		["code", "std::vector"],
		["math", "a::b"],
	]);
	assert.equal(render("```cpp\nstd::vector<int> v;\n```").pieces[0].markdown, "```cpp\nstd::vector<int> v;\n```");
	assert.deepEqual(pieces(render("```dataview\nk:: v\n```")), [["fence", "k:: v"]]);
	// Ordinary text shows as written once the placeholders are back.
	const cut = render("# std::vector fe80::1 :smile::wink: ![c::d](https://e.test/i.png)");
	assert.equal(plainText(cut.markdown.slice(2), cut), "std::vector fe80::1 :smile::wink: c::d (https://e.test/i.png)");
});

test("PRD-001.R17: property - no two colons meet, in text or an attribute, rendered or exported", () => {
	const colons = [":", "\\:", "&colon;", "&#58;", "&#x3a", "\\&colon;", "&amp;colon;", "&amp;\\#58;", "&#38;#x3a;", "&amp;&num;58&semi;"];
	const around = ["![x ", "](x.png)", '[l](y.md "', '")', "(k", "[k", " ", "\n", "word", "`", "$", "\\", "&", "&amp;", "&#580;"];
	const pool = [...colons, ...colons, ...around];
	const random = seeded(61);
	for (let round = 0; round < 3000; round++) {
		let doc = "";
		const count = 1 + Math.floor(random() * 12);
		for (let i = 0; i < count; i++) doc += pool[Math.floor(random() * pool.length)];
		const context = JSON.stringify(doc);
		const rendered = render(doc).markdown;
		const exported = breakInlineFields(cutForExport(doc));
		for (const [form, text] of [["render", rendered], ["export", exported]]) {
			assert.doesNotMatch(decoded(text), /::/, `${form}, text: ${context}`);
			assert.doesNotMatch(attributeDecoded(text), /::/, `${form}, attribute: ${context}`);
		}
	}
});

test("PRD-003.R13: no two colons meet in an exported note, fences included", () => {
	assert.equal(breakInlineFields("key:: value"), `key:${JOINER}: value`);
	assert.equal(breakInlineFields("(k:: v) :::"), `(k:${JOINER}: v) :${JOINER}:${JOINER}:`);
	assert.equal(breakInlineFields("a &#58;&#x3a; b \\:: c x:\\&colon;"), `a &#58;${JOINER}&#x3a; b \\:${JOINER}: c x:${JOINER}\\&colon;`);
	assert.equal(breakInlineFields("x:&amp;\\#58; y:&#38;colon;"), `x:${JOINER}&amp;\\#58; y:${JOINER}&#38;colon;`);
	// A comment vanishes from the rendered note, so the colons around it meet; Dataview's index still reads inside it.
	assert.equal(breakInlineFields("a:%%x%%:b"), `a:%%x%%${JOINER}:b`);
	assert.equal(breakInlineFields("%%a::b%%"), `%%a:${JOINER}:b%%`);
	assert.equal(breakInlineFields("a:\\%%x\\%%:b"), "a:\\%%x\\%%:b");
	// Only a colon before a comment makes the one after it a second colon.
	for (const text of ["%%:", "x %%a%%:b", "%%a%% :b"]) assert.equal(breakInlineFields(text), text, text);
	// Code an export writes as escaped text, and fences, which Dataview's index reads.
	const note = (markdown) => breakInlineFields(cutForExport(markdown));
	assert.equal(note("`a::b`"), `\\\`a\\:${JOINER}\\:b\\\``);
	assert.equal(note("```cpp\nstd::vector\n```"), `\`\`\`cpp\nstd:${JOINER}:vector\n\`\`\``);
	assert.equal(note("$$\nk:: v\n$$"), `\`\`\`text\n$$\nk:${JOINER}: v\n$$\n\`\`\``);
	for (const markdown of ["a: :b", "see https://e.test", "&#580;:"]) assert.equal(breakInlineFields(markdown), markdown, markdown);
});

test("PRD-003.R13: the note-wide colon break stays fast on a large note", () => {
	const lines = [
		'> {"name": "a", "url": "https://e.test/x?y=1&z=2", "time": "12:30:45", "ns": "std::vector"}\n',
		"Some prose with a colon: here, an entity &amp; and 100% done. `code: x`\n",
		"> 2026-10-11T05:07:00Z INFO server::handler: request &lt;ok&gt; %d %s\n",
		"plain words without anything special in them at all for a while longer\n",
	];
	let note = "";
	while (note.length < 2.1e6) note += lines[note.length % lines.length];
	breakInlineFields(note);
	const start = performance.now();
	const out = breakInlineFields(note);
	// Generous: about 20 ms where the per-character scan took 400.
	assert.ok(performance.now() - start < 250, `${(performance.now() - start).toFixed(0)} ms`);
	assert.doesNotMatch(out, /::/);
});

// Tool and shell output -----------------------------------------------------

test("PRD-003.R13: tool and shell output export as a fence the module built, a leading = or $= broken", () => {
	assert.equal(fenceForExport("ok"), "```\nok\n```");
	// Dataview runs any `pre > code` whose trimmed text starts with `=` or `$=`.
	assert.equal(fenceForExport("$= dv.span(1)"), "```text\n\\$= dv.span(1)\n```");
	assert.equal(fenceForExport("\n  = this.file.name\nmore"), "```text\n\n  \\= this.file.name\nmore\n```");
	assert.equal(fenceForExport("TABLE file.name"), "```text\nTABLE file.name\n```");
	assert.equal(fenceForExport("a = b"), "```\na = b\n```");
	// The run outlasts every run inside, so no output line closes it.
	assert.equal(fenceForExport("a\n````\nb"), "`````\na\n````\nb\n`````");
	// A lone carriage return ends a line for the renderer, so it is one here: the caller quotes line by line.
	assert.equal(fenceForExport("a\rb\r\nc"), "```\na\nb\nc\n```");
});

test("PRD-003.R13: property - tool and shell output is one built fence", () => {
	const random = seeded(53);
	for (let round = 0; round < 3000; round++) {
		// Some line breaks as lone carriage returns, as command output can hold.
		const doc = randomDoc(random).replace(/\n/g, () => (random() < 0.3 ? "\r" : "\n"));
		const out = fenceForExport(doc);
		assert.equal(exportedText(out), "", `text outside the fence: ${JSON.stringify(doc)}`);
		assert.ok(!out.includes("\r"), `carriage return: ${JSON.stringify(doc)}`);
		assert.ok(out.startsWith("```"), JSON.stringify(doc));
	}
});

// Reference images through emphasis ------------------------------------------

test("PRD-001.R17: a definition whose destination is not a vault path is text, so no reference image loads", () => {
	// Emphasis or a highlight closing inside a kept image splits it, and the renderer reads `![r]`.
	for (const image of ["*![r](x*)", "**![r](x**)", "_![r](x_)", "==![r](x==)", '*![r](x "t*")']) {
		const markdown = `${image}\n\n[r]: https://e.test/r.png`;
		assert.match(render(markdown).markdown, /\n\\\[r\]: https:\/\/e\.test\/r\.png$/, markdown);
		assert.match(cutForExport(markdown), /\n\\\[r\]: https\\?:\/\/e\.test\/r\.png$/, markdown);
	}
	for (const markdown of ["> [r]: //e.test/r.png", "- [r]: &#104;ttps://e.test", "[r]: data:image/png;base64,AA"])
		assert.match(render(markdown).markdown, /\\\[r\]:/, markdown);
	// A vault path and a footnote stay.
	for (const markdown of ["[r]: attachments/r.png", "[r]: Note%20one.md \"t\"", "[^1]: https://e.test/a"])
		assert.equal(render(markdown).markdown, markdown, markdown);
});

test("PRD-001.R17: only a line the renderer reads as a definition is escaped for its destination", () => {
	const u = "https://e.test/r.png";
	// Read as definitions (Obsidian 1.12.7 and 1.14.4): escaped.
	for (const [markdown, out] of [
		[`- [x] [r]: ${u}`, `- [x] \\[r]: ${u}`],
		[`> [!note] [r]: ${u}`, `> [!note] \\[r]: ${u}`],
		[`>    [r]: ${u}`, `>    \\[r]: ${u}`],
		[`-    [r]: ${u}`, `-    \\[r]: ${u}`],
		[`   [r]: ${u}`, `   \\[r]: ${u}`],
		// A continued list item or footnote holds definitions indented four or more.
		[`- a\n\n    [r]: ${u}`, `- a\n\n    \\[r]: ${u}`],
		[`[^1]: a\n\n\t[r]: ${u}`, `[^1]: a\n\n\t\\[r]: ${u}`],
	])
		assert.equal(render(markdown).markdown, out, markdown);
	// Not definitions: indented code, a task box or callout marker out of place. Left as written.
	for (const markdown of [`    [r]: ${u}`, `\t[r]: ${u}`, `>     [r]: ${u}`, `-     [r]: ${u}`, `[x] [r]: ${u}`, `[!note] [r]: ${u}`])
		assert.equal(render(markdown).markdown, markdown, markdown);
});
