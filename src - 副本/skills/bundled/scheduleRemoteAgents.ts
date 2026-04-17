import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import { isPolicyAllowed } from '../../services/policyLimits/index.js'
import type { ToolUseContext } from '../../Tool.js'
import { ASK_USER_QUESTION_TOOL_NAME } from '../../tools/AskUserQuestionTool/prompt.js'
import { REMOTE_TRIGGER_TOOL_NAME } from '../../tools/RemoteTriggerTool/prompt.js'
import { getClaudeAIOAuthTokens } from '../../utils/auth.js'
import { checkRepoForRemoteAccess } from '../../utils/background/remote/preconditions.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  detectCurrentRepositoryWithHost,
  parseGitRemote,
} from '../../utils/detectRepository.js'
import { getRemoteUrl } from '../../utils/git.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  createDefaultCloudEnvironment,
  type EnvironmentResource,
  fetchEnvironments,
} from '../../utils/teleport/environments.js'
import { registerBundledSkill } from '../bundledSkills.js'

// 标签化 ID 系统使用的 Base58 字母表（Bitcoin 风格）
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/**
 * 将 mcpsrv_ 标签化的 ID 解码为 UUID 字符串。
 * 标签化 ID 格式：mcpsrv_01{base58(uuid.int)}
 * 其中 01 是版本前缀。
 *
 * TODO(public-ship): 在公开发布前，/v1/mcp_servers 端点应直接返回原始 UUID，
 * 这样我们就不需要在客户端进行解码。标签化 ID 格式是可能变更的内部实现细节。
 */
function taggedIdToUUID(taggedId: string): string | null {
  const prefix = 'mcpsrv_'
  if (!taggedId.startsWith(prefix)) {
    return null
  }
  const rest = taggedId.slice(prefix.length)
  // 跳过版本前缀（2个字符，始终为 "01"）
  const base58Data = rest.slice(2)

  // 将 base58 解码为 bigint
  let n = 0n
  for (const c of base58Data) {
    const idx = BASE58.indexOf(c)
    if (idx === -1) {
      return null
    }
    n = n * 58n + BigInt(idx)
  }

  // 转换为 UUID 十六进制字符串
  const hex = n.toString(16).padStart(32, '0')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

type ConnectorInfo = {
  uuid: string
  name: string
  url: string
}

function getConnectedClaudeAIConnectors(
  mcpClients: MCPServerConnection[],
): ConnectorInfo[] {
  const connectors: ConnectorInfo[] = []
  for (const client of mcpClients) {
    if (client.type !== 'connected') {
      continue
    }
    if (client.config.type !== 'claudeai-proxy') {
      continue
    }
    const uuid = taggedIdToUUID(client.config.id)
    if (!uuid) {
      continue
    }
    connectors.push({
      uuid,
      name: client.name,
      url: client.config.url,
    })
  }
  return connectors
}

function sanitizeConnectorName(name: string): string {
  return name
    .replace(/^claude[.\s-]ai[.\s-]/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatConnectorsInfo(connectors: ConnectorInfo[]): string {
  if (connectors.length === 0) {
    return '未找到已连接的 MCP 连接器。用户可能需要先在 https://claude.ai/settings/connectors 中连接服务器。'
  }
  const lines = ['已连接的连接器（可用于触发器）：']
  for (const c of connectors) {
    const safeName = sanitizeConnectorName(c.name)
    lines.push(
      `- ${c.name} (connector_uuid: ${c.uuid}, name: ${safeName}, url: ${c.url})`,
    )
  }
  return lines.join('\n')
}

const BASE_QUESTION = '您想通过定时远程代理执行什么操作？'

/**
 * 将设置注意事项格式化为带有项目符号的提醒块。同时用于
 * 初始 AskUserQuestion 对话框文本（无参数路径）和提示正文部分（带参数路径），
 * 确保注意事项不会被静默丢弃。
 */
function formatSetupNotes(notes: string[]): string {
  const items = notes.map(n => `- ${n}`).join('\n')
  return `⚠ 提醒：\n${items}`
}

async function getCurrentRepoHttpsUrl(): Promise<string | null> {
  const remoteUrl = await getRemoteUrl()
  if (!remoteUrl) {
    return null
  }
  const parsed = parseGitRemote(remoteUrl)
  if (!parsed) {
    return null
  }
  return `https://${parsed.host}/${parsed.owner}/${parsed.name}`
}

function buildPrompt(opts: {
  userTimezone: string
  connectorsInfo: string
  gitRepoUrl: string | null
  environmentsInfo: string
  createdEnvironment: EnvironmentResource | null
  setupNotes: string[]
  needsGitHubAccessReminder: boolean
  userArgs: string
}): string {
  const {
    userTimezone,
    connectorsInfo,
    gitRepoUrl,
    environmentsInfo,
    createdEnvironment,
    setupNotes,
    needsGitHubAccessReminder,
    userArgs,
  } = opts
  // 当用户传递了参数时，会跳过初始的 AskUserQuestion 对话框。
  // 设置注意事项必须改为在提示正文中显示，否则它们会被计算后静默丢弃（与旧版硬阻塞相比的回归）。
  const setupNotesSection =
    userArgs && setupNotes.length > 0
      ? `\n## 设置注意事项\n\n${formatSetupNotes(setupNotes)}\n`
      : ''
  const initialQuestion =
    setupNotes.length > 0
      ? `${formatSetupNotes(setupNotes)}\n\n${BASE_QUESTION}`
      : BASE_QUESTION
  const firstStep = userArgs
    ? `用户已经告诉了您他们的需求（请查看底部的用户请求）。跳过初始问题，直接进入对应的工作流程。`
    : `您的第一步必须是调用单个 ${ASK_USER_QUESTION_TOOL_NAME} 工具（无前言）。请使用以下精确字符串作为 \`question\` 字段 — 不要改写或缩短：

${jsonStringify(initialQuestion)}

设置 \`header: "操作"\` 并提供四个操作选项（创建/列表/更新/运行）。用户选择后，按照下方对应的工作流程执行。`

  return `# 定时远程代理

您正在帮助用户安排、更新、列出或运行**远程** Claude Code 代理。这些不是本地定时任务 — 每个触发器都会在 Anthropic 的云基础设施中按 cron 调度生成一个完全隔离的远程会话（CCR）。该代理运行在一个沙盒环境中，拥有自己的 git 检出、工具以及可选的 MCP 连接。

## 第一步

${firstStep}
${setupNotesSection}

## 您能做什么

使用 \`${REMOTE_TRIGGER_TOOL_NAME}\` 工具（先用 \`ToolSearch select:${REMOTE_TRIGGER_TOOL_NAME}\` 加载；身份验证在进程内处理 — 请勿使用 curl）：

- \`{action: "list"}\` — 列出所有触发器
- \`{action: "get", trigger_id: "..."}\` — 获取单个触发器
- \`{action: "create", body: {...}}\` — 创建触发器
- \`{action: "update", trigger_id: "...", body: {...}}\` — 部分更新
- \`{action: "run", trigger_id: "..."}\` — 立即运行触发器

您**无法**删除触发器。如果用户要求删除，请引导他们访问：https://claude.ai/code/scheduled

## 创建请求体结构

\`\`\`json
{
  "name": "代理名称",
  "cron_expression": "CRON表达式",
  "enabled": true,
  "job_config": {
    "ccr": {
      "environment_id": "环境ID",
      "session_context": {
        "model": "claude-sonnet-4-6",
        "sources": [
          {"git_repository": {"url": "${gitRepoUrl || 'https://github.com/组织/仓库'}"}}
        ],
        "allowed_tools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
      },
      "events": [
        {"data": {
          "uuid": "<小写 v4 UUID>",
          "session_id": "",
          "type": "user",
          "parent_tool_use_id": null,
          "message": {"content": "此处为提示内容", "role": "user"}
        }}
      ]
    }
  }
}
\`\`\`

请自行生成一个全新的小写 UUID 填入 \`events[].data.uuid\`。

## 可用的 MCP 连接器

以下是用户当前已连接的 claude.ai MCP 连接器：

${connectorsInfo}

将连接器附加到触发器时，请使用上方显示的 \`connector_uuid\` 和 \`name\`（名称已清理为仅包含字母、数字、连字符和下划线），以及连接器的 URL。\`mcp_connections\` 中的 \`name\` 字段只能包含 \`[a-zA-Z0-9_-]\` — 不允许使用点和空格。

**重要提示：** 根据用户描述推断代理需要哪些服务。例如，如果用户说“检查 Datadog 并将错误通过 Slack 发给我”，则代理需要 Datadog 和 Slack 两个连接器。请对照上述列表进行检查，如果缺少任何必需的服务，请发出警告。如果缺少必需的连接器，请引导用户前往 https://claude.ai/settings/connectors 先进行连接。

## 环境

每个触发器都需要在任务配置中指定 \`environment_id\`。这决定了远程代理的运行位置。请询问用户要使用哪个环境。

${environmentsInfo}

使用 \`id\` 值作为 \`job_config.ccr.environment_id\` 中的 \`environment_id\`。
${createdEnvironment ? `\n**注意：** 刚刚为用户创建了一个新环境 \`${createdEnvironment.name}\`（ID: \`${createdEnvironment.environment_id}\`），因为用户此前没有任何环境。请使用此 ID 作为 \`job_config.ccr.environment_id\`，并在确认触发器配置时提及此次创建。\n` : ''}

## API 字段参考

### 创建触发器 — 必需字段
- \`name\`（字符串）— 描述性名称
- \`cron_expression\`（字符串）— 5字段 cron 表达式。**最小间隔为 1 小时。**
- \`job_config\`（对象）— 会话配置（见上方结构）

### 创建触发器 — 可选字段
- \`enabled\`（布尔值，默认：true）
- \`mcp_connections\`（数组）— 要附加的 MCP 服务器：
  \`\`\`json
  [{"connector_uuid": "uuid", "name": "server-name", "url": "https://..."}]
  \`\`\`

### 更新触发器 — 可选字段
所有字段均为可选（部分更新）：
- \`name\`、\`cron_expression\`、\`enabled\`、\`job_config\`
- \`mcp_connections\` — 替换 MCP 连接
- \`clear_mcp_connections\`（布尔值）— 移除所有 MCP 连接

### Cron 表达式示例

用户本地时区为 **${userTimezone}**。Cron 表达式始终使用 UTC 时间。当用户说一个本地时间时，请将其转换为 UTC 用于 cron 表达式，但需与他们确认：“${userTimezone} 时间上午9点 = UTC 时间 X 点，因此 cron 表达式应为 \`0 X * * 1-5\`。”

- \`0 9 * * 1-5\` — 每个工作日 **UTC** 时间上午9点
- \`0 */2 * * *\` — 每 2 小时
- \`0 0 * * *\` — 每天 **UTC** 时间午夜0点
- \`30 14 * * 1\` — 每周一 **UTC** 时间下午2:30
- \`0 8 1 * *\` — 每月第一天 **UTC** 时间上午8点

最小间隔为 1 小时。\`*/30 * * * *\` 将被拒绝。

## 工作流程

### 创建新触发器：

1. **明确目标** — 询问用户希望远程代理做什么。涉及哪些仓库？什么任务？提醒他们代理是远程运行的 — 无法访问他们的本地机器、本地文件或本地环境变量。
2. **撰写提示** — 帮助他们撰写有效的代理提示。好的提示应：
   - 明确要做什么以及成功的标准是什么
   - 清晰指出要关注哪些文件/区域
   - 明确说明要执行的操作（发起 PR、提交代码、仅分析等）
3. **设置调度** — 询问运行时间和频率。用户时区为 ${userTimezone}。当用户说出时间（例如，“每天早上9点”），假设他们指的是本地时间，并将其转换为 UTC 用于 cron 表达式。务必确认转换结果：“${userTimezone} 时间上午9点 = UTC 时间 X 点。”
4. **选择模型** — 默认使用 \`claude-sonnet-4-6\`。告知用户您默认使用的模型，并询问是否需要更换。
5. **验证连接** — 根据用户描述推断代理需要哪些服务。例如，如果用户说“检查 Datadog 并将错误通过 Slack 发给我”，代理需要 Datadog 和 Slack MCP 连接器。请对照上方连接器列表进行检查。如果缺少任何连接器，请警告用户并引导他们前往 https://claude.ai/settings/connectors 先进行连接。${gitRepoUrl ? ` 默认的 git 仓库已设置为 \`${gitRepoUrl}\`。询问用户这是否是正确的仓库，或者是否需要其他仓库。` : ' 询问远程代理需要在其环境中克隆哪些 git 仓库。'}
6. **审核确认** — 在创建前展示完整配置，允许用户调整。
7. **创建** — 调用 \`${REMOTE_TRIGGER_TOOL_NAME}\` 并设置 \`action: "create"\`，展示结果。响应中包含触发器 ID。最后务必输出链接：\`https://claude.ai/code/scheduled/{TRIGGER_ID}\`

### 更新触发器：

1. 先列出触发器，让用户选择
2. 询问要更改的内容
3. 显示当前值与建议值对比
4. 确认后更新

### 列出触发器：

1. 获取并以可读格式展示
2. 显示：名称、调度（人类可读）、启用/禁用、下次运行时间、仓库

### 立即运行：

1. 如果用户未指定具体触发器，先列出
2. 确认要运行哪个触发器
3. 执行并确认

## 重要说明

- 这些是**远程**代理 — 它们在 Anthropic 的云端运行，而非用户本地机器。它们无法访问本地文件、本地服务或本地环境变量。
- 展示 cron 时始终转换为人类可读格式
- 除非用户明确说明，否则默认启用（\`enabled: true\`）
- 接受各种格式的 GitHub URL（https://github.com/org/repo、org/repo 等），并规范化为完整 HTTPS URL（不含 .git 后缀）
- 提示内容是最重要的部分 — 花时间把它写好。远程代理启动时没有任何上下文，因此提示必须自包含。
- 如需删除触发器，请引导用户访问 https://claude.ai/code/scheduled
${needsGitHubAccessReminder ? `- 如果用户的请求似乎需要 GitHub 仓库访问权限（例如克隆仓库、发起 PR、读取代码），提醒他们：${getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_lantern', false) ? "应运行 /web-setup 连接 GitHub 账户（或作为备选方案在仓库上安装 Claude GitHub App）——否则远程代理将无法访问它" : "需要在仓库上安装 Claude GitHub App——否则远程代理将无法访问它"}。` : ''}
${userArgs ? `\n## 用户请求\n\n用户说："${userArgs}"\n\n请先理解其意图，然后按照上述适用工作流程操作。` : ''}`
}

export function registerScheduleRemoteAgentsSkill(): void {
  registerBundledSkill({
    name: 'schedule',
    description:
      '创建、更新、列出或运行按 cron 调度执行的定时远程代理（触发器）。',
    whenToUse:
      '当用户想要安排定期运行的远程代理、设置自动化任务、为 Claude Code 创建定时任务，或管理他们的定时代理/触发器时使用。',
    userInvocable: true,
    isEnabled: () =>
      getFeatureValue_CACHED_MAY_BE_STALE('tengu_surreal_dali', false) &&
      isPolicyAllowed('allow_remote_sessions'),
    allowedTools: [REMOTE_TRIGGER_TOOL_NAME, ASK_USER_QUESTION_TOOL_NAME],
    async getPromptForCommand(args: string, context: ToolUseContext) {
      if (!getClaudeAIOAuthTokens()?.accessToken) {
        return [
          {
            type: 'text',
            text: '您需要先使用 claude.ai 账户进行认证。不支持 API 账户。请运行 /login 后重试 /schedule。',
          },
        ]
      }

      let environments: EnvironmentResource[]
      try {
        environments = await fetchEnvironments()
      } catch (err) {
        logForDebugging(`[schedule] 获取环境失败: ${err}`, {
          level: 'warn',
        })
        return [
          {
            type: 'text',
            text: '我们无法连接到您的远程 claude.ai 账户以设置定时任务。请稍后重试 /schedule。',
          },
        ]
      }

      let createdEnvironment: EnvironmentResource | null = null
      if (environments.length === 0) {
        try {
          createdEnvironment = await createDefaultCloudEnvironment(
            'claude-code-default',
          )
          environments = [createdEnvironment]
        } catch (err) {
          logForDebugging(`[schedule] 创建环境失败: ${err}`, {
            level: 'warn',
          })
          return [
            {
              type: 'text',
              text: '未找到远程环境，且我们无法自动创建。请访问 https://claude.ai/code 进行设置，然后再次运行 /schedule。',
            },
          ]
        }
      }

      // 软设置检查 — 作为嵌入初始 AskUserQuestion 对话框的前置说明收集。
      // 永不阻塞 — 触发器不强制要求 git 源（例如仅用于 Slack 轮询），
      // 且触发器的源可能指向与当前工作目录不同的仓库。
      const setupNotes: string[] = []
      let needsGitHubAccessReminder = false

      const repo = await detectCurrentRepositoryWithHost()
      if (repo === null) {
        setupNotes.push(
          `当前不在 git 仓库中 — 您需要手动指定仓库 URL（或完全跳过仓库）。`,
        )
      } else if (repo.host === 'github.com') {
        const { hasAccess } = await checkRepoForRemoteAccess(
          repo.owner,
          repo.name,
        )
        if (!hasAccess) {
          needsGitHubAccessReminder = true
          const webSetupEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
            'tengu_cobalt_lantern',
            false,
          )
          const msg = webSetupEnabled
            ? `${repo.owner}/${repo.name} 未连接 GitHub — 请运行 /web-setup 同步您的 GitHub 凭证，或通过 https://claude.ai/code/onboarding?magic=github-app-setup 安装 Claude GitHub App。`
            : `${repo.owner}/${repo.name} 未安装 Claude GitHub App — 如果您的触发器需要此仓库，请通过 https://claude.ai/code/onboarding?magic=github-app-setup 安装。`
          setupNotes.push(msg)
        }
      }
      // 非 github.com 主机（GHE/GitLab 等）：静默跳过。GitHub App 检查仅针对 github.com，
      // 且下方 getCurrentRepoHttpsUrl() 仍会用 GHE URL 填充 gitRepoUrl，
      // "不在 git 仓库中" 的提示实际上不正确。

      const connectors = getConnectedClaudeAIConnectors(
        context.options.mcpClients,
      )
      if (connectors.length === 0) {
        setupNotes.push(
          `未找到 MCP 连接器 — 如有需要，请在 https://claude.ai/settings/connectors 中连接。`,
        )
      }

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const connectorsInfo = formatConnectorsInfo(connectors)
      const gitRepoUrl = await getCurrentRepoHttpsUrl()
      const lines = ['可用环境：']
      for (const env of environments) {
        lines.push(
          `- ${env.name} (id: ${env.environment_id}, kind: ${env.kind})`,
        )
      }
      const environmentsInfo = lines.join('\n')
      const prompt = buildPrompt({
        userTimezone,
        connectorsInfo,
        gitRepoUrl,
        environmentsInfo,
        createdEnvironment,
        setupNotes,
        needsGitHubAccessReminder,
        userArgs: args,
      })
      return [{ type: 'text', text: prompt }]
    },
  })
}