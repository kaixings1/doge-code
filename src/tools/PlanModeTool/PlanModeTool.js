import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { applyPermissionUpdate } from '../../utils/permissions/PermissionUpdate.js';
import { prepareContextForPlanMode } from '../../utils/permissions/permissionSetup.js';
import { handlePlanModeTransition } from '../../bootstrap/state.js';
const inputSchema = lazySchema(() => z.object({
    action: z.enum(['enter', 'exit', 'status']).describe('要执行的操作'),
}));
const outputSchema = lazySchema(() => z.object({
    active: z.boolean().describe('计划模式是否激活'),
    action: z.string().describe('执行的操作'),
    message: z.string().optional().describe('状态消息'),
}));
export const PlanModeTool = buildTool({
    name: 'plan-mode',
    description: async () => '管理计划模式状态（enter/exit/status）',
    callOn: 'manual',
    async prompt() {
        return '使用 plan-mode 工具管理计划模式状态。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'plan-mode';
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
        const action = input?.action ?? '?';
        return `PlanMode: ${action}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const msg = content.message || 'Plan mode operation completed';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: msg,
        };
    },
    async call({ action }, context) {
        if (action === 'status') {
            const currentMode = context.getAppState().toolPermissionContext.mode;
            const active = currentMode === 'plan';
            return {
                data: {
                    active,
                    action,
                    message: `Plan mode is ${active ? 'active' : 'inactive'} (mode=${currentMode})`,
                },
            };
        }
        const currentMode = context.getAppState().toolPermissionContext.mode;
        const targetMode = action === 'enter' ? 'plan' : 'auto';
        handlePlanModeTransition(currentMode, targetMode);
        context.setAppState(prev => ({
            ...prev,
            toolPermissionContext: applyPermissionUpdate(prepareContextForPlanMode(prev.toolPermissionContext), { type: 'setMode', mode: targetMode, destination: 'session' }),
        }));
        return {
            data: {
                active: targetMode === 'plan',
                action,
                message: `Plan mode ${action} completed`,
            },
        };
    },
});
