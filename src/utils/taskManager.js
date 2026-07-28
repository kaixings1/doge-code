import fs from "fs/promises";
import os from "os";
import path from "path";
const TASKS_DIR = path.join(os.homedir(), ".doge", "tasks");
function taskFile(sessionId) {
    return path.join(TASKS_DIR, sessionId + ".json");
}
async function loadTasks(sessionId) {
    const fp = taskFile(sessionId);
    try {
        const raw = await fs.readFile(fp, "utf-8").catch(() => "[]");
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
async function saveTasks(sessionId, tasks) {
    await fs.mkdir(TASKS_DIR, { recursive: true });
    await fs.writeFile(taskFile(sessionId), JSON.stringify(tasks, null, 2), "utf-8");
}
export async function createTask(sessionId, input) {
    const now = new Date().toISOString();
    const task = {
        id: "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        title: input.title,
        description: input.description || "",
        status: "pending",
        priority: input.priority || "medium",
        tags: input.tags || ["auto-generated"],
        createdAt: now,
        updatedAt: now,
        dueAt: input.dueAt,
        remindedAt: null,
        // 新增执行相关字段
        executionStatus: "not_started", // not_started, planning, executing, completed, failed
        executionPlan: null, // AI生成的执行计划
        executionSteps: [], // 执行步骤列表
        currentStep: 0, // 当前执行步骤
        executionResult: null, // 执行结果
        startedAt: null, // 开始执行时间
        completedAt: null, // 完成时间
        estimatedHours: input.estimatedHours || null, // 预估工时
    };
    const tasks = await loadTasks(sessionId);
    tasks.push(task);
    await saveTasks(sessionId, tasks);
    return task;
}
export async function listTasks(sessionId, opts) {
    let tasks = await loadTasks(sessionId);
    tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (opts?.status)
        tasks = tasks.filter((t) => t.status === opts.status);
    if (opts?.priority)
        tasks = tasks.filter((t) => t.priority === opts.priority);
    return tasks;
}
export async function updateTaskStatus(sessionId, id, status) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    if (status === "done")
        task.remindedAt = task.updatedAt;
    await saveTasks(sessionId, tasks);
    return task;
}
export async function deleteTask(sessionId, id) {
    const tasks = await loadTasks(sessionId);
    const filtered = tasks.filter((t) => t.id !== id);
    if (filtered.length === tasks.length)
        return false;
    await saveTasks(sessionId, filtered);
    return true;
}
export async function clearDoneTasks(sessionId) {
    const tasks = await loadTasks(sessionId);
    const kept = tasks.filter((t) => t.status !== "done");
    const removed = tasks.length - kept.length;
    await saveTasks(sessionId, kept);
    return removed;
}
// 新增：开始执行任务
export async function startTaskExecution(sessionId, id) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    task.status = "in-progress";
    task.executionStatus = "planning";
    task.startedAt = new Date().toISOString();
    task.updatedAt = task.startedAt;
    task.currentStep = 0;
    await saveTasks(sessionId, tasks);
    return task;
}
// 新增：更新执行计划
export async function updateExecutionPlan(sessionId, id, plan) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    task.executionPlan = plan;
    task.executionStatus = "executing";
    task.updatedAt = new Date().toISOString();
    await saveTasks(sessionId, tasks);
    return task;
}
// 新增：更新执行步骤
export async function updateExecutionStep(sessionId, id, stepIndex, stepData) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    if (!task.executionSteps)
        task.executionSteps = [];
    task.executionSteps[stepIndex] = {
        ...stepData,
        completedAt: new Date().toISOString()
    };
    task.currentStep = stepIndex + 1;
    task.updatedAt = new Date().toISOString();
    await saveTasks(sessionId, tasks);
    return task;
}
// 新增：完成任务执行
export async function completeTaskExecution(sessionId, id, result) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    task.status = "done";
    task.executionStatus = "completed";
    task.executionResult = result;
    task.completedAt = new Date().toISOString();
    task.updatedAt = task.completedAt;
    await saveTasks(sessionId, tasks);
    return task;
}
// 新增：获取任务执行状态
export async function getTaskExecutionStatus(sessionId, id) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    return {
        executionStatus: task.executionStatus,
        currentStep: task.currentStep,
        totalSteps: task.executionSteps?.length || 0,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        executionPlan: task.executionPlan,
        executionResult: task.executionResult
    };
}
// ========== 任务调度与执行引擎 ==========
// 后台 agent 任务注册表：taskId -> AbortController
const runningAgents = new Map();
/**
 * 获取任务的执行状态（可读文本）
 */
export function getTaskStatusText(task) {
    const statusMap = {
        pending: '⏳ 待处理',
        'in-progress': '🚧 执行中',
        done: '✅ 已完成',
        cancelled: '❌ 已取消',
    };
    const execMap = {
        not_started: '未开始',
        planning: '制定计划中',
        executing: '执行中',
        completed: '已完成',
        failed: '❌ 失败',
        paused: '⏸️ 已暂停',
        cancelled: '已取消',
    };
    const base = statusMap[task.status] || task.status;
    const exec = execMap[task.executionStatus] || task.executionStatus;
    return task.executionStatus && task.executionStatus !== 'not_started'
        ? `${base} [${exec}]`
        : base;
}
/**
 * 暂停任务执行
 * 标记任务为暂停状态。如果任务有运行中的 agent，中止它。
 */
export async function pauseTask(sessionId, id) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    if (task.executionStatus !== 'executing' && task.executionStatus !== 'planning') {
        return { error: `任务 ${id} 当前状态为 ${task.executionStatus}，无法暂停` };
    }
    // 中止正在运行的 agent
    const controller = runningAgents.get(id);
    if (controller) {
        controller.abort();
        runningAgents.delete(id);
    }
    task.executionStatus = 'paused';
    task.updatedAt = new Date().toISOString();
    await saveTasks(sessionId, tasks);
    return task;
}
/**
 * 恢复暂停的任务执行
 */
export async function resumeTask(sessionId, id) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    if (task.executionStatus !== 'paused') {
        return { error: `任务 ${id} 当前状态为 ${task.executionStatus}，无法恢复` };
    }
    task.executionStatus = 'executing';
    task.status = 'in-progress';
    task.updatedAt = new Date().toISOString();
    await saveTasks(sessionId, tasks);
    return task;
}
/**
 * 取消任务执行
 */
export async function cancelTask(sessionId, id) {
    const tasks = await loadTasks(sessionId);
    const task = tasks.find((t) => t.id === id);
    if (!task)
        return null;
    if (task.executionStatus === 'completed' || task.executionStatus === 'cancelled') {
        return { error: `任务 ${id} 已经结束` };
    }
    // 中止正在运行的 agent
    const controller = runningAgents.get(id);
    if (controller) {
        controller.abort();
        runningAgents.delete(id);
    }
    task.status = 'cancelled';
    task.executionStatus = 'cancelled';
    task.updatedAt = new Date().toISOString();
    await saveTasks(sessionId, tasks);
    return task;
}
/**
 * 添加子任务
 */
export async function addSubTask(sessionId, parentId, input) {
    const tasks = await loadTasks(sessionId);
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent)
        return null;
    if (!parent.subTasks)
        parent.subTasks = [];
    const child = {
        id: "subtask_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        parentId,
        title: input.title,
        description: input.description || '',
        status: 'pending',
        priority: input.priority || 'medium',
        executionStatus: 'not_started',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    parent.subTasks.push(child);
    parent.updatedAt = new Date().toISOString();
    await saveTasks(sessionId, tasks);
    return child;
}
/**
 * 列出子任务
 */
export async function listSubTasks(sessionId, parentId) {
    const tasks = await loadTasks(sessionId);
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent || !parent.subTasks)
        return [];
    return parent.subTasks;
}
/**
 * 注册一个正在运行的 agent 任务（供外部调度器使用）
 */
export function registerRunningAgent(taskId, controller) {
    runningAgents.set(taskId, controller);
}
/**
 * 注销一个已完成的 agent 任务
 */
export function unregisterRunningAgent(taskId) {
    runningAgents.delete(taskId);
}
/**
 * 获取所有正在运行的 agent 任务 ID
 */
export function getRunningAgentIds() {
    return Array.from(runningAgents.keys());
}
//# sourceMappingURL=taskManager.js.map