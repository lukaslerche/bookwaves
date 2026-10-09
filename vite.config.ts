import adapter from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import dotenv from 'dotenv';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { relative, sep } from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

dotenv.config();

const isVercel = !!process.env.VERCEL;

//import fs from 'fs';
export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: [vitePreprocess({ script: true })],
			compilerOptions: {
				experimental: { async: true },
				// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
				runes: ({ filename }) => {
					const relativePath = relative(import.meta.dirname, filename);
					const pathSegments = relativePath.toLowerCase().split(sep);
					const isExternalLibrary = pathSegments.includes('node_modules');

					return isExternalLibrary ? undefined : true;
				}
			},
			adapter: isVercel ? vercel() : adapter(),
			experimental: { remoteFunctions: true }
		}),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
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
