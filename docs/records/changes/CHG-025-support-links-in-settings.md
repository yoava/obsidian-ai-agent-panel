# CHG-025 — Support links at the foot of the settings page

**Status:** incorporated (2026-10-17)

Requested by the owner on 2026-10-17 as vault task AAP-24 ("Prompt - Image
viewer and quick wins"), decision 12 approved that day, left out of the
settings search; the owner then asked for it to be as noticeable as other
major plugins' (PDF++, Notebook Navigator: a heart, a button per platform), so
it is a row with buttons rather than README's text line. Lands with task 140.

## Intent

A user who wants to support the plugin finds the links where they configure
it, without the plugin making any request.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R39), [DES-001](../../current/design/DES-001-system-overview.md) (Settings
page), [SECURITY](../../current/SECURITY.md) (`fundingUrl`).

## ADDED requirements

### PRD-001

- **PRD-001.R39** — Settings page: the AI Agent Panel shall end the page with
  a "Support development" row, led by a heart and described "AI Agent Panel
  is free and open source. If it helps you, consider supporting it. No
  feature is gated behind it.", holding one button per `fundingUrl` entry in
  `manifest.json` that opens its address in the browser, left out of the
  search and the filters.

## MODIFIED requirements

None.

## REMOVED requirements

None.

## Design and migration impact

- The buttons come from the manifest at runtime: a map in its order, or one
  string named "Support"; `https:` addresses only; no row with none. Icons
  are Obsidian's Lucide `heart` (pink, a new `--ai-agent-panel-sponsor`
  token) and `coffee`; brand badges were rejected, since remote ones make a
  request and bundled ones add brand marks.
- Network: none; a click hands the address to the browser.
- Stored data: unchanged.
- Rollback: revert the commit.

## Incorporation

PRD-001, DES-001 and SECURITY edited on the owner's request; the record moves
to `docs/records/changes/` by
`make close DOC=docs/work/changes/CHG-025-support-links-in-settings.md`.
