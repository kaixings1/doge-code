import { BROWSER_TOOLS } from '@ant/claude-for-chrome-mcp'
import { BASE_CHROME_PROMPT } from '../../../utils/claudeInChrome/prompt.js'
import { shouldAutoEnableClaudeInChrome } from '../../../utils/claudeInChrome/setup.js'
import { registerBundledSkill } from '../bundledSkills.js'

const CLAUDE_IN_CHROME_MCP_TOOLS = BROWSER_TOOLS.map(
  tool => `mcp__claude-in-chrome__${tool.name}`,
)

const SKILL_ACTIVATION_MESSAGE = `
现在此技能已被调用，你可以访）Chrome 浏览器自动化工具。你现在可以使用 mcp__claude-in-chrome__* 工具与网页交互。

重要提示：首先调）mcp__claude-in-chrome__tabs_context_mcp 获取用户当前浏览器标签页的信息。
`

export function registerClaudeInChromeSkill(): void {
  registerBundledSkill({
    name: 'claude-in-chrome',
    description:
      '自动）Chrome 浏览器与网页交互——点击元素、填写表单、截取截图、读取控制台日志和导航网站。在现有 Chrome 会话的新标签页中打开页面。执行前需要站点级权限（在扩展中配置））,
    whenToUse:
      '当用户想要与网页交互、自动化浏览器任务、截取截图、读取控制台日志或执行任何基于浏览器的操作时，始终使用。在任何 mcp__claude-in-chrome__* 工具使用前必须先调用此技能）,
    allowedTools: CLAUDE_IN_CHROME_MCP_TOOLS,
    userInvocable: true,
    isEnabled: () => shouldAutoEnableClaudeInChrome(),
    async getPromptForCommand(args) {
      let prompt = `${BASE_CHROME_PROMPT}\n${SKILL_ACTIVATION_MESSAGE}`
      if (args) {
        prompt += `\n## Task\n\n${args}`
      }
      return [{ type: 'text', text: prompt }]
    },
  })
}
