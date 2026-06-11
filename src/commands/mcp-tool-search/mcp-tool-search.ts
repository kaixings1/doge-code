import type { LocalCommandCall } from '../../types/command.js'
import React from 'react'
export const call: LocalCommandCall = async (args, _context) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || 'list'
  const query = parts.slice(1).join(' ') || ''
  // 模拟 MCP 工具数据
  const mockTools = [
    {
      name: 'file-system',
      description: 'Read and write files, list directories, and inspect file metadata',
      category: 'filesystem',
      tags: ['files', 'io'],
      author: 'modelcontextprotocol',
      version: '1.0.0',
      downloads: 125000,
      rating: 4.8,
      capabilities: ['read', 'write', 'list', 'info']
    },
    {
      name: 'postgres',
      description: 'Query and manage PostgreSQL databases',
      category: 'database',
      tags: ['sql', 'postgresql', 'database'],
      author: 'modelcontextprotocol',
      version: '0.9.0',
      downloads: 89000,
      rating: 4.6,
      capabilities: ['query', 'schema', 'migrate']
    },
    {
      name: 'brave-search',
      description: 'Search the web using Brave Search API',
      category: 'search',
      tags: ['web', 'search', 'api'],
      author: 'brave',
      version: '1.2.0',
      downloads: 67000,
      rating: 4.7,
      capabilities: ['search', 'summarize']
    },
    {
      name: 'github',
      description: 'Access GitHub repositories, issues, and pull requests',
      category: 'development',
      tags: ['git', 'github', 'repositories'],
      author: 'modelcontextprotocol',
      version: '1.1.0',
      downloads: 156000,
      rating: 4.9,
      capabilities: ['repos', 'issues', 'pulls', 'commits']
    },
    {
      name: 'slack',
      description: 'Send and receive messages in Slack workspaces',
      category: 'communication',
      tags: ['slack', 'messaging', 'chat'],
      author: 'slack',
      downloads: 45000,
      rating: 4.4,
      capabilities: ['send', 'receive', 'channels', 'users']
    },
    {
      name: 'memory-bank',
      description: 'Store and retrieve memories and context',
      category: 'memory',
      tags: ['memory', 'context', 'storage'],
      author: 'modelcontextprotocol',
      version: '0.7.0',
      downloads: 34000,
      rating: 4.3,
      capabilities: ['store', 'recall', 'search']
    },
    {
      name: 'sequential-thinking',
      description: 'Tool for dynamic and reflective problem-solving',
      category: 'reasoning',
      tags: ['thinking', 'reasoning', 'planning'],
      author: 'modelcontextprotocol',
      version: '1.0.0',
      downloads: 78000,
      rating: 4.8,
      capabilities: ['think', 'plan', 'reason']
    },
    {
      name: 'fetch',
      description: 'Make HTTP requests to external APIs',
      category: 'http',
      tags: ['http', 'api', 'fetch'],
      author: 'modelcontextprotocol',
      version: '1.0.0',
      downloads: 203000,
      rating: 4.9,
      capabilities: ['get', 'post', 'put', 'delete', 'patch']
    },
    {
      name: 'playwright',
      description: 'Browser automation and web scraping',
      category: 'automation',
      tags: ['browser', 'automation', 'scraping'],
      author: 'playwright',
      version: '0.6.0',
      downloads: 52000,
      rating: 4.5,
      capabilities: ['navigate', 'click', 'scrape', 'screenshot']
    },
    {
      name: 'terminal',
      description: 'Execute terminal commands and scripts',
      category: 'system',
      tags: ['terminal', 'shell', 'commands'],
      author: 'modelcontextprotocol',
      version: '1.0.0',
      downloads: 187000,
      rating: 4.7,
      capabilities: ['execute', 'read', 'write']
    }
  ]
  let resultTools = mockTools
  // 根据操作过滤工具
  switch (operation) {
    case 'search':
    case 'find':
      if (!query) {
        return {
          type: 'text',
          value: '请提供搜索关键词\n用法: /mcp-tool-search search <关键词>'
        }
      }
      resultTools = mockTools.filter(tool =>
        tool.name.toLowerCase().includes(query.toLowerCase()) ||
        tool.description.toLowerCase().includes(query.toLowerCase()) ||
        tool.category.toLowerCase().includes(query.toLowerCase()) ||
        tool.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      )
      break
    case 'category':
    case 'cat':
      if (!query) {
        return {
          type: 'text',
          value: '请提供分类名称\n用法: /mcp-tool-search category <分类>'
        }
      }
      resultTools = mockTools.filter(tool => tool.category === query.toLowerCase())
      break
    case 'popular':
      resultTools = [...mockTools].sort((a, b) => b.downloads - a.downloads)
      break
    case 'top-rated':
      resultTools = [...mockTools].sort((a, b) => b.rating - a.rating)
      break
    case 'list':
    default:
      // 显示所有工具
      break
  }
  // 格式化工具列表
  const toolsList = resultTools.map(tool =>
    `${tool.name.padEnd(25)} | ${tool.category.padEnd(15)} | ⭐${tool.rating} | 📥${tool.downloads.toLocaleString()} | ${tool.description.substring(0, 50)}...`
  ).join('\n')
  // 统计信息
  const stats = {
    total: mockTools.length,
    categories: [...new Set(mockTools.map(t => t.category))].length,
    avgRating: (mockTools.reduce((sum, t) => sum + t.rating, 0) / mockTools.length).toFixed(1),
    totalDownloads: mockTools.reduce((sum, t) => sum + t.downloads, 0).toLocaleString()
  }
  let resultText = ''
  switch (operation) {
    case 'search':
    case 'find':
      resultText = `搜索结果: "${query}"\n\n找到 ${resultTools.length} 个工具\n\n` +
        toolsList + '\n\n' +
        `使用 /mcp-tool-search list 查看所有工具`
      break
    case 'category':
    case 'cat':
      resultText = `分类: ${query}\n\n找到 ${resultTools.length} 个工具\n\n` +
        toolsList + '\n\n' +
        `使用 /mcp-tool-search list 查看所有分类`
      break
    case 'popular':
      resultText = `最受欢迎工具\n\n` +
        toolsList + '\n\n' +
        `按下载量排序`
      break
    case 'top-rated':
      resultText = `最高评分工具\n\n` +
        toolsList + '\n\n' +
        `按评分排序`
      break
    default:
      resultText = `MCP 工具市场\n\n` +
        `统计信息:\n` +
        `  总工具数: ${stats.total}\n` +
        `  分类数量: ${stats.categories}\n` +
        `  平均评分: ${stats.avgRating}\n` +
        `  总下载量: ${stats.totalDownloads}\n\n` +
        `可用工具:\n\n` +
        toolsList + '\n\n' +
        `命令:\n` +
        `  /mcp-tool-search search <关键词>  - 搜索工具\n` +
        `  /mcp-tool-search category <分类>  - 按分类筛选\n` +
        `  /mcp-tool-search popular           - 最受欢迎\n` +
        `  /mcp-tool-search top-rated         - 最高评分`
  }
  return {
    type: 'text',
    value: resultText
  }
}
export default {
  name: 'mcp-tool-search',
  type: 'local',
  description: '搜索和管理 MCP 工具',
  call: call
}
