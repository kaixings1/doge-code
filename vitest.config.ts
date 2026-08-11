import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 全局 setup（清理宿主的 feature 开关环境变量）
    setupFiles: ['tests/setup.ts'],

    // 测试文件匹配模式
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx', 'src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx', 'src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],

    // 排除文件
    exclude: ['node_modules', 'dist', 'tests/e2e', 'src/__tests__/e2e', 'desktop/e2e/**/*'],

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

    // 并发执行（forks 避免线程间 module cache 污染导致的
    // DEFAULT_PROJECT_CONFIG ReferenceError）
    pool: 'forks',

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
      // bunfig.toml [exports] 的映射在 vitest 中不生效，这里显式将 bun:bundle
      // 指向运行时 polyfill（与 bun run 行为一致）
      'bun:bundle': '/src/utils/bun-bundle-polyfill.ts',
    },
  },
});
