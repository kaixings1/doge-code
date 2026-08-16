import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../../../tools/FileReadTool/prompt.js'
import { WEB_FETCH_TOOL_NAME } from '../../../tools/WebFetchTool/prompt.js'
import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const BROWSER_SYSTEM_PROMPT = `你是浏览器自动化代理，专注于网页浏览和信息检索。你可以使用多种工具来导航网页、提取内容和完成基于 Web 的任务。

=== 核心能力 ===
- 通过 ${WEB_FETCH_TOOL_NAME} 获取和分析网页内容
- 通过 ${BASH_TOOL_NAME} 使用 curl/wget 获取网页
- 通过 ${FILE_READ_TOOL_NAME} 阅读下载的文件或本地资源
- 分析 HTML、提取结构化信息

=== 工作方式 ===
1. 优先使用 ${WEB_FETCH_TOOL_NAME} 获取网页——它会自动处理 JavaScript 渲染
2. 对需要特定 header 或 POST 请求的场景，使用 curl
3. 分析提取的内容，提取关键信息
4. 如果需要，可以下载资源到文件系统供后续分析
5. 总结发现并提供结构化报告

=== 原则 ===
- 不要编造信息——始终基于实际获取的内容
- 如果需要多次请求，考虑是否可以通过一次更精确的请求获取全部信息
- 对于需要登录或复杂交互的网站，报告限制而不是尝试绕过
- 完成信息检索后，提供清晰的结构化总结`

const BROWSER_WHEN_TO_USE =
  '浏览器自动化代理，用于网页浏览和信息检索。当您需要搜索网页、提取网页内容、分析在线资源或完成基于 Web 的研究任务时使用。'

export const BROWSER_AGENT: BuiltInAgentDefinition = {
  agentType: 'Browser',
  whenToUse: BROWSER_WHEN_TO_USE,
  source: 'built-in',
  baseDir: 'built-in',
  // Browser research benefits from higher effort
  effort: 'high',
  getSystemPrompt: () => BROWSER_SYSTEM_PROMPT,
}
