/**
 * 文件树组件 - 支持浏览、搜索、右键菜单操作
 */

import React, { useCallback, useContext, useEffect, useState } from 'react'
import { ThemeContext } from '../App.js'
import { THEMES } from '../theme.js'

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  expanded: boolean
  parentPath?: string
  children?: FileTreeNode[]
}

function getFileIcon(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    ts: '📘', tsx: '⚛', js: '📜', jsx: '⚛',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    py: '🐍', rs: '🦀', go: '🔵', java: '☕',
    png: '🖼', jpg: '🖼', gif: '🖼', svg: '🎨',
    gitignore: '🔀', env: '🔐', yaml: '⚙', yml: '⚙',
    toml: '⚙', lock: '🔒', sh: '💻', bat: '💻',
  }
  return iconMap[ext] || '📄'
}

interface FileTreeProps {
  cwd: string
  onPreviewFile?: (path: string) => void
}

export function FileTree({ cwd, onPreviewFile }: FileTreeProps) {
  const { styles: appStyles, colors: theme } = useContext(ThemeContext)
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [searchMode, setSearchMode] = useState<'name' | 'content'>('name')
  const [searchResults, setSearchResults] = useState<Array<{ path: string; line: number; content: string }>>([])
  const [searching, setSearching] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileTreeNode } | null>(null)
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }

  const navigateTo = (dirPath: string) => {
    setTree([])
    setLoading(true)
    loadTree(dirPath)
  }

  // 内容搜索（防抖）
  useEffect(() => {
    if (searchMode !== 'content' || !filter || filter.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await window.dogeAPI.searchFiles(filter, cwd, 80)
      setSearchResults(results)
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [filter, searchMode, cwd])

  const copyPath = () => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.node.path).catch(() => {})
      setContextMenu(null)
    }
  }

  const deleteNode = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const confirmed = confirm(`确定要删除 "${node.name}" 吗？\n路径: ${node.path}\n\n此操作不可撤销。`)
    if (!confirmed) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.deleteFile(node.path)
      if (result.success) {
        if (node.parentPath) {
          setTree(prev => {
            const removeFromParent = (nodes: FileTreeNode[]): FileTreeNode[] =>
              nodes.map(n => {
                if (n.path === node.parentPath && n.children) {
                  return { ...n, children: n.children.filter(c => c.path !== node.path) }
                }
                if (n.children) return { ...n, children: removeFromParent(n.children) }
                return n
              })
            return removeFromParent(prev)
          })
        } else {
          setTree(prev => prev.filter(n => n.path !== node.path))
        }
      } else {
        alert(result.error || '删除失败')
      }
    } catch { alert('删除失败') }
    setContextMenu(null)
  }

  const renameNode = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const newName = prompt('重命名为:', node.name)
    if (!newName || newName === node.name) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.renameFile(node.path, newName)
      if (result.success && result.newPath) {
        setTree(prev => {
          const updateNode = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map(n => {
              if (n.path === node.path) {
                return { ...n, name: newName, path: result.newPath! }
              }
              if (n.children) return { ...n, children: updateNode(n.children) }
              return n
            })
          return updateNode(prev)
        })
      } else {
        alert(result.error || '重命名失败')
      }
    } catch { alert('重命名失败') }
    setContextMenu(null)
  }

  const newFileInDir = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const fileName = prompt('新建文件名:')
    if (!fileName) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.newFile(node.path, fileName)
      if (result.success && result.path) {
        const newNode: FileTreeNode = {
          name: fileName,
          path: result.path,
          isDirectory: false,
          expanded: false,
          parentPath: node.path,
        }
        setTree(prev => {
          const addToParent = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map(n => {
              if (n.path === node.path && n.children) {
                return { ...n, children: [...n.children, newNode] }
              }
              if (n.children) return { ...n, children: addToParent(n.children) }
              return n
            })
          return addToParent(prev)
        })
      } else {
        alert(result.error || '新建文件失败')
      }
    } catch { alert('新建文件失败') }
    setContextMenu(null)
  }

  const newFolderInDir = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    const folderName = prompt('新建文件夹名:')
    if (!folderName) { setContextMenu(null); return }
    try {
      const result = await window.dogeAPI.newFolder(node.path, folderName)
      if (result.success && result.path) {
        const newNode: FileTreeNode = {
          name: folderName,
          path: result.path,
          isDirectory: true,
          expanded: false,
          parentPath: node.path,
          children: [],
        }
        setTree(prev => {
          const addToParent = (nodes: FileTreeNode[]): FileTreeNode[] =>
            nodes.map(n => {
              if (n.path === node.path && n.children) {
                return { ...n, children: [...n.children, newNode] }
              }
              if (n.children) return { ...n, children: addToParent(n.children) }
              return n
            })
          return addToParent(prev)
        })
      } else {
        alert(result.error || '新建文件夹失败')
      }
    } catch { alert('新建文件夹失败') }
    setContextMenu(null)
  }

  const openTerminalInDir = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    try {
      const result = await window.dogeAPI.openTerminal(node.path)
      if (!result.success) {
        alert(result.error || '打开终端失败')
      }
    } catch { alert('打开终端失败') }
    setContextMenu(null)
  }

  const copyContent = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    try {
      const result = await window.dogeAPI.readFile(node.path)
      if (result.success && result.content) {
        navigator.clipboard.writeText(result.content).catch(() => {})
      } else {
        alert(result.error || '读取文件失败')
      }
    } catch { alert('读取文件失败') }
    setContextMenu(null)
  }

  const revealInExplorer = async () => {
    if (!contextMenu) return
    const { node } = contextMenu
    try {
      const result = await window.dogeAPI.revealInExplorer(node.path)
      if (!result.success) {
        alert(result.error || '操作失败')
      }
    } catch { alert('操作失败') }
    setContextMenu(null)
  }

  const loadTree = useCallback(async (dirPath: string) => {
    try {
      const items = await window.dogeAPI.listDir(dirPath)
      const nodes: FileTreeNode[] = items
        .filter((item: { name: string; isDirectory: boolean }) => !item.name.startsWith('.') && !item.name.startsWith('node_modules') && !item.name.startsWith('dist'))
        .sort((a: { isDirectory: boolean }, b: { isDirectory: boolean }) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1))
        .map((item: { name: string; isDirectory: boolean }) => ({
          name: item.name,
          path: item.isDirectory ? `${dirPath}/${item.name}` : `${dirPath}/${item.name}`,
          isDirectory: item.isDirectory,
          expanded: false,
        }))
      setTree(nodes)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    setTree([])
    setLoading(true)
    loadTree(cwd)
  }, [cwd, loadTree])

  const toggleDir = async (node: FileTreeNode) => {
    if (!node.isDirectory) return

    if (node.expanded) {
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: false } : n))
      return
    }

    if (node.children && node.children.length > 0) {
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: true } : n))
      return
    }

    setLoadingPaths((prev) => new Set(prev).add(node.path))
    setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, expanded: true, children: [] } : n))

    try {
      const items = await window.dogeAPI.listDir(node.path)
      const children: FileTreeNode[] = items
        .filter((item: { name: string; isDirectory: boolean }) => !item.name.startsWith('.') && !item.name.startsWith('node_modules') && !item.name.startsWith('dist'))
        .sort((a: { isDirectory: boolean }, b: { isDirectory: boolean }) => (a.isDirectory === b.isDirectory ? 0 : a.isDirectory ? -1 : 1))
        .map((item: { name: string; isDirectory: boolean }) => ({
          name: item.name,
          path: item.isDirectory ? `${node.path}/${item.name}` : `${node.path}/${item.name}`,
          isDirectory: item.isDirectory,
          expanded: false,
          parentPath: node.path,
        }))
      setTree((prev) => prev.map((n) => n.path === node.path ? { ...n, children, expanded: true } : n))
    } catch { /* ignore */ } finally {
      setLoadingPaths((prev) => { const next = new Set(prev); next.delete(node.path); return next })
    }
  }

  const renderNode = (node: FileTreeNode, depth: number = 0): JSX.Element[] => {
    if (searchMode === 'content') return []
    if (filter && !node.name.toLowerCase().includes(filter.toLowerCase())) return []
    const result: JSX.Element[] = []
    const isLoading = loadingPaths.has(node.path)
    result.push(
      <div
        key={node.path}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', node.path) }}
        style={{ ...appStyles.fileItem, paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => toggleDir(node)}
        onDoubleClick={() => { if (!node.isDirectory) onPreviewFile?.(node.path) }}
        onContextMenu={(e) => handleContextMenu(e, node)}
      >
        <span>{node.isDirectory ? (node.expanded ? '▼' : '▶') : getFileIcon(node.name, false)}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
          {isLoading && ' ...'}
        </span>
      </div>
    )
    if (node.isDirectory && node.expanded && node.children) {
      node.children.forEach((child) => {
        result.push(...renderNode(child, depth + 1))
      })
    }
    return result
  }

  if (loading) return <div style={{ padding: '8px', color: theme.textFaint, fontSize: '11px' }}>加载中...</div>
  if (tree.length === 0 && searchMode !== 'content') return <div style={{ padding: '8px', color: theme.textFaint, fontSize: '11px' }}>空目录</div>

  return (
    <>
      {/* 面包屑导航 */}
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #1A1A1A', display: 'flex', gap: '2px', alignItems: 'center', fontSize: '10px', flexWrap: 'wrap' }}>
        {(() => {
          const parts = cwd.split('/').filter(Boolean)
          const crumbs: Array<{ label: string; path: string }> = [{ label: '🏠', path: '' }]
          let acc = ''
          for (const p of parts) { acc += '/' + p; crumbs.push({ label: p, path: acc }) }
          return crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#444' }}>›</span>}
              <span
                style={{ color: i === crumbs.length - 1 ? theme.text : theme.textMuted, cursor: i === crumbs.length - 1 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
                onClick={() => { if (i < crumbs.length - 1) navigateTo(c.path) }}
              >{c.label}</span>
            </React.Fragment>
          ))
        })()}
      </div>
      {/* 搜索框 + 模式切换 */}
      <div style={{ padding: '4px 8px', borderBottom: '1px solid #1A1A1A' }}>
        <div style={{ display: 'flex', gap: '2px', marginBottom: '3px' }}>
          <button
            onClick={() => { setSearchMode('name'); setFilter('') }}
            style={{
              flex: 1, padding: '2px', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '9px',
              background: searchMode === 'name' ? theme.border : 'transparent', color: searchMode === 'name' ? theme.text : theme.textMuted
            }}
          >文件名</button>
          <button
            onClick={() => setSearchMode('content')}
            style={{
              flex: 1, padding: '2px', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '9px',
              background: searchMode === 'content' ? theme.border : 'transparent', color: searchMode === 'content' ? theme.text : theme.textMuted
            }}
          >内容搜索</button>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={searchMode === 'name' ? ' 搜索文件...' : ' 搜索文件内容...'}
          style={{
            width: '100%', backgroundColor: theme.bgPanel, border: `1px solid ${theme.border}`, borderRadius: '3px',
            padding: '3px 6px', color: '#F5F5F5', fontSize: '11px', outline: 'none'
          }}
        />
      </div>
      {searchMode === 'content' ? (
        <div style={{ padding: '4px 8px', fontSize: '10px', color: '#666', borderBottom: '1px solid #1A1A1A' }}>
          {searching ? '搜索中...' : searchResults.length > 0 ? `找到 ${searchResults.length} 个匹配` : filter.length >= 2 ? '输入至少 2 个字符开始搜索' : ''}
        </div>
      ) : null}
      {searchMode === 'content' ? (
        searchResults.map((r, i) => (
          <div
            key={`${r.path}-${r.line}-${i}`}
            style={{ ...appStyles.fileItem, padding: '4px 8px', cursor: 'pointer', fontSize: '10px' }}
            onClick={() => { onPreviewFile?.(r.path); setSearchResults([]); setFilter('') }}
          >
            <span style={{ color: '#888', marginRight: '4px', fontSize: '9px' }}>L{r.line}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.path.replace(cwd + '/', '')}</span>
            <span style={{ color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{r.content}</span>
          </div>
        ))
      ) : (
        tree.flatMap((node) => renderNode(node))
      )}
      {/* 文件树右键菜单 */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 9999,
            background: '#1A1A1A', border: '1px solid #333', borderRadius: '4px', padding: '4px 0',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '160px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.isDirectory ? (
            <>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#F5F5F5' }} onClick={openTerminalInDir}>
                📂 打开终端
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#F5F5F5' }} onClick={newFileInDir}>
                📄 新建文件
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#F5F5F5' }} onClick={newFolderInDir}>
                📁 新建文件夹
              </div>
              <div style={{ borderTop: '1px solid #333' }} />
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={copyPath}>
                📋 复制路径
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#888' }} onClick={renameNode}>
                ✏ 重命名
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.errorText }} onClick={deleteNode}>
                🗑 删除文件夹
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.text }} onClick={() => { onPreviewFile?.(contextMenu.node.path); setContextMenu(null) }}>
                👁 预览文件
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.text }} onClick={copyContent}>
                📝 复制内容
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.text }} onClick={revealInExplorer}>
                📂 在资源管理器中显示
              </div>
              <div style={{ borderTop: `1px solid ${theme.border}` }} />
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.textMuted }} onClick={copyPath}>
                📋 复制路径
              </div>
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: theme.textMuted }} onClick={renameNode}>
                ✏ 重命名
              </div>
              <div style={{ borderTop: '1px solid #333' }} />
              <div style={{ padding: '6px 16px', cursor: 'pointer', fontSize: '12px', color: '#FF6B6B' }} onClick={deleteNode}>
                🗑 删除文件
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
