// 高级权限管理系统 - 简化版本
// 包含：风险评估、白名单/黑名单管理、权限拦截测试
export const call = async (onDone, context, args) => {
    const appState = context?.getAppState?.() || {};
    const messages = appState.messages || [];
    const parts = args?.trim().split(/\s+/) || [];
    const command = parts[0]?.toLowerCase() || 'analyze';
    // 风险评估数据
    const riskData = {
        'BashTool': { level: 'critical', score: 90, reasons: ['命令执行权限'], recommendations: ['限制命令范围'] },
        'FileWriteTool': { level: 'high', score: 85, reasons: ['文件写入权限'], recommendations: ['限制写入目录'] },
        'FileEditTool': { level: 'high', score: 80, reasons: ['文件内容修改'], recommendations: ['版本控制'] },
        'MultiFileEditTool': { level: 'critical', score: 95, reasons: ['批量文件修改'], recommendations: ['限制文件数量'] },
        'FileReadTool': { level: 'medium', score: 50, reasons: ['文件读取权限'], recommendations: ['限制敏感目录'] },
        'GlobTool': { level: 'medium', score: 45, reasons: ['文件系统遍历'], recommendations: ['限制搜索深度'] },
        'GrepTool': { level: 'medium', score: 55, reasons: ['内容搜索'], recommendations: ['关键词过滤'] },
        'ReadTool': { level: 'low', score: 20, reasons: ['只读访问'], recommendations: ['基础监控'] }
    };
    // 简单的内存存储
    const whitelist = [];
    const blacklist = [];
    if (command === 'help' || command === '') {
        return {
            type: 'jsx',
            render: () => [
                '🔒 高级权限管理系统 v2.0',
                '==============================',
                '',
                '核心功能:',
                ' • 实时权限拦截和风险评估',
                ' • 白名单/黑名单管理',
                ' • 工具使用分析和安全建议',
                '',
                '主要命令:',
                ' analyze - 分析当前会话权限使用情况',
                ' risks - 显示所有工具风险评估',
                ' whitelist - 管理白名单工具',
                ' blacklist - 管理黑名单工具',
                ' intercept - 测试权限拦截',
                ' test-all - 测试所有工具权限',
                '',
                '📝 用法示例:',
                ' /less-permission-prompts analyze',
                ' /less-permission-prompts risks',
                ' /less-permission-prompts intercept BashTool',
            ].join('\n')
        };
    }
    if (command === 'analyze') {
        const toolsUsed = new Set();
        for (const msg of messages) {
            if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
                for (const tc of msg.tool_calls) {
                    if (tc.name)
                        toolsUsed.add(tc.name);
                }
            }
        }
        const toolList = Array.from(toolsUsed);
        let highRiskCount = 0;
        let mediumRiskCount = 0;
        const toolDetails = toolList.map(tool => {
            const risk = riskData[tool];
            if (risk) {
                if (risk.level === 'critical' || risk.level === 'high')
                    highRiskCount++;
                if (risk.level === 'medium')
                    mediumRiskCount++;
                const icon = risk.level === 'critical' ? '🔴' : risk.level === 'high' ? '🟠' : risk.level === 'medium' ? '🟡' : '🟢';
                return `${icon} ${tool} (${risk.level})`;
            }
            return `⚪ ${tool} (未知风险)`;
        });
        return {
            type: 'jsx',
            render: () => [
                '📊 高级权限分析报告',
                '====================',
                '',
                `🛠️ 工具使用统计:`,
                ` • 使用工具数: ${toolList.length}`,
                ` • 高风险工具: ${highRiskCount}`,
                ` • 中风险工具: ${mediumRiskCount}`,
                '',
                `📋 使用的工具列表:`,
                ...toolDetails.map(detail => ` ${detail}`),
                '',
                `🎯 安全建议:`,
                ` • 将高频使用的高风险工具加入白名单`,
                ` • 监控中风险工具的使用频率`,
                ` • 定期审查工具使用权限`,
            ].join('\n')
        };
    }
    if (command === 'risks') {
        const criticalTools = Object.entries(riskData).filter(([_, risk]) => risk.level === 'critical');
        const highTools = Object.entries(riskData).filter(([_, risk]) => risk.level === 'high');
        const mediumTools = Object.entries(riskData).filter(([_, risk]) => risk.level === 'medium');
        return {
            type: 'jsx',
            render: () => [
                '⚠️ 工具风险评估报告',
                '===================',
                '',
                `📊 风险分布:`,
                ` • 🔴 严重风险: ${criticalTools.length}个工具`,
                ` • 🟠 高风险: ${highTools.length}个工具`,
                ` • 🟡 中风险: ${mediumTools.length}个工具`,
                '',
                `🔴 严重风险工具:`,
                ...criticalTools.map(([name, risk]) => ` • ${name}: ${risk.score}/100 - ${risk.reasons.join(', ')}`),
                '',
                `🟠 高风险工具:`,
                ...highTools.map(([name, risk]) => ` • ${name}: ${risk.score}/100 - ${risk.reasons.join(', ')}`),
                '',
                `🛡️ 安全建议:`,
                ` • 为严重风险工具设置审批流程`,
                ` • 将高频使用的高风险工具加入白名单`,
                ` • 定期审查中风险工具的使用记录`,
            ].join('\n')
        };
    }
    if (command === 'intercept' && parts[1]) {
        const toolName = parts[1];
        const risk = riskData[toolName];
        if (!risk) {
            return {
                type: 'jsx',
                render: () => [
                    `❓ 工具 "${toolName}" 未找到`,
                    '',
                    '💡 可用工具:',
                    ...Object.keys(riskData).map(tool => ` • ${tool}`)
                ].join('\n')
            };
        }
        const isBlacklisted = blacklist.includes(toolName);
        const isWhitelisted = whitelist.includes(toolName);
        let allowed = true;
        let reason = '低风险工具';
        if (isBlacklisted) {
            allowed = false;
            reason = '工具在黑名单中';
        }
        else if (!isWhitelisted && (risk.level === 'critical' || risk.level === 'high')) {
            allowed = false;
            reason = '高风险工具需要白名单授权';
        }
        else if (isWhitelisted) {
            reason = '白名单授权';
        }
        return {
            type: 'jsx',
            render: () => [
                '🛡️ 权限拦截测试',
                '==============',
                '',
                `🔧 测试工具: ${toolName}`,
                `📊 风险等级: ${risk.level.toUpperCase()}`,
                `📈 风险分数: ${risk.score}/100`,
                `✅ 是否允许: ${allowed ? '是' : '否'}`,
                `📝 原因: ${reason}`,
                '',
                `📋 风险原因:`,
                ...risk.reasons.map(r => ` • ${r}`),
                '',
                `💡 安全建议:`,
                ...risk.recommendations.map(r => ` • ${r}`),
            ].join('\n')
        };
    }
    if (command === 'test-all') {
        const results = Object.keys(riskData).map(toolName => {
            const risk = riskData[toolName];
            const isBlacklisted = blacklist.includes(toolName);
            const isWhitelisted = whitelist.includes(toolName);
            let allowed = true;
            let reason = '低风险工具';
            if (isBlacklisted) {
                allowed = false;
                reason = '工具在黑名单中';
            }
            else if (!isWhitelisted && (risk.level === 'critical' || risk.level === 'high')) {
                allowed = false;
                reason = '高风险工具需要白名单授权';
            }
            else if (isWhitelisted) {
                reason = '白名单授权';
            }
            return { tool: toolName, allowed, reason, riskLevel: risk.level };
        });
        const allowed = results.filter(r => r.allowed);
        const blocked = results.filter(r => !r.allowed);
        return {
            type: 'jsx',
            render: () => [
                '🧪 批量权限测试报告',
                '===================',
                '',
                `📊 测试统计:`,
                ` • 测试工具总数: ${results.length}`,
                ` • 允许使用: ${allowed.length}个`,
                ` • 拦截使用: ${blocked.length}个`,
                ` • 通过率: ${((allowed.length / results.length) * 100).toFixed(1)}%`,
                '',
                `✅ 允许使用的工具:`,
                ...allowed.slice(0, 5).map(r => ` • ${r.tool} (${r.riskLevel})`),
                allowed.length > 5 ? ` • ...还有 ${allowed.length - 5} 个工具` : '',
                '',
                `🚫 被拦截的工具:`,
                ...blocked.slice(0, 5).map(r => ` • ${r.tool} (${r.reason})`),
                blocked.length > 5 ? ` • ...还有 ${blocked.length - 5} 个工具` : '',
                '',
                `🎯 优化建议:`,
                ` • 将高频使用的高风险工具加入白名单`,
                ` • 审查被拦截的工具是否需要使用`,
                ` • 定期更新风险评估策略`,
            ].join('\n')
        };
    }
    return {
        type: 'jsx',
        render: () => [
            `❓ 未知命令: ${command}`,
            '',
            '可用命令:',
            ' • analyze - 分析权限使用',
            ' • risks - 查看风险评估',
            ' • intercept - 测试权限拦截',
            ' • test-all - 测试所有工具权限',
            ' • help - 查看完整帮助',
        ].join('\n')
    };
};
export default {
    type: 'local-jsx',
    name: 'less-permission-prompts',
    description: '高级权限管理系统 - 实时权限拦截、风险评估、安全优化',
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
//# sourceMappingURL=lessPermissionPrompts.js.map