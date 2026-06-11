/**
 * 会话结果处理器
 */

export interface SessionResult {
  success: boolean
  tool: string
  parameters: any
  result: any
  error?: string
  timestamp: string
}

export interface ResultHandlerConfig {
  autoSendDone?: boolean
  formatAsMarkdown?: boolean
  includeExecutionTime?: boolean
}

const DEFAULT_CONFIG = {
  autoSendDone: true,
  formatAsMarkdown: true,
  includeExecutionTime: true
}

export class SessionResultHandler {
  private config: ResultHandlerConfig
  private resultBuffer: string[] = []
  private isProcessing = false

  constructor(config: ResultHandlerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async handleResult(result: SessionResult): Promise<string> {
    if (this.isProcessing) {
      this.resultBuffer.push(JSON.stringify(result))
      return ''
    }

    this.isProcessing = true

    try {
      const formatted = this.formatResult(result)
      await this.sendResult(formatted)

      if (this.config.autoSendDone) {
        await this.sendDone()
      }

      if (this.resultBuffer.length > 0) {
        await this.processBuffer()
      }

      return formatted
    } finally {
      this.isProcessing = false
    }
  }

  async handleResults(results: SessionResult[]): Promise<string> {
    if (results.length === 0) return ''
    if (results.length === 1) return await this.handleResult(results[0])

    this.isProcessing = true

    try {
      let formatted = ''

      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const resultText = this.formatResult(result)

        formatted += resultText

        if (i < results.length - 1) {
          formatted += '\n\n---\n\n'
        }

        await this.sendResult(resultText)

        if (i < results.length - 1) {
          await this.delay(100)
        }
      }

      if (this.config.autoSendDone) {
        await this.sendDone()
      }

      return formatted
    } finally {
      this.isProcessing = false
    }
  }

  private formatResult(result: SessionResult): string {
    if (!result.success) {
      return this.formatError(result)
    }

    switch (result.tool) {
      case 'exec':
        return this.formatExecResult(result)
      case 'clear':
        return this.formatClearResult(result)
      case 'bash':
        return this.formatBashResult(result)
      default:
        return this.formatDefaultResult(result)
    }
  }

  private formatExecResult(result: SessionResult): string {
    const { command, description } = result.parameters
    const { output, status, executionTime } = result.result

    let formatted = ''

    if (this.config.formatAsMarkdown) {
      formatted += `## 执行命令: ${command}\n\n`
      if (description) {
        formatted += `**描述:** ${description}\n\n`
      }
      formatted += `**状态:** ${status}\n\n`
      formatted += `**输出:**\n\`\`\`\n${output}\n\`\`\`\n`

      if (this.config.includeExecutionTime && executionTime) {
        formatted += `\n**执行时间:** ${executionTime}\n`
      }
    } else {
      formatted += `执行命令: ${command}\n`
      if (description) {
        formatted += `描述: ${description}\n`
      }
      formatted += `状态: ${status}\n`
      formatted += `输出:\n${output}\n`

      if (this.config.includeExecutionTime && executionTime) {
        formatted += `执行时间: ${executionTime}\n`
      }
    }

    return formatted
  }

  private formatClearResult(result: SessionResult): string {
    const { clearedItems } = result.result

    if (this.config.formatAsMarkdown) {
      return `## 对话已清除\n\n已清除项目:\n- ${clearedItems.join('\n- ')}\n`
    } else {
      return `对话已清除\n已清除项目:\n- ${clearedItems.join('\n- ')}\n`
    }
  }

  private formatBashResult(result: SessionResult): string {
    const { command, description } = result.parameters
    const { output, status, executionTime } = result.result

    if (this.config.formatAsMarkdown) {
      let formatted = `## 执行Bash命令: ${command}\n\n`
      if (description) {
        formatted += `**描述:** ${description}\n\n`
      }
      formatted += `**状态:** ${status}\n\n`
      formatted += `**输出:**\n\`\`\`\n${output}\n\`\`\`\n`

      if (this.config.includeExecutionTime && executionTime) {
        formatted += `\n**执行时间:** ${executionTime}\n`
      }

      return formatted
    } else {
      let formatted = `执行Bash命令: ${command}\n`
      if (description) {
        formatted += `描述: ${description}\n`
      }
      formatted += `状态: ${status}\n`
      formatted += `输出:\n${output}\n`

      if (this.config.includeExecutionTime && executionTime) {
        formatted += `执行时间: ${executionTime}\n`
      }

      return formatted
    }
  }

  private formatDefaultResult(result: SessionResult): string {
    if (this.config.formatAsMarkdown) {
      return `## 工具执行结果\n\n**工具:** ${result.tool}\n**状态:** ${result.success ? '成功' : '失败'}\n\n**结果:**\n\`\`\`json\n${JSON.stringify(result.result, null, 2)}\n\`\`\`\n`
    } else {
      return `工具执行结果\n工具: ${result.tool}\n状态: ${result.success ? '成功' : '失败'}\n结果: ${JSON.stringify(result.result, null, 2)}\n`
    }
  }

  private formatError(result: SessionResult): string {
    if (this.config.formatAsMarkdown) {
      return `## ❌ 执行失败\n\n**工具:** ${result.tool}\n**错误:** ${result.error}\n\n**参数:**\n\`\`\`json\n${JSON.stringify(result.parameters, null, 2)}\n\`\`\`\n`
    } else {
      return `执行失败\n工具: ${result.tool}\n错误: ${result.error}\n参数: ${JSON.stringify(result.parameters, null, 2)}\n`
    }
  }

  private async sendResult(result: string): Promise<void> {
    console.log('[SessionResultHandler] 发送结果到服务器:')
    console.log(result)
  }

  private async sendDone(): Promise<void> {
    console.log('[SessionResultHandler] 发送 [DONE] 标记')
  }

  private async processBuffer(): Promise<void> {
    while (this.resultBuffer.length > 0) {
      const resultStr = this.resultBuffer.shift()
      if (resultStr) {
        const result = JSON.parse(resultStr)
        await this.handleResult(result)
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  clearBuffer(): void {
    this.resultBuffer = []
  }

  getBufferSize(): number {
    return this.resultBuffer.length
  }
}

let globalResultHandler: SessionResultHandler | null = null

export function getGlobalResultHandler(): SessionResultHandler {
  if (!globalResultHandler) {
    globalResultHandler = new SessionResultHandler()
  }
  return globalResultHandler
}

export function setGlobalResultHandler(handler: SessionResultHandler): void {
  globalResultHandler = handler
}

export async function processSessionResult(result: SessionResult): Promise<string> {
  const handler = getGlobalResultHandler()
  return await handler.handleResult(result)
}

export async function processSessionResults(results: SessionResult[]): Promise<string> {
  const handler = getGlobalResultHandler()
  return await handler.handleResults(results)
}
