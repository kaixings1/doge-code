---
name: setup-pre-commit
description: 在当前仓库中配置 Husky pre-commit 钩子，包括 lint-staged（Prettier）、类型检查和测试。当用户想要添加 pre-commit 钩子、设置 Husky、配置 lint-staged，或在提交时添加格式化/类型检查/测试时使用。
---

# 配置 Pre-Commit 钩子

## 本技能将配置的内容

- **Husky** pre-commit 钩子
- **lint-staged**，对所有暂存文件运行 Prettier
- **Prettier** 配置（如果缺失）
- pre-commit 钩子中的 **typecheck** 和 **test** 脚本

## 步骤

### 1. 检测包管理器

检查是否存在 `package-lock.json`（npm）、`pnpm-lock.yaml`（pnpm）、`yarn.lock`（yarn）、`bun.lockb`（bun）。使用检测到的包管理器。如不明确，默认使用 npm。

### 2. 安装依赖

安装为 devDependencies：

```
husky lint-staged prettier
```

### 3. 初始化 Husky

```bash
npx husky init
```

这会创建 `.husky/` 目录，并在 package.json 中添加 `prepare: "husky"`。

### 4. 创建 `.husky/pre-commit`

写入以下文件（Husky v9+ 无需 shebang）：

```
npx lint-staged
npm run typecheck
npm run test
```

**调整**：将 `npm` 替换为检测到的包管理器。如果 package.json 中没有 `typecheck` 或 `test` 脚本，则省略相应行并告知用户。

### 5. 创建 `.lintstagedrc`

```json
{
  "*": "prettier --ignore-unknown --write"
}
```

### 6. 创建 `.prettierrc`（如果缺失）

仅在没有 Prettier 配置时创建。使用以下默认值：

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
- [ ] package.json 中的 `prepare` 脚本为 `"husky"`
- [ ] `prettier` 配置存在
- [ ] 运行 `npx lint-staged` 验证其正常工作

### 8. 提交

暂存所有更改/新建的文件，并使用以下信息提交：`Add pre-commit hooks (husky + lint-staged + prettier)`

这会触发新配置的 pre-commit 钩子——这是一个很好的冒烟测试，可以确认一切正常工作。

## 注意事项

- Husky v9+ 的钩子文件不需要 shebang
- `prettier --ignore-unknown` 会跳过 Prettier 无法解析的文件（图片等）
- pre-commit 先运行 lint-staged（快速，仅针对暂存文件），然后运行完整的类型检查和测试