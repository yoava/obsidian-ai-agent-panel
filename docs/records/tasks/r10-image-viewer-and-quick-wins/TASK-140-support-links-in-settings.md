---
status: closed
release: r10-image-viewer-and-quick-wins
number: 140
prd: PRD-001.R39
---

# TASK-140 — Support links at the foot of the settings page

Lives in `docs/work/tasks/<rNN-slug>/` with status `planned` or `active`;
`make close DOC=<this file>` in the landing commit sets `closed` and moves it to
`docs/records/tasks/`.

## Spec

Size S, `feat`, the owner's AAP-24, requirement delta CHG-025: the settings
page ends with a "Support development" row, a heart and a button per
`fundingUrl` entry (heart or coffee icon), opened by the browser, out of the
search (decision 12, then the owner's ask to match other plugins).

Acceptance: the PRD-001.R39 statement CHG-025 adds; `settings-rows` tests.

## Scope

Expected files: `src/settings.ts`, `src/state/settings-rows.ts`,
`styles.css`, `tests/state-settings-rows.test.mjs`, PRD-001, DES-001,
SECURITY, CHG-025, `RELEASE_NOTES.md`.

Negative scope: the panel itself, README, any request or tracking of clicks.

## Plan

`supportLinks` (`state/settings-rows`) reads `fundingUrl` as `unknown`
(Obsidian's typings lack it): a map or one string, `https:` only. A last
`PanelGroup` with one `searchable: false` row draws the line with
`<a target="_blank">` per link styled as the "Add profile" button (ADR-016
U5 keeps `window.open` in `ui/messages`), and an empty sync slot.

## Run log

- `tests/state-settings-rows.test.mjs`: the manifest's map in order with
  its icons, one string, non-`https:` and non-string values dropped, no value.
- Harness: the row at the page's foot, dark and light, 720 and 460 px, the
  legacy renderer, still shown while the search filters; buttons in line with
  "Add profile".
- `make verify` OK.

## Independent review

Size S: unit tests and harness above; the owner checks a click opens the
browser in a vault.

## Outcome

Done.
