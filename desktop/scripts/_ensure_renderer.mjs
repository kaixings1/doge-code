// 确保 dist/renderer/index.js 是 esbuild 打包后的 IIFE 格式（普通 <script> 可执行）。
// 直接以源码 src/renderer/index.tsx 为入口打包，不依赖 tsc 编译产物（dist/renderer/index.js）。
// 若打包产物缺失、过小或为 ESM（export 开头），则重新打包。
import { build } from 'esbuild';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const rendererDir = path.join(distDir, 'renderer');
const rendererOut = path.join(rendererDir, 'index.js');
const srcEntry = path.join(projectRoot, 'src', 'renderer', 'index.tsx');

function needsRebundle() {
  if (!fs.existsSync(rendererOut)) return true
  const head = fs.readFileSync(rendererOut, 'utf-8').slice(0, 400)
  // 未打包的 tsc 输出：顶层 export/import 语句
  if (/^\s*export\s/.test(head) || /^\s*import\s/.test(head)) return true
  // 过小的文件（< 100KB）不可能是打包后的 React 应用
  if (fs.statSync(rendererOut).size < 100 * 1024) return true
  return false
}

async function main() {
  if (!needsRebundle()) {
    console.log('[ensure-renderer] index.js 已是打包后的 IIFE（可直接加载）')
    process.exit(0)
  }

  console.log('[ensure-renderer] index.js 缺失或异常，从源码重新打包 renderer...')
  if (!fs.existsSync(srcEntry)) {
    console.error(`[ensure-renderer] 源码入口不存在: ${srcEntry}`)
    process.exit(1)
  }

  const rendererTmp = path.join(distDir, '_bundle_renderer')
  if (fs.existsSync(rendererTmp)) fs.rmSync(rendererTmp, { recursive: true })
  fs.mkdirSync(rendererTmp, { recursive: true })

  await build({
    entryPoints: [srcEntry],
    bundle: true,
    outdir: rendererTmp,
    platform: 'node',
    format: 'iife',
    target: 'es2022',
    external: ['fs', 'path', 'node:fs', 'node:path'],
    loader: { '.js': 'js', '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx' },
    jsx: 'automatic',
    globalName: '__dogeRenderer',
    banner: { js: '"use strict";' },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  })

  const bundledRenderer = path.join(rendererTmp, 'index.js')
  if (!fs.existsSync(bundledRenderer)) {
    console.error('[ensure-renderer] 打包失败：未生成 bundled index.js')
    process.exit(1)
  }
  fs.mkdirSync(rendererDir, { recursive: true })
  fs.copyFileSync(bundledRenderer, rendererOut)
  fs.rmSync(rendererTmp, { recursive: true })
  console.log(`[ensure-renderer] 打包完成: ${rendererOut} (${(fs.statSync(rendererOut).size / 1024 / 1024).toFixed(2)} MB)`)
  process.exit(0)
}

main().catch((err) => {
  console.error('[ensure-renderer] ERROR:', err)
  process.exit(1)
})
