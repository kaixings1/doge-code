import * as path from 'path'
import * as fs from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const mainEntry = path.resolve(__dirname, 'src/main/index.ts')

// 将 .js 扩展名重写为 .ts/.tsx，并回退到目录下的 index.ts/index.tsx
const jsToTsCache = new Map<string, string>()
function jsToTsResolver() {
  return {
    name: 'js-to-ts-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (typeof source !== 'string') return null
      console.log('[JS-TS] resolveId CALLED:', JSON.stringify(source), 'importer:', importer?.slice(-80))
      const result = resolveJsToTs(source, importer)
      if (result) console.log('[JS-TS] resolveId HIT:', result.id)
      else if (source.endsWith('.js')) console.log('[JS-TS] resolveId MISS:', JSON.stringify(source))
      return result
    },
    resolveDynamicImport(source, importer) {
      if (typeof source !== 'string') return null
      console.log('[JS-TS] resolveDyn CALLED:', JSON.stringify(source))
      const result = resolveJsToTs(source, importer)
      if (result) console.log('[JS-TS] resolveDyn HIT:', result.id)
      else if (source.endsWith('.js')) console.log('[JS-TS] resolveDyn MISS:', JSON.stringify(source))
      return result
    },
  }
}

function resolveJsToTs(source: string, importer?: string) {
  if (typeof source !== 'string' || !source.endsWith('.js')) return null
  // 跳过 node_modules 内部的导入，避免干扰第三方包解析
  if (importer && importer.includes('node_modules')) return null
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
  const projectRoot = path.resolve(__dirname, '..')
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

// 仅外部化真正的 node_modules 包（不含内部 @ 别名）
function externalizeNodeModules() {
  return {
    name: 'externalize-node-modules',
    enforce: 'pre',
    resolveId(source, importer) {
      return resolveExternalization(source, importer)
    },
    resolveDynamicImport(source, importer) {
      return resolveExternalization(source, importer)
    },
  }
}

function resolveExternalization(source: string, importer?: string) {
  if (typeof source !== 'string') return null
  // 外部化 electron 和 node 内置模块
  if (source === 'electron' || source.startsWith('node:')) {
    return { id: source, external: true }
  }
  // 不外部化内部 @ 别名
  if (source.startsWith('@')) {
    const pkg = source.split('/')[0]
    const internalAliases = ['@main', '@commands', '@engine', '@tools', '@skills', '@utils', '@preload']
    if (!internalAliases.includes(pkg)) {
      return { id: source, external: true }
    }
    return null // 内部别名，不外部化
  }
  // 不外部化文件路径（含路径分隔符、文件扩展名或 .md）
  if (source.includes('/') || source.includes('\\') || /\.[a-z]+$/i.test(source)) {
    return null
  }
  // 外部化不含路径分隔符的顶层包名（如 react, lodash, @sentry/node 已在上方处理）
  if (!source.startsWith('.') && !source.startsWith('/')) {
    return { id: source, external: true }
  }
  return null
}

export default defineConfig({
  main: {
    plugins: [jsToTsResolver(), markdownTextPlugin(), externalizeNodeModules()],
    build: {
      outDir: 'dist/main',
      rollupOptions: { input: { index: mainEntry } },
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        '@main': path.resolve(__dirname, 'src/main'),
        '@commands': path.resolve(__dirname, '../src/commands'),
        '@engine': path.resolve(__dirname, '../src/engine'),
        '@tools': path.resolve(__dirname, '../src/tools'),
        '@skills': path.resolve(__dirname, '../src/skills'),
        '@utils': path.resolve(__dirname, '../src/utils'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), jsToTsResolver()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: { input: { index: path.resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: { '@': path.resolve(__dirname, 'src/renderer') },
    },
    plugins: [react(), jsToTsResolver()],
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: { index: path.resolve(__dirname, 'src/renderer/index.html') } },
    },
    server: { port: 5173 },
  },
})
