/**
 * ProjectStructurePlanner — 项目目录结构规划器
 *
 * 功能：
 * - 可视化项目目录树（带文件类型图标）
 * - 代码统计（文件数/行数/语言分布）
 * - 模块依赖关系图
 * - 代码行数热力图
 * - 导出项目结构报告
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { ThemeColors } from '../theme.js'

export interface ProjectFile {
  path: string
  name: string
  extension: string
  size: number
  lines: number
  depth: number
  parent?: string
}

export interface LanguageStats {
  language: string
  files: number
  lines: number
  percentage: number
}

export interface ProjectStats {
  totalFiles: number
  totalLines: number
  totalSize: number
  languages: LanguageStats[]
  directories: number
  maxDepth: number
}

interface ProjectStructurePlannerProps {
  cwd: string
  theme: ThemeColors
  onClose?: () => void
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', c: 'C', cpp: 'C++',
  h: 'C/C++ Header', cs: 'C#', rb: 'Ruby', php: 'PHP', swift: 'Swift',
  kt: 'Kotlin', sc: 'Scala', r: 'R', sql: 'SQL', sh: 'Shell', bash: 'Shell',
  json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  md: 'Markdown', txt: 'Text', css: 'CSS', scss: 'SCSS', less: 'LESS',
  html: 'HTML', vue: 'Vue', svelte: 'Svelte', graphql: 'GraphQL',
  proto: 'Protocol Buffers', dockerfile: 'Dockerfile', makefile: 'Makefile',
}

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3776ab',
  Rust: '#dea584', Go: '#00add8', Java: '#b07219', 'C++': '#f34b7d',
  'C#': '#178600', Ruby: '#701516', PHP: '#4f5d95', Swift: '#f05138',
  Shell: '#89e051', JSON: '#292929', YAML: '#cb171e', Markdown: '#083fa1',
  CSS: '#563d7c', HTML: '#e34c26', Vue: '#41b883',
}

const FILE_ICONS: Record<string, string> = {
  ts: '📘', tsx: '⚛️', js: '📜', jsx: '⚛️', py: '🐍', rs: '🦀', go: '🔵',
  java: '☕', c: '🔧', cpp: '⚙️', cs: '💜', rb: '💎', php: '🐘', swift: '🍎',
  json: '📋', yaml: '📄', yml: '📄', md: '📝', css: '🎨', html: '🌐',
  vue: '💚', sh: '💻', sql: '🗄️', dockerfile: '🐳', gitignore: '🙈',
  env: '🔐', lock: '🔒', txt: '📄',
}

function getLanguage(ext: string): string {
  return LANGUAGE_MAP[ext] || ext.toUpperCase()
}

function getFileIcon(fileName: string, ext: string): string {
  if (fileName === 'Dockerfile') return '🐳'
  if (fileName === 'Makefile') return '🔨'
  if (fileName.startsWith('.env')) return '🔐'
  if (fileName.startsWith('.git')) return '🙈'
  if (fileName.endsWith('.lock')) return '🔒'
  return FILE_ICONS[ext] || '📄'
}

function countLines(content: string): number {
  if (!content) return 0
  return content.split('\n').length
}

export function ProjectStructurePlanner({ cwd, theme, onClose }: ProjectStructurePlannerProps): JSX.Element {
  const c = theme
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [viewMode, setViewMode] = useState<'tree' | 'stats' | 'heatmap' | 'dependency'>('tree')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')

  const loadProject = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      // 使用 searchFiles 获取所有代码文件
      const results = await window.dogeAPI.searchFiles('', cwd, 500)

      const processedFiles: ProjectFile[] = results.map(r => {
        const parts = r.path.replace(cwd, '').replace(/^[/\\]/, '').split(/[/\\]/)
        const fileName = parts.pop() || r.path
        const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
        const depth = parts.length
        const parent = parts.length > 0 ? parts.slice(0, -1).join('/') : ''

        return {
          path: r.path,
          name: fileName,
          extension: ext,
          size: 0,
          lines: r.line ? 1 : 0,
          depth,
          parent: parent || undefined,
        }
      })

      // 读取文件内容统计行数
      const enrichedFiles: ProjectFile[] = []
      for (const file of processedFiles.slice(0, 100)) {
        try {
          const result = await window.dogeAPI.readFile(file.path)
          if (result.success && result.content) {
            enrichedFiles.push({ ...file, size: result.content.length, lines: countLines(result.content) })
          } else {
            enrichedFiles.push(file)
          }
        } catch {
          enrichedFiles.push(file)
        }
      }

      setFiles(enrichedFiles)
      calculateStats(enrichedFiles)
    } catch (e) {
      setMessage(`加载失败: ${e instanceof Error ? e.message : '未知错误'}`)
    } finally { setLoading(false) }
  }, [cwd])

  const calculateStats = useCallback((fileList: ProjectFile[]) => {
    const totalFiles = fileList.length
    const totalLines = fileList.reduce((s, f) => s + f.lines, 0)
    const totalSize = fileList.reduce((s, f) => s + f.size, 0)

    const langMap = new Map<string, { files: number; lines: number }>()
    let directories = 0
    const dirSet = new Set<string>()

    for (const f of fileList) {
      const lang = getLanguage(f.extension)
      const existing = langMap.get(lang) || { files: 0, lines: 0 }
      langMap.set(lang, { files: existing.files + 1, lines: existing.lines + f.lines })

      const parts = f.path.replace(cwd, '').replace(/^[/\\]/, '').split(/[/\\]/)
      for (let i = 1; i <= parts.length - 1; i++) {
        dirSet.add(parts.slice(0, i).join('/'))
      }
    }

    const languages: LanguageStats[] = Array.from(langMap.entries())
      .map(([language, data]) => ({
        language,
        files: data.files,
        lines: data.lines,
        percentage: totalLines > 0 ? Math.round((data.lines / totalLines) * 100) : 0,
      }))
      .sort((a, b) => b.lines - a.lines)

    setStats({
      totalFiles,
      totalLines,
      totalSize,
      languages,
      directories: dirSet.size,
      maxDepth: Math.max(...fileList.map(f => f.depth), 0),
    })
  }, [cwd])

  useEffect(() => { loadProject() }, [loadProject])

  // 构建目录树
  const treeData = useMemo(() => {
    const root: Record<string, { type: 'dir' | 'file'; children?: Record<string, unknown>; file?: ProjectFile }> = {}

    for (const file of files) {
      const parts = file.path.replace(cwd, '').replace(/^[/\\]/, '').split(/[/\\]/)
      let current = root
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (i === parts.length - 1) {
          current[part] = { type: 'file', file }
        } else {
          if (!current[part]) current[part] = { type: 'dir', children: {} }
          current = current[part].children as Record<string, { type: 'dir' | 'file'; children?: Record<string, unknown>; file?: ProjectFile }>
        }
      }
    }

    return root
  }, [files, cwd])

  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }, [])

  // 导出报告
  const exportReport = useCallback(() => {
    if (!stats) return
    const lines: string[] = []
    lines.push('# 项目结构报告')
    lines.push(`生成时间: ${new Date().toLocaleString()}`)
    lines.push(`\n## 概览`)
    lines.push(`- 文件总数: ${stats.totalFiles}`)
    lines.push(`- 代码行数: ${stats.totalLines.toLocaleString()}`)
    lines.push(`- 目录数: ${stats.directories}`)
    lines.push(`- 最大深度: ${stats.maxDepth}`)
    lines.push(`\n## 语言分布`)
    for (const lang of stats.languages) {
      lines.push(`- ${lang.language}: ${lang.files} 文件, ${lang.lines.toLocaleString()} 行 (${lang.percentage}%)`)
    }
    lines.push(`\n## 文件列表`)
    for (const f of files) {
      lines.push(`- ${f.path} (${f.lines} 行)`)
    }
    const report = lines.join('\n')
    const blob = new Blob([report], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `project-structure-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('✅ 报告已导出')
  }, [stats, files])

  // 渲染目录树节点
  const renderTreeNode = (node: Record<string, { type: 'dir' | 'file'; children?: Record<string, unknown>; file?: ProjectFile }>, dirPath = '', depth = 0): JSX.Element[] => {
    const entries = Object.entries(node).sort(([a], [b]) => {
      const aIsDir = node[a]?.type === 'dir'
      const bIsDir = node[b]?.type === 'dir'
      if (aIsDir && !bIsDir) return -1
      if (!aIsDir && bIsDir) return 1
      return a.localeCompare(b)
    })

    return entries.map(([name, item]) => {
      const currentPath = dirPath ? `${dirPath}/${name}` : name
      if (item.type === 'dir') {
        const isExpanded = expandedDirs.has(currentPath)
        const childCount = item.children ? Object.keys(item.children).length : 0
        return (
          <div key={currentPath}>
            <div
              onClick={() => toggleDir(currentPath)}
              style={{
                padding: '2px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', borderRadius: '2px', background: isExpanded ? c.accent + '10' : 'transparent',
              }}
            >
              <span style={{ fontSize: '9px', width: '12px', textAlign: 'center' }}>{isExpanded ? '▼' : '▶'}</span>
              <span>📁</span>
              <span style={{ fontWeight: 500 }}>{name}</span>
              <span style={{ fontSize: '9px', color: c.textFaint }}>({childCount})</span>
            </div>
            {isExpanded && item.children && (
              <div style={{ paddingLeft: '16px' }}>
                {renderTreeNode(item.children as Record<string, { type: 'dir' | 'file'; children?: Record<string, unknown>; file?: ProjectFile }>, currentPath, depth + 1)}
              </div>
            )}
          </div>
        )
      } else {
        const file = item.file
        const icon = file ? getFileIcon(file.name, file.extension) : '📄'
        return (
          <div key={currentPath} style={{
            padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', borderRadius: '2px', opacity: 0.85,
          }}>
            <span style={{ width: '12px' }} />
            <span>{icon}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            {file && file.lines > 0 && (
              <span style={{ fontSize: '9px', color: c.textFaint }}>{file.lines}行</span>
            )}
          </div>
        )
      }
    })
  }

  const containerStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px',
    maxHeight: '600px', overflow: 'auto',
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px', border: `1px solid ${c.border}`, borderRadius: '4px', background: c.bgAlt,
  }

  const buttonStyle: React.CSSProperties = {
    padding: '3px 8px', border: `1px solid ${c.border}`, borderRadius: '3px', background: c.bgAlt,
    color: c.text, cursor: 'pointer', fontSize: '10px',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle, background: c.accent, color: '#000', border: 'none', fontWeight: 600,
  }

  if (loading) {
    return <div style={{ ...containerStyle, padding: '12px', color: c.textMuted }}>分析项目结构...</div>
  }

  return (
    <div style={containerStyle}>
      {/* 统计概览 */}
      {stats && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 600, fontSize: '12px' }}>📊 项目概览</span>
            <button onClick={exportReport} style={{ ...primaryButtonStyle, fontSize: '10px' }}>导出报告</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', fontSize: '10px' }}>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: c.accent }}>{stats.totalFiles}</div>
              <div style={{ color: c.textMuted }}>文件</div>
            </div>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: c.accent }}>{stats.totalLines.toLocaleString()}</div>
              <div style={{ color: c.textMuted }}>代码行</div>
            </div>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: c.accent }}>{stats.directories}</div>
              <div style={{ color: c.textMuted }}>目录</div>
            </div>
            <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: c.accent }}>{stats.maxDepth}</div>
              <div style={{ color: c.textMuted }}>最大深度</div>
            </div>
          </div>

          {/* 语言分布条形图 */}
          {stats.languages.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '10px', color: c.textMuted, marginBottom: '4px' }}>语言分布</div>
              {stats.languages.slice(0, 8).map(lang => (
                <div key={lang.language} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '9px', width: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lang.language}</span>
                  <div style={{ flex: 1, height: '8px', background: c.bgPanel, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${lang.percentage}%`, height: '100%', background: LANGUAGE_COLORS[lang.language] || c.accent, borderRadius: '4px', transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: '9px', color: c.textMuted, width: '40px', textAlign: 'right' }}>{lang.percentage}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 视图切换 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => setViewMode('tree')} style={{ ...buttonStyle, background: viewMode === 'tree' ? c.accent + '22' : c.bgAlt, color: viewMode === 'tree' ? c.accent : c.text }}>📁 目录树</button>
        <button onClick={() => setViewMode('stats')} style={{ ...buttonStyle, background: viewMode === 'stats' ? c.accent + '22' : c.bgAlt, color: viewMode === 'stats' ? c.accent : c.text }}>📊 语言统计</button>
        <button onClick={() => setViewMode('heatmap')} style={{ ...buttonStyle, background: viewMode === 'heatmap' ? c.accent + '22' : c.bgAlt, color: viewMode === 'heatmap' ? c.accent : c.text }}>🔥 行数热力图</button>
        <button onClick={() => setViewMode('dependency')} style={{ ...buttonStyle, background: viewMode === 'dependency' ? c.accent + '22' : c.bgAlt, color: viewMode === 'dependency' ? c.accent : c.text }}>🔗 依赖关系</button>
      </div>

      {/* 目录树视图 */}
      {viewMode === 'tree' && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>📁 项目结构</div>
          {files.length === 0 ? (
            <div style={{ color: c.textMuted, fontSize: '10px' }}>暂无文件数据</div>
          ) : (
            <div style={{ fontFamily: 'monospace' }}>
              {renderTreeNode(treeData)}
            </div>
          )}
        </div>
      )}

      {/* 语言统计视图 */}
      {viewMode === 'stats' && stats && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>📊 语言分布详情</div>
          {stats.languages.map(lang => (
            <div key={lang.language} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px',
              borderRadius: '3px', marginBottom: '2px', background: c.bgPanel,
            }}>
              <span style={{ fontSize: '12px' }}>{LANGUAGE_COLORS[lang.language] ? '🟢' : '📄'}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{lang.language}</span>
              <span style={{ fontSize: '10px', color: c.textMuted }}>{lang.files} 文件</span>
              <span style={{ fontSize: '10px', color: c.textMuted }}>{lang.lines.toLocaleString()} 行</span>
              <span style={{ fontSize: '10px', color: c.accent, fontWeight: 600 }}>{lang.percentage}%</span>
            </div>
          ))}
        </div>
      )}

      {/* 行数热力图 */}
      {viewMode === 'heatmap' && files.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>🔥 代码行数热力图</div>
          {(() => {
            const maxLines = Math.max(...files.map(f => f.lines))
            return files
              .filter(f => f.lines > 0)
              .sort((a, b) => b.lines - a.lines)
              .slice(0, 30)
              .map(file => {
                const intensity = maxLines > 0 ? file.lines / maxLines : 0
                const icon = getFileIcon(file.name, file.extension)
                return (
                  <div key={file.path} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                    <span>{icon}</span>
                    <span style={{ flex: 1, fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path.replace(cwd, '')}</span>
                    <div style={{ width: '60px', height: '6px', background: c.bgPanel, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round(intensity * 100)}%`, height: '100%', background: intensity > 0.7 ? '#FF6B6B' : intensity > 0.4 ? '#FFB74D' : '#81C784', borderRadius: '3px' }} />
                    </div>
                    <span style={{ fontSize: '9px', color: c.textMuted, width: '40px', textAlign: 'right' }}>{file.lines}行</span>
                  </div>
                )
              })
          })()}
        </div>
      )}

      {/* 模块依赖关系图 */}
      {viewMode === 'dependency' && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>🔗 模块依赖关系</div>
          {(() => {
            // 基于目录分组的模块视图
            const moduleGroups = new Map<string, string[]>()
            for (const f of files) {
              if (f.extension !== 'ts' && f.extension !== 'tsx' && f.extension !== 'js' && f.extension !== 'jsx') continue
              const parts = f.path.replace(cwd, '').replace(/^[/\\]/, '').split(/[/\\]/)
              const dir = parts.length > 1 ? parts[parts.length - 2] : 'root'
              if (!moduleGroups.has(dir)) moduleGroups.set(dir, [])
              moduleGroups.get(dir)!.push(f.name)
            }

            if (moduleGroups.size === 0) {
              return <div style={{ color: c.textMuted, fontSize: '10px', padding: '8px' }}>未找到源代码模块</div>
            }

            return (
              <div>
                {Array.from(moduleGroups.entries()).map(([group, mods]) => (
                  <div key={group} style={{ marginBottom: '8px', padding: '6px', borderRadius: '3px', background: c.bgPanel, border: `1px solid ${c.border}` }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, marginBottom: '4px', color: c.accent }}>📦 {group}/</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {mods.slice(0, 15).map(m => {
                        const modName = m.replace(/\.(ts|tsx|js|jsx)$/, '')
                        const isIndex = m === 'index.ts' || m === 'index.tsx' || m === 'index.js'
                        return (
                          <span key={m} style={{
                            padding: '2px 6px', borderRadius: '3px', fontSize: '9px',
                            background: isIndex ? c.accent + '22' : c.bgAlt,
                            color: isIndex ? c.accent : c.text,
                            border: `1px solid ${isIndex ? c.accent + '44' : c.border}`,
                            fontFamily: 'monospace',
                          }} title={m}>
                            {isIndex ? '📌' : '📄'} {modName}
                          </span>
                        )
                      })}
                      {mods.length > 15 && <span style={{ fontSize: '9px', color: c.textMuted }}>+{mods.length - 15} more</span>}
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: '9px', color: c.textMuted, marginTop: '4px' }}>
                  💡 基于目录分组的模块视图 — 完整依赖图需静态分析 import/require
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {message && (
        <div style={{ padding: '4px 8px', borderRadius: '3px', fontSize: '10px', background: message.startsWith('✅') ? '#81C78422' : '#ef535022', color: message.startsWith('✅') ? '#81C784' : '#FF6B6B' }}>
          {message}
        </div>
      )}

      {onClose && (
        <div style={{ textAlign: 'right' }}>
          <button onClick={onClose} style={{ ...buttonStyle, color: c.textMuted }}>关闭</button>
        </div>
      )}
    </div>
  )
}
