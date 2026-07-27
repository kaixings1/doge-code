import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore } from '../../state/store.js';
import type { AppState } from '../../state/AppStateStore.js';

describe('AppStore', () => {
  let store: ReturnType<typeof createStore<AppState>>;

  beforeEach(() => {
    store = createStore(
      {
        settings: { theme: 'dark' },
        tasks: {},
        agentNameRegistry: new Map(),
        verbose: false,
        mainLoopModel: null,
        api: null,
        auth: null,
        q: { messages: [], status: 'idle', result: null, error: null },
        ui: { theme: 'dark' },
        config: { model: null },
      } as AppState
    );
  });

  describe('初始化', () => {
    it('应该创建初始状态', () => {
      const state = store.getState();
      expect(state).toBeDefined();
      expect(state.q.status).toBe('idle');
    });

    it('应该使用默认值', () => {
      const state = store.getState();
      expect(state.ui.theme).toBe('dark');
    });
  });

  describe('状态更新', () => {
    it('应该更新状态', () => {
      store.setState(prev => ({ ...prev, verbose: true }));
      expect(store.getState().verbose).toBe(true);
    });

    it('应该支持函数式更新', () => {
      store.setState(prev => ({
        ...prev,
        q: { ...prev.q, status: 'responding' },
      }));
      expect(store.getState().q.status).toBe('responding');
    });
  });

  describe('订阅', () => {
    it('应该通知订阅者', () => {
      const listener = vi.fn();
      store.subscribe(listener);
      store.setState(prev => ({ ...prev, verbose: true }));
      expect(listener).toHaveBeenCalled();
    });

    it('应该支持取消订阅', () => {
      const listener = vi.fn();
      const unsub = store.subscribe(listener);
      unsub();
      store.setState(prev => ({ ...prev, verbose: false }));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
