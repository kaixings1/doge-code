import { createTask } from '../../utils/taskManager.js';
import { getSessionId } from '../../bootstrap/state.js';
import { enqueue } from '../../utils/messageQueueManager.js';
// ---------------------------------------------------------------------------
// Background Task Engine — checkpoint-based execution with resume support
// ---------------------------------------------------------------------------
let _sessionId = null;
function resolveSessionId() {
    if (!_sessionId) {
        try {
            _sessionId = getSessionId();
        }
        catch {
            _sessionId = 'default';
        }
    }
    return _sessionId;
}
const STEP_TIMEOUT_MS = 5 * 60 * 1000; // 每步默认 5 分钟超时
function formatDuration(createdAt, updatedAt) {
    const start = new Date(createdAt).getTime();
    const end = new Date(updatedAt).getTime();
    const diff = Math.max(0, end - start);
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    if (minutes > 0)
        return `${minutes}分${seconds}秒`;
    return `${seconds}秒`;
}
const CHECKPOINT_FILE = () => {
    return require('path').join(require('os').homedir(), '.doge', 'tasks', `bg-${resolveSessionId()}.json`);
};
function loadBgTask() {
    try {
        const raw = require('fs').readFileSync(CHECKPOINT_FILE(), 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function saveBgTask(task) {
    try {
        const dir = require('path').dirname(CHECKPOINT_FILE());
        require('fs').mkdirSync(dir, { recursive: true });
        require('fs').writeFileSync(CHECKPOINT_FILE(), JSON.stringify(task, null, 2), 'utf-8');
    }
    catch { /* non-critical */ }
}
function createBgTask(description) {
    const task = {
        id: 'bg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
        description,
        status: 'running',
        currentStep: 0,
        totalSteps: 0,
        checkpoints: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    saveBgTask(task);
    return task;
}
// ---------------------------------------------------------------------------
// Main command handler
// ---------------------------------------------------------------------------
export const call = async (args, context) => {
    resolveSessionId();
    const trimmed = args?.trim() || '';
    // 1. 优先检查 running 任务（自动恢复）— 仅在无参数时触发
    if (trimmed === '') {
        const existing = loadBgTask();
        if (existing && existing.status === 'running') {
            const resumePrompt = buildResumePrompt(existing);
            enqueue({
                value: resumePrompt,
                mode: 'prompt',
                priority: 'next',
            });
            return {
                type: 'text',
                value: `## 🔄 自动恢复后台任务

检测到未完成的任务，已自动续跑：

- **任务**: ${existing.description}
- **当前步**: ${existing.currentStep}/${existing.totalSteps || '?'}
- **Checkpoints**: ${existing.checkpoints.length}

> AI 已自动继续执行，可随时关闭程序，下次启动时 /task 会恢复进度。`,
            };
        }
        // 无任务时显示帮助
        return {
            type: 'text',
            value: `📝 **Background Task Engine** (/task)

创建持久化任务，支持断点续跑。

📖 **用法**
┌──────────────────────────────────────────────────────────────┐
│ /task <描述>              提交新任务并开始执行                │
│ /task list                查看所有任务                       │
│ /task status <id>         查看任务详情                       │
│ /task resume <id>         恢复暂停/失败的任务                │
│ /task cancel <id>         取消任务                           │
│ /task result <id>         输出完成报告                       │
└──────────────────────────────────────────────────────────────┘

💡 **示例**
/task "审查 src/commands 目录，列出需要重构的文件"
/task "生成所有 API 端点的文档"
/task "分析测试覆盖率并生成报告"`,
        };
    }
    // 2. 子命令路由
    const knownSubcommands = ['list', 'status', 'resume', 'cancel', 'result'];
    const firstWord = trimmed.split(/\s+/)[0];
    if (knownSubcommands.includes(firstWord)) {
        return handleSubcommand(trimmed);
    }
    // 3. 创建新任务
    const task = createBgTask(trimmed);
    const sessionId = getSessionId();
    const now = new Date().toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    // Persist to taskManager for tracking
    try {
        await createTask(sessionId, {
            title: trimmed.slice(0, 50),
            description: trimmed,
            priority: 'medium',
            tags: ['background'],
        });
    }
    catch { /* non-critical */ }
    // Enqueue execution prompt
    const executionPrompt = buildExecutionPrompt(task);
    enqueue({
        value: executionPrompt,
        mode: 'prompt',
        priority: 'next',
    });
    return {
        type: 'text',
        value: `## ✅ 后台任务已提交

**任务**: ${trimmed}
**ID**: ${task.id}
**状态**: 执行中
**时间**: ${now}

### 操作指南
- **查看进度**: /task status
- **输出报告**: /task result ${task.id}
- **暂停/恢复**: 程序重启后 /task 自动续跑
- **取消**: /task cancel ${task.id}

> 每步执行结果自动保存，关闭程序不影响进度。`,
    };
};
// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------
function handleSubcommand(input) {
    const parts = input.split(/\s+/);
    const sub = parts[0];
    const arg = parts[1] || '';
    switch (sub) {
        case 'list': {
            const task = loadBgTask();
            if (!task) {
                return { type: 'text', value: '没有后台任务。\n使用 /task <描述> 创建新任务。' };
            }
            const icon = { running: '🔄', completed: '✅', failed: '❌', paused: '⏸️' }[task.status] || '?';
            return {
                type: 'text',
                value: `## 后台任务 (${task.status})

${icon} **${task.description.slice(0, 80)}**
- ID: ${task.id}
- 进度: ${task.currentStep}/${task.totalSteps || '?'}
- Checkpoints: ${task.checkpoints.length}
- 更新: ${task.updatedAt}
${task.error ? `- 错误: ${task.error.slice(0, 100)}` : ''}`,
            };
        }
        case 'status': {
            const task = loadBgTask();
            if (!task)
                return { type: 'text', value: `任务未找到: ${arg || '(无 ID)'}` };
            const lines = [
                `## 任务详情: ${task.id}`,
                '',
                `**描述**: ${task.description}`,
                `**状态**: ${task.status}`,
                `**进度**: 第 ${task.currentStep} 步 / 共 ${task.totalSteps || '?'} 步`,
                `**创建**: ${task.createdAt}`,
                `**更新**: ${task.updatedAt}`,
                `**Checkpoints**: ${task.checkpoints.length}`,
            ];
            if (task.error)
                lines.push(`**错误**: ${task.error}`);
            if (task.finalResult)
                lines.push(`**结果**: ${task.finalResult.slice(0, 300)}`);
            lines.push('');
            if (task.checkpoints.length > 0) {
                lines.push('### 最近步骤');
                for (const cp of task.checkpoints.slice(-5)) {
                    lines.push(`- [${cp.step}] ${cp.action}: ${cp.result.slice(0, 100)}`);
                }
            }
            return { type: 'text', value: lines.join('\n') };
        }
        case 'resume': {
            const task = loadBgTask();
            if (!task)
                return { type: 'text', value: `任务未找到: ${arg}` };
            if (task.status === 'completed')
                return { type: 'text', value: '任务已完成。使用 /task result 查看报告。' };
            if (task.status === 'failed' && !task.error?.includes('timeout')) {
                return { type: 'text', value: `任务失败: ${task.error}\n使用 /task <新描述> 创建新任务。` };
            }
            task.status = 'running';
            task.updatedAt = new Date().toISOString();
            saveBgTask(task);
            const prompt = buildResumePrompt(task);
            enqueue({ value: prompt, mode: 'prompt', priority: 'next' });
            return {
                type: 'text',
                value: `## 🔄 恢复任务

**任务**: ${task.description}
**从第 ${task.currentStep} 步继续**
**已有 Checkpoints**: ${task.checkpoints.length}

> AI 已恢复执行，之前的进度已保留。`,
            };
        }
        case 'cancel': {
            const task = loadBgTask();
            if (!task)
                return { type: 'text', value: `任务未找到: ${arg}` };
            task.status = 'failed';
            task.error = 'cancelled by user';
            task.updatedAt = new Date().toISOString();
            saveBgTask(task);
            return { type: 'text', value: `已取消任务: ${task.id}` };
        }
        case 'result': {
            const task = loadBgTask();
            if (!task)
                return { type: 'text', value: `任务未找到: ${arg}` };
            if (task.status !== 'completed') {
                return { type: 'text', value: `任务未完成 (当前: ${task.status})\n使用 /task status 查看进度。` };
            }
            const lines = [
                '## 📊 任务完成报告',
                '',
                `**任务**: ${task.description}`,
                `**ID**: ${task.id}`,
                `**总步数**: ${task.currentStep}`,
                `**耗时**: ${formatDuration(task.createdAt, task.updatedAt)} (${task.createdAt} → ${task.updatedAt})`,
                '',
                '### 执行结果',
                task.finalResult || '(无结果)',
                '',
                '### 执行轨迹',
            ];
            for (const cp of task.checkpoints) {
                lines.push(`[${cp.step}] ${cp.action}`);
                if (cp.filesModified?.length) {
                    lines.push(`  📄 ${cp.filesModified.join(', ')}`);
                }
            }
            return { type: 'text', value: lines.join('\n') };
        }
        default:
            return { type: 'text', value: `未知子命令: ${sub}\n可用: list, status, resume, cancel, result` };
    }
}
// ---------------------------------------------------------------------------
// Prompt builders — tells the AI loop how to execute and checkpoint
// ---------------------------------------------------------------------------
function buildExecutionPrompt(task) {
    return `[后台任务执行 · 第1步]
任务: ${task.description}

=== 执行规则 ===
1. 按任务描述逐步执行，每完成一步输出: [CHECKPOINT] 步骤描述 | 修改的文件路径(逗号分隔)
2. 完成后输出: [COMPLETE] 最终结果摘要
3. 遇到无法继续的错误输出: [FAILED] 错误原因
4. 每步检查进度，不要跳过关键分析
5. 文件修改使用 Read/Edit/Write 工具
6. 每步超时 ${Math.floor(STEP_TIMEOUT_MS / 60000)} 分钟，超时未完成应输出 [FAILED] timeout

开始执行第一步。`;
}
function buildResumePrompt(task) {
    const recentSteps = task.checkpoints.slice(-3).map(cp => `[${cp.step}] ${cp.action}: ${cp.result.slice(0, 80)}`).join('\n');
    return `[后台任务恢复 · 从第${task.currentStep + 1}步继续]
任务: ${task.description}

=== 已完成步骤 ===
${recentSteps || '(无)'}

=== 继续规则 ===
1. 从上一步的结果继续，不要重复已完成的工作
2. 每完成一步输出: [CHECKPOINT] 步骤描述 | 修改的文件路径
3. 完成后输出: [COMPLETE] 最终结果摘要
4. 遇到无法继续的错误输出: [FAILED] 错误原因

从第 ${task.currentStep + 1} 步开始执行。`;
}
/**
 * Parse checkpoint line from AI output
 * Format: [CHECKPOINT] action description | file1,file2
 * Or: [COMPLETE] final result
 * Or: [FAILED] error reason
 */
export function parseCheckpointLine(line) {
    if (line.startsWith('[CHECKPOINT] ')) {
        const content = line.slice('[CHECKPOINT] '.length);
        const [action, filesPart] = content.split(' | ');
        const files = filesPart ? filesPart.split(',').map(f => f.trim()).filter(Boolean) : [];
        return { type: 'checkpoint', action: action?.trim() || '', files };
    }
    if (line.startsWith('[COMPLETE] ')) {
        return { type: 'complete', action: line.slice('[COMPLETE] '.length), files: [] };
    }
    if (line.startsWith('[FAILED] ')) {
        return { type: 'failed', action: line.slice('[FAILED] '.length), files: [] };
    }
    return null;
}
