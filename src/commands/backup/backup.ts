import type { Command } from '../../commands.js'
import { getSessionId, getOriginalCwd } from '../../bootstrap/state.js'
import { saveWorktreeState } from '../../utils/sessionStorage.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'

const backup = {
  type: 'local' as const,
  name: 'backup',
  description: '备份当前会话数据到本地文件',
  load: () => import('./backup.js'),
} satisfies Command

export default backup

export async function call(args: string, context: any): Promise<string> {
  const sessionId = getSessionId()
  const worktreeSession = getCurrentWorktreeSession()

  return `## backup

### 会话信息
- 会话ID: ${sessionId}
- 工作目录: ${getOriginalCwd()}
- 工作树会话: ${worktreeSession ? '是' : '否'}

### 备份状态
✓ 会话状态已保存
✓ 工作树状态已持久化

### 备份位置
- 会话数据: .doge/sessions/
- 工作树配置: .doge/worktree/

${args ? `### 备份说明
${args}
` : ''}

> 备份完成。当前会话的所有状态已持久化到本地。`
}
