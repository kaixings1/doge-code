import * as path from 'path'
import * as fs from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.resolve(__dirname, '..', '..')
const mainEntry = path.resolve(projectRoot, 'src', 'main', 'index.ts')

// 将 .js 扩展名重写为 .ts/.tsx，并回退到目录下的 index.ts/index.tsx
const jsToTsCache = new Map<string, string>()
function jsToTsResolver() {
  return {
    name: 'js-to-ts-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (typeof source !== 'string') return null
      const result = resolveJsToTs(source, importer)
      return result
    },
    resolveDynamicImport(source, importer) {
      if (typeof source !== 'string') return null
      const result = resolveJsToTs(source, importer)
      return result
    },
  }
}

function resolveJsToTs(source: string, importer?: string) {
  if (typeof source !== 'string' || !source.endsWith('.js')) return null
  // 跳过 node_modules 内部的导入
  if (importer && importer.includes('node_modules')) return null
  // 只有以 '.'、'/'、'src/' 开头的 .js 导入才是项目内文件
  if (!source.startsWith('.') && !source.startsWith('/') && !source.startsWith('src/')) return null
  const base = source.replace(/\.js$/, '')
  // 缓存键需包含 importer 目录，避免不同目录下同名的 .js 导入互相干扰
  const key = importer ? `${base}:${path.dirname(importer)}` : base
  if (jsToTsCache.has(key)) return { id: jsToTsCache.get(key)! }
  const candidates = [
    base + '.ts',
    base + '.tsx',
    base + '/index.ts',
    base + '/index.tsx',
  ]
  // 1. 相对于项目根目录直接查找（处理 src/utils/... 等已带前缀的路径）
  for (const rel of candidates) {
    const absolutePath = path.resolve(projectRoot, rel)
    if (fs.existsSync(absolutePath)) { jsToTsCache.set(key, absolutePath); return { id: absolutePath } }
  }
  // 2. 相对于 importer 所在目录
  if (importer) {
    const dir = path.dirname(importer)
    for (const rel of candidates) {
      const absolutePath = path.resolve(dir, rel)
      if (fs.existsSync(absolutePath)) { jsToTsCache.set(key, absolutePath); return { id: absolutePath } }
    }
  }
  return null
}

// 兼容 Bun 的文本导入（import str from './file.md'）
function markdownTextPlugin() {
  return {
    name: 'markdown-text-plugin',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('.md')) {
        const content = fs.readFileSync(id, 'utf-8')
        return `export default ${JSON.stringify(content)};`
      }
      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), jsToTsResolver(), markdownTextPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: mainEntry },
        output: { format: 'es', entryFileNames: '[name].mjs' },
        external: ['electron', 'electron-store', 'node-pty'],
      },
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        '@main': path.resolve(__dirname, 'main'),
        '@commands': path.resolve(projectRoot, 'src', 'commands'),
        '@engine': path.resolve(projectRoot, 'src', 'engine'),
        '@tools': path.resolve(projectRoot, 'src', 'tools'),
        '@skills': path.resolve(projectRoot, 'src', 'skills'),
        '@utils': path.resolve(__dirname, 'utils'),
        'bun:bundle': path.resolve(__dirname, 'polyfills', 'bun-bundle-polyfill.ts'),
        'bun:sqlite': path.resolve(__dirname, 'polyfills', 'bun-sqlite-polyfill.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), jsToTsResolver()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: path.resolve(__dirname, 'preload/index.ts') },
        external: ['electron'],
      },
    },
  },
  renderer: {
    root: 'renderer',
    resolve: {
      alias: { '@': path.resolve(__dirname, 'renderer') },
    },
    plugins: [react(), jsToTsResolver()],
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: { index: path.resolve(__dirname, 'renderer/index.html') } },
    },
    server: { port: 5173 },
  },
})
