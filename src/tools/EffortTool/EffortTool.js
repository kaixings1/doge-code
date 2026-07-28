import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    level: z.enum(['low', 'medium', 'high', 'max']).describe('努力程度级别'),
    model: z.string().optional().describe('目标模型（可选）'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('是否成功设置努力程度'),
    previousLevel: z.string().optional().describe('之前的努力程度'),
    newLevel: z.string().describe('新的努力程度'),
    description: z.string().describe('级别描述'),
}));
const EFFORT_LEVELS = {
    low: { description: '快速响应，适合简单任务', maxTokens: 4096, thinkingBudget: 1024 },
    medium: { description: '平衡速度和质量', maxTokens: 8192, thinkingBudget: 4096 },
    high: { description: '深度思考，适合复杂任务', maxTokens: 16384, thinkingBudget: 8192 },
    max: { description: '最大努力，适合最复杂任务', maxTokens: 32768, thinkingBudget: 16384 },
};
let currentEffortLevel = null;
const effortHistory = [];
export const EffortTool = buildTool({
    name: 'effort',
    description: async () => '为支持的模型设置努力程度级别（低/中/高/最大）',
    callOn: 'manual',
    async prompt() {
        return '使用 effort 工具调整模型推理努力程度。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'effort';
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
        const level = input?.level ?? '?';
        const model = input?.model;
        return `Effort: ${level}${model ? ` (${model})` : ''}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const prev = content.previousLevel;
        const next = content.newLevel;
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Effort set to ${next}${prev ? ` (was ${prev})` : ''}`,
        };
    },
    async call({ level, model }) {
        const previousLevel = currentEffortLevel;
        const config = EFFORT_LEVELS[level];
        currentEffortLevel = level;
        effortHistory.push({ level, model, timestamp: Date.now() });
        const changes = [];
        if (previousLevel && previousLevel !== level) {
            changes.push(`努力程度从 ${previousLevel} 变更为 ${level}`);
        }
        else if (!previousLevel) {
            changes.push(`努力程度首次设置为 ${level}`);
        }
        if (model) {
            changes.push(`应用于模型: ${model}`);
        }
        changes.push(`maxTokens: ${config.maxTokens}, thinkingBudget: ${config.thinkingBudget}`);
        return {
            data: {
                success: true,
                previousLevel,
                newLevel: level,
                description: config.description,
            },
        };
    },
});
//# sourceMappingURL=EffortTool.js.map