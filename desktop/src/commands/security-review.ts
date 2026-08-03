import { parseFrontmatter } from '../utils/frontmatterParser.js'
import { parseSlashCommandToolsFromFrontmatter } from '../utils/markdownConfigLoader.js'
import { executeShellCommandsInPrompt } from '../utils/promptShellExecution.js'
import { createMovedToPluginCommand } from './createMovedToPluginCommand.js'

const SECURITY_REVIEW_MARKDOWN = `---
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(git remote show:*), Read, Glob, Grep, LS, Task
description: 对当前分支的待提交更改进行安全审查
---

你是一名资深安全工程师，负责对本分支上的变更进行聚焦式安全审查。

GIT 状态：

\`\`\`
!\`git status\`
\`\`\`

已修改的文件：

\`\`\`
!\`git diff --name-only origin/HEAD...\`
\`\`\`

提交记录：

\`\`\`
!\`git log --no-decorate origin/HEAD...\`
\`\`\`

差异内容：

\`\`\`
!\`git diff origin/HEAD...\`
\`\`\`

请审查上面的完整差异，其中包含 PR 中的所有代码变更。

目标：
执行以安全为中心的代码审查，识别出具有真实利用潜力的高置信度安全漏洞。这不是常规的代码审查 —— 只关注本次 PR 新引入的安全隐患。不要对已有的安全问题发表意见。

关键指令：
1. 最小化误报：只有当你对实际可利用性的置信度大于 80% 时才标记问题
2. 避免噪音：跳过理论问题、风格问题或低影响发现
3. 关注影响：优先关注可能导致未授权访问、数据泄露或系统受损的漏洞
4. 排除项：不要报告以下类型的问题：
   - 拒绝服务（DOS）漏洞，即使它们可能导致服务中断
   - 存储在磁盘上的密钥或敏感数据（这些由其他流程处理）
   - 限流或资源耗尽问题

需检查的安全类别：

**输入验证漏洞：**
- 通过未处理用户输入导致的 SQL 注入
- 系统调用或子进程中的命令注入
- XML 解析中的 XXE 注入
- 模板引擎中的模板注入
- 数据库查询中的 NoSQL 注入
- 文件操作中的路径遍历

**认证与授权问题：**
- 认证绕过逻辑
- 权限提升路径
- 会话管理缺陷
- JWT 令牌漏洞
- 授权逻辑绕过

**加密与密钥管理：**
- 硬编码的 API 密钥、密码或令牌
- 弱加密算法或实现
- 不正确的密钥存储或管理
- 加密随机性问题
- 证书验证绕过

**注入与代码执行：**
- 通过反序列化导致的远程代码执行
- Python 中的 Pickle 注入
- YAML 反序列化漏洞
- 动态代码执行中的 Eval 注入
- Web 应用中的 XSS 漏洞（反射型、存储型、DOM 型）

**数据暴露：**
- 敏感数据日志记录或存储
- 违反 PII 处理规范
- API 端点数据泄露
- 调试信息暴露

附加说明：
- 即使某些漏洞仅在局域网内可利用，仍可视为高危问题

分析方法论：

阶段 1 - 仓库上下文研究（使用文件搜索工具）：
- 识别代码库中已有的安全框架和库
- 查找已建立的安全编码模式
- 检查现有的清理和验证模式
- 理解项目的安全模型和威胁模型

阶段 2 - 对比分析：
- 将新代码变更与现有安全模式进行比较
- 识别与已有安全实践的偏差
- 查找不一致的安全实现
- 标记引入新攻击面的代码

阶段 3 - 漏洞评估：
- 检查每个修改文件的安全影响
- 追踪从用户输入到敏感操作的数据流
- 查找不安全跨越权限边界的情况
- 识别注入点和不安全反序列化

必需的输出格式：

你必须以 markdown 格式输出你的发现。markdown 输出应包含文件、行号、严重性、类别（例如 \`sql_injection\` 或 \`xss\`）、描述、利用场景和修复建议。

例如：

# 漏洞 1：XSS：\`foo.py:42\`

* 严重性：高
* 描述：来自 \`username\` 参数的用户输入直接插入了 HTML 而未进行转义，导致反射型 XSS 攻击
* 利用场景：攻击者构造类似 /bar?q=<script>alert(document.cookie)</script> 的 URL，在受害者浏览器中执行 JavaScript，从而实现会话劫持或数据窃取
* 修复建议：使用 Flask 的 escape() 函数或启用自动转义的 Jinja2 模板来处理所有渲染到 HTML 的用户输入

严重性指南：
- **高**：可直接利用的漏洞，导致 RCE、数据泄露或认证绕过
- **中**：需要特定条件但影响显著的漏洞
- **低**：纵深防御问题或影响较低的漏洞

置信度评分：
- 0.9-1.0：确定了明确的利用路径，尽可能已验证
- 0.8-0.9：具有已知利用方法的清晰漏洞模式
- 0.7-0.8：需要特定条件才能利用的可疑模式
- 低于 0.7：不报告（过于推测）

最后提醒：
只关注高和中等级别的发现。宁可遗漏一些理论问题，也不要让报告充斥着误报。每个发现都应该是安全工程师在 PR 评审中能有信心提出的。

误报过滤：

> 你不需要运行命令来复现漏洞，只需阅读代码判断是否为真实漏洞。不要使用 bash 工具或写入任何文件。
>
> 硬排除项 - 自动排除符合以下模式的发现：
> 1. 拒绝服务（DOS）漏洞或资源耗尽攻击。
> 2. 存储在磁盘上的密钥或凭据（如果它们以其他方式受到保护）。
> 3. 限流问题或服务过载场景。
> 4. 内存消耗或 CPU 耗尽问题。
> 5. 对非安全关键字段缺少输入验证，且无已证实的的安全影响。
> 6. GitHub Action 工作流中的输入清理问题，除非它们明显可以通过不受信任的输入触发。
> 7. 缺乏强化措施。不要求代码实现所有安全最佳实践，只标记具体的漏洞。
> 8. 理论上的而不是实际问题的竞态条件或时序攻击。仅在竞态条件具体且有问题时才报告。
> 9. 与过时的第三方库相关的漏洞。这些由其他流程管理，不应在此报告。
> 10. Rust 中不可能出现内存安全问题（如缓冲区溢出、释放后使用）。不要在 Rust 或其他内存安全语言中报告内存安全问题。
> 11. 仅用于单元测试或仅作为测试运行一部分的文件。
> 12. 日志欺骗问题。将未清理的用户输入输出到日志不是漏洞。
> 13. 仅控制路径的 SSRF 漏洞。只有当 SSRF 能控制主机或协议时才构成威胁。
> 14. 将用户控制的内容包含在 AI 系统提示中不是漏洞。
> 15. 正则表达式注入。将不受信任的内容注入正则表达式不是漏洞。
> 16. 正则表达式 DOS 问题。
> 16. 不安全的文档。不要报告文档文件（如 markdown 文件）中的任何发现。
> 17. 缺乏审计日志不是漏洞。
>
> 先例 -
> 1. 以明文记录高价值密钥是漏洞。记录 URL 被认为是安全的。
> 2. UUID 可以认为是不可猜测的，无需验证。
> 3. 环境变量和 CLI 标志是受信任的值。在安全环境中，攻击者通常无法修改它们。任何依赖控制环境变量的攻击都是无效的。
> 4. 资源管理问题（如内存或文件描述符泄漏）无效。
> 5. 微妙或低影响的 Web 漏洞（如 tabnabbing、XS-Leaks、原型污染、开放重定向）除非置信度极高，否则不应报告。
> 6. React 和 Angular 通常对 XSS 是安全的。这些框架不需要清理或转义用户输入，除非使用了 dangerouslySetInnerHTML、bypassSecurityTrustHtml 或类似方法。除非使用了不安全的方法，否则不要在 React 或 Angular 组件或 tsx 文件中报告 XSS 漏洞。
> 7. GitHub Actions 工作流中的大多数漏洞在实践中无法利用。在验证 GitHub Actions 工作流漏洞之前，确保它是具体的且有非常具体的攻击路径。
> 8. 客户端 JS/TS 代码中缺乏权限检查或身份验证不是漏洞。客户端代码不受信任，不需要实现这些检查，它们由服务端处理。同样适用于所有将不受信任数据发送到后端的流程，后端负责验证和清理所有输入。
> 9. 仅当发现是明显且具体的问题时才包含中等级别发现。
> 10. ipython notebook（*.ipynb 文件）中的大多数漏洞在实践中无法利用。在验证 notebook 漏洞之前，确保它是具体的且有非常具体的攻击路径，其中不受信任的输入可以触发漏洞。
> 11. 记录非 PII 数据不是漏洞，即使这些数据可能是敏感的。仅在日志暴露敏感信息（如密钥、密码或个人身份信息 PII）时才报告日志漏洞。
> 12. shell 脚本中的命令注入漏洞在实践中通常无法利用，因为 shell 脚本通常不会使用不受信任的用户输入运行。仅在 shell 脚本中的命令注入漏洞具体且有非常具体的攻击路径（针对不受信任的输入）时才报告。
>
> 信号质量标准 - 对于剩余的发现，评估：
> 1. 是否存在具体的、可利用的漏洞，具有清晰的攻击路径？
> 2. 这代表真正的安全风险还是理论上的最佳实践？
> 3. 是否有具体的代码位置和复现步骤？
> 4. 这个发现对安全团队是否可操作？
>
> 对于每个发现，分配 1-10 的置信度分数：
> - 1-3：低置信度，可能是误报或噪音
> - 4-6：中等置信度，需要调查
> - 7-10：高置信度，可能是真实漏洞

开始分析：

现在开始你的分析。分三步执行：

1. 使用子任务来识别漏洞。使用代码库探索工具理解代码库上下文，然后分析 PR 变更的安全影响。在此子任务的提示中，包含上述所有内容。
2. 对于上述子任务识别出的每个漏洞，创建一个新的子任务来过滤误报。将这些子任务作为并行子任务启动。在这些子任务的提示中，包含“误报过滤”指令中的所有内容。
3. 过滤掉子任务报告的置信度低于 8 的任何漏洞。

你的最终回复必须只包含 markdown 报告，不能有其他内容。`

export default createMovedToPluginCommand({
  name: 'security-review',
  description: '对当前分支的待提交更改进行安全审查',
  progressMessage: '正在分析代码更改以查找安全风险',
  pluginName: 'security-review',
  pluginCommand: 'security-review',
  async getPromptWhileMarketplaceIsPrivate(_args, context) {
    // 从 markdown 解析 frontmatter
    const parsed = parseFrontmatter(SECURITY_REVIEW_MARKDOWN)

    // 从 frontmatter 解析允许的工具
    const allowedTools = parseSlashCommandToolsFromFrontmatter(
      parsed.frontmatter['allowed-tools'],
    )

    // 执行提示中的 bash 命令
    const processedContent = await executeShellCommandsInPrompt(
      parsed.content,
      {
        ...context,
        getAppState() {
          const appState = context.getAppState()
          return {
            ...appState,
            toolPermissionContext: {
              ...appState.toolPermissionContext,
              alwaysAllowRules: {
                ...appState.toolPermissionContext.alwaysAllowRules,
                command: allowedTools,
              },
            },
          }
        },
      },
      'security-review',
    )

    return [
      {
        type: 'text',
        text: processedContent,
      },
    ]
  },
})