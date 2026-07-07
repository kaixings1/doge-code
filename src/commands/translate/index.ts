import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, resolve, extname } from 'path'

/**
 * /translate 命令 - 翻译工具
 * 支持文本翻译、文件翻译、批量翻译
 */

const HELP_TEXT = `🌐 **Translate 命令** - 翻译工具

**用法**: /translate <文本|文件> [选项]

**选项**:
  --to <语言>       - 目标语言 (zh/en/ja/ko/fr/de/es/pt/it/ru/ar)
  --from <语言>     - 源语言 (自动检测)
  --file <路径>     - 翻译文件
  --batch <目录>    - 批量翻译目录中的文件
  --help            - 显示帮助

**示例**:
  /translate "Hello World" --to zh        # 翻译文本到中文
  /translate --file src/index.ts --to zh    # 翻译文件
  /translate --batch ./src --to en          # 批量翻译目录`

// 简单的翻译映射（实际使用中可接入翻译 API）
const TRANSLATIONS: Record<string, Record<string, string>> = {
  'Hello World': { zh: '你好世界', ja: 'こんにちは世界', ko: '안녕하세요 세계' },
  'Good morning': { zh: '早上好', ja: 'おはようございます', ko: '좋은 아침입니다' },
  'Thank you': { zh: '谢谢', ja: 'ありがとうございます', ko: '감사합니다' },
  'Welcome': { zh: '欢迎', ja: 'ようこそ', ko: '환영합니다' },
}

// 简单的中译英词典
const ZH_TO_EN: Record<string, string> = {
  '你好世界': 'Hello World',
  '早上好': 'Good morning',
  '谢谢': 'Thank you',
  '欢迎': 'Welcome',
  '项目': 'project',
  '文件': 'file',
  '代码': 'code',
  '测试': 'test',
}

// 支持的文件扩展名
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.md', '.json']

function detectLanguage(text: string): 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'it' | 'ru' | 'ar' | 'auto' {
  // 简单的中日韩检测
  if (/[\u4e00-\u9fa5]/.test(text)) return 'zh'
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja'
  if (/[\uac00-\ud7af]/.test(text)) return 'ko'
  if (/[\u00c0-\u017f]/.test(text) && /[àâäèéêëïîôöùûüÿç]/i.test(text)) return 'fr'
  if (/[\u00c0-\u017f]/.test(text) && /[äöüß]/i.test(text)) return 'de'
  if (/[\u00c0-\u017f]/.test(text) && /[ñ¿¡]/i.test(text)) return 'es'
  return 'auto'
}

function translateText(text: string, to: string, from: string = 'auto'): string {
  // 简单的翻译（实际应接入 API）
  if (from !== 'auto') {
    const fromMap = TRANSLATIONS[text]?.[to]
    if (fromMap) return fromMap
  }

  // 反向翻译（中译英）
  if (to === 'en' && ZH_TO_EN[text]) {
    return ZH_TO_EN[text]
  }

  // 如果检测到中文且目标是英文
  if (detectLanguage(text) === 'zh' && to === 'en') {
    // 简单返回原文提示
    return `[需翻译API] ${text}`
  }

  return `[翻译: ${text} -> ${to}]`
}

function translateFile(filePath: string, to: string): string {
  const absPath = resolve(filePath)

  if (!existsSync(absPath)) {
    return `❌ 文件不存在: ${absPath}`
  }

  const ext = extname(absPath)
  if (!CODE_EXTENSIONS.includes(ext)) {
    return `❌ 不支持的文件类型: ${ext}

支持的类型: ${CODE_EXTENSIONS.join(', ')}`
  }

  try {
    const content = readFileSync(absPath, 'utf-8')
    const lines = content.split('\n')

    // 简单处理：只翻译注释和字符串
    const translated = lines.map(line => {
      // 翻译注释
      if (line.includes('//') || line.includes('#')) {
        const commentMatch = line.match(/((\/\/|#)\s*)(.*)/)
        if (commentMatch && detectLanguage(commentMatch[3]) === 'zh' && to !== 'zh') {
          return line.replace(commentMatch[3], `[EN] ${commentMatch[3]}`)
        }
      }
      // 翻译字符串
      if (line.includes("'") || line.includes('"')) {
        const strMatch = line.match(/['"]([^'"]+)['"]/)
        if (strMatch && detectLanguage(strMatch[1]) === 'zh' && to !== 'zh') {
          return line.replace(strMatch[1], `[EN] ${strMatch[1]}`)
        }
      }
      return line
    }).join('\n')

    return `📄 **文件翻译预览**

原文件: ${absPath}
目标语言: ${to}

${translated.split('\n').slice(0, 20).map((line, i) => `${(i + 1).toString().padStart(3, ' ')}: ${line}`).join('\n')}
${translated.split('\n').length > 20 ? '\n... 更多内容请查看原文件' : ''}`
  } catch (err) {
    return `❌ 读取文件失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

function batchTranslate(dir: string, to: string): string {
  const absDir = resolve(dir)

  if (!existsSync(absDir)) {
    return `❌ 目录不存在: ${absDir}`
  }

  try {
    const files = readdirSync(absDir)
      .filter(f => CODE_EXTENSIONS.includes(extname(f)))
      .map(f => join(absDir, f))

    const results = files.slice(0, 10).map(file => {
      try {
        const stat = statSync(file)
        return `• ${file.replace(absDir, '.')} (${(stat.size / 1024).toFixed(1)}KB)`
      } catch {
        return `• ${file.replace(absDir, '.')} (读取失败)`
      }
    })

    return `📂 **批量翻译扫描**

目录: ${absDir}
目标语言: ${to}
找到 ${files.length} 个可翻译文件

${results.join('\n')}
${files.length > 10 ? `\n... 还有 ${files.length - 10} 个文件` : ''}

💡 提示: 使用 --file 翻译单个文件`
  } catch (err) {
    return `❌ 扫描目录失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

export const call: LocalCommandCall = async (args, context) => {
  const s = (args ?? '').trim()

  // 提取选项
  const toMatch = s.match(/--to\s+(\S+)/)
  const to = toMatch ? toMatch[1] : 'zh'
  const fromMatch = s.match(/--from\s+(\S+)/)
  const from = fromMatch ? fromMatch[1] : 'auto'

  // 文件模式
  if (s.includes('--file')) {
    const fileMatch = s.match(/--file\s+(\S+)/)
    if (!fileMatch) {
      return {
        type: 'text',
        value: `❌ **参数错误**

🔧 **正确用法**: \`/translate --file <文件路径> --to <语言>\``
      }
    }
    return { type: 'text', value: translateFile(fileMatch[1], to) }
  }

  // 批量模式
  if (s.includes('--batch')) {
    const batchMatch = s.match(/--batch\s+(\S+)/)
    if (!batchMatch) {
      return {
        type: 'text',
        value: `❌ **参数错误**

🔧 **正确用法**: \`/translate --batch <目录> --to <语言>\``
      }
    }
    return { type: 'text', value: batchTranslate(batchMatch[1], to) }
  }

  // 帮助模式
  if (s.includes('--help') || s === '') {
    return { type: 'text', value: HELP_TEXT }
  }

  // 文本翻译
  const text = s.replace(/--to\s+\S+/, '').replace(/--from\s+\S+/, '').trim()
  if (!text) {
    return { type: 'text', value: HELP_TEXT }
  }

  const detectedFrom = detectLanguage(text)
  const result = translateText(text, to, detectedFrom)

  return {
    type: 'text',
    value: `🌐 **翻译结果**

📝 **原文** (${detectedFrom === 'auto' ? '自动检测' : detectedFrom}):
${text}

🎯 **译文** (${to}):
${result}

💡 提示: 当前为演示模式，实际翻译需接入翻译 API`
  }
}

const translate: Command = {
  type: 'local',
  name: 'translate',
  description: '翻译工具 - 文本/文件/批量翻译',
  aliases: ['tr'],
  isEnabled: () => {
    const { getIsNonInteractiveSession } = require('../../bootstrap/state.js')
    return !getIsNonInteractiveSession()
  },
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default translate
