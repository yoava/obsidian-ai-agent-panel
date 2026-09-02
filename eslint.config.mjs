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
]);
