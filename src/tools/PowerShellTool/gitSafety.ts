/**
 * Git 可通过两种途径被武器化以逃逸沙箱：
 * 1. 裸仓库攻击：如果当前工作目录包含 HEAD + objects/ + refs/ 但没有有效的
 *    .git/HEAD 文件，Git 会将当前目录视为裸仓库并从该目录运行钩子脚本。
 * 2. Git 内部路径写入 + git 执行：复合命令先创建 HEAD/objects/refs/hooks/
 *    等目录或文件，然后再运行 git —— 此时 git 子命令会执行刚刚创建的恶意钩子。
 */

import { basename, posix, resolve, sep } from 'path'
import { getCwd } from '../../utils/cwd.js'
import { PS_TOKENIZER_DASH_CHARS } from '../../utils/powershell/parser.js'

/**
 * 如果规范化后的路径以 `../<当前目录名>/` 开头，则表示它通过父目录重新进入了当前工作目录。
 * 将其解析为相对于当前工作目录的形式。posix.normalize 会保留前导的 `..`（没有当前目录上下文），
 * 因此当当前工作目录为 /x/project 时，`../project/hooks` 仍保持为 `../project/hooks`，
 * 无法匹配 `hooks/` 前缀，尽管在运行时它会被解析到相同的目录。
 * 检查与执行的差异：验证器看到的是 `../project/hooks`，而 PowerShell 在运行时根据当前目录解析后得到 `hooks`。
 */
function resolveCwdReentry(normalized: string): string {
  if (!normalized.startsWith('../')) return normalized
  const cwdBase = basename(getCwd()).toLowerCase()
  if (!cwdBase) return normalized
  // 迭代式地剥离 `../<当前目录名>/` 对（处理像 `../../p/p/hooks` 这种当前目录名重复的情况虽不常见，
  // 但一级嵌套是常见的攻击方式）。
  const prefix = '../' + cwdBase + '/'
  let s = normalized
  while (s.startsWith(prefix)) {
    s = s.slice(prefix.length)
  }
  // 同时处理精确的 `../<当前目录名>`（末尾无斜杠）的情况
  if (s === '../' + cwdBase) return '.'
  return s
}

/**
 * 规范化 PowerShell 参数文本 → 用于 git 内部路径匹配的规范路径。
 * 顺序很重要：先进行结构性剥离（冒号绑定参数、引号、反引号转义、提供程序前缀、驱动器相对前缀），
 * 然后进行 NTFS 每个组件的尾部剥离（始终剥离空格；点号仅当空格剥离后不是 `./..` 时才剥离），
 * 接着使用 posix.normalize（解析 `..`、`.`、`//`），最后统一转为小写。
 */
function normalizeGitPathArg(arg: string): string {
  let s = arg
  // 规范化参数前缀：破折号字符（–, —, ―）和正斜杠（PowerShell 5.1）。
  // /Path:hooks/pre-commit → 提取冒号绑定的值。（缺陷 #28）
  if (s.length > 0 && (PS_TOKENIZER_DASH_CHARS.has(s[0]!) || s[0] === '/')) {
    const c = s.indexOf(':', 1)
    if (c > 0) s = s.slice(c + 1)
  }
  s = s.replace(/^['"]|['"]$/g, '')
  s = s.replace(/`/g, '')
  // PowerShell 提供程序限定的路径：FileSystem::hooks/pre-commit → hooks/pre-commit
  // 同时处理完全限定的形式：Microsoft.PowerShell.Core\FileSystem::path
  s = s.replace(/^(?:[A-Za-z0-9_.]+\\){0,3}FileSystem::/i, '')
  // 驱动器相对路径 C:foo（冒号后无分隔符）是相对于该驱动器上当前目录的路径。
  // C:\foo（带分隔符）是绝对路径，绝不能匹配 —— 负向先行断言保留了它。
  s = s.replace(/^[A-Za-z]:(?![/\\])/, '')
  s = s.replace(/\\/g, '/')
  // Win32 CreateFileW 按组件处理：迭代剥离尾部空格，然后剥离尾部点号，
  // 如果结果是 `.` 或 `..` 则停止（特殊情况）。
  // `.. ` → `..`，`.. .` → `..`，`...` → '' → `.`，`hooks .` → `hooks`。
  // 原本就是空字符串的（由前导斜杠分割产生）保持不变（作为绝对路径标记）。
  s = s
    .split('/')
    .map(c => {
      if (c === '') return c
      let prev
      do {
        prev = c
        c = c.replace(/ +$/, '')
        if (c === '.' || c === '..') return c
        c = c.replace(/\.+$/, '')
      } while (c !== prev)
      return c || '.'
    })
    .join('/')
  s = posix.normalize(s)
  if (s.startsWith('./')) s = s.slice(2)
  return s.toLowerCase()
}

const GIT_INTERNAL_PREFIXES = ['head', 'objects', 'refs', 'hooks'] as const

/**
 * 安全性：将逃逸出当前工作目录的规范化路径（前导 `../` 或绝对路径）基于实际当前工作目录进行解析，
 * 然后检查解析结果是否仍落在当前工作目录之内。如果是，则剥离当前工作目录部分，
 * 返回相对于当前工作目录的剩余部分以供前缀匹配。
 * 如果落在当前工作目录之外，则返回 null（真正的越界访问 —— 交由路径验证层处理）。
 * 涵盖了 `..\<当前目录名>\HEAD` 和 `C:\<完整当前目录>\HEAD` 的情况，而单靠 posix.normalize 无法解析这些
 * （它会让前导 `..` 保持原样）。
 *
 * 这是防范裸仓库 HEAD 攻击的 **唯一** 防线。path-validation 中的 DANGEROUS_FILES 有意排除了单独的 `HEAD`
 * （因为存在大量名为 HEAD 的合法非 git 文件，误报风险高），而 DANGEROUS_DIRECTORIES 仅匹配分段中的 `.git`。
 * 因此 `<当前目录>/HEAD` 会通过那层检查。此处的当前工作目录解析是关键的防线；
 * 除非添加替代防护措施，否则切勿移除。
 */
function resolveEscapingPathToCwdRelative(n: string): string | null {
  const cwd = getCwd()
  // 从 posix 规范化后的形式重建一个平台可解析的路径。
  // `n` 包含正斜杠（normalizeGitPathArg 已将 \\ 转换为 /）；
  // resolve() 在 Windows 上也能处理正斜杠。
  const abs = resolve(cwd, n)
  const cwdWithSep = cwd.endsWith(sep) ? cwd : cwd + sep
  // 不区分大小写的比较：normalizeGitPathArg 将 `n` 转为小写，
  // 因此 resolve() 的输出中来自 `n` 的组件是小写的，但当前工作目录可能混合大小写（例如 C:\Users\...）。
  // Windows 路径不区分大小写。
  const absLower = abs.toLowerCase()
  const cwdLower = cwd.toLowerCase()
  const cwdWithSepLower = cwdWithSep.toLowerCase()
  if (absLower === cwdLower) return '.'
  if (!absLower.startsWith(cwdWithSepLower)) return null
  return abs.slice(cwdWithSep.length).replace(/\\/g, '/').toLowerCase()
}

function matchesGitInternalPrefix(n: string): boolean {
  if (n === 'head' || n === '.git') return true
  if (n.startsWith('.git/') || /^git~\d+($|\/)/.test(n)) return true
  for (const p of GIT_INTERNAL_PREFIXES) {
    if (p === 'head') continue
    if (n === p || n.startsWith(p + '/')) return true
  }
  return false
}

/**
 * 如果参数（原始的 PowerShell 参数文本）解析为当前工作目录内的 git 内部路径，则返回 true。
 * 同时涵盖裸仓库路径（hooks/、refs/）和标准仓库路径（.git/hooks/、.git/config）。
 */
export function isGitInternalPathPS(arg: string): boolean {
  const n = resolveCwdReentry(normalizeGitPathArg(arg))
  if (matchesGitInternalPrefix(n)) return true
  // 安全性：处理 resolveCwdReentry 和 posix.normalize 无法完全解析的前导 `../` 或绝对路径。
  // 基于实际当前工作目录进行解析 —— 如果结果落回当前工作目录内的 git 内部位置，则防护仍须触发。
  if (n.startsWith('../') || n.startsWith('/') || /^[a-z]:/.test(n)) {
    const rel = resolveEscapingPathToCwdRelative(n)
    if (rel !== null && matchesGitInternalPrefix(rel)) return true
  }
  return false
}

/**
 * 如果参数解析为 .git/ 目录内的路径（标准仓库元数据目录），则返回 true。
 * 与 isGitInternalPathPS 不同，它不会匹配裸仓库风格的根目录级别路径如 `hooks/`、`refs/` 等。
 * 因为这些是常见的项目目录名称。
 */
export function isDotGitPathPS(arg: string): boolean {
  const n = resolveCwdReentry(normalizeGitPathArg(arg))
  if (matchesDotGitPrefix(n)) return true
  // 安全性：与 isGitInternalPathPS 相同的当前工作目录解析 —— 捕获
  // `..\<当前目录名>\.git\hooks\pre-commit` 这种最终落回当前工作目录的情况。
  if (n.startsWith('../') || n.startsWith('/') || /^[a-z]:/.test(n)) {
    const rel = resolveEscapingPathToCwdRelative(n)
    if (rel !== null && matchesDotGitPrefix(rel)) return true
  }
  return false
}

function matchesDotGitPrefix(n: string): boolean {
  if (n === '.git' || n.startsWith('.git/')) return true
  // NTFS 8.3 短文件名：.git 变为 GIT~1（如果存在多个以 "git" 开头的点文件，则可能是 GIT~2 等）。
  // normalizeGitPathArg 已将字符转为小写，因此检查第一个组件是否为 git~N。
  return /^git~\d+($|\/)/.test(n)
}