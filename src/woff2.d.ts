/** esbuild inlines a `.woff2` import as a `data:` URL (`esbuild.config.mjs`). */
declare module "*.woff2" {
	const dataUrl: string;
	export default dataUrl;
}
