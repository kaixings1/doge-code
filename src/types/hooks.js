// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { z } from 'zod/v4';
import { lazySchema } from '../utils/lazySchema.js';
import { HOOK_EVENTS, } from '../entrypoints/agentSdkTypes.js';
import { permissionBehaviorSchema } from '../utils/permissions/PermissionRule.js';
import { permissionUpdateSchema } from '../utils/permissions/PermissionUpdateSchema.js';
export function isHookEvent(value) {
    return HOOK_EVENTS.includes(value);
}
// 提示提取协议类型。`prompt` 键作为鉴别器
// （镜像 {async:true} 模式），其值为 id。
export const promptRequestSchema = lazySchema(() => z.object({
    prompt: z.string(), // request id
    message: z.string(),
    options: z.array(z.object({
        key: z.string(),
        label: z.string(),
        description: z.string().optional(),
    })),
}));
// 同步钩子响应架构
/** 同步钩子响应架构 */
export const syncHookResponseSchema = lazySchema(() => z.object({
    continue: z
        .boolean()
        .describe('钩子执行后 Claude 是否继续（默认：true）')
        .optional(),
    suppressOutput: z
        .boolean()
        .describe('隐藏记录中的 stdout（默认：false）')
        .optional(),
    stopReason: z
        .string()
        .describe('continue 为 false 时显示的消息')
        .optional(),
    decision: z.enum(['approve', 'block']).optional(),
    reason: z.string().describe('决策的解释').optional(),
    systemMessage: z
        .string()
        .describe('显示给用户的警告消息')
        .optional(),
    hookSpecificOutput: z
        .union([
        z.object({
            hookEventName: z.literal('PreToolUse'),
            permissionDecision: permissionBehaviorSchema().optional(), // 权限决策结果
            permissionDecisionReason: z.string().optional(), // 权限决策原因
            updatedInput: z.record(z.string(), z.unknown()).optional(), // 更新后的输入
            additionalContext: z.string().optional(), // 额外上下文信息
        }),
        z.object({
            hookEventName: z.literal('UserPromptSubmit'),
            additionalContext: z.string().optional(), // 额外上下文信息
        }),
        z.object({
            hookEventName: z.literal('SessionStart'),
            additionalContext: z.string().optional(), // 会话开始时的额外上下文
            initialUserMessage: z.string().optional(),
            watchPaths: z
                .array(z.string())
                .describe('需要监控文件变更的绝对路径数组')
                .optional(),
        }),
        z.object({
            hookEventName: z.literal('Setup'),
            additionalContext: z.string().optional(), // 设置阶段的额外上下文信息
        }),
        z.object({
            hookEventName: z.literal('SubagentStart'),
            additionalContext: z.string().optional(), // 子代理启动时的额外上下文信息
        }),
        z.object({
            hookEventName: z.literal('PostToolUse'),
            additionalContext: z.string().optional(), // 工具使用后的额外上下文信息
            updatedMCPToolOutput: z
                .unknown()
                .describe('更新 MCP 工具的输出')
                .optional(),
        }),
        z.object({
            hookEventName: z.literal('PostToolUseFailure'),
            additionalContext: z.string().optional(), // 工具使用失败时的额外上下文信息
        }),
        z.object({
            hookEventName: z.literal('PermissionDenied'),
            retry: z.boolean().optional(), // 是否重试
        }),
        z.object({
            hookEventName: z.literal('Notification'),
            additionalContext: z.string().optional(),
        }),
        z.object({
            hookEventName: z.literal('PermissionRequest'),
            decision: z.union([
                z.object({
                    behavior: z.literal('allow'),
                    updatedInput: z.record(z.string(), z.unknown()).optional(),
                    updatedPermissions: z.array(permissionUpdateSchema()).optional(),
                }),
                z.object({
                    behavior: z.literal('deny'),
                    message: z.string().optional(),
                    interrupt: z.boolean().optional(),
                }),
            ]),
        }),
        z.object({
            hookEventName: z.literal('Elicitation'),
            action: z.enum(['accept', 'decline', 'cancel']).optional(), // 用户操作结果
            content: z.record(z.string(), z.unknown()).optional()
        }),
        z.object({
            hookEventName: z.literal('ElicitationResult'),
            action: z.enum(['accept', 'decline', 'cancel']).optional(), // 用户最终操作结果
            content: z.record(z.string(), z.unknown()).optional()
        }),
        z.object({
            hookEventName: z.literal('CwdChanged'),
            watchPaths: z
                .array(z.string())
                .describe('需要监控工作目录变更的绝对路径数组')
                .optional(),
        }),
        z.object({
            hookEventName: z.literal('FileChanged'),
            watchPaths: z
                .array(z.string())
                .describe('需要监控文件变更的绝对路径数组')
                .optional(),
        }),
        z.object({
            hookEventName: z.literal('WorktreeCreate'),
            worktreePath: z.string() // 工作树创建路径
        }),
    ])
        .optional(),
}));
// Zod schema for hook JSON output validation
export const hookJSONOutputSchema = lazySchema(() => {
    // Async hook response schema
    const asyncHookResponseSchema = z.object({
        async: z.literal(true),
        asyncTimeout: z.number().optional(),
    });
    return z.union([asyncHookResponseSchema, syncHookResponseSchema()]);
});
// Type guard function to check if response is sync
export function isSyncHookJSONOutput(json) {
    return !('async' in json && json.async === true);
}
// Type guard function to check if response is async
export function isAsyncHookJSONOutput(json) {
    return 'async' in json && json.async === true;
}
