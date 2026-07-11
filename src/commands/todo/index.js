import { getSessionId } from '../../bootstrap/state.js';
import { createTask, listTasks, updateTaskStatus, deleteTask, clearDoneTasks, addSubTask, } from '../../utils/taskManager.js';
/**
 * /todo 命令 - 快速任务管理
 * 基于 task-create 功能的简化版本，支持快速创建和查看任务
 */
const HELP_TEXT = `📋 **Todo 命令** - 快速任务管理

**用法**: /todo [list|done|delete|subtask|info|clear-done] [参数]

**命令**:
  list          - 列出所有任务（默认）
  <标题> [优先级] - 创建新任务，优先级: high/medium/low（默认: medium）
  done <ID>     - 标记任务完成
  delete <ID>   - 删除任务
  subtask <父ID> <标题> - 添加子任务
  info <ID>     - 查看任务详情
  clear-done    - 清除已完成任务

**示例**:
  /todo                    # 查看任务列表
  /todo "修复bug" high      # 创建高优先级任务
  /todo "优化性能"          # 创建中优先级任务
  /todo done task_123       # 标记任务完成

**提示**: 使用 /task-create 可获得更完整的任务管理功能`;
export const call = async (args) => {
    const s = (args ?? '').trim();
    const sid = typeof getSessionId === 'function' ? getSessionId() : 'default';
    const words = s.split(/\s+/);
    const first = (words[0] ?? '').toLowerCase();
    // 显示帮助
    if (first === 'help' || s === '') {
        const tasks = await listTasks(sid);
        const activeTasks = tasks.filter((t) => t.status !== 'done');
        return {
            type: 'text',
            value: `${HELP_TEXT}

📊 **统计**: 当前有 ${activeTasks.length} 个活跃任务${tasks.length !== activeTasks.length ? `，${tasks.length - activeTasks.length} 个已完成任务` : ''}
${activeTasks.length > 0 ? '\n\n**活跃任务**:\n' + activeTasks.slice(0, 5).map((t) => `• ${t.title} (\`${t.id}\`)`).join('\n') + (activeTasks.length > 5 ? `\n... 还有 ${activeTasks.length - 5} 个任务` : '') : ''}`
        };
    }
    // 创建任务
    if (first !== 'list' && first !== 'done' && first !== 'delete' && first !== 'subtask' && first !== 'info' && first !== 'clear-done') {
        const priority = words.find(w => ['low', 'medium', 'high', 'urgent'].includes(w)) || 'medium';
        const title = words.filter(w => !['low', 'medium', 'high', 'urgent'].includes(w)).join(' ') || '未命名任务';
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

💡 **提示**: 使用 \`/todo list\` 查看所有任务`
        };
    }
    // 列出任务
    if (first === 'list' || s === '') {
        const tasks = await listTasks(sid);
        if (!tasks.length) {
            return {
                type: 'text',
                value: `${HELP_TEXT}

📭 **暂无任务**

🚀 **快速开始**:
  /todo "任务标题"        - 创建新任务
  /todo "任务标题" high   - 创建高优先级任务`
            };
        }
        const statusIcons = {
            pending: '⏳',
            'in-progress': '🚧',
            done: '✅',
            cancelled: '❌'
        };
        const taskList = tasks.map((t) => {
            const icon = statusIcons[t.status] || '⏳';
            return `${icon} **${t.title}** (\`${t.id}\`)`;
        }).join('\n');
        return {
            type: 'text',
            value: `📋 **任务列表** (${tasks.length} 个任务)

${taskList}

💡 **提示**: 使用 \`/todo done <ID>\` 标记完成，\`/todo delete <ID>\` 删除任务`
        };
    }
    // 标记完成
    if (first === 'done') {
        const id = words[1];
        if (!id) {
            return {
                type: 'text',
                value: `❌ **参数错误**

🔧 **正确用法**: \`/todo done <任务ID>\`

📋 **示例**: \`/todo done task_1234567890\`

💡 **提示**: 使用 \`/todo list\` 查看所有任务及其 ID`
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
        const id = words[1];
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
    // 添加子任务
    if (first === 'subtask' || first === 'sub') {
        const parentId = words[1];
        const subTitle = words.slice(2).join(' ');
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
    if (first === 'info') {
        const id = words[1];
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
• 创建时间: ${createdAt}
• 更新时间: ${updatedAt}`;
        if (t.subTasks?.length) {
            detail += `\n\n📂 **子任务** (${t.subTasks.length} 个)
${t.subTasks.map((st) => `  • ${st.status === 'done' ? '✅' : '⏳'} ${st.title}`).join('\n')}`;
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
    description: '快速任务管理：创建、查看、完成、删除任务',
    aliases: ['todos'],
    isEnabled: () => {
        const { getIsNonInteractiveSession } = require('../../bootstrap/state.js');
        return !getIsNonInteractiveSession();
    },
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
export default todo;
