---
name: setup-pre-commit
description: "设置预提交钩子 — 配置 Husky、lint-staged 和 Prettier 的预提交钩子"
---

# 设置预提交钩子

## 设置内容

- **Husky** 预提交钩子
- **lint-staged** 在所有暂存文件上运行 Prettier
- **Prettier** 配置（如果缺失）
- 预提交钩子中的 **typecheck** 和 **test** 脚本

## 步骤

### 1. 检测包管理器

检查 `package-lock.json` (npm)、`pnpm-lock.yaml` (pnpm)、`yarn.lock` (yarn)、`bun.lockb` (bun)。使用存在的任何一个。如果不明确，默认使用 npm。

### 2. 安装依赖

作为开发依赖安装：

```
husky lint-staged prettier
```

### 3. 初始化 Husky

```bash
npx husky init
```

这会创建 `.husky/` 目录并将 `prepare: "husky"` 添加到 package.json。

### 4. 创建 `.husky/pre-commit`

写入此文件（Husky v9+ 不需要 shebang）：

```
npx lint-staged
npm run typecheck
npm run test
```

**适配**：将 `npm` 替换为检测到的包管理器。如果仓库的 package.json 中没有 `typecheck` 或 `test` 脚本，则省略这些行并告知用户。

### 5. 创建 `.lintstagedrc`

```json
{
  "*": "prettier --ignore-unknown --write"
}
```

### 6. 创建 `.prettierrc`（如果缺失）

仅在没有 Prettier 配置时创建。使用这些默认值：

```json
{
  "useTabs": false,
  "tabWidth": 2,
  "printWidth": 80,
  "singleQuote": false,
  "trailingComma": "es5",
  "semi": true,
  "arrowParens": "always"
}
```

### 7. 验证

- [ ] `.husky/pre-commit` 存在且可执行
- [ ] `.lintstagedrc` 存在
- [ ] package.json 中的 `prepare` 脚本是 `"husky"`
- [ ] `prettier` 配置存在
- [ ] 运行 `npx lint-staged` 以验证其工作

### 8. 提交

暂存所有更改/创建的文件并使用以下消息提交：`Add pre-commit hooks (husky + lint-staged + prettier)`

这将运行新的预提交钩子——一个很好的冒烟测试，确保一切正常。

## 详细说明

### Husky 配置
Husky 是一个 Git 钩子工具，允许你在 Git 事件（如提交、推送）上运行脚本。版本 9+ 简化了配置，不再需要 shebang。

### lint-staged 配置
lint-staged 允许你对 Git 暂存区中的文件运行 linter。它只检查即将提交的文件，提高了效率。

### Prettier 配置
Prettier 是一个代码格式化工具，确保代码风格一致。`--ignore-unknown` 标志跳过 Prettier 无法解析的文件（如图像等）。

## 高级配置

### 自定义 lint-staged 配置
你可以根据需要自定义 `.lintstagedrc`：

```json
{
  "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md}": ["prettier --write"],
  "*.{css,scss}": ["stylelint --fix", "prettier --write"]
}
```

### 多包管理器支持
根据检测到的包管理器调整命令：

```bash
# npm
npm run typecheck
npm run test

# yarn
yarn typecheck
yarn test

# pnpm
pnpm typecheck
pnpm test

# bun
bun run typecheck
bun run test
```

### 条件执行
你可以根据文件类型或项目状态有条件地运行钩子：

```bash
# 仅在 TypeScript 文件更改时运行类型检查
if git diff --cached --name-only | grep -q '\.ts$\|\.tsx$'; then
  npm run typecheck
fi
```

## 故障排除

### 常见问题

1. **钩子不执行**：确保 `.husky/pre-commit` 文件可执行
   ```bash
   chmod +x .husky/pre-commit
   ```

2. **lint-staged 不工作**：检查配置文件路径和格式

3. **Prettier 格式化失败**：验证文件扩展名和 Prettier 配置

### 调试技巧

- 使用 `--no-verify` 标志跳过钩子进行调试
- 添加 `set -x` 到钩子文件以启用调试输出
- 检查 Git 版本和 Husky 兼容性

## 最佳实践

### 性能优化
- 仅对更改的文件运行 linter
- 使用缓存避免重复工作
- 并行运行独立任务

### 团队协作
- 将配置纳入版本控制
- 文档化钩子目的
- 提供绕过机制（紧急情况）

### 维护
- 定期更新依赖
- 监控钩子执行时间
- 收集团队反馈

## 扩展功能

### 提交消息验证
添加提交消息格式检查：

```bash
# .husky/commit-msg
npx --no -- commitlint --edit "$1"
```

### 自动修复
配置自动修复和重新暂存：

```json
{
  "*.js": ["eslint --fix", "git add"]
}
```

### 集成测试
在预推送钩子中运行完整测试套件：

```bash
# .husky/pre-push
npm run test:ci
```

## 注意事项

- Husky v9+ 在钩子文件中不需要 shebang
- `prettier --ignore-unknown` 跳过 Prettier 无法解析的文件（图像等）
- 预提交先运行 lint-staged（快速，仅限暂存文件），然后运行完整的类型检查和测试

## 替代方案

### 其他工具
- **lefthook**：更快的 Git 钩子管理器
- **simple-git-hooks**：轻量级替代方案
- **pre-commit**：Python 生态系统的流行选择

### 云解决方案
- GitHub Actions 预提交检查
- GitLab CI 管道检查
- 其他 CI/CD 集成
