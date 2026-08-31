import { getSessionId } from '../../bootstrap/state.js';
import { createTask, listTasks, updateTaskStatus, deleteTask, clearDoneTasks, addSubTask, pauseTask, resumeTask, cancelTask, startTaskExecution, } from '../../utils/taskManager.js';
/**
 * /todo 命令 - 任务管理工具
 * 完整的任务生命周期管理，支持创建/查看/状态变更/子任务/搜索/导出
 */
const HELP_TEXT = `📋 **Todo 命令** - 任务管理工具

**用法**: /todo <子命令> [参数]

**子命令**:
  (无)             - 显示任务概览（默认）
  list [选项]       - 列出任务，选项: --all, --active, --done, --tag <标签>
  <标题> [优先级]   - 创建新任务，优先级: urgent/high/medium/low
  done <ID>        - 标记任务完成
  delete <ID>      - 删除任务
  pause <ID>       - 暂停任务
  resume <ID>      - 恢复任务
  cancel <ID>      - 取消任务
  start <ID>       - 开始执行任务
  subtask <父ID> <标题> - 添加子任务
  info <ID>        - 查看任务详情
  search <关键词>  - 搜索任务
  clear-done       - 清除已完成任务
  export [格式]    - 导出任务，格式: json/csv/text
  help             - 显示帮助

**示例**:
  /todo                    # 查看任务概览
  /todo list               # 列出所有任务
  /todo list --tag api     # 列出标签为 api 的任务
  /todo "修复bug" urgent   # 创建紧急任务
  /todo done task_123      # 标记完成
  /todo info task_123      # 查看详情
  /todo search 文档        # 搜索含"文档"的任务`;
// 格式化任务列表
function formatTaskList(tasks, showAll = false) {
    if (!tasks || tasks.length === 0) {
        return `📭 **暂无任务**

🚀 **快速开始**:
  /todo "任务标题"          - 创建新任务
  /todo "任务标题" high     - 创建高优先级任务`;
    }
    const statusIcons = {
        pending: '⏳',
        'in-progress': '🚧',
        done: '✅',
        cancelled: '❌'
    };
    const priorityIcons = {
        urgent: '🚨',
        high: '🔥',
        medium: '📝',
        low: '📌'
    };
    // 过滤掉已完成任务（除非显示所有）
    const displayTasks = showAll ? tasks : tasks.filter((t) => t.status !== 'done');
    const taskList = displayTasks.map((t) => {
        const icon = statusIcons[t.status] || '⏳';
        const pIcon = priorityIcons[t.priority] || '📝';
        const tags = t.tags?.length ? t.tags.map((tag) => `#${tag}`).join(' ') : '';
        return `${icon} ${pIcon} **${t.title}** (\`${t.id}\`)${tags ? ` ${tags}` : ''}`;
    }).join('\n');
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    return `📋 **任务列表** (${tasks.length} 个任务${doneCount > 0 ? `，${doneCount} 个已完成` : ''})

${taskList}

💡 **提示**:
• 使用 \`/todo done <ID>\` 标记完成
• 使用 \`/todo info <ID>\` 查看详情
• 使用 \`/todo list --all\` 查看所有任务（包括已完成）`;
}
export const call = async (args) => {
    const s = (args ?? '').trim();
    const sid = typeof getSessionId === 'function' ? getSessionId() : 'default';
    const rawWords = s.split(/\s+/).filter(Boolean);
    const first = (rawWords[0] ?? '').toLowerCase();
    // 显示帮助
    if (first === 'help') {
        const tasks = await listTasks(sid);
        const doneCount = tasks.filter((t) => t.status === 'done').length;
        const pendingCount = tasks.filter((t) => t.status === 'pending').length;
        const inProgressCount = tasks.filter((t) => t.status === 'in-progress').length;
        return {
            type: 'text',
            value: `${HELP_TEXT}

📊 **当前统计**:
• 总任务: ${tasks.length} 个
• 待处理: ${pendingCount} 个
• 执行中: ${inProgressCount} 个
• 已完成: ${doneCount} 个

🔗 **快捷方式**:
• /todo list --all      查看所有任务
• /task "描述"          快速创建并执行任务
• /task-create          完整任务管理工具`
        };
    }
    // 概览模式（无参数或空）
    if (s === '' || first === '') {
        const tasks = await listTasks(sid);
        const doneCount = tasks.filter((t) => t.status === 'done').length;
        const pendingCount = tasks.filter((t) => t.status === 'pending').length;
        const inProgressCount = tasks.filter((t) => t.status === 'in-progress').length;
        const recentTasks = tasks.slice(0, 5);
        if (tasks.length === 0) {
            return {
                type: 'text',
                value: `📭 **暂无任务**

🚀 **开始第一件事**:
  /todo "任务标题"        - 创建任务
  /task "任务标题"        - 创建并自动执行`
            };
        }
        const statusIcons = {
            pending: '⏳',
            'in-progress': '🚧',
            done: '✅',
            cancelled: '❌'
        };
        const taskList = recentTasks.map((t) => {
            const icon = statusIcons[t.status] || '⏳';
            return `${icon} **${t.title}** (\`${t.id}\`)`;
        }).join('\n');
        return {
            type: 'text',
            value: `📋 **任务概览**

📊 统计: 总 ${tasks.length}，活跃 ${tasks.length - doneCount}，已完成 ${doneCount}

📝 **最近任务**:
${taskList}${tasks.length > 5 ? `\n... 还有 ${tasks.length - 5} 个任务` : ''}

💡 使用 \`/todo list\` 查看全部，\`/todo help\` 查看完整命令`
        };
    }
    // 列出任务
    if (first === 'list') {
        const tasks = await listTasks(sid);
        // 检查选项
        const showAll = s.includes('--all');
        const showActive = s.includes('--active') || s.includes('--pending');
        const showDone = s.includes('--done');
        const tagMatch = s.match(/--tag\s+(\S+)/);
        const tagName = tagMatch ? tagMatch[1] : null;
        let filtered = tasks;
        if (showActive) {
            filtered = filtered.filter((t) => t.status === 'pending' || t.status === 'in-progress');
        }
        else if (showDone) {
            filtered = filtered.filter((t) => t.status === 'done');
        }
        else if (tagName) {
            filtered = filtered.filter((t) => t.tags?.includes(tagName));
        }
        return { type: 'text', value: formatTaskList(filtered, showAll || true) };
    }
    // 搜索任务
    if (first === 'search') {
        const keyword = rawWords.slice(1).join(' ');
        if (!keyword) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo search <关键词>\`

📋 **示例**: \`/todo search 文档\``
            };
        }
        const tasks = await listTasks(sid);
        const matched = tasks.filter((t) => t.title?.toLowerCase().includes(keyword.toLowerCase()) ||
            t.description?.toLowerCase().includes(keyword.toLowerCase()));
        if (matched.length === 0) {
            return {
                type: 'text',
                value: `🔍 **搜索结果**

未找到匹配 "\`${keyword}\`" 的任务`
            };
        }
        const statusIcons = {
            pending: '⏳',
            'in-progress': '🚧',
            done: '✅',
            cancelled: '❌'
        };
        const taskList = matched.map((t) => {
            const icon = statusIcons[t.status] || '⏳';
            return `${icon} **${t.title}** (\`${t.id}\`)`;
        }).join('\n');
        return {
            type: 'text',
            value: `🔍 **搜索结果** (${matched.length} 个匹配)

${taskList}`
        };
    }
    // 导出任务
    if (first === 'export') {
        const format = rawWords[1] || 'text';
        const tasks = await listTasks(sid);
        if (tasks.length === 0) {
            return { type: 'text', value: '📭 没有任务可导出' };
        }
        if (format === 'json') {
            return {
                type: 'text',
                value: `📤 **任务导出 (JSON)**

\`\`\`json
${JSON.stringify(tasks, null, 2)}
\`\`\``
            };
        }
        if (format === 'csv') {
            const header = 'ID,Title,Priority,Status,CreatedAt,UpdatedAt';
            const rows = tasks.map((t) => `"${t.id}","${t.title}","${t.priority}","${t.status}","${t.createdAt}","${t.updatedAt}"`).join('\n');
            return {
                type: 'text',
                value: `📤 **任务导出 (CSV)**

\`\`\`csv
${header}
${rows}
\`\`\``
            };
        }
        // 文本格式
        const taskList = tasks.map((t) => `- ${t.title} [${t.priority}] (${t.status}) - ${t.id}`).join('\n');
        return {
            type: 'text',
            value: `📤 **任务导出 (Text)**

${taskList}`
        };
    }
    // 创建任务
    const priorityWords = ['urgent', 'high', 'medium', 'low'];
    if (!['done', 'delete', 'rm', 'pause', 'resume', 'cancel', 'start', 'subtask', 'sub', 'info', 'search', 'export', 'list', 'clear-done'].includes(first)) {
        const priority = rawWords.find((w) => priorityWords.includes(w)) || 'medium';
        const title = rawWords.filter((w) => !priorityWords.includes(w)).join(' ') || '未命名任务';
        const task = await createTask(sid, { title, priority, tags: ['todo'] });
        const priorityEmoji = {
            urgent: '🚨',
            high: '🔥',
            medium: '📝',
            low: '📌'
        };
        return {
            type: 'text',
            value: `✅ **任务已创建** ${priorityEmoji[priority] || '📝'}

📋 **任务详情**:
• 标题: ${task.title}
• ID: \`${task.id}\`
• 优先级: ${priority}
• 状态: 待处理
• 创建时间: ${new Date().toLocaleString('zh-CN')}

🔗 **后续操作**:
• 查看详情: \`/todo info ${task.id}\`
• 开始执行: \`/todo start ${task.id}\`
• 标记完成: \`/todo done ${task.id}\``
        };
    }
    // 标记完成
    if (first === 'done' || first === 'complete') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo done <任务ID>\`

📋 **示例**: \`/todo done task_1234567890\``
            };
        }
        const t = await updateTaskStatus(sid, id, 'done');
        if (t) {
            return {
                type: 'text',
                value: `✅ **任务完成**

🎉 **${t.title}** 已标记为完成！`
            };
        }
        return {
            type: 'text',
            value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。

💡 使用 \`/todo list\` 查看所有可用任务`
        };
    }
    // 删除任务
    if (first === 'delete' || first === 'rm') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo delete <任务ID>\``
            };
        }
        const ok = await deleteTask(sid, id);
        if (ok) {
            return {
                type: 'text',
                value: `🗑️ **任务已删除**

✅ 任务 \`${id}\` 已成功删除。`
            };
        }
        return {
            type: 'text',
            value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。`
        };
    }
    // 暂停任务
    if (first === 'pause') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo pause <任务ID>\``
            };
        }
        const t = await pauseTask(sid, id);
        if (!t) {
            return {
                type: 'text',
                value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。`
            };
        }
        if (t.error) {
            return { type: 'text', value: `❌ ${t.error}` };
        }
        return {
            type: 'text',
            value: `⏸️ **任务已暂停**

• **标题**: ${t.title}
• **ID**: \`${t.id}\`
• 使用 \`/todo resume ${t.id}\` 恢复`
        };
    }
    // 恢复任务
    if (first === 'resume') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo resume <任务ID>\``
            };
        }
        const t = await resumeTask(sid, id);
        if (!t) {
            return {
                type: 'text',
                value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。`
            };
        }
        if (t.error) {
            return { type: 'text', value: `❌ ${t.error}` };
        }
        return {
            type: 'text',
            value: `▶️ **任务已恢复**

• **标题**: ${t.title}
• **ID**: \`${t.id}\``
        };
    }
    // 取消任务
    if (first === 'cancel') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo cancel <任务ID>\``
            };
        }
        const t = await cancelTask(sid, id);
        if (!t) {
            return {
                type: 'text',
                value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。`
            };
        }
        if (t.error) {
            return { type: 'text', value: `❌ ${t.error}` };
        }
        return {
            type: 'text',
            value: `❌ **任务已取消**

• **标题**: ${t.title}
• **ID**: \`${t.id}\``
        };
    }
    // 开始任务（用于后台自动执行）
    if (first === 'start') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo start <任务ID>\``
            };
        }
        const t = await startTaskExecution(sid, id);
        if (!t) {
            return {
                type: 'text',
                value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。`
            };
        }
        return {
            type: 'text',
            value: `🚧 **任务开始执行**

• **标题**: ${t.title}
• **ID**: \`${t.id}\`
• 执行状态: ${t.executionStatus || 'planning'}`
        };
    }
    // 添加子任务
    if (first === 'subtask' || first === 'sub') {
        const parentId = rawWords[1];
        const subTitle = rawWords.slice(2).join(' ');
        if (!parentId || !subTitle) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo subtask <父任务ID> <子任务标题>\`

📋 **示例**: \`/todo subtask task_1234567890 "前端页面"\``
            };
        }
        const child = await addSubTask(sid, parentId, { title: subTitle });
        if (!child) {
            return {
                type: 'text',
                value: `❌ **父任务未找到**

找不到 ID 为 \`${parentId}\` 的任务。`
            };
        }
        return {
            type: 'text',
            value: `➕ **子任务已创建**

• 标题: ${child.title}
• ID: \`${child.id}\`
• 父任务: \`${parentId}\``
        };
    }
    // 任务详情
    if (first === 'info' || first === 'status') {
        const id = rawWords[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo info <任务ID>\``
            };
        }
        const tasks = await listTasks(sid);
        const t = tasks.find((x) => x.id === id);
        if (!t) {
            return {
                type: 'text',
                value: `❌ **任务未找到**

找不到 ID 为 \`${id}\` 的任务。`
            };
        }
        const createdAt = new Date(t.createdAt).toLocaleString('zh-CN');
        const updatedAt = new Date(t.updatedAt).toLocaleString('zh-CN');
        let detail = `📋 **任务详情**
• 标题: ${t.title}
• ID: \`${t.id}\`
• 优先级: ${t.priority}
• 状态: ${t.status}
• 执行状态: ${t.executionStatus || 'not_started'}
• 创建时间: ${createdAt}
• 更新时间: ${updatedAt}`;
        if (t.description) {
            detail += `\n• 描述: ${t.description}`;
        }
        if (t.tags?.length) {
            detail += `\n• 标签: ${t.tags.map((tag) => `#${tag}`).join(', ')}`;
        }
        if (t.subTasks?.length) {
            detail += `\n\n📂 **子任务** (${t.subTasks.length} 个)`;
            for (const st of t.subTasks) {
                const statusIcon = st.status === 'done' ? '✅' : '⏳';
                detail += `\n  • ${statusIcon} ${st.title} (\`${st.id}\`)`;
            }
        }
        if (t.executionSteps?.length) {
            detail += `\n\n📊 **进度**: ${t.currentStep || 0}/${t.executionSteps.length}`;
        }
        if (t.executionResult) {
            detail += `\n\n📤 **结果**: ${typeof t.executionResult === 'string' ? t.executionResult : JSON.stringify(t.executionResult)}`;
        }
        return { type: 'text', value: detail };
    }
    // 清除已完成任务
    if (first === 'clear-done') {
        const n = await clearDoneTasks(sid);
        if (n > 0) {
            return {
                type: 'text',
                value: `🧹 **已清除 ${n} 个已完成任务**

💡 使用 \`/todo list\` 查看剩余任务`
            };
        }
        return {
            type: 'text',
            value: `📭 **无需清除**

没有已完成的任务需要清除。`
        };
    }
    return {
        type: 'text',
        value: HELP_TEXT
    };
};
const todo = {
    type: 'local',
    name: 'todo',
    description: '任务管理工具 - 创建/查看/完成/暂停/恢复/搜索/导出',
    aliases: ['todos', 'tasklist'],
    isEnabled: () => {
        const { getIsNonInteractiveSession } = require('../../bootstrap/state.js');
        return !getIsNonInteractiveSession();
    },
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default todo;
