import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';
class MemoryMonitor {
    snapshots = [];
    sessions = [];
    currentSession = null;
    dataFile;
    maxSnapshots = 5000;
    maxSessions = 50;
    thresholds = { warning: 0.8, critical: 0.9 };
    constructor() {
        const dataDir = join(os.homedir(), '.doge', 'memory-monitor');
        this.dataFile = join(dataDir, 'data.json');
        this.ensureDataDir();
        this.loadData();
    }
    ensureDataDir() {
        const dataDir = join(os.homedir(), '.doge', 'memory-monitor');
        if (!existsSync(dataDir))
            mkdirSync(dataDir, { recursive: true });
    }
    loadData() {
        try {
            if (existsSync(this.dataFile)) {
                const data = JSON.parse(readFileSync(this.dataFile, 'utf-8'));
                this.snapshots = data.snapshots || [];
                this.sessions = data.sessions || [];
            }
        }
        catch {
            this.snapshots = [];
            this.sessions = [];
        }
    }
    saveData() {
        try {
            writeFileSync(this.dataFile, JSON.stringify({
                snapshots: this.snapshots.slice(-this.maxSnapshots),
                sessions: this.sessions.slice(-this.maxSessions),
            }, null, 2), 'utf-8');
        }
        catch { }
    }
    takeSnapshot() {
        const usage = process.memoryUsage();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const snapshot = {
            timestamp: Date.now(),
            processMemory: Math.round((usage.rss / 1024 / 1024) * 100) / 100,
            systemTotal: Math.round((totalMem / 1024 / 1024) * 100) / 100,
            systemFree: Math.round((freeMem / 1024 / 1024) * 100) / 100,
            systemUsed: Math.round((usedMem / 1024 / 1024) * 100) / 100,
            usageRatio: Math.round((usedMem / totalMem) * 1000) / 1000,
            heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
            heapTotal: Math.round((usage.heapTotal / 1024 / 1024) * 100) / 100,
            external: Math.round((usage.external / 1024 / 1024) * 100) / 100,
            arrayBuffers: usage.arrayBuffers ? Math.round((usage.arrayBuffers / 1024 / 1024) * 100) / 100 : void 0,
        };
        this.snapshots.push(snapshot);
        if (this.currentSession) {
            this.currentSession.snapshots.push(snapshot);
            this.currentSession.peakMemory = Math.max(this.currentSession.peakMemory, snapshot.processMemory);
        }
        this.saveData();
        return snapshot;
    }
    startSession(label = 'session-' + Date.now()) {
        const snapshot = this.takeSnapshot();
        this.currentSession = {
            id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            label, startTime: Date.now(), snapshots: [snapshot],
            peakMemory: snapshot.processMemory, averageMemory: snapshot.processMemory, leaksDetected: 0,
        };
        this.sessions.push(this.currentSession);
        this.saveData();
        return this.currentSession;
    }
    endSession() {
        if (!this.currentSession)
            return null;
        this.takeSnapshot();
        const snaps = this.currentSession.snapshots;
        this.currentSession.averageMemory = Math.round((snaps.reduce((s, m) => s + m.processMemory, 0) / snaps.length) * 100) / 100;
        this.currentSession.endTime = Date.now();
        this.currentSession.leaksDetected = this.detectLeaks(this.currentSession);
        const session = this.currentSession;
        this.currentSession = null;
        this.saveData();
        return session;
    }
    detectLeaks(session) {
        if (session.snapshots.length < 5)
            return 0;
        const recent = session.snapshots.slice(-10);
        let count = 0;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i].processMemory > recent[i - 1].processMemory * 1.1)
                count++;
        }
        if (recent.length >= 5) {
            const vals = recent.map(s => s.processMemory);
            const idx = vals.map((_, i) => i);
            const n = vals.length;
            const sx = idx.reduce((a, b) => a + b, 0);
            const sy = vals.reduce((a, b) => a + b, 0);
            const sxy = idx.reduce((s, x, i) => s + x * vals[i], 0);
            const sx2 = idx.reduce((s, x) => s + x * x, 0);
            if ((n * sxy - sx * sy) / (n * sx2 - sx * sx) > 0.5)
                count += 2;
        }
        return count;
    }
    getReport() {
        const current = this.takeSnapshot();
        const all = this.snapshots.map(s => s.processMemory);
        const peak = all.length > 0 ? Math.max(...all) : current.processMemory;
        const avg = all.length > 0 ? Math.round((all.reduce((s, v) => s + v, 0) / all.length) * 100) / 100 : current.processMemory;
        const min = all.length > 0 ? Math.min(...all) : current.processMemory;
        let trend = 'stable';
        if (this.snapshots.length >= 10) {
            const r = this.snapshots.slice(-10).reduce((s, m) => s + m.processMemory, 0) / 10;
            const o = this.snapshots.slice(0, 10).reduce((s, m) => s + m.processMemory, 0) / 10;
            if (r > o * 1.05)
                trend = 'growing';
            else if (r < o * 0.95)
                trend = 'shrinking';
        }
        const anomalies = [];
        if (current.usageRatio > this.thresholds.critical)
            anomalies.push('系统内存使用率 ' + (current.usageRatio * 100).toFixed(1) + '%，超过严重阈值 ' + (this.thresholds.critical * 100).toFixed(0) + '%');
        else if (current.usageRatio > this.thresholds.warning)
            anomalies.push('系统内存使用率 ' + (current.usageRatio * 100).toFixed(1) + '%，超过警告阈值 ' + (this.thresholds.warning * 100).toFixed(0) + '%');
        if (current.processMemory > peak * 1.2 && peak > 0)
            anomalies.push('进程内存飙升: ' + current.processMemory + 'MB (峰值 ' + peak + 'MB)');
        const leaky = this.sessions.filter(s => s.leaksDetected >= 3);
        if (leaky.length > 0)
            anomalies.push('检测到 ' + leaky.length + ' 个可能存在内存泄漏的会话');
        const recommendations = [];
        if (current.usageRatio > this.thresholds.warning) {
            recommendations.push('关闭不必要的程序和浏览器标签页');
            recommendations.push('检查是否有进程内存泄漏');
            recommendations.push('考虑增加物理内存');
        }
        if (trend === 'growing') {
            recommendations.push('应用内存呈增长趋势，建议定期监控');
            recommendations.push('检查随时间增长的缓存或对象池');
        }
        if (current.processMemory > 500)
            recommendations.push('进程占用 ' + current.processMemory + 'MB，考虑优化内存使用');
        if (current.heapUsed && current.heapTotal && current.heapUsed / current.heapTotal > 0.8)
            recommendations.push('堆内存使用率超过 80%，检查是否存在对象泄漏');
        if (recommendations.length === 0) {
            recommendations.push('内存状态良好，继续监控');
            recommendations.push('建议设置定期内存快照基准');
        }
        return { current, history: { peak, average: avg, minimum: min, samples: this.snapshots.length }, trend, sessions: this.sessions, anomalies, recommendations };
    }
    getHourlyTrend(hours = 24) {
        const now = Date.now();
        const result = [];
        for (let i = hours - 1; i >= 0; i--) {
            const start = now - (i + 1) * 3600000;
            const end = now - i * 3600000;
            const inRange = this.snapshots.filter(s => s.timestamp >= start && s.timestamp < end);
            result.push({
                time: new Date(start).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                avgProcess: inRange.length > 0 ? Math.round((inRange.reduce((s, m) => s + m.processMemory, 0) / inRange.length) * 100) / 100 : 0,
                avgSystem: inRange.length > 0 ? Math.round((inRange.reduce((s, m) => s + (m.systemUsed / m.systemTotal) * 100, 0) / inRange.length) * 100) / 100 : 0,
                count: inRange.length,
            });
        }
        return result;
    }
    clearData() { this.snapshots = []; this.sessions = []; this.currentSession = null; this.saveData(); }
}
function renderBar(ratio, width = 20) {
    const filled = Math.round(ratio * width);
    const bar = '\u2588'.repeat(Math.min(filled, width)) + '\u2591'.repeat(Math.max(width - filled, 0));
    const pct = ratio * 100;
    if (pct < 60)
        return '\uD83D\uDFE2 ' + bar;
    if (pct < 80)
        return '\uD83D\uDFE1 ' + bar;
    if (pct < 90)
        return '\uD83D\uDFE0 ' + bar;
    return '\uD83D\uDD34 ' + bar;
}
const monitor = new MemoryMonitor();
export const call = async (onDone, context, args) => {
    const parts = args?.trim().split(/\s+/) || [];
    const command = parts[0]?.toLowerCase() || 'help';
    try {
        if (command === 'help' || command === '') {
            return {
                type: 'jsx',
                render: () => [
                    '\uD83E\uDDE0 内存监控工具',
                    '======================',
                    'status       - 当前状态',
                    'snapshot     - 记录快照',
                    'start        - 开始会话',
                    'stop         - 结束会话',
                    'session      - 当前会话',
                    'history [n]  - 历史快照',
                    'trend [h]    - 趋势',
                    'sessions     - 所有会话',
                    'analyze      - 分析报告',
                    'leak-check   - 泄漏检测',
                    'clear        - 清除数据',
                ].join('\n'),
            };
        }
        if (command === 'status') {
            const report = monitor.getReport();
            const c = report.current;
            return {
                type: 'jsx',
                render: () => {
                    return '内存状态:\n' +
                        '系统: ' + c.systemUsed.toFixed(0) + '/' + c.systemTotal.toFixed(0) + 'MB ' +
                        renderBar(c.usageRatio) + ' ' + (c.usageRatio * 100).toFixed(1) + '%\n' +
                        '进程: ' + c.processMemory.toFixed(1) + 'MB (峰值 ' + report.history.peak.toFixed(1) + 'MB)\n' +
                        '趋势: ' + (report.trend === 'growing' ? '增长' : report.trend === 'shrinking' ? '下降' : '稳定') + '\n' +
                        (report.anomalies.length > 0 ? '\n异常:\n' + report.anomalies.map(a => ' ' + a).join('\n') : '') +
                        (report.recommendations.length > 0 ? '\n建议:\n' + report.recommendations.map((r, i) => ' ' + (i + 1) + '. ' + r).join('\n') : '');
                },
            };
        }
        if (command === 'snapshot') {
            const snapshot = monitor.takeSnapshot();
            return {
                type: 'jsx',
                render: () => '快照已记录: 进程 ' + snapshot.processMemory.toFixed(1) + 'MB, 系统 ' + (snapshot.usageRatio * 100).toFixed(1) + '%',
            };
        }
        if (command === 'start') {
            const label = parts.slice(1).join(' ') || ('session-' + Date.now());
            const session = monitor.startSession(label);
            return {
                type: 'jsx',
                render: () => '会话已启动: ' + session.id,
            };
        }
        if (command === 'stop') {
            const session = monitor.endSession();
            if (!session)
                return { type: 'jsx', render: () => '没有活跃会话' };
            return {
                type: 'jsx',
                render: () => '会话已结束: ' + session.label + ', 峰值 ' + session.peakMemory.toFixed(1) + 'MB' +
                    (session.leaksDetected > 0 ? ', 泄漏迹象 ' + session.leaksDetected : ''),
            };
        }
        if (command === 'session') {
            const s = monitor['currentSession'];
            if (!s)
                return { type: 'jsx', render: () => '没有活跃会话' };
            return {
                type: 'jsx',
                render: () => '会话: ' + s.label + ', 已运行 ' + ((Date.now() - s.startTime) / 1000).toFixed(0) + '秒, 峰值 ' + s.peakMemory.toFixed(1) + 'MB',
            };
        }
        if (command === 'history') {
            const limit = Math.min(parts.length > 1 ? parseInt(parts[1]) || 20 : 20, 100);
            const snaps = monitor['snapshots'].slice(-limit).reverse();
            if (snaps.length === 0)
                return { type: 'jsx', render: () => '暂无快照' };
            return {
                type: 'jsx',
                render: () => '最近 ' + snaps.length + ' 条快照:\n' +
                    snaps.map((s, i) => {
                        const t = new Date(s.timestamp).toLocaleTimeString('zh-CN');
                        return ' ' + (i + 1) + '. ' + t + ' 进程:' + s.processMemory.toFixed(1) + 'MB 系统:' + (s.usageRatio * 100).toFixed(1) + '%';
                    }).join('\n'),
            };
        }
        if (command === 'trend') {
            const hours = Math.min(parts.length > 1 ? parseInt(parts[1]) || 24 : 24, 168);
            const trend = monitor.getHourlyTrend(hours);
            if (trend.every(t => t.count === 0))
                return { type: 'jsx', render: () => '暂无趋势数据' };
            return {
                type: 'jsx',
                render: () => '过去 ' + hours + ' 小时趋势:\n' +
                    trend.filter(t => t.count > 0).map(t => ' ' + t.time + ' ' + t.avgProcess.toFixed(0) + 'MB').join('\n'),
            };
        }
        if (command === 'sessions') {
            const list = monitor['sessions'].slice().reverse();
            if (list.length === 0)
                return { type: 'jsx', render: () => '暂无会话' };
            return {
                type: 'jsx',
                render: () => '共 ' + list.length + ' 个会话:\n' +
                    list.map((s, i) => ' ' + (i + 1) + '. ' + s.label + ' 峰值:' + s.peakMemory.toFixed(1) + 'MB' + (s.leaksDetected >= 3 ? ' 泄漏' : '')).join('\n'),
            };
        }
        if (command === 'analyze') {
            const report = monitor.getReport();
            const c = report.current;
            let text = '内存分析报告:\n';
            text += '进程: 当前' + c.processMemory.toFixed(1) + 'MB 峰值' + report.history.peak.toFixed(1) + 'MB 平均' + report.history.average.toFixed(1) + 'MB\n';
            text += '系统: ' + (c.usageRatio * 100).toFixed(1) + '% 趋势:' + (report.trend === 'growing' ? '增长' : report.trend === 'shrinking' ? '下降' : '稳定') + '\n';
            if (report.anomalies.length > 0)
                text += '异常:\n' + report.anomalies.map(a => ' ' + a).join('\n') + '\n';
            if (report.recommendations.length > 0)
                text += '建议:\n' + report.recommendations.map((r, i) => ' ' + (i + 1) + '. ' + r).join('\n');
            return { type: 'jsx', render: () => text };
        }
        if (command === 'leak-check') {
            const list = monitor['sessions'];
            const leaky = list.filter(s => s.leaksDetected >= 3);
            if (list.length === 0)
                return { type: 'jsx', render: () => '暂无会话数据' };
            let text = '泄漏检测: ' + list.length + ' 个会话, ' + leaky.length + ' 个可疑\n';
            if (leaky.length > 0) {
                leaky.forEach(s => { text += ' ' + s.label + ' 峰值' + s.peakMemory.toFixed(1) + 'MB 泄漏分' + s.leaksDetected + '/3\n'; });
            }
            else {
                text += '未检测到内存泄漏';
            }
            return { type: 'jsx', render: () => text };
        }
        if (command === 'clear') {
            monitor.clearData();
            return { type: 'jsx', render: () => '数据已清除' };
        }
        return { type: 'jsx', render: () => '未知命令: ' + command + ', 使用 help 查看帮助' };
    }
    catch (error) {
        return { type: 'jsx', render: () => '出错: ' + (error instanceof Error ? error.message : String(error)) };
    }
};
//# sourceMappingURL=memoryMonitor.js.map