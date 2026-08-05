---

# 第七十一部分：智能体/子代理/工作流深度整合

## 71.1 智能体类型与触发方式

### 自代理（Self-Agent）

自代理是 AI 自身，直接与用户交互。

```
:: 触发方式：直接对话
> 帮我分析这个文件
> 帮我写一个函数
> 帮我修复这个 bug

:: 自代理调用工具示例
用户：读取 src/index.ts 并分析
AI（自代理）：
  → 调用 FileReadTool: file_path="src/index.ts"
  → 读取文件内容
  → 分析代码结构
  → 返回分析结果

:: 自代理 + 多个工具
用户：搜索所有 TODO 并修复
AI（自代理）：
  → 调用 GrepTool: pattern="TODO"
  → 找到 5 个 TODO
  → 调用 FileReadTool: 读取每个文件
  → 调用 FileEditTool: 修复每个 TODO
  → 调用 BashTool: 运行测试验证
  → 返回修复结果
```

### 子代理（Subagent）

子代理是主代理启动的独立 AI 子进程。

```
:: 触发方式 1：提示词
> 使用 general-purpose 代理调研 React Server Components

:: 触发方式 2：Agent 工具
Agent({
  description: "研究 RSC",
  prompt: "调研 React Server Components �佳实践",
  subagent_type: "general-purpose"
})

:: 触发方式 3：命令
/cs:fullstack-review

:: 子代理完整执行流程
1. 主代理调用 AgentTool
2. AgentTool 调用 subAgentManager.spawn()
3. subAgentManager 检查并发限制
4. 如果未达上限，启动新子代理
5. 子代理独立执行任务
6. 子代理完成后返回结果
7. 主代理接收结果并呈现给用户
```

### 专用代理（Specialized Agent）

专用代理是针对特定领域优化的代理。

```
:: critic 代理（代码审查）
触发：> 使用 critic 代理审查 src/auth/login.ts
内部工具：FileReadTool + GrepTool + BashTool(tsc)
输出：审查报告（严重/建议/良好）

:: debug-expert 代理（调试）
触发：> 使用 debug-expert 代理定位这个 TypeError
内部工具：FileReadTool + GrepTool + BashTool
输出：问题定位 + 修复方案

:: test-engineer 代理（测试）
触发：> 使用 test-engineer 代理为 UserService 编写测试
内部工具：FileReadTool + FileWriteTool + BashTool
输出：测试文件 + 测试结果

:: deployer 代理（部署）
触发：> 使用 deployer 代理部署到生产环境
内部工具：BashTool + FileReadTool + HttpTool
输出：部署结果 + 验证报告
```

## 71.2 子代理协作模式

### 串行模式

```
> 使用 planner 代理制定计划
→ 等待完成...
> 使用 general-purpose 代理执行计划
→ 等待完成...
> 使用 critic 代理审查结果
→ 等待完成...

:: 执行流程
[planner] → [general-purpose] → [critic]
   ↓              ↓                ↓
 计划          执行结果          审查报告
```

### 并行模式

```
> 同时启动以下代理：
> - general-purpose 代理：实现后端 API
> - frontend-engineer 代理：实现前端组件
> - test-engineer 代理：编写测试

:: 执行流程
[general-purpose] ─┐
[frontend-engineer]─┼→ 同时执行，并行处理
[test-engineer]    ─┘
      ↓
  汇总结果
```

### 层级模式

```
> 使用 architect 代理设计系统架构
  → architect 代理启动 backend-engineer 代理设计后端
    → backend-engineer 代理启动 database-reviewer 代理审查数据库

:: 执行流程
[architect] (第 1 层)
  ↓
[backend-engineer] (第 2 层)
  ↓
[database-reviewer] (第 3 层)
```

## 71.3 工作流详解

### TDD 工作流

```
:: 触发
> 使用 TDD 方式实现用户注册功能

:: 步骤 1：红（写失败测试）
AI 调用 FileWriteTool: 创建 tests/auth/register.test.ts
AI 调用 BashTool: npm test tests/auth/register.test.ts
→ 测试失败（预期）

:: 步骤 2：绿（写代码通过测试）
AI 调用 FileWriteTool: 创建 app/api/auth/register/route.ts
AI 调用 BashTool: npm test tests/auth/register.test.ts
→ 测试通过

:: 步骤 3：重构（优化代码结构）
AI 调用 GrepTool: 查找重复代码
AI 调用 FileEditTool: 提取公共逻辑
AI 调用 BashTool: npm test tests/auth/register.test.ts
→ 测试仍然通过
```

### Git 工作流

```
:: 触发
> /commit-push-pr

:: 步骤 1：分析变更
AI 调用 BashTool: git diff
→ 分析变更内容

:: 步骤 2：生成 commit message
→ AI 生成规范的 commit message

:: 步骤 3：提交
AI 调用 BashTool: git add -A
AI 调用 BashTool: git commit -m "..."

:: 步骤 4：推送
AI 调用 BashTool: git push origin main

:: 步骤 5：创建 PR
AI 调用 HttpTool: POST https://api.github.com/repos/xxx/pulls
→ PR 已创建
```

---

# 第七十二部分：自定义技能开发实战

## 72.1 创建自定义技能

### 场景：创建一个"代码审查报告生成"技能

```
步骤 1：创建技能目录
> /skills create code-review-report

:: 输出
已创建技能目录：.claudeskills/code-review-report/
├── SKILL.md          ← 技能描述和用法
├── index.ts          ← 技能入口
├── references/       ← 参考文档
│   └── review-template.md
└── scripts/          ← 辅助脚本
    └── generate-report.py

步骤 2：编写 SKILL.md
> 编辑 .claudeskills/code-review-report/SKILL.md

:: SKILL.md 内容
---
name: code-review-report
description: 生成标准化的代码审查报告，包含问题分类、严重程度、修复建议
version: 1.0.0
author: your-name
tools: [Read, Grep, Bash, Glob]
---

# 代码审查报告生成

## 用法

```
/skill code-review-report [文件或目录路径]
/skill code-review-report src/auth/
/skill code-review-report src/api/users.ts
```

## 执行流程

1. 读取目标文件或目录
2. 搜索常见代码问题（安全、性能、风格）
3. 按严重程度分类（Critical/Major/Minor/Info）
4. 生成标准化报告
5. 保存到 ./reviews/ 目录

## 输出格式

```markdown
# 代码审查报告

**审查目标**：src/auth/login.ts
**审查时间**：2026-08-03 10:30:00
**审查工具**：code-review-report v1.0.0

## 摘要

| 级别 | 数量 |
|------|------|
| 🔴 Critical | 1 |
| 🟠 Major | 3 |
| 🟡 Minor | 5 |
| 🔵 Info | 2 |

## 问题列表

### 🔴 Critical

#### C-001: SQL 注入风险
- **位置**：src/auth/login.ts:23
- **问题**：用户输入直接拼接到 SQL 查询
- **修复**：使用参数化查询

### 🟠 Major

#### M-001: 密码明文存储
- **位置**：src/auth/login.ts:45
- **问题**：密码未加密直接存储
- **修复**：使用 bcrypt 加密

## 修复建议

1. 立即修复 Critical 问题
2. 本周内修复 Major 问题
3. 计划修复 Minor 问题
```

步骤 3：编写入口文件
> 编辑 .claudeskills/code-review-report/index.ts

:: index.ts 内容
```typescript
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { execSync } from 'child_process'

export const name = 'code-review-report'
export const description = '生成标准化的代码审查报告'

export async function activate(context: any) {
  context.logger.info('code-review-report 技能已激活')
}

export async function deactivate() {
  // 清理资源
}

export async function execute(args: string[], context: any) {
  const target = args[0] || '.'
  const outputDir = join(process.cwd(), '.reviews')
  
  // 确保输出目录存在
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // 1. 读取目标文件
  const files = await getFiles(target, context)
  
  // 2. 搜索问题
  const issues: Issue[] = []
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    issues.push(...checkSecurity(file, content))
    issues.push(...checkPerformance(file, content))
    issues.push(...checkStyle(file, content))
  }

  // 3. 生成报告
  const report = generateReport(files, issues)
  
  // 4. 保存报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputPath = join(outputDir, `review-${timestamp}.md`)
  writeFileSync(outputPath, report, 'utf-8')

  return {
    success: true,
    output: report,
    reportPath: outputPath,
    issueCount: issues.length
  }
}

interface Issue {
  severity: 'critical' | 'major' | 'minor' | 'info'
  file: string
  line: number
  message: string
  suggestion: string
}

async function getFiles(target: string, context: any): Promise<string[]> {
  if (!existsSync(target)) return []
  
  const stat = await context.tools.FileReadTool stat(target)
  if (!stat.isDirectory) return [target]
  
  const result = await context.tools.GlobTool.execute({
    pattern: '**/*.{ts,tsx,js,jsx}',
    path: target
  })
  return result.files
}

function checkSecurity(file: string, content: string): Issue[] {
  const issues: Issue[] = []
  const lines = content.split('\n')
  
  lines.forEach((line, index) => {
    // SQL 注入检查
    if (line.includes('sql`') || line.includes('sql\'')) {
      if (line.includes('+') || line.includes('`${')) {
        issues.push({
          severity: 'critical',
          file,
          line: index + 1,
          message: 'SQL 注入风险：用户输入直接拼接',
          suggestion: '使用参数化查询'
        })
      }
    }
    
    // XSS 检查
    if (line.includes('innerHTML') || line.includes('dangerouslySetInnerHTML')) {
      issues.push({
        severity: 'major',
        file,
        line: index + 1,
        message: 'XSS 风险：直接设置 HTML 内容',
        suggestion: '使用安全的渲染方式'
      })
    }
    
    // 硬编码密钥
    if (line.match(/password|secret|key|token)\s*[:=]\s*['"][^'"]+['"]/i)) {
      issues.push({
        severity: 'critical',
        file,
        line: index + 1,
        message: '硬编码密钥',
        suggestion: '使用环境变量存储'
      })
    }
  })
  
  return issues
}

function checkPerformance(file: string, content: string): Issue[] {
  const issues: Issue[] = []
  const lines = content.split('\n')
  
  lines.forEach((line, index) => {
    // N+1 查询检查
    if (line.includes('.map(') && line.includes('.find(')) {
      issues.push({
        severity: 'major',
        file,
        line: index + 1,
        message: '可能的 N+1 查询',
        suggestion: '使用批量查询或 join'
      })
    }
    
    // 缺少索引
    if (line.includes('findUnique') || line.includes('findOne')) {
      if (!line.includes('where')) {
        issues.push({
          severity: 'minor',
          file,
          line: index + 1,
          message: '查询可能缺少索引',
          suggestion: '添加数据库索引'
        })
      }
    }
  })
  
  return issues
}

function checkStyle(file: string, content: string): Issue[] {
  const issues: Issue[] = []
  const lines = content.split('\n')
  
  lines.forEach((line, index) => {
    // 行长度
    if (line.length > 100) {
      issues.push({
        severity: 'info',
        file,
        line: index + 1,
        message: `行长度 ${line.length} 超过 100 字符`,
        suggestion: '拆分长行'
      })
    }
    
    // 缺少类型注解
    if (line.includes('function ') && !line.includes(': ')) {
      issues.push({
        severity: 'minor',
        file,
        line: index + 1,
        message: '函数缺少返回类型注解',
        suggestion: '添加 TypeScript 返回类型'
      })
    }
  })
  
  return issues
}

function generateReport(files: string[], issues: Issue[]): string {
  const timestamp = new Date().toISOString()
  
  const critical = issues.filter(i => i.severity === 'critical')
  const major = issues.filter(i => i.severity === 'major')
  const minor = issues.filter(i => i.severity === 'minor')
  const info = issues.filter(i => i.severity === 'info')

  let report = `# 代码审查报告

**审查目标**：${files.join(', ')}
**审查时间**：${timestamp}
**审查工具**：code-review-report v1.0.0

## 摘要

| 级别 | 数量 |
|------|------|
| 🔴 Critical | ${critical.length} |
| 🟠 Major | ${major.length} |
| 🟡 Minor | ${minor.length} |
| 🔵 Info | ${info.length} |

## 问题列表

`

  if (critical.length > 0) {
    report += `### 🔴 Critical\n\n`
    critical.forEach((issue, i) => {
      report += `#### C-${String(i + 1).padStart(3, '0')}: ${issue.message}\n`
      report += `- **位置**：${issue.file}:${issue.line}\n`
      report += `- **修复**：${issue.suggestion}\n\n`
    })
  }

  if (major.length > 0) {
    report += `### 🟠 Major\n\n`
    major.forEach((issue, i) => {
      report += `#### M-${String(i + 1).padStart(3, '0')}: ${issue.message}\n`
      report += `- **位置**：${issue.file}:${issue.line}\n`
      report += `- **修复**：${issue.suggestion}\n\n`
    })
  }

  report += `## 修复建议\n\n`
  report += `1. 立即修复 ${critical.length} 个 Critical 问题\n`
  report += `2. 本周内修复 ${major.length} 个 Major 问题\n`
  report += `3. 计划修复 ${minor.length} 个 Minor 问题\n`

  return report
}
```

步骤 4：使用技能
> /skill code-review-report src/auth/

:: 输出
正在审查 src/auth/ 目录...
找到 5 个文件
审查完成！

📋 代码审查报告

| 级别 | 数量 |
|------|------|
| 🔴 Critical | 1 |
| 🟠 Major | 2 |
| 🟡 Minor | 3 |

报告已保存到：.reviews/review-2026-08-03T10-30-00-000Z.md
```

## 72.2 技能发布到 ClawHub

```
步骤 1：准备发布
:: 确保 plugin.json 只包含必要字段
{
  "name": "code-review-report",
  "description": "生成标准化的代码审查报告",
  "version": "1.0.0",
  "author": "your-name",
  "homepage": "https://github.com/...",
  "repository": "https://github.com/...",
  "license": "MIT",
  "skills": "./"
}

步骤 2：发布
> /skills publish code-review-report

:: 输出
✅ 已发布到 ClawHub
📦 https://clawhub.com/skills/code-review-report
⚠️ 速率限制：每小时 5 个新技能

步骤 3：其他用户安装
> /skills install your-name/code-review-report

:: 输出
✅ 已安装 code-review-report v1.0.0
📂 .claudeskills/code-review-report/
```

---

# 第七十三部分：MCP 服务器配置实战

## 73.1 安装并配置 MCP 服务器

### 场景：配置一个 PostgreSQL 数据库 MCP 服务器

```
步骤 1：安装 MCP 服务器
> /mcp install postgres

:: 输出
正在安装 PostgreSQL MCP 服务器...
✅ 已安装：@modelcontextprotocol/server-postgres

步骤 2：配置连接
> /mcp config postgres

:: 配置内容
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": {
      "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb"
    }
  }
}

步骤 3：启动 MCP 服务器
> /mcp start postgres

:: 输出
✅ PostgreSQL MCP 服务器已启动
📡 连接：postgresql://user:pass@localhost:5432/mydb

步骤 4：使用 MCP 工具
> 查询用户表中的所有数据

:: AI 执行
AI 调用 MCPTool: server="postgres", tool="query", params={ sql: "SELECT * FROM users" }

:: 输出
| id | name | email | created_at |
|----|------|-------|------------|
| 1 | Alice | alice@example.com | 2026-01-01 |
| 2 | Bob | bob@example.com | 2026-01-15 |
| 3 | Charlie | charlie@example.com | 2026-02-01 |
```

## 73.2 配置多个 MCP 服务器

```
> /mcp list

:: 输出
已配置的 MCP 服务器：

1. postgres (运行中)
   - 工具：query, insert, update, delete, schema
   - 资源：tables, views, functions

2. redis (运行中)
   - 工具：get, set, del, keys, ttl
   - 资源：keyspaces

3. github (未启动)
   - 工具：create-issue, list-prs, merge-pr
   - 资源：repos, issues, pull-requests

> /mcp start github

:: 输出
✅ GitHub MCP 服务器已启动
```

## 73.3 MCP 自动后台化配置

```
:: 设置超时时间
set CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=30000

:: 效果
> 执行一个耗时 60 秒的 MCP 查询
→ 30 秒后自动移到后台
→ 主线程继续执行其他操作
→ 后台完成后自动通知

:: 查看后台任务
> /mcp status

:: 输出
活跃任务：
- postgres-query (运行中，已耗时 45s)
- redis-scan (运行中，已耗时 20s)

已完成：
- github-list-prs (耗时 5s, 3 个 PR)
```

---

# 第七十四部分：Hook 编排实战

## 74.1 常用 Hook 配置

### 配置 1：工具执行后自动格式化

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "FileWrite",
        "hooks": [{
          "type": "command",
          "command": "biome check --write $CLAUDE_FILE_PATH"
        }]
      },
      {
        "matcher": "FileEdit",
        "hooks": [{
          "type": "command",
          "command": "biome check --write $CLAUDE_FILE_PATH"
        }]
      }
    ]
  }
}

:: 效果
> 帮我修复这个 bug
→ AI 调用 FileEditTool 修改代码
→ Hook 自动执行 biome check --write
→ 代码自动格式化
→ 无需手动格式化
```

### 配置 2：Git 提交前自动检查

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "if echo '$CLAUDE_COMMAND' | grep -q 'git commit'; then npm test && biome check .; fi"
        }]
      }
    ]
  }
}

:: 效果
> /commit
→ Hook 检测到 git commit
→ 自动运行 npm test（测试）
→ 自动运行 biome check（格式检查）
→ 如果测试或检查失败，阻止提交
→ 全部通过后，执行 git commit
```

### 配置 3：AI 完成后声音提醒

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "powershell -c (New-Object.Media.SoundPlayer 'C:\\Windows\\Media\\notify.wav').PlaySync()"
        }]
      }
    ]
  }
}

:: 效果
> 执行一个耗时 2 分钟的任务
→ AI 开始处理...
→ 2 分钟后，AI 完成
→ 自动播放提示音
→ 你知道任务完成了
```

### 配置 4：记录工具使用日志

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "echo \"$(date '+%Y-%m-%d %H:%M:%S') $CLAUDE_TOOL_NAME $CLAUDE_TOOL_STATUS\" >> ~/.doge/tool-usage.log"
        }]
      }
    ]
  }
}

:: 效果
> 帮我执行一些操作
→ AI 调用 BashTool → 记录日志
→ AI 调用 FileReadTool → 记录日志
→ AI 调用 FileEditTool → 记录日志

:: 查看日志
> cat ~/.doge/tool-usage.log
2026-08-03 10:30:00 BashTool success
2026-08-03 10:30:05 FileReadTool success
2026-08-03 10:30:10 FileEditTool success
```

### 配置 5：代码变更自动备份

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "FileEdit",
        "hooks": [{
          "type": "command",
          "command": "mkdir -p .backup && cp $CLAUDE_FILE_PATH .backup/$(basename $CLAUDE_FILE_PATH).$(date +%s).bak"
        }]
      }
    ]
  }
}

:: 效果
> 帮我修复这个 bug
→ AI 调用 FileEditTool 修改 src/index.ts
→ Hook 自动备份到 .backup/src/index.ts.1722672000.bak
→ 如果修复失败，可以恢复原文件
```

---

# 第七十五部分：多代理协作实战

## 75.1 场景：开发一个完整的博客平台

### 阶段 1：架构设计（architect 代理）

```
> 使用 architect 代理设计博客平台的系统架构

:: architect 代理输出
## 系统架构设计

### 前端
- Next.js 15 (App Router)
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- React Query (数据获取)

### 后端
- Next.js API Routes
- Prisma ORM
- PostgreSQL
- Redis (缓存)

### 部署
- Vercel (前端 + API)
- Supabase (数据库)
- Cloudflare (CDN)

### 数据模型
```prisma
model User {
  id    String @id @default(cuid())
  email String @unique
  name  String
  posts Post[]
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
}
```
```

### 阶段 2：并行开发（多个代理同时工作）

```
> 同时启动以下代理：
> 1. frontend-engineer 代理：实现前端页面
> 2. backend-engineer 代理：实现后端 API
> 3. test-engineer 代理：编写测试

:: 执行流程
[frontend-engineer] ──┐
[backend-engineer]  ──┼→ 并行执行
[test-engineer]     ──┘

:: frontend-engineer 代理内部
→ 创建 app/page.tsx（文章列表）
→ 创建 app/posts/[id]/page.tsx（文章详情）
→ 创建 app/posts/new/page.tsx（新建文章）
→ 创建 components/PostCard.tsx
→ 创建 components/PostList.tsx
→ 创建 components/Editor.tsx

:: backend-engineer 代理内部
→ 创建 app/api/posts/route.ts（列表 + 创建）
→ 创建 app/api/posts/[id]/route.ts（详情 + 更新 + 删除）
→ 创建 lib/posts.ts（业务逻辑）
→ 创建 prisma/schema.prisma（数据模型）

:: test-engineer 代理内部
→ 创建 tests/api/posts.test.ts
→ 创建 tests/components/PostCard.test.tsx
→ 创建 tests/lib/posts.test.ts
→ 运行所有测试
```

### 阶段 3：代码审查（critic 代理）

```
> 使用 critic 代理审查所有代码

:: critic 代理输出
## 代码审查报告

### 🔴 Critical
1. app/api/posts/route.ts:34 - SQL 注入风险
2. app/api/posts/[id]/route.ts:28 - 未验证用户权限

### 🟠 Major
1. components/Editor.tsx:45 - 缺少输入验证
2. lib/posts.ts:23 - 未处理并发冲突

### 🟡 Minor
1. components/PostCard.tsx:12 - 缺少 loading 状态
2. app/page.tsx:8 - 缺少错误边界
```

### 阶段 4：修复并提交

```
> 修复所有 Critical 和 Major 问题

:: AI 执行
→ 修复 SQL 注入（参数化查询）
→ 添加权限验证（中间件）
→ 添加输入验证（zod）
→ 添加并发处理（乐观锁）
→ 运行测试验证

:: 测试结果
✅ 24/24 通过

> /commit-push-pr

:: 输出
✅ 已提交：abc1234
✅ 已推送到 origin/main
✅ PR 已创建：https://github.com/xxx/pull/1
```

---

# 第七十六部分：性能基准测试

## 76.1 Token 消耗基准

### 不同语言的 Token 效率对比

| 语言 | 相同内容的 Token 数 | 相对效率 |
|------|---------------------|----------|
| 英文 | 1000 | 基准 |
| 中文 | 600 | 节省 40% |
| 日文 | 750 | 节省 25% |
| 代码 | 800 | 节省 20% |

### 不同模型的 Token 消耗对比

| 模型 | 输入价格 | 输出价格 | 生成 1000 行代码费用 |
|------|----------|----------|---------------------|
| Claude Opus 4.6 | $15/MTok | $75/MTok | ~$0.45 |
| Claude Sonnet 4.6 | $3/MTok | $15/MTok | ~$0.09 |
| Claude Haiku 4.5 | $0.8/MTok | $4/MTok | ~$0.024 |
| 本地模型 | $0 | $0 | $0 |

### 不同任务的 Token 消耗

| 任务 | 平均 Token 消耗 | 平均费用 |
|------|-----------------|----------|
| 简单问答 | 500-1000 | $0.003 |
| 代码生成（100 行） | 2000-5000 | $0.015 |
| 代码审查 | 3000-8000 | $0.024 |
| 文件重构 | 5000-15000 | $0.045 |
| 完整功能开发 | 20000-50000 | $0.15 |
| 项目架构设计 | 10000-30000 | $0.09 |

## 76.2 响应速度基准

### 不同模型的响应速度

| 模型 | 首 Token 延迟 | 完整响应（1000 token） |
|------|---------------|------------------------|
| Claude Opus 4.6 | 2-5s | 15-30s |
| Claude Sonnet 4.6 | 1-3s | 8-15s |
| Claude Haiku 4.5 | 0.5-2s | 3-8s |
| 本地模型（qwen2.5） | 0.1-0.5s | 1-3s |

### 不同工具的响应速度

| 工具 | 平均响应时间 | 最快 | 最慢 |
|------|-------------|------|------|
| FileReadTool | <100ms | 10ms | 500ms |
| FileWriteTool | <200ms | 50ms | 1s |
| GrepTool | 200ms-2s | 100ms | 10s |
| BashTool | 500ms-5s | 100ms | 30s |
| AgentTool | 5s-60s | 2s | 5min |
| WebFetchTool | 1s-10s | 500ms | 30s |

### 子代理并发性能

| 并发数 | 总耗时（10 个任务） | 单个任务平均 |
|--------|---------------------|-------------|
| 1（串行） | 100s | 10s |
| 5 | 25s | 10s |
| 10 | 12s | 10s |
| 20 | 12s | 10s |

**结论**：并发数超过任务数后，性能不再提升。

---

# 第七十七部分：完整项目案例（从 0 到部署）

## 77.1 项目概述

```
项目名称：TaskFlow（任务管理平台）
技术栈：Next.js 15 + Prisma + PostgreSQL + Tailwind CSS
功能：任务看板、团队协作、时间追踪、报告生成
开发时间：约 2 小时（使用 Doge Code）
```

## 77.2 完整开发流程

```cmd
:: ========================================
:: 第 1 步：创建项目（5 分钟）
:: ========================================
mkdir taskflow && cd taskflow
git init
doge

> /init
> /rules init
> /rules add 使用 Next.js 15 + TypeScript
> /rules add 使用 Prisma + PostgreSQL
> /rules add 使用 Tailwind CSS + shadcn/ui
> /rules add 使用 Zustand 状态管理
> /rules add 提交前必须运行测试和 lint

:: ========================================
:: 第 2 步：数据库设计（10 分钟）
:: ========================================
> 设计数据库模型，包括：
> - User（用户）
> - Project（项目）
> - Task（任务）
> - Comment（评论）
> - TimeEntry（时间记录）

:: AI 执行
AI 调用 FileWriteTool: 创建 prisma/schema.prisma
AI 调用 BashTool: npx prisma generate
AI 调用 BashTool: npx prisma migrate dev

:: ========================================
:: 第 3 步：后端 API 开发（20 分钟）
:: ========================================
> 使用 general-purpose 代理实现后端 API，包括：
> - GET /api/projects（项目列表）
> - POST /api/projects（创建项目）
> - GET /api/tasks（任务列表，支持筛选和分页）
> - POST /api/tasks（创建任务）
> - PUT /api/tasks/:id（更新任务状态）
> - POST /api/tasks/:id/comments（添加评论）
> - POST /api/time-entries（记录工作时间）

:: AI 执行
AI 调用 FileWriteTool: 创建 app/api/projects/route.ts
AI 调用 FileWriteTool: 创建 app/api/tasks/route.ts
AI 调用 FileWriteTool: 创建 app/api/tasks/[id]/route.ts
AI 调用 FileWriteTool: 创建 app/api/tasks/[id]/comments/route.ts
AI 调用 FileWriteTool: 创建 app/api/time-entries/route.ts
AI 调用 FileWriteTool: 创建 lib/tasks.ts
AI 调用 BashTool: npx tsc --noEmit
✅ 类型检查通过

:: ========================================
:: 第 4 步：前端页面开发（30 分钟）
:: ========================================
> 使用 frontend-engineer 代理实现前端页面，包括：
> - /（首页，显示项目列表）
> - /projects/[id]（项目详情，显示任务看板）
> - /tasks/[id]（任务详情，显示评论和时间记录）
> - /reports（报告页面，显示统计数据）

:: AI 执行
AI 调用 FileWriteTool: 创建 app/page.tsx
AI 调用 FileWriteTool: 创建 app/projects/[id]/page.tsx
AI 调用 FileWriteTool: 创建 app/tasks/[id]/page.tsx
AI 调用 FileWriteTool: 创建 app/reports/page.tsx
AI 调用 FileWriteTool: 创建 components/KanbanBoard.tsx
AI 调用 FileWriteTool: 创建 components/TaskCard.tsx
AI 调用 FileWriteTool: 创建 components/TimeTracker.tsx
AI 调用 BashTool: npx tsc --noEmit
✅ 类型检查通过

:: ========================================
:: 第 5 步：测试（15 分钟）
:: ========================================
> /test-gen

:: AI 执行
找到 15 个未测试的函数...
已生成 15 个测试文件
运行测试...

:: 测试结果
✅ 45/45 通过
✅ 覆盖率：87%

:: ========================================
:: 第 6 步：代码审查（10 分钟）
:: ========================================
> /review

:: 审查结果
🔴 Critical: 1（SQL 注入风险）
🟠 Major: 3（缺少验证、缺少错误处理）
🟡 Minor: 5（代码风格、缺少注释）

> 修复所有 Critical 和 Major 问题

:: AI 执行
→ 修复 SQL 注入
→ 添加输入验证
→ 添加错误处理
→ 运行测试验证
✅ 45/45 通过

:: ========================================
:: 第 7 步：提交（5 分钟）
:: ========================================
> /commit-push-pr

:: 输出
✅ 已提交：def4567
✅ 已推送到 origin/main
✅ PR 已创建：https://github.com/xxx/taskflow/pull/1

:: ========================================
:: 第 8 步：部署（15 分钟）
:: ========================================
> 创建 Dockerfile 并部署到 Vercel

:: AI 执行
AI 调用 FileWriteTool: 创建 Dockerfile
AI 调用 FileWriteTool: 创建 .dockerignore
AI 调用 FileWriteTool: 创建 vercel.json
AI 调用 BashTool: vercel --prod

:: 部署结果
✅ 部署完成
🔗 https://taskflow-abc123.vercel.app

:: 验证
AI 调用 WebFetchTool: https://taskflow-abc123.vercel.app
✅ 页面加载正常
✅ API 响应正常
✅ 数据库连接正常

:: ========================================
:: 完成！
:: ========================================
总耗时：约 2 小时
代码行数：+3500 行
测试覆盖率：87%
费用：约 $0.50
```
