import { vi } from 'vitest';

export class TestHelper {
  /**
   * 创建模拟会话
   */
  static createMockSession(overrides: Partial<any> = {}) {
    return {
      id: 'test-session-1',
      messages: [],
      metadata: {
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        tokenUsage: { inputTokens: 0, outputTokens: 0 },
        queryCount: 0,
        toolCallCount: 0,
      },
      state: {
        status: 'active',
        lastActive: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  /**
   * 创建模拟消息
   */
  static createMockMessage(overrides: Partial<any> = {}) {
    return {
      id: 'msg-1',
      role: 'user',
      content: [{ type: 'text', text: 'Hello!' }],
      createdAt: new Date(),
      ...overrides,
    };
  }

  /**
   * 创建模拟工具调用
   */
  static createMockToolCall(overrides: Partial<any> = {}) {
    return {
      id: 'tool-call-1',
      name: 'Read',
      params: { file_path: 'test.txt' },
      result: {
        toolUseId: 'tool-call-1',
        success: true,
        output: 'File content',
      },
      ...overrides,
    };
  }

  /**
   * 等待异步条件
   */
  static async waitFor(
    condition: () => boolean,
    options: { timeout?: number; interval?: number } = {}
  ): Promise<void> {
    const { timeout = 5000, interval = 100 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error('Timeout waiting for condition');
  }

  /**
   * 创建延迟的 Promise
   */
  static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 捕获异步错误
   */
  static async captureError<T>(
    fn: () => Promise<T>
  ): Promise<Error | null> {
    try {
      await fn();
      return null;
    } catch (error) {
      return error as Error;
    }
  }

  /**
   * Mock 文件系统
   */
  static mockFileSystem(files: Record<string, string>) {
    const mockFs = {
      readFile: vi.fn((path: string) => {
        return Promise.resolve(files[path] || null);
      }),
      writeFile: vi.fn((path: string, content: string) => {
        files[path] = content;
        return Promise.resolve();
      }),
      exists: vi.fn((path: string) => {
        return Promise.resolve(path in files);
      }),
      delete: vi.fn((path: string) => {
        delete files[path];
        return Promise.resolve();
      }),
    };

    return mockFs;
  }

  /**
   * 清理所有 Mock
   */
  static clearAllMocks(): void {
    vi.clearAllMocks();
  }
}