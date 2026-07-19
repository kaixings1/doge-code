export const DEVELOPMENT_WORKFLOW = {
  // 1. 准备阶段
  preparation: [
    'git checkout -b feature/your-feature',
    'bun install',
  ],

  // 2. 开发阶段
  development: [
    'bun run dev           # 启动开发模式',
    '编写代码',
    'bun run lint          # 代码检查',
  ],

  // 3. 测试阶段
  testing: [
    'bun test              # 运行测试',
    'bun test --coverage   # 检查覆盖率',
  ],

  // 4. 构建阶段
  build: [
    'bun run build         # 构建可执行文件',
  ],

  // 5. 提交阶段
  commit: [
    'git add .',
    'git commit -m "feat: add new feature"',
    'git push origin feature/your-feature',
  ],

  // 6. 合并阶段
  merge: [
    '创建 Pull Request',
    '代码审查',
    '合并到 main 分支',
  ],
};