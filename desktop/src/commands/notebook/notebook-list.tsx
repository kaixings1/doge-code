import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput, useApp, Newline } from '../../ink.js'
import { searchNotes, getAllTags, getDatabase } from '../../services/notebook/database.js'
import type { Note, PaginatedResult } from '../../services/notebook/schema.js'
import { BaseTextInput } from '../../components/BaseTextInput.js'

// ====== Props ======

interface NotebookListProps {
  onSelect: (note: Note) => void
  onNew: () => void
  onDelete: (id: string) => void
  onBack: () => void
  initialSearch?: string
}

// ====== 颜色常量 ======

const Colors = {
  pinned: '#FFD700',
  title: '#00BFFF',
  tag: '#32CD32',
  meta: '#888888',
  highlight: '#FF6600',
  border: '#555555',
}

// ====== 主组件 ======

export default function NotebookList({
  onSelect,
  onNew,
  onDelete,
  onBack,
  initialSearch,
}: NotebookListProps) {
  const { exit } = useApp()
  const [result, setResult] = useState<PaginatedResult<Note> | null>(null)
  const [searchQuery, setSearchQuery] = useState(initialSearch ?? '')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [showSearch, setShowSearch] = useState(false)
  const [searchTag, setSearchTag] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [filterTag, setFilterTag] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const loadNotes = useCallback(() => {
    try {
      const r = searchNotes({
        query: searchQuery || void 0,
        tag: filterTag || void 0,
        page,
        limit: 20,
      })
      setResult(r)
      setSelectedIndex(0)
      setAllTags(getAllTags())
    } catch (err) {
      setStatusMessage('加载失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [searchQuery, filterTag, page])

  // 只在首次挂载加载
  const loadedRef = React.useRef(false)
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true
      loadNotes()
    }
  }, [])

  useInput((input, key) => {
    if (key.escape) {
      if (showSearch) {
        setShowSearch(false)
        setSearchQuery('')
        setSearchTag('')
      } else if (filterTag) {
        setFilterTag('')
      } else {
        onBack()
      }
      return
    }

    if (showSearch) {
      return
    }

    if (!result) return

    switch (true) {
      case key.upArrow:
        setSelectedIndex(Math.max(0, selectedIndex - 1))
        break
      case key.downArrow:
        setSelectedIndex(Math.min(result.items.length - 1, selectedIndex + 1))
        break
      case key.leftArrow:
        if (page > 1) setPage(page - 1)
        break
      case key.rightArrow:
        if (page < result.totalPages) setPage(page + 1)
        break
      case input === 'n':
        onNew()
        break
      case input === '/':
        setShowSearch(true)
        break
      case input === 'd':
        if (result.items[selectedIndex]) {
          onDelete(result.items[selectedIndex].id)
          loadNotes()
        }
        break
      case key.return:
        if (result.items[selectedIndex]) {
          onSelect(result.items[selectedIndex])
        }
        break
      case input === 'q':
        exit()
        break
      case input === 'c':
        if (filterTag) setFilterTag('')
        break
    }
  })

  // 搜索框组件
  if (showSearch) { return ( <Box flexDirection="column" padding={1}> <Text bold color={Colors.highlight}>搜索笔记</Text> <Newline /> <Box> <Text>关键词: </Text> <BaseTextInput value={searchQuery} onChange={setSearchQuery} placeholder="输入搜索关键词..." autoFocus /> </Box> <Box marginTop={1}> <Text>标签: </Text> <BaseTextInput value={searchTag} onChange={setSearchTag} placeholder="输入标签名（可选）..." /> </Box> <Box marginTop={1}> <Text color={Colors.border}> [Enter] 搜索 [Esc] 取消 </Text> </Box> </Box> ) } // 空状态 if (!result || result.items.length === 0) { return ( <Box flexDirection="column" padding={1}> <Box> <Text bold>📝 笔记列表</Text> </Box> <Newline /> <Box> <Text color={Colors.meta}> {searchQuery || filterTag ? '未找到匹配的笔记。' : '暂无笔记。'} </Text> </Box> <Newline /> <Box> <Text color={Colors.border}> [n] 新建笔记 [/] 搜索 [q] 退出 {filterTag && <Text color={Colors.highlight}> [c] 清除筛选: {filterTag}</Text>} </Text> </Box> </Box> ) } return ( <Box flexDirection="column" padding={1}> {/* 标题栏 */} <Box> <Text bold>📝 笔记列表</Text> <Text color={Colors.meta}> ({result.total} 条)</Text> </Box> {/* 搜索/筛选提示 */} {(searchQuery || filterTag) && ( <Box marginTop={1}> <Text color={Colors.highlight}> 筛选: {searchQuery && `"${searchQuery}" `} {filterTag && `#${filterTag} `} [Esc] 清除 </Text> </Box> )} {/* 标签栏 */} {allTags.length > 0 && !filterTag && ( <Box marginTop={1} flexWrap="wrap"> <Text color={Colors.meta}>标签: </Text> {allTags.slice(0, 8).map((tag) => ( <Box key={tag} marginRight={1}> <Text color={Colors.tag} inverse={filterTag === tag} onPress={() => setFilterTag(filterTag === tag ? '' : tag)} > #{tag} </Text> </Box> ))} {allTags.length > 8 && ( <Text color={Colors.meta}>...</Text> )} </Box> )} {/* 列表 */} <Box marginTop={1} flexDirection="column"> {result.items.map((note, index) => { const isSelected = index === selectedIndex const isPinned = note.isPinned const date = new Date(note.updatedAt) const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` return ( <Box key={note.id} flexDirection="row"> <Text color={isSelected ? Colors.highlight : Colors.border}> {isSelected ? '> ' : ' '} </Text> <Text color={isPinned ? Colors.pinned : (isSelected ? Colors.highlight : Colors.title)} bold={isPinned || isSelected} > {isPinned ? '📌 ' : ''}{note.title} </Text> <Text color={Colors.meta}> {dateStr}</Text> {note.tags.length > 0 && ( <Text color={Colors.tag}> {' '}{note.tags.slice(0, 3).map(t => `#${t}`).join(' ')} {note.tags.length > 3 ? '...' : ''} </Text> )} </Box> ) })} </Box> {/* 分页 */} {result.totalPages > 1 && ( <Box marginTop={1}> <Text color={Colors.border}> [←/→] 翻页 ({result.page}/{result.totalPages}) </Text> </Box> )} {/* 状态栏 */} <Box marginTop={1}> <Text color={Colors.border}> [↑/↓] 选择 [Enter] 查看 [n] 新建 [/] 搜索 [d] 删除 [Esc] 返回 [q] 退出 </Text> </Box> {statusMessage && ( <Box marginTop={1}> <Text color={Colors.highlight}>{statusMessage}</Text> </Box> )} </Box> )
}
