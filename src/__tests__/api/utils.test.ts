import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  mapWithConcurrency,
  withTimeout,
  getModelProvider,
  calculateModelCost,
  checkPermission,
  createTelemetryEvent,
  serialize,
  deserialize,
} from '../../api/utils.js';

describe('getModelProvider', () => {
  it('识别 anthropic 模型', () => {
    expect(getModelProvider('claude-opus-4-6')).toBe('anthropic');
    expect(getModelProvider('claude-sonnet-4-6')).toBe('anthropic');
    expect(getModelProvider('anthropic/claude-3')).toBe('anthropic');
  });

  it('识别 openai 兼容模型', () => {
    expect(getModelProvider('gpt-4o')).toBe('openai');
    expect(getModelProvider('deepseek-chat')).toBe('openai');
    expect(getModelProvider('qwen-max')).toBe('openai');
  });

  it('未知模型返回 custom', () => {
    expect(getModelProvider('my-local-model')).toBe('custom');
  });
});

describe('calculateModelCost', () => {
  it('计算 claude-opus-4-6 费用（$15/$75 每百万 token）', () => {
    // 1M 输入 + 1M 输出 = 15 + 75 = 90
    expect(calculateModelCost('claude-opus-4-6', 1_000_000, 1_000_000)).toBe(90);
  });

  it('计算 gpt-4o 费用（$2.5/$10 每百万 token）', () => {
    expect(calculateModelCost('gpt-4o', 1_000_000, 1_000_000)).toBe(12.5);
  });

  it('未知模型使用默认费率', () => {
    expect(calculateModelCost('unknown-model', 1_000_000, 0)).toBe(3);
  });

  it('零 token 零费用', () => {
    expect(calculateModelCost('claude-opus-4-6', 0, 0)).toBe(0);
  });
});

describe('withRetry', () => {
  it('首次成功不重试', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('ok');
    expect((fn as any).mock.calls.length).toBe(1);
  });

  it('失败后重试直到成功', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('temp');
      return 'recovered';
    });
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
  });

  it('超过重试次数抛出最后错误', async () => {
    const fn = vi.fn(async () => {
      throw new Error('always-fails');
    });
    let threw = false;
    try {
      await withRetry(fn, 2, 1);
    } catch (e: any) {
      threw = e.message === 'always-fails';
    }
    expect(threw).toBe(true);
    expect((fn as any).mock.calls.length).toBe(3); // 1 次 + 2 次重试
  });
});

describe('mapWithConcurrency', () => {
  it('并发执行并保持顺序', async () => {
    const tasks = [
      async () => 1,
      async () => 2,
      async () => 3,
    ];
    const results = await mapWithConcurrency(tasks, 2, (r, i) => r * 10 + i);
    expect(results).toEqual([10, 21, 32]);
  });

  it('并发数大于任务数时正常', async () => {
    const tasks = [async () => 'a', async () => 'b'];
    const results = await mapWithConcurrency(tasks, 5, (r) => r);
    expect(results).toEqual(['a', 'b']);
  });
});

describe('withTimeout', () => {
  it('在超时前完成', async () => {
    const result = await withTimeout(Promise.resolve('fast'), 1000);
    expect(result).toBe('fast');
  });

  it('超时抛出错误', async () => {
    const slow = new Promise(resolve => setTimeout(resolve, 500));
    let threw = false;
    try {
      await withTimeout(slow, 10, 'too slow');
    } catch (e: any) {
      threw = e.message === 'too slow';
    }
    expect(threw).toBe(true);
  });
});

describe('checkPermission', () => {
  it('拒绝危险操作', () => {
    expect(checkPermission('BashTool', 'rm -rf /')).toBe(false);
    expect(checkPermission('BashTool', 'sudo apt install x')).toBe(false);
    expect(checkPermission('BashTool', 'chmod 777 /etc')).toBe(false);
    expect(checkPermission('BashTool', 'git push --force origin')).toBe(false);
  });

  it('允许常规操作', () => {
    expect(checkPermission('BashTool', 'ls -la')).toBe(true);
    expect(checkPermission('ReadTool', 'cat file.txt')).toBe(true);
  });
});

describe('serialize/deserialize', () => {
  it('往返一致', () => {
    const data = { a: 1, b: [1, 2], c: { d: 'x' } };
    expect(deserialize(serialize(data))).toEqual(data);
  });

  it('序列化为 JSON 字符串', () => {
    expect(serialize({ x: 1 })).toBe('{"x":1}');
  });
});

describe('createTelemetryEvent', () => {
  it('创建事件带名称/属性/时间戳', () => {
    const event = createTelemetryEvent('test_event', { key: 'value' });
    expect(event.name).toBe('test_event');
    expect(event.properties).toEqual({ key: 'value' });
    expect(event.timestamp instanceof Date).toBe(true);
  });

  it('无属性时 properties 为空', () => {
    const event = createTelemetryEvent('bare_event');
    expect(event.properties).toEqual({});
  });
});
