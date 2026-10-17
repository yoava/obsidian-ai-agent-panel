# CHG-022 — Images open large in a viewer

**Status:** incorporated (2026-10-17)

Requested by the owner on 2026-10-17 as vault task AAP-14 ("Prompt - Image
viewer and quick wins"), decisions approved that day: a click, Enter or Space
on any image thumbnail shows it large; the composer image chip views on click
and removes by its own button, as attached files do. Hover preview, a
main-window tab, images in reopened conversations and images inside rendered
Markdown are out of scope. Lands with task 137.

## Intent

An image the user pasted or a tool returned can be read at full size without
leaving the panel.

Affected: [PRD-001](../../current/product/PRD-001-chat-panel-and-sessions.md)
(R14), [DES-003](../../current/design/DES-003-panel-ui.md) (Image viewer,
Images, Prompts, Tool steps), [DES-001](../../current/design/DES-001-system-overview.md)
(`confirm-modal`).

## ADDED requirements

### PRD-001

- **PRD-001.R14** — the image viewer.
  - WHEN the user clicks, or presses Enter or Space on, an image chip, a sent
    prompt's image or a tool result's image, the AI Agent Panel shall show that
    image in a dialog, fitted to the window, under a caption of its name, file
    size and pixel dimensions.
  - WHEN the user clicks the image in the viewer, the AI Agent Panel shall
    switch between fitted and actual size, scrolling an image larger than the
    dialog.
  - WHEN the user presses Left or Right in the viewer, the AI Agent Panel
    shall show the previous or next image of the same message or tool result,
    fitted, staying on the first or last image at either end.
  - WHEN the user presses Escape in the viewer, the AI Agent Panel shall close
    it.

## MODIFIED requirements

### PRD-001

- **PRD-001.R14** — an image chip's click.
  - Before: WHEN the user clicks an image chip, the AI Agent Panel shall
    remove that image.
  - After: WHEN the user clicks an image chip's remove button, the AI Agent
    Panel shall remove that image.

## REMOVED requirements

None.

## Design and migration impact

- The viewer is `ImageViewerModal` in `confirm-modal`, since a `ui/` module
  may not import `theme-scope` (ADR-016 U2); its state is
  `state/image-viewer`; `ui/dom`'s `thumbButtons` draws the prompt and tool
  thumbnails as buttons named "View <name>".
- A tool result's images, which carry no name, are "Tool result image N"
  among the row's.
- Stored data: unchanged; a reopened conversation still holds only image
  counts.
- Rollback: revert the commit.

## Incorporation

PRD-001, DES-001 and DES-003 edited on the owner's request; the record moves to
`docs/records/changes/` by `make close DOC=docs/work/changes/CHG-022-image-viewer.md`.
