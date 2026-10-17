# ADR-010 — Render model output with Obsidian's MarkdownRenderer

**Status:** accepted (2026-10-11)

## Context

- Replies are Markdown with vault links; users expect them to look like notes.
- Model output is untrusted (prompt injection): it must not run script or
  load remote content. The constitution forbids `innerHTML`, `outerHTML`,
  `eval` and `Function`, and requires inline code and every fence not on the
  plugin's allowlist to be neutralized, and no remote image or other remote
  embed loaded, before
  rendering or export.
- Plugins register code-block processors per fence language and post
  processors that run on everything rendered
  (`registerMarkdownCodeBlockProcessor`, `registerMarkdownPostProcessor`);
  the public API cannot list them. Dataview runs `dataviewjs` fences and
  inline `$=` code as JavaScript, and inline `=` code as queries (Dataview
  docs).
- The exporter writes reply and thinking text into a vault note, which
  Obsidian renders, processors included, when the note is opened.
- Replies stream as many small deltas.
- Outside a Markdown view, links rendered by `MarkdownRenderer` get no click
  behaviour, and link targets containing spaces do not parse as links.

## Options considered

### `MarkdownRenderer` for final blocks, text nodes elsewhere (recommended, with changes)

- Vault-native output (wikilinks, embeds, callouts, theme) with Obsidian's
  sanitizing and no dependency.
- As built, it inherits everything Obsidian's renderer does: other plugins'
  code-block and post processors run on model text, and remote images load.

### Plain text only

- Inert by construction: no processor sees the text and nothing loads.
- Loses Markdown: formatting, tables, code blocks and clickable vault links.

### Sandboxed iframe with an in-house renderer

- Strongest isolation: a sandbox without `allow-scripts` runs no script, a
  frame policy can block remote loads, and no other plugin's processor or DOM
  code reaches the frame (inferred).
- Needs a Markdown renderer of its own: a bundled one is a runtime
  dependency to screen (ADR-007), and an in-house one is a parser for Obsidian's
  dialect to write and maintain. Its HTML enters the frame as a string
  (`srcdoc`), which *Inert rendering* does not allow, so it needs a
  constitution change. Wikilinks, embeds, page previews and the theme stop at
  the frame boundary.

### Bundle `markdown-it` with a sanitizer

- The most mature standalone option; full control over images and
  extensions.
- Runtime dependencies (ADR-007), and output that is not vault-native:
  wikilinks, embeds and callouts are Obsidian syntax, not CommonMark.

### Re-render Markdown on every delta

- Formatted while streaming.
- Quadratic work over a long reply.

## Decision

Why `MarkdownRenderer` on final blocks:

- It is the path the constitution allows: model output reaches the DOM "only
  through Obsidian's `MarkdownRenderer` or text nodes"
  (`docs/current/constitution.md:46-47`); HTML handed to an iframe as a
  string is neither.
- It keeps Markdown, which plain text loses, and needs no dependency:
  `MarkdownRenderer.render(app, markdown, el, sourcePath, component)` is
  public API (`node_modules/obsidian/obsidian.d.ts:4147`), while a bundled
  renderer is a runtime dependency to screen (ADR-007).
- Rendering once per block keeps streaming linear; re-rendering on every
  delta re-parses the whole reply each time.

The changes:

- Code is cut out before rendering. Every reply goes to
  `MarkdownRenderer.render` with only its link targets repaired
  (`src/view.ts:3976-3979`), so a `dataviewjs` fence or inline `$=` code in
  a reply runs as JavaScript.
  Code-block processors are keyed to a fence's language and Dataview's
  inline queries to code spans (`node_modules/obsidian/obsidian.d.ts:5001`;
  Dataview docs), so text with no code left in it gives them nothing to run.
- Remote images and every other embed with a remote source (`video`, `audio`,
  `iframe`, `source`, `embed`, `object`) are removed before rendering; a
  rendered embed loads its URL, a data-exfiltration channel under prompt
  injection.
- Export applies the same cut, so an exported note runs no other plugin's
  processor on model text when opened.
- `file:` links no longer go to the OS. `file` is among the schemes handed
  to `window.open` (`src/view.ts:5108`, `src/view.ts:4001-4004`), so a click
  opens whatever the OS associates with the target.

The design:

- Deltas accumulate as `textContent`; the `assistant` message's final block
  is rendered. Every render goes through `renderMarkdown`
  (`src/view.ts:3977-3979`): the final reply (`src/view.ts:4171`), a reopened
  reply (`src/view.ts:4119`), subagent text (`src/view.ts:2943`), report cards
  (`src/view.ts:2354`), the diff view's Rendered toggle
  (`src/view.ts:3371-3389`) and the ExitPlanMode plan on its card. Every
  other string enters the DOM through `createEl`/`setText`.
- `renderMarkdown` takes its input only from one pure neutralizing module,
  which the exporter also calls:
  1. Every inline code span, and every fenced block whose language is not on
     the allowlist, is replaced by a placeholder that holds no Markdown
     syntax.
  2. Every image whose source is not a vault file (an `http(s)` or other URL,
     as a Markdown image or an HTML `img`) is replaced by its alt text and
     URL as text.
  3. Link targets with spaces are percent-encoded.
  4. The text is rendered, then each placeholder is replaced by an inert
     `code` (inline) or `pre` and `code` (fence) element built with
     `createEl`, holding the original text as a text node. These elements
     never pass through the renderer.
- The fence allowlist is a constant in that module: the plain fence (no
  language) and common display languages the plugin names, never a language
  another plugin executes. An allowlisted fence renders through
  `MarkdownRenderer` with Obsidian's highlighting.
- Before export the same cut writes inert Markdown instead of elements: an
  inline code span becomes its text with the backticks escaped, a
  non-allowlisted fence becomes a `text` fence with the same content, and a
  remote image or embed becomes its alt text and URL. It applies to reply and
  thinking text; tool and shell output is written as a fence the module
  builds, its leading `=` or `$=` broken (`fenceForExport`, called from
  `src/transcript-markdown.ts`).
- Images a tool returns render only as whitelisted base64 `data:` URIs, live
  only.
- Clicks are delegated: a vault link opens only if it resolves to an
  existing file; `http(s)`, `mailto` and `obsidian` targets go to
  `window.open`; `file:` and every other scheme open nothing. Hover fires
  `hover-link` for page previews.
- Validation: `node:test` cases for the module (inline code and
  non-allowlisted fences become placeholders and come back as the original
  text; remote images become text; the export form). By hand in a vault with
  Dataview enabled: a reply with `dataview` and `dataviewjs` fences, inline
  `=` and `$=` code and a remote image runs nothing and loads nothing, in the
  panel and in the exported note, recorded in `docs/records/verification/`.

## Consequences

- Inertness of the remaining text rests on Obsidian's sanitizer.
- Open risk (accepted residual): other plugins' post processors still run on
  the rendered element, so a plugin that reads arbitrary DOM sees model text
  outside code, and one that reads it after the render finishes also sees
  the rebuilt code (inferred).
- The renderer still runs Obsidian's own processors on the allowlisted
  fences and the rest of the text: highlighting, link resolution, and embeds
  of vault notes, which render as they do when opened.
- Open risk: a plugin that registers a code-block processor for an
  allowlisted language runs it on model text; the public API cannot list
  registrations (`node_modules/obsidian/obsidian.d.ts:4036-4055`), so the
  allowlist rests on known plugins (inferred).
- Code outside the allowlist shows without highlighting, and inline code in
  an exported note shows as plain text with literal backticks.
- An `obsidian://` link still goes to Obsidian on click and runs whatever
  action Obsidian or a plugin registered for it
  (`registerObsidianProtocolHandler`); only the user's click starts it.
