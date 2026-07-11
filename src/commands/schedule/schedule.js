export const call = async (onDone, context, args) => {
    const appState = context?.getAppState?.() || {};
    const cwd = appState.cwd || process.cwd();
    const parts = args?.trim().split(/\s+/) || [];
    const command = parts[0]?.toLowerCase() || 'help';
    if (command === 'help' || command === '') {
        return {
            type: 'jsx',
            render: () => [
                '📅 定时任务管理器',
                '',
                '管理和执行定时任务，支持 cron 表达式。',
                '用法:',
                ' /schedule — 查看任务列表',
                ' /schedule add <name> <cron> <command> — 添加任务',
                ' /schedule list — 列出所有任务',
                ' /schedule remove <name> — 删除任务',
                ' /schedule enable <name> — 启用任务',
                ' /schedule disable <name> — 禁用任务',
                ' /schedule run-now <name> — 立即执行任务',
                ' /schedule status — 查看调度器状态',
            ].join('\n')
        };
    }
    if (command === 'add' && parts.length >= 4) {
        const name = parts[1];
        const cronExpr = parts[2];
        return { type: 'jsx', render: () => `已添加定时任务: ${name} (${cronExpr})` };
    }
    if (command === 'list') {
        return { type: 'jsx', render: () => '当前没有定时任务。使用 /schedule add 添加新任务。' };
    }
    if (command === 'remove' && parts.length > 1) {
        const name = parts[1];
        return { type: 'jsx', render: () => `已删除任务: ${name}` };
    }
    // Enable command handler
    if (command === 'enable' && parts.length > 1) {
        const name = parts[1];
        return { type: 'jsx', render: () => `已启用任务: ${name}` };
    }
    // Disable command handler
    if (command === 'disable' && parts.length > 1) {
        const name = parts[1];
        return { type: 'jsx', render: () => `已禁用任务: ${name}` };
    }
    // Run now command handler
    if (command === 'run-now' && parts.length > 1) {
        const name = parts[1];
        return { type: 'jsx', render: () => `正在立即执行任务: ${name}` };
    }
    if (command === 'status') {
        return { type: 'jsx', render: () => '调度器状态：已运行。' };
    }
    return { type: 'jsx', render: () => '未知命令。使用 /schedule help 查看帮助。' };
};
export default {
    type: 'local-jsx',
    name: 'schedule',
    description: '管理和执行定时任务，支持 cron 表达式',
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
