# Legal & licensing

Reviewed 2026-09-01, revised 2026-09-02 against the Obsidian Developer Policies
and Anthropic's Claude Code legal-and-compliance documentation, ahead of
publishing the repository and submitting to the Obsidian community-plugin
directory. This is a good-faith engineering review, not legal advice.

## Repository license

The entire repository is licensed under the [MIT License](../LICENSE)
(canonical SPDX text, © 2026 Yoav Aharoni). Every line of shipped code
(`main.js` bundle: `src/**` only) is original to this project.

## Third-party components

**Bundled: none.** The production bundle has zero dependencies; it requires
only Node.js builtins and the `obsidian` API module provided by the app at
runtime.

**Development-only** (never distributed; verified all-permissive):

| package | license |
| --- | --- |
| obsidian (API typings) | MIT |
| esbuild (+ platform binary) | MIT |
| typescript | Apache-2.0 |
| @types/node, builtin-modules | MIT |
| tslib | 0BSD |

**Not a dependency: Claude Code itself.** The `claude` CLI is proprietary
Anthropic software that users install and license directly from Anthropic.
The plugin launches the user's own installation as a subprocess; it does not
download, embed, patch, or redistribute it. The proprietary
`@anthropic-ai/claude-agent-sdk` package was evaluated early and dropped
before this repository's first commit: it appears in no committed
`package.json` (verify with `git log -S "claude-agent-sdk" -- package.json`,
which returns nothing), was never imported, and has never been in the bundle.

## Interoperability statement

The plugin communicates with the CLI exclusively through public,
user-reachable interfaces: documented CLI flags (`--input-format/-
-output-format stream-json`, `--permission-prompt-tool stdio`, etc.) and the
JSON messages those flags emit and accept. The protocol client
(`src/protocol/client.ts`) and its type definitions are original
implementations written for interoperability; no Anthropic source code was
copied. This is the same interface Anthropic exposes for third-party
automation via headless mode.

## Trademarks

"Claude" and "Claude Code" are trademarks of Anthropic, PBC; "Codex" and
"ChatGPT" are trademarks of OpenAI; "Obsidian" is a trademark of Dynalist Inc.
The plugin claims none of them.

**The plugin is named for what it is, not for whom it talks to.** Anthropic's
[legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance)
draws the line explicitly:

> You can accurately say, in plain text, that your product has Claude Code
> preinstalled or that it runs Claude Code. But you can't use the Claude Code
> or Anthropic names or logos as part of your own product, feature, or company
> name, in your own logo, or in a way that suggests Anthropic built, endorses,
> or is partnered with your product.

The same paragraph continues: "Any other use of Anthropic's names or logos is
governed by our Trademark Guidelines and requires our written permission", and
those Guidelines (effective 1 August 2024) permit use "only in materials we
approve beforehand". The plain-text allowance quoted above is therefore the
only permission this project relies on, and every use of the marks in this
repository is a plain-text statement of compatibility.

Nothing in the plugin's own identity carries a vendor mark. It is named **AI
Agent Panel** (manifest id `ai-agent-panel`); its ribbon icon is a chat bubble
holding a terminal prompt, drawn to evoke no vendor, and tinted with the vault
theme's own `var(--text-accent)` rather than any brand color; and its commands,
view title, menu items and CSS namespace all use that name and no other.

What remains is **nominative use**: the README, the manifest description and
the settings UI say the panel works with Anthropic's Claude Code CLI, which is
the plain-text factual statement the paragraph above expressly permits. No
Anthropic (or OpenAI) name or logo appears in the plugin's name, its icon, its
id, or its namespace, and every surface that names a vendor also states the
project is unofficial. The same rule governs the planned Codex integration: it
may be described, never used as branding.

Per Obsidian's policy, the name does not use the "Obsidian" trademark either -
that mark protects Obsidian itself and is not implicated by naming a plugin
after its own function.

## Authentication and Anthropic's usage policy

Anthropic's Claude Code legal page distinguishes OAuth subscription logins
("intended exclusively for purchasers of Claude Free, Pro, Max, Team, and
Enterprise subscription plans and … designed to support ordinary use of Claude
Code and other native Anthropic applications") from API-key authentication for
"developers building products or services". It states that Anthropic "does not
permit third-party developers to offer Claude.ai login into their own
applications, or to route requests through Free, Pro, or Max plan credentials
on behalf of their users", and that "developers may not collect, store, or
intermediate Claude.ai credentials or session tokens - sign-in to a Claude
account must complete through Anthropic's own flow."

This plugin's design keeps it on the right side of that line:

- It implements **no login, OAuth flow, or credential handling** and offers
  none to anyone. There is no service, backend, or relay; nothing is routed
  "on behalf of" anyone.
- It is a local, open-source frontend that launches the **user's own** Claude
  Code installation, on the user's own machine, under whatever authentication
  the user already established with Anthropic. It runs the CLI in its
  documented non-interactive stream-JSON mode, which Anthropic's SDK typings
  classify as a programmatic session distinct from interactive terminal use;
  Anthropic has said it may treat such sessions differently for plan limits
  (see the Agent SDK support article, changes paused 15 June 2026).
- The maintainer's position is that one person chatting with their own vault
  is "ordinary, individual usage" in the sense of Anthropic's page. Anthropic
  reserves subscription usage for "ordinary use of Claude Code and other
  native Anthropic applications", and its sign-in article says third-party
  tools, "including open-source projects", should prefer API keys, while
  allowing subscribers to use "certain third-party tools" at Anthropic's
  discretion and possibly against usage credits. The plugin takes no position
  on which bucket a given user falls in.

Residual consideration: Anthropic's terms govern the user's Claude Code
usage, and Anthropic can change or enforce them. Users who build heavy
automation on top of this plugin (or any Claude Code frontend) should use
API-key authentication per Anthropic's guidance. The plugin takes no position
on the user's plan and does not advertise itself as a way to repurpose
subscription quota.

Two further texts bear on the question and are recorded here so the reading
above is not one-sided. Anthropic's Consumer Terms (effective 8 October 2025,
section 3) forbid access "through automated or non-human means, whether through
a bot, script, or otherwise" except by API key "or where we otherwise
explicitly permit it"; Claude Code's headless mode is a documented feature, and
the plugin's reading is that driving it counts as permitted, but the clause
exists. Anthropic's sign-in support article (19 May 2026) says the preferred
way for "third-party software, tools, or services ... including open-source
projects" to access Anthropic services is API-key authentication, and that
Anthropic "reserves the right to draw use of such third-party tools from usage
credits rather than subscription limits". Both govern the user's account, not
this project, and neither is changed by anything the plugin does.

### Plan usage goes through the CLI, not through a credential

The plugin has one feature that reports Anthropic account data - the usage
strip and the `/usage`, `/usage-credits` and `/extra-usage` commands - and it
is worth being explicit about how it gets it, because the obvious
implementation would not be permissible.

It asks the **running CLI session** for the numbers, with a `get_usage`
control request sent over the stdio pipe the plugin already owns. The CLI then
makes any authenticated call itself, with the login the user already
established. The plugin reads no credential file, never touches the macOS
Keychain, never holds an access token, and makes no HTTP request of its own.

This matters because Anthropic's terms say developers "may not collect, store,
or intermediate Claude.ai credentials or session tokens", and describe OAuth as
intended for "ordinary use of Claude Code and other native Anthropic
applications". A third-party plugin reading the CLI's stored OAuth token and
calling `api.anthropic.com` with it would sit on the wrong side of both
sentences, however local and read-only it was. Routing the request through the
unmodified binary keeps the credential entirely inside the software Anthropic
issued it to.

`get_usage` is declared in the public `@anthropic-ai/claude-agent-sdk` type
definitions, where Anthropic also marks it experimental and free to change or
disappear without notice. The plugin treats any failure as "no usage
available" and simply renders nothing, so an unsupported or altered CLI
degrades quietly instead of erroring.

## "Can customers offer Claude Code in their products?"

Anthropic's page attaches conditions to "preinstalling or running Claude Code
in your products or services (e.g. in hosted sandboxes or other agent
infrastructure)". This plugin neither preinstalls nor hosts anything - the
user installs and logs into the CLI themselves, and it runs on their own
machine - so the clause is arguably not engaged at all.

Where the clause is engaged, Anthropic's page says it "requires agreeing to our
Commercial Terms of Service"; this project has not done so, on the reading that
a free local plugin neither preinstalls nor hosts Claude Code. The same page
states that nothing in it prevents "an end user from signing in to the
unmodified Claude Code binary with their own Claude subscription, including
where a platform hosts Claude Code", which is the case here even on the
stricter reading.

It is worth recording that the plugin satisfies the conditions even on the
stricter reading:

| condition | status |
| --- | --- |
| The Claude Code binary must not be modified | Met - spawned as installed; never downloaded, patched, or repackaged |
| May not remove, disable, or restrict any built-in authentication method | Met - the plugin adds no auth path and blocks none; login happens in the CLI |
| Each end user authenticates with their own credentials | Met - there is only ever one user, on their own machine, with their own login |
| May not pay for, resell, or intermediate Claude usage | Met - no service, backend, relay, or billing exists in this project |

## Obsidian Developer Policies compliance

Checked against the Developer policies at
<https://docs.obsidian.md/community-directory/developer-policies> and the
Submission requirements at
<https://docs.obsidian.md/community-directory/submission-requirements-for-plugins>.

| policy | status |
| --- | --- |
| Include a LICENSE file and state the plugin's license | Yes - MIT, in repo root and `manifest`-adjacent docs |
| Comply with licenses of code used, with attribution | Yes - no third-party code in the bundle; dev deps permissive |
| Don't use the "Obsidian" trademark confusingly | Yes - not in plugin id (`ai-agent-panel`) or name ("AI Agent Panel") |
| Don't use a third party's trademark as your own name | Yes - see [Trademarks](#trademarks) |
| Disclose network use | Yes - README + SECURITY: the plugin opens no socket of its own; the CLI it launches sends vault content the user shares to Anthropic's API, including for plan usage |
| Disclose account/payment requirements | Yes - README Requirements: needs an installed, logged-in Claude Code (paid or free plan per Anthropic) |
| No client-side telemetry | Yes - none; the plugin collects nothing |
| Not an unauthorized fork | Yes - original work |

## Warranty

The software is provided "as is" under the MIT license, without warranty of
any kind. Claude Code edits files and can run shell commands with the user's
approval; users are responsible for the permissions they grant and for
backing up their vaults.
