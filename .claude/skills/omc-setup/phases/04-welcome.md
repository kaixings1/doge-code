# 阶段 4：完成

## 检测是否从 2.x 升级

检查用户是否有既有的 2.x 配置：

```bash
ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/commands/ralph-loop.md 2>/dev/null || ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/commands/ultrawork.md 2>/dev/null
```

如果找到，说明是从 2.x 升级。设置 `IS_UPGRADE=true`。

## 显示欢迎消息

### 对于新用户（IS_UPGRADE 不为 true）：

```
OMC 设置完成！

你不需要学习任何命令。我现在拥有会自动激活的智能行为。

会自动发生的事：
- 复杂任务 -> 我会并行化并委派给专家
- "plan this" -> 我会启动一次规划访谈
- "don't stop until done" -> 我会持续执行直到验证完成
- "stop" 或 "cancel" -> 我会智能地停止当前操作

魔法关键词（可选的进阶快捷方式）：
只需在你的请求中自然地包含这些词：

| 关键词 | 效果 | 示例 |
|---------|--------|---------|
| ralph | 持久化模式 | "ralph: fix the auth bug" |
| ralplan | 迭代式规划 | "ralplan this feature" |
| ulw | 最大并行度 | "ulw refactor the API" |
| plan | 规划访谈 | "plan the new endpoints" |
| team | 协同代理 | "/team 3:executor fix errors" |

**ralph 包含 ultrawork：** 当你激活 ralph 模式时，它会自动包含 ultrawork 的并行执行。无需组合关键词。

团队：
生成带有共享任务列表和实时消息的协同代理：
- /oh-my-claudecode:team 3:executor "fix all TypeScript errors"
- /oh-my-claudecode:team 5:debugger "fix build errors in src/"
团队使用 Claude Code 的隐式代理团队（直接用不同的 `name` 值生成队友；Claude Code 2.1.178+ 中没有 TeamCreate/TeamDelete）。

MCP 服务器：
运行 /oh-my-claudecode:mcp-setup 来添加网页搜索、GitHub 等工具。

HUD 状态栏：
状态栏现在会显示 OMC 状态。重启 Claude Code 即可看到。

OMC CLI 辅助命令（如果已安装）：
- omc hud         - 渲染当前的 HUD 状态栏
- omc teleport    - 创建一个隔离的 git worktree
- omc team status - 查看正在运行的团队任务
- 会话摘要会写入 `.omc/sessions/*.json`

就这样！正常使用 Claude Code 即可。
```

### 对于从 2.x 升级的用户（IS_UPGRADE 为 true）：

```
OMC 设置完成！（已从 2.x 升级）

好消息：你现有的命令仍然可用！
- /ralph、/ultrawork、/omc-plan 等命令全部仍然有效

3.0 的新特性：
你不再需要那些命令了。现在一切都是自动的：
- 直接说 "don't stop until done"，而不用 /ralph
- 直接说 "fast" 或 "parallel"，而不用 /ultrawork
- 直接说 "plan this"，而不用 /omc-plan
- 直接说 "stop"，而不用 /cancel

魔法关键词（进阶快捷方式）：
| 关键词 | 等同于旧命令... | 示例 |
|---------|----------------|---------|
| ralph | /ralph | "ralph: fix the bug" |
| ralplan | /ralplan | "ralplan this feature" |
| ulw | /ultrawork | "ulw refactor API" |
| omc-plan | /omc-plan | "plan the endpoints" |
| team | （新！） | "/team 3:executor fix errors" |

团队（新功能！）：
生成带有共享任务列表和实时消息的协同代理：
- /oh-my-claudecode:team 3:executor "fix all TypeScript errors"
- 使用 Claude Code 的隐式代理团队（直接用不同的 `name` 值生成队友；Claude Code 2.1.178+ 中没有 TeamCreate/TeamDelete）

HUD 状态栏：
状态栏现在会显示 OMC 状态。重启 Claude Code 即可看到。

OMC CLI 辅助命令（如果已安装）：
- omc hud         - 渲染当前的 HUD 状态栏
- omc teleport    - 创建一个隔离的 git worktree
- omc team status - 查看正在运行的团队任务
- 会话摘要会写入 `.omc/sessions/*.json`

你的工作流不会中断 - 只是变得更轻松了！
```

## 可选规则模板

OMC 包含一些规则模板，你可复制到项目的 `.claude/rules/` 目录以实现自动上下文注入：

| 模板 | 用途 |
|----------|---------|
| `coding-style.md` | 代码风格、不可变性、文件组织 |
| `testing.md` | TDD 工作流，80% 覆盖率目标 |
| `security.md` | 密钥管理、输入校验 |
| `performance.md` | 模型选择、上下文管理 |
| `git-workflow.md` | 提交约定、PR 工作流 |
| `karpathy-guidelines.md` | 编码纪律 —— 先想后写、追求简洁、外科手术式改动 |

复制方式：
```bash
mkdir -p .claude/rules
cp "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/templates/rules/"*.md .claude/rules/
```

详情见 `templates/rules/README.md`。

## 询问是否为仓库加星

首先，检查 `gh` CLI 是否可用且已认证：

```bash
gh auth status &>/dev/null
```

### 如果 gh 可用且已认证：

**在提示之前，检查该仓库是否已被加星：**

```bash
gh api user/starred/Yeachan-Heo/oh-my-claudecode &>/dev/null
```

**如果已加星（退出码 0）：**
- 完全跳过该提示
- 静默继续到完成

**如果未加星（退出码非 0）：**

使用 AskUserQuestion：

**问题：** "如果你喜欢 oh-my-claudecode，愿意在 GitHub 上给这个项目加星来支持它吗？"

**选项：**
1. **是的，加星！** - 给仓库加星
2. **不用了，谢谢** - 跳过，不再提示
3. **以后再说** - 跳过，不再提示

如果用户选择 "是的，加星！"：

```bash
gh api -X PUT /user/starred/Yeachan-Heo/oh-my-claudecode 2>/dev/null && echo "感谢加星！" || true
```

**注意：** 如果 API 调用不成功则静默失败 —— 绝不阻塞设置完成。

### 如果 gh 不可用或未认证：

```bash
echo ""
echo "如果你喜欢 oh-my-claudecode，欢迎给这个仓库加星："
echo "  https://github.com/Yeachan-Heo/oh-my-claudecode"
echo ""
```

## 标记完成

获取当前的 OMC 版本并标记设置为已完成：

```bash
# 从 CLAUDE.md 获取当前的 OMC 版本
OMC_VERSION=""
if [ -f ".claude/CLAUDE.md" ]; then
  OMC_VERSION=$(grep -m1 'OMC:VERSION:' .claude/CLAUDE.md 2>/dev/null | sed -E 's/.*OMC:VERSION:([^ ]+).*/\1/' || true)
elif [ -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/CLAUDE.md" ]; then
  OMC_VERSION=$(grep -m1 'OMC:VERSION:' "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/CLAUDE.md" 2>/dev/null | sed -E 's/.*OMC:VERSION:([^ ]+).*/\1/' || true)
fi
if [ -z "$OMC_VERSION" ]; then
  OMC_VERSION=$(omc --version 2>/dev/null | head -1 || true)
fi
if [ -z "$OMC_VERSION" ]; then
  OMC_VERSION="unknown"
fi

bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" complete "$OMC_VERSION"
```
