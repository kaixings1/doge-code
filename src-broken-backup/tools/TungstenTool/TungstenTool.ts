import { buildTool } from '../../../Tool.js'

export const TungstenTool = buildTool({
  name: 'tungsten',
  userFacingName() {
    return 'Tungsten'
  },
  async description() {
    return (
      'Anthropic 构建使用的内部终端会话桥接工具。 +
      '此恢复的工作区保留了该工具的注册，以便配置和' +
      '旧转录文件保持可读，但原始后端已不存在。
    )
  },
  async prompt() {
    return (
      'Tungsten 在此恢复的工作区中不可执行。 +
      '如果用户需要终端自动化，请改用标准 Bash 工具' +
      '或其他可用的本地工具。
    )
  },
  inputSchema: {
    parse(value: unknown) {
      return value
    },
  } as never,
  outputSchema: {
    parse(value: unknown) {
      return value
    },
  } as never,
  isEnabled() {
    return false
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  async call() {
    return {
      data: {
        ok: false,
        error:
          'Tungsten 在此恢复的工作区中不可用；请改用 Bash 或其他本地工具）,
      },
    }
  },
})