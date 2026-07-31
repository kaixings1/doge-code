/**
 * useFileTree — 文件树状态管理 Hook
 *
 * 提供：
 * - 递归获取文件树结构
 * - 展开/折叠状态管理
 * - 选中文件路径
 * - 右键菜单状态
 * - 文件操作（新建/删除/重命名）
 */

import { useState, useCallback, useEffect, useRef } from 'react'

export interface FileNode {
  id: string
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
  depth: number
}

export interface UseFileTreeReturn {
  treeData: FileNode[]
  expanded: Set<string>
  selectedPath: string | null
  contextMenu: { x: number; y: number; node: FileNode } | null
  searchQuery: string
  loading: boolean
  error: string | null
  setSearchQuery: (query: string) => void
  toggleExpand: (nodeId: string) => void
  selectNode: (node: FileNode) => void
  refresh: () => Promise<void>
  handleCreateFile: (parentPath: string, name: string) => Promise<{ success: boolean; error?: string }>
  handleCreateFolder: (parentPath: string, name: string) => Promise<{ success: boolean; error?: string }>
  handleDelete: (node: FileNode) => Promise<{ success: boolean; error?: string }>
  handleRename: (node: FileNode, newName: string) => Promise<{ success: boolean; error?: string }>
  setContextMenu: (menu: { x: number; y: number; node: FileNode } | null) => void
}

export function useFileTree(cwd: string): UseFileTreeReturn {
  const [treeData, setTreeData] = useState<FileNode[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cwdRef = useRef(cwd)

  useEffect(() => {
    cwdRef.current = cwd
  }, [cwd])

  const buildTree = useCallback((nodes: any[], depth = 0): FileNode[] => {
    return nodes.map((n, i) => ({
      id: `${n.path}_${depth}_${i}`,
      name: n.name,
      path: n.path,
      isDirectory: n.isDirectory,
      depth,
      children: n.isDirectory && Array.isArray(n.children)
        ? buildTree(n.children, depth + 1)
        : undefined,
    }))
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).dogeAPI
      if (!api?.fileTree) {
        setError('fileTree API 不可用')
        setTreeData([])
        return
      }
      const result = await api.fileTree(cwdRef.current, 3)
      if (result?.success && Array.isArray(result.tree)) {
        const tree = buildTree(result.tree)
        setTreeData(tree)
        // 默认展开第一层
        if (expanded.size === 0) {
          const firstLevel = new Set(tree.map(n => n.id))
          setExpanded(firstLevel)
        }
      } else {
        setError(result?.error || '获取文件树失败')
        setTreeData([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取文件树失败')
      setTreeData([])
    } finally {
      setLoading(false)
    }
  }, [buildTree])

  useEffect(() => {
    refresh()
  }, [cwd, refresh])

  const toggleExpand = useCallback((nodeId: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const selectNode = useCallback((node: FileNode) => {
    setSelectedPath(node.path)
  }, [])

  const handleCreateFile = useCallback(async (parentPath: string, name: string): Promise<{ success: boolean; error?: string }> => {
    const api = (window as any).dogeAPI
    if (!api?.fileCreate) return { success: false, error: 'fileCreate API 不可用' }
    const result = await api.fileCreate(parentPath, name)
    if (result?.success) await refresh()
    return result
  }, [refresh])

  const handleCreateFolder = useCallback(async (parentPath: string, name: string): Promise<{ success: boolean; error?: string }> => {
    const api = (window as any).dogeAPI
    if (!api?.fileMkdir) return { success: false, error: 'fileMkdir API 不可用' }
    const result = await api.fileMkdir(parentPath, name)
    if (result?.success) await refresh()
    return result
  }, [refresh])

  const handleDelete = useCallback(async (node: FileNode): Promise<{ success: boolean; error?: string }> => {
    const api = (window as any).dogeAPI
    if (!api?.fileDelete) return { success: false, error: 'fileDelete API 不可用' }
    const result = await api.fileDelete(node.path)
    if (result?.success) {
      setExpanded(prev => {
        const next = new Set(prev)
        next.delete(node.id)
        return next
      })
      await refresh()
    }
    return result
  }, [refresh])

  const handleRename = useCallback(async (node: FileNode, newName: string): Promise<{ success: boolean; error?: string }> => {
    const api = (window as any).dogeAPI
    if (!api?.fileRename) return { success: false, error: 'fileRename API 不可用' }
    const result = await api.fileRename(node.path, newName)
    if (result?.success) await refresh()
    return result
  }, [refresh])

  return {
    treeData,
    expanded,
    selectedPath,
    contextMenu,
    searchQuery,
    loading,
    error,
    setSearchQuery,
    toggleExpand,
    selectNode,
    refresh,
    handleCreateFile,
    handleCreateFolder,
    handleDelete,
    handleRename,
    setContextMenu,
  }
}
