/** 状态栏项目 */
export type StatusLineItem = Record<string, unknown>

/** 状态栏命令输入 */
export type StatusLineCommandInput = {
  [key: string]: unknown
}

/** DOGE: API 配置和 token 统计，传递给 status-line.js */
export type DogeStatusLineConfig = {
  base_url?: string
  api_key?: string
  api_model?: string
  preset_tokens?: {
    sent: number
    received: number
    current?: number
    sessionTotal?: number
    currentSessionTotal?: number
    jsonSentBytes?: number
    jsonReceivedBytes?: number
  }
}
