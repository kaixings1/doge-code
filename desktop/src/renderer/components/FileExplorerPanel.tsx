/**
 * FileExplorerPanel — 文件资源管理器面板
 *
 * 仿 VS Code 侧边栏文件树：
 * - 展开/折叠目录
 * - 文件图标
 * - 搜索过滤
 * - 右键菜单（新建/删除/重命名/复制路径）
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import type { ThemeColors } from '../theme.js'
import type { FileNode, UseFileTreeReturn } from '../hooks/useFileTree.js'

interface FileExplorerPanelProps {
  fileTree: UseFileTreeReturn
  theme: ThemeColors
  onOpenFile?: (filePath: string) => void
  onClose?: () => void
}

const FILE_ICONS: Record<string, string> = {
  '.ts': '📘', '.tsx': '⚛', '.js': '📜', '.jsx': '⚛',
  '.json': '📋', '.md': '📝', '.py': '🐍', '.go': '🔷',
  '.rs': '🦀', '.java': '☕', '.css': '🎨', '.html': '🌐',
  '.yml': '⚙', '.yaml': '⚙', '.toml': '⚙', '.gitignore': '🙈',
  '.env': '🔑', '.svg': '🖼', '.png': '🖼', '.jpg': '🖼',
}

const FOLDER_ICONS: Record<string, string> = {
  'node_modules': '📦', 'src': '📁', 'dist': '📦', 'build': '🔨',
  'desktop': '🖥', 'src/renderer': '🖥', 'src/commands': '',
  'tests': '🧪', '.git': '🔀',
}

function getFileIcon(name: string): string {
  const ext = name.includes('.') ? '.' + name.split('.').pop() : ''
  return FILE_ICONS[ext] || '📄'
}

function getFolderIcon(name: string, path: string): string {
  for (const [key, icon] of Object.entries(FOLDER_ICONS)) {
    if (path.includes(key)) return icon
  }
  return '📁'
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  if (!query.trim()) return nodes
  const lower = query.toLowerCase()

  const filter = (items: FileNode[]): FileNode[] => {
    const result: FileNode[] = []
    for (const node of items) {
      const matches = node.name.toLowerCase().includes(lower)
      const filteredChildren = node.children ? filter(node.children) : []
      if (matches || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children })
      }
    }
    return result
  }
  return filter(nodes)
}

export function FileExplorerPanel({
  fileTree,
  theme,
  onOpenFile,
  onClose,
}: FileExplorerPanelProps): JSX.Element {
  const c = theme
  const { treeData, expanded, selectedPath, searchQuery, loading, error, setSearchQuery, toggleExpand, setExpanded, selectNode, handleCreateFile, handleCreateFolder, handleDelete, handleRename, setContextMenu, refresh } = fileTree
  const [contextMenuState, setContextMenuState] = useState<{ x: number; y: number; node: FileNode } | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [showCreateMenu, setShowCreateMenu] = useState(false)

  useEffect(() => {
    if (renameId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renameId])

  const filteredTree = useMemo(() => filterTree(treeData, searchQuery), [treeData, searchQuery])

  const handleNodeClick = useCallback((node: FileNode) => {
    selectNode(node)
    if (!node.isDirectory && onOpenFile) {
      onOpenFile(node.path)
    }
    if (node.isDirectory) {
      toggleExpand(node.id)
    }
  }, [selectNode, toggleExpand, onOpenFile])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    selectNode(node)
    setContextMenuState({ x: e.clientX, y: e.clientY, node })
    setShowCreateMenu(false)
  }, [selectNode])

  const startRename = useCallback((node: FileNode) => {
    setRenameId(node.id)
    setRenameValue(node.name)
    setContextMenuState(null)
  }, [])

  const commitRename = useCallback(async () => {
    if (!renameId || !renameValue.trim()) {
      setRenameId(null)
      return
    }
    const node = findNodeById(treeData, renameId)
    if (node) {
      await handleRename(node, renameValue.trim())
    }
    setRenameId(null)
  }, [renameId, renameValue, treeData, handleRename])

  const handleCreateFileLocal = useCallback(async (parent: FileNode, name: string) => {
    const result = await handleCreateFile(parent.path, name)
    if (result.success) refresh()
    setShowCreateMenu(false)
    setContextMenuState(null)
  }, [handleCreateFile, refresh])

  const handleCreateFolderAction = useCallback(async (parent: FileNode, name: string) => {
    const result = await handleCreateFolder(parent.path, name)
    if (result.success) refresh()
    setShowCreateMenu(false)
    setContextMenuState(null)
  }, [handleCreateFolder, refresh])

  const handleDeleteAction = useCallback(async (node: FileNode) => {
    const result = await handleDelete(node)
    if (result.success) refresh()
    setContextMenuState(null)
  }, [handleDelete, refresh])

  const handleCopyPath = useCallback((node: FileNode) => {
    navigator.clipboard?.writeText(node.path)
    setContextMenuState(null)
  }, [])

  // 关闭右键菜单
  useEffect(() => {
    const close = () => { setContextMenuState(null); setShowCreateMenu(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  // 搜索过滤时自动展开匹配节点
  useEffect(() => {
    if (searchQuery.trim()) {
      const expandMatching = (nodes: FileNode[]): string[] => {
        const ids: string[] = []
        for (const node of nodes) {
          if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) {
            ids.push(node.id)
          }
          if (node.children) ids.push(...expandMatching(node.children))
        }
        return ids
      }
      const matchedIds = expandMatching(treeData)
      setExpanded(prev => new Set([...prev, ...matchedIds]))
    }
  }, [searchQuery, treeData])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: c.bgPanel,
        color: c.text,
        fontSize: '11px',
        userSelect: 'none',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: `1px solid ${c.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: c.bgAlt,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '11px' }}>📁 文件资源管理器</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setShowCreateMenu(p => !p)}
            style={{
              padding: '2px 6px',
              border: `1px solid ${c.border}`,
              borderRadius: '3px',
              background: 'transparent',
              color: c.textMuted,
              cursor: 'pointer',
              fontSize: '10px',
            }}
            title="新建"
          >+</button>
          <button
            onClick={refresh}
            style={{
              padding: '2px 6px',
              border: `1px solid ${c.border}`,
              borderRadius: '3px',
              background: 'transparent',
              color: c.textMuted,
              cursor: 'pointer',
              fontSize: '10px',
            }}
            title="刷新"
          >↻</button>
        </div>
      </div>

      {/* 搜索框 */}
      <div style={{ padding: '4px 8px', borderBottom: `1px solid ${c.borderSubtle || c.border}` }}>
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="搜索文件..."
          spellCheck={false}
          style={{
            width: '100%',
            padding: '3px 6px',
            background: c.inputBg,
            border: `1px solid ${c.border}`,
            borderRadius: '3px',
            color: c.text,
            fontSize: '10px',
            outline: 'none',
          }}
        />
      </div>

      {/* 新建菜单 */}
      {showCreateMenu && (
        <div
          style={{
            padding: '4px 8px',
            borderBottom: `1px solid ${c.border}`,
            display: 'flex',
            gap: '4px',
          }}
        >
          <CreateFileMenu onFile={(name) => {
            const node = contextMenuState?.node || { id: 'root', path: '', name: '', isDirectory: true, depth: 0 }
            handleCreateFileLocal(node, name)
          }} onFolder={(name) => {
            const node = contextMenuState?.node || { id: 'root', path: '', name: '', isDirectory: true, depth: 0 }
            handleCreateFolderAction(node, name)
          }} theme={c} />
        </div>
      )}

      {/* 文件树 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '12px', color: c.textMuted, textAlign: 'center' }}>加载中...</div>
        )}
        {error && (
          <div style={{ padding: '8px', color: c.errorText || '#FF6B6B', fontSize: '10px' }}>{error}</div>
        )}
        {!loading && !error && filteredTree.length === 0 && (
          <div style={{ padding: '12px', color: c.textFaint, textAlign: 'center' }}>
            {searchQuery ? '未找到匹配文件' : '无文件'}
          </div>
        )}
        {filteredTree.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            depth={node.depth}
            expanded={expanded.has(node.id)}
            selected={selectedPath === node.path}
            renameId={renameId}
            renameValue={renameValue}
            theme={c}
            onClick={() => handleNodeClick(node)}
            onContextMenu={(e) => handleContextMenu(e, node)}
            onToggle={() => toggleExpand(node.id)}
            onRenameStart={() => startRename(node)}
            onRenameCommit={commitRename}
            onRenameChange={setRenameValue}
            inputRef={inputRef}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>

      {/* 右键菜单 */}
      {contextMenuState && (
        <ContextMenu
          x={contextMenuState.x}
          y={contextMenuState.y}
          node={contextMenuState.node}
          theme={c}
          onRename={() => startRename(contextMenuState.node)}
          onDelete={() => handleDeleteAction(contextMenuState.node)}
          onCopyPath={() => handleCopyPath(contextMenuState.node)}
          onClose={() => setContextMenuState(null)}
        />
      )}
    </div>
  )
}

// ── 树节点 ──

interface TreeNodeProps {
  node: FileNode
  depth: number
  expanded: boolean
  selected: boolean
  renameId: string | null
  renameValue: string
  theme: ThemeColors
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggle: () => void
  onRenameStart: () => void
  onRenameCommit: () => void
  onRenameChange: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  onOpenFile?: (path: string) => void
}

function TreeNode({
  node, depth, expanded, selected, renameId, renameValue, theme, onClick, onContextMenu, onToggle, onRenameStart, onRenameCommit, onRenameChange, inputRef, onOpenFile,
}: TreeNodeProps): JSX.Element {
  const c = theme
  const isRenaming = renameId === node.id
  const icon = node.isDirectory
    ? (expanded ? getFolderIcon(node.name, node.path) : getFolderIcon(node.name, node.path))
    : getFileIcon(node.name)

  return (
    <div>
      <div
        onClick={onClick}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => { e.stopPropagation(); node.isDirectory && onToggle() }}
        style={{
          padding: '2px 8px',
          paddingLeft: `${8 + depth * 14}px`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          backgroundColor: selected ? (c as any).selectionBg || `${c.accent}22` : 'transparent',
          userSelect: 'none',
        }}
        onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = (c as any).hoverBg || `${c.accent}11` }}
        onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
      >
        {/* 折叠箭头 */}
        <span
          onClick={(e) => { e.stopPropagation(); node.isDirectory && onToggle() }}
          style={{
            width: '10px',
            fontSize: '8px',
            color: c.textFaint,
            visibility: node.isDirectory ? 'visible' : 'hidden',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            display: 'inline-block',
            transition: 'transform 0.15s',
            cursor: 'pointer',
          }}
        >▼</span>
        {/* 图标 */}
        <span style={{ fontSize: '12px', width: '16px', textAlign: 'center' }}>{icon}</span>
        {/* 名称 */}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') { /* cancel */ onRenameStart() } }}
            onClick={e => e.stopPropagation()}
            spellCheck={false}
            style={{
              flex: 1,
              padding: '1px 4px',
              background: c.inputBg,
              border: `1px solid ${c.accent}`,
              borderRadius: '2px',
              color: c.text,
              fontSize: '11px',
              outline: 'none',
              fontFamily: 'monospace',
            }}
          />
        ) : (
          <span style={{ color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {node.name}
          </span>
        )}
      </div>
      {/* 子节点 */}
      {node.isDirectory && expanded && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={false}
              selected={false}
              renameId={renameId}
              renameValue={renameValue}
              theme={c}
              onClick={() => {}}
              onContextMenu={onContextMenu}
              onToggle={() => {}}
              onRenameStart={() => {}}
              onRenameCommit={() => {}}
              onRenameChange={() => {}}
              inputRef={inputRef}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── 右键菜单 ──

function ContextMenu({
  x, y, node, theme, onRename, onDelete, onCopyPath, onClose,
}: {
  x: number; y: number; node: FileNode; theme: ThemeColors
  onRename: () => void; onDelete: () => void; onCopyPath: () => void; onClose: () => void
}): JSX.Element {
  const c = theme
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 9999,
          background: c.bgPanel,
          border: `1px solid ${c.border}`,
          borderRadius: '6px',
          padding: '4px 0',
          minWidth: '160px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {!node.isDirectory && (
          <MenuItem label="📂 打开" onClick={() => { onClose; onClose() }} theme={c} />
        )}
        <MenuItem label="✏ 重命名" onClick={() => { onRename(); onClose() }} theme={c} />
        <MenuItem label="📋 复制路径" onClick={() => { onCopyPath(); onClose() }} theme={c} />
        <div style={{ borderTop: `1px solid ${c.borderSubtle || c.border}`, margin: '2px 0' }} />
        <MenuItem label="🗑 删除" onClick={() => { onDelete(); onClose() }} theme={c} danger />
      </div>
    </>
  )
}

function MenuItem({
  label, onClick, theme, danger,
}: {
  label: string; onClick: () => void; theme: ThemeColors; danger?: boolean
}): JSX.Element {
  const c = theme
  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 16px',
        cursor: 'pointer',
        color: danger ? '#FF6B6B' : c.text,
        fontSize: '11px',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${c.accent}22`}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      {label}
    </div>
  )
}

// ── 辅助函数 ──

function findNodeById(nodes: FileNode[], id: string): FileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

// ── 新建文件/文件夹快速菜单 ──

function CreateFileMenu({
  onFile, onFolder, theme,
}: {
  onFile: (name: string) => void; onFolder: (name: string) => void; theme: ThemeColors
}): JSX.Element {
  const c = theme
  const [mode, setMode] = useState<'file' | 'folder' | null>(null)
  const [name, setName] = useState('')

  const submit = () => {
    if (!name.trim()) return
    if (mode === 'file') onFile(name.trim())
    else onFolder(name.trim())
    setName('')
    setMode(null)
  }

  if (!mode) {
    return (
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => setMode('file')} style={btnStyle(c)}>📄 文件</button>
        <button onClick={() => setMode('folder')} style={btnStyle(c)}>📁 文件夹</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontSize: '10px', color: c.textFaint }}>{mode === 'file' ? '新文件:' : '新文件夹:'}</span>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setMode(null); setName('') } }}
        autoFocus
        spellCheck={false}
        style={{
          flex: 1, padding: '2px 6px', background: c.inputBg, border: `1px solid ${c.border}`,
          borderRadius: '3px', color: c.text, fontSize: '10px', outline: 'none', fontFamily: 'monospace',
        }}
      />
      <button onClick={submit} style={{ ...btnStyle(c), padding: '2px 8px' }}>确定</button>
      <button onClick={() => { setMode(null); setName('') }} style={btnStyle(c)}>取消</button>
    </div>
  )
}

const btnStyle = (c: ThemeColors): React.CSSProperties => ({
  padding: '2px 8px',
  border: `1px solid ${c.border}`,
  borderRadius: '3px',
  background: 'transparent',
  color: c.textMuted,
  cursor: 'pointer',
  fontSize: '10px',
})