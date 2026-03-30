import adapter from '@sveltejs/adapter-node';
import vercel from '@sveltejs/adapter-vercel';
import dotenv from 'dotenv';
import { relative, sep } from 'node:path';

dotenv.config();

const isVercel = !!process.env.VERCEL;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: { adapter: isVercel ? vercel() : adapter(), experimental: { remoteFunctions: true } },
	compilerOptions: {
		experimental: { async: true },
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	}
};

export default config;
