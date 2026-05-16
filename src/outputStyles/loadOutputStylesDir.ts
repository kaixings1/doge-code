import memoize from 'lodash-es/memoize.js'
import { basename } from 'path'
import type { OutputStyleConfig } from '../constants/outputStyles.js'
import { logForDebugging } from '../utils/debug.js'
import { coerceDescriptionToString } from '../utils/frontmatterParser.js'
import { logError } from '../utils/log.js'
import {
  extractDescriptionFromMarkdown,
  loadMarkdownFilesForSubdir,
} from '../utils/markdownConfigLoader.js'
import { clearPluginOutputStyleCache } from '../utils/plugins/loadPluginOutputStyles.js'

/**
 * 从项目中的 .claude/output-styles 目录以及 ~/.claude/output-styles 目录
 * 加载 markdown 文件并将其转换为输出样式。
 *
 * 每个文件名成为一个样式名称，文件内容成为样式提示词。
 * frontmatter 提供名称和描述。
 *
 * 结构：
 * - 项目 .claude/output-styles/*.md -> 项目样式
 * - 用户 ~/.claude/output-styles/*.md -> 用户样式（可被项目样式覆盖）
 *
 * @param cwd 用于项目目录遍历的当前工作目录
 */
export const getOutputStyleDirStyles = memoize(
  async (cwd: string): Promise<OutputStyleConfig[]> => {
    try {
      const markdownFiles = await loadMarkdownFilesForSubdir(
        'output-styles',
        cwd,
      )

      const styles = markdownFiles
        .map(({ filePath, frontmatter, content, source }) => {
          try {
            const fileName = basename(filePath)
            const styleName = fileName.replace(/\.md$/, '')

            // 从 frontmatter 获取样式配置
            const name = (frontmatter['name'] || styleName) as string
            const description =
              coerceDescriptionToString(
                frontmatter['description'],
                styleName,
              ) ??
              extractDescriptionFromMarkdown(
                content,
                `自定义 ${styleName} 输出样式`,
              )

            // 解析 keep-coding-instructions 标志（支持布尔值和字符串值）
            const keepCodingInstructionsRaw =
              frontmatter['keep-coding-instructions']
            const keepCodingInstructions =
              keepCodingInstructionsRaw === true ||
              keepCodingInstructionsRaw === 'true'
                ? true
                : keepCodingInstructionsRaw === false ||
                    keepCodingInstructionsRaw === 'false'
                  ? false
                  : undefined

            // 如果非插件输出样式设置了 force-for-plugin，发出警告
            if (frontmatter['force-for-plugin'] !== undefined) {
              logForDebugging(
                `输出样式"${name}"设置了 force-for-plugin，但此选项仅适用于插件输出样式。已忽略。`,
                { level: 'warn' },
              )
            }

            return {
              name,
              description,
              prompt: content.trim(),
              source,
              keepCodingInstructions,
            }
          } catch (error) {
            logError(error)
            return null
          }
        })
        .filter(style => style !== null)

      return styles
    } catch (error) {
      logError(error)
      return []
    }
  },
)

export function clearOutputStyleCaches(): void {
  getOutputStyleDirStyles.cache?.clear?.()
  loadMarkdownFilesForSubdir.cache?.clear?.()
  clearPluginOutputStyleCache()
}
