import { feature } from 'bun:bundle';
const HELP_TEXT = `🏗️ Workflow 命令

**用法**: /workflows <子命令> [参数]

**子命令**:
  list              - 列出所有工作流
  show <名称>       - 查看工作流详情
  run <脚本>        - 执行工作流
  create <脚本>     - 创建命名工作流
  delete <名称>     - 删除工作流

**示例**:
  /workflows list                    # 列出所有工作流
  /workflows run "build && test"     # 执行内联工作流
  /workflows create deploy.txt       # 从文件创建工作流
  /workflows delete deploy           # 删除工作流`;
const workflows = {
    type: 'local',
    name: 'workflows',
    description: '管理工作流脚本 — 创建、列出、运行和删除可复用任务序列',
    argumentHint: '<list|show|run|create|delete>',
    isEnabled: () => feature('WORKFLOW_SCRIPTS'),
    supportsNonInteractive: false,
    load: () => Promise.resolve({
        call: async (args, context) => {
            const trimmed = (args ?? '').trim();
            if (!trimmed) {
                return { type: 'text', value: HELP_TEXT };
            }
            const parts = trimmed.split(/\s+/);
            const mode = parts[0].toLowerCase();
            const rest = parts.slice(1).join(' ');
            const validModes = ['list', 'show', 'run', 'create', 'delete'];
            if (!validModes.includes(mode)) {
                return {
                    type: 'text',
                    value: `❌ 未知子命令: ${mode}\n\n${HELP_TEXT}`
                };
            }
            try {
                const { WorkflowTool } = await import('../../tools/WorkflowTool/WorkflowTool.js');
                const toolInstance = new WorkflowTool();
                const script = mode === 'list' ? '' : rest;
                const result = await toolInstance.call({ script, mode: mode }, context, context.canUseTool, undefined);
                if (result && typeof result === 'object' && 'data' in result) {
                    const data = result.data;
                    return {
                        type: 'text',
                        value: data.output || data.message || JSON.stringify(data, null, 2)
                    };
                }
                return {
                    type: 'text',
                    value: String(result)
                };
            }
            catch (e) {
                return {
                    type: 'text',
                    value: `❌ 工作流操作失败: ${e instanceof Error ? e.message : String(e)}`
                };
            }
        }
    })
};
export default workflows;
//# sourceMappingURL=index.js.map