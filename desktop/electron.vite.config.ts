import * as path from 'path'
import * as fs from 'node:fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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
    const searchRoots = [projectRoot, repoRoot]
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
function dedupTopLevelSymbolPlugin() {
  // 针对已知"顶层重复声明"（Bun 容忍、esbuild 报 "already been declared"）做去重。
  // 配置：[文件名后缀正则, { 唯一标识文本, 替换后保留原文给第一个、重命名后续 }]
  const cases: Array<{
    match: RegExp
    marker: string      // 声明行的唯一标识（精确文本）
    replacement: (m: string) => string   // 把后续出现的声明改名为唯一名
    label: string
  }> = [
    {
      match: /src\/commands\.ts$/,
      marker: 'function safeRequire<T>(path: string): T | null {',
      replacement: () => 'function _safeRequireDupArchive<T>(path: string): T | null {',
      label: 'commands.ts safeRequire',
    },
    {
      match: /src\/utils\/modelCost\.ts$/,
      marker: 'const DEFAULT_UNKNOWN_MODEL_COST = COST_TIER_5_25',
      replacement: () => 'const _DEFAULT_UNKNOWN_MODEL_COST_DUP = COST_TIER_5_25',
      label: 'modelCost.ts DEFAULT_UNKNOWN_MODEL_COST',
    },
  ]
  return {
    name: 'dedup-top-level-symbol',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.replace(/\\/g, '/')
      const c = cases.find(x => x.match.test(norm))
      if (!c) return null
      let out = code
      let count = 0
      let firstIdx = out.indexOf(c.marker)
      if (firstIdx === -1) return null
      // 从第一个之后查找重复（真正重复的与第一个文本相同或近似）
      const secondIdx = out.indexOf(c.marker, firstIdx + c.marker.length)
      if (secondIdx === -1) return null
      // 把第二次出现的声明重命名为唯一名（不改变语义：调用绑定到第一个）
      out = out.slice(0, secondIdx) + c.replacement(c.marker) + out.slice(secondIdx + c.marker.length)
      count++
      if (count > 0) {
        console.log(`[dedup-top-level] 重命名 ${c.label} (${count} 处), 文件: ${id}`)
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

/**
 * CLI 源码 src/engine/autoFixLoop.ts 里有一些正则字面量形如
 *   /expected\s*')'/i
 * 这种在 Bun/TS 里合法（正则字面量中的单引号是字面字符），但 esbuild 的
 * 严格语法解析会把其中的 `)` 误判为正则闭合而产生 "Unexpected ) in regular
 * expression" 硬错误，导致 desktop 构建中断。由于不允许改 src，此插件在
 * desktop 构建期把这类正则字面量中的引号转义为 `\'`（语义不变，均为字面引号），
 * 让 esbuild 能正常解析。
 */
function hardenCliRegexPlugin() {
  return {
    name: 'harden-cli-regex',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.replace(/\\/g, '/')
      if (!/\/src\/engine\/autoFixLoop\.ts$/.test(norm)) return null
      // 精确替换形如 /expected\s*'...'/ 或 /expected\s*\)'...'/ 的正则字面量，
      // 把引号字符和其间可能被 esbuild 误解析的字符转义为 \'（语义不变，均为字面引号）。
      // 覆盖 ) ( 等可能被 esbuild 误解析的字符，按原意保留字面引号匹配。
      // 注意：\s* 后可能紧跟 '（如 \s*';'），也可能有转义字符后跟 '（如 \s*\)'），
      // 因此需要捕获中间的可选转义字符序列。
      const original = code
      code = code.replace(/(\\s\*)((?:\\[a-zA-Z])*?)(['])([^'\n]*)(['])(\/i)/g, (_m, a, escSeq, q1, mid, q2, tail) => {
        // 转义 escSeq 中可能被 esbuild 误解析的字符（如 )），同时保留原始转义前缀
        const safeEscSeq = escSeq.replace(/[()<>{}\]]/g, (ch) => '\\' + ch)
        // 转义 mid 中可能被 esbuild 误解析的字符
        return a + safeEscSeq + "'" + mid.replace(/[()<>{}\]]/g, (ch) => '\\' + ch) + "'" + tail
      })
      if (code !== original) {
        console.log(`[harden-cli-regex] 修复 autoFixLoop.ts 中的正则字面量引号转义, 文件: ${id}`)
        return code
      }
      return null
    },
  }
}

/**
 * root CLI 的 src/commands/bridge-sessions/bridge.tsx 引用了
 * `import { ..., setupSSHTunnel } from '../../services/bridgeSessions/sessionManager.js'`，
 * 但 sessionManager.ts 里实际导出的是 `setupRealSSHTunnel`（参数签名兼容）。
 * Bun 打包 CLI 时不校验命名导出（运行时该功能分支不常用所以未被发现），
 * 但 vite/rollup 严格校验会以 "setupSSHTunnel is not exported" 硬报错。
 * 此插件在 desktop 构建期把 bridge.tsx 的该命名导入改写为别名到 setupRealSSHTunnel，
 * 不改动任何 src 文件。
 */
function hardenBridgeSshImportPlugin() {
  return {
    name: 'harden-bridge-ssh-import',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.replace(/\\/g, '/')
      if (!/\/src\/commands\/bridge-sessions\/bridge\.tsx$/.test(norm)) return null
      let original = code
      // 把“从 sessionManager import 的 setupSSHTunnel”改写为别名导入 setupRealSSHTunnel
      // （实现里实际导出的是 setupRealSSHTunnel，bridge.tsx 曾引用不存在的 setupSSHTunnel)。
      // 幂等：若源码已是 setupRealSSHTunnel as setupSSHTunnel 形式则不再改写，避免重复别名。
      if (!/\bsetupRealSSHTunnel\s+as\s+setupSSHTunnel\b/.test(code)) {
        const importMarker = /from\s*['"]\.\.\/\.\.\/services\/bridgeSessions\/sessionManager\.js['"]/
        if (importMarker.test(code)) {
          // 逐条重写 import 语句，把花括号内的裸 setupSSHTunnel 成员改写为别名导入
          code = code.replace(/import\s*\{[^}]*?setupSSHTunnel[^}]*?\}\s*from\s*['"]\.\.\/\.\.\/services\/bridgeSessions\/sessionManager\.js['"]/g, (stmt) => {
            // 仅把成员名 setupSSHTunnel 替换为 setupRealSSHTunnel as setupSSHTunnel
            return stmt.replace(/(^|[,{]\s*)setupSSHTunnel(\s*[,}])/g, (_m, pre, post) => pre + 'setupRealSSHTunnel as setupSSHTunnel' + post)
          })
        }
      }
      // 清理该文件源码中的非法 Unicode 替换符（U+FFFD ?）：它们通常是损坏的
      // 缩进/空白字符，Bun 能容忍但 esbuild 会报 "Unexpected ?"。
      if (code.includes('\uFFFD')) {
        code = code.split('\uFFFD').join(' ')
      }
      // bridge.tsx:468 的 JSX 文本里有裸的 `>`（`...sshPort} -> 本地端口 ...`），
      // JSX 文本中 `>` 必须是 `&gt;`，否则 esbuild 报 "> is not valid inside a JSX element"。
      if (code.includes('} -> 本地端口') || /\}\s*-{1,2}>\s*本地端口/.test(code)) {
        code = code.replace(/\}(\s*)-{1,2}>\s*本地端口/g, '} &gt; 本地端口')
      }
      if (code !== original) {
        console.log(`[harden-bridge-ssh] 修复 bridge.tsx 的 SSHS import/JSX/Unicode 兼容问题, 文件: ${id}`)
        return code
      }
      return null
    },
  }
}


// 补丁：root CLI 的 src/utils/attributionHooks.ts 导入 ../debug.js，
// 但 debug.ts 实际在 src/utils/debug.ts（同目录），jsToTsResolver 找不到。
// 此插件在构建期将 ../debug.js 重定向到 ./debug.js。
function attributionDebugShimPlugin() {
  return {
    name: 'attribution-debug-shim',
    enforce: 'pre',
    resolveId(source, importer) {
      // 匹配所有 ../debug.js 导入（source 可能是 '../debug.js' 或绝对路径结尾）
      if (!source.endsWith('debug.js') || source.includes('node_modules')) return null
      // 仅在 importer 路径包含 attributionHooks 时介入
      if (!importer || !importer.replace(/\\/g, '/').includes('attributionHooks')) return null
      const dir = path.dirname(importer)
      // ../debug.js 在 src/utils/ 下实际应指向同目录的 debug.ts
      const target = path.join(dir, 'debug.ts')
      if (fs.existsSync(target)) {
        console.log(`[attribution-debug-shim] 重定向 ${source} -> ${target}`)
        return { id: target }
      }
      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), jsToTsResolver(), attributionDebugShimPlugin(), markdownTextPlugin(), dedupTopLevelSymbolPlugin(), hardenCliLazyRequirePlugin(), hardenCliRegexPlugin(), hardenBridgeSshImportPlugin(), optionalDepsShimPlugin()],
    ssr: {
      external: ['electron', 'electron-store', 'node-pty', 'turndown', '@mixmark-io/domino', 'he', 'highlight.js', 'cli-highlight', 'node-forge', 'better-sqlite3', 'zod', 'zod/v4', 'audio-capture-napi', 'image-processor-napi', 'modifiers-napi', 'url-handler-napi', 'color-diff-napi'],
    },
    build: {
      outDir: 'dist/main',
      esbuildOptions: {
        define: {
          __dirname: 'path.dirname(fileURLToPath(import.meta.url))',
          __filename: 'fileURLToPath(import.meta.url)',
        },
      },
      rollupOptions: {
        input: { index: './src/main/entrypoint.ts' },
        output: { format: 'es', entryFileNames: '[name].mjs' },
        external: ['electron', 'electron-store', 'node-pty', 'turndown', '@mixmark-io/domino', 'he', 'highlight.js', 'cli-highlight', 'node-forge', 'better-sqlite3', 'zod', 'zod/v4', 'audio-capture-napi', 'image-processor-napi', 'modifiers-napi', 'url-handler-napi', 'color-diff-napi'],
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
        // preload 必须输出 CommonJS（.cjs）。package.json 的 "type":"module" 会让
        // electron-vite 默认输出 ESM(.mjs)，而 Electron 渲染进程加载 ESM preload
        // 有兼容限制，且主进程 index.ts 引用的路径也与 .mjs 不匹配。
        // 这里强制 CJS，并让入口文件名与主进程引用(desktop/src/main/index.ts:183)一致。
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
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
      esbuildOptions: {
        external: ['fs', 'path', 'node:fs', 'node:path'],
      },
      rollupOptions: {
        input: { index: path.resolve(projectRoot, 'src', 'renderer', 'index.html') },
      },
    },
    server: { port: 5173 },
  },
})
