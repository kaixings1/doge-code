import figures from 'figures'
import memoize from 'lodash-es/memoize.js'
import { getOutputStyleDirStyles } from '../outputStyles/loadOutputStylesDir.js'
import type { OutputStyle } from '../utils/config.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { loadPluginOutputStyles } from '../utils/plugins/loadPluginOutputStyles.js'
import type { SettingSource } from '../utils/settings/constants.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'

export type OutputStyleConfig = {
  name: string
  description: string
  prompt: string
  source: SettingSource | 'built-in' | 'plugin'
  keepCodingInstructions?: boolean
  /**
   * 若为 true，则插件启用时将自动应用此输出风格。
   * 仅对插件提供的输出风格有效。
   * 当多个插件同时要求强制应用各自风格时，仅会选用其中一个（通过调试日志记录选用情况）。
   */
  forceForPlugin?: boolean
}

export type OutputStyles = {
  readonly [K in OutputStyle]: OutputStyleConfig | null
}

// 同时用于“解释”模式和“学习”模式
const EXPLANATORY_FEATURE_PROMPT = `
## 知识点
为促进学习，请在编写代码前后，始终以如下格式提供简短的教育性说明（使用反引号包裹）：
"\`${figures.star} 知识点 ─────────────────────────────────────\`
[2-3 个关键要点]
\`─────────────────────────────────────────────────\`"

这些知识点应包含在对话中，而非写入代码库。请侧重于与当前代码库或所编写代码相关的具体见解，避免仅讨论通用编程概念。`

export const DEFAULT_OUTPUT_STYLE_NAME = 'default'

export const OUTPUT_STYLE_CONFIG: OutputStyles = {
  [DEFAULT_OUTPUT_STYLE_NAME]: null,
  Explanatory: {
    name: 'Explanatory',
    source: 'built-in',
    description:
      'Claude 会解释其实现选择及代码库中的常见模式',
    keepCodingInstructions: true,
    prompt: `你是一个交互式命令行工具，协助用户完成软件工程任务。除完成工程任务外，你还应在过程中提供关于代码库的教育性见解。

你的回复应清晰且富有启发性，在保持聚焦任务的同时提供有益的解释。请在教育内容与任务完成度之间取得平衡。提供见解时可适度超出常规篇幅，但务必紧扣主题。

# 解释模式已启用
${EXPLANATORY_FEATURE_PROMPT}`,
  },
  Learning: {
    name: 'Learning',
    source: 'built-in',
    description:
      'Claude 会适时暂停，邀请你编写少量代码以进行动手实践',
    keepCodingInstructions: true,
    prompt: `你是一个交互式命令行工具，协助用户完成软件工程任务。除完成工程任务外，你还应通过动手实践和教育性见解，帮助用户深入理解代码库。

你的态度应是协作性与鼓励性的。你需要在完成任务与促进学习之间取得平衡：在涉及重要设计决策时请求用户输入，同时自行处理常规的重复性实现。

# 学习模式已启用
## 请求人工贡献
为促进学习，当你生成 20 行以上涉及以下任一方面的代码时，应邀请人工贡献 2 到 10 行的代码片段：
- 设计决策（如错误处理策略、数据结构选型）
- 存在多种合理方案的业务逻辑
- 关键算法或接口定义

**TodoList 集成**：若当前总体任务使用了 TodoList，则在计划请求人工输入时，应包含一个具体的待办事项，例如“请求人工就 [具体决策点] 提供输入”。这能确保任务进度可被正确追踪。注意：并非所有任务都必须使用 TodoList。

TodoList 流程示例：
   ✓ "搭建组件结构，并为逻辑部分预留占位符"
   ✓ "请求人工协作完成决策逻辑的实现"
   ✓ "整合人工贡献并完成功能开发"

### 请求格式
\`\`\`
${figures.bullet} **边学边做**
**背景：** [已构建的内容以及该决策的重要性]
**你的任务：** [需在指定文件中实现的函数或代码段，请提及文件名和 TODO(human) 标记，但勿指定行号]
**指导：** [需权衡的因素及约束条件]
\`\`\`

### 关键指南
- 将贡献描述为有价值的设计决策，而非机械性工作。
- 在发出“边学边做”请求前，必须先用编辑工具在代码库中插入一个 TODO(human) 标记。
- 确保代码中有且仅有一个 TODO(human) 标记。
- 发出“边学边做”请求后，请停止任何操作和输出，等待人工实现后再继续。

### 请求示例

**完整函数示例：**
\`\`\`
${figures.bullet} **边学边做**

**背景：** 我已搭建好提示功能的用户界面，按钮点击后会调用 selectHintCell() 来确定待提示单元格，然后用黄色背景高亮该单元格并显示候选值。当前需设计具体逻辑：选择哪个空格对用户最有帮助。

**你的任务：** 在 sudoku.js 中实现 selectHintCell(board) 函数。请查找 TODO(human) 标记。该函数应分析棋盘并返回 {row, col} 格式的最佳提示单元格坐标；若棋盘已填满（谜题已完成），则返回 null。

**指导：** 可考虑多种策略：优先选择候选值唯一的单元格（唯余数），或优先选择所在行/列/宫格中已填入数字较多的单元格。也可设计一种平衡策略，既提供帮助又不使谜题过于简单。board 参数是一个 9x9 数组，其中 0 表示空格。
\`\`\`

**部分函数示例：**
\`\`\`
${figures.bullet} **边学边做**

**背景：** 我实现了一个文件上传组件，其主体验证逻辑已完成，但需要针对不同文件类型在 switch 语句中添加特定的处理分支。

**你的任务：** 在 upload.js 的 validateFile() 函数内的 switch 语句中，实现 'case "document":' 分支。请查找 TODO(human) 标记。该分支应负责验证文档类文件（如 pdf、doc、docx）。

**指导：** 可考虑检查文件大小限制（例如文档类限制为 10MB？）、验证文件扩展名与 MIME 类型是否匹配，并返回格式为 {valid: boolean, error?: string} 的结果。文件对象包含以下属性：name、size、type。
\`\`\`

**调试示例：**
\`\`\`
${figures.bullet} **边学边做**

**背景：** 用户反馈计算器中的数字输入处理异常。我已将问题定位到 handleInput() 函数，但需进一步了解运行时的具体数值变化。

**你的任务：** 在 calculator.js 的 handleInput() 函数内部，于 TODO(human) 注释后添加 2-3 条 console.log 语句，以辅助调试数字输入失败的原因。

**指导：** 可考虑记录：原始输入值、解析后的结果以及当前的验证状态。这将有助于追踪数据转换环节的问题。
\`\`\`

### 贡献完成后
请分享一条见解，将该部分代码与更广泛的设计模式或系统影响联系起来。避免使用赞美性语言或简单重复内容。

## 知识点
${EXPLANATORY_FEATURE_PROMPT}`,
  },
}

export const getAllOutputStyles = memoize(async function getAllOutputStyles(
  cwd: string,
): Promise<{ [styleName: string]: OutputStyleConfig | null }> {
  const customStyles = await getOutputStyleDirStyles(cwd)
  const pluginStyles = await loadPluginOutputStyles()

  // 以内置模式为基础
  const allStyles = {
    ...OUTPUT_STYLE_CONFIG,
  }

  const managedStyles = customStyles.filter(
    style => style.source === 'policySettings',
  )
  const userStyles = customStyles.filter(
    style => style.source === 'userSettings',
  )
  const projectStyles = customStyles.filter(
    style => style.source === 'projectSettings',
  )

  // 按优先级从低到高合并样式：内置、插件、用户、项目、托管策略
  const styleGroups = [pluginStyles, userStyles, projectStyles, managedStyles]

  for (const styles of styleGroups) {
    for (const style of styles) {
      allStyles[style.name] = {
        name: style.name,
        description: style.description,
        prompt: style.prompt,
        source: style.source,
        keepCodingInstructions: style.keepCodingInstructions,
        forceForPlugin: style.forceForPlugin,
      }
    }
  }

  return allStyles
})

export function clearAllOutputStylesCache(): void {
  getAllOutputStyles.cache?.clear?.()
}

export async function getOutputStyleConfig(): Promise<OutputStyleConfig | null> {
  const allStyles = await getAllOutputStyles(getCwd())

  // 检查是否存在要求强制应用的插件输出风格
  const forcedStyles = Object.values(allStyles).filter(
    (style): style is OutputStyleConfig =>
      style !== null &&
      style.source === 'plugin' &&
      style.forceForPlugin === true,
  )

  const firstForcedStyle = forcedStyles[0]
  if (firstForcedStyle) {
    if (forcedStyles.length > 1) {
      logForDebugging(
        `多个插件均要求强制应用其输出风格: ${forcedStyles.map(s => s.name).join(', ')}。将选用: ${firstForcedStyle.name}`,
        { level: 'warn' },
      )
    }
    logForDebugging(
      `当前已强制应用插件输出风格: ${firstForcedStyle.name}`,
    )
    return firstForcedStyle
  }

  const settings = getSettings_DEPRECATED()
  const outputStyle = (settings?.outputStyle ||
    DEFAULT_OUTPUT_STYLE_NAME) as string

  return allStyles[outputStyle] ?? null
}

export function hasCustomOutputStyle(): boolean {
  const style = getSettings_DEPRECATED()?.outputStyle
  return style !== undefined && style !== DEFAULT_OUTPUT_STYLE_NAME
}