import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores(["main.js", "src/main.js", "tests/**", "graphify-out/**", "node_modules/**"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs", "esbuild.config.mjs", "version-bump.mjs"],
				},
			},
		},
	},
	{
		rules: {
			// Sentence case is right about prose and wrong about names and literal
			// values. obsidianmd/* rules cannot be silenced with an inline
			// eslint-disable, so the exceptions live here, where they read as a
			// reviewable list rather than as comments scattered through the UI code.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					// An acronym the rule's own list does not carry; "Run via wsl" is
					// not what the setting means.
					ignoreWords: ["WSL"],
					ignoreRegex: [
						// Proper nouns, matched whole: the plugin's own name as it appears
						// in manifest.json, and Anthropic's product name. Sentence case
						// would render these "AI agent panel" and "Claude code CLI".
						"^(Open )?AI Agent Panel$",
						"^Claude Code CLI$",
						// Placeholders that show a field's own syntax or repeat the
						// setting's real default, so they must match it character for
						// character: a duration ("5m", not "5M"), a moment.js date format,
						// and the default transcript folder's actual name.
						"^5m$",
						"^YYYY-MM-DD$",
						"^Agent Chats$",
					],
				},
			],
		},
	},
]);
