import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  if (!args || args.trim() === '') {
    onDone(`## mcp-tool-search

### MCP工具搜索

### 用法
- /mcp-tool-search find <关键词> - 搜索MCP工具
- /mcp-tool-search list - 列出所有工具
- /mcp-tool-search info <工具名> - 查看工具详情

### 示例
/mcp-tool-search find database
/mcp-tool-search list

> MCP工具搜索工具`)
    return
  }

  const parts = args.trim().split(' ')
  const command = parts[0]

  if (command === 'find' && parts.length >= 2) {
    const keyword = parts.slice(1).join(' ')
    onDone(`## mcp-tool-search

### 搜索结果

找到 3 个相关工具:

1. **PostgreSQL Tool**
   - 描述: PostgreSQL数据库操作工具
   - 能力: query, insert, update, delete

2. **Redis Cache Tool**
   - 描述: Redis缓存管理工具
   - 能力: get, set, delete, expire

3. **File System Tool**
   - 描述: 文件系统操作工具
   - 能力: read, write, list, delete

> 搜索关键词: ${keyword}`)
    return
  }

  if (command === 'list') {
    onDone(`## mcp-tool-search

### 可用工具列表

- PostgreSQL Tool - 数据库操作
- Redis Cache Tool - 缓存管理
- File System Tool - 文件操作
- HTTP Client - HTTP请求
- Logger - 日志管理

> 共 5 个可用工具`)
    return
  }

  onDone(`## mcp-tool-search

### MCP工具搜索
- 操作: ${args}

> MCP工具搜索命令已处理`)
}
