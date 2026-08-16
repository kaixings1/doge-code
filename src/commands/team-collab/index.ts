import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import type { LocalCommandResult } from '../../types/command.js'

const call: LocalCommandCall = async (args, _context): Promise<LocalCommandResult> => {
  const trimmed = args.trim()
  if (!trimmed) {
    return {
      type: 'text',
      value: '用法：/team-collab <任务描述>\n\n示例：\n  /team-collab 实现用户认证模块\n  /team-collab 重构支付流程\n  /team-collab 分析代码库中的安全漏洞',
    }
  }

  try {
    const { ToolCollectionOrchestrator } = await import('../tools/ToolCollectionTool/toolCollectionOrchestrator.js')
    const orchestrator = new ToolCollectionOrchestrator()
    const discovery = orchestrator.discoverTools(trimmed)
    const recommendedTools = discovery.recommended.slice(0, 5).map(r => r.tool)

    const output = [
      '## 多角色协作编排',
      '',
      `**任务描述**：${trimmed}`,
      `**推荐工具链**：${recommendedTools.join(' -> ') || '根据任务动态选择'}`,
      `**执行管道**：${discovery.pipeline.join(' -> ') || '自动规划'}`,
      '',
      '### 阶段规划',
      '| 阶段 | 角色 | 职责 |',
      '|------|------|------|',
      '| 1. 调研 | Researcher | 代码库现状分析 |',
      '| 2. 分析 | PM | 需求分析，编写 PRD |',
      '| 3. 设计 | Architect | 技术方案设计 |',
      '| 4. 规划 | TeamLeader | 任务分解和分配 |',
      '| 5. 实现 | Engineer | 代码实现 |',
      '| 6. 验证 | QA | 测试和质量检查 |',
      '| 7. 审查 | TeamLeader | 最终审核交付 |',
      '',
      '### 工具发现结果',
      ...discovery.recommended.map(r => `- **${r.tool}** (${(r.confidence * 100).toFixed(0)}%): ${r.reason}`),
      '',
    ].join('\n')

    return { type: 'text', value: output }
  } catch (error) {
    return {
      type: 'text',
      value: `协作编排失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

const teamCollab = {
  type: 'local',
  name: 'team-collab',
  description: '多角色协作编排：PM -> Architect -> Engineer -> QA 全流程',
  load: () => Promise.resolve({ call }),
} as Command

export default teamCollab
