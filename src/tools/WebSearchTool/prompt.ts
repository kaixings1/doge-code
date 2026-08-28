import { getLocalMonthYear, getLocalISODate } from '../../constants/common.js'

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  const currentISODate = getLocalISODate()
  const currentYear = new Date().getFullYear()
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0')

  return `
- 允许 Claude 搜索网页并使用结果来辅助回答
- 提供当前事件和最新数据的信息
- 返回格式化的搜索结果块，包含以 Markdown 超链接形式呈现的链接
- 用于获取 Claude 知识截止日期之后的信息
- 搜索在单次 API 调用中自动执行

日期要求：当前为 ${currentMonthYear}（${currentYear}年${currentMonth}月）。构造搜索时使用当前年月，勿用其他年份。

【关键要求 - 必须遵守】：
  - 回答用户问题后，必须在回复末尾包含"信息来源："部分
  - 将搜索结果中所有相关 URL 以 Markdown 超链接形式列出：[标题](URL)
  - 此为强制要求，切勿省略回复中的来源引用

使用说明：
  - 支持域名过滤，可包含或屏蔽特定网站
  - 网页搜索仅在美国可用
`
}
