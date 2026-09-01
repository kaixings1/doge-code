import { describe, it, expect, beforeEach } from 'vitest';
import { decomposeToDag, normalizeSubtasks, topoSort, getReadyTasks, hasCycle, formatPlan, _resetPlannerSeq, } from '../../commands/loop/planner.js';
beforeEach(() => {
    _resetPlannerSeq();
});
describe('decomposeToDag', () => {
    it('简单目标分解为 3 阶段链（understand→implement→verify）', () => {
        const tasks = decomposeToDag({ description: '写个 hello world' });
        expect(tasks.length).toBe(3);
        // 依赖链：verify 依赖 implement 依赖 understand
        expect((tasks[2].dependencies ?? []).includes(tasks[1].id)).toBe(true);
        expect((tasks[1].dependencies ?? []).includes(tasks[0].id)).toBe(true);
        expect(tasks[0].dependencies).toEqual([]);
        // verify 任务带验证条件
        const verify = tasks.find(t => t.verify);
        expect(verify).toBeDefined();
    });
    it('复杂目标（含测试/文档）分解为完整闭环', () => {
        const tasks = decomposeToDag({ description: '创建 Web 应用并编写测试和文档' });
        expect(tasks.length).toBeGreaterThanOrEqual(5);
        // 有 verify 阶段
        expect(tasks.some(t => t.verify)).toBe(true);
        // 所有任务 id 唯一
        const ids = new Set(tasks.map(t => t.id));
        expect(ids.size).toBe(tasks.length);
        // 无环
        expect(hasCycle(tasks)).toBe(false);
    });
    it('显式提供 subTasks 时规范化（不重复分解）', () => {
        const sub = [
            { id: 'a', description: '任务 A', status: 'pending' },
            { id: 'b', description: '任务 B', status: 'pending', dependencies: ['a'] },
        ];
        const tasks = decomposeToDag({ description: '目标', subTasks: sub });
        expect(tasks).toHaveLength(2);
        expect(tasks[0].id).toBe('a');
        expect(tasks[1].dependencies).toEqual(['a']);
    });
});
describe('normalizeSubtasks', () => {
    it('补齐缺失 id 并剔除不存在的依赖', () => {
        const tasks = normalizeSubtasks([
            { id: 'x', description: 'X', status: 'pending', dependencies: ['ghost'] },
            { id: '', description: 'Y', status: 'pending' },
        ]);
        expect(tasks[0].dependencies).toEqual([]);
        expect(tasks[1].id).toBeTruthy();
    });
    it('断开依赖环', () => {
        const tasks = normalizeSubtasks([
            { id: 'a', description: 'A', status: 'pending', dependencies: ['b'] },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['a'] },
        ]);
        expect(hasCycle(tasks)).toBe(false);
    });
});
describe('topoSort', () => {
    it('正常 DAG 返回拓扑顺序', () => {
        const tasks = [
            { id: 'c', description: 'C', status: 'pending', dependencies: ['a'] },
            { id: 'a', description: 'A', status: 'pending' },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['a'] },
        ];
        const order = topoSort(tasks);
        expect(order[0]).toBe('a');
        expect(order.indexOf('b')).toBeGreaterThan(order.indexOf('a'));
        expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('a'));
    });
    it('有环时返回 null', () => {
        const tasks = [
            { id: 'a', description: 'A', status: 'pending', dependencies: ['b'] },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['a'] },
        ];
        expect(topoSort(tasks)).toBeNull();
    });
});
describe('getReadyTasks', () => {
    it('只返回依赖已满足的 pending 任务', () => {
        const tasks = [
            { id: 'a', description: 'A', status: 'pending' },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['a'] },
            { id: 'c', description: 'C', status: 'completed' },
            { id: 'd', description: 'D', status: 'failed', dependencies: ['a'] },
        ];
        const ready = getReadyTasks(tasks, 10);
        expect(ready.map(t => t.id).sort()).toEqual(['a']);
    });
    it('按优先级降序排列并截取 limit', () => {
        const tasks = [
            { id: 'low', description: '低', status: 'pending', priority: 1 },
            { id: 'high', description: '高', status: 'pending', priority: 10 },
            { id: 'mid', description: '中', status: 'pending', priority: 5 },
        ];
        const ready = getReadyTasks(tasks, 2);
        expect(ready.map(t => t.id)).toEqual(['high', 'mid']);
    });
    it('completed 的依赖使下游任务可执行', () => {
        const tasks = [
            { id: 'a', description: 'A', status: 'completed' },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['a'] },
        ];
        expect(getReadyTasks(tasks, 10).map(t => t.id)).toEqual(['b']);
    });
});
describe('hasCycle', () => {
    it('无环返回 false', () => {
        const tasks = [
            { id: 'a', description: 'A', status: 'pending' },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['a'] },
        ];
        expect(hasCycle(tasks)).toBe(false);
    });
    it('直接环返回 true', () => {
        const tasks = [
            { id: 'a', description: 'A', status: 'pending', dependencies: ['a'] },
        ];
        expect(hasCycle(tasks)).toBe(true);
    });
    it('间接环返回 true', () => {
        const tasks = [
            { id: 'a', description: 'A', status: 'pending', dependencies: ['b'] },
            { id: 'b', description: 'B', status: 'pending', dependencies: ['c'] },
            { id: 'c', description: 'C', status: 'pending', dependencies: ['a'] },
        ];
        expect(hasCycle(tasks)).toBe(true);
    });
});
describe('formatPlan', () => {
    it('输出包含任务描述与依赖标注', () => {
        const tasks = [
            { id: 'a', description: '理解需求', status: 'pending' },
            { id: 'b', description: '实现功能', status: 'pending', dependencies: ['a'], priority: 10 },
        ];
        const plan = formatPlan(tasks);
        expect(plan).toContain('理解需求');
        expect(plan).toContain('实现功能');
        expect(plan).toContain('依赖');
    });
});
