/**
 * __tests__/integration/flow-hook.test.ts — Flow 与 Hook 系统集成测试
 *
 * 验证 Phase 3（Flow 系统）和 Phase 4（Hook 系统）的协同工作。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanningFlow, getAllPlans, clearPlans, type PlanStep } from '../../engine/flow/planning.js';
import { HookManager, getHookManager, resetHookManager, type HookEvent, type HookResult } from '../../engine/hooks/hookManager.js';
import { createSecretDetectionHook, createToolAuditLogHook, createSessionStartHook } from '../../engine/hooks/builtInHooks.js';

describe('集成: Flow + Hook 系统', () => {
  beforeEach(() => {
    clearPlans();
    resetHookManager();
  });

  // -------------------------------------------------------------------------
  // Flow 系统集成
  // -------------------------------------------------------------------------

  describe('PlanningFlow', () => {
    it('应创建计划并按步骤执行', async () => {
      const flow = new PlanningFlow({
        agents: [
          { key: 'executor', description: '通用执行器' },
        ],
        executorKeys: ['executor'],
        planTitle: '测试计划',
      });

      const executedSteps: string[] = [];
      const result = await flow.execute('测试任务', async (step, agentKey) => {
        executedSteps.push(step.text);
        return `完成: ${step.text}`;
      });

      expect(result.success).toBe(true);
      expect(result.stepsCompleted).toBeGreaterThanOrEqual(1);
      expect(executedSteps.length).toBeGreaterThanOrEqual(1);
    });

    it('应支持自定义步骤', async () => {
      const flow = new PlanningFlow({
        agents: [
          { key: 'coder', description: '编码' },
          { key: 'reviewer', description: '审查' },
        ],
        executorKeys: ['coder'],
      });

      flow.createSteps([
        '分析需求',
        '编写代码',
        '运行测试',
      ]);

      const agentKeys: string[] = [];
      const result = await flow.execute('', async (step, agentKey) => {
        agentKeys.push(agentKey ?? 'default');
        return 'done';
      });

      expect(result.success).toBe(true);
      expect(agentKeys.length).toBe(3);
    });

    it('应返回计划文本摘要', async () => {
      const flow = new PlanningFlow({
        agents: [{ key: 'exec', description: '执行器' }],
      });

      await flow.execute('构建项目', async () => 'done');

      const text = flow.getPlanText();
      expect(text).toContain('构建项目');
    });

    it('应标记步骤为完成/阻塞', async () => {
      const flow = new PlanningFlow({
        agents: [{ key: 'exec', description: '执行器' }],
      });

      flow.createSteps(['步骤1', '步骤2']);

      await flow.execute('', async (step) => {
        return 'done';
      });

      // execute 将所有步骤设为 completed，之后手动标记阻塞
      flow.markStepBlocked(1);
      const plan = getAllPlans()[0];
      expect(plan.steps[1].status).toBe('blocked');
    });
  });

  // -------------------------------------------------------------------------
  // Hook 系统集成
  // -------------------------------------------------------------------------

  describe('HookManager', () => {
    it('应注册并触发 PreToolUse 钩子', async () => {
      const manager = getHookManager();
      const mockHandler = vi.fn(async (): Promise<HookResult> => ({ allow: true }));
      manager.register({
        eventType: 'PreToolUse',
        handler: mockHandler,
        toolNameMatcher: 'Bash',
      });

      const result = await manager.trigger({
        type: 'PreToolUse',
        toolName: 'Bash',
        input: { command: 'ls' },
      });

      expect(mockHandler).toHaveBeenCalledOnce();
      expect(result.allow).toBe(true);
    });

    it('应阻止被 deny 的工具执行', async () => {
      const manager = getHookManager();
      manager.register({
        eventType: 'PreToolUse',
        handler: async (): Promise<HookResult> => ({
          allow: false,
          reason: '禁止使用 Bash',
        }),
        toolNameMatcher: 'Bash',
      });

      const result = await manager.trigger({
        type: 'PreToolUse',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
      });

      expect(result.allow).toBe(false);
      expect(result.reason).toBe('禁止使用 Bash');
    });

    it('应支持通配符匹配所有工具', async () => {
      const manager = getHookManager();
      const callCount = { count: 0 };
      manager.register({
        eventType: 'PostToolUse',
        handler: async (): Promise<HookResult> => {
          callCount.count++;
          return { allow: true };
        },
        toolNameMatcher: '*',
      });

      await manager.trigger({
        type: 'PostToolUse',
        toolName: 'Read',
        success: true,
        output: 'file content',
      });
      await manager.trigger({
        type: 'PostToolUse',
        toolName: 'Write',
        success: true,
        output: 'written',
      });

      expect(callCount.count).toBe(2);
    });

    it('应支持注销钩子', async () => {
      const manager = getHookManager();
      const handler = vi.fn(async (): Promise<HookResult> => ({ allow: true }));
      const unregister = manager.register({
        eventType: 'PreToolUse',
        handler,
        toolNameMatcher: 'Edit',
      });

      await manager.trigger({ type: 'PreToolUse', toolName: 'Edit', input: {} });
      expect(handler).toHaveBeenCalledTimes(1);

      unregister();
      await manager.trigger({ type: 'PreToolUse', toolName: 'Edit', input: {} });
      expect(handler).toHaveBeenCalledTimes(1); // 不再增加
    });

    it('钩子异常不应影响主流程', async () => {
      const manager = getHookManager();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      manager.register({
        eventType: 'PreToolUse',
        handler: async (): Promise<HookResult> => {
          throw new Error('Hook 崩溃');
        },
        toolNameMatcher: '*',
      });

      // 不应抛异常
      const result = await manager.trigger({
        type: 'PreToolUse',
        toolName: 'Bash',
        input: {},
      });
      errorSpy.mockRestore();
      expect(result.allow).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 内置 Hook 集成
  // -------------------------------------------------------------------------

  describe('内置 Hook 处理器', () => {
    it('SecretDetection 应检测密钥泄漏', async () => {
      const hook = createSecretDetectionHook();

      // 使用足够长的 key 以匹配 sk-[a-zA-Z0-9]{48,} 模式（48+ chars after sk-）
      const longKey = 'sk-' + 'a'.repeat(50);
      const blocked = await hook({
        type: 'PreToolUse',
        toolName: 'Write',
        input: { file_path: 'config.json', content: `api_key=${longKey}` },
      });

      expect(blocked.allow).toBe(false);
      expect(blocked.reason).toContain('密钥');
    });

    it('SecretDetection 应放行正常内容', async () => {
      const hook = createSecretDetectionHook();

      const result = await hook({
        type: 'PreToolUse',
        toolName: 'Write',
        input: { file_path: 'hello.ts', content: 'console.log("hello")' },
      });

      expect(result.allow).toBe(true);
    });

    it('AuditLog 应记录工具执行', async () => {
      const hook = createToolAuditLogHook();
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await hook({
        type: 'PostToolUse',
        toolName: 'Read',
        success: true,
        output: 'file content',
      });

      expect(logSpy).toHaveBeenCalledOnce();
      const callArg = logSpy.mock.calls[0]?.[0];
      expect(typeof callArg).toBe('string');
      expect(callArg).toContain('[Hook:Audit]');
      expect(callArg).toContain('Read -> OK');
      logSpy.mockRestore();
    });

    it('SessionStart 应执行初始化', async () => {
      const initFn = vi.fn();
      const hook = createSessionStartHook(initFn);

      const result = await hook({ type: 'SessionStart' });

      expect(initFn).toHaveBeenCalledOnce();
      expect(result.allow).toBe(true);
    });

    it('SessionStart 异常应被捕获', async () => {
      const hook = createSessionStartHook(() => {
        throw new Error('init failed');
      });

      const result = await hook({ type: 'SessionStart' });
      expect(result.allow).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Flow + Hook 协同
  // -------------------------------------------------------------------------

  describe('Flow + Hook 协同', () => {
    it('Flow 执行期间可同时触发 Hook 事件', async () => {
      const manager = getHookManager();
      const hookCalls: string[] = [];
      manager.register({
        eventType: 'PostToolUse',
        handler: async (event): Promise<HookResult> => {
          hookCalls.push(event.toolName ?? 'unknown');
          return { allow: true };
        },
        toolNameMatcher: '*',
      });

      // 模拟 Flow 执行过程中触发 Hook
      await manager.trigger({
        type: 'PostToolUse',
        toolName: 'Bash',
        success: true,
      });
      await manager.trigger({
        type: 'PostToolUse',
        toolName: 'Read',
        success: true,
      });

      expect(hookCalls).toEqual(['Bash', 'Read']);
    });

    it('Hook 可在 Flow 步骤间传递上下文', async () => {
      const manager = getHookManager();
      const context: Record<string, unknown> = {};
      manager.register({
        eventType: 'PreToolUse',
        handler: async (event): Promise<HookResult> => {
          if (event.toolName === 'Write' && event.input) {
            context['lastWritePath'] = (event.input as Record<string, unknown>).file_path;
          }
          return { allow: true };
        },
        toolNameMatcher: '*',
      });

      await manager.trigger({
        type: 'PreToolUse',
        toolName: 'Write',
        input: { file_path: '/tmp/test.ts' },
      });

      expect(context['lastWritePath']).toBe('/tmp/test.ts');
    });
  });
});
