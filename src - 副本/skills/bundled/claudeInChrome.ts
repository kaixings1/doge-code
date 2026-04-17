import { BROWSER_TOOLS } from '@ant/claude-for-chrome-mcp'
import { BASE_CHROME_PROMPT } from '../../utils/claudeInChrome/prompt.js'
import { shouldAutoEnableClaudeInChrome } from '../../utils/claudeInChrome/setup.js'
import { registerBundledSkill } from '../bundledSkills.js'

const CLAUDE_IN_CHROME_MCP_TOOLS = BROWSER_TOOLS.map(
  tool => `mcp__claude-in-chrome__${tool.name}`,
)

const SKILL_ACTIVATION_MESSAGE = `
现在此技能已被调用，你可以使用 Chrome 浏览器自动化工具。现在可以使用 mcp__claude-in-chrome__* 工具与网页进行交互。

重要提示：首先调用 mcp__claude-in-chrome__tabs_context_mcp 来获取有关用户当前浏览器标签页的信息。
`

export function registerClaudeInChromeSkill(): void {
  registerBundledSkill({
    name: 'claude-in-chrome',
    description:
      '自动化你的 Chrome 浏览器以与网页交互——点击元素、填写表单、捕获截图、读取控制台日志以及在网站间导航。在你现有的 Chrome 会话中的新标签页中打开页面。需要在执行前获得站点级权限（在扩展程序中配置）。',
    whenToUse:
      '当用户想要与网页交互、自动化浏览器任务、捕获截图、读取控制台日志或执行任何基于浏览器的操作时。在尝试使用任何 mcp__claude-in-chrome__* 工具之前务必先调用此技能。',
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
