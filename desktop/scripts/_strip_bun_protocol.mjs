// 将 dist/main/index.mjs 中的 bun: 协议导入替换为本地 polyfill，
// 使 Electron（Node ESM loader）能加载（否则报 ERR_UNSUPPORTED_ESM_URL_SCHEME 'bun:'）
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const mainOutFile = path.join(projectRoot, 'dist', 'main', 'index.mjs')

if (!fs.existsSync(mainOutFile)) {
  console.error(`index.mjs not found: ${mainOutFile}`)
  process.exit(1)
}

let codeText = fs.readFileSync(mainOutFile, 'utf-8')
const original = codeText

// 替换静态 import { feature } from 'bun:bundle'
codeText = codeText.replace(
  /import\s*\{[^}]*\bfeature\b[^}]*\}\s*from\s*['"]bun:bundle['"];?/g,
  "import { feature } from './bun-bundle-polyfill.js';"
)

// 替换静态 import { ... } from 'bun:sqlite'
codeText = codeText.replace(
  /import\s*\{[^}]*\}\s*from\s*['"]bun:sqlite['"];?/g,
  "// bun:sqlite polyfilled"
)

// 替换动态 import("bun:sqlite") -> 返回空模块
codeText = codeText.replace(
  /await\s+import\s*\(\s*['"]bun:sqlite['"]\s*\)/g,
  'await Promise.resolve({})'
)

// 兜底：替换所有剩余 'bun:' 动态导入
codeText = codeText.replace(
  /import\s*\(\s*['"]bun:[^'"]+['"]\s*\)/g,
  'Promise.resolve({})'
)

if (codeText !== original) {
  fs.writeFileSync(mainOutFile, codeText, 'utf-8')
  console.log('[strip-bun] 已替换 bun: 协议导入，Electron 可加载')
} else {
  console.log('[strip-bun] 未发现 bun: 协议导入（已是干净版本）')
}
