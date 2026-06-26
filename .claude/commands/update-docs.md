# 更新文档 (Update Documentation)

将文档与代码库同步，从单一事实来源 (Source of Truth) 文件生成。

## 步骤 1：识别单一事实来源 (Identify Sources of Truth)

| 来源 | 生成内容 |
|------|----------|
| `package.json` 脚本 | 可用命令参考 |
| `.env.example` | 环境变量文档 |
| `openapi.yaml` / 路由文件 | API 端点参考 |
| 源码导出内容 | 公共 API 文档 |
| `Dockerfile` / `docker-compose.yml` | 基础设施设置文档 |

## 步骤 2：生成脚本参考 (Generate Script Reference)

1. 读取 `package.json`（或 `Makefile`、`Cargo.toml`、`pyproject.toml`）
2. 提取所有脚本/命令及其说明
3. 生成参考表：

```markdown
| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build with type checking |
| `npm test` | Run test suite with coverage |
```

## 步骤 3：生成环境文档 (Generate Environment Documentation)

1. 读取 `.env.example`（或 `.env.template`、`.env.sample`）
2. 提取所有变量及其用途
3. 将其分类为必填与选填 (required vs optional)
4. 记录预期格式和有效值

```markdown
| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `LOG_LEVEL` | No | Logging verbosity (default: info) | `debug`, `info`, `warn`, `error` |
```

## 步骤 4：更新贡献指南 (Update Contributing Guide)

生成或更新 `docs/CONTRIBUTING.md`，包含：
- 开发环境设置（先决条件、安装步骤）
- 可用脚本及其用途
- 测试流程（如何运行、如何编写新测试）
- 代码风格强制执行（linter、formatter、pre-commit 钩子）
- PR 提交检查清单

## 步骤 5：更新运维手册 (Update Runbook)

生成或更新 `docs/RUNBOOK.md`，包含：
- 部署流程（分步指南）
- 健康检查端点与监控
- 常见问题及其修复
- 回滚流程
- 告警与升级路径

## 步骤 6：陈旧性检查 (Staleness Check)

1. 查找超过 90 天未修改的文档文件
2. 与最近的源代码更改进行交叉对比
3. 标记可能过时的文档以供手动审查

## 步骤 7：显示摘要 (Show Summary)

```
Documentation Update
──────────────────────────────
Updated:  docs/CONTRIBUTING.md (scripts table)
Updated:  docs/ENV.md (3 new variables)
Flagged:  docs/DEPLOY.md (142 days stale)
Skipped:  docs/API.md (no changes detected)
──────────────────────────────
```

## 规则 (Rules)

- **单一事实来源 (Single source of truth)**：始终从代码生成，严禁手动编辑生成的部分
- **保留手动编写章节 (Preserve manual sections)**：仅更新生成的部分；保持手写的正文内容完整
- **标记生成的内容 (Mark generated content)**：在生成的部分周围使用 `<!-- AUTO-GENERATED -->` 标记
- **不要自发创建文档 (Don't create docs unprompted)**：仅在命令明确要求时才创建新的文档文件
