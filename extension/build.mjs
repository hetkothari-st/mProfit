/**
 * build.mjs — esbuild entry for the PortfolioOS browser extension.
 *
 * Bundles four entry points (background service worker, two content scripts,
 * popup) to ESM format targeting Chrome 120+. Run with:
 *   node build.mjs          — one-shot build
 *   node build.mjs --watch  — watch mode (dev)
 */

import esbuild from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

// Ensure output directories exist
if (!existsSync(outdir)) await mkdir(outdir, { recursive: true });
if (!existsSync(`${outdir}/icons`)) await mkdir(`${outdir}/icons`, { recursive: true });

const entries = {
  background:    'src/background/index.ts',
  'content-epfo': 'src/content/epfo.ts',
  'content-sbi':  'src/content/sbi.ts',
  popup:         'src/popup/popup.ts',
};

const ctx = await esbuild.context({
  entryPoints: entries,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir,
  outExtension: { '.js': '.js' },
  platform: 'browser',
  sourcemap: 'inline',
  // Treat chrome.* as external so esbuild doesn't try to bundle them
  external: [],
  // Keep names for easier debugging
  keepNames: true,
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes…');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

// Copy static assets to dist/
await copyFile('manifest.json', `${outdir}/manifest.json`);
await copyFile('src/popup/index.html', `${outdir}/popup.html`);
await copyFile('src/popup/popup.css', `${outdir}/popup.css`);

for (const size of [16, 48, 128]) {
  const src = `icons/icon-${size}.png`;
  if (existsSync(src)) {
    await copyFile(src, `${outdir}/icons/icon-${size}.png`);
  }
}

if (!watch) {
  console.log('Built:', Object.keys(entries).join(', '));
}
