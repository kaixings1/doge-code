import { createTask } from '../../utils/taskManager.js';
import { getSessionId } from '../../bootstrap/state.js';
import { enqueue } from '../../utils/messageQueueManager.js';
export const call = async (args, context) => {
    if (!args || args.trim() === '') {
        return {
            type: 'text',
            value: `📝 **快速任务** (/task)

创建任务并自动让 AI 执行（无需守在终端前）。

📖 **用法**
┌────────────────────────────────────────────────────────┐
│ /task <任务描述>        创建任务并自动开始执行           │
│ /task-create list       查看/管理所有任务               │
│ /task-create done <ID>  标记任务完成                    │
│ /task-create pause <ID> 暂停执行中的任务                │
└────────────────────────────────────────────────────────┘

💡 **示例**
/task "编写一个记事本软件"
/task "完成项目文档"
/task "研究新的技术方案"

> 输入 /task-create 查看完整命令列表`,
        };
    }
    const taskId = 'simple_' + Date.now();
    const now = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    // 持久化任务到 taskManager
    try {
        const sessionId = getSessionId();
        await createTask(sessionId, {
            title: args,
            description: args,
            priority: 'medium',
            tags: ['/task'],
        });
    }
    catch (_e) {
        // taskManager 持久化失败不阻塞主流程
    }
    // 将任务作为 prompt 加入命令队列，主循环 drainCommandQueue 会取出并让 AI 回复
    enqueue({
        value: `请执行以下任务：${args}\n\n要求：\n1. 直接开始工作，完成后给出总结\n2. 不需要问我确认，直接做\n3. 完成后输出结果`,
        mode: 'prompt',
        priority: 'next',
    });
    return {
        type: 'text',
        value: `## 任务已创建 ✓ **任务名称**: ${args}
**任务ID**: ${taskId}
**状态**: 待处理
**创建时间**: ${now}

> AI 已自动开始执行此任务，请等待结果...`,
    };
};
//# sourceMappingURL=task.js.map