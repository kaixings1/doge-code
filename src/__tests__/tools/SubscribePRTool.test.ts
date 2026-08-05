import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SubscribePRTool } from '../../tools/SubscribePRTool/SubscribePRTool.js';

const PORT = 48123;
const tool = new SubscribePRTool();

function extractText(result: any): string {
  return result?.content?.[0]?.text ?? '';
}

async function postWebhook(event: string, payload: any, port = PORT): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': event },
    body: JSON.stringify(payload),
  });
}

describe('SubscribePRTool Webhook (D2 实时推送)', () => {
  beforeAll(async () => {
    const res = await tool.execute({ action: 'webhook-start', port: PORT } as any);
    expect(extractText(res)).toContain('listening');
  });

  afterAll(async () => {
    const res = await tool.execute({ action: 'webhook-stop' } as any);
    expect(extractText(res)).toContain('stopped');
  });

  it('启动后状态为 running', async () => {
    const res = await tool.execute({ action: 'webhook-status' } as any);
    expect(extractText(res)).toContain('running');
    expect(extractText(res)).toContain(String(PORT));
  });

  it('接收 pull_request 事件并记录（无订阅时不写文件）', async () => {
    const resp = await postWebhook('pull_request', {
      action: 'opened',
      number: 42,
      pull_request: { state: 'open', title: 'Fix bug', merged: false },
      repository: { full_name: 'owner/repo' },
    });
    expect(resp.ok).toBe(true);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.handled).toBe(false); // 未订阅 → 不更新订阅文件，但事件仍记录

    const res = await tool.execute({ action: 'webhook-events' } as any);
    const text = extractText(res);
    expect(text).toContain('#42');
    expect(text).toContain('owner/repo');
    expect(text).toContain('opened');
  });

  it('merged PR 状态显示为 merged', async () => {
    await postWebhook('pull_request', {
      action: 'closed',
      number: 43,
      pull_request: { state: 'closed', title: 'Merged feature', merged: true },
      repository: { full_name: 'owner/repo' },
    });
    const res = await tool.execute({ action: 'webhook-events' } as any);
    expect(extractText(res)).toContain('merged');
  });

  it('忽略非 pull_request 事件', async () => {
    await postWebhook('push', { ref: 'refs/heads/main', repository: { full_name: 'owner/repo' } });
    const res = await tool.execute({ action: 'webhook-events' } as any);
    const text = extractText(res);
    // 只应有 2 条 pull_request 事件（#42 和 #43）
    expect(text.match(/#\d+/g)).toHaveLength(2);
  });

  it('webhook-events 支持 limit 参数', async () => {
    const res = await tool.execute({ action: 'webhook-events', limit: 1 } as any);
    const text = extractText(res);
    expect(text.match(/#\d+/g)).toHaveLength(1);
  });

  it('非法 JSON 返回 400', async () => {
    const resp = await fetch(`http://127.0.0.1:${PORT}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'pull_request' },
      body: 'not-json',
    });
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.ok).toBe(false);
  });

  it('新实例未启动时状态为 stopped', async () => {
    const tool2 = new SubscribePRTool();
    const res = await tool2.execute({ action: 'webhook-status' } as any);
    expect(extractText(res)).toContain('stopped');
  });

  it('重复启动返回 already running', async () => {
    const res = await tool.execute({ action: 'webhook-start', port: PORT } as any);
    expect(extractText(res)).toContain('already running');
  });

  it('未启动的实例 stop 返回 not running', async () => {
    const tool2 = new SubscribePRTool();
    const res = await tool2.execute({ action: 'webhook-stop' } as any);
    expect(extractText(res)).toContain('not running');
  });
});
