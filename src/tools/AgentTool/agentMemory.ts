import { join, normalize, sep } from 'path'
import { getProjectRoot } from '../../bootstrap/state.js'
import {
  buildMemoryPrompt,
  ensureMemoryDirExists,
} from '../../memdir/memdir.js'
import { getMemoryBaseDir } from '../../memdir/paths.js'
import { getCwd } from '../../utils/cwd.js'
import { findCanonicalGitRoot } from '../../utils/git.js'
import { sanitizePath } from '../../utils/path.js'

// 持久化代理记忆作用域：'user' (~/.claude/agent-memory/)、'project' (.claude/agent-memory/) 或 'local' (.claude/agent-memory-local/)
export type AgentMemoryScope = 'user' | 'project' | 'local'

/**
 * 净化代理类型名称以用作目录名。
 * 将冒号（在 Windows 上无效，用于插件命名空间的代理类型，
 * 如 "my-plugin:my-agent"）替换为短横线。
 */
function sanitizeAgentTypeForPath(agentType: string): string {
  return agentType.replace(/:/g, '-')
}

/**
 * 返回本地代理记忆目录，该目录是项目特定的且不纳入版本控制。
 * 当设置了 CLAUDE_CODE_REMOTE_MEMORY_DIR 时，持久化到挂载点并带项目命名空间。
 * 否则，使用 <cwd>/.claude/agent-memory-local/<agentType>/。
 */
function getLocalAgentMemoryDir(dirName: string): string {
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    const projectRoot = findCanonicalGitRoot(getProjectRoot()) ?? getProjectRoot()
    const sanitizedProjectRoot = sanitizePath(projectRoot)
    return (
      join(
        process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR,
        'projects',
        sanitizedProjectRoot || 'default-project',
        'agent-memory-local',
        dirName,
      ) + sep
    )
  }
  return join(getCwd(), '.claude', 'agent-memory-local', dirName) + sep
}

/**
 * 返回给定代理类型和作用域的代理记忆目录。
 * - 'user' 作用域：<memoryBase>/agent-memory/<agentType>/
 * - 'project' 作用域：<cwd>/.claude/agent-memory/<agentType>/
 * - 'local' 作用域：参见 getLocalAgentMemoryDir()
 */
export function getAgentMemoryDir(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  const dirName = sanitizeAgentTypeForPath(agentType)
  switch (scope) {
    case 'project':
      return join(getCwd(), '.claude', 'agent-memory', dirName) + sep
    case 'local':
      return getLocalAgentMemoryDir(dirName)
    case 'user':
      return join(getMemoryBaseDir(), 'agent-memory', dirName) + sep
  }
}

// 检查文件是否在代理记忆目录内（任何作用域）。
export function isAgentMemoryPath(absolutePath: string): boolean {
  // 安全：规范化以防止通过 .. 段绕过路径遍历
  const normalizedPath = normalize(absolutePath)
  const memoryBase = getMemoryBaseDir()

  // 用户作用域：检查记忆基础目录（可能是自定义目录或配置主目录）
  if (normalizedPath.startsWith(join(memoryBase, 'agent-memory') + sep)) {
    return true
  }

  // 项目作用域：始终基于 cwd（不重定向）
  if (
    normalizedPath.startsWith(join(getCwd(), '.claude', 'agent-memory') + sep)
  ) {
    return true
  }

  // 本地作用域：设置了 CLAUDE_CODE_REMOTE_MEMORY_DIR 时持久化到挂载点，否则基于 cwd
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    if (
      normalizedPath.includes(sep + 'agent-memory-local' + sep) &&
      normalizedPath.startsWith(
        join(process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR, 'projects') + sep,
      )
    ) {
      return true
    }
  } else if (
    normalizedPath.startsWith(
      join(getCwd(), '.claude', 'agent-memory-local') + sep,
    )
  ) {
    return true
  }

  return false
}

/**
 * 返回给定代理类型和作用域的代理记忆文件路径。
 */
export function getAgentMemoryEntrypoint(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  return join(getAgentMemoryDir(agentType, scope), 'MEMORY.md')
}

export function getMemoryScopeDisplay(
  memory: AgentMemoryScope | undefined,
): string {
  switch (memory) {
    case 'user':
      return `User (${join(getMemoryBaseDir(), 'agent-memory')}/)`
    case 'project':
      return 'Project (.claude/agent-memory/)'
    case 'local':
      return `Local (${getLocalAgentMemoryDir('...')})`
    default:
      return 'None'
  }
}

/**
 * 为启用了记忆的代理加载持久化记忆。
 * 如果需要则创建记忆目录，并返回包含记忆内容的提示词。
 *
 * @param agentType 代理的类型名称（用作目录名）
 * @param scope 'user' 对应 ~/.claude/agent-memory/，或 'project' 对应 .claude/agent-memory/
 */
export function loadAgentMemoryPrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  let scopeNote: string
  switch (scope) {
    case 'user':
      scopeNote =
        '- Since this memory is user-scope, keep learnings general since they apply across all projects'
      break
    case 'project':
      scopeNote =
        '- Since this memory is project-scope and shared with your team via version control, tailor your memories to this project'
      break
    case 'local':
      scopeNote =
        '- Since this memory is local-scope (not checked into version control), tailor your memories to this project and machine'
      break
  }

  const memoryDir = getAgentMemoryDir(agentType, scope)

  // 即发即弃：此代码在代理生成时的同步 getSystemPrompt() 回调中运行
  //（从 AgentDetail.tsx 的 React 渲染中调用，因此不能是异步的）。
  // 生成的代理在完整的 API 往返之前不会尝试写入，届时 mkdir 已完成。
  // 即使尚未完成，FileWriteTool 也会自行对父目录执行 mkdir。
  void ensureMemoryDirExists(memoryDir)

  const coworkExtraGuidelines =
    process.env.CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES
  return buildMemoryPrompt({
    displayName: 'Persistent Agent Memory',
    memoryDir,
    extraGuidelines:
      coworkExtraGuidelines && coworkExtraGuidelines.trim().length > 0
        ? [scopeNote, coworkExtraGuidelines]
        : [scopeNote],
  })
}
