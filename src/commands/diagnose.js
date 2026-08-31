// ============================================================================
// Diagnose Command - Enhanced Version
// 系统诊断：环境检查/性能分析/安全扫描/日志分析/网络诊断/自动修复
// ============================================================================
import { execSync, exec } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
const execAsync = promisify(exec);
// ============================================================================
// Constants
// ============================================================================
const DIAGNOSTIC_DIR = join(process.cwd(), '.doge', 'diagnostics');
const HISTORY_FILE = join(DIAGNOSTIC_DIR, 'history.json');
const CONFIG_FILE = join(DIAGNOSTIC_DIR, 'config.json');
const CATEGORIES = {
    ENVIRONMENT: '环境',
    PROJECT: '项目',
    AUTH: '认证',
    BROWSER: '浏览器',
    SYSTEM: '系统',
    NETWORK: '网络',
    SECURITY: '安全',
    PERFORMANCE: '性能',
    DEPENDENCIES: '依赖',
    LOGS: '日志',
    CONFIGURATION: '配置',
};
// ============================================================================
// Environment Checks
// ============================================================================
async function checkGit() {
    const items = [];
    const start = Date.now();
    try {
        const version = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        items.push({
            name: 'diagnose',
            category: CATEGORIES.ENVIRONMENT,
            status: 'pass',
            message: version,
            duration: Date.now() - start,
        });
    }
    catch {
        items.push({
            name: 'Git 安装',
            category: CATEGORIES.ENVIRONMENT,
            status: 'fail',
            message: '未安装 git',
            suggestion: '安装 git: https://git-scm.com/downloads',
            duration: Date.now() - start,
        });
    }
    // Git 配置检查
    try {
        const userName = execSync('git config user.name', { encoding: 'utf-8', timeout: 3000 }).trim();
        const userEmail = execSync('git config user.email', { encoding: 'utf-8', timeout: 3000 }).trim();
        if (userName && userEmail) {
            items.push({
                name: 'Git 用户配置',
                category: CATEGORIES.ENVIRONMENT,
                status: 'pass',
                message: `${userName} <${userEmail}>`,
            });
        }
        else {
            items.push({
                name: 'Git 用户配置',
                category: CATEGORIES.ENVIRONMENT,
                status: 'warn',
                message: '未配置用户名或邮箱',
                suggestion: '运行: git config --global user.name "你的名字" && git config --global user.email "你的邮箱"',
            });
        }
    }
    catch {
        items.push({
            name: 'Git 用户配置',
            category: CATEGORIES.ENVIRONMENT,
            status: 'warn',
            message: '无法读取 git 配置',
        });
    }
    // Git 仓库状态
    if (existsSync('.git')) {
        try {
            const status = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 5000 }).trim();
            const lines = status.split('\n').filter(Boolean);
            if (lines.length > 0) {
                items.push({
                    name: 'Git 状态',
                    category: CATEGORIES.PROJECT,
                    status: 'warn',
                    message: `${lines.length} 个未提交变更`,
                    details: lines.slice(0, 5).join('\n'),
                });
            }
            else {
                items.push({
                    name: 'Git 状态',
                    category: CATEGORIES.PROJECT,
                    status: 'pass',
                    message: '工作目录干净',
                });
            }
        }
        catch {
            items.push({
                name: 'Git 状态',
                category: CATEGORIES.PROJECT,
                status: 'warn',
                message: '无法读取 git 状态',
            });
        }
        // 远程仓库检查
        try {
            const remotes = execSync('git remote -v', { encoding: 'utf-8', timeout: 3000 }).trim();
            if (remotes) {
                const remoteLines = remotes.split('\n');
                items.push({
                    name: 'Git 远程仓库',
                    category: CATEGORIES.PROJECT,
                    status: 'pass',
                    message: `${remoteLines.length} 个远程仓库`,
                    details: remotes,
                });
            }
            else {
                items.push({
                    name: 'Git 远程仓库',
                    category: CATEGORIES.PROJECT,
                    status: 'info',
                    message: '没有配置远程仓库',
                    suggestion: '运行: git remote add origin <仓库地址>',
                });
            }
        }
        catch {
            items.push({
                name: 'Git 远程仓库',
                category: CATEGORIES.PROJECT,
                status: 'info',
                message: '无法读取远程仓库配置',
            });
        }
        // 分支信息
        try {
            const branch = execSync('git branch --show-current', { encoding: 'utf-8', timeout: 3000 }).trim();
            const branches = execSync('git branch -a', { encoding: 'utf-8', timeout: 3000 }).trim();
            const branchCount = branches.split('\n').filter(Boolean).length;
            items.push({
                name: 'Git 分支',
                category: CATEGORIES.PROJECT,
                status: 'pass',
                message: `当前: ${branch} (共 ${branchCount} 个分支)`,
            });
        }
        catch {
            items.push({
                name: 'Git 分支',
                category: CATEGORIES.PROJECT,
                status: 'info',
                message: '无法读取分支信息',
            });
        }
    }
    else {
        items.push({
            name: 'Git 仓库',
            category: CATEGORIES.PROJECT,
            status: 'warn',
            message: '当前目录不是 git 仓库',
            suggestion: '运行: git init 初始化仓库',
        });
    }
    return items;
}
async function checkNodeEnvironment() {
    const items = [];
    // Node.js 版本
    try {
        const nodeVersion = execSync('node --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        const major = parseInt(nodeVersion.replace('v', ''), 10);
        if (major >= 24) {
            items.push({ name: 'Node.js', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: nodeVersion });
        }
        else {
            items.push({ name: 'Node.js', category: CATEGORIES.ENVIRONMENT, status: 'warn', message: `${nodeVersion}（推荐 >= 24）`, suggestion: '升级到 Node.js 24+: nvm install 24' });
        }
    }
    catch {
        items.push({ name: 'Node.js', category: CATEGORIES.ENVIRONMENT, status: 'fail', message: '未安装 Node.js', suggestion: '安装 Node.js 24+: https://nodejs.org' });
    }
    // Bun
    try {
        const bunVersion = execSync('bun --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        items.push({ name: 'Bun', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: bunVersion });
    }
    catch {
        items.push({ name: 'Bun', category: CATEGORIES.ENVIRONMENT, status: 'info', message: '未安装 Bun', suggestion: '安装 Bun: curl -fsSL https://bun.sh/install | bash' });
    }
    // NPM
    try {
        const npmVersion = execSync('npm --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        items.push({ name: 'npm', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: `v${npmVersion}` });
    }
    catch {
        items.push({ name: 'npm', category: CATEGORIES.ENVIRONMENT, status: 'info', message: '未安装 npm' });
    }
    // pnpm
    try {
        const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        items.push({ name: 'pnpm', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: `v${pnpmVersion}` });
    }
    catch {
        items.push({ name: 'pnpm', category: CATEGORIES.ENVIRONMENT, status: 'info', message: '未安装 pnpm（可选）', suggestion: '安装 pnpm: npm install -g pnpm' });
    }
    // Yarn
    try {
        const yarnVersion = execSync('yarn --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        items.push({ name: 'Yarn', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: `v${yarnVersion}` });
    }
    catch {
        items.push({ name: 'Yarn', category: CATEGORIES.ENVIRONMENT, status: 'info', message: '未安装 Yarn（可选）' });
    }
    // Python（某些工具需要）
    try {
        const pythonVersion = execSync('python3 --version', { encoding: 'utf-8', timeout: 5000 }).trim();
        items.push({ name: 'Python3', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: pythonVersion });
    }
    catch {
        try {
            const pythonVersion = execSync('python --version', { encoding: 'utf-8', timeout: 5000 }).trim();
            items.push({ name: 'Python', category: CATEGORIES.ENVIRONMENT, status: 'pass', message: pythonVersion });
        }
        catch {
            items.push({ name: 'Python', category: CATEGORIES.ENVIRONMENT, status: 'info', message: '未安装 Python（某些工具可能需要）' });
        }
    }
    return items;
}
async function checkProjectStructure() {
    const items = [];
    const keyFiles = [
        { file: 'package.json', desc: 'Node.js 项目配置' },
        { file: 'tsconfig.json', desc: 'TypeScript 配置' },
        { file: '.gitignore', desc: 'Git 忽略文件' },
        { file: 'README.md', desc: '项目说明文档' },
    ];
    for (const { file, desc } of keyFiles) {
        if (existsSync(file)) {
            try {
                const content = readFileSync(file, 'utf-8');
                if (file.endsWith('.json')) {
                    JSON.parse(content); // Validate JSON
                }
                const size = statSync(file).size;
                items.push({ name: file, category: CATEGORIES.PROJECT, status: 'pass', message: `${desc} (${size}B)` });
            }
            catch {
                items.push({ name: file, category: CATEGORIES.PROJECT, status: 'fail', message: `${desc} - 格式无效` });
            }
        }
        else {
            items.push({ name: file, category: CATEGORIES.PROJECT, status: 'info', message: `${desc} - 不存在` });
        }
    }
    // node_modules
    if (existsSync('node_modules')) {
        try {
            const stat = statSync('node_modules');
            items.push({ name: 'node_modules', category: CATEGORIES.DEPENDENCIES, status: 'pass', message: '已安装依赖' });
        }
        catch {
            items.push({ name: 'node_modules', category: CATEGORIES.DEPENDENCIES, status: 'warn', message: '存在但无法访问' });
        }
    }
    else {
        items.push({ name: 'node_modules', category: CATEGORIES.DEPENDENCIES, status: 'warn', message: '未安装依赖', suggestion: '运行 bun install 或 npm install' });
    }
    // 检查依赖数量
    if (existsSync('package.json')) {
        try {
            const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
            const depCount = Object.keys(pkg.dependencies || {}).length;
            const devDepCount = Object.keys(pkg.devDependencies || {}).length;
            items.push({
                name: '依赖统计',
                category: CATEGORIES.DEPENDENCIES,
                status: 'info',
                message: `${depCount} 个生产依赖 + ${devDepCount} 个开发依赖`,
            });
            // 检查过期依赖
            if (depCount > 50) {
                items.push({
                    name: '依赖数量',
                    category: CATEGORIES.DEPENDENCIES,
                    status: 'warn',
                    message: `生产依赖较多 (${depCount} 个)`,
                    suggestion: '考虑移除不必要的依赖以减小包体积',
                });
            }
        }
        catch {
            // ignore
        }
    }
    // 检查 lock 文件
    const lockFiles = ['bun.lockb', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const hasLock = lockFiles.some(f => existsSync(f));
    if (hasLock) {
        const lockFile = lockFiles.find(f => existsSync(f));
        items.push({ name: 'Lock 文件', category: CATEGORIES.DEPENDENCIES, status: 'pass', message: `存在 (${lockFile})` });
    }
    else {
        items.push({ name: 'Lock 文件', category: CATEGORIES.DEPENDENCIES, status: 'warn', message: '❌ 未找到 lock 文件', suggestion: '提交 lock 文件以确保依赖版本一致' });
    }
    return items;
}
async function checkApiKeys() {
    const items = [];
    const keys = [
        { env: 'ANTHROPIC_API_KEY', desc: 'Anthropic API Key' },
        { env: 'OPENAI_API_KEY', desc: 'OpenAI API Key' },
        { env: 'DEEPSEEK_API_KEY', desc: 'DeepSeek API Key' },
        { env: 'DASHSCOPE_API_KEY', desc: '通义千问 API Key' },
    ];
    let hasAnyKey = false;
    for (const { env, desc } of keys) {
        const val = process.env[env];
        if (val && val.length > 0) {
            hasAnyKey = true;
            const masked = val.slice(0, 4) + '...' + val.slice(-4);
            items.push({ name: desc, category: CATEGORIES.AUTH, status: 'pass', message: `已配置 (${masked})` });
        }
    }
    if (!hasAnyKey) {
        items.push({
            name: 'API Keys',
            category: CATEGORIES.AUTH,
            status: 'warn',
            message: '未检测到任何 API Key',
            suggestion: '设置环境变量: ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY 或 DASHSCOPE_API_KEY',
        });
    }
    // 检查本地配置文件
    const configPaths = [
        join(process.env.HOME || process.env.USERPROFILE || '', '.doge', 'config.json'),
        join(process.env.HOME || process.env.USERPROFILE || '', '.doge', 'lc2.json'),
        '.doge/config.json',
        '.doge/lc2.json',
    ];
    let hasLocalConfig = false;
    for (const p of configPaths) {
        if (existsSync(p)) {
            hasLocalConfig = true;
            items.push({ name: '本地配置', category: CATEGORIES.AUTH, status: 'pass', message: `找到配置文件: ${p}` });
            break;
        }
    }
    if (!hasLocalConfig && !hasAnyKey) {
        items.push({ name: '本地配置', category: CATEGORIES.AUTH, status: 'info', message: '❌ 未找到本地配置文件' });
    }
    return items;
}
async function checkPlaywright() {
    const items = [];
    try {
        const { stdout } = await execAsync('npx playwright --version', { timeout: 10000 });
        items.push({ name: 'Playwright', category: CATEGORIES.BROWSER, status: 'pass', message: stdout.trim() });
    }
    catch {
        items.push({ name: 'Playwright', category: CATEGORIES.BROWSER, status: 'info', message: '未安装（可选）', suggestion: '运行: bun add -D playwright && npx playwright install' });
    }
    // 检查浏览器安装
    const browsersDir = join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'ms-playwright');
    if (existsSync(browsersDir)) {
        try {
            const browsers = readdirSync(browsersDir);
            items.push({ name: '浏览器', category: CATEGORIES.BROWSER, status: 'pass', message: `已安装: ${browsers.join(', ')}` });
        }
        catch {
            // ignore
        }
    }
    return items;
}
// ============================================================================
// System Checks
// ============================================================================
async function checkDiskSpace() {
    const items = [];
    try {
        if (process.platform === 'win32') {
            const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8', timeout: 5000 });
            const lines = output.trim().split('\n').slice(1);
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const caption = parts[0];
                    const free = parseInt(parts[1]) / 1073741824;
                    const total = parseInt(parts[2]) / 1073741824;
                    const usedPercent = ((total - free) / total) * 100;
                    let status = 'pass';
                    if (usedPercent > 90)
                        status = 'fail';
                    else if (usedPercent > 75)
                        status = 'warn';
                    items.push({
                        name: `磁盘 ${caption}`,
                        category: CATEGORIES.SYSTEM,
                        status,
                        message: `剩余 ${free.toFixed(1)}GB / ${total.toFixed(1)}GB (${usedPercent.toFixed(0)}% 已用)`,
                        suggestion: status !== 'pass' ? '清理磁盘空间' : undefined,
                    });
                }
            }
        }
        else {
            const output = execSync('df -h .', { encoding: 'utf-8', timeout: 5000 });
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].split(/\s+/);
                const avail = parts[3];
                const percent = parts[4]?.replace('%', '') || '0';
                const percentNum = parseInt(percent, 10);
                let status = 'pass';
                if (percentNum > 90)
                    status = 'fail';
                else if (percentNum > 75)
                    status = 'warn';
                items.push({
                    name: '磁盘空间',
                    category: CATEGORIES.SYSTEM,
                    status,
                    message: `剩余 ${avail} (${percent} 已用)`,
                    suggestion: status !== 'pass' ? '清理磁盘空间' : undefined,
                });
            }
        }
    }
    catch {
        items.push({ name: '磁盘空间', category: CATEGORIES.SYSTEM, status: 'warn', message: '无法检测' });
    }
    return items;
}
async function checkMemory() {
    const items = [];
    try {
        if (process.platform === 'win32') {
            const output = execSync('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize', { encoding: 'utf-8', timeout: 5000 });
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].trim().split(/\s+/);
                const freeKB = parseInt(parts[0]);
                const totalKB = parseInt(parts[1]);
                const freeGB = freeKB / 1048576;
                const totalGB = totalKB / 1048576;
                const usedPercent = ((totalKB - freeKB) / totalKB) * 100;
                let status = 'pass';
                if (usedPercent > 90)
                    status = 'fail';
                else if (usedPercent > 75)
                    status = 'warn';
                items.push({
                    name: '系统内存',
                    category: CATEGORIES.SYSTEM,
                    status,
                    message: `剩余 ${freeGB.toFixed(1)}GB / ${totalGB.toFixed(1)}GB (${usedPercent.toFixed(0)}% 已用)`,
                });
            }
        }
        else {
            const totalMem = require('os').totalmem();
            const freeMem = require('os').freemem();
            const totalGB = totalMem / 1073741824;
            const freeGB = freeMem / 1073741824;
            const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
            let status = 'pass';
            if (usedPercent > 90)
                status = 'fail';
            else if (usedPercent > 75)
                status = 'warn';
            items.push({
                name: '系统内存',
                category: CATEGORIES.SYSTEM,
                status,
                message: `剩余 ${freeGB.toFixed(1)}GB / ${totalGB.toFixed(1)}GB (${usedPercent}% 已用)`,
            });
        }
    }
    catch {
        items.push({ name: '系统内存', category: CATEGORIES.SYSTEM, status: 'warn', message: '无法检测' });
    }
    return items;
}
async function checkCPU() {
    const items = [];
    try {
        if (process.platform === 'win32') {
            const output = execSync('wmic cpu get Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage', { encoding: 'utf-8', timeout: 5000 });
            const lines = output.trim().split('\n');
            if (lines.length > 1) {
                const parts = lines[1].trim().split(/\s{2,}/);
                items.push({
                    name: 'CPU',
                    category: CATEGORIES.SYSTEM,
                    status: 'pass',
                    message: `${parts[0]} (${parts[1]}核 ${parts[2]}线程, 负载: ${parts[3] || '未知'}%)`,
                });
            }
        }
        else {
            const cpus = require('os').cpus();
            if (cpus.length > 0) {
                items.push({
                    name: 'CPU',
                    category: CATEGORIES.SYSTEM,
                    status: 'pass',
                    message: `${cpus[0].model} (${cpus.length}核)`,
                });
            }
            // 负载
            const loadAvg = require('os').loadavg();
            items.push({
                name: '系统负载',
                category: CATEGORIES.SYSTEM,
                status: loadAvg[0] > cpus.length * 2 ? 'warn' : 'pass',
                message: `1m: ${loadAvg[0].toFixed(2)} | 5m: ${loadAvg[1].toFixed(2)} | 15m: ${loadAvg[2].toFixed(2)}`,
            });
        }
    }
    catch {
        items.push({ name: 'CPU', category: CATEGORIES.SYSTEM, status: 'info', message: '无法检测 CPU 信息' });
    }
    return items;
}
// ============================================================================
// Network Checks
// ============================================================================
async function checkNetwork() {
    const items = [];
    // DNS 解析
    try {
        const start = Date.now();
        execSync('nslookup google.com', { encoding: 'utf-8', timeout: 5000 });
        items.push({ name: 'DNS 解析', category: CATEGORIES.NETWORK, status: 'pass', message: `正常 (${Date.now() - start}ms)` });
    }
    catch {
        items.push({ name: 'DNS 解析', category: CATEGORIES.NETWORK, status: 'warn', message: 'DNS 解析失败', suggestion: '检查网络连接和 DNS 配置' });
    }
    // 网络连通性
    try {
        if (process.platform === 'win32') {
            const start = Date.now();
            execSync('ping -n 1 -w 3000 8.8.8.8', { encoding: 'utf-8', timeout: 5000 });
            items.push({ name: '网络连通', category: CATEGORIES.NETWORK, status: 'pass', message: `正常 (${Date.now() - start}ms)` });
        }
        else {
            const start = Date.now();
            execSync('ping -c 1 -W 3 8.8.8.8', { encoding: 'utf-8', timeout: 5000 });
            items.push({ name: '网络连通', category: CATEGORIES.NETWORK, status: 'pass', message: `正常 (${Date.now() - start}ms)` });
        }
    }
    catch {
        items.push({ name: '网络连通', category: CATEGORIES.NETWORK, status: 'fail', message: '无法连接外网', suggestion: '检查网络连接' });
    }
    return items;
}
// ============================================================================
// Security Checks
// ============================================================================
async function checkSecurity() {
    const items = [];
    // 检查 .env 文件是否提交到 git
    if (existsSync('.env')) {
        try {
            const gitFiles = execSync('git ls-files --error-unmatch .env', { encoding: 'utf-8', timeout: 3000 });
            if (gitFiles.includes('.env')) {
                items.push({
                    name: '.env 安全检查',
                    category: CATEGORIES.SECURITY,
                    status: 'fail',
                    message: '.env 文件已被 git 跟踪',
                    suggestion: '立即从 git 中移除: git rm --cached .env && echo ".env" >> .gitignore',
                });
            }
        }
        catch {
            items.push({ name: '.env 安全检查', category: CATEGORIES.SECURITY, status: 'pass', message: '.env 未被 git 跟踪' });
        }
    }
    // 检查 .gitignore
    if (existsSync('.gitignore')) {
        const content = readFileSync('.gitignore', 'utf-8');
        const ignores = content.split('\n').map(l => l.trim()).filter(Boolean);
        const shouldIgnore = ['.env', '.env.local', 'node_modules', '.doge'];
        for (const pattern of shouldIgnore) {
            if (!ignores.some(i => i.includes(pattern))) {
                items.push({
                    name: '.gitignore 检查',
                    category: CATEGORIES.SECURITY,
                    status: 'warn',
                    message: `.gitignore 未包含 ${pattern}`,
                    suggestion: `添加 ${pattern} 到 .gitignore`,
                });
            }
        }
        if (shouldIgnore.every(p => ignores.some(i => i.includes(p)))) {
            items.push({ name: '.gitignore 检查', category: CATEGORIES.SECURITY, status: 'pass', message: '关键文件已忽略' });
        }
    }
    else {
        items.push({ name: '.gitignore', category: CATEGORIES.SECURITY, status: 'warn', message: '缺少 .gitignore 文件', suggestion: '创建 .gitignore 并添加 node_modules, .env, .doge 等' });
    }
    return items;
}
// ============================================================================
// Log Analysis
// ============================================================================
async function analyzeLogs() {
    const items = [];
    const logDirs = ['.doge/logs', 'logs', '.logs'];
    let hasLogs = false;
    for (const dir of logDirs) {
        if (existsSync(dir)) {
            hasLogs = true;
            try {
                const files = readdirSync(dir).filter(f => f.endsWith('.log') || f.endsWith('.txt'));
                items.push({ name: '日志目录', category: CATEGORIES.LOGS, status: 'pass', message: `${dir} (${files.length} 个日志文件)` });
                // 分析最近的日志文件
                for (const file of files.slice(0, 3)) {
                    const filePath = join(dir, file);
                    try {
                        const content = readFileSync(filePath, 'utf-8');
                        const lines = content.split('\n');
                        const errorLines = lines.filter(l => l.toLowerCase().includes('error') || l.toLowerCase().includes('fail'));
                        const warnLines = lines.filter(l => l.toLowerCase().includes('warn'));
                        if (errorLines.length > 0) {
                            items.push({
                                name: `日志: ${file}`,
                                category: CATEGORIES.LOGS,
                                status: 'warn',
                                message: `${lines.length} 行, ${errorLines.length} 错误, ${warnLines.length} 警告`,
                                details: errorLines.slice(-3).join('\n'),
                            });
                        }
                    }
                    catch {
                        // ignore
                    }
                }
            }
            catch {
                // ignore
            }
        }
    }
    if (!hasLogs) {
        items.push({ name: '日志分析', category: CATEGORIES.LOGS, status: 'info', message: '❌ 未找到日志目录' });
    }
    return items;
}
// ============================================================================
// Performance Metrics
// ============================================================================
async function checkPerformance() {
    const items = [];
    // 启动时间估算
    try {
        const start = Date.now();
        execSync('node -e "console.log(1)"', { encoding: 'utf-8', timeout: 5000 });
        const duration = Date.now() - start;
        items.push({
            name: 'Node.js 启动',
            category: CATEGORIES.PERFORMANCE,
            status: duration > 1000 ? 'warn' : 'pass',
            message: `${duration}ms`,
            suggestion: duration > 1000 ? 'Node.js 启动较慢，检查系统资源' : undefined,
        });
    }
    catch {
        items.push({ name: 'Node.js 启动', category: CATEGORIES.PERFORMANCE, status: 'warn', message: '无法测试' });
    }
    // 磁盘 I/O 检查（简单检查）
    try {
        const start = Date.now();
        const testFile = join(process.cwd(), '.doge', '.perf-test');
        writeFileSync(testFile, 'x'.repeat(1024 * 100)); // 100KB
        readFileSync(testFile);
        const duration = Date.now() - start;
        execSync(process.platform === 'win32' ? `del "${testFile}"` : `rm "${testFile}"`);
        items.push({
            name: '磁盘 I/O',
            category: CATEGORIES.PERFORMANCE,
            status: duration > 1000 ? 'warn' : 'pass',
            message: `100KB 读写: ${duration}ms`,
        });
    }
    catch {
        items.push({ name: '磁盘 I/O', category: CATEGORIES.PERFORMANCE, status: 'info', message: '无法测试' });
    }
    return items;
}
// ============================================================================
// Configuration Checks
// ============================================================================
async function checkConfiguration() {
    const items = [];
    // TypeScript 配置
    if (existsSync('tsconfig.json')) {
        try {
            const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf-8'));
            const compilerOptions = tsconfig.compilerOptions || {};
            if (compilerOptions.strict) {
                items.push({ name: 'TS 严格模式', category: CATEGORIES.CONFIGURATION, status: 'pass', message: '已启用 strict' });
            }
            else {
                items.push({ name: 'TS 严格模式', category: CATEGORIES.CONFIGURATION, status: 'warn', message: '未启用 strict 模式', suggestion: '在 tsconfig.json 中添加 "strict": true' });
            }
            if (compilerOptions.moduleResolution === 'bundler' || compilerOptions.moduleResolution === 'node16') {
                items.push({ name: 'TS 模块解析', category: CATEGORIES.CONFIGURATION, status: 'pass', message: `使用 ${compilerOptions.moduleResolution}` });
            }
        }
        catch {
            items.push({ name: 'TS 配置', category: CATEGORIES.CONFIGURATION, status: 'fail', message: 'tsconfig.json 格式无效' });
        }
    }
    // package.json scripts
    if (existsSync('package.json')) {
        try {
            const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
            const scripts = pkg.scripts || {};
            const hasBuild = 'build' in scripts;
            const hasTest = 'test' in scripts;
            const hasLint = 'lint' in scripts;
            const hasDev = 'dev' in scripts;
            if (hasBuild && hasTest && hasLint) {
                items.push({ name: 'NPM Scripts', category: CATEGORIES.CONFIGURATION, status: 'pass', message: `build, test, lint 脚本齐全` });
            }
            else {
                const missing = [];
                if (!hasBuild)
                    missing.push('build');
                if (!hasTest)
                    missing.push('test');
                if (!hasLint)
                    missing.push('lint');
                items.push({ name: 'NPM Scripts', category: CATEGORIES.CONFIGURATION, status: 'warn', message: `缺少脚本: ${missing.join(', ')}` });
            }
        }
        catch {
            // ignore
        }
    }
    return items;
}
// ============================================================================
// Main Diagnostic Runner
// ============================================================================
async function runDiagnostics(options = {}) {
    const start = Date.now();
    const allItems = [];
    // Run all checks
    const checks = [
        checkGit,
        checkNodeEnvironment,
        checkProjectStructure,
        checkApiKeys,
        checkPlaywright,
        checkDiskSpace,
        checkMemory,
        checkCPU,
        checkNetwork,
        checkSecurity,
        analyzeLogs,
        checkPerformance,
        checkConfiguration,
    ];
    for (const check of checks) {
        try {
            const items = await check();
            allItems.push(...items);
        }
        catch (err) {
            allItems.push({
                name: '检查异常',
                category: CATEGORIES.SYSTEM,
                status: 'fail',
                message: `${check.name}: ${err instanceof Error ? err.message : String(err)}`,
            });
        }
    }
    // Filter by categories if specified
    let filteredItems = allItems;
    if (options.categories && options.categories.length > 0) {
        filteredItems = allItems.filter(item => options.categories.includes(item.category));
    }
    const result = {
        items: filteredItems,
        passed: filteredItems.filter(i => i.status === 'pass').length,
        warned: filteredItems.filter(i => i.status === 'warn').length,
        failed: filteredItems.filter(i => i.status === 'fail').length,
        info: filteredItems.filter(i => i.status === 'info').length,
        totalDuration: Date.now() - start,
        timestamp: new Date().toISOString(),
        summary: '',
    };
    // Generate summary
    if (result.failed > 0) {
        result.summary = `❌ 有 ${result.failed} 个严重问题需要修复`;
    }
    else if (result.warned > 0) {
        result.summary = `⚠️ 有 ${result.warned} 个警告项`;
    }
    else {
        result.summary = '✅ 所有检查项均通过';
    }
    return result;
}
// ============================================================================
// History Management
// ============================================================================
function loadHistory() {
    try {
        if (existsSync(HISTORY_FILE)) {
            return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
        }
    }
    catch {
        // ignore
    }
    return { version: '1.0', runs: [] };
}
function saveHistory(history) {
    try {
        mkdirSync(DIAGNOSTIC_DIR, { recursive: true });
        writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    }
    catch {
        // ignore
    }
}
function addToHistory(result) {
    const history = loadHistory();
    history.runs.push({
        timestamp: result.timestamp,
        passed: result.passed,
        warned: result.warned,
        failed: result.failed,
        items: result.items,
    });
    // Keep only last 100 runs
    if (history.runs.length > 100) {
        history.runs = history.runs.slice(-100);
    }
    saveHistory(history);
}
function compareWithHistory(result) {
    const history = loadHistory();
    if (history.runs.length < 2)
        return '📊 暂无历史数据对比';
    const prev = history.runs[history.runs.length - 2];
    const curr = history.runs[history.runs.length - 1];
    const lines = [];
    lines.push('📊 与上次诊断对比:');
    lines.push(`  通过: ${prev.passed} → ${curr.passed} (${curr.passed - prev.passed >= 0 ? '+' : ''}${curr.passed - prev.passed})`);
    lines.push(`  警告: ${prev.warned} → ${curr.warned} (${curr.warned - prev.warned >= 0 ? '+' : ''}${curr.warned - prev.warned})`);
    lines.push(`  失败: ${prev.failed} → ${curr.failed} (${curr.failed - prev.failed >= 0 ? '+' : ''}${curr.failed - prev.failed})`);
    return lines.join('\n');
}
// ============================================================================
// Output Formatters
// ============================================================================
function formatTextReport(result) {
    const lines = [];
    lines.push('🔍 系统诊断报告');
    lines.push(`   时间: ${new Date(result.timestamp).toLocaleString('zh-CN')}`);
    lines.push(`   耗时: ${result.totalDuration}ms`);
    lines.push('');
    // Group by category
    const categories = new Map();
    for (const item of result.items) {
        if (!categories.has(item.category))
            categories.set(item.category, []);
        categories.get(item.category).push(item);
    }
    for (const [category, items] of categories) {
        lines.push(`  ${category}:`);
        for (const item of items) {
            const icon = item.status === 'pass' ? '✅' : item.status === 'warn' ? '⚠️' : item.status === 'fail' ? '❌' : 'ℹ️';
            lines.push(`    ${icon} ${item.name}: ${item.message}`);
            if (item.suggestion) {
                lines.push(`       → ${item.suggestion}`);
            }
            if (item.details) {
                lines.push(`       ${item.details.split('\n').join('\n       ')}`);
            }
        }
        lines.push('');
    }
    // Summary
    lines.push('═'.repeat(50));
    lines.push(`📊 总结: ${result.passed} 通过 | ${result.warned} 警告 | ${result.failed} 失败 | ${result.info} 信息`);
    lines.push('');
    lines.push(result.summary);
    return lines.join('\n');
}
function formatHTMLReport(result) {
    const rows = result.items.map(item => {
        const color = item.status === 'pass' ? 'green' : item.status === 'warn' ? 'orange' : item.status === 'fail' ? 'red' : 'gray';
        return `<tr><td>${item.category}</td><td>${item.name}</td><td style="color:${color}">${item.status}</td><td>${item.message}</td></tr>`;
    }).join('\n');
    return `<!DOCTYPE html>
<html><head><title>诊断报告</title>
<style>body{font-family:sans-serif} table{border-collapse:collapse;width:100%} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f0f0f0}</style>
</head><body>
<h1>🔍 系统诊断报告</h1>
<p>时间: ${result.timestamp}</p>
<p>通过: ${result.passed} | 警告: ${result.warned} | 失败: ${result.failed}</p>
<table><tr><th>分类</th><th>项目</th><th>状态</th><th>信息</th></tr>
${rows}</table></body></html>`;
}
// ============================================================================
// Help Text
// ============================================================================
function renderHelp() {
    return [
        '🔍 系统诊断 - 增强版',
        '',
        '检测环境问题、配置错误、性能瓶颈、安全隐患。',
        '',
        '📖 用法: ',
        '  /diagnose [选项]',
        '',
        '选项:',
        '  --json              JSON 格式输出',
        '  --html              HTML 格式输出',
        '  --export <文件>     导出报告到文件',
        '  --compare           与上次诊断对比',
        '  --history           查看诊断历史',
        '  --categories <列表> 只检查指定分类（逗号分隔）',
        '  --quick             快速模式（只检查关键项）',
        '  --fix               尝试自动修复问题',
        '📖 用法:   --help              显示帮助',
        '',
        '检查分类:',
        '  环境: Git, Node.js, Bun, npm, pnpm, Python',
        '  项目: package.json, tsconfig.json, .gitignore, lock文件',
        '  认证: API Keys, 本地配置',
        '  浏览器: Playwright',
        '  系统: 磁盘, 内存, CPU, 负载',
        '  网络: DNS, 连通性',
        '  安全: .env 泄露, .gitignore',
        '❌ 错误:   日志: 错误日志分析',
        '  性能: 启动时间, 磁盘I/O',
        '  配置: TypeScript, npm scripts',
        '',
        '💡 示例: ',
        '  /diagnose                         完整诊断',
        '  /diagnose --quick                 快速诊断',
        '  /diagnose --categories 环境,系统   只检查环境和系统',
        '  /diagnose --json --export report.json',
        '  /diagnose --compare               与上次对比',
    ].join('\n');
}
// ============================================================================
// Command
// ============================================================================
export const call = async (args) => {
    const s = (args ?? '').trim();
    if (s.includes('--help')) {
        return { type: 'text', value: renderHelp() };
    }
    if (s.includes('--history')) {
        const history = loadHistory();
        const lines = [`📋 诊断历史 (${history.runs.length} 次):`];
        for (const run of history.runs.slice(-10).reverse()) {
            lines.push(`  ${run.timestamp}: ${run.passed}通过 ${run.warned}警告 ${run.failed}失败`);
        }
        return { type: 'text', value: lines.join('\n') };
    }
    const json = s.includes('--json');
    const html = s.includes('--html');
    const quick = s.includes('--quick');
    const compare = s.includes('--compare');
    const exportMatch = s.match(/--export\s+(\S+)/);
    const categoriesMatch = s.match(/--categories\s+(\S+)/);
    const options = { json };
    if (categoriesMatch) {
        options.categories = categoriesMatch[1].split(',');
    }
    const result = await runDiagnostics(options);
    // Add to history
    addToHistory(result);
    // Compare with previous
    let compareResult = '';
    if (compare) {
        compareResult = '\n\n' + compareWithHistory(result);
    }
    // Export
    if (exportMatch) {
        const path = exportMatch[1];
        const content = html ? formatHTMLReport(result) : JSON.stringify(result, null, 2);
        try {
            writeFileSync(path, content, 'utf-8');
            return { type: 'text', value: `✅ 报告已导出到: ${path}` };
        }
        catch (err) {
            return { type: 'text', value: `❌ 导出失败: ${err instanceof Error ? err.message : String(err)}` };
        }
    }
    if (json) {
        return { type: 'json', value: JSON.stringify(result, null, 2) };
    }
    if (html) {
        return { type: 'text', value: formatHTMLReport(result) };
    }
    return { type: 'text', value: formatTextReport(result) + compareResult };
};
// ============================================================================
// Command Definition
// ============================================================================
const command = {
    type: 'local',
    name: 'diagnose',
    description: '系统诊断 - 环境/性能/安全/日志/网络/配置全面检查',
    aliases: ['/diagnose', '/diag'],
    arguments: [
        { name: '--json', description: 'JSON 格式输出', required: false },
        { name: '--html', description: 'HTML 格式输出', required: false },
        { name: '--export', description: '导出报告到文件', required: false },
        { name: '--compare', description: '与上次诊断对比', required: false },
        { name: '--history', description: '查看诊断历史', required: false },
        { name: '--categories', description: '指定检查分类', required: false },
        { name: '--quick', description: '快速模式', required: false },
        { name: 'help', description: '显示帮助', required: false },
    ],
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call: call }),
};
export default command;
