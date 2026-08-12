/**
 * CodeFormatter — 代码格式化组件
 *
 * 支持 Prettier / ESLint / Biome / dprint 多种格式化工具
 * - 自动格式化保存（监听保存事件）
 * - 格式化选中区域（右键菜单）
 * - 项目级格式化配置文件读取（.prettierrc, .eslintrc 等）
 * - 格式化状态指示（状态栏显示当前格式化工具）
 */

import React, { useCallback, useEffect, useState } from 'react'
import type { ThemeColors } from '../theme.js'
import type { FormatterTool } from '../hooks/useEditorConfig.js'

export interface FormatResult {
  success: boolean
  output?: string
  error?: string
  tool?: FormatterTool
  duration?: number
}

export interface FormatterConfig {
  tool: FormatterTool
  formatOnSave: boolean
  formatOnPaste: boolean
  configFilePath?: string
}

export const DEFAULT_FORMATTER_CONFIG: FormatterConfig = {
  tool: 'prettier',
  formatOnSave: true,
  formatOnPaste: false,
}

// 项目格式化配置文件映射
const FORMAT_CONFIG_FILES: Record<FormatterTool, string[]> = {
  prettier: ['.prettierrc', '.prettierrc.json', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.js', 'prettier.config.js', '.prettierrc.toml'],
  eslint: ['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs'],
  biome: ['biome.json', 'biome.jsonc', 'biome.config.json'],
  dprint: ['dprint.json', 'dprint.jsonc', '.dprint.json'],
}

export interface CodeFormatterProps {
  theme: ThemeColors
  config?: Partial<FormatterConfig>
  currentFilePath?: string
  cwd?: string
  onFormat?: (result: FormatResult) => void
  onStatusChange?: (status: 'idle' | 'formatting' | 'success' | 'error') => void
}

/**
 * 代码格式化核心组件
 * 负责格式化状态显示和格式化触发
 */
export function CodeFormatter({ theme, config, currentFilePath, cwd, onFormat, onStatusChange }: CodeFormatterProps): React.JSX.Element {
  const c = theme
  const mergedConfig: FormatterConfig = { ...DEFAULT_FORMATTER_CONFIG, ...config }
  const [status, setStatus] = useState<'idle' | 'formatting' | 'success' | 'error'>('idle')
  const [lastResult, setLastResult] = useState<FormatResult | null>(null)
  const [detectedTool, setDetectedTool] = useState<FormatterTool | null>(null)
  const [configFileFound, setConfigFileFound] = useState<string | null>(null)

  // 状态变更通知
  useEffect(() => {
    onStatusChange?.(status)
  }, [status, onStatusChange])

  // 检测项目格式化配置文件
  useEffect(() => {
    if (!cwd) return
    async function detect() {
      try {
        // 尝试通过 IPC 读取目录中的配置文件
        for (const [tool, files] of Object.entries(FORMAT_CONFIG_FILES)) {
          for (const file of files) {
            try {
              const result = await window.dogeAPI?.readConfig?.(`${cwd}/${file}`)
              if (result) {
                setDetectedTool(tool as FormatterTool)
                setConfigFileFound(file)
                return
              }
            } catch { /* not found, continue */ }
          }
        }
      } catch { /* ignore */ }
    }
    detect()
  }, [cwd])

  // 触发格式化
  const triggerFormat = useCallback(async (code?: string, range?: { start: number; end: number }) => {
    setStatus('formatting')
    const startTime = Date.now()
    try {
      // 通过 IPC 调用格式化服务（主进程侧实现）
      const result = await window.dogeAPI?.formatCode?.({
        code: code || '',
        language: getLanguageFromPath(currentFilePath),
        tool: mergedConfig.tool,
        cwd: cwd || '',
        range,
      })

      const duration = Date.now() - startTime
      const formatResult: FormatResult = {
        success: result?.success ?? false,
        output: result?.output,
        error: result?.error,
        tool: mergedConfig.tool,
        duration,
      }

      setLastResult(formatResult)
      setStatus(formatResult.success ? 'success' : 'error')
      onFormat?.(formatResult)

      // 3 秒后恢复到 idle
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e) {
      const duration = Date.now() - startTime
      const formatResult: FormatResult = {
        success: false,
        error: e instanceof Error ? e.message : '格式化失败',
        tool: mergedConfig.tool,
        duration,
      }
      setLastResult(formatResult)
      setStatus('error')
      onFormat?.(formatResult)
      setTimeout(() => setStatus('idle'), 3000)
    }
  }, [mergedConfig.tool, currentFilePath, cwd, onFormat])

  // 自动格式化保存事件监听
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && mergedConfig.formatOnSave) {
        // 不阻止默认保存行为，仅触发格式化
        // 实际格式化逻辑应由父组件协调
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mergedConfig.formatOnSave])

  const displayTool = detectedTool || mergedConfig.tool

  return (
    <div style={{ fontSize: '11px', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* 格式化工具状态栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: c.textMuted, fontWeight: 600 }}>格式化工具</span>
          <span style={{
            fontSize: '9px', fontWeight: 600, padding: '1px 6px', borderRadius: '3px',
            background: status === 'formatting' ? '#E5C07B33' : status === 'success' ? c.accentDim : status === 'error' ? `${c.errorText}20` : c.bgPanel,
            color: status === 'formatting' ? '#E5C07B' : status === 'success' ? c.accent : status === 'error' ? c.errorText : c.textMuted,
          }}>
            {status === 'formatting' ? ' 格式化中...' : status === 'success' ? '✓ 完成' : status === 'error' ? '✗ 失败' : displayTool}
          </span>
        </div>
        {configFileFound && (
          <span style={{ fontSize: '9px', color: c.textFaint }} title={`检测到配置文件: ${configFileFound}`}>
            {configFileFound}
          </span>
        )}
      </div>

      {/* 格式化配置选项 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: c.textFaint }}>保存时格式化</span>
          <span style={{ fontSize: '9px', color: mergedConfig.formatOnSave ? c.accent : c.textFaint, fontWeight: 600 }}>
            {mergedConfig.formatOnSave ? '✓ 开启' : '○ 关闭'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: c.textFaint }}>粘贴时格式化</span>
          <span style={{ fontSize: '9px', color: mergedConfig.formatOnPaste ? c.accent : c.textFaint, fontWeight: 600 }}>
            {mergedConfig.formatOnPaste ? '✓ 开启' : '○ 关闭'}
          </span>
        </div>
      </div>

      {/* 格式化工具选择 */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {(['prettier', 'eslint', 'biome', 'dprint'] as FormatterTool[]).map((tool) => (
          <button
            key={tool}
            onClick={() => { /* 通过父组件更新配置 */ }}
            style={{
              padding: '2px 8px', border: '1px solid', borderColor: displayTool === tool ? c.accent : c.border,
              borderRadius: '3px', background: displayTool === tool ? c.accentDim : 'transparent',
              color: displayTool === tool ? c.accent : c.textMuted, cursor: 'pointer', fontSize: '10px',
            }}
          >
            {tool}
          </button>
        ))}
      </div>

      {/* 最近一次格式化结果 */}
      {lastResult && (
        <div style={{
          padding: '4px 8px', borderRadius: '3px', fontSize: '10px',
          background: lastResult.success ? c.accentDim : `${c.errorText}15`,
          color: lastResult.success ? c.textMuted : c.errorText,
          border: `1px solid ${lastResult.success ? c.border : c.errorBorder}`,
        }}>
          {lastResult.success
            ? `格式化成功 (${lastResult.duration}ms)`
            : `格式化失败: ${lastResult.error}`
          }
        </div>
      )}

      {/* 支持的配置文件列表 */}
      <div style={{ fontSize: '9px', color: c.textFaint, lineHeight: '1.4' }}>
        <div style={{ fontWeight: 600, marginBottom: '2px' }}>检测的配置文件:</div>
        {FORMAT_CONFIG_FILES[mergedConfig.tool].map(f => (
          <div key={f} style={{ paddingLeft: '8px' }}>
            {configFileFound === f ? '●' : '○'} {f}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * 根据文件路径推断语言
 */
function getLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'typescript'
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', html: 'html', md: 'markdown',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    sh: 'bash', yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql',
  }
  return langMap[ext] || ext
}

/**
 * 纯函数：通过 IPC 调用格式化服务
 * 主进程侧需实现 doge:format-code IPC handler
 */
export async function formatCodeViaIPC(
  code: string,
  language: string,
  tool: FormatterTool,
  cwd: string,
  range?: { start: number; end: number },
): Promise<FormatResult> {
  try {
    const result = await window.dogeAPI?.formatCode?.({
      code,
      language,
      tool,
      cwd,
      range,
    })
    return {
      success: result?.success ?? false,
      output: result?.output,
      error: result?.error,
      tool,
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : '格式化服务不可用',
      tool,
    }
  }
}

/**
 * 纯函数：检测项目的格式化配置
 */
export async function detectProjectFormatter(cwd: string): Promise<{ tool: FormatterTool; configFile: string } | null> {
  for (const [tool, files] of Object.entries(FORMAT_CONFIG_FILES)) {
    for (const file of files) {
      try {
        const result = await window.dogeAPI?.readConfig?.(`${cwd}/${file}`)
        if (result) {
          return { tool: tool as FormatterTool, configFile: file }
        }
      } catch { /* not found */ }
    }
  }
  return null
}


