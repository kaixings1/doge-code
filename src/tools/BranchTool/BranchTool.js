import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { exec } from '../../utils/Shell.js';
const inputSchema = lazySchema(() => z.object({
    action: z.enum(['create', 'switch', 'list', 'delete', 'status']).describe('分支操作：create=创建, switch=切换, list=列出, delete=删除, status=仓库状态'),
    name: z.string().optional().describe('分支名称（create/switch/delete 需要）'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('操作是否成功'),
    branch: z.string().optional().describe('当前分支'),
    branches: z.array(z.string()).optional().describe('分支列表'),
    message: z.string().optional().describe('结果消息'),
    status: z.object({
        branch: z.string().optional(),
        dirty: z.boolean().optional(),
        files_changed: z.number().optional(),
        additions: z.number().optional(),
        deletions: z.number().optional(),
    }).optional().describe('仓库状态信息（action=status 时返回）'),
}));
async function runGit(args) {
    return exec(`git ${args.join(' ')}`, new AbortController().signal, 'bash', { timeout: 30000 });
}
export const BranchTool = buildTool({
    name: 'branch',
    description: async () => '创建和管理 Git 分支',
    callOn: 'manual',
    async prompt() {
        return '使用 branch 工具管理 Git 分支。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'branch';
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
        const name = input?.name;
        return `Branch: ${action}${name ? ` (${name})` : ''}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const msg = content.message || '分支操作完成';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: msg,
        };
    },
    async call({ action, name }) {
        try {
            switch (action) {
                case 'list': {
                    const result = await runGit(['branch', '--list', '--format=%(refname:short)']);
                    const branches = result.stdout.split('\n').filter(Boolean);
                    return {
                        data: {
                            success: true,
                            branches,
                            message: `找到 ${branches.length} 个分支`,
                        },
                    };
                }
                case 'create': {
                    if (!name) {
                        return { data: { success: false, message: 'create 操作需要 name 参数' } };
                    }
                    const result = await runGit(['branch', name]);
                    return {
                        data: {
                            success: result.code === 0,
                            branch: name,
                            message: result.code === 0 ? `分支 ${name} 已创建` : `创建失败: ${result.stderr}`,
                        },
                    };
                }
                case 'switch': {
                    if (!name) {
                        return { data: { success: false, message: 'switch 操作需要 name 参数' } };
                    }
                    const result = await runGit(['checkout', name]);
                    return {
                        data: {
                            success: result.code === 0,
                            branch: name,
                            message: result.code === 0 ? `已切换到分支 ${name}` : `切换失败: ${result.stderr}`,
                        },
                    };
                }
                case 'delete': {
                    if (!name) {
                        return { data: { success: false, message: 'delete 操作需要 name 参数' } };
                    }
                    const result = await runGit(['branch', '-d', name]);
                    return {
                        data: {
                            success: result.code === 0,
                            message: result.code === 0 ? `分支 ${name} 已删除` : `删除失败: ${result.stderr}`,
                        },
                    };
                }
                case 'status': {
                    const branchResult = await runGit(['branch', '--show-current']);
                    const currentBranch = branchResult.stdout.trim() || null;
                    const statusResult = await runGit(['status', '--porcelain']);
                    const statusLines = statusResult.stdout.trim().split('\n').filter(Boolean);
                    const dirty = statusLines.length > 0;
                    let additions = 0;
                    let deletions = 0;
                    for (const line of statusLines) {
                        const parts = line.slice(2).trim();
                        if (parts.startsWith('+'))
                            additions++;
                        if (parts.startsWith('-'))
                            deletions++;
                    }
                    return {
                        data: {
                            success: true,
                            branch: currentBranch,
                            status: {
                                branch: currentBranch,
                                dirty,
                                files_changed: statusLines.length,
                                additions,
                                deletions,
                            },
                            message: currentBranch
                                ? `当前分支: ${currentBranch}，${statusLines.length} 个文件有变更`
                                : `非 Git 仓库或未初始化`,
                        },
                    };
                }
                default: {
                    return {
                        data: {
                            success: false,
                            message: `未知操作: ${action}`,
                        },
                    };
                }
            }
        }
        catch (err) {
            return {
                data: {
                    success: false,
                    message: `Git 操作失败: ${err instanceof Error ? err.message : String(err)}`,
                },
            };
        }
    },
});
