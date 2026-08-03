/**
 * engineApi.ts — QueryEngine 公共 API 层
 *
 * 为桌面端主进程提供类型安全的 QueryEngine 访问接口，
 * 避免直接访问 engine 内部属性（类型断言）。
 */

import type { BrowserWindow } from 'electron'
import type { QueryEngine } from '../engine/index.js';
import type { InternalMessage } from '../engine/messageNormalizer.js';
import type { ToolDefinition } from '../engine/requestBuilder.js';

/**
 * 引擎状态信息
 */
export interface EngineStateInfo {
  state: string;
  messageCount: number;
  messages: Array<{ role: string; content: string }>;
}

/**
 * 引擎公共 API 封装
 */
export class EngineApi {
  constructor(private engine: QueryEngine) {}

  /**
   * 获取当前引擎状态
   */
  getState(): string {
    return this.engine.getState();
  }

  /**
   * 获取对话历史（类型安全）
   */
  getMessages(): Array<{ role: string; content: string }> {
    const messages = this.engine.conversation.messages;
    return messages.map((m: InternalMessage) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));
  }

  /**
   * 获取消息数量
   */
  getMessageCount(): number {
    return this.engine.conversation.messages.length;
  }

  /**
   * 获取工具列表（类型安全）
   */
  getTools(): ToolDefinition[] {
    return this.engine.getTools();
  }

  /**
   * 获取完整状态信息
   */
  getFullState(): EngineStateInfo {
    return {
      state: this.getState(),
      messageCount: this.getMessageCount(),
      messages: this.getMessages(),
    };
  }

  /**
   * 清空对话历史
   */
  clearConversation(): void {
    this.engine.conversation.messages = [];
  }

  /**
   * 加载消息到对话历史
   */
  loadMessages(messages: InternalMessage[]): void {
    this.engine.conversation.messages = messages;
  }

  /**
   * 中断当前操作
   */
  async abort(): Promise<void> {
    await this.engine.abort();
  }

  /**
   * 设置流式输出回调（类型安全封装）
   */
  setChunkCallback(callback: (chunk: { type: string; text?: string }) => void): void {
    this.engine.responseHandler.onChunk = callback;
  }

  /**
   * 设置状态变化回调（类型安全封装）
   */
  setStateChangeCallback(callback: (state: string) => void): void {
    this.engine.stateMachine.onStateChange((evt) => {
      callback(evt.to);
    });
  }

  /**
   * 绑定窗口引用（用于 IPC 回调）
   */
  bindWindow(win: BrowserWindow | null): void {
    this._mainWindow = win;
  }

  private _mainWindow: BrowserWindow | null = null;
}

/**
 * 创建 EngineApi 实例
 */
export function createEngineApi(engine: QueryEngine): EngineApi {
  return new EngineApi(engine);
}
