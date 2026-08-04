import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SessionManager } from '../../api/SessionManager.js';
import type { InternalMessage } from '../../api/types.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sessions-test-'));
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function userMsg(text: string): InternalMessage {
  return { role: 'user', content: text };
}

function assistantMsg(text: string): InternalMessage {
  return { role: 'assistant', content: text };
}

describe('SessionManager', () => {
  describe('会话 CRUD', () => {
    it('应该创建会话并设为活动', async () => {
      const mgr = new SessionManager(dir);
      const session = await mgr.createSession();
      expect(session.id).toBeTruthy();
      expect(mgr.getActiveSession()?.id).toBe(session.id);
      expect(mgr.count()).toBe(1);
    });

    it('应该加载和删除会话', async () => {
      const mgr = new SessionManager(dir);
      const s1 = await mgr.createSession({ metadata: { title: 'A', tags: [] } });
      const s2 = await mgr.createSession({ metadata: { title: 'B', tags: [] } });
      await mgr.deleteSession(s1.id);
      expect((await mgr.loadSession(s1.id)) === null).toBe(true);
      expect((await mgr.loadSession(s2.id)) !== null).toBe(true);
      expect(mgr.count()).toBe(1);
    });

    it('应该支持消息管理', async () => {
      const mgr = new SessionManager(dir);
      const session = await mgr.createSession();
      await mgr.addMessage(session.id, userMsg('hello'));
      await mgr.addMessage(session.id, assistantMsg('hi'));
      await mgr.addMessage(session.id, userMsg('again'));
      const stats = await mgr.getSessionStats(session.id);
      expect(stats?.messageCount).toBe(3);
      expect(stats?.userMessages).toBe(2);
      expect(stats?.assistantMessages).toBe(1);
      await mgr.clearMessages(session.id);
      expect((await mgr.getSessionStats(session.id))?.messageCount).toBe(0);
    });
  });

  describe('持久化', () => {
    it('新实例应该从磁盘加载会话', async () => {
      const mgr1 = new SessionManager(dir);
      const session = await mgr1.createSession({ metadata: { title: 'Persisted', tags: ['x'] } });
      await mgr1.addMessage(session.id, userMsg('persisted message'));

      const mgr2 = new SessionManager(dir);
      expect(mgr2.count()).toBe(1);
      const loaded = await mgr2.loadSession(session.id);
      expect(loaded?.metadata.title).toBe('Persisted');
      expect(loaded?.messages).toHaveLength(1);
      expect(loaded?.messages[0].content).toBe('persisted message');
    });

    it('损坏的会话文件应该被忽略', async () => {
      const mgr1 = new SessionManager(dir);
      await mgr1.createSession();
      // 写一个损坏文件
      const { writeFileSync } = await import('fs');
      writeFileSync(join(dir, 'broken.json'), '{invalid json', 'utf-8');
      const mgr2 = new SessionManager(dir);
      expect(mgr2.count()).toBe(1);
    });
  });

  describe('搜索与统计', () => {
    it('应该按标题/标签搜索会话', async () => {
      const mgr = new SessionManager(dir);
      await mgr.createSession({ metadata: { title: 'API 测试', tags: ['api'] } });
      await mgr.createSession({ metadata: { title: '前端开发', tags: ['ui'] } });
      const byTitle = await mgr.searchSessions('api');
      expect(byTitle).toHaveLength(1);
      const byTag = await mgr.searchSessions('ui');
      expect(byTag).toHaveLength(1);
    });

    it('getHealth 应该统计状态', async () => {
      const mgr = new SessionManager(dir);
      const s1 = await mgr.createSession();
      await mgr.createSession();
      await mgr.archiveSession(s1.id);
      const health = mgr.getHealth();
      expect(health.total).toBe(2);
      expect(health.archived).toBe(1);
      expect(health.active).toBe(1);
    });
  });

  describe('标签管理', () => {
    it('应该添加/移除标签', async () => {
      const mgr = new SessionManager(dir);
      const s = await mgr.createSession();
      await mgr.addTag(s.id, 'alpha');
      await mgr.addTag(s.id, 'beta');
      await mgr.addTag(s.id, 'alpha'); // 重复添加不生效
      expect((await mgr.loadSession(s.id))?.metadata.tags).toEqual(['alpha', 'beta']);
      await mgr.removeTag(s.id, 'alpha');
      expect((await mgr.loadSession(s.id))?.metadata.tags).toEqual(['beta']);
    });

    it('getTagCloud 应该按计数排序', async () => {
      const mgr = new SessionManager(dir);
      const s1 = await mgr.createSession();
      const s2 = await mgr.createSession();
      await mgr.addTag(s1.id, 'shared');
      await mgr.addTag(s2.id, 'shared');
      await mgr.addTag(s2.id, 'solo');
      const cloud = mgr.getTagCloud();
      expect(cloud[0]).toEqual({ tag: 'shared', count: 2 });
      expect(cloud[1]).toEqual({ tag: 'solo', count: 1 });
    });

    it('getTree 应该按首个标签分组', async () => {
      const mgr = new SessionManager(dir);
      await mgr.createSession({ metadata: { title: 'a', tags: ['group1'] } });
      await mgr.createSession({ metadata: { title: 'b', tags: ['group1'] } });
      await mgr.createSession({ metadata: { title: 'c', tags: [] } });
      const tree = mgr.getTree();
      expect(tree.group1).toHaveLength(2);
      expect(tree['未分组']).toHaveLength(1);
    });
  });

  describe('清理与归档', () => {
    it('cleanupStale 应该清理过期会话', async () => {
      const mgr = new SessionManager(dir);
      const s1 = await mgr.createSession();
      // 手动把 lastActive 改为 10 天前
      const s = await mgr.loadSession(s1.id);
      if (s) {
        s.state.lastActive = new Date(Date.now() - 10 * 24 * 3600 * 1000);
        s.updatedAt = new Date(Date.now() - 10 * 24 * 3600 * 1000);
        await mgr.saveSession(s);
      }
      await mgr.createSession(); // 新的（活跃）
      const cleaned = await mgr.cleanupStale(48);
      expect(cleaned).toBe(1);
      expect(mgr.count()).toBe(1);
    });

    it('cleanupStale onlyArchived 只清理已归档', async () => {
      const mgr = new SessionManager(dir);
      const s1 = await mgr.createSession();
      const s = await mgr.loadSession(s1.id);
      if (s) {
        s.state.lastActive = new Date(Date.now() - 10 * 24 * 3600 * 1000);
        await mgr.saveSession(s);
      }
      // 未归档但过期 → 不会被清理
      const cleaned = await mgr.cleanupStale(48, true);
      expect(cleaned).toBe(0);
    });
  });

  describe('导出/导入', () => {
    it('应该导出并重新导入会话', async () => {
      const mgr1 = new SessionManager(dir);
      const s = await mgr1.createSession({ metadata: { title: 'Export', tags: ['e'] } });
      await mgr1.addMessage(s.id, userMsg('data'));
      const json = await mgr1.exportSession(s.id);
      expect(json).toBeTruthy();

      const mgr2 = new SessionManager(join(dir, 'sub'));
      const imported = await mgr2.importSession(json!);
      expect(imported.metadata.title).toBe('Export');
      expect(imported.messages).toHaveLength(1);
    });

    it('无效会话数据应该抛错', async () => {
      const mgr = new SessionManager(dir);
      let threw = false;
      try {
        await mgr.importSession('{"id":"x"}');
      } catch (e: any) {
        threw = e.message.includes('Invalid session data');
      }
      expect(threw).toBe(true);
    });
  });
});
