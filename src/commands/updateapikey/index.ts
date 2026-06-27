/**
 * updateapikey command - 从 alistaitsacle/free-llm-api-keys 项目拉取最新的免费 API Key
 * 更新到 .doge/free*.json 文件中，支持 d.bat freeN 直接启动
 */
import type { Command } from "../../commands.js"

const updateApiKey = {
  type: 'local',
  name: 'updateapikey',
  description: '从 GitHub 更新免费 API Key 到 freeN 配置文件中',
  aliases: ['uak'],
  supportsNonInteractive: true,
  load: () => import('./updateapikey.js'),
} satisfies Command

export default updateApiKey