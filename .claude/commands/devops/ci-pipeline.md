为 GitHub Actions 生成 CI 流水线配置。

## 步骤

### 1. 检测项目需求
- 从配置文件中识别语言、包管理器和测试框架。
- 从项目设置中确定所需服务（数据库、Redis 等）。
- 检查现有的 CI 配置以进行更新而非替换。

### 2. 流水线阶段

#### 代码检查
- 运行 linter：ESLint、Ruff、golangci-lint、clippy。
- 运行格式化检查：Prettier、Black、gofmt、rustfmt。
- 运行类型检查器：tsc --noEmit、mypy、go vet。

#### 测试
- 运行单元测试并生成覆盖率报告。
- 运行集成测试（含所需服务）。
- 上传覆盖率报告作为构建产物。
- 如果覆盖率低于阈值则失败。

#### 构建
- 构建应用程序。
- 如果适用，构建 Docker 镜像。
- 上传构建产物。

#### 部署（仅在 main 分支上）
- 部署到预发布环境。
- 对预发布环境运行冒烟测试。
- 部署到生产环境（需要手动批准关卡）。

### 3. 生成工作流文件
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
```

### 4. 添加缓存
- 缓存包管理器依赖（npm、pip、go modules）。
- 尽可能缓存构建输出。
- 基于锁定文件使用 `hashFiles` 作为缓存键。

## 规则

- 为可重现性使用特定的操作版本（v4，而非 latest）。
- 积极缓存：依赖、构建输出、Docker 层。
- 在测试前运行代码检查（在样式问题上快速失败）。
- 仅当项目支持时才使用矩阵构建来处理多种语言版本。
- 将密钥保存在 GitHub 仓库设置中，绝不在工作流文件中保存。
- 添加超时限制以防止作业挂起：`timeout-minutes: 15`。
- 使用 `concurrency` 取消同一分支上被取代的运行。
