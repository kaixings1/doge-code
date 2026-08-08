import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import {
  addGlossaryTerm,
  getGlossaryTerm,
  listGlossaryTerms,
  loadGlossary,
  removeGlossaryTerm,
  searchGlossary,
} from '../../utils/config/glossary.js'

const call: LocalCommandCall = async (args) => {
  const trimmed = args.trim()
  const parts = trimmed.split(/\s+/)
  const action = parts[0]?.toLowerCase()
  const subArgs = parts.slice(1)

  switch (action) {
    case 'add':
      return handleAdd(subArgs)
    case 'remove':
    case 'rm':
      return handleRemove(subArgs[0])
    case 'list':
    case 'ls':
      return handleList()
    case 'search':
    case 'find':
      return handleSearch(subArgs.join(' '))
    case 'help':
    case '--help':
    case '-h':
    default: {
      if (!trimmed) {
        return {
          type: 'text' as const,
          value: getHelpText(),
        }
      }
      return handleLookup(trimmed)
    }
  }
}

function handleAdd(args: string[]): LocalCommandResult {
  if (args.length < 2) {
    return {
      type: 'text' as const,
      value: '用法: /glossary add <术语> <定义>\n\n示例:\n  /glossary add API 应用程序接口\n  /glossary add "REST API" 表现层状态转换接口',
    }
  }

  const term = args[0]
  const definition = args.slice(1).join(' ')

  const existing = getGlossaryTerm(term)
  const entry = addGlossaryTerm(term, definition)

  if (existing) {
    return {
      type: 'text' as const,
      value: `✅ 已更新术语: ${term}\n   旧定义: ${existing.definition}\n   新定义: ${definition}`,
    }
  }

  return {
    type: 'text' as const,
    value: `✅ 已添加术语: ${term}\n   定义: ${definition}`,
  }
}

function handleRemove(term?: string): LocalCommandResult {
  if (!term) {
    return {
      type: 'text' as const,
      value: '用法: /glossary remove <术语>\n\n示例:\n  /glossary remove API',
    }
  }

  if (removeGlossaryTerm(term)) {
    return {
      type: 'text' as const,
      value: `✅ 已删除术语: ${term}`,
    }
  }

  return {
    type: 'text' as const,
    value: `❌ 未找到术语: ${term}\n使用 /glossary list 查看所有术语`,
  }
}

function handleList(): LocalCommandResult {
  const terms = listGlossaryTerms()
  const data = loadGlossary()

  if (terms.length === 0) {
    return {
      type: 'text' as const,
      value: '📖 术语表为空\n\n使用 /glossary add <术语> <定义> 添加术语',
    }
  }

  const lines = [`📖 术语表 (${terms.length} 个术语)`, '']

  for (const entry of terms) {
    lines.push(`  • ${entry.term}`)
    lines.push(`    ${entry.definition}`)
    lines.push('')
  }

  lines.push('使用 /glossary <术语> 查看定义')
  lines.push('使用 /glossary add <术语> <定义> 添加术语')

  return { type: 'text' as const, value: lines.join('\n') }
}

function handleSearch(query: string): LocalCommandResult {
  if (!query) {
    return {
      type: 'text' as const,
      value: '用法: /glossary search <关键词>\n\n示例:\n  /glossary search API\n  /glossary search 数据库',
    }
  }

  const results = searchGlossary(query)

  if (results.length === 0) {
    return {
      type: 'text' as const,
      value: `🔍 未找到包含 "${query}" 的术语\n\n使用 /glossary list 查看所有术语`,
    }
  }

  const lines = [`🔍 搜索结果 (${results.length} 个匹配):`, '']

  for (const entry of results) {
    lines.push(`  • ${entry.term}`)
    lines.push(`    ${entry.definition}`)
    lines.push('')
  }

  return { type: 'text' as const, value: lines.join('\n') }
}

function handleLookup(term: string): LocalCommandResult {
  const entry = getGlossaryTerm(term)

  if (entry) {
    return {
      type: 'text' as const,
      value: `📖 ${entry.term}\n\n${entry.definition}\n\n使用 /glossary list 查看所有术语`,
    }
  }

  // If not found, suggest similar terms
  const allTerms = listGlossaryTerms()
  const suggestions = allTerms
    .filter(t => t.term.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 5)

  let output = `❌ 未找到术语: ${term}\n`
  if (suggestions.length > 0) {
    output += `\n您是否要找:\n`
    for (const suggestion of suggestions) {
      output += `  • ${suggestion.term} - ${suggestion.definition}\n`
    }
  }
  output += `\n使用 /glossary add "${term}" <定义> 添加此术语`

  return { type: 'text' as const, value: output }
}

function getHelpText(): string {
  return [
    '📖 项目术语表管理',
    '',
    '用法:',
    '  /glossary <术语>              - 查找术语定义',
    '  /glossary add <术语> <定义>   - 添加术语',
    '  /glossary remove <术语>       - 删除术语',
    '  /glossary list                - 列出所有术语',
    '  /glossary search <关键词>     - 搜索术语',
    '',
    '示例:',
    '  /glossary API',
    '  /glossary add "REST API" 表现层状态转换接口',
    '  /glossary search 数据库',
    '  /glossary remove API',
    '',
    '术语表存储位置: ~/.doge/glossary.json',
  ].join('\n')
}

export default call
