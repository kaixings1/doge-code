---
name: Claude 设置审计
description: "Claude 设置审计 — Claude 设置审计相关功能和最佳实践"
risk: unknown
source: community
---

# Claude 设置审计

分析此仓库并为只读命令生成推荐的 Claude Code `settings.json` 权限。

## 何时使用
- 您正在为仓库设置或审计 Claude Code `settings.json` 权限。
- 您需要从仓库的技术栈、工具和单体仓库结构推断出安全的只读允许列表。
- 您想要用基于证据的内容审查或替换现有的 Claude 权限基线。

## 阶段 1：检测技术栈

Run these commands to detect the repository structure:

```bash
ls -la
find . -maxdepth 2 \( -name "*.toml" -o -name "*.json" -o -name "*.lock" -o -name "*.yaml" -o -name "*.yml" -o -name "Makefile" -o -name "Dockerfile" -o -name "*.tf" \) 2>/dev/null | head -50
```

Check for these indicator files:

| Category     | Files to Check                                                                        |
| ------------ | ------------------------------------------------------------------------------------- |
| **Python**   | `pyproject.toml`, `设置.py`, `requirements.txt`, `Pipfile`, `poetry.lock`, `uv.lock` |
| **Node.js**  | `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`                    |
| **Go**       | `go.mod`, `go.sum`                                                                    |
| **Rust**     | `Cargo.toml`, `Cargo.lock`                                                            |
| **Ruby**     | `Gemfile`, `Gemfile.lock`                                                             |
| **Java**     | `pom.xml`, `build.gradle`, `build.gradle.kts`                                         |
| **Build**    | `Makefile`, `Dockerfile`, `docker-compose.yml`                                        |
| **Infra**    | `*.tf` files, `kubernetes/`, `helm/`                                                  |
| **Monorepo** | `lerna.json`, `nx.json`, `turbo.json`, `pnpm-workspace.yaml`                          |

## 阶段 2：检测服务

Check for service integrations:

| Service    | Detection                                                                       |
| ---------- | ------------------------------------------------------------------------------- |
| **Sentry** | `sentry-sdk` in deps, `@sentry/*` packages, `.sentryclirc`, `sentry.properties` |
| **Linear** | Linear config files, `.linear/` directory                                       |

Read dependency files to identify frameworks:

- `package.json` → check `dependencies` and `dev依赖项`
- `pyproject.toml` → check `[project.dependencies]` or `[tool.poetry.dependencies]`
- `Gemfile` → check gem names
- `Cargo.toml` → check `[dependencies]`

## 阶段 3：检查现有设置

```bash
cat .claude/settings.json 2>/dev/null || echo "No existing settings"
```

## 阶段 4：生成建议

通过组合以下内容构建允许列表：

### 基础命令（始终包含）

```json
[
  "Bash(ls:*)",
  "Bash(pwd:*)",
  "Bash(find:*)",
  "Bash(file:*)",
  "Bash(stat:*)",
  "Bash(wc:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(cat:*)",
  "Bash(tree:*)",
  "Bash(git status:*)",
  "Bash(git log:*)",
  "Bash(git diff:*)",
  "Bash(git show:*)",
  "Bash(git branch:*)",
  "Bash(git remote:*)",
  "Bash(git tag:*)",
  "Bash(git stash list:*)",
  "Bash(git rev-parse:*)",
  "Bash(gh pr view:*)",
  "Bash(gh pr list:*)",
  "Bash(gh pr checks:*)",
  "Bash(gh pr diff:*)",
  "Bash(gh issue view:*)",
  "Bash(gh issue list:*)",
  "Bash(gh run view:*)",
  "Bash(gh run list:*)",
  "Bash(gh run logs:*)",
  "Bash(gh repo view:*)",
  "Bash(gh api:*)"
]
```

### 技术栈特定命令

仅包含项目中检测到的工具的命令。

#### Python（如果检测到 Python 文件或配置）

| If Detected                        | Add These Commands                      |
| ---------------------------------- | --------------------------------------- |
| Any Python                         | `python --version`, `python3 --version` |
| `poetry.lock`                      | `poetry show`, `poetry env info`        |
| `uv.lock`                          | `uv pip list`, `uv tree`                |
| `Pipfile.lock`                     | `pipenv graph`                          |
| `requirements.txt` (no other lock) | `pip list`, `pip show`, `pip freeze`    |

#### Node.js（如果检测到 package.json）

| If Detected                  | Add These Commands                     |
| ---------------------------- | -------------------------------------- |
| Any Node.js                  | `node --version`                       |
| `pnpm-lock.yaml`             | `pnpm list`, `pnpm why`                |
| `yarn.lock`                  | `yarn list`, `yarn info`, `yarn why`   |
| `package-lock.json`          | `npm list`, `npm view`, `npm outdated` |
| TypeScript (`tsconfig.json`) | `tsc --version`                        |

#### 其他语言

| If Detected    | Add These Commands                                                   |
| -------------- | -------------------------------------------------------------------- |
| `go.mod`       | `go version`, `go list`, `go mod graph`, `go env`                    |
| `Cargo.toml`   | `rustc --version`, `cargo --version`, `cargo tree`, `cargo metadata` |
| `Gemfile`      | `ruby --version`, `bundle list`, `bundle show`                       |
| `pom.xml`      | `java --version`, `mvn --version`, `mvn dependency:tree`             |
| `build.gradle` | `java --version`, `gradle --version`, `gradle dependencies`          |

#### 构建工具

| If Detected          | Add These Commands                                                   |
| -------------------- | -------------------------------------------------------------------- |
| `Dockerfile`         | `docker --version`, `docker ps`, `docker images`                     |
| `docker-compose.yml` | `docker-compose ps`, `docker-compose config`                         |
| `*.tf` files         | `terraform --version`, `terraform providers`, `terraform state list` |
| `Makefile`           | `make --version`, `make -n`                                          |

### 技能（Sentry 项目）

如果是 Sentry 项目（或安装了 sentry-skills 插件），请包含：

```json
[
  "Skill(sentry-skills:agents-md)",
  "Skill(sentry-skills:blog-writing-guide)",
  "Skill(sentry-skills:brand-guidelines)",
  "Skill(sentry-skills:claude-settings-audit)",
  "Skill(sentry-skills:code-review)",
  "Skill(sentry-skills:code-simplifier)",
  "Skill(sentry-skills:commit)",
  "Skill(sentry-skills:create-branch)",
  "Skill(sentry-skills:create-pr)",
  "Skill(sentry-skills:django-access-review)",
  "Skill(sentry-skills:django-perf-review)",
  "Skill(sentry-skills:doc-coauthoring)",
  "Skill(sentry-skills:find-bugs)",
  "Skill(sentry-skills:gh-review-requests)",
  "Skill(sentry-skills:gha-security-review)",
  "Skill(sentry-skills:iterate-pr)",
  "Skill(sentry-skills:pr-writer)",
  "Skill(sentry-skills:security-review)",
  "Skill(sentry-skills:skill-creator)",
  "Skill(sentry-skills:skill-scanner)",
  "Skill(sentry-skills:skill-writer)",
  "Skill(sentry-skills:sred-project-organizer)",
  "Skill(sentry-skills:sred-work-summary)"
]
```

### WebFetch 域名

#### Sentry 项目始终包含

```json
[
  "WebFetch(domain:docs.sentry.io)",
  "WebFetch(domain:develop.sentry.dev)",
  "WebFetch(domain:docs.github.com)",
  "WebFetch(domain:cli.github.com)"
]
```

#### 框架特定

| If Detected    | Add Domains                                     |
| -------------- | ----------------------------------------------- |
| **Django**     | `docs.djangoproject.com`                        |
| **Flask**      | `flask.palletsprojects.com`                     |
| **FastAPI**    | `fastapi.tiangolo.com`                          |
| **React**      | `react.dev`                                     |
| **Next.js**    | `nextjs.org`                                    |
| **Vue**        | `vuejs.org`                                     |
| **Express**    | `expressjs.com`                                 |
| **Rails**      | `guides.rubyonrails.org`, `api.rubyonrails.org` |
| **Go**         | `pkg.go.dev`                                    |
| **Rust**       | `docs.rs`, `doc.rust-lang.org`                  |
| **Docker**     | `docs.docker.com`                               |
| **Kubernetes** | `kubernetes.io`                                 |
| **Terraform**  | `registry.terraform.io`                         |

### MCP 服务器建议

MCP servers are configured in `.mcp.json` (not `settings.json`). Check for existing config:

```bash
cat .mcp.json 2>/dev/null || echo "No existing .mcp.json"
```

#### Sentry MCP（如果检测到 Sentry SDK）

Add to `.mcp.json` (replace `{org-标识符}` and `{project-标识符}` with your Sentry organization and project slugs):

```json
{
  "mcpServers": {
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp/{org-标识符}/{project-标识符}"
    }
  }
}
```

#### Linear MCP（如果检测到 Linear 使用）

Add to `.mcp.json`:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@linear/mcp-server"],
      "env": {
        "LINEAR_API_KEY": "${LINEAR_API_KEY}"
      }
    }
  }
}
```

**注意**: 绝不建议使用 GitHub MCP。始终使用 `gh` CLI 命令进行 GitHub 操作。

## 输出格式

按以下方式呈现发现结果：

1. **总结 Table** - What was detected
2. **Recommended settings.json** - Complete JSON ready to copy
3. **MCP Suggestions** - If applicable
4. **Merge Instructions** - If existing settings found

Example output structure:

```markdown
## Detected Tech Stack

| Category        | Found          |
| --------------- | -------------- |
| Languages       | Python 3.x     |
| Package Manager | poetry         |
| Frameworks      | Django, Celery |
| Services        | Sentry         |
| Build Tools     | Docker, Make   |

## Recommended .claude/settings.json

\`\`\`json
{
"permissions": {
"allow": [
// ... grouped by category with comments
],
"deny": []
}
}
\`\`\`

## Recommended .mcp.json (if applicable)

If you use Sentry or Linear, add the MCP config to `.mcp.json`...
```

## 重要规则

### 应包含的内容

- Only READ-ONLY commands that cannot modify state
- Only tools that are actually used by the project (detected via lock files)
- Standard system commands (ls, cat, find, etc.)
- The `:*` suffix allows any arguments to the base command

### 绝不包含的内容

- **Absolute paths** - 绝不 include user-specific paths like `/home/user/scripts/foo` or `/Users/name/bin/bar`
- **Custom scripts** - 绝不 include project scripts that may have side effects (e.g., `./scripts/deploy.sh`)
- **Alternative package managers** - If the project uses pnpm, do NOT include npm/yarn commands
- **Commands that modify state** - No install, build, run, write, or delete commands

### 包管理器规则

Only include the package manager actually used by the project:

| If Detected         | Include         | 不要 Include                         |
| ------------------- | --------------- | -------------------------------------- |
| `pnpm-lock.yaml`    | pnpm commands   | npm, yarn                              |
| `yarn.lock`         | yarn commands   | npm, pnpm                              |
| `package-lock.json` | npm commands    | yarn, pnpm                             |
| `poetry.lock`       | poetry commands | pip (unless also has requirements.txt) |
| `uv.lock`           | uv commands     | pip, poetry                            |
| `Pipfile.lock`      | pipenv commands | pip, poetry                            |

If multiple lock files exist, include only the commands for each detected manager.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
