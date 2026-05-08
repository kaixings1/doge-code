/**
 * 检测可能具有破坏性的 PowerShell 命令，并返回一条警告字符串以便在权限对话框中显示。
 * 这纯粹是信息性的 —— 不影响权限逻辑或自动批准。
 */

type DestructivePattern = {
  pattern: RegExp
  warning: string
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // Remove-Item 带有 -Recurse 和/或 -Force 参数（以及常见别名）
  // 锚定到语句开头（^、|、;、&、换行符、{、()），这样 `git rm --force` 就不会匹配
  // —— 使用 \b 会在任何单词边界后匹配 `rm`。`{(` 字符用于捕获脚本块/组体：
  // `{ rm -Force ./x }`。终止符仅添加了 `}`（没有 `)`）—— `}` 结束一个块，因此其后的标志属于不同的语句
  // （例如 `if {rm} else {... -Force}`），但 `)` 关闭路径分组，其后的标志仍属于该命令的标志：
  // `Remove-Item (Join-Path $r "tmp") -Recurse -Force` 仍然必须发出警告。
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Recurse\b[^|;&\n}]*-Force\b/i,
    warning: '注意：可能会递归强制删除文件',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Force\b[^|;&\n}]*-Recurse\b/i,
    warning: '注意：可能会递归强制删除文件',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Recurse\b/i,
    warning: '注意：可能会递归删除文件',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Force\b/i,
    warning: '注意：可能会强制删除文件',
  },

  // Clear-Content 作用于广泛路径
  {
    pattern: /\bClear-Content\b[^|;&\n]*\*/i,
    warning: '注意：可能会清除多个文件的内容',
  },

  // Format-Volume 和 Clear-Disk
  {
    pattern: /\bFormat-Volume\b/i,
    warning: '注意：可能会格式化磁盘卷',
  },
  {
    pattern: /\bClear-Disk\b/i,
    warning: '注意：可能会清除磁盘',
  },

  // Git 破坏性操作（与 BashTool 相同）
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    warning: '注意：可能会丢弃未提交的更改',
  },
  {
    pattern: /\bgit\s+push\b[^|;&\n]*\s+(--force|--force-with-lease|-f)\b/i,
    warning: '注意：可能会覆盖远程历史记录',
  },
  {
    pattern:
      /\bgit\s+clean\b(?![^|;&\n]*(?:-[a-zA-Z]*n|--dry-run))[^|;&\n]*-[a-zA-Z]*f/i,
    warning: '注意：可能会永久删除未跟踪的文件',
  },
  {
    pattern: /\bgit\s+stash\s+(drop|clear)\b/i,
    warning: '注意：可能会永久移除暂存的更改',
  },

  // 数据库操作
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: '注意：可能会删除或截断数据库对象',
  },

  // 系统操作
  {
    pattern: /\bStop-Computer\b/i,
    warning: '注意：将关闭计算机',
  },
  {
    pattern: /\bRestart-Computer\b/i,
    warning: '注意：将重新启动计算机',
  },
  {
    pattern: /\bClear-RecycleBin\b/i,
    warning: '注意：将永久删除回收站中的文件',
  },
]

/**
 * 检查 PowerShell 命令是否匹配已知的破坏性模式。
 * 返回人类可读的警告字符串，如果未检测到破坏性模式则返回 null。
 */
export function getDestructiveCommandWarning(command: string): string | null {
  for (const { pattern, warning } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return warning
    }
  }
  return null
}