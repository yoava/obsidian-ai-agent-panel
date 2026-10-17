# ExitPlanMode `allowedPrompts` grants nothing

**Date:** 2026-10-11. **Method:** read the installed and cached Claude Code
builds; no CLI was run.

| Build | What it says about `allowedPrompts` |
| --- | --- |
| 2.1.291, 2.1.292, 2.1.296 (installed) | ExitPlanMode input schema: `allowedPrompts: array({tool: enum(["Bash"]), prompt: string()}).optional().describe("Deprecated: no longer used.")`; in 2.1.296 the name appears only in that schema |
| 2.1.241 (`sdk-tools.d.ts`) | the same "Deprecated: no longer used." |
| 2.1.104 (`cli.js`) | read only by the terminal app's plan dialog, which turns the prompts into allow rules behind a gate that always returns false ("This feature is disabled"); the stdio permission path never reads it |

Conclusion: Allow on a plan card grants only the plan's own exit; a card
listing `allowedPrompts` as granted would state a permission the user never
gets (task 022, not landed).
