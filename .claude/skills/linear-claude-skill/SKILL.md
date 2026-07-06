---
name: linear-claude-skill
description: "管理 Linear 的 Issue、项目和团队"
risk: safe
source: "https://github.com/wrsmith108/linear-claude-skill"
date_added: "2026-02-27"
---

## 何时使用此技能

管理 Linear 的 Issue、项目和团队

当需要管理 Linear 的 issue、项目和团队时使用此技能。
# Linear

用于管理 Linear 中 issue、项目和团队的工具和工作流。

---

## ⚠️ 工具可用性（先阅读）

**此技能支持多个工具后端。使用可用的即可：**

1. **MCP 工具 (mcp__linear)** - 如果工具集中可用则使用
2. **Linear CLI（`linear` 命令）** - 始终可通过 Bash 使用
3. **辅助脚本** - 用于复杂操作

**如果 MCP 工具不可用**，通过 Bash 使用 Linear CLI：

```bash
# 查看 issue
linear issues view ENG-123

# 创建 issue
linear issues create --title "Issue 标题" --description "描述"

# 更新 issue 状态（先获取状态 ID）
linear issues update ENG-123 -s "STATE_ID"

# 添加评论
linear issues comment add ENG-123 -m "评论内容"

# 列出 issues
linear issues list
```

**不要报告"MCP 工具不可用"作为阻碍**—改为使用 CLI。

---

## 🔐 安全：Varlock 集成

**关键**：绝不在终端输出或 Claude 上下文中暴露 API 密钥。

### 安全命令（始终使用）

```bash
# 验证 LINEAR_API_KEY 已设置（掩码输出）
varlock load 2>&1 | grep LINEAR

# 运行注入密钥的命令
varlock run -- npx tsx scripts/查询.ts "查询 { viewer { name } }"

# 检查 架构（安全—无值）
cat .env.架构 | grep LINEAR
```

### 不安全命令（绝不使用）

```bash
# ❌ 绝不—将密钥暴露给 Claude 上下文
linear config show
echo $LINEAR_API_KEY
printenv | grep LINEAR
cat .env
```

### 新项目设置

1. 使用 `@sensitive` 注释创建 `.env.架构`：
   ```bash
   # @type=string(startsWith=lin_api_) @required @sensitive
   LINEAR_API_KEY=
   ```

2. 将 `LINEAR_API_KEY` 添加到 `.env`（切勿提交此文件）

3. 配置 MCP 使用环境变量：
   ```json
   {
     "mcpServers": {
       "linear": {
         "env": { "LINEAR_API_KEY": "${LINEAR_API_KEY}" }
       }
     }
   }
   ```

4. 使用 `varlock load` 在操作前验证

---

## 快速入门（首次用户）

### 1. 检查你的设置

运行设置检查以验证你的配置：

```bash
npx tsx ~/.claude/skills/linear/scripts/设置.ts
```

这将检查：
- LINEAR_API_KEY 是否已设置且有效
- @linear/sdk 是否已安装
- Linear CLI 可用性（可选）
- MCP 配置（可选）

### 2. 获取 API 密钥（如果需要）

如果设置报告缺少 API 密钥：

1. 在浏览器中打开 [Linear](https://linear.app)
2. 转到 **设置**（齿轮图标）-> **安全与访问** -> **个人 API 密钥**
3. 点击 **创建密钥** 并复制密钥（以 `lin_api_` 开头）
4. 添加到你的环境：

```bash
# 选项 A：添加到 shell 配置文件（~/.zshrc 或 ~/.bashrc）
export LINEAR_API_KEY="lin_api_your_key_here"

# 选项 B：添加到 Claude Code 环境
echo 'LINEAR_API_KEY=lin_api_your_key_here' >> ~/.claude/.env

# 然后重新加载 shell 或重启 Claude Code
```

### 3. 测试连接

验证一切正常：

```bash
npx tsx ~/.claude/skills/linear/scripts/查询.ts "查询 { viewer { name } }"
```

你应该能看到你的 Linear 用户名。

### 4. 常见操作

```bash
# 在项目中创建 issue
npx tsx scripts/linear-ops.ts create-issue "项目名称" "标题" "描述"

# 更新 issue 状态
npx tsx scripts/linear-ops.ts status Done ENG-123 ENG-124

# 创建子 issue
npx tsx scripts/linear-ops.ts create-sub-issue ENG-100 "子任务" "详情"

# 更新项目状态
npx tsx scripts/linear-ops.ts project-status "阶段 1" completed

# 显示所有命令
npx tsx scripts/linear-ops.ts help
```

有关完整参考，请参阅[项目管理命令](#项目管理命令)。

---

## 项目规划工作流

### 从一开始就在正确的项目中创建 Issue

**最佳实践**：在规划新阶段或新计划时，在单个规划会话中一起创建项目及其 issue。避免在综合项目中创建 issue 然后后续移动。

#### 推荐工作流

1. **先创建项目**：
   ```bash
   npx tsx scripts/linear-ops.ts create-project "阶段 X：功能名称" "我的计划"
   ```

2. **将项目状态设为已计划**：
   ```bash
   npx tsx scripts/linear-ops.ts project-status "阶段 X：功能名称" planned
   ```

3. **直接在项目中创建 issue**：
   ```bash
   npx tsx scripts/linear-ops.ts create-issue "阶段 X：功能名称" "父任务" "描述"
   npx tsx scripts/linear-ops.ts create-sub-issue ENG-XXX "子任务 1" "描述"
   npx tsx scripts/linear-ops.ts create-sub-issue ENG-XXX "子任务 2" "描述"
   ```

4. **工作开始时更新项目状态**：
   ```bash
   npx tsx scripts/linear-ops.ts project-status "阶段 X：功能名称" in-progress
   ```

#### 为什么这很重要

- **可追溯性**：Issue 从创建时就与其项目关联
- **指标**：项目进度跟踪从第一天起就是准确的
- **工作流**：无需浪费时间在项目间移动 issue
- **组织性**：Linear 视图和过滤器正常工作

#### 应避免的反模式

❌ 在"暂存"项目中创建 issue 然后后续移动：
```bash
# 不要这样做
create-issue "阶段 6A" "新功能"  # 错误项目
# 后续：手动移到阶段 X      # 额外工作
```

---

## 项目管理命令

### project-status

更新 Linear 中的项目状态。接受映射到 Linear API 的用户友好术语。

```bash
npx tsx scripts/linear-ops.ts project-status <project-name> <state>
```

**有效状态：**
| 输入 | 描述 | API 值 |
|-------|-------------|-----------|
| `backlog` | 尚未开始 | backlog |
| `planned` | 已计划未来进行 | planned |
| `in-progress` | 当前活跃 | started |
| `paused` | 暂时暂停 | paused |
| `completed` | 成功完成 | completed |
| `canceled` | 不会完成 | canceled |

**示例：**
```bash
# 开始处理项目
npx tsx scripts/linear-ops.ts project-status "阶段 8：MCP 决策引擎" in-progress

# 标记项目完成
npx tsx scripts/linear-ops.ts project-status "阶段 8" completed

# 部分名称匹配也有效
npx tsx scripts/linear-ops.ts project-status "阶段 8" paused
```

### link-initiative

将现有项目链接到计划。

```bash
npx tsx scripts/linear-ops.ts link-initiative <project-name> <initiative-name>
```

**示例：**
```bash
# 将项目链接到计划
npx tsx scripts/linear-ops.ts link-initiative "阶段 8：MCP 决策引擎" "Q1 目标"

# 部分匹配也有效
npx tsx scripts/linear-ops.ts link-initiative "阶段 8" "Q1 目标"
```

### unlink-initiative

将项目从计划中移除。

```bash
npx tsx scripts/linear-ops.ts unlink-initiative <project-name> <initiative-name>
```

**示例：**
```bash
# 移除错误链接
npx tsx scripts/linear-ops.ts unlink-initiative "阶段 8" "Linear 技能"

# 清理测试链接
npx tsx scripts/linear-ops.ts unlink-initiative "测试项目" "Q1 目标"
```

**错误处理：**
- 如果项目未链接到指定计划，返回错误
- 如果未找到项目或计划，返回错误

### 完整项目生命周期示例

```bash
# 1. 创建项目并链接到计划
npx tsx scripts/linear-ops.ts create-project "阶段 11：新功能" "Q1 目标"

# 2. 将状态设为已计划
npx tsx scripts/linear-ops.ts project-status "阶段 11" planned

# 3. 在项目中创建 issue
npx tsx scripts/linear-ops.ts create-issue "阶段 11" "父任务" "描述"
npx tsx scripts/linear-ops.ts create-sub-issue ENG-XXX "子任务 1" "详情"

# 4. 开始工作—更新为进行中
npx tsx scripts/linear-ops.ts project-status "阶段 11" in-progress

# 5. 标记 issue 完成
npx tsx scripts/linear-ops.ts status Done ENG-XXX ENG-YYY

# 6. 完成项目
npx tsx scripts/linear-ops.ts project-status "阶段 11" completed

# 7. （可选）链接到额外的计划
npx tsx scripts/linear-ops.ts link-initiative "阶段 11" "Q2 目标"
```

---

## 工具选择

为任务选择正确的工具：

| 工具 | 何时使用 |
|------|-------------|
| **MCP（官方服务器）** | 大多数操作—首选 |
| **辅助脚本** | 批量操作，MCP 不可用时 |
| **SDK 脚本** | 复杂操作（循环、条件） |
| **GraphQL API** | MCP/SDK 不支持的操作 |

### MCP 服务器配置

**使用官方的 Linear MCP 服务器**，地址为 `mcp.linear.app`：

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.linear.app/sse"],
      "env": { "LINEAR_API_KEY": "your_api_key" }
    }
  }
}
```

> **警告**：不要使用已废弃的社区服务器。详情请参阅 故障排除.md。

### MCP 可靠性（官方服务器）

| 操作 | 可靠性 | 备注 |
|-----------|-------------|-------|
| 创建 issue | ✅ 高 | 完全支持 |
| 更新状态 | ✅ 高 | 直接使用 `state: "Done"` |
| 列出/搜索 issues | ✅ 高 | 支持过滤器、查询 |
| 添加评论 | ✅ 高 | 与 issue ID 一起使用 |

### 快速状态更新

```bash
# 通过 MCP—使用人类可读的状态名称
update_issue with id="issue-uuid", state="Done"

# 通过辅助脚本（批量操作）
node scripts/linear-helpers.mjs update-status Done 123 124 125
```

### 辅助脚本参考

有关辅助脚本的详细用法，请参阅 **故障排除.md**。

### 并行代理执行

对于批量操作或后台执行，使用 `Linear-specialist` 子代理：

```javascript
Task({
  description: "更新 Linear issues",
  prompt: "标记 ENG-101、ENG-102、ENG-103 为 Done",
  subagent_type: "Linear-specialist"
})
```

**何时使用 `Linear-specialist`（并行）：**
- 批量状态更新（3 个以上 issue）
- 项目状态变更
- 创建多个 issue
- 代码变更后的同步操作

**何时直接执行：**
- 单个 issue 查询
- 查看 issue 详情
- 快速状态检查
- 需要即时结果的操作

有关并行执行模式，请参阅 **sync.md**。

## 关键要求

### Issues → Projects → Initiatives

**每个 issue 必须关联到一个项目。每个项目必须链接到一个计划。**

| 实体 | 必须链接到 | 如果缺失 |
|--------|--------------|------------|
| Issue | 项目 | 在项目看板中不可见 |
| 项目 | 计划 | 在路线图中不可见 |

有关完整的项目创建检查清单，请参阅 **projects.md**。

---

## 约定

### Issue 状态

- **分配给我**：设置 `state: "Todo"`
- **未分配**：设置 `state: "Backlog"`

### 标签

使用**基于领域的标签分类法**。请参阅 docs/labels.md。

**关键规则：**
- 一个类型标签：`feature`、`bug`、`refactor`、`chore`、`spike`
- 1-2 个领域标签：`security`、`backend`、`frontend` 等
- 适用时使用范围标签：`blocked`、`breaking-change`、`tech-debt`

```bash
# 验证标签
npx tsx scripts/linear-ops.ts labels validate "feature,security"

# 为 issue 建议标签
npx tsx scripts/linear-ops.ts labels suggest "修复 XSS 漏洞"
```

## SDK 自动化脚本

**仅在 MCP 工具不足时使用。** 对于涉及循环、映射或批量更新的复杂操作，请使用 `@linear/sdk` 编写 TypeScript 脚本。请参阅 `sdk.md` 了解：
- 完整的脚本模式和模板
- 常见自动化示例（批量更新、过滤、报告）
- 工具选择标准

脚本提供完整的类型提示，对于多步骤操作比原始 GraphQL 更易于调试。

## GraphQL API

**仅作为备用。** 当操作不受 MCP 或 SDK 支持时使用。

请参阅 **api.md** 获取完整文档，包括：
- 认证和设置
- 示例查询和变更
- 超时处理模式
- MCP 超时解决方法
- Shell 脚本兼容性

**快速临时查询：**

```bash
npx tsx ~/.claude/skills/linear/scripts/查询.ts "查询 { viewer { name } }"
```

## 项目与计划

有关高级项目和计划管理模式，请参阅 **projects.md**。

**快速参考**—常见项目命令：

```bash
# 创建项目并链接到计划
npx tsx scripts/linear-ops.ts create-project "阶段 X：名称" "我的计划"

# 更新项目状态
npx tsx scripts/linear-ops.ts project-status "阶段 X" in-progress
npx tsx scripts/linear-ops.ts project-status "阶段 X" completed

# 链接/取消链接项目到计划
npx tsx scripts/linear-ops.ts link-initiative "阶段 X" "我的计划"
npx tsx scripts/linear-ops.ts unlink-initiative "阶段 X" "旧计划"
```

**projects.md 中的关键主题：**
- 项目创建检查清单（强制步骤）
- 内容与描述字段
- 创建前的发现
- 工作前的代码库验证
- 子 issue 管理
- 项目状态更新
- 项目更新（状态报告）

---

## 同步模式（批量操作）

有关代码变更到 Linear 的批量同步，请参阅 **sync.md**。

**快速同步命令：**

```bash
# 批量更新 issue 为 Done
npx tsx scripts/linear-ops.ts status Done ENG-101 ENG-102 ENG-103

# 更新项目状态
npx tsx scripts/linear-ops.ts project-status "我的项目" completed
```

---

## 参考

| 文档 | 用途 |
|----------|---------|
| api.md | GraphQL API 参考、超时处理 |
| sdk.md | SDK 自动化模式 |
| sync.md | 批量同步模式 |
| projects.md | 项目和计划管理 |
| 故障排除.md | 常见问题、MCP 调试 |
| docs/labels.md | 标签分类法 |

**外部：**[Linear MCP 文档](https://linear.app/docs/mcp.md)

## 局限性
- 仅当任务明确匹配上述范围时使用此技能。
- 不要将输出视为特定环境验证、测试或专家审查的替代品。
- 如果缺少所需的输入、权限、安全边界或成功标准，请停止并要求澄清。
