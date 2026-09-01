import { describe, it, expect } from 'vitest';
import { parseLoopArgs, autoSelectStrategy } from '../../commands/loop/shortcuts';
describe('parseLoopArgs --strategy auto 兼容', () => {
    it('--strategy auto 应等价于 --auto（自动选择策略）', () => {
        const r = parseLoopArgs('/loop --strategy auto "写一个 HTML Hello World"');
        expect(r.auto).toBe(true);
        // strategy 保持默认值（由 index.tsx 根据 auto 标志自动选择）
        expect(r.strategy).toBe('openhands');
    });
    it('--auto 正常设置 auto 标志', () => {
        const r = parseLoopArgs('/loop --auto "测试目标"');
        expect(r.auto).toBe(true);
        expect(r.strategy).toBe('openhands'); // 默认值
    });
    it('--strategy autogpt 正常设置策略', () => {
        const r = parseLoopArgs('/loop --strategy autogpt "探索性研究"');
        expect(r.auto).toBe(false); // 默认值
        expect(r.strategy).toBe('autogpt');
    });
    it('--strategy openhands 正常设置策略', () => {
        const r = parseLoopArgs('/loop --strategy openhands "修复 bug"');
        expect(r.auto).toBe(false); // 默认值
        expect(r.strategy).toBe('openhands');
    });
});
describe('autoSelectStrategy', () => {
    it('代码相关任务 → swe-agent', () => {
        expect(autoSelectStrategy('重构代码库中的冗余模块')).toBe('swe-agent');
    });
    it('简单任务 → openhands（默认）', () => {
        expect(autoSelectStrategy('写一个 html Hello World')).toBe('openhands');
    });
    it('探索性任务 → autogpt', () => {
        expect(autoSelectStrategy('探索新的架构方案')).toBe('autogpt');
    });
});
