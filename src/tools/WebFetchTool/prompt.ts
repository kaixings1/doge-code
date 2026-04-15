export const WEB_FETCH_TOOL_NAME = 'WebFetch'

export const DESCRIPTION = `
- 从指定 URL 获取内容，并使用 AI 模型进行处理
- 以 URL 和提示作为输入
- 获取 URL 内容，将 HTML 转换为 Markdown
- 使用一个小型、快速的模型通过提示处理内容
- 返回模型关于内容的响应
- 当你需要检索和分析网页内容时使用此工具

使用注意：
  - 重要：如果有可用的 MCP 提供的网页获取工具，优先使用该工具，因为它可能限制更少。
  - URL 必须是完全有效的 URL
  - HTTP URL 将自动升级为 HTTPS
  - 提示应该描述你想从页面中提取什么信息
  - 此工具是只读的，不会修改任何文件
  - 如果内容非常大，结果可能会被总结
  - 内置了 15 分钟的自清洁缓存，重复访问相同 URL 时响应更快
  - 当 URL 重定向到不同的主机时，工具会通知你并提供重定向 URL。然后你应该使用重定向 URL 发送新的 WebFetch 请求来获取内容。
  - 对于 GitHub URL，优先使用 Bash 中的 gh CLI（例如 gh pr view、gh issue view、gh api）。
`

export function makeSecondaryModelPrompt(
  markdownContent: string,
  prompt: string,
  isPreapprovedDomain: boolean,
): string {
  const guidelines = isPreapprovedDomain
    ? `根据以上内容提供简洁的响应。根据需要包含相关细节、代码示例和文档摘录。`
    : `仅根据以上内容提供简洁的响应。在你的响应中：
 - 对任何来源文档的引用严格限制在 125 个字符以内。开源软件可以，只要尊重许可证。
 - 使用引号表示文章中的原话；引号之外的任何内容绝不应该与原文逐字相同。
 - 你不是律师，绝不要评论你自己的提示和响应的合法性。
 - 绝不要生成或复制歌曲歌词。`

  return `
网页内容：
---
${markdownContent}
---

${prompt}

${guidelines}
`
}
