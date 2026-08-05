---

# 第八十一部分：API 令牌与密钥管理

## 81.1 API 密钥存储位置

| 位置 | 说明 | 优先级 |
|------|------|--------|
| 环境变量 | `ANTHROPIC_API_KEY` 等 | 最高 |
| `~/.doge/.claude.json` | 全局配置文件 | 中 |
| `.doge/models.json` | 项目配置文件 | 低 |
| `.env` 文件 | 环境变量文件 | 最低 |

## 81.2 密钥管理最佳实践

```cmd
:: 方式 1：环境变量（推荐）
set ANTHROPIC_API_KEY=sk-ant-xxx
set OPENAI_API_KEY=sk-xxx

:: 方式 2：配置文件
:: 编辑 ~/.doge/.claude.json
{
  "apiKey": "sk-ant-xxx",
  "baseUrl": "https://api.anthropic.com"
}

:: 方式 3：项目配置
:: 编辑 .doge/models.json
{
  "models": [{
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.anthropic.com"
  }]
}
```

## 81.3 密钥轮换

```cmd
:: 1. 备份旧密钥
echo %ANTHROPIC_API_KEY% > api-key-backup.txt

:: 2. 设置新密钥
set ANTHROPIC_API_KEY=sk-ant-new-key

:: 3. 验证新密钥
> /diagnose

:: 4. 删除旧密钥备份
del api-key-backup.txt
```

## 81.4 多密钥管理

```cmd
:: 为不同项目使用不同密钥
:: 项目 A
set ANTHROPIC_API_KEY=sk-ant-project-a

:: 项目 B
set ANTHROPIC_API_KEY=sk-ant-project-b

:: 或使用 .env 文件
:: .env.project-a
ANTHROPIC_API_KEY=sk-ant-project-a

:: .env.project-b
ANTHROPIC_API_KEY=sk-ant-project-b
```

---

# 第八十二部分：高级调试技巧

## 82.1 工具调用调试

```
:: 查看工具调用日志
/debug-tool-call

:: 查看最近 10 次工具调用
/debug-tool-call --limit 10

:: 查看特定工具的调用
/debug-tool-call --tool BashTool

:: 查看失败的工具调用
/debug-tool-call --status error
```

## 82.2 引擎状态调试

```
:: 查看引擎状态
/engine status

:: 查看消息循环状态
/engine messages

:: 查看工具调度状态
/engine scheduler

:: 查看 Token 预算
/engine budget
```

## 82.3 代理调试

```
:: 查看代理状态
/agents status

:: 查看子代理状态
/agents subagents

:: 查看代理统计
/agents stats

:: 调试特定代理
/agents debug critic
```

## 82.4 Hook 调试

```
:: 查看 Hook 状态
/hooks status

:: 测试 Hook
/hooks test PostToolUse

:: 查看 Hook 日志
/hooks logs

:: 禁用 Hook
/hooks disable PostToolUse

:: 启用 Hook
/hooks enable PostToolUse
```

## 82.5 性能分析

```
:: 查看性能统计
/performance

:: 查看 Token 消耗
/cost

:: 查看工具使用统计
/stats

:: 查看系统资源
/monitor

:: 导出诊断信息
/diagnose --export
```

---

# 第八十三部分：高级工作流编排

## 83.1 自定义工作流创建

```
:: 创建自定义工作流
/workflows create my-workflow

:: 添加步骤
/workflows add-step my-workflow --command "/review"
/workflows add-step my-workflow --command "/test-gen"
/workflows add-step my-workflow --command "/commit"

:: 配置步骤依赖
/workflows set-dependency my-workflow --step 2 --depends-on 1
/workflows set-dependency my-workflow --step 3 --depends-on 2

:: 运行工作流
/workflows run my-workflow

:: 查看工作流状态
/workflows status my-workflow

:: 列出所有工作流
/workflows list
```

## 83.2 工作流示例：发布流程

```
:: 创建发布工作流
/workflows create release

:: 添加步骤
/workflows add-step release --command "/test-run" --name "运行测试"
/workflows add-step release --command "/security-audit" --name "安全扫描"
/workflows add-step release --command "/review" --name "代码审查"
/workflows add-step release --command "/commit" --name "提交代码"
/workflows add-step release --command "git tag v1.0.0" --name "打标签"
/workflows add-step release --command "git push --tags" --name "推送标签"

:: 运行发布工作流
/workflows run release

:: 输出
[1/6] 运行测试... ✅ 45/45 通过
[2/6] 安全扫描... ✅ 0 个漏洞
[3/6] 代码审查... ✅ 通过
[4/6] 提交代码... ✅ 已提交：abc1234
[5/6] 打标签... ✅ v1.0.0
[6/6] 推送标签... ✅ 已推送

✅ 发布工作流完成！
```

## 83.3 工作流示例：Bug 修复流程

```
:: 创建 Bug 修复工作流
/workflows create bugfix

:: 添加步骤
/workflows add-step bugfix --agent "debug-expert" --name "定位问题"
/workflows add-step bugfix --command "/refactor" --name "修复问题"
/workflows add-step bugfix --command "/test-gen" --name "生成测试"
/workflows add-step bugfix --command "/review" --name "审查修复"
/workflows add-step bugfix --command "/commit" --name "提交修复"

:: 运行 Bug 修复工作流
/workflows run bugfix

:: 输出
[1/5] 定位问题... ✅ 定位到 src/auth/login.ts:42
[2/5] 修复问题... ✅ 已修复
[3/5] 生成测试... ✅ 3 个测试用例
[4/5] 审查修复... ✅ 通过
[5/5] 提交修复... ✅ 已提交：def5678

✅ Bug 修复工作流完成！
```

---

# 第八十四部分：团队协作指南

## 84.1 共享规则

```
:: 创建团队规则
/rules init
/rules add 使用 TypeScript 严格模式
/rules add API 使用 RESTful 规范
/rules add 提交前必须运行测试
/rules add 代码审查必须通过

:: 提交规则到 Git
git add .dogerules
git commit -m "添加团队规则"

:: 其他成员拉取
git pull
```

## 84.2 共享技能

```
:: 创建团队技能
/skills create team-review

:: 配置技能
:: 编辑 .claudeskills/team-review/SKILL.md

:: 提交技能到 Git
git add .claudeskills/team-review/
git commit -m "添加团队审查技能"

:: 其他成员拉取
git pull
```

## 84.3 共享配置

```
:: 导出配置
/config export

:: 提交配置到 Git
git add .doge/settings.json
git commit -m "添加团队配置"

:: 其他成员拉取
git pull

:: 导入配置
/config import
```

## 84.4 代码审查流程

```
:: 开发者提交 PR
/commit-push-pr

:: 审查者审查
/pr-review

:: 使用 critic 代理深度审查
> 使用 critic 代理审查这个 PR

:: 自动修复审查意见
/autofix-pr

:: 合并 PR
git merge
```

## 84.5 团队代理使用

```
:: 使用团队专用代理
/cs:fullstack-review    ← 全栈审查
/cs:frontend-review     ← 前端审查
/cs:backend-review      ← 后端审查

:: 自定义团队代理
/agents create team-reviewer
/agents config team-reviewer --skills code-review
/agents config team-reviewer --model sonnet
```

---

# 第八十五部分：安全与合规

## 85.1 安全检查清单

```
□ API Key 未硬编码在代码中
□ .gitignore 包含 .doge/ 目录
□ 敏感文件未提交到 Git
□ 权限配置合理
□ Hook 配置安全
□ MCP 服务器来源可信
□ 插件来源可信
□ 定期轮换 API Key
```

## 85.2 安全扫描

```
:: 全面安全扫描
/security-audit

:: 快速扫描
/audit

:: SAST 扫描
/sast

:: 依赖安全扫描
> 使用 security-auditor 代理扫描依赖

:: 输出示例
🔴 Critical: 2
  - SQL 注入风险 (src/api/users.ts:23)
  - 硬编码密钥 (src/config.ts:15)

🟠 Major: 3
  - 缺少输入验证 (src/api/auth.ts:45)
  - 缺少错误处理 (src/api/posts.ts:30)
  - 缺少频率限制 (src/api/login.ts:12)

🟡 Minor: 5
  - 缺少日志 (src/utils/api.ts:42)
  - 魔法数字 (src/constants.ts:8)
```

## 85.3 数据保护

```
:: 导出个人数据
/export

:: 删除个人数据
/project-purge

:: 查看隐私设置
/privacy-settings

:: 配置数据收集
/config set analytics.enabled false
```

## 85.4 审计日志

```
:: 查看审计日志
/logs --type audit

:: 查看工具使用日志
/logs --type tool

:: 查看命令执行日志
/logs --type command

:: 导出审计日志
/logs export --type audit --output audit-log.json
```

---

# 第八十六部分：故障排除完整指南

## 86.1 启动问题

### 问题：Bun 未找到

```cmd
:: 症状
'bun' is not recognized as an internal or external command

:: 解决方案
curl -fsSL https://bun.sh/install | bash
set PATH=%USERPROFILE%\.bun\bin;%PATH%

:: 验证
bun --version
```

### 问题：API Key 无效

```cmd
:: 症状
Error: Invalid API key

:: 解决方案
:: 检查 API Key
echo %ANTHROPIC_API_KEY%

:: 重新配置
/login

:: 验证
/diagnose
```

### 问题：模型不可用

```cmd
:: 症状
Error: Model not found

:: 解决方案
:: 检查模型配置
/model

:: 切换到可用模型
/model claude-sonnet-4-6

:: 验证
> 你好
```

### 问题：端口被占用

```cmd
:: 症状
Error: Port 3456 already in use

:: 解决方案
:: 查找占用端口的进程
netstat -ano | findstr 3456

:: 结束进程
taskkill /PID <pid> /F

:: 或使用其他端口
set PORT=3457
/dashboard
```

## 86.2 运行时问题

### 问题：Token 超限

```
:: 症状
Error: Context length exceeded

:: 解决方案
/compact              ← 压缩上下文
/clear                ← 清空会话
/context              ← 查看使用量

:: 预防
:: 分阶段完成任务
:: 及时 /clear
:: 使用 /compact
```

### 问题：工具执行失败

```
:: 症状
Tool execution failed

:: 解决方案
:: 检查权限
/permissions

:: 查看工具日志
/debug-tool-call --status error

:: 检查命令
/logs

:: 重试
> 再试一次
```

### 问题：会话卡住

```
:: 症状
AI 没有响应

:: 解决方案
Ctrl+C                ← 中断当前操作
/clear                ← 重新开始

:: 预防
:: 避免过于复杂的任务
:: 分阶段完成
```

### 问题：子代理失败

```
:: 症状
Subagent failed

:: 解决方案
:: 检查子代理状态
/agents subagents

:: 查看子代理日志
/logs --type agent

:: 重试
> 使用 general-purpose 代理重新执行
```

## 86.3 桌面端问题

### 问题：桌面端无法启动

```cmd
:: 症状
Electron failed to start

:: 解决方案
cd desktop
rm -rf node_modules
npm install
node scripts/dev.mjs
```

### 问题：桌面端白屏

```cmd
:: 症状
White screen on startup

:: 解决方案
:: 清理缓存
rm -rf ~/Library/Application\ Support/doge-code/

:: 重新构建
cd desktop
node scripts/build-vite.mjs
node scripts/dev.mjs
```

### 问题：IPC 通信失败

```cmd
:: 症状
IPC communication failed

:: 解决方案
:: 重启桌面端
:: 检查主进程日志
cat desktop/electron_err.log

:: 重新构建
cd desktop
node scripts/build-vite.mjs
```

## 86.4 网络问题

### 问题：API 连接超时

```cmd
:: 症状
Error: Connection timeout

:: 解决方案
:: 检查网络
ping api.anthropic.com

:: 使用代理
set HTTPS_PROXY=http://localhost:7890

:: 增加超时
set CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=300000
```

### 问题：WebSocket 连接失败

```cmd
:: 症状
WebSocket connection failed

:: 解决方案
:: 检查端口
netstat -ano | findstr 8080

:: 重启服务
/remote-setup
```

---

# 第八十七部分：命令深度使用

## 87.1 /review 命令深度使用

```
:: 示例 1：基本代码审查
> /review
→ AI 执行 git diff HEAD~1
→ 分析变更内容
→ 输出审查报告

:: 示例 2：审查特定文件
> /review src/auth/login.ts
→ AI 只审查指定文件
→ 输出该文件的审查报告

:: 示例 3：深度审查
> /review --depth deep
→ AI 进行更深入的分析
→ 包括安全、性能、可维护性、可访问性

:: 示例 4：审查并自动修复
> /review --fix
→ AI 审查代码
→ 自动修复发现的问题
→ 输出修复报告

:: 示例 5：使用代理审查
> /review --agent critic
→ AI 启动 critic 代理
→ 代理进行深度审查
→ 返回详细审查报告

:: 示例 6：审查 PR
> /review --pr 123
→ AI 获取 PR 123 的内容
→ 审查 PR 代码
→ 输出审查意见
```

## 87.2 /commit 命令深度使用

```
:: 示例 1：基本提交
> /commit
→ AI 分析 git diff
→ 生成 commit message
→ 执行 git commit

:: 示例 2：带说明的提交
> /commit -m "修复用户登录 bug"
→ AI 使用用户提供的说明
→ 执行 git commit -m "修复用户登录 bug"

:: 示例 3：提交并推送
> /commit --push
→ AI 执行 git commit
→ 执行 git push origin main

:: 示例 4：提交并创建 PR
> /commit --pr
→ AI 执行 git commit
→ 执行 git push
→ 创建 Pull Request

:: 示例 5：提交特定文件
> /commit src/auth/login.ts
→ AI 只提交指定文件
→ 生成针对该文件的 commit message

:: 示例 6：提交并打标签
> /commit --tag v1.0.0
→ AI 执行 git commit
→ 执行 git tag v1.0.0
→ 推送标签
```

## 87.3 /test-gen 命令深度使用

```
:: 示例 1：为整个项目生成测试
> /test-gen
→ AI 查找所有未测试的函数
→ 生成测试文件
→ 运行测试

:: 示例 2：为特定文件生成测试
> /test-gen src/services/UserService.ts
→ AI 分析 UserService 的方法
→ 生成对应的测试

:: 示例 3：生成集成测试
> /test-gen --type integration
→ AI 生成集成测试
→ 测试模块间的交互

:: 示例 4：生成 E2E 测试
> /test-gen --type e2e
→ AI 生成端到端测试
→ 模拟用户操作流程

:: 示例 5：生成测试并运行
> /test-gen --run
→ AI 生成测试
→ 自动运行测试
→ 输出测试结果

:: 示例 6：生成测试并修复
> /test-gen --fix
→ AI 生成测试
→ 运行测试
→ 自动修复失败的测试
```

## 87.4 /refactor 命令深度使用

```
:: 示例 1：重构单个文件
> /refactor src/services/UserService.ts
→ AI 分析代码结构
→ 提出重构建议
→ 执行重构

:: 示例 2：提取函数
> /refactor --extract-function
→ AI 查找长函数
→ 拆分成多个小函数
→ 验证重构不影响功能

:: 示例 3：重命名
> /refactor --rename "userName:username"
→ AI 查找所有 userName
→ 替换为 username
→ 验证类型检查通过

:: 示例 4：类型修复
> /refactor --fix-types
→ AI 运行 tsc 检查类型错误
→ 修复所有类型错误
→ 验证类型检查通过

:: 示例 5：架构重构
> /refactor --architecture "MVC:Clean Architecture"
→ AI 制定重构计划
→ 分阶段执行重构
→ 验证每阶段不影响功能

:: 示例 6：性能优化
> /refactor --performance
→ AI 查找性能瓶颈
→ 优化算法和数据结构
→ 验证性能提升
```

## 87.5 /security-audit 命令深度使用

```
:: 示例 1：全面扫描
> /security-audit
→ AI 扫描所有文件
→ 检测 SQL 注入、XSS、命令注入等
→ 输出漏洞报告

:: 示例 2：扫描特定目录
> /security-audit src/auth/
→ AI 只扫描指定目录
→ 输出该目录的漏洞报告

:: 示例 3：快速扫描
> /audit
→ AI 执行快速安全扫描
→ 只检查最常见漏洞

:: 示例 4：深度扫描
> /security-audit --depth deep
→ AI 进行深度安全扫描
→ 包括业务逻辑漏洞

:: 示例 5：扫描并修复
> /security-audit --fix
→ AI 扫描漏洞
→ 自动修复发现的问题
→ 输出修复报告

:: 示例 6：使用代理扫描
> /security-audit --agent security-auditor
→ AI 启动 security-auditor 代理
→ 代理进行深度安全分析
→ 返回详细安全报告
```

---

# 第八十八部分：工具链深度整合

## 88.1 BashTool + FileReadTool + FileEditTool 组合

### 场景：修复一个复杂的 bug

```
:: 步骤 1：读取错误日志
> 读取最新的错误日志
AI 调用 FileReadTool: file_path="logs/error.log"
→ 返回错误信息：
  TypeError: Cannot read property 'name' of undefined
  at UserService.getUserById (src/services/UserService.ts:42)

:: 步骤 2：读取问题文件
> 读取 UserService.ts
AI 调用 FileReadTool: file_path="src/services/UserService.ts"
→ 返回文件内容，第 42 行：
  const user = await prisma.user.findUnique({ where: { id: userId } })
  return user.name  // ← user 可能为 undefined

:: 步骤 3：分析问题
> 分析这个错误
AI 分析：
  - user 可能为 undefined
  - 缺少空值检查
  - 需要添加错误处理

:: 步骤 4：修复问题
> 修复这个 bug
AI 调用 FileEditTool:
  old_string="const user = await prisma.user.findUnique({ where: { id: userId } })
  return user.name"
  new_string="const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  return user.name"

:: 步骤 5：验证修复
> 运行测试验证
AI 调用 BashTool: command="npm test tests/services/UserService.test.ts"
→ 测试通过

:: 步骤 6：提交修复
> /commit
AI 调用 BashTool: git add src/services/UserService.ts
AI 调用 BashTool: git commit -m "fix: 修复 UserService.getUserById 空值检查"
```

## 88.2 GrepTool + GlobTool + AgentTool 组合

### 场景：重构项目中的重复代码

```
:: 步骤 1：查找重复代码
> 搜索项目中所有重复的 API 调用代码
AI 调用 GrepTool: pattern="fetch\(['\"]/api/"
→ 找到 15 处重复的 fetch 调用

:: 步骤 2：查找相关文件
> 查找所有 API 相关文件
AI 调用 GlobTool: pattern="**/api/**/*.ts"
→ 找到 8 个 API 文件

:: 步骤 3：启动重构代理
> 使用 refactor-cleaner 代理重构这些重复代码
AI 调用 AgentTool({
  description: "重构重复代码",
  prompt: "提取重复的 fetch 调用为公共 API 客户端",
  subagent_type: "refactor-cleaner"
})

:: 步骤 4：代理执行重构
[refactor-cleaner 代理]
→ 读取所有重复代码
→ 提取公共 API 客户端
→ 替换所有重复调用
→ 运行测试验证

:: 步骤 5：验证结果
> 运行所有测试
AI 调用 BashTool: command="npm test"
→ ✅ 45/45 通过
```

## 88.3 WebFetchTool + FileWriteTool + BashTool 组合

### 场景：集成第三方 API

```
:: 步骤 1：获取 API 文档
> 获取 Stripe API 文档
AI 调用 WebFetchTool: url="https://stripe.com/docs/api"
→ 返回 API 文档内容

:: 步骤 2：生成客户端代码
> 根据文档生成 TypeScript 客户端
AI 调用 FileWriteTool: file_path="src/lib/stripe-client.ts"
→ 生成类型安全的 Stripe 客户端

:: 步骤 3：安装依赖
> 安装 Stripe SDK
AI 调用 BashTool: command="npm install stripe"

:: 步骤 4：生成使用示例
> 生成使用示例
AI 调用 FileWriteTool: file_path="src/examples/stripe-example.ts"
→ 生成使用示例代码

:: 步骤 5：运行示例
> 运行示例验证
AI 调用 BashTool: command="npx ts-node src/examples/stripe-example.ts"
→ 示例运行成功
```

## 88.4 DatabaseTool + FileReadTool + AgentTool 组合

### 场景：数据库迁移

```
:: 步骤 1：查看当前数据库结构
> 查看当前数据库的表
AI 调用 DatabaseTool: operation="query", sql="SELECT table_name FROM information_schema.tables"
→ 返回表列表

:: 步骤 2：读取 Prisma Schema
> 读取 prisma/schema.prisma
AI 调用 FileReadTool: file_path="prisma/schema.prisma"
→ 返回当前 Schema

:: 步骤 3：启动数据库迁移代理
> 使用 database-reviewer 代理设计迁移方案
AI 调用 AgentTool({
  description: "数据库迁移",
  prompt: "设计从 v1 到 v2 的数据库迁移方案",
  subagent_type: "database-reviewer"
})

:: 步骤 4：执行迁移
> 执行迁移
AI 调用 BashTool: command="npx prisma migrate dev --name v2"
→ 迁移成功

:: 步骤 5：验证迁移
> 验证数据库结构
AI 调用 DatabaseTool: operation="query", sql="SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
→ 返回新的表结构
```

## 88.5 MonitorTool + MetricsTool + CacheTool 组合

### 场景：性能监控和优化

```
:: 步骤 1：查看系统状态
> /monitor
AI 调用 MonitorTool: target="health"
→ 返回系统健康状态

:: 步骤 2：收集性能指标
> 收集最近 1 小时的性能指标
AI 调用 MetricsTool: metric="request_duration", period="1h"
→ 返回性能数据

:: 步骤 3：查看缓存命中率
> 查看缓存命中率
AI 调用 CacheTool: action="stats"
→ 返回缓存统计

:: 步骤 4：分析瓶颈
> 分析性能瓶颈
AI 分析：
  - API 响应时间：平均 200ms，P99 500ms
  - 缓存命中率：85%
  - 数据库查询：平均 50ms
  - 瓶颈：数据库查询

:: 步骤 5：优化建议
> 提供优化建议
AI 建议：
  - 添加数据库索引
  - 优化慢查询
  - 增加缓存层
```

---

# 第八十九部分：高级代理模式

## 89.1 代理链模式

### 场景：复杂功能的端到端开发

```
:: 代理链：规划 → 设计 → 实现 → 测试 → 审查 → 文档

:: 步骤 1：规划代理
> 使用 planner 代理制定开发计划
[planner 代理]
→ 分析需求
→ 制定开发计划
→ 输出：分 5 个阶段，每个阶段的具体任务

:: 步骤 2：设计代理
> 使用 architect 代理设计系统架构
[architect 代理]
→ 设计数据模型
→ 设计 API 接口
→ 设计前端组件
→ 输出：架构设计文档

:: 步骤 3：实现代理
> 使用 general-purpose 代理实现功能
[general-purpose 代理]
→ 按照架构设计实现代码
→ 输出：完整的功能代码

:: 步骤 4：测试代理
> 使用 test-engineer 代理编写测试
[test-engineer 代理]
→ 编写单元测试
→ 编写集成测试
→ 运行测试
→ 输出：测试报告和覆盖率

:: 步骤 5：审查代理
> 使用 critic 代理审查代码
[critic 代理]
→ 审查代码质量
→ 审查安全问题
→ 输出：审查报告

:: 步骤 6：文档代理
> 使用 document-specialist 代理生成文档
[document-specialist 代理]
→ 生成 API 文档
→ 生成使用指南
→ 输出：完整文档
```

## 89.2 代理网格模式

### 场景：大型项目的并行开发

```
:: 代理网格：多个代理同时工作，各自负责不同模块

:: 启动代理网格
> 启动以下代理网格：
  - frontend-engineer：负责前端组件
  - backend-engineer：负责后端 API
  - database-reviewer：负责数据库设计
  - test-engineer：负责测试
  - security-auditor：负责安全

:: 执行流程
[frontend-engineer] ──┐
[backend-engineer]  ──┼→ 并行执行
[database-reviewer] ──┤
[test-engineer]     ──┤
[security-auditor]  ──┘
      ↓
  汇总结果
      ↓
  集成测试
      ↓
  部署

:: 结果汇总
前端：15 个组件，全部通过测试
后端：10 个 API，全部通过测试
数据库：5 个表，结构优化
测试：85% 覆盖率
安全：0 个漏洞
```

## 89.3 代理递归模式

### 场景：复杂问题的逐步分解

```
:: 代理递归：主代理启动子代理，子代理启动孙代理

:: 主代理
> 使用 architect 代理设计系统架构
[architect 代理]
→ 设计整体架构
→ 识别子系统的依赖关系
→ 启动子代理设计子系统

:: 子代理 1
[backend-engineer 代理]
→ 设计后端架构
→ 识别数据库需求
→ 启动孙代理设计数据库

:: 孙代理 1
[database-reviewer 代理]
→ 设计数据库模型
→ 优化查询性能
→ 返回数据库设计

:: 子代理 2
[frontend-engineer 代理]
→ 设计前端架构
→ 识别组件需求
→ 启动孙代理设计组件

:: 孙代理 2
[component-designer 代理]
→ 设计组件结构
→ 优化渲染性能
→ 返回组件设计

:: 结果汇总
architect 代理汇总所有子代理的结果
→ 输出完整的系统设计文档
```

## 89.4 代理协商模式

### 场景：多方代理协商最佳方案

```
:: 代理协商：多个代理讨论最佳方案

:: 启动协商
> 启动代理协商，讨论最佳的数据存储方案

:: 代理 1：关系型数据库
[database-reviewer 代理]
→ 推荐 PostgreSQL
→ 理由：ACID 事务、复杂查询、成熟稳定

:: 代理 2：NoSQL 数据库
[mongo-expert 代理]
→ 推荐 MongoDB
→ 理由：灵活 schema、水平扩展、快速迭代

:: 代理 3：缓存方案
[redis-expert 代理]
→ 推荐 Redis + PostgreSQL
→ 理由：热数据缓存、提高读取性能

:: 协商结果
→ 最终方案：PostgreSQL + Redis
→ 理由：兼顾事务一致性和读取性能
```

## 89.5 代理竞争模式

### 场景：多个代理竞争最佳解决方案

```
:: 代理竞争：多个代理提出不同方案，选择最佳

:: 启动竞争
> 使用 3 个代理分别提出排序算法方案

:: 代理 1：快速排序
[algorithm-expert 代理]
→ 提出快速排序方案
→ 时间复杂度：O(n log n)
→ 空间复杂度：O(log n)

:: 代理 2：归并排序
[algorithm-expert 代理]
→ 提出归并排序方案
→ 时间复杂度：O(n log n)
→ 空间复杂度：O(n)

:: 代理 3：堆排序
[algorithm-expert 代理]
→ 提出堆排序方案
→ 时间复杂度：O(n log n)
→ 空间复杂度：O(1)

:: 竞争结果
→ 选择：快速排序
→ 理由：平均性能最好，空间效率高
```

---

# 第九十部分：高级 Hook 模式

## 90.1 条件 Hook 模式

```json
{
  "hooks": {
    "PostToolUse": [
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

:: 效果：只在 git commit 时触发测试和格式检查
```

## 90.2 链式 Hook 模式

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "FileWrite",
        "hooks": [
          { "type": "command", "command": "biome check --write $CLAUDE_FILE_PATH" },
          { "type": "command", "command": "npx tsc --noEmit" },
          { "type": "command", "command": "npm test -- --findRelatedTests $CLAUDE_FILE_PATH" }
        ]
      }
    ]
  }
}

:: 效果：文件写入后自动格式化、类型检查、运行相关测试
```

## 90.3 通知 Hook 模式

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "powershell -c (New-Object.Media.SoundPlayer 'C:\\Windows\\Media\\notify.wav').PlaySync()"
        }]
      },
      {
        "hooks": [{
          "type": "command",
          "command": "powershell -c New-BurntToastNotification -Text 'Doge Code', '任务完成'"
        }]
      }
    ]
  }
}

:: 效果：AI 完成后播放声音 + 显示桌面通知
```

## 90.4 日志 Hook 模式

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "echo \"$(date '+%Y-%m-%d %H:%M:%S') $CLAUDE_TOOL_NAME $CLAUDE_TOOL_STATUS $CLAUDE_TOOL_PARAMS\" >> ~/.doge/tool-usage.log"
        }]
      }
    ]
  }
}

:: 效果：记录所有工具调用到日志文件
```

## 90.5 安全 Hook 模式

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "if echo '$CLAUDE_COMMAND' | grep -qE 'rm -rf|sudo|chmod 777'; then echo '危险命令被阻止'; exit 1; fi"
        }]
      }
    ]
  }
}

:: 效果：阻止危险命令的执行
```

---

# 第九十一部分：MCP 服务器高级配置

## 91.1 自定义 MCP 服务器

### 创建自定义 MCP 服务器

```typescript
// mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const server = new Server(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// 定义工具
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'search_code',
      description: '搜索代码库',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          language: { type: 'string', description: '编程语言' }
        },
        required: ['query']
      }
    }
  ]
}))

// 执行工具
server.setRequestHandler('tools/call', async (request) => {
  if (request.params.name === 'search_code') {
    const { query, language } = request.params.arguments
    // 执行搜索逻辑
    const results = await searchCode(query, language)
    return { content: [{ type: 'text', text: JSON.stringify(results) }] }
  }
})

// 启动服务器
const transport = new StdioServerTransport()
await server.connect(transport)
```

### 配置自定义 MCP 服务器

```json
{
  "my-server": {
    "command": "npx",
    "args": ["tsx", "mcp-server.ts"],
    "env": {
      "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb"
    }
  }
}
```

## 91.2 MCP 服务器集群

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "DATABASE_URL": "postgresql://user:pass@localhost:5432/mydb" }
  },
  "redis": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-redis"],
    "env": { "REDIS_URL": "redis://localhost:6379" }
  },
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "ghp_xxx" }
  },
  "stripe": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-stripe"],
    "env": { "STRIPE_API_KEY": "sk_xxx" }
  }
}
```

## 91.3 MCP 工具使用示例

```
:: 使用 PostgreSQL MCP
> 查询用户表中的所有数据
AI 调用 MCPTool: server="postgres", tool="query", params={ sql: "SELECT * FROM users" }

:: 使用 Redis MCP
> 缓存用户数据
AI 调用 MCPTool: server="redis", tool="set", params={ key: "user:1", value: "{...}" }

:: 使用 GitHub MCP
> 创建 Issue
AI 调用 MCPTool: server="github", tool="create-issue", params={ title: "Bug: xxx", body: "..." }

:: 使用 Stripe MCP
> 创建支付
AI 调用 MCPTool: server="stripe", tool="create-payment", params={ amount: 100, currency: "usd" }
```

---

# 第九十二部分：性能优化高级技巧

## 92.1 Token 优化高级技巧

### 技巧 1：使用缩写和符号

```
❌ 低效：
"请帮我分析这个项目的结构，找出所有的问题，并提供详细的修复建议"

✅ 高效：
"分析项目结构，找出问题，提供修复建议"
```

### 技巧 2：分步骤请求

```
❌ 低效（一次请求包含多个任务）：
"帮我实现用户注册、登录、密码重置、权限管理、日志记录功能"

✅ 高效（分步骤）：
> 先实现用户注册
→ /clear
> 再实现登录
→ /clear
> 最后实现权限管理
```

### 技巧 3：使用上下文引用

```
❌ 低效（重复描述）：
"帮我写一个用户注册的 API，需要验证邮箱、密码强度、用户名唯一性"
"帮我写一个用户登录的 API，需要验证邮箱和密码"

✅ 高效（引用上下文）：
> 帮我写一个用户注册的 API，需要验证邮箱、密码强度、用户名唯一性
→ AI 生成注册 API
> 基于上面的注册 API，写一个登录 API
→ AI 引用之前的代码生成登录 API
```

### 技巧 4：限制输出范围

```
❌ 低效（无限制）：
"帮我分析这个 10000 行的项目"

✅ 高效（限制范围）：
"只分析 src/auth/ 目录的代码安全问题"
```

### 技巧 5：使用代理处理大量任务

```
❌ 低效（主代理处理）：
"帮我重构这个 50 个文件的项目"

✅ 高效（使用代理）：
> 使用 refactor-cleaner 代理重构这个项目
→ 代理独立处理，不占用主对话上下文
```

## 92.2 响应速度优化

### 技巧 1：使用本地模型

```cmd
set OPENAI_API_KEY=ollama
set OPENAI_BASE_URL=http://localhost:11434/v1
set OPENAI_MODEL=qwen2.5-coder:32b

:: 效果：响应速度 < 1s（vs 云端模型 3-5s）
```

### 技巧 2：使用并发子代理

```cmd
set CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=20

:: 效果：10 个任务并行执行，总耗时减少 80%
```

### 技巧 3：减少权限确认

```
/less-permission-prompts

:: 效果：减少 50% 的权限确认提示
```

### 技巧 4：使用缓存

```
:: AI 自动缓存：
- API 响应
- 文件内容
- 搜索结果

:: 手动清理缓存：
/cache clear
```

### 技巧 5：使用快速模式

```
/fast

:: 效果：使用更快的模型，响应速度提升 50%
```

## 92.3 内存和磁盘优化

### 技巧 1：定期清理会话

```
/clear              ← 清空当前会话
/compact            ← 压缩上下文
```

### 技巧 2：限制日志大小

```cmd
set LOG_LEVEL=warn   ← 只记录警告和错误
```

### 技巧 3：定期清理缓存

```
/cache clear        ← 清空缓存
/break-cache        ← 打破缓存
```

### 技巧 4：监控资源使用

```
/monitor            ← 查看系统资源
/stats              ← 查看使用统计
```

---

# 第九十三部分：安全高级技巧

## 93.1 密钥管理高级技巧

### 技巧 1：使用环境变量而非配置文件

```cmd
:: 推荐（环境变量）
set ANTHROPIC_API_KEY=sk-ant-xxx

:: 不推荐（配置文件）
:: { "apiKey": "sk-ant-xxx" }  ← 可能被误提交
```

### 技巧 2：使用 .env 文件

```cmd
:: .env 文件
echo ANTHROPIC_API_KEY=sk-ant-xxx >> .env
echo OPENAI_API_KEY=sk-xxx >> .env

:: .gitignore 排除 .env
echo .env >> .gitignore
```

### 技巧 3：定期轮换密钥

```cmd
:: 每月轮换
set ANTHROPIC_API_KEY=sk-ant-new-key

:: 验证新密钥
/diagnose
```

### 技巧 4：使用多密钥

```cmd
:: 不同项目使用不同密钥
set ANTHROPIC_API_KEY_PROJECT_A=sk-ant-a
set ANTHROPIC_API_KEY_PROJECT_B=sk-ant-b
```

### 技巧 5：使用密钥管理服务

```cmd
:: 使用 AWS Secrets Manager
set ANTHROPIC_API_KEY=$(aws secretsmanager get-secret-value --secret-id anthropic-api-key)
```

## 93.2 代码安全高级技巧

### 技巧 1：使用安全 Hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "if echo '$CLAUDE_COMMAND' | grep -qE 'rm -rf|sudo|chmod 777|curl.*|wget.*'; then echo '危险命令被阻止'; exit 1; fi"
        }]
      }
    ]
  }
}
```

### 技巧 2：定期安全扫描

```
:: 每天自动扫描
/schedule create --cron "0 9 * * *" --command "/security-audit"

:: 扫描并修复
/security-audit --fix
```

### 技巧 3：使用安全代理

```
> 使用 security-auditor 代理扫描代码
→ 代理进行深度安全分析
→ 输出详细安全报告
```

### 技巧 4：代码审查包含安全检查

```
> /review --security
→ AI 审查代码
→ 包含安全检查
→ 输出安全报告
```

### 技巧 5：使用依赖扫描

```
> 使用 security-auditor 代理扫描依赖
→ 检查已知漏洞
→ 输出依赖安全报告
```

## 93.3 数据安全高级技巧

### 技巧 1：不在对话中输入敏感信息

```
❌ 危险：
"我的密码是 xxx"
"我的 API Key 是 xxx"

✅ 安全：
"帮我配置 API Key" → 使用 /login 交互式配置
```

### 技巧 2：定期清理会话

```
/clear              ← 清除对话历史
/rewind             ← 回滚到指定轮次
```

### 技巧 3：使用隐私设置

```
/privacy-settings
→ 控制数据收集
→ 导出/删除个人数据
```

### 技巧 4：审计日志

```
/logs --type audit   ← 查看审计日志
/logs export         ← 导出审计日志
```

### 技巧 5：数据加密

```cmd
:: 使用加密存储
set CLAUDE_CODE_ENCRYPT_STORAGE=1
```

---

# 第九十四部分：团队协作高级技巧

## 94.1 共享规则高级技巧

### 技巧 1：分层规则

```
:: 全局规则（~/.dogerules）
- 使用 TypeScript 严格模式
- 提交前必须运行测试

:: 项目规则（./.dogerules）
- 使用 React 19
- 使用 Prisma ORM

:: 本地规则（./dogerules.local）
- 使用 4 空格缩进（个人偏好）
```

### 技巧 2：规则版本控制

```cmd
:: 提交规则到 Git
git add .dogerules
git commit -m "更新团队规则"

:: 其他成员拉取
git pull
```

### 技巧 3：规则模板

```markdown
# 团队规则模板

## 编码规范
- 代码风格：{style}
- 语言：{language}
- 框架：{framework}

## 项目约定
- API 规范：{api_style}
- 数据库：{database}
- 日志：{logger}

## 提交规范
- 提交前：{pre_commit}
- 提交格式：{commit_format}
```

## 94.2 代码审查高级技巧

### 技巧 1：自动化审查流程

```
:: 创建审查工作流
/workflows create code-review
/workflows add-step code-review --command "/review"
/workflows add-step code-review --command "/security-audit"
/workflows add-step code-review --command "/test-run"

:: 运行审查工作流
/workflows run code-review
```

### 技巧 2：使用代理审查

```
> 使用 critic 代理审查这个 PR
→ 代理进行深度审查
→ 输出详细审查报告
```

### 技巧 3：审查清单

```
:: 创建审查清单
/review --checklist
□ 代码风格
□ 安全问题
□ 性能问题
□ 测试覆盖率
□ 文档完整性
```

### 技巧 4：自动修复审查意见

```
/autofix-pr
→ AI 读取审查意见
→ 自动修复问题
→ 输出修复报告
```

### 技巧 5：审查报告

```
/review --output report.md
→ 生成 Markdown 格式审查报告
→ 保存到 report.md
```

## 94.3 知识共享高级技巧

### 技巧 1：使用记忆系统

```
:: 保存项目记忆
/memory save project-context "项目使用 React 19 + Prisma"

:: 搜索记忆
/memory search "React"

:: 删除记忆
/memory delete project-context
```

### 技巧 2：使用 Wiki

```
:: 创建 Wiki 页面
/wiki create "API 设计规范"

:: 编辑 Wiki 页面
/wiki edit "API 设计规范"

:: 搜索 Wiki
/wiki search "API"
```

### 技巧 3：使用笔记

```
:: 创建笔记
/note create "会议纪要"

:: 搜索笔记
/note search "会议"
```

### 技巧 4：使用标签

```
:: 创建标签
/tag create "重要"

:: 搜索标签
/tag search "重要"
```

### 技巧 5：使用书签

```
:: 创建书签
/bookmark create "有用的资源" "https://example.com"

:: 搜索书签
/bookmark search "资源"
```

---

# 第九十五部分：综合实战案例（高级）

## 95.1 案例：微服务架构迁移

### 项目背景

```
项目名称：电商平台
当前架构：单体应用（Next.js + Express + PostgreSQL）
目标架构：微服务（用户服务、商品服务、订单服务、支付服务）
迁移周期：2 周
```

### 迁移流程

```cmd
:: ========================================
:: 第 1 步：架构设计（1 天）
:: ========================================
> 使用 architect 代理设计微服务架构

:: architect 代理输出
## 微服务架构设计

### 服务拆分
1. 用户服务（user-service）
   - 注册、登录、权限管理
   - 数据库：user-db

2. 商品服务（product-service）
   - 商品管理、库存管理
   - 数据库：product-db

3. 订单服务（order-service）
   - 订单创建、订单查询
   - 数据库：order-db

4. 支付服务（payment-service）
   - 支付处理、退款
   - 数据库：payment-db

### 服务通信
- 同步：REST API
- 异步：RabbitMQ 消息队列

### 部署
- Docker 容器化
- Kubernetes 编排
- Istio 服务网格

:: ========================================
:: 第 2 步：并行开发（5 天）
:: ========================================
> 同时启动 4 个代理，分别实现 4 个微服务

:: 代理 1：用户服务
[user-service 代理]
→ 实现注册 API
→ 实现登录 API
→ 实现权限管理
→ 编写测试

:: 代理 2：商品服务
[product-service 代理]
→ 实现商品管理 API
→ 实现库存管理
→ 编写测试

:: 代理 3：订单服务
[order-service 代理]
→ 实现订单创建 API
→ 实现订单查询 API
→ 编写测试

:: 代理 4：支付服务
[payment-service 代理]
→ 实现支付处理 API
→ 实现退款 API
→ 编写测试

:: ========================================
:: 第 3 步：集成测试（2 天）
:: ========================================
> /test-gen --type integration
→ AI 生成集成测试
→ 测试服务间通信
→ 运行测试

:: ========================================
:: 第 4 步：容器化（1 天）
:: ========================================
> 为每个服务创建 Dockerfile

:: AI 执行
AI 调用 FileWriteTool: 创建 user-service/Dockerfile
AI 调用 FileWriteTool: 创建 product-service/Dockerfile
AI 调用 FileWriteTool: 创建 order-service/Dockerfile
AI 调用 FileWriteTool: 创建 payment-service/Dockerfile
AI 调用 FileWriteTool: 创建 docker-compose.yml
AI 调用 BashTool: docker-compose build

:: ========================================
:: 第 5 步：部署（2 天）
:: ========================================
> 使用 deployer 代理部署到 Kubernetes

:: deployer 代理执行
→ 创建 Kubernetes 配置
→ 部署到测试环境
→ 运行冒烟测试
→ 部署到生产环境
→ 配置监控和告警

:: ========================================
:: 完成！
:: ========================================
总耗时：2 周
服务数量：4 个
代码行数：+15000 行
测试覆盖率：90%
费用：约 $5
```

## 95.2 案例：AI 聊天机器人开发

### 项目背景

```
项目名称：AI 客服机器人
技术栈：Next.js + LangChain + Pinecone + OpenAI
功能：智能问答、多轮对话、知识库检索
开发时间：3 天
```

### 开发流程

```cmd
:: ========================================
:: 第 1 步：知识库构建（1 天）
:: ========================================
> 使用 general-purpose 代理构建知识库

:: AI 执行
AI 调用 WebFetchTool: 获取产品文档
AI 调用 FileWriteTool: 创建知识库文件
AI 调用 BashTool: 运行嵌入脚本
→ 将文档转换为向量存储到 Pinecone

:: ========================================
:: 第 2 步：对话引擎开发（1 天）
:: ========================================
> 使用 general-purpose 代理开发对话引擎

:: AI 执行
AI 调用 FileWriteTool: 创建 lib/chat-engine.ts
AI 调用 FileWriteTool: 创建 lib/retrieval.ts
AI 调用 FileWriteTool: 创建 lib/prompt-template.ts
AI 调用 BashTool: npx tsc --noEmit
✅ 类型检查通过

:: ========================================
:: 第 3 步：前端开发（0.5 天）
:: ========================================
> 使用 frontend-engineer 代理开发聊天界面

:: AI 执行
AI 调用 FileWriteTool: 创建 app/chat/page.tsx
AI 调用 FileWriteTool: 创建 components/ChatWindow.tsx
AI 调用 FileWriteTool: 创建 components/MessageBubble.tsx
AI 调用 BashTool: npx tsc --noEmit
✅ 类型检查通过

:: ========================================
:: 第 4 步：测试部署（0.5 天）
:: ========================================
> /test-gen
→ AI 生成测试
→ 运行测试
→ 部署到 Vercel

:: ========================================
:: 完成！
:: ========================================
总耗时：3 天
代码行数：+2000 行
测试覆盖率：85%
费用：约 $2
```

## 95.3 案例：数据管道构建

### 项目背景

```
项目名称：实时数据管道
技术栈：Apache Kafka + Apache Flink + PostgreSQL + Redis
功能：实时数据采集、处理、存储、可视化
开发时间：1 周
```

### 开发流程

```cmd
:: ========================================
:: 第 1 步：数据采集（2 天）
:: ========================================
> 使用 general-purpose 代理开发数据采集器

:: AI 执行
AI 调用 FileWriteTool: 创建 collectors/base.ts
AI 调用 FileWriteTool: 创建 collectors/api-collector.ts
AI 调用 FileWriteTool: 创建 collectors/db-collector.ts
AI 调用 BashTool: npm test

:: ========================================
:: 第 2 步：数据处理（2 天）
:: ========================================
> 使用 general-purpose 代理开发数据处理引擎

:: AI 执行
AI 调用 FileWriteTool: 创建 processors/base.ts
AI 调用 FileWriteTool: 创建 processors/transform.ts
AI 调用 FileWriteTool: 创建 processors/aggregate.ts
AI 调用 BashTool: npm test

:: ========================================
:: 第 3 步：数据存储（1 天）
:: ========================================
> 使用 general-purpose 代理开发数据存储层

:: AI 执行
AI 调用 FileWriteTool: 创建 storage/postgres.ts
AI 调用 FileWriteTool: 创建 storage/redis.ts
AI 调用 BashTool: npm test

:: ========================================
:: 第 4 步：可视化（1 天）
:: ========================================
> 使用 frontend-engineer 代理开发仪表盘

:: AI 执行
AI 调用 FileWriteTool: 创建 app/dashboard/page.tsx
AI 调用 FileWriteTool: 创建 components/Chart.tsx
AI 调用 FileWriteTool: 创建 components/DataTable.tsx
AI 调用 BashTool: npm test

:: ========================================
:: 第 5 步：部署（1 天）
:: ========================================
> 使用 deployer 代理部署

:: AI 执行
AI 调用 FileWriteTool: 创建 docker-compose.yml
AI 调用 FileWriteTool: 创建 kubernetes/ 配置
AI 调用 BashTool: docker-compose up -d
AI 调用 BashTool: kubectl apply -f kubernetes/

:: ========================================
:: 完成！
:: ========================================
总耗时：1 周
代码行数：+5000 行
测试覆盖率：80%
费用：约 $3
```
