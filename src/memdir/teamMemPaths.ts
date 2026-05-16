import { lstat, realpath } from 'fs/promises'
import { dirname, join, resolve, sep } from 'path'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { getErrnoCode } from '../utils/errors.js'
import { getAutoMemPath, isAutoMemoryEnabled } from './paths.js'

/**
 * 当路径验证检测到遍历或注入尝试时抛出的错误。
 */
export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathTraversalError'
  }
}

/**
 * 通过拒绝危险模式来净化文件路径键。
 * 检查空字节、URL 编码的遍历以及其他注入向量。
 * 返回净化后的字符串，或抛出 PathTraversalError。
 */
function sanitizePathKey(key: string): string {
  // 空字节可以在基于 C 的系统调用中截断路径
  if (key.includes('\0')) {
    throw new PathTraversalError(`Null byte in path key: "${key}"`)
  }
  // URL 编码的遍历（例如 %2e%2e%2f = ../）
  let decoded: string
  try {
    decoded = decodeURIComponent(key)
  } catch {
    // 格式错误的百分号编码（例如 %ZZ、单独的 %）— 不是有效的 URL 编码，
    // 因此不可能进行 URL 编码的遍历
    decoded = key
  }
  if (decoded !== key && (decoded.includes('..') || decoded.includes('/'))) {
    throw new PathTraversalError(`URL-encoded traversal in path key: "${key}"`)
  }
  // Unicode 规范化攻击：全角 ．．／（U+FF0E U+FF0F）在 NFKC 下规范化
  // 为 ASCII ../。虽然 path.resolve/fs.writeFile 将这些视为
  // 字面字节（而非分隔符），但下游层或文件系统可能会
  // 进行规范化 — 为深度防御而拒绝（PSR M22187 向量 4）。
  const normalized = key.normalize('NFKC')
  if (
    normalized !== key &&
    (normalized.includes('..') ||
      normalized.includes('/') ||
      normalized.includes('\\') ||
      normalized.includes('\0'))
  ) {
    throw new PathTraversalError(
      `Unicode-normalized traversal in path key: "${key}"`,
    )
  }
  // 拒绝反斜杠（Windows 路径分隔符被用作遍历向量）
  if (key.includes('\\')) {
    throw new PathTraversalError(`Backslash in path key: "${key}"`)
  }
  // 拒绝绝对路径
  if (key.startsWith('/')) {
    throw new PathTraversalError(`Absolute path key: "${key}"`)
  }
  return key
}

/**
 * 团队记忆功能是否启用。
 * 团队记忆是自动记忆的子目录，因此需要自动记忆已启用。
 * 这确保当通过环境变量或设置禁用自动记忆时，所有团队记忆消费者
 *（提示词、内容注入、同步监视器、文件检测）保持一致。
 */
export function isTeamMemoryEnabled(): boolean {
  if (!isAutoMemoryEnabled()) {
    return false
  }
  return getFeatureValue_CACHED_MAY_BE_STALE('tengu_herring_clock', false)
}

/**
 * 返回团队记忆路径：<memoryBase>/projects/<sanitized-project-root>/memory/team/
 * 作为自动记忆目录的子目录存在，按项目范围隔离。
 */
export function getTeamMemPath(): string {
  return (join(getAutoMemPath(), 'team') + sep).normalize('NFC')
}

/**
 * 返回团队记忆入口点：<memoryBase>/projects/<sanitized-project-root>/memory/team/MEMORY.md
 * 作为自动记忆目录的子目录存在，按项目范围隔离。
 */
export function getTeamMemEntrypoint(): string {
  return join(getAutoMemPath(), 'team', 'MEMORY.md')
}

/**
 * 解析路径最深存在的祖先的符号链接。
 * 目标文件可能尚不存在（我们可能即将创建它），因此我们
 * 沿目录树向上走，直到 realpath() 成功，然后将不存在的尾部
 * 重新连接到已解析的祖先上。
 *
 * 安全（PSR M22186）：path.resolve() 不会解析符号链接。能够在 teamDir
 * 内部放置指向外部（例如 ~/.ssh/authorized_keys）的符号链接的攻击者，
 * 将能通过基于 resolve() 的包含性检查。对最深存在的祖先使用 realpath()
 * 可确保我们比较的是实际的文件系统位置，而非符号路径。
 *
 */
async function realpathDeepestExisting(absolutePath: string): Promise<string> {
  const tail: string[] = []
  let current = absolutePath
  // 向上遍历直到 realpath 成功。ENOENT 表示此段尚不存在；
  // 将其弹出到尾部并尝试父目录。ENOTDIR 表示路径中间存在非目录
  // 组件；弹出并重试，以便我们可以 realpath 祖先来检测符号链接逃逸。
  // 当到达文件系统根目录时循环终止（dirname('/') === '/'）。
  for (
    let parent = dirname(current);
    current !== parent;
    parent = dirname(current)
  ) {
    try {
      const realCurrent = await realpath(current)
      // 按相反顺序重新连接不存在的尾部（最深的最先弹出）
      return tail.length === 0
        ? realCurrent
        : join(realCurrent, ...tail.reverse())
    } catch (e: unknown) {
      const code = getErrnoCode(e)
      if (code === 'ENOENT') {
        // 可能是真正的不存在（安全地向上遍历）或者是一个目标不存在的
        // 悬空符号链接。悬空符号链接是一种攻击向量：
        // writeFile 会跟随链接并在 teamDir 之外创建目标文件。
        // lstat 可以区分：它对悬空符号链接成功（链接条目本身存在），
        // 对真正不存在的路径返回 ENOENT。
        try {
          const st = await lstat(current)
          if (st.isSymbolicLink()) {
            throw new PathTraversalError(
              `发现悬空符号链接（目标不存在）: "${current}"`,
            )
          }
          // lstat 成功但不是符号链接 — 祖先中存在悬空符号链接
          // 导致 realpath 返回 ENOENT。向上遍历以找到它。
        } catch (lstatErr: unknown) {
          if (lstatErr instanceof PathTraversalError) {
            throw lstatErr
          }
          // lstat 也失败了（真正不存在或无法访问）— 安全地向上遍历。
        }
      } else if (code === 'ELOOP') {
        // 符号链接环 — 文件系统状态损坏或存在恶意状态。
        throw new PathTraversalError(
          `路径中发现符号链接环: "${current}"`,
        )
      } else if (code !== 'ENOTDIR' && code !== 'ENAMETOOLONG') {
        // EACCES、EIO 等 — 无法验证路径包含关系。失败时通过包装为
        // PathTraversalError 来封闭，以便调用者可以优雅地跳过此条目，
        // 而不是中止整个批次。
        throw new PathTraversalError(
          `无法验证路径包含关系 (${code}): "${current}"`,
        )
      }
      tail.push(current.slice(parent.length + sep.length))
      current = parent
    }
  }
  // 已到达文件系统根目录但未找到存在的祖先（罕见情况 —
  // 根目录通常存在）。回退到输入；包含关系检查会拒绝。
  return absolutePath
}

/**
 * 检查真实（符号链接已解析的）路径是否在真实的 team memory 目录内。
 * 两侧均经过 realpath，因此比较的是规范的文件系统位置。
 *
 * 如果 teamDir 不存在，返回 true（跳过检查）。这是安全的：
 * 符号链接逃逸需要 teamDir 内存在预先存在的符号链接，这要求
 * teamDir 已存在。如果没有目录，就没有符号链接，
 * 第一遍的字符串级包含关系检查就足够了。
 */
async function isRealPathWithinTeamDir(
  realCandidate: string,
): Promise<boolean> {
  let realTeamDir: string
  try {
    // getTeamMemPath() 包含尾部分隔符；将其去除，因为
    // realpath() 在某些平台上会拒绝尾部分隔符。
    realTeamDir = await realpath(getTeamMemPath().replace(/[/\\]+$/, ''))
  } catch (e: unknown) {
    const code = getErrnoCode(e)
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      // Team 目录不存在 — 无法进行符号链接逃逸，跳过检查。
      return true
    }
    // 意外错误（EACCES、EIO）— 失败时封闭。
    return false
  }
  if (realCandidate === realTeamDir) {
    return true
  }
  // 前缀攻击防护：要求前缀后有分隔符，这样
  // "/foo/team-evil" 就不会匹配 "/foo/team"。
  return realCandidate.startsWith(realTeamDir + sep)
}

/**
 * 检查已解析的绝对路径是否在 team memory 目录内。
 * 使用 path.resolve() 转换相对路径并消除 .. 段，
 * 防止路径遍历攻击（例如 "team/../../etc/passwd"）。
 * 不解析符号链接 — 写入验证请使用 validateTeamMemWritePath()
 * 或 validateTeamMemKey()，它们包含符号链接解析。
 */
export function isTeamMemPath(filePath: string): boolean {
  // 安全：resolve() 转换为绝对路径并消除 .. 段，
  // 防止路径遍历攻击（例如 "team/../../etc/passwd"）
  const resolvedPath = resolve(filePath)
  const teamDir = getTeamMemPath()
  return resolvedPath.startsWith(teamDir)
}

/**
 * 验证绝对文件路径对写入 team memory 目录是安全的。
 * 如果有效，返回解析后的绝对路径。
 * 如果路径包含注入向量、通过 .. 段逃离目录或通过符号链接
 * 逃离（PSR M22186），则抛出 PathTraversalError。
 */
export async function validateTeamMemWritePath(
  filePath: string,
): Promise<string> {
  if (filePath.includes('\0')) {
    throw new PathTraversalError(`路径中发现空字节: "${filePath}"`)
  }
  // 第一遍：规范化 .. 段并检查字符串级包含关系。
  // 在接触文件系统之前，快速拒绝明显的遍历尝试。
  const resolvedPath = resolve(filePath)
  const teamDir = getTeamMemPath()
  // 前缀攻击防护：teamDir 已以 sep 结尾（来自 getTeamMemPath），
  // 因此 "team-evil/" 不会匹配 "team/"
  if (!resolvedPath.startsWith(teamDir)) {
    throw new PathTraversalError(
      `路径越界（超出 team memory 目录）: "${filePath}"`,
    )
  }
  // 第二遍：在最深存在的祖先上解析符号链接，并验证
  // 真实路径仍位于真实的 team dir 内。这捕获了 path.resolve()
  // 单独无法检测的基于符号链接的逃逸。
  const realPath = await realpathDeepestExisting(resolvedPath)
  if (!(await isRealPathWithinTeamDir(realPath))) {
    throw new PathTraversalError(
      `路径通过符号链接越界（超出 team memory 目录）: "${filePath}"`,
    )
  }
  return resolvedPath
}

/**
 * 根据 team memory 目录验证来自服务器的相对路径键。
 * 净化键，与 team dir 连接，在最深存在的祖先上解析符号链接，
 * 并验证与真实 team dir 的包含关系。
 * 返回解析后的绝对路径。
 * 如果键是恶意的（PSR M22186），则抛出 PathTraversalError。
 */
export async function validateTeamMemKey(relativeKey: string): Promise<string> {
  sanitizePathKey(relativeKey)
  const teamDir = getTeamMemPath()
  const fullPath = join(teamDir, relativeKey)
  // 第一遍：规范化 .. 段并检查字符串级包含关系。
  const resolvedPath = resolve(fullPath)
  if (!resolvedPath.startsWith(teamDir)) {
    throw new PathTraversalError(
      `键越界（超出 team memory 目录）: "${relativeKey}"`,
    )
  }
  // 第二遍：解析符号链接并验证真实的包含关系。
  const realPath = await realpathDeepestExisting(resolvedPath)
  if (!(await isRealPathWithinTeamDir(realPath))) {
    throw new PathTraversalError(
      `键通过符号链接越界（超出 team memory 目录）: "${relativeKey}"`,
    )
  }
  return resolvedPath
}

/**
 * 检查文件路径是否在 team memory 目录内且 team memory 已启用。
 */
export function isTeamMemFile(filePath: string): boolean {
  return isTeamMemoryEnabled() && isTeamMemPath(filePath)
}
