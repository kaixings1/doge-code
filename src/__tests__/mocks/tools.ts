import { vi } from 'vitest';

export function mockTool(name: string) {
  return {
    name,
    description: `Mock ${name} tool`,
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Test input',
        },
      },
      required: ['input'],
    },
    execute: vi.fn((params: any) =>
      Promise.resolve({
        success: true,
        output: `Mock ${name} output: ${params.input}`,
      })
    ),
  };
}

export function mockToolRegistry() {
  return {
    register: vi.fn(),
    get: vi.fn((name: string) => mockTool(name)),
    getAll: vi.fn(() => [
      mockTool('Read'),
      mockTool('Write'),
      mockTool('Grep'),
    ]),
    execute: vi.fn((name: string, params: any) =>
      mockTool(name).execute(params)
    ),
    has: vi.fn(() => true),
    getStats: vi.fn(() => ({
      Read: { calls: 0, failures: 0 },
      Write: { calls: 0, failures: 0 },
    })),
  };
}