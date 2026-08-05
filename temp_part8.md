---

# 第六十一部分：性能优化指南

## 61.1 Token 消耗优化

### 策略 1：使用中文提示词

```
❌ 低效（英文）：
"Please analyze the structure of this project and tell me what issues you find"

✅ 高效（中文）：
"分析这个项目结构，找出问题"
```

**原理**：中文单 token 信息密度更高，相同内容比英文少 30-50% token。

### 策略 2：分阶段完成复杂任务

```
❌ 低效（一次完成）：
"帮我实现用户认证模块，包括注册、登录、登出、密码重置、权限管理"

✅ 高效（分阶段）：
> 先实现注册功能
→ /clear
> 再实现登录功能
→ /clear
> 最后实现权限管理
```

### 策略 3：及时清理上下文

```
> /clear              ← 任务完成后清理
> /compact            ← 上下文过长时压缩
> /context            ← 查看当前使用量
```

### 策略 4：模型选择

| 任务类型 | 推荐模型 | 原因 |
|----------|----------|------|
| 简单代码修改 | Haiku / 本地模型 | 速度快、费用低 |
| 复杂架构设计 | Opus / Sonnet 4.6 | 理解力强 |
| 代码审查 | Sonnet 4.5+ | 准确度高 |
| 文档生成 | Haiku / 本地模型 | 信息密度高 |

### 策略 5：使用 /compact 压缩

```
> /compact
→ AI 将历史对话压缩为摘要
→ 释放 50-80% 的 token 空间
```

## 61.2 响应速度优化

### 使用本地模型进行简单任务

```json
// .doge/models.json
{
  "models": [
    {
      "name": "本地快速模型",
      "provider": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "apiKey": "ollama",
      "model": "qwen2.5-coder:32b",
      "maxTokens": 8192
    }
  ]
}
```

### 配置并发子代理

```cmd
set CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=50
set CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=5
```

### 减少权限确认频率

```cmd
/less-permission-prompts
```

## 61.3 内存和磁盘优化

### 清理缓存

```cmd
/cache clear
/break-cache
```

### 清理会话

```
/clear              ← 清空当前会话
/rewind             ← 回滚到指定轮次
```

### 监控磁盘使用

```
> /monitor
→ 检查磁盘空间使用情况
```

---

# 第六十二部分：备份与恢复

## 62.1 备份策略

### 自动备份

Doge Code 自动备份以下内容：
- 会话历史：`.doge/sessions/`
- 记忆文件：`.doge/projects/<hash>/memory/`
- 配置文件：`.doge/.claude.json`

### 手动备份

```cmd
:: 备份整个配置目录
xcopy /E /I %USERPROFILE%\.doge backup\.doge

:: 备份项目配置
xcopy /E /I .doge backup\.doge-project

:: 备份规则文件
copy .dogerules backup\.dogerules
```

### 使用备份工具

```cmd
:: 创建备份
/backup create

:: 列出备份
/backup list

:: 恢复备份
/restore <backup-name>

:: 删除备份
/delete <backup-name>
```

## 62.2 恢复策略

### 恢复配置

```cmd
:: 从备份恢复
xcopy /E /I backup\.doge %USERPROFILE%\.doge

:: 恢复项目配置
xcopy /E /I backup\.doge-project .doge
```

### 恢复会话

```cmd
:: 列出历史会话
/resume

:: 恢复指定会话
/resume <session-id>
```

### 恢复记忆

```cmd
:: 查看记忆
/memory

:: 搜索记忆
/memory-search <query>
```

## 62.3 多设备同步

### 通过 Git 同步

```cmd
:: 将配置目录纳入 Git 管理
cd %USERPROFILE%\.doge
git init
git remote add origin <your-repo>
git push

:: 在其他设备上拉取
git pull
```

### 通过设置同步

```
> /config export    ← 导出设置
> /config import    ← 导入设置
```

---

# 第六十三部分：多项目工作流

## 63.1 项目切换

### 会话管理

```
:: 查看所有会话
/sessions

:: 创建新会话
/sessions new

:: 切换会话
/sessions switch <id>

:: 删除会话
/sessions delete <id>
```

### 项目配置

每个项目可以有独立的配置：

```
项目A/
├── .doge/
│   ├── models.json    ← 项目A的模型配置
│   └── settings.json  ← 项目A的设置
├── .dogerules         ← 项目A的规则
└── CLAUDE.md          ← 项目A的上下文

项目B/
├── .doge/
│   ├── models.json    ← 项目B的模型配置
│   └── settings.json  ← 项目B的设置
├── .dogerules         ← 项目B的规则
└── CLAUDE.md          ← 项目B的上下文
```

### 模型切换

```
:: 为当前项目设置模型
/model claude-sonnet-4-6

:: 为不同项目使用不同模型
:: 项目A：使用 Claude Sonnet（高质量）
:: 项目B：使用本地模型（快速、免费）
```

## 63.2 多项目并行

### 使用子代理

```
> 使用 general-purpose 代理在项目A中实现功能
> 使用 critic 代理在项目B中审查代码
→ 两个代理并行执行
```

### 使用桌面端多窗口

```
桌面端支持多 Tab/多窗口：
- 每个项目一个 Tab
- 快速切换
- 独立会话
```

---

# 第六十四部分：CI/CD 集成

## 64.1 GitHub Actions 集成

### 自动代码审查

```yaml
# .github/workflows/review.yml
name: AI Code Review
on: [pull_request]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      - name: Install Doge Code
        run: |
          bun install
          bun link
      - name: Run Review
        run: |
          doge /review
```

### 自动测试生成

```yaml
# .github/workflows/test-gen.yml
name: AI Test Generation
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      - name: Generate Tests
        run: |
          bun install
          bun link
          doge /test-gen
```

## 64.2 GitLab CI 集成

```yaml
# .gitlab-ci.yml
ai-review:
  image: oven/bun:latest
  script:
    - bun install
    - bun link
    - doge /review
  only:
    - merge_requests
```

## 64.3 本地 CI 集成

### 使用 Hooks

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "npm test"
        }]
      }
    ]
  }
}
```

### 使用 Cron

```
> /schedule create --cron "0 9 * * *" --command "/review"
→ 每天上午 9 点自动运行代码审查
```

---

# 第六十五部分：API 参考

## 65.1 QueryEngine API

```typescript
class QueryEngine {
  constructor(options: EngineOptions)
  async query(message: string): Promise<QueryResult>
  async compact(): Promise<void>
  async abort(): void
  getState(): EngineState
  getMessages(): InternalMessage[]
  onEvent(callback: (event: AgentEvent) => void): void
}

interface EngineOptions {
  model: string
  maxOutputTokens?: number
  systemPrompt?: string
  tools?: Map<string, Tool>
  onEvent?: (event: AgentEvent) => void
  autoFixLoop?: {
    enabled?: boolean
    maxIterations?: number
  }
  gitContext?: GitContextConfig
}
```

## 65.2 Tool API

```typescript
interface Tool {
  name: string
  description: string
  parameters: ToolParameters
  validate: (input: unknown) => ValidationResult
  execute: (params: Record<string, unknown>, context: ToolUseContext) => Promise<ToolResult>
}

interface ToolResult {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}
```

## 65.3 Command API

```typescript
interface Command {
  type: 'local' | 'global'
  name: string
  description: string
  aliases?: string[]
  arguments?: Argument[]
  supportsNonInteractive?: boolean
  call: (args: string) => Promise<CommandResult>
}

interface CommandResult {
  type: 'text' | 'error' | 'redirect'
  value: string
}
```

## 65.4 Skill API

```typescript
interface Skill {
  name: string
  description: string
  version: string
  author?: string
  dependencies?: string[]
  activate: (context: SkillContext) => Promise<void>
  deactivate: () => Promise<void>
}

interface SkillContext {
  logger: Logger
  config: Record<string, unknown>
  tools: Map<string, Tool>
}
```

## 65.5 Hook API

```typescript
interface HookConfig {
  matcher?: string
  hooks: Array<{
    type: 'command'
    command: string
  }>
}

interface HooksConfig {
  PreToolUse?: HookConfig[]
  PostToolUse?: HookConfig[]
  UserPromptSubmit?: HookConfig[]
  Stop?: HookConfig[]
  SubagentStop?: HookConfig[]
}
```

---

# 第六十六部分：迁移指南

## 66.1 从 Claude Code 迁移

### 配置迁移

```cmd
:: 备份原配置
copy %USERPROFILE%\.claude.json %USERPROFILE%\.claude.json.bak

:: 复制到新配置目录
mkdir %USERPROFILE%\.doge
copy %USERPROFILE%\.claude.json %USERPROFILE%\.doge\.claude.json
```

### 会话迁移

```cmd
:: 会话存储位置不同
:: Claude Code: %USERPROFILE%\.claude\sessions\
:: Doge Code:   %USERPROFILE%\.doge\sessions\

:: 复制会话
xcopy /E /I %USERPROFILE%\.claude\sessions\ %USERPROFILE%\.doge\sessions\
```

### 技能迁移

```cmd
:: 复制技能
xcopy /E /I %USERPROFILE%\.claude\skills\ %USERPROFILE%\.doge\skills\
```

## 66.2 从 Cursor 迁移

### 规则迁移

```cmd
:: Cursor 的 .cursorrules → Doge Code 的 .dogerules
copy .cursorrules .dogerules
```

### 配置迁移

```
Cursor 配置 → Doge Code 配置
- API Key → /login 配置
- 模型选择 → /model 切换
- 规则文件 → /rules 管理
```

## 66.3 数据迁移检查清单

| 项目 | 源位置 | 目标位置 | 状态 |
|------|--------|----------|------|
| 配置文件 | `~/.claude.json` | `~/.doge/.claude.json` | ⬜ |
| 会话历史 | `~/.claude/sessions/` | `~/.doge/sessions/` | ⬜ |
| 技能 | `~/.claude/skills/` | `~/.doge/skills/` | ⬜ |
| 规则 | `.cursorrules` | `.dogerules` | ⬜ |
| 项目配置 | `.claude/` | `.doge/` | ⬜ |
| 记忆 | `~/.claude/memory/` | `~/.doge/projects/` | ⬜ |

---

# 第六十七部分：隐私与数据处理

## 67.1 数据收集

Doge Code 收集以下数据：

| 数据类型 | 说明 | 存储位置 |
|----------|------|----------|
| 会话历史 | 对话记录 | `~/.doge/sessions/` |
| 使用统计 | Token 用量、命令执行 | `~/.doge/stats/` |
| 记忆文件 | 用户偏好、项目上下文 | `~/.doge/projects/` |
| 配置文件 | API Key、模型配置 | `~/.doge/.claude.json` |

## 67.2 数据保护

### API Key 安全

- API Key 存储在本地 `~/.doge/` 目录
- 不会上传到任何服务器
- 建议使用环境变量而非配置文件

### 会话安全

- 会话历史存储在本地
- 可通过 `/clear` 删除当前会话
- 可通过 `/rewind` 回滚到指定轮次

### 隐私保护

```
> /privacy-settings
→ 管理隐私设置
→ 控制数据收集
→ 导出/删除个人数据
```

## 67.3 数据导出

```
> /export
→ 导出所有个人数据
→ 包括配置、会话、记忆
```

## 67.4 数据删除

```
> /project-purge
→ 清理项目数据
→ 包括会话、记忆、缓存
```

---

# 第六十八部分：故障排除

## 68.1 启动问题

### 问题：Bun 未找到

```cmd
:: 解决方案
curl -fsSL https://bun.sh/install | bash
set PATH=%USERPROFILE%\.bun\bin;%PATH%
```

### 问题：API Key 无效

```cmd
:: 检查 API Key
echo %ANTHROPIC_API_KEY%

:: 重新配置
/login
```

### 问题：模型不可用

```cmd
:: 检查模型配置
/model

:: 切换到可用模型
/model claude-sonnet-4-6
```

## 68.2 运行时问题

### 问题：Token 超限

```
:: 解决方案
/compact              ← 压缩上下文
/clear                ← 清空会话
/context              ← 查看使用量
```

### 问题：工具执行失败

```
:: 检查权限
/permissions

:: 检查工具日志
/logs

:: 调试工具调用
/debug-tool-call
```

### 问题：会话卡住

```
:: 中断当前操作
Ctrl+C

:: 重新开始
/clear
```

## 68.3 桌面端问题

### 问题：桌面端无法启动

```cmd
cd desktop
npm install
node scripts/dev.mjs
```

### 问题：桌面端白屏

```cmd
:: 清理缓存
cd desktop
rm -rf node_modules
npm install
```

## 68.4 诊断工具

```
:: 系统诊断
/diagnose

:: 环境检查
/doctor

:: 查看日志
/logs

:: 监控资源
/monitor
```

---

# 第六十九部分：最佳实践汇总

## 69.1 提示词工程

### 原则 1：精准明确

```
❌ 模糊：
"帮我改一下这个文件"

✅ 明确：
"把 src/index.ts 中的 var 改成 const，并确保类型安全"
```

### 原则 2：分而治之

```
❌ 一次性：
"帮我实现整个用户管理系统"

✅ 分阶段：
> 先实现用户注册
→ /clear
> 再实现用户登录
→ /clear
> 最后实现权限管理
```

### 原则 3：提供上下文

```
❌ 无上下文：
"帮我写一个函数"

✅ 有上下文：
"在 src/utils/format.ts 中写一个格式化日期的函数，输入是 ISO 字符串，输出是 YYYY-MM-DD 格式"
```

### 原则 4：示例驱动

```
❌ 抽象描述：
"写一个排序函数"

✅ 示例驱动：
"写一个排序函数，输入 [3,1,2] 返回 [1,2,3]，支持自定义比较器"
```

### 原则 5：约束边界

```
❌ 无约束：
"帮我重构这个项目"

✅ 有约束：
"帮我重构这个项目，但不要改动 API 接口，保持向后兼容"
```

## 69.2 会话管理

### 原则 1：及时清理

```
> /clear              ← 任务完成后清理
> /compact            ← 上下文过长时压缩
```

### 原则 2：阶段划分

```
> 阶段 1：实现功能 → /clear
> 阶段 2：编写测试 → /clear
> 阶段 3：代码审查 → /clear
```

### 原则 3：命名规范

```
> /rename "用户认证模块开发"
→ 方便后续查找和恢复
```

## 69.3 模型选择

| 任务类型 | 推荐模型 | 原因 |
|----------|----------|------|
| 简单代码修改 | Haiku / 本地模型 | 速度快、费用低 |
| 复杂架构设计 | Opus / Sonnet 4.6 | 理解力强 |
| 代码审查 | Sonnet 4.5+ | 准确度高 |
| 文档生成 | Haiku / 本地模型 | 信息密度高 |
| 测试生成 | Sonnet 4.5+ | 逻辑严密 |
| 调试 | Opus / Sonnet 4.6 | 推理能力强 |

## 69.4 安全实践

1. **API Key 管理**：使用环境变量或 `~/.doge/` 目录，不要硬编码
2. **权限控制**：合理配置工具权限，平衡效率和安全
3. **代码审查**：使用 `/review` 和 `/security-audit` 检查代码
4. **Git 规范**：及时提交，利用 AI 生成 commit message
5. **敏感数据**：不要在对话中输入密码、密钥等敏感信息

## 69.5 团队协作

1. **共享规则**：使用 `.dogerules` 设置团队规范
2. **共享技能**：将技能放入 `.claudeskills/` 目录
3. **共享配置**：通过 Git 共享 `.doge/` 配置
4. **代码审查**：使用 `/review` 和 `/pr-review` 进行团队审查
5. **知识共享**：使用 `/memory` 和 `/memory-search` 共享知识

---

# 第七十部分：实战操作手册

## 70.1 从打开终端到完成一个功能的完整流程

### 场景：给用户管理系统添加"修改密码"功能

```cmd
:: ========================================
:: 第 1 步：进入项目
:: ========================================
cd D:\projects\user-management-system

:: ========================================
:: 第 2 步：启动 Doge Code
:: ========================================
doge

:: ========================================
:: 第 3 步：初始化项目（首次使用）
:: ========================================
> /init

:: AI 输出：
:: 📋 项目分析完成！
:: 
:: 项目结构：
:: - 前端：React 19 + TypeScript + Vite
:: - 后端：Node.js + Express + Prisma
:: - 数据库：PostgreSQL
:: - 测试：Vitest + Playwright
:: 
:: 已更新 CLAUDE.md 文件。

:: ========================================
:: 第 4 步：设置项目规则
:: ========================================
> /rules init
> /rules add 使用 TypeScript 严格模式
> /rules add API 使用 RESTful 规范
> /rules add 数据库操作使用 Prisma ORM
> /rules add 提交前必须运行测试

:: ========================================
:: 第 5 步：描述需求
:: ========================================
> 帮我实现"修改密码"功能，包括：
> 1. 前端：修改密码页面（原密码、新密码、确认密码）
> 2. 后端：PUT /api/users/password 接口
> 3. 验证：原密码正确性检查
> 4. 安全：密码强度验证、bcrypt 加密

:: ========================================
:: 第 6 步：AI 开始工作
:: ========================================
:: AI 调用 FileReadTool: file_path="src/server/routes/users.ts"
:: AI 读取现有用户路由文件...
:: 
:: AI 调用 FileWriteTool: file_path="src/server/routes/password.ts"
:: AI 创建密码路由文件...
:: 
:: AI 调用 FileReadTool: file_path="src/client/pages/Profile.tsx"
:: AI 读取用户资料页面...
:: 
:: AI 调用 FileEditTool: 
::   file_path="src/client/pages/Profile.tsx"
::   old_string="// TODO: 添加修改密码功能"
::   new_string="<Link to='/change-password'>修改密码</Link>"
:: 
:: AI 调用 FileWriteTool: file_path="src/client/pages/ChangePassword.tsx"
:: AI 创建修改密码页面...
:: 
:: AI 调用 BashTool: command="npx tsc --noEmit"
:: AI 运行类型检查...
:: 
:: ✅ 类型检查通过！

:: ========================================
:: 第 7 步：生成测试
:: ========================================
> /test-gen src/server/routes/password.ts

:: AI 输出：
:: 正在为 password.ts 生成测试...
:: 
:: 已生成 5 个测试用例：
:: ✅ 原密码正确，新密码符合要求 → 修改成功
:: ✅ 原密码错误 → 返回 401
:: ✅ 新密码太短 → 返回 400
:: ✅ 两次新密码不一致 → 返回 400
:: ✅ 用户不存在 → 返回 404
:: 
:: 运行测试...
:: ✅ 5/5 通过

:: ========================================
:: 第 8 步：代码审查
:: ========================================
> /review

:: AI 输出：
:: 📋 代码审查报告
:: 
:: 🔴 严重问题：
:: 1. password.ts:23 - 未对 newPassword 进行强度验证（需要包含大小写字母和数字）
:: 2. password.ts:31 - 未使用参数化查询，存在 SQL 注入风险
:: 
:: 🟡 建议改进：
:: 1. ChangePassword.tsx:15 - 建议使用 toast 替代 alert
:: 2. password.ts:18 - 建议添加请求频率限制
:: 
:: 🟢 良好实践：
:: 1. 使用了 bcrypt 加密密码
:: 2. 正确使用了 TypeScript 类型
:: 3. 测试覆盖率高

:: ========================================
:: 第 9 步：修复问题
:: ========================================
> 修复审查中发现的问题

:: AI 调用 FileEditTool 修复 SQL 注入...
:: AI 调用 FileEditTool 添加密码强度验证...
:: AI 调用 FileEditTool 添加 toast 通知...
:: AI 调用 FileEditTool 添加频率限制...
:: 
:: ✅ 所有问题已修复

:: ========================================
:: 第 10 步：提交代码
:: ========================================
> /commit

:: AI 输出：
:: 📝 变更分析：
:: - 新增：src/client/pages/ChangePassword.tsx
:: - 新增：src/server/routes/password.ts
:: - 新增：src/server/routes/password.test.ts
:: - 修改：src/client/pages/Profile.tsx
:: - 修改：src/server/routes/users.ts
:: 
:: 生成的 commit message：
:: feat: 添加修改密码功能
:: 
:: - 新增修改密码页面（ChangePassword.tsx）
:: - 新增密码修改 API（PUT /api/users/password）
:: - 添加密码强度验证和 bcrypt 加密
:: - 添加请求频率限制防止暴力破解
:: - 添加完整的单元测试（5 个用例）
:: 
:: ✅ 已提交：abc1234

:: ========================================
:: 第 11 步：推送并创建 PR
:: ========================================
> /commit-push-pr

:: AI 输出：
:: ✅ 已推送到 origin/main
:: ✅ PR 已创建：https://github.com/xxx/pull/123
```

## 70.2 工具真实输入输出

### BashTool 真实使用

```
:: 输入
> 查看当前 git 状态

:: AI 内部调用
BashTool.execute({ command: "git status" })

:: 实际输出
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
        modified:   src/server/routes/users.ts
        new file:   src/server/routes/password.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        src/client/pages/ChangePassword.tsx

:: AI 回复
当前有 3 个未提交的变更：
- 修改了 users.ts
- 新增了 password.ts
- 新增了 ChangePassword.tsx

是否需要我帮你提交这些变更？
```

### FileReadTool 真实使用

```
:: 输入
> 读取 package.json

:: AI 内部调用
FileReadTool.execute({ file_path: "D:/projects/user-management-system/package.json" })

:: 实际输出
1  {
2    "name": "user-management-system",
3    "version": "1.0.0",
4    "scripts": {
5      "dev": "vite",
6      "build": "tsc && vite build",
7      "test": "vitest",
8      "test:e2e": "playwright test"
9    },
10   "dependencies": {
11     "react": "^19.0.0",
12     "react-router-dom": "^7.0.0",
13     "express": "^4.21.0",
14     "prisma": "^6.0.0",
15     "bcrypt": "^5.1.0"
16   },
17   "devDependencies": {
18     "typescript": "^5.6.0",
19     "vitest": "^2.0.0",
20     "@playwright/test": "^1.48.0"
21   }
22 }

:: AI 回复
这是一个全栈项目：
- 前端：React 19 + Vite
- 后端：Express + Prisma
- 测试：Vitest + Playwright
- 已安装 bcrypt 用于密码加密
```

### GrepTool 真实使用

```
:: 输入
> 搜索所有使用 console.log 的地方

:: AI 内部调用
GrepTool.execute({ pattern: "console\.log", output_mode: "content", head_limit: 50 })

:: 实际输出
src/client/pages/Profile.tsx:15:  console.log('profile loaded');
src/client/pages/Dashboard.tsx:23:  console.log('dashboard data:', data);
src/client/utils/api.ts:42:      console.log('API error:', error);
src/server/middleware/auth.ts:18:  console.log('auth token:', token);

:: AI 回复
找到 4 处 console.log 使用：
1. Profile.tsx:15 - 调试日志
2. Dashboard.tsx:23 - 数据日志
3. api.ts:42 - 错误日志
4. auth.ts:18 - ⚠️ 安全风险（不应记录 token）

建议：
- 移除 Profile.tsx 和 Dashboard.tsx 的调试日志
- 将 api.ts 的日志改为 logger.error()
- ⚠️ 立即移除 auth.ts 中的 token 日志
```

### AgentTool 真实使用

```
:: 输入
> 使用 critic 代理审查 src/server/routes/password.ts

:: AI 内部调用
AgentTool.execute({
  description: "代码审查",
  prompt: "审查 src/server/routes/password.ts 的代码质量",
  subagent_type: "critic"
})

:: critic 代理内部执行
1. FileReadTool: 读取 password.ts
2. GrepTool: 搜索潜在的安全问题
3. BashTool: 运行 tsc --noEmit 检查类型
4. 分析代码结构、安全、性能

:: critic 代理返回
## 代码审查报告

### 🔴 严重问题
1. **SQL 注入风险** (line 23)
   - 当前代码：`prisma.user.findUnique({ where: { id: userId } })`
   - 问题：userId 未验证类型
   - 修复：添加 `typeof userId === 'string'` 检查

2. **密码强度不足** (line 31)
   - 当前代码：只检查长度 >= 8
   - 问题：未检查复杂度
   - 修复：添加正则验证 `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/`

### 🟡 建议改进
1. **缺少请求频率限制** (line 18)
   - 建议：添加 rate-limiter-flexible
   - 防止暴力破解

2. **错误信息过于详细** (line 45)
   - 当前：`原密码错误，请重试`
   - 建议：`用户名或密码错误`（不暴露具体哪个错）

:: AI 将审查结果呈现给用户
```

## 70.3 代理真实触发与对话

### critic 代理

```
:: 触发方式 1：直接提示词
> 使用 critic 代理审查这个 PR 的代码变更

:: 触发方式 2：命令
> /review --agent critic

:: 触发方式 3：Agent 工具
Agent({
  description: "深度代码审查",
  prompt: "审查 src/auth/ 目录的代码",
  subagent_type: "critic"
})

:: 完整对话流程
用户：使用 critic 代理审查 src/auth/login.ts
AI：正在启动 critic 代理...
     [critic 代理启动]
     [读取 src/auth/login.ts]
     [搜索安全问题]
     [运行类型检查]
     [分析代码结构]
     
     critic 代理返回审查结果：
     
     ## 审查结果
     
     ### 🔴 严重
     1. line 15: 密码明文存储 → 使用 bcrypt 加密
     2. line 23: 未验证输入 → 添加 zod 验证
     
     ### 🟡 建议
     1. line 30: 缺少日志 → 添加 logger
     2. line 42: 魔法数字 → 提取为常量
     
     ### 🟢 良好
     1. 正确使用了 async/await
     2. 错误处理完善
     
是否需要我修复这些问题？
```

### debug-expert 代理

```
:: 触发方式
> 使用 debug-expert 代理定位这个 TypeError

:: 完整对话流程
用户：使用 debug-expert 代理定位这个 TypeError
      TypeError: Cannot read property 'name' of undefined
      出现在 src/client/pages/Profile.tsx:42

AI：正在启动 debug-expert 代理...
     [debug-expert 代理启动]
     [读取 Profile.tsx]
     [分析错误堆栈]
     [搜索相关代码]
     [定位问题]
     
     debug-expert 代理返回：
     
     ## 调试结果
     
     ### 问题定位
     文件：src/client/pages/Profile.tsx
     行号：42
     代码：`<h1>{user.name}</h1>`
     
     ### 根本原因
     user 对象在首次渲染时为 undefined。
     API 调用是异步的，但组件没有处理加载状态。
     
     ### 修复方案
     ```tsx
     // 添加加载状态
     if (!user) return <div>加载中...</div>
     return <h1>{user.name}</h1>
     ```
     
     ### 预防措施
     1. 使用可选链：`user?.name`
     2. 添加 TypeScript 严格模式
     3. 使用 React Suspense 处理异步
```

### general-purpose 代理

```
:: 触发方式
> 使用 general-purpose 代理帮我调研 React Server Components 的最佳实践

:: 完整对话流程
用户：使用 general-purpose 代理帮我调研 React Server Components 的最佳实践

AI：正在启动 general-purpose 代理...
     [general-purpose 代理启动]
     [搜索相关文档]
     [阅读 React 官方文档]
     [搜索社区最佳实践]
     [整理调研结果]
     
     general-purpose 代理返回：
     
     ## React Server Components 调研报告
     
     ### 1. 核心概念
     - RSC 在服务器端渲染，不发送到客户端
     - 可以访问数据库、文件系统等服务器资源
     - 支持 async/await
     
     ### 2. 最佳实践
     - 将数据获取逻辑放在 Server Component 中
     - Client Component 通过 props 接收数据
     - 使用 Suspense 处理加载状态
     - 避免在 Server Component 中使用 useState/useEffect
     
     ### 3. 代码示例
     ```tsx
     // Server Component
     async function UserList() {
       const users = await db.user.findMany()
       return <div>{users.map(u => <UserCard user={u} />)}</div>
     }
     ```
     
     ### 4. 常见陷阱
     - 不能在 Server Component 中使用浏览器 API
     - 不能在 Server Component 中使用 Context
     - 序列化限制：props 必须是可序列化的
     
     ### 5. 推荐资源
     - React 官方文档：https://react.dev/reference/rsc/server-components
     - Next.js 文档：https://nextjs.org/docs/app/building-your-application/rendering/server-components
```
