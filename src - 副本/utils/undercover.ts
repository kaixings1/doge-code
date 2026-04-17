/**
 * 隐身模式 — 为向公共/开源仓库贡献代码提供安全保障。
 *
 * 激活后，Claude Code 会在提交/PR 提示中添加安全指引，并移除所有归属信息，
 * 以避免泄露内部模型代号、项目名称或其他 Anthropic 内部信息。模型自身也不会被告知具体身份。
 *
 * 激活方式：
 *   - CLAUDE_CODE_UNDERCOVER=1 — 强制开启（即使在内部仓库中）
 *   - 否则自动判断：除非仓库远程地址与内部允许列表（commitAttribution.ts 中的 INTERNAL_MODEL_REPOS）
 *     匹配，否则保持激活。安全的默认状态为开启 — Claude 可能从不是 git 检出目录的工作路径
 *     （例如 /tmp 崩溃复现目录）向公共远程仓库推送。
 *   - 没有强制关闭选项。这是为了防止模型代号泄露 — 只要无法确认处于内部仓库中，就保持隐身状态。
 *
 * 所有代码路径都受 `process.env.USER_TYPE === 'ant'` 条件约束。由于 `USER_TYPE` 是构建时的 `--define`，
 * 打包工具会对这些检查进行常量折叠，并在外部构建中移除 ant 专有分支。在外部构建中，本文件的每个函数都会简化为简单返回。
 */

import { getRepoClassCached } from './commitAttribution.js'
import { getGlobalConfig } from './config.js'
import { isEnvTruthy } from './envUtils.js'

export function isUndercover(): boolean {
  if (process.env.USER_TYPE === 'ant') {
    if (isEnvTruthy(process.env.CLAUDE_CODE_UNDERCOVER)) return true
    // 自动模式：除非已明确确认处于允许列表中的内部仓库，否则保持激活。
    // 'external'、'none' 和 null（尚未执行检查）均视为开启。
    // 检查在 setup.ts 中初始化；只有 'internal' 才关闭。
    return getRepoClassCached() !== 'internal'
  }
  return false
}

export function getUndercoverInstructions(): string {
  if (process.env.USER_TYPE === 'ant') {
    return `## 隐身模式 — 至关重要

您当前正在公共/开源仓库中以**隐身模式**运行。您的提交信息、PR 标题和 PR 正文**不得包含任何** Anthropic 内部信息。
切勿暴露身份。

提交信息或 PR 描述中绝对禁止包含：
- 内部模型代号（例如 Capybara、Tengu 等动物名称）
- 尚未发布的模型版本号（例如 opus-4-7、sonnet-4-8）
- 内部仓库或项目名称（例如 claude-cli-internal、anthropics/…）
- 内部工具、Slack 频道或短链接（例如 go/cc、#claude-code-…）
- "Claude Code" 字样或任何表明您是 AI 的表述
- 任何关于您所用模型或版本的暗示
- Co-Authored-By 行或任何其他归属信息

请像人类开发者那样撰写提交信息 — 仅描述代码变更内容。

正确示例：
- "修复文件监视器初始化中的竞态条件"
- "添加自定义按键绑定支持"
- "重构解析器以改进错误消息"

错误示例（绝不可用）：
- "修复与 Claude Capybara 测试时发现的错误"
- "由 claude-opus-4-6 一次性生成"
- "使用 Claude Code 生成"
- "Co-Authored-By: Claude Opus 4.6 <…>"
`
  }
  return ''
}

/**
 * 检查是否应显示隐身模式自动激活的一次性说明对话框。
 * 当满足以下条件时返回 true：隐身模式通过自动检测激活（而非环境变量强制开启），
 * 且用户尚未查看过该通知。该函数为纯函数 — 组件挂载时会自行标记该标志。
 */
export function shouldShowUndercoverAutoNotice(): boolean {
  if (process.env.USER_TYPE === 'ant') {
    // 如果是通过环境变量强制开启，用户已知情；无需提醒。
    if (isEnvTruthy(process.env.CLAUDE_CODE_UNDERCOVER)) return false
    if (!isUndercover()) return false
    if (getGlobalConfig().hasSeenUndercoverAutoNotice) return false
    return true
  }
  return false
}