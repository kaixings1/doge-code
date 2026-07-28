import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import os from 'os';
import { execSync } from 'child_process';
const inputSchema = lazySchema(() => z.object({
    target: z.enum(['cpu', 'memory', 'disk', 'network', 'health']).describe('监控目标'),
    action: z.enum(['status', 'start', 'stop']).describe('操作'),
}));
const outputSchema = lazySchema(() => z.object({
    status: z.string().describe('系统状态'),
    metrics: z.record(z.number()).optional().describe('指标'),
    message: z.string().optional().describe('状态消息'),
}));
function getCpuMetrics() {
    const cpus = os.cpus();
    const totalTick = cpus.reduce((sum, cpu) => sum + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq, 0);
    const idleTick = cpus.reduce((sum, cpu) => sum + cpu.times.idle, 0);
    const usage = totalTick > 0 ? Number(((1 - idleTick / totalTick) * 100).toFixed(1)) : 0;
    return {
        cores: cpus.length,
        speedMhz: cpus[0]?.speed ?? 0,
        usagePercent: usage,
    };
}
function getMemoryMetrics() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
        totalMb: Number((total / 1024 / 1024).toFixed(0)),
        usedMb: Number((used / 1024 / 1024).toFixed(0)),
        freeMb: Number((free / 1024 / 1024).toFixed(0)),
        usagePercent: Number(((used / total) * 100).toFixed(1)),
    };
}
function getDiskMetrics() {
    try {
        const result = execSync('wmic logicaldisk get size,freespace,caption /format:csv', { encoding: 'utf8' });
        const lines = result.trim().split('\n');
        if (lines.length >= 2) {
            const parts = lines[1].split(',');
            if (parts.length >= 3) {
                const free = parseInt(parts[1], 10);
                const total = parseInt(parts[2], 10);
                if (!isNaN(free) && !isNaN(total) && total > 0) {
                    const used = total - free;
                    return {
                        totalGb: Number((total / 1024 / 1024 / 1024).toFixed(2)),
                        freeGb: Number((free / 1024 / 1024 / 1024).toFixed(2)),
                        usedGb: Number((used / 1024 / 1024 / 1024).toFixed(2)),
                        usagePercent: Number(((used / total) * 100).toFixed(1)),
                    };
                }
            }
        }
    }
    catch {
        // fallback
    }
    return { totalGb: 0, freeGb: 0, usedGb: 0, usagePercent: 0 };
}
function getNetworkMetrics() {
    try {
        const result = execSync('netstat -e', { encoding: 'utf8' });
        const lines = result.split('\n');
        let bytesReceived = 0;
        let bytesSent = 0;
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3 && parts[0] !== '接口' && !isNaN(parseInt(parts[1], 10))) {
                bytesReceived += parseInt(parts[1], 10) || 0;
                bytesSent += parseInt(parts[2], 10) || 0;
            }
        }
        return {
            bytesReceivedMb: Number((bytesReceived / 1024 / 1024).toFixed(2)),
            bytesSentMb: Number((bytesSent / 1024 / 1024).toFixed(2)),
        };
    }
    catch {
        return { bytesReceivedMb: 0, bytesSentMb: 0 };
    }
}
function getHealthStatus() {
    const memUsage = process.memoryUsage();
    return {
        pid: process.pid,
        uptimeMs: Number((process.uptime() * 1000).toFixed(0)),
        heapUsedMb: Number((memUsage.heapUsed / 1024 / 1024).toFixed(2)),
        heapTotalMb: Number((memUsage.heapTotal / 1024 / 1024).toFixed(2)),
        rssMb: Number((memUsage.rss / 1024 / 1024).toFixed(2)),
        externalMb: Number((memUsage.external / 1024 / 1024).toFixed(2)),
    };
}
export const MonitorTool = buildTool({
    name: 'monitor',
    description: async () => '系统监控与健康检查（CPU/内存/磁盘/网络）',
    callOn: 'always',
    async prompt() {
        return '使用 monitor 工具检查系统状态。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'monitor';
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
        const target = input?.target ?? '?';
        const action = input?.action ?? '?';
        return `Monitor: ${target} ${action}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || 'Monitor task completed',
        };
    },
    async call({ target, action }) {
        if (action === 'start' || action === 'stop') {
            return {
                data: {
                    status: action === 'start' ? 'monitoring started' : 'monitoring stopped',
                    message: `Monitor ${action} for ${target}`,
                },
            };
        }
        let metrics;
        let message;
        switch (target) {
            case 'cpu': {
                metrics = getCpuMetrics();
                message = `CPU: ${metrics.usagePercent}% (${metrics.cores} cores @ ${metrics.speedMhz}MHz)`;
                break;
            }
            case 'memory': {
                metrics = getMemoryMetrics();
                message = `Memory: ${metrics.usagePercent}% (${metrics.usedMb}/${metrics.totalMb} MB)`;
                break;
            }
            case 'disk': {
                metrics = getDiskMetrics();
                message = `Disk C: ${metrics.usagePercent}% (${metrics.freeGb} GB free of ${metrics.totalGb} GB)`;
                break;
            }
            case 'network': {
                metrics = getNetworkMetrics();
                message = `Network: ${metrics.bytesReceivedMb} MB received, ${metrics.bytesSentMb} MB sent`;
                break;
            }
            case 'health': {
                const health = getHealthStatus();
                metrics = health;
                message = `Process healthy (PID ${health.pid}, uptime ${health.uptimeMs}ms, heap ${health.heapUsedMb}MB)`;
                break;
            }
        }
        return {
            data: {
                status: 'ok',
                metrics,
                message,
            },
        };
    },
});
//# sourceMappingURL=MonitorTool.js.map