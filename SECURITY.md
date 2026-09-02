# Security policy

## Supported versions

Only the latest release gets security fixes. Older versions are not patched -
update to the current release before reporting, so we are both looking at the
same code.

## Reporting a vulnerability

**Please do not open a public issue for a vulnerability.**

Report it privately, through either:

- [GitHub's private reporting form](https://github.com/yoava/obsidian-ai-agent-panel/security/advisories/new)
  (preferred), or
- a private message to the maintainer.

Include reproduction steps and the plugin, Obsidian, and Claude Code versions
involved.

Expect an acknowledgement within about a week. This is a spare-time project
with one maintainer, so a fix may take longer than that - you will be told
where things stand rather than left waiting.

## How a fix is published

A confirmed vulnerability is handled as a GitHub Security Advisory on this
repository: drafted privately, fixed, and then published. Where the issue
warrants one, a CVE is requested through GitHub. The published advisory is
also recorded in [docs/RELEASE_NOTES.md](docs/RELEASE_NOTES.md) against the
version that fixes it.

Fixes are not folded silently into a release, and the advisory is never a
public issue opened before the fix exists.

## Threat model

What this plugin does and does not trust - process spawning, permission modes,
credential handling, local data, and the known residual risks - is documented
in [docs/SECURITY.md](docs/SECURITY.md).
