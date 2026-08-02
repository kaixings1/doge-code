import { build } from 'esbuild';
import * as path from 'node:path';
import * as fs from 'node:fs';

const distDir = path.join(process.cwd(), 'dist');
const rendererDir = path.join(distDir, 'renderer');
const preloadDir = path.join(distDir, 'preload');

async function main() {
  // Bundle renderer
  console.log('Bundling renderer...');
  const rendererTmp = path.join(distDir, '_bundle_renderer');
  if (fs.existsSync(rendererTmp)) fs.rmSync(rendererTmp, { recursive: true });
  fs.mkdirSync(rendererTmp, { recursive: true });

  await build({
    entryPoints: [path.join(distDir, 'renderer', 'index.js')],
    bundle: true,
    outdir: rendererTmp,
    platform: 'node',
    format: 'iife',
    target: 'es2022',
    external: ['fs', 'path', 'node:fs', 'node:path'],
    loader: { '.js': 'js', '.jsx': 'jsx' },
    jsx: 'automatic',
    globalName: '__dogeRenderer',
    banner: { js: '"use strict";' },
  });

  const bundledRenderer = path.join(rendererTmp, 'index.js');
  if (fs.existsSync(bundledRenderer)) {
    fs.copyFileSync(bundledRenderer, path.join(rendererDir, 'index.js'));
    fs.rmSync(rendererTmp, { recursive: true });
    console.log('Renderer bundled OK');
  }

  // Bundle preload
  console.log('Bundling preload...');
  const preloadTmp = path.join(distDir, '_bundle_preload');
  if (fs.existsSync(preloadTmp)) fs.rmSync(preloadTmp, { recursive: true });
  fs.mkdirSync(preloadTmp, { recursive: true });

  await build({
    entryPoints: [path.join(distDir, 'preload', 'index.js')],
    bundle: true,
    outdir: preloadTmp,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
    external: ['electron'],
    loader: { '.js': 'js' },
  });

  const bundledPreload = path.join(preloadTmp, 'index.js');
  if (fs.existsSync(bundledPreload)) {
    fs.copyFileSync(bundledPreload, path.join(preloadDir, 'index.cjs'));
    fs.rmSync(preloadTmp, { recursive: true });
    console.log('Preload bundled OK');
  }
}

main().catch((err) => {
  console.error('Bundle error:', err);
  process.exit(1);
});
