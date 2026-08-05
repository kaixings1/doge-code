---

# 第五十七部分：宏定义与环境变量深度解析

## 57.1 宏定义（feature()）详解

### 什么是宏定义？

宏定义是编译时的代码替换机制。Doge Code 使用 `bun:bundle` 提供的 `feature()` 函数，在构建时根据功能标志移除不需要的代码。

### 详细示例

```typescript
// 示例 1：基本用法
import { feature } from 'bun:bundle'

if (feature('MY_FEATURE')) {
  // 只在 MY_FEATURE 启用时包含的代码
  const { MyFeature } = await import('./my-feature.ts')
  MyFeature.init()
}

// 示例 2：与条件导入结合
const myFeature =
  (feature('MY_FEATURE') || process.env['CLAUDE_CODE_FEATURE_MY_FEATURE'] === '1')
    ? safeRequire('./my-feature.js')?.default
    : null

// 示例 3：移除整个模块
// 当 MY_FEATURE 未启用时，整个 ./my-feature.ts 模块被移除
// 减小最终构建体积

// 示例 4：条件类型
type MyType = feature('MY_FEATURE') ? MyFeatureType : DefaultType

// 示例 5：条件导出
export const myFeature = feature('MY_FEATURE')
  ? { enabled: true, init: () => {} }
  : { enabled: false, init: () => {} }
```

### 宏定义的作用

1. **编译时优化**：未启用的功能不会包含在最终构建中
2. **减小体积**：移除死代码，减小可执行文件大小
3. **提高性能**：避免运行时的条件判断
4. **代码隔离**：不同功能的代码相互隔离
5. **安全控制**：敏感功能可以通过宏定义禁用

### 如何启用宏定义

```cmd
# 方式一：环境变量
set CLAUDE_CODE_FEATURE_PROACTIVE=1
set CLAUDE_CODE_FEATURE_KAIROS=1
set CLAUDE_CODE_FEATURE_VOICE_MODE=1

# 方式二：bunfig.toml
# [define]
# "process.env.CLAUDE_CODE_FEATURE_PROACTIVE" = "1"

# 方式三：构建命令
bun build --define process.env.CLAUDE_CODE_FEATURE_PROACTIVE=1
```

---

## 57.2 环境变量详解

### 什么是环境变量？

环境变量是操作系统中的键值对，用于配置应用程序的行为。Doge Code 使用环境变量控制模型认证、功能开关、性能参数等。

### 详细示例

```cmd
# 示例 1：配置 Anthropic API
set ANTHROPIC_API_KEY=sk-ant-xxx
set ANTHROPIC_BASE_URL=https://api.anthropic.com
set ANTHROPIC_MODEL=claude-sonnet-4-6

# 示例 2：配置 OpenAI 兼容接口
set OPENAI_API_KEY=sk-xxx
set OPENAI_BASE_URL=https://api.deepseek.com/v1
set OPENAI_MODEL=deepseek-chat

# 示例 3：配置功能标志
set CLAUDE_CODE_FEATURE_PROACTIVE=1
set CLAUDE_CODE_FEATURE_KAIROS=1
set CLAUDE_CODE_FEATURE_VOICE_MODE=1

# 示例 4：配置性能参数
set CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=50
set CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=5
set CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION=500

# 示例 5：配置 MCP
set CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=60000
set CLAUDE_CODE_PLUGIN_URL=https://example.com/plugin1,https://example.com/plugin2
```

### 环境变量优先级

```
1. 命令行参数（最高优先级）
2. 环境变量
3. 配置文件（.doge/.claude.json）
4. 默认值（最低优先级）
```

### 常用环境变量分类

#### 认证类
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
- `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`
- `ANTHROPIC_MODEL` / `OPENAI_MODEL`

#### 功能标志类
- `CLAUDE_CODE_FEATURE_PROACTIVE`
- `CLAUDE_CODE_FEATURE_KAIROS`
- `CLAUDE_CODE_FEATURE_BRIDGE_MODE`
- `CLAUDE_CODE_FEATURE_VOICE_MODE`
- `CLAUDE_CODE_FEATURE_ULTRAPLAN`
- `CLAUDE_CODE_FEATURE_TORCH`

#### 性能配置类
- `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`
- `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`
- `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`
- `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`

#### 其他
- `CLAUDE_CONFIG_DIR`
- `LOG_LEVEL`
- `NODE_ENV`
- `DOGE_API_JSON`
- `PORT`

---

# 第五十八部分：软件开发全流程整合指南

## 58.1 项目初始化阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 创建项目 | `BashTool` | mkdir + git init | `mkdir my-project && cd my-project && git init` |
| 配置上下文 | `/init` | AI 分析项目结构 | `/init` |
| 设置规则 | `/rules` | 创建持久化规则 | `/rules add 使用 TypeScript` |
| 配置模型 | `/login` | 配置 API Key | `/login` |
| 创建 CLAUDE.md | `FileWriteTool` | AI 生成项目上下文 | AI 自动生成 |

**工具配合流程：**
```
BashTool(mkdir) → BashTool(git init) → /init → FileWriteTool(CLAUDE.md) → /rules init
```

## 58.2 编码阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 编写代码 | `FileWriteTool` | 创建新文件 | AI 生成组件代码 |
| 修改代码 | `FileEditTool` | 精确修改 | 修复 bug、添加功能 |
| 搜索代码 | `GrepTool` + `GlobTool` | 查找代码 | 搜索函数调用 |
| 并行处理 | `AgentTool` | 启动子代理 | 同时实现多个模块 |
| 代码审查 | `/review` | AI 审查变更 | `/review` |

**工具配合流程：**
```
GlobTool(查找文件) → FileReadTool(读取代码) → GrepTool(搜索模式) → FileEditTool(修改) → BashTool(验证)
```

**代理协作：**
```
> 使用 general-purpose 代理实现后端 API
> 使用 critic 代理审查前端代码
→ AgentTool(general-purpose) + AgentTool(critic) 并行执行
```

## 58.3 测试阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 生成测试 | `/test-gen` | 自动生成测试 | `/test-gen` |
| 运行测试 | `/test-run` | 执行测试 | `/test-run` |
| 覆盖率 | `GrepTool` | 检查未测试代码 | 查找未覆盖的函数 |
| 修复测试 | `FileEditTool` | 修复失败测试 | 修改测试或代码 |
| 回归测试 | `AgentTool(test-engineer)` | 启动测试代理 | 专业测试设计 |

**工具配合流程：**
```
GrepTool(查找未测试函数) → FileWriteTool(生成测试) → BashTool(运行测试) → FileEditTool(修复)
```

## 58.4 审查阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 基本审查 | `/review` | AI 分析变更 | `/review` |
| 安全扫描 | `/security-audit` | 扫描安全漏洞 | `/security-audit` |
| 深度审查 | `AgentTool(critic)` | 启动审查代理 | 深度代码分析 |
| 代码健康 | `/code-health` | 健康度评分 | `/code-health` |
| PR 审查 | `/pr-review` | 审查 PR | `/pr-review` |

**工具配合流程：**
```
BashTool(git diff) → FileReadTool(读取变更) → GrepTool(搜索问题) → AgentTool(critic) → 输出审查报告
```

## 58.5 提交阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 生成提交信息 | `/commit` | AI 生成 commit message | `/commit` |
| 推送 PR | `/commit-push-pr` | 提交+推送+PR | `/commit-push-pr` |
| 审查 PR | `/pr-review` | 审查 PR | `/pr-review` |
| 管理评论 | `/pr_comments` | PR 评论管理 | `/pr_comments` |
| 自动修复 | `/autofix-pr` | 根据审查意见修复 | `/autofix-pr` |

**工具配合流程：**
```
BashTool(git diff) → AI 生成 commit message → BashTool(git commit) → BashTool(git push) → HttpTool(创建 PR)
```

## 58.6 调试阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 诊断 | `/diagnose` | 系统诊断 | `/diagnose` |
| 调试代理 | `AgentTool(debug-expert)` | 启动调试代理 | 定位 bug |
| 工具调试 | `/debug-tool-call` | 工具调用调试 | `/debug-tool-call` |
| 修复 | `FileEditTool` | 修改代码 | 修复错误 |
| 验证 | `BashTool` | 运行测试 | 验证修复 |

**工具配合流程：**
```
FileReadTool(读取错误日志) → GrepTool(搜索错误位置) → AgentTool(debug-expert) → FileEditTool(修复) → BashTool(验证)
```

## 58.7 部署阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 构建 | `BashTool` | 执行构建命令 | `npm run build` |
| Docker | `FileWriteTool` | 创建 Dockerfile | AI 生成容器配置 |
| 部署代理 | `AgentTool(deployer)` | 启动部署代理 | 自动化部署 |
| Kubernetes | `/k8s` | K8s 管理 | `/k8s` |
| 监控 | `/monitor` | 系统监控 | `/monitor` |

**工具配合流程：**
```
BashTool(npm run build) → FileWriteTool(Dockerfile) → AgentTool(deployer) → BashTool(部署命令) → MonitorTool(监控)
```

## 58.8 运维阶段

| 步骤 | 命令/工具 | 具体操作 | 示例 |
|------|-----------|----------|------|
| 监控 | `/monitor` | 系统监控 | `/monitor` |
| 仪表盘 | `/dashboard` | 用量仪表盘 | `/dashboard` |
| 日志 | `/logs` | 日志查看 | `/logs` |
| 性能 | `/performance` | 性能分析 | `/performance` |
| 费用 | `/cost` | 费用查看 | `/cost` |

**工具配合流程：**
```
MonitorTool(系统状态) → MetricsTool(性能指标) → Dashboard(可视化) → Logs(问题排查)
```

---

# 第五十九部分：智能体/子代理/工作流全方位整合

## 59.1 智能体（Agent）类型

### 自代理（Self-Agent）

**定义**：AI 自身作为代理，直接与用户交互。

**使用场景**：
```
# 示例 1：简单任务
> 帮我分析这个文件
→ AI 直接调用 FileReadTool 读取并分析

# 示例 2：代码生成
> 创建一个 React 组件
→ AI 直接调用 FileWriteTool 生成代码

# 示例 3：问题回答
> 什么是 React Server Components？
→ AI 直接回答，不需要工具

# 示例 4：简单重构
> 把这个函数改成箭头函数
→ AI 直接调用 FileEditTool 修改

# 示例 5：命令执行
> /review
→ AI 直接执行命令
```

### 子代理（Subagent）

**定义**：主代理启动的独立 AI 子进程，可以自主完成特定任务。

**使用场景**：
```
# 示例 1：并行处理
> 使用 general-purpose 代理实现后端 API
> 使用 critic 代理审查前端代码
→ 两个代理并行执行，提高效率

# 示例 2：复杂研究
> 使用 researcher 代理调研 React Server Components 最佳实践
→ 独立研究，不影响主对话

# 示例 3：代码审查
> 使用 critic 代理深度审查这次变更
→ 专业审查，提供详细报告

# 示例 4：调试
> 使用 debug-expert 代理定位这个 bug
→ 专业调试，快速定位问题

# 示例 5：测试
> 使用 test-engineer 代理编写测试
→ 专业测试设计，提高覆盖率
```

### 专用代理（Specialized Agent）

**定义**：预定义的专用代理，针对特定领域优化。

**使用场景**：
```
# 示例 1：全栈审查
> /cs:fullstack-review
→ 启动全栈审查代理，遍历 7 个强制问题

# 示例 2：前端审查
> /cs:frontend-review
→ 启动前端审查代理，检查性能、SEO、可访问性

# 示例 3：后端审查
> /cs:backend-review
→ 启动后端审查代理，检查性能、安全、可靠性

# 示例 4：安全审计
> 使用 security-auditor 代理扫描
→ 深度安全扫描，发现潜在漏洞

# 示例 5：部署
> 使用 deployer 代理部署到生产环境
→ 自动化部署，包括回滚策略
```

---

## 59.2 子代理协作模式

### 串行模式

```
规划代理 → 编码代理 → 审查代理 → 文档代理
```

**示例：**
```
> 使用 planner 代理制定项目计划
→ 等待完成
> 使用 general-purpose 代理实现功能
→ 等待完成
> 使用 critic 代理审查代码
→ 等待完成
> 使用 document-specialist 代理生成文档
```

### 并行模式

```
同时启动多个代理分别处理不同的模块
```

**示例：**
```
> 同时启动以下代理：
  - general-purpose 代理：实现后端 API
  - frontend-engineer 代理：实现前端组件
  - test-engineer 代理：编写测试
→ 所有代理并行执行
→ 汇总结果
```

### 层级模式

```
主代理 → 子代理 → 孙代理（最多 3 层）
```

**示例：**
```
> 使用 architect 代理设计系统架构（第 1 层）
  → architect 代理启动 backend-engineer 代理设计后端（第 2 层）
    → backend-engineer 代理启动 database-reviewer 代理审查数据库设计（第 3 层）
```

### 混合模式

```
串行 + 并行 的混合模式
```

**示例：**
```
> 1. 使用 planner 代理制定计划（串行）
> 2. 并行启动：
     - general-purpose 代理：实现后端
     - frontend-engineer 代理：实现前端
> 3. 使用 critic 代理审查所有代码（串行）
> 4. 使用 document-specialist 代理生成文档（串行）
```

---

## 59.3 工作流（Workflow）详解

### TDD 工作流

```
红（写失败测试）→ 绿（写代码通过测试）→ 重构（优化代码结构）
```

**详细示例：**
```
# 步骤 1：红 - 写失败测试
> 使用 TDD 方式实现用户注册功能
→ AI 调用 FileWriteTool 生成测试文件
→ AI 调用 BashTool 运行测试（失败）

# 步骤 2：绿 - 写代码通过测试
→ AI 调用 FileWriteTool 实现用户注册功能
→ AI 调用 BashTool 运行测试（通过）

# 步骤 3：重构 - 优化代码结构
→ AI 调用 GrepTool 查找重复代码
→ AI 调用 FileEditTool 重构代码
→ AI 调用 BashTool 运行测试（仍然通过）
```

### Git 工作流

```
修改代码 → AI 生成 commit message → 提交 → 推送 → 创建 PR
```

**详细示例：**
```
# 步骤 1：修改代码
> 修复用户登录 bug
→ AI 调用 FileEditTool 修改代码
→ AI 调用 BashTool 运行测试验证

# 步骤 2：生成 commit message
> /commit
→ AI 调用 BashTool(git diff) 分析变更
→ AI 生成规范的 commit message

# 步骤 3：提交
→ AI 调用 BashTool(git add + git commit)

# 步骤 4：推送 PR
> /commit-push-pr
→ AI 调用 BashTool(git push)
→ AI 调用 HttpTool 创建 PR
```

### 代码审查工作流

```
变更 → AI 审查 → 安全扫描 → 修复 → 再次审查
```

**详细示例：**
```
# 步骤 1：AI 审查
> /review
→ AI 调用 BashTool(git diff) 获取变更
→ AI 分析变更内容
→ 输出审查意见

# 步骤 2：安全扫描
> /security-audit
→ AI 调用 GrepTool 搜索危险模式
→ AI 调用 FileReadTool 读取代码
→ 输出安全报告

# 步骤 3：修复问题
> 修复审查中发现的问题
→ AI 调用 FileEditTool 修改代码
→ AI 调用 BashTool 运行测试

# 步骤 4：再次审查
> /review
→ AI 确认所有问题已修复
```

### 调试工作流

```
定位问题 → 分析原因 → 修复 → 验证 → 回归测试
```

**详细示例：**
```
# 步骤 1：定位问题
> 帮我分析这个错误
→ AI 调用 FileReadTool 读取错误日志
→ AI 调用 GrepTool 搜索错误位置

# 步骤 2：分析原因
> 使用 debug-expert 代理定位 bug
→ AI 调用 AgentTool(debug-expert)
→ 代理分析代码，定位根本原因

# 步骤 3：修复
> 修复这个 bug
→ AI 调用 FileEditTool 修改代码

# 步骤 4：验证
→ AI 调用 BashTool 运行测试
→ 确认问题已修复

# 步骤 5：回归测试
→ AI 调用 BashTool 运行所有测试
→ 确认没有引入新问题
```

### 部署工作流

```
构建 → 测试 → Docker 化 → 部署 → 监控
```

**详细示例：**
```
# 步骤 1：构建
> 构建生产版本
→ AI 调用 BashTool(npm run build)
→ AI 调用 FileReadTool 检查构建产物

# 步骤 2：测试
→ AI 调用 BashTool(npm test)
→ 确保所有测试通过

# 步骤 3：Docker 化
> 创建 Dockerfile
→ AI 调用 FileWriteTool 生成 Dockerfile
→ AI 调用 BashTool(docker build)

# 步骤 4：部署
> 使用 deployer 代理部署
→ AI 调用 AgentTool(deployer)
→ 代理执行部署流程

# 步骤 5：监控
> /monitor
→ AI 调用 MonitorTool 检查系统状态
→ AI 调用 MetricsTool 收集指标
```

---

## 59.4 技能（Skill）与工作流的配合

### 技能触发工作流

```
/skill commit → 触发 Git 工作流
/skill review-pr → 触发审查工作流
/skill test-gen → 触发 TDD 工作流
```

### 工作流调用技能

```
TDD 工作流 → 调用 testing:tdd 技能
Git 工作流 → 调用 git:commit 技能
审查工作流 → 调用 workflow-imports:code-review 技能
```

### 代理使用技能

```
critic 代理 → 使用 workflow-imports:code-review 技能
test-engineer 代理 → 使用 testing:tdd 技能
deployer 代理 → 使用 devops:deploy 技能
```

---

## 59.5 Hook 与工作流的配合

### PreToolUse Hook

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "echo 'Tool executed' >> ~/.doge/tool-log.txt"
        }]
      }
    ]
  }
}
```

**作用**：在工具执行前验证输入、记录日志。

### PostToolUse Hook

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
      }
    ]
  }
}
```

**作用**：在工具执行后格式化输出、触发后续操作。

### Stop Hook

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "powershell -c (New-Object.Media.SoundPlayer 'C:\\notify.wav').PlaySync()"
        }]
      }
    ]
  }
}
```

**作用**：AI 停止生成时发出声音提醒。

---

# 第六十部分：综合实战案例

## 60.1 案例：从零开发一个博客平台

### 阶段 1：项目初始化

```cmd
mkdir blog-platform
cd blog-platform
git init
doge
/init
/rules init
/rules add 使用 TypeScript + React + Node.js
/rules add 提交前必须运行测试
```

### 阶段 2：后端开发

```
> 使用 general-purpose 代理实现后端 API
→ AgentTool(general-purpose) 启动
→ 代理调用 FileWriteTool 创建 API 文件
→ 代理调用 BashTool 运行测试
→ 代理返回实现结果
```

### 阶段 3：前端开发

```
> 使用 frontend-engineer 代理实现前端组件
→ AgentTool(frontend-engineer) 启动
→ 代理调用 FileWriteTool 创建 React 组件
→ 代理调用 BashTool 运行测试
→ 代理返回实现结果
```

### 阶段 4：测试

```
> /test-gen
→ AI 调用 GrepTool 查找未测试的函数
→ AI 调用 FileWriteTool 生成测试文件
→ AI 调用 BashTool 运行测试
→ 失败自动修复（最多 5 轮）
```

### 阶段 5：代码审查

```
> /review
→ AI 调用 BashTool(git diff) 获取变更
→ AI 分析变更内容
→ 输出审查意见

> 使用 critic 代理深度审查
→ AgentTool(critic) 启动
→ 代理深度分析代码质量
→ 输出详细审查报告
```

### 阶段 6：提交部署

```
> /commit-push-pr
→ AI 生成 commit message
→ AI 执行 git commit + git push
→ AI 创建 Pull Request

> 使用 deployer 代理部署
→ AgentTool(deployer) 启动
→ 代理执行部署流程
→ 部署到生产环境
```

---

## 60.2 案例：修复生产环境 Bug

### 阶段 1：问题定位

```
> 用户报告登录失败，帮我分析
→ AI 调用 FileReadTool 读取错误日志
→ AI 调用 GrepTool 搜索 "login failed"
→ AI 调用 BashTool 查看最近的部署记录
```

### 阶段 2：调试

```
> 使用 debug-expert 代理定位 bug
→ AgentTool(debug-expert) 启动
→ 代理分析代码，定位到 auth/login.ts 第 42 行
→ 发现是 token 验证逻辑错误
```

### 阶段 3：修复

```
> 修复这个 bug
→ AI 调用 FileEditTool 修改 auth/login.ts
→ AI 调用 BashTool 运行测试验证
→ 测试通过
```

### 阶段 4：回归测试

```
> /test-run
→ AI 调用 BashTool 运行所有测试
→ 确保没有引入新问题
```

### 阶段 5：提交部署

```
> /commit-push-pr
→ AI 生成 commit message："fix: 修复 token 验证逻辑错误"
→ AI 执行 git commit + git push
→ AI 创建 Pull Request

> 使用 deployer 代理部署
→ AgentTool(deployer) 启动
→ 代理执行部署流程
```

---

## 60.3 案例：代码重构

### 阶段 1：分析现状

```
> 分析这个项目的代码质量
→ AI 调用 GrepTool 查找代码异味
→ AI 调用 FileReadTool 读取关键文件
→ AI 输出分析报告
```

### 阶段 2：制定重构计划

```
> 使用 planner 代理制定重构计划
→ AgentTool(planner) 启动
→ 代理分析代码结构
→ 输出重构计划（分 3 个阶段）
```

### 阶段 3：执行重构

```
> 按照计划执行重构
→ AI 调用 FileEditTool 修改代码
→ AI 调用 BashTool 运行测试
→ 确保重构不影响功能
```

### 阶段 4：审查

```
> 使用 critic 代理审查重构结果
→ AgentTool(critic) 启动
→ 代理深度分析重构质量
→ 输出审查报告
```

### 阶段 5：提交

```
> /commit-push-pr
→ AI 生成 commit message
→ AI 执行 git commit + git push
→ AI 创建 Pull Request
```
