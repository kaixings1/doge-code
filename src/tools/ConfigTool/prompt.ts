import { feature } from 'bun:bundle'
import { getModelOptions } from '../../utils/model/modelOptions.js'
import { isVoiceGrowthBookEnabled } from '../../voice/voiceModeEnabled.js'
import {
  getOptionsForSetting,
  SUPPORTED_SETTINGS,
} from './supportedSettings.js'

export const DESCRIPTION = '获取或设置 Claude Code 配置。'

/**
 * 从注册表生成提示文档
 */
export function generatePrompt(): string {
  const globalSettings: string[] = []
  const projectSettings: string[] = []

  for (const [key, config] of Object.entries(SUPPORTED_SETTINGS)) {
    // 跳过 model —— 它有独立的小节，会动态生成选项
    if (key === 'model') continue
    // 语音设置在构建时注册，但在运行时由 GrowthBook 门控。
    // 当终止开关开启时，从模型提示中隐藏。
    if (
      feature('VOICE_MODE') &&
      key === 'voiceEnabled' &&
      !isVoiceGrowthBookEnabled()
    )
      continue

    const options = getOptionsForSetting(key)
    let line = `- ${key}`

    if (options) {
      line += `：${options.map(o => `"${o}"`).join('、')}`
    } else if (config.type === 'boolean') {
      line += `：true / false`
    }

    line += ` - ${config.description}`

    if (config.source === 'global') {
      globalSettings.push(line)
    } else {
      projectSettings.push(line)
    }
  }

  const modelSection = generateModelSection()

  return `获取或设置 Claude Code 配置。

查看或修改 Claude Code 设置。当用户请求更改配置、询问当前设置，或调整某项设置会带来帮助时使用。


## 用法
- **获取当前值：** 省略 "value" 参数
- **设置新值：** 包含 "value" 参数

## 可配置设置列表
你可以更改以下设置：

### 全局设置（存储在 ~/.claude.json 中）
${globalSettings.join('\n')}

### 项目设置（存储在 settings.json 中）
${projectSettings.join('\n')}

${modelSection}
## 示例
- 获取主题：{ "setting": "theme" }
- 设置深色主题：{ "setting": "theme", "value": "dark" }
- 启用 vim 模式：{ "setting": "editorMode", "value": "vim" }
- 启用详细输出：{ "setting": "verbose", "value": true }
- 更改模型：{ "setting": "model", "value": "opus" }
- 更改权限模式：{ "setting": "permissions.defaultMode", "value": "plan" }
`
}

function generateModelSection(): string {
  try {
    const options = getModelOptions()
    const lines = options.map(o => {
      const value = o.value === null ? 'null / "default"' : `"${o.value}"`
      return `  - ${value}：${o.descriptionForModel ?? o.description}`
    })
    return `## 模型
- model - 覆盖默认模型。可用选项：
${lines.join('\n')}`
  } catch {
    return `## 模型
- model - 覆盖默认模型（sonnet、opus、haiku、best 或完整模型 ID）`
  }
}