import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join, basename } from 'path';
const inputSchema = lazySchema(() => z.object({
    script: z.string().describe('工作流脚本名称或内容'),
    args: z.record(z.string()).optional().describe('脚本参数'),
    mode: z.enum(['run', 'list', 'create', 'delete', 'show']).optional().describe('工作流操作模式'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('工作流是否执行成功'),
    output: z.string().optional().describe('工作流输出'),
    error: z.string().optional().describe('错误消息'),
    workflows: z.array(z.string()).optional().describe('工作流列表'),
    steps: z.array(z.string()).optional().describe('工作流步骤'),
}));
const WORKFLOW_DIR = join(process.env.TEMP || '.', 'doge-workflows');
async function ensureWorkflowDir() {
    try {
        await mkdir(WORKFLOW_DIR, { recursive: true });
    }
    catch {
        // directory may already exist
    }
}
async function loadWorkflow(name) {
    try {
        await ensureWorkflowDir();
        const content = await readFile(join(WORKFLOW_DIR, `${name}.workflow.json`), { encoding: 'utf8' });
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
async function saveWorkflow(workflow) {
    await ensureWorkflowDir();
    await writeFile(join(WORKFLOW_DIR, `${workflow.name}.workflow.json`), JSON.stringify(workflow, null, 2), { encoding: 'utf8' });
}
async function listWorkflows() {
    try {
        await ensureWorkflowDir();
        const files = await readdir(WORKFLOW_DIR);
        return files.filter(f => f.endsWith('.workflow.json')).map(f => basename(f, '.workflow.json'));
    }
    catch {
        return [];
    }
}
function parseWorkflowScript(script) {
    const steps = [];
    const lines = script.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        if (trimmed.startsWith('->') || trimmed.startsWith('step ')) {
            steps.push(trimmed.replace(/^(->|step\s+)/i, '').trim());
        }
        else if (trimmed.startsWith('run ') || trimmed.startsWith('execute ')) {
            steps.push(trimmed.replace(/^(run|execute)\s+/i, '').trim());
        }
        else if (trimmed.match(/^[\w./-]+/)) {
            const match = trimmed.match(/^([\w./-]+(?:\s+[\w./-]+)*)/);
            if (match)
                steps.push(match[1]);
        }
    }
    if (steps.length === 0 && script.trim()) {
        steps.push(script.trim());
    }
    return steps;
}
async function executeWorkflowStep(step, args) {
    const interpolated = step.replace(/\$\{(\w+)\}/g, (_, key) => args[key] ?? `$${key}`);
    return `[执行] ${interpolated}`;
}
export const WorkflowTool = buildTool({
    name: 'workflow',
    description: async () => '执行工作流脚本（支持 run/list/create/delete/show）',
    callOn: 'manual',
    async prompt() {
        return '使用 workflow 工具管理工作流。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'workflow';
    },
    isEnabled() {
        return true;
    },
    toAutoClassifierInput() {
        return '';
    },
    async checkPermissions(input) {
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage(input) {
        const mode = (input?.mode || input?.script?.slice(0, 20)) ?? '?';
        return `Workflow: ${mode}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.output || content.message || 'Workflow operation completed',
        };
    },
    async call({ script, args = {}, mode = 'run' }) {
        switch (mode) {
            case 'list': {
                const workflows = await listWorkflows();
                return {
                    data: {
                        success: true,
                        workflows,
                        output: workflows.length > 0 ? `找到 ${workflows.length} 个工作流: ${workflows.join(', ')}` : '暂无工作流',
                    },
                };
            }
            case 'show': {
                const workflow = await loadWorkflow(script);
                if (!workflow) {
                    return { data: { success: false, output: '', error: `工作流 "${script}" 不存在` } };
                }
                return {
                    data: {
                        success: true,
                        output: `${workflow.description || workflow.name}\n步骤:\n${workflow.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`,
                        steps: workflow.steps,
                    },
                };
            }
            case 'create': {
                const steps = parseWorkflowScript(script);
                if (steps.length === 0) {
                    return { data: { success: false, output: '', error: '工作流脚本为空' } };
                }
                const workflowName = args.name || `workflow_${Date.now()}`;
                const workflow = {
                    name: workflowName,
                    description: args.description || '',
                    steps,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                await saveWorkflow(workflow);
                return {
                    data: {
                        success: true,
                        output: `工作流 "${workflowName}" 已创建 (${steps.length} 步骤)`,
                        steps,
                    },
                };
            }
            case 'delete': {
                const { unlink } = await import('fs/promises');
                try {
                    await unlink(join(WORKFLOW_DIR, `${script}.workflow.json`));
                    return { data: { success: true, output: `工作流 "${script}" 已删除` } };
                }
                catch {
                    return { data: { success: false, output: '', error: `工作流 "${script}" 不存在` } };
                }
            }
            case 'run': {
                // 检查是否已命名工作流
                let steps = [];
                const namedWorkflow = await loadWorkflow(script);
                if (namedWorkflow) {
                    steps = namedWorkflow.steps;
                }
                else {
                    steps = parseWorkflowScript(script);
                }
                if (steps.length === 0) {
                    return { data: { success: false, output: '', error: '工作流为空或不存在' } };
                }
                const outputs = [];
                let failed = false;
                for (let i = 0; i < steps.length; i++) {
                    const step = steps[i];
                    try {
                        const result = await executeWorkflowStep(step, args);
                        outputs.push(`[${i + 1}/${steps.length}] ${result}`);
                    }
                    catch (err) {
                        outputs.push(`[${i + 1}/${steps.length}] 失败: ${err instanceof Error ? err.message : String(err)}`);
                        failed = true;
                        break;
                    }
                }
                const summary = outputs.join('\n');
                return {
                    data: {
                        success: !failed,
                        output: `${failed ? '工作流执行失败' : '工作流执行完成'}\n${summary}`,
                        steps,
                        error: failed ? '某步骤执行失败' : undefined,
                    },
                };
            }
        }
    },
});
//# sourceMappingURL=WorkflowTool.js.map