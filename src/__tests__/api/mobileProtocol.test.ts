import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCommand,
  getCommandHistory,
  clearCommandHistory,
  defaultMobileHandlers,
} from '../../bridge/mobileProtocol.js';

describe('mobileProtocol 命令历史', () => {
  beforeEach(() => {
    clearCommandHistory();
  });

  it('recordCommand 记录并 getCommandHistory 返回', () => {
    recordCommand('execute', 'req-1', { command: 'ls' });
    const history = getCommandHistory();
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe('execute');
    expect(history[0].requestId).toBe('req-1');
    expect(history[0].params).toEqual({ command: 'ls' });
  });

  it('getHistory handler 返回历史', async () => {
    recordCommand('readFile', 'req-2', { path: '/tmp/x' });
    const result: any = await defaultMobileHandlers.getHistory({ limit: 10 }, 'req-h');
    expect(result.history).toHaveLength(1);
    expect(result.message).toBe('ok');
    expect(result.requestId).toBe('req-h');
  });

  it('getHistory limit 过滤', async () => {
    for (let i = 0; i < 5; i++) recordCommand('execute', `r${i}`);
    const result: any = await defaultMobileHandlers.getHistory({ limit: 2 }, 'h');
    expect(result.history).toHaveLength(2);
    expect(result.limit).toBe(2);
  });

  it('历史上限 100 条', () => {
    for (let i = 0; i < 150; i++) recordCommand('execute', `r${i}`);
    expect(getCommandHistory().length).toBeLessThanOrEqual(100);
  });

  it('clearCommandHistory 清空历史', () => {
    recordCommand('execute', 'r1');
    clearCommandHistory();
    expect(getCommandHistory()).toHaveLength(0);
  });

  it('sendMessage handler 可调用', async () => {
    const result: any = await defaultMobileHandlers.sendMessage({ message: 'hello' }, 'req-s');
    expect(result.status).toBe('queued');
    expect(result.message).toBe('hello');
  });
});
