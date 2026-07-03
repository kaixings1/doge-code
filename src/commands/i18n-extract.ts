import type { Command } from '../commands.js'

const ALLOWED_TOOLS = [
  'Bash(*)',
  'FileRead(*)',
  'FileEdit(*)',
  'FileWrite(*)',
  'Glob(*)',
  'Grep(*)',
]

function getPromptContent(args: string): string {
  const firstArg = (args || '').trim().split(/\s+/)[0] || ''
  const rest = (args || '').trim().split(/\s+/).slice(1).join(' ')

  const initMode = firstArg === 'init'
  const extractMode = firstArg === 'extract'

  let modeGuide = ''
  if (initMode) {
    modeGuide = '初始化国际化框架\n1.检测项目类型(TS/Node/Python/Rust/Go)\n2.推荐i18next/gettext/fluent/go-i18n\n3.创建locales/zh-CN/common.json等翻译文件\n4.安装依赖并初始化入口'
  } else if (extractMode || !firstArg) {
    const target = rest || '.'
    modeGuide = '提取硬编码字符串\n目标目录: ' + target + '\n1.搜索UI字符串(<Text>xxx</Text>、title/label/placeholder等)\n2.生成唯一key(module.section.description)\n3.写入locales/zh-CN/common.json\n4.替换代码中的字符串为i18n调用(t(\'key\')/_(\'key\'))'
  } else {
    modeGuide = '用法:\n- /i18n init - 初始化国际化框架\n- /i18n extract [目录] - 提取硬编码字符串\n- /i18n extract <文件> - 提取特定文件'
  }

  return `## 任务：国际化/本地化

你是一个i18n国际化专家。从代码中提取硬编码字符串，生成翻译文件，替换引用。

### 工作模式
${modeGuide}

### 重要规则
- 只替换UI展示字符串，不修改代码逻辑
- key命名要有意义(模块.区域.描述)，不用数字ID
- 上下文相似的字符串合并为一个key
- 保留字符串中的模板变量(\`{name}\`、%s等)`
}

const command = {
  type: 'prompt',
  name: 'i18n',
  aliases: ['i18n-extract'],
  description: '国际化支持：提取硬编码字符串，生成翻译文件',
  allowedTools: ALLOWED_TOOLS,
  contentLength: 0,
  progressMessage: '正在分析国际化字符串',
  source: 'builtin',
  getPromptForCommand(args: string): string {
    return getPromptContent(args || '')
  },
} satisfies Command

export default command
