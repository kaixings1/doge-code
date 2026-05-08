import type { ZodIssueCode } from 'zod/v4'

// v4 ZodIssueCode is a value, not a type - use typeof to get the type
type ZodIssueCodeType = (typeof ZodIssueCode)[keyof typeof ZodIssueCode]

export type ValidationTip = {
  suggestion?: string
  docLink?: string
}

export type TipContext = {
  path: string
  code: ZodIssueCodeType | string
  expected?: string
  received?: unknown
  enumValues?: string[]
  message?: string
  value?: unknown
}

type TipMatcher = {
  matches: (context: TipContext) => boolean
  tip: ValidationTip
}

const DOCUMENTATION_BASE = 'https://code.claude.com/docs/en'

const TIP_MATCHERS: TipMatcher[] = [
  {
    matches: (ctx): boolean =>
      ctx.path === 'permissions.defaultMode' && ctx.code === 'invalid_value',
    tip: {
      suggestion:
        '有效模式："acceptEdits"（文件更改前询问）、"plan"（仅分析）、"bypassPermissions"（自动接受所有）或 "default"（标准行为）',
      docLink: `${DOCUMENTATION_BASE}/iam#permission-modes`,
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.path === 'apiKeyHelper' && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        '提供一个 shell 命令，该命令将 API 密钥输出到标准输出。脚本应仅输出 API 密钥。示例："/bin/generate_temp_api_key.sh"',
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.path === 'cleanupPeriodDays' &&
      ctx.code === 'too_small' &&
      ctx.expected === '0',
    tip: {
      suggestion:
        '必须为 0 或更大。设置正数以保留会话记录（默认为 30 天）。设置为 0 将完全禁用会话持久性：不写入会话记录，并在启动时删除现有记录。',
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.path.startsWith('env.') && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        '环境变量必须是字符串。将数字和布尔值用引号包裹。示例："DEBUG": "true", "PORT": "3000"',
      docLink: `${DOCUMENTATION_BASE}/settings#environment-variables`,
    },
  },
  {
    matches: (ctx): boolean =>
      (ctx.path === 'permissions.allow' || ctx.path === 'permissions.deny') &&
      ctx.code === 'invalid_type' &&
      ctx.expected === 'array',
    tip: {
      suggestion:
        '权限规则必须是数组。格式：["Tool(specifier)"]。示例：["Bash(npm run build)", "Edit(docs/**)", "Read(~/.zshrc)"]。使用 * 作为通配符。',
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.path.includes('hooks') && ctx.code === 'invalid_type',
    tip: {
      suggestion:
        // gh-31187 / CC-282: prior example showed {"matcher": {"tools": ["BashTool"]}}
        // — an object format that never existed in the schema (matcher is z.string(),
        // always has been). Users copied the tip's example and got the same validation
        // error again. See matchesPattern() in hooks.ts: matcher is exact-match,
        // pipe-separated ("Edit|Write"), or regex. Empty/"*" matches all.
        'Hooks 使用匹配器 + hooks 数组。匹配器是字符串：工具名称（"Bash"）、管道分隔列表（"Edit|Write"）或留空以匹配所有。示例：{"PostToolUse": [{"matcher": "Edit|Write", "hooks": [{"type": "command", "command": "echo Done"}]}]}',
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.code === 'invalid_type' && ctx.expected === 'boolean',
    tip: {
      suggestion:
        '使用 true 或 false，无需引号。示例："includeCoAuthoredBy": true',
    },
  },
  {
    matches: (ctx): boolean => ctx.code === 'unrecognized_keys',
    tip: {
      suggestion:
        '检查拼写错误或参阅文档以获取有效字段',
      docLink: `${DOCUMENTATION_BASE}/settings`,
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.code === 'invalid_value' && ctx.enumValues !== undefined,
    tip: {
      suggestion: undefined,
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.code === 'invalid_type' &&
      ctx.expected === 'object' &&
      ctx.received === null &&
      ctx.path === '',
    tip: {
      suggestion:
        '检查是否缺少逗号、括号不匹配或存在尾随逗号。使用 JSON 验证器来识别确切的语法错误。',
    },
  },
  {
    matches: (ctx): boolean =>
      ctx.path === 'permissions.additionalDirectories' &&
      ctx.code === 'invalid_type',
    tip: {
      suggestion:
        '必须是目录路径数组。示例：["~/projects", "/tmp/workspace"]。你也可以使用 --add-dir 标志或 /add-dir 命令',
      docLink: `${DOCUMENTATION_BASE}/iam#working-directories`,
    },
  },
]

const PATH_DOC_LINKS: Record<string, string> = {
  permissions: `${DOCUMENTATION_BASE}/iam#configuring-permissions`,
  env: `${DOCUMENTATION_BASE}/settings#environment-variables`,
  hooks: `${DOCUMENTATION_BASE}/hooks`,
}

export function getValidationTip(context: TipContext): ValidationTip | null {
  const matcher = TIP_MATCHERS.find(m => m.matches(context))

  if (!matcher) return null

  const tip: ValidationTip = { ...matcher.tip }

  if (
    context.code === 'invalid_value' &&
    context.enumValues &&
    !tip.suggestion
  ) {
    tip.suggestion = `Valid values: ${context.enumValues.map(v => `"${v}"`).join(', ')}`
  }

  // Add documentation link based on path prefix
  if (!tip.docLink && context.path) {
    const pathPrefix = context.path.split('.')[0]
    if (pathPrefix) {
      tip.docLink = PATH_DOC_LINKS[pathPrefix]
    }
  }

  return tip
}
