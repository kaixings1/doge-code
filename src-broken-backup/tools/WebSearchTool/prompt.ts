import { getLocalMonthYear } from '../../../../constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- 允许 Claude 搜索网页并使用结果为响应提供信息
- 为当前事件和近期数据提供最新信。
- 返回搜索结果信息，格式为搜索结果块，包括链接）markdown 超链。
- 使用此工具访问超）Claude 知识截止日期的信。
- 搜索在单）API 调用中自动执。

关键要求 —）你必须遵循：
  - 在回答用户问题后，你必须在响应末尾包）来源）部分
  - 在来源部分，列出所有相）URL 作为 markdown 超链接：[标题](URL)
  - 这是强制性的 —）绝不要在响应中省略来。
  - 示例格式。

    [你的回答在这里]

    来源。
    - [来源标题 1](https://example.com/1)
    - [来源标题 2](https://example.com/2)

使用说明。
  - 支持域名过滤以包含或屏蔽特定网站
  - 网页搜索仅在美国可用

重要提示 —）在搜索查询中使用正确的年份：
  - 当前月份）${currentMonthYear}。在搜索最近的信息、文档或当前事件时，你必须使用这个年份。
  - 例如：如果用户要）最新的 React 文档"，搜）React 文档"加上当前年份，而不是去。
`
}
