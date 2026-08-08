import type { LocalCommandCall } from '../../types/command.js'

const call: LocalCommandCall = async (args) => {
  const query = args.trim()
  if (!query) {
    return { output: '用法: /mcp-config <list|add|remove> [args...]', truncated: false }
  }
  return { output: `/mcp-config ${query} — 功能开发中`, truncated: false }
}

export default call
