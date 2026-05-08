import { getLocalMonthYear } from '../../constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- 允许 Claude 搜索网页并使用结果来辅助回答
- 提供当前事件和最新数据的最新信息
- 返回格式化的搜索结果块，包含以 Markdown 超链接形式呈现的链接
- 用于获取 Claude 知识截止日期之后的信息
- 搜索在单次 API 调用中自动执行

【关键要求 - 必须遵守】：
  - 回答用户问题后，必须在回复末尾包含“信息来源：”部分
  - 在信息来源部分，将搜索结果中所有相关 URL 以 Markdown 超链接形式列出：[标题](URL)
  - 此为强制要求，切勿省略回复中的来源引用
  - 示例格式：

    [您的回答内容]

    信息来源：
    - [来源标题 1](https://example.com/1)
    - [来源标题 2](https://example.com/2)

使用说明：
  - 支持域名过滤，可包含或屏蔽特定网站
  - 网页搜索仅在美国可用

【重要提示 - 搜索时使用正确的年份】：
  - 当前月份为 ${currentMonthYear}。搜索最新信息、文档或时事时，必须使用当前年份。
  - 例如：如果用户需要“最新 React 文档”，应使用当前年份搜索“React 文档”，而非去年。
`
}