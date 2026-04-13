/**
 * Detects potentially destructive bash commands and returns a warning string
 * for display in the permission dialog. This is purely informational — it
 * doesn't affect permission logic or auto-approval.
 */

type DestructivePattern = {
  pattern: RegExp
  warning: string
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // Git — data loss / hard to reverse
  {
    pattern: /\bgit\s+reset\s+--hard\b/,
    warning: '注意：可能会丢弃未提交的更改',
  },
  {
    pattern: /\bgit\s+push\b[^;&|\n]*[ \t](--force|--force-with-lease|-f)\b/,
    warning: '注意：可能会覆盖远程历史记录',
  },
  {
    pattern:
      /\bgit\s+clean\b(?![^;&|\n]*(?:-[a-zA-Z]*n|--dry-run))[^;&|\n]*-[a-zA-Z]*f/,
    warning: '注意：可能会永久删除未跟踪的文件',
  },
  {
    pattern: /\bgit\s+checkout\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: '注意：可能会丢弃所有工作区更改',
  },
  {
    pattern: /\bgit\s+restore\s+(--\s+)?\.[ \t]*($|[;&|\n])/,
    warning: '注意：可能会丢弃所有工作区更改',
  },
  {
    pattern: /\bgit\s+stash[ \t]+(drop|clear)\b/,
    warning: '注意：可能会永久移除暂存的更改',
  },
  {
    pattern:
      /\bgit\s+branch\s+(-D[ \t]|--delete\s+--force|--force\s+--delete)\b/,
    warning: '注意：可能会强制删除分支',
  },

  // Git — safety bypass
  {
    pattern: /\bgit\s+(commit|push|merge)\b[^;&|\n]*--no-verify\b/,
    warning: '注意：可能会跳过安全检查钩子',
  },
  {
    pattern: /\bgit\s+commit\b[^;&|\n]*--amend\b/,
    warning: '注意：可能会重写最后一次提交',
  },

  // File deletion (dangerous paths already handled by checkDangerousRemovalPaths)
  {
    pattern:
      /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR][a-zA-Z]*f|(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f[a-zA-Z]*[rR]/,
    warning: '注意：可能会递归强制删除文件',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*[rR]/,
    warning: '注意：可能会递归删除文件',
  },
  {
    pattern: /(^|[;&|\n]\s*)rm\s+-[a-zA-Z]*f/,
    warning: '注意：可能会强制删除文件',
  },

  // Database
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: '注意：可能会删除或截断数据库对象',
  },
  {
    pattern: /\bDELETE\s+FROM\s+\w+[ \t]*(;|"|'|\n|$)/i,
    warning: '注意：可能会删除数据库表中的所有行',
  },

  // Infrastructure
  {
    pattern: /\bkubectl\s+delete\b/,
    warning: '注意：可能会删除 Kubernetes 资源',
  },
  {
    pattern: /\bterraform\s+destroy\b/,
    warning: '注意：可能会销毁 Terraform 基础设施',
  },
]

/**
 * Checks if a bash command matches known destructive patterns.
 * Returns a human-readable warning string, or null if no destructive pattern is detected.
 */
export function getDestructiveCommandWarning(command: string): string | null {
  for (const { pattern, warning } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return warning
    }
  }
  return null
}
