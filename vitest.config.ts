import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 测试文件匹配模式
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],

    // 排除文件
    exclude: ['node_modules', 'dist', 'tests/e2e'],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.d.ts',
        'src/entrypoints/**',
        'src/bootstrap*.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },

    // 测试环境
    environment: 'node',

    // 超时时间
    testTimeout: 10000,
    hookTimeout: 10000,

    // 并发执行
    pool: 'threads',

    // 报告器
    reporter: ['verbose', 'json'],
    outputFile: {
      json: './coverage/test-results.json',
    },
  },

  // 路径别名（与 tsconfig 保持一致）
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
