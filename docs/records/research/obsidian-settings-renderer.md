# Obsidian's settings renderer, 1.13.4 and 1.14.4

Static reading of Obsidian's own `app.js` and `app.css`, nothing executed,
for [ADR-019](../../current/adr/ADR-019-settings-page-on-the-declarative-api.md).
Obsidian 1.13.0 to 1.13.3 have no public build (no release asset), so
1.13.4 is the earliest 1.13 build checked.

## Sources

| Build | Asset | SHA-256 |
| --- | --- | --- |
| 1.13.4 | `https://github.com/obsidianmd/obsidian-releases/releases/download/v1.13.4/obsidian-1.13.4.asar.gz` | `4da84f44ed4232feee2bb33bf94db3d22e8e5d206787268183cea22402cb093a` |
| 1.13.4 `app.js` | from that asar | `8173a8631d7bf6096e32d303b13c80e2995076970ed8a77afb11d8b8c5d8e7d1` |
| 1.14.4 | `https://github.com/obsidianmd/obsidian-releases/releases/download/v1.14.4/obsidian-1.14.4.asar.gz` | `d1ed428c363968774f0f3906e67d8a53a058ece0b6cdd924b07865977b2ada21` |
| 1.14.4 `app.js` | from that asar; the same file the local install holds | `958ce57fe22f87fdf121546e46dfccd9c8ee971ce3fd8f801d60d4ece39a2df9` |

Reproduce: gunzip the asset; read `app.js` and `app.css` out of the asar
(header: little-endian u32 at byte 12 is the JSON index's length, the index
starts at byte 16, file data starts at 8 plus the u32 at byte 4, each
entry's `offset` and `size` relative to that); pretty-print with the
repository's esbuild (`node_modules/.bin/esbuild app.js --outfile=app.pretty.js`).
Line numbers below are in that output. Minified names differ per build, so
each finding names a string to search for.

## Findings

| Behavior | 1.13.4 | 1.14.4 | Search for |
| --- | --- | --- | --- |
| A `render` row's name and description are set before `render` runs | yes (63342) | yes | `.render(` |
| `refreshDomState()` re-evaluates `visible` and `disabled` without re-rendering, hiding a group none of whose rows show | yes (63519, 63155) | yes | `refreshDomState` |
| Row key | `ctrl:<key>`, else `name:<name>`, else `item#<index>` (63174) | `id:<id>` first, then the same (64401) | `"name:"` |
| Group key | `group:<heading>`, else `group#<index>` (63179) | `group:id:<id>` first, then the same (64403) | `":id:"` |
| Duplicate keys | logged ("duplicate setting key"), matched in order | the same (64414) | `duplicate setting key` |
| A reused group's `cls` | applied only when the group is created (63221) | the same (64445) | `cls.split(" ")` |
| `update()` on a matched row | a declarative `control` row holding focus is skipped; any other row, a focused `render` row included, is cleared and rendered again, focus then moved to its `.setting-item-control` (63276) | the same (64509) | `setting-item-control` |
| Groups are direct children of the tab element | yes, `setChildrenInPlace` (63211) | yes | `setChildrenInPlace` |
| Group DOM | `.setting-group` > heading row, `.setting-group-search`, `.setting-items` | the same | `setting-group-search` |
| Group `search` | handled (63227) | handled | `searchInputEl` |
| `.vertical-tab-content` | the scroller: `overflow-y: auto; height: 100%; padding-top: var(--size-4-12)`; parent `.vertical-tab-content-container` `overflow: hidden` | the same | `vertical-tab-content-container` |
| `--setting-group-max-width` | `700px`, `.setting-group` centered under it | the same, plus `100%` on phones | `setting-group-max-width` |

## Result

1.13.4 ignores an `id` on rows and groups; every other behavior ADR-019
relies on is the same in both builds. On both, `update()` rebuilds a
focused `render` row.
