import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppStore } from '../../state/store.js';
import { TestHelper } from '../utils/TestHelper.js';

describe('AppStore', () => {
  let store: AppStore;

  beforeEach(() => {
    store = new AppStore({}, false);
  });

  describe('初始化', () => {
    it('应该创建初始状态', () => {
      const state = store.getState();

      expect(state.session).toBeDefined();
      expect(state.query).toBeDefined();
      expect(state.ui).toBeDefined();
      expect(state.config).toBeDefined();
    });

    it('应该有默认值', () => {
      const state = store.getState();

      expect(state.session.id).toBeNull();
      expect(state.query.status).toBe('idle');
      expect(state.ui.theme).toBe('dark');
    });
  });

  describe('状态更新', () => {
    it('应该更新状态', () => {
      store.setState({
        query: { status: 'responding', result: null, error: null, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, toolCalls: [] },
      });

      const state = store.getState();
      expect(state.query.status).toBe('responding');
    });

    it('应该深度更新嵌套对象', () => {
      store.setState({
        ui: {
          theme: 'light',
          focus: 'input',
          layout: { width: 80, height: 24, sidebarVisible: false },
          viewport: { scrollTop: 0, scrollHeight: 0 },
        },
      });

      const state = store.getState();
      expect(state.ui.theme).toBe('light');
      expect(state.ui.layout.sidebarVisible).toBe(false);
    });

    it('应该支持函数式更新', () => {
      store.setState((prev) => ({
        query: {
          ...prev.query,
          status: 'responding',
        },
      }));

      const state = store.getState();
      expect(state.query.status).toBe('responding');
    });
  });

  describe('订阅', () => {
    it('应该通知订阅者', async () => {
      const listener = vi.fn();

      store.subscribe(listener);

      store.setState({
        query: { status: 'responding', result: null, error: null, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, toolCalls: [] },
      });

      expect(listener).toHaveBeenCalled();
    });

    it('应该支持取消订阅', () => {
      const listener = vi.fn();

      const unsubscribe = store.subscribe(listener);
      unsubscribe();

      store.setState({
        query: { status: 'responding', result: null, error: null, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, toolCalls: [] },
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('应该支持多个订阅者', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.subscribe(listener1);
      store.subscribe(listener2);

      store.setState({
        query: { status: 'responding', result: null, error: null, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, toolCalls: [] },
      });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('状态重置', () => {
    it('应该重置状态', () => {
      store.setState({
        session: { id: 'test', messages: [], metadata: { model: 'test', provider: 'test', tokenUsage: { inputTokens: 0, outputTokens: 0 }, queryCount: 0, toolCallCount: 0 }, state: { status: 'active', lastActive: null } },
      });

      store.reset();

      const state = store.getState();
      expect(state.session.id).toBeNull();
    });
  });

  describe('部分状态管理器', () => {
    it('应该更新会话状态', () => {
      store.setSessionState({
        id: 'test-session',
        messages: [],
      });

      const state = store.getState();
      expect(state.session.id).toBe('test-session');
    });

    it('应该更新查询状态', () => {
      store.setQueryState({
        status: 'responding',
      });

      const state = store.getState();
      expect(state.query.status).toBe('responding');
    });

    it('应该更新 UI 状态', () => {
      store.setUIState({
        theme: 'light',
      });

      const state = store.getState();
      expect(state.ui.theme).toBe('light');
    });

    it('应该更新配置状态', () => {
      store.setConfigState({
        model: 'gpt-4',
      });

      const state = store.getState();
      expect(state.config.model).toBe('gpt-4');
    });
  });
});