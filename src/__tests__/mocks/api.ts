import { vi } from 'vitest';

export function mockAPIClient() {
  return {
    sendMessage: vi.fn((messages: any[]) => {
      const lastMessage = messages[messages.length - 1];
      return Promise.resolve(`Response to: ${lastMessage.content}`);
    }),

    streamMessage: vi.fn(async (messages: any[]) => {
      const response = `Response to: ${messages[messages.length - 1].content}`;
      return response.split('');
    }),

    healthCheck: vi.fn(() => Promise.resolve(true)),
  };
}

export function mockAnthropicAPIClient() {
  const base = mockAPIClient();
  return {
    ...base,
    messages: {
      create: vi.fn(function () {
        return Promise.resolve({
          content: [
            {
              type: 'text',
              text: 'Mock response',
            },
          ],
        });
      }),
      stream: vi.fn(function () {
        const values = [
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Mock ' } } as any,
          { type: 'content_block_delta', delta: { type: 'text_delta', text: 'response' } } as any,
        ];
        let idx = 0;
        return {
          next: function () {
            if (idx < values.length) {
              return Promise.resolve({ value: values[idx++], done: false });
            }
            return Promise.resolve({ done: true } as any);
          }
        };
      }),
    },
  };
}