import * as path from 'path'
import * as fs from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const projectRoot = path.resolve(__dirname, '.')
const repoRoot = path.resolve(projectRoot, '..')
const mainEntry = path.resolve(projectRoot, 'desktop', 'src', 'main', 'index.ts')
const entrypointPath = path.resolve(projectRoot, 'desktop', 'src', 'main', 'entrypoint.ts')

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
  if (typeof source !== 'string') return null

  // 处理以 src/ 开头的导入（从 repo 根目录解析，回退到 projectRoot）
  if (source.startsWith('src/')) {
    const searchRoots = [repoRoot, projectRoot]
    for (const root of searchRoots) {
      // 直接尝试源路径
      const direct = path.resolve(root, source)
      if (fs.existsSync(direct)) return { id: direct }
      // 如果是 .js 导入，尝试 .ts/.tsx
      if (source.endsWith('.js')) {
        for (const repl of ['.ts', '.tsx']) {
          const p = direct.slice(0, -3) + repl
          if (fs.existsSync(p)) return { id: p }
        }
      }
    }
    return null
  }

  if (!source.endsWith('.js')) return null
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

/**
 * playwright-core（root node_modules 的 utilsBundle.js）内含 `await import("kerberos")`
 * 这样的动态可选依赖导入。vite/rollup 静态分析时会尝试从磁盘解析它，导致
 * "Rollup failed to resolve import kerberos" 中断 desktop 构建。
 * 该 kerberos 仅在 Negotiate 代理认证场景才使用（外部 npm 包），正常功能不会触发。
 * 此插件把它解析为一个空的 ES module shim，使 rollup 不再去解析磁盘；运行时若
 * 真正执行该分支会因 `kerberos` 为空落入 playwright 自带的 try/catch。
 */
function optionalDepsShimPlugin() {
  const shims = new Set(['kerberos'])
  const virtualPrefix = '\0optional-shim:'
  return {
    name: 'optional-deps-shim',
    enforce: 'pre',
    resolveId(source) {
      if (typeof source !== 'string') return null
      // 仅拦截裸模块名（非路径）；命中则返回一个虚拟模块 id
      if (/^[a-zA-Z0-9_\-@.]+$/.test(source) && shims.has(source)) {
        return virtualPrefix + source
      }
      return null
    },
    load(id) {
      if (typeof id === 'string' && id.startsWith(virtualPrefix)) {
        return 'export default {};'
      }
      return null
    },
  }
}


/**
 * CLI 源码（src/commands.ts）中存在两个完全相同的 `safeRequire<T>` 函数定义，
 * 这是 root src 的历史遗留重复声明。Bun 编译 CLI 时容忍，但 esbuild/vite 会以
 * "The symbol 'safeRequire' has already been declared" 硬报错中断 desktop 构建。
 * 由于本仓库不允许直接修改 src/ 下的 CLI 源码，此插件在 desktop 构建期把第二次
 * 出现的那个重复 `safeRequire` 函数定义整块移除（两个函数体完全相同，移除一个
 * 不影响任何调用——所有调用继续绑定到第一个定义）。
 */
function dedupSafeRequirePlugin() {
  return {
    name: 'dedup-safe-require-plugin',
    enforce: 'pre',
    transform(code, id) {
      // 仅处理根 CLI 的 src/commands.ts（Windows 磁盘路径归一化后做后缀匹配）
      const norm = id.replace(/\\/g, '/')
      if (!/src\/commands\.ts$/.test(norm)) return null
      // 精确匹配"函数定义签名行"，不含 JSDoc 注释里的 safeRequire 文本
      const sig = 'function safeRequire<T>(path: string): T | null {'
      let firstIdx = code.indexOf(sig)
      if (firstIdx === -1) return null
      let count = 0
      let out = code
      while (true) {
        const nextIdx = out.indexOf(sig, firstIdx + 1)
        if (nextIdx === -1) break
        count++
        // 把重复的定义重命名为唯一名（函数体无自引用，调用点绑定到第一个定义，行为一致）
        out = out.slice(0, nextIdx) + 'function _safeRequireDupArchive<T>(path: string): T | null {' + out.slice(nextIdx + sig.length)
        firstIdx = nextIdx + sig.length
      }
      if (count > 0) {
        console.log(`[dedup-safe-require] 重命名 src/commands.ts 中重复的 safeRequire 定义 (${count} 个), 文件: ${id}`)
        return out
      }
      return null
    },
  }
}

/**
 * CLI 源码 src/tools.ts 里有几个"懒加载工具 getter"（getTeamCreateTool /
 * getTeamDeleteTool / getSendMessageTool / getPowerShellTool）通过
 * `require('./tools/XXX/XXX.js')` 在运行时惰性加载，以打破循环依赖。
 * 这些相对路径在 Bun CLI 编译时能解析到 .ts 源；但在 Electron 打包后的
 * bundle（运行于 temp 目录的 .mjs）里，`./tools/XXX` 并不存在，一旦被调用
 * 就会抛 "Cannot find module './tools/XXX/XXX.js'"。
 * desktop 初始化 getAllBaseTools() → getTools() 会**无条件调用**
 * getSendMessageTool()，因此只在构建期把它们的安全占位替换为返回 null 即可：
 * 类型断言保留（`as typeof import(...)`），运行时返回 null，下游 createAdaptedTools
 * 对无 name / 为空的工具会跳过，不会崩溃。
 */
function hardenCliLazyRequirePlugin() {
  // 将字符串转义为正则字面量（避免 requireExpr 中的 ( ) ' . 等被当作元字符）
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // key: 模块目录名, 需要完整 replace 的 getter 文本段
  const targets: Array<{ name: string; requireExpr: string; prop: string }> = [
    { name: 'TeamCreateTool', requireExpr: "require('./tools/TeamCreateTool/TeamCreateTool.js')", prop: 'TeamCreateTool' },
    { name: 'TeamDeleteTool', requireExpr: "require('./tools/TeamDeleteTool/TeamDeleteTool.js')", prop: 'TeamDeleteTool' },
    { name: 'SendMessageTool', requireExpr: "require('./tools/SendMessageTool/SendMessageTool.js')", prop: 'SendMessageTool' },
    { name: 'PowerShellTool', requireExpr: "require('./tools/PowerShellTool/PowerShellTool.js')", prop: 'PowerShellTool' },
  ]
  return {
    name: 'harden-cli-lazy-require',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.replace(/\\/g, '/')
      // src/tools.ts（root CLI 的 tools.ts，可能带 ?commonjs-proxy 等 query）
      if (!/\/src\/tools\.ts/.test(norm)) { return null }
      let out = code
      let changed = 0
      for (const t of targets) {
        // 匹配 getter 函数体内的 require(...).Prop as typeof import(...)
        const requireLit = escapeRegExp(t.requireExpr)
        const re = new RegExp(
          `${requireLit}\\s*\\.${t.prop}\\s+as\\s+typeof\\s+import\\(['"]\\./tools/${t.name}/${t.name}\\.js['"]\\)\\.${t.prop}`,
          'g'
        )
        if (re.test(out)) {
          out = out.replace(
            re,
            `null as unknown as typeof import('./tools/${t.name}/${t.name}.js').${t.prop}`
          )
          changed++
        }
      }
      // PowerShellTool 的在 getter 函数体内，格式略有差异（return require(...)），一并处理
      const pwRe =
        /return\s*\(\s*require\('\.\/tools\/PowerShellTool\/PowerShellTool\.js'\)\s+as\s+typeof\s+import\('\.\/tools\/PowerShellTool\/PowerShellTool\.js'\)\s*\)\s*\.PowerShellTool/s
      if (pwRe.test(out)) {
        out = out.replace(pwRe, "return null as unknown as typeof import('./tools/PowerShellTool/PowerShellTool.js').PowerShellTool")
        changed++
      }
      if (changed > 0) {
        console.log(`[harden-cli-lazy-require] 安全化 src/tools.ts 的 ${changed} 组懒加载 require getter, 文件: ${id}`)
        return out
      }
      return null
    },
  }
}


export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), jsToTsResolver(), markdownTextPlugin(), dedupSafeRequirePlugin(), hardenCliLazyRequirePlugin(), optionalDepsShimPlugin()],
    ssr: {
      external: ['electron', 'electron-store', 'node-pty', 'turndown', '@mixmark-io/domino', 'he', 'highlight.js', 'cli-highlight', 'node-forge', 'better-sqlite3'],
    },
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: './src/main/entrypoint.ts' },
        output: { format: 'es', entryFileNames: '[name].mjs' },
        external: ['electron', 'electron-store', 'node-pty', 'turndown', '@mixmark-io/domino', 'he', 'highlight.js', 'cli-highlight', 'node-forge', 'better-sqlite3'],
      },
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        '@main': path.resolve(projectRoot, 'src', 'main'),
        '@commands': path.resolve(projectRoot, 'src', 'commands'),
        '@engine': path.resolve(projectRoot, 'src', 'engine'),
        '@tools': path.resolve(projectRoot, 'src', 'tools'),
        '@skills': path.resolve(projectRoot, 'src', 'skills'),
        '@utils': path.resolve(projectRoot, 'src', 'utils'),
        'bun:bundle': path.resolve(projectRoot, 'src', 'polyfills', 'bun-bundle-polyfill.ts'),
        'bun:sqlite': path.resolve(projectRoot, 'src', 'polyfills', 'bun-sqlite-polyfill.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), jsToTsResolver()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: path.resolve(projectRoot, 'src', 'preload', 'index.ts') },
        external: ['electron'],
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: { '@': path.resolve(projectRoot, 'src', 'renderer') },
    },
    plugins: [react(), jsToTsResolver()],
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: { index: path.resolve(projectRoot, 'src', 'renderer', 'index.html') } },
    },
    server: { port: 5173 },
  },
})
