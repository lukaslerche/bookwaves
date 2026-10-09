import adapter from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import dotenv from 'dotenv';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

dotenv.config();

const isVercel = !!process.env.VERCEL;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: [vitePreprocess({ script: true })],
			compilerOptions: {
				experimental: { async: true },
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: isVercel ? vercel() : adapter(),
			experimental: { remoteFunctions: true }
		}),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true
		})
	] /*,
	server: { // Uncomment for local https testing
			host: 'local.bookwaves.de',
			https: {
				key: fs.readFileSync('./cert/key.pem'),
				cert: fs.readFileSync('./cert/cert.pem')
			},
			//proxy: {}
		},*/
});
