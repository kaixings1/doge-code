# 阶段 3：集成设置

**跳过条件**：如果是恢复且 `lastCompletedStep >= 6`，跳过整个阶段。

## 步骤 3.1：验证插件安装

```bash
grep -q "oh-my-claudecode" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json" && echo "插件已验证" || echo "未找到插件 - 请运行：claude /install-plugin oh-my-claudecode"
```

## 步骤 3.2：提供 MCP 服务器配置

MCP 服务器用额外的工具扩展 Claude Code（网页搜索、GitHub 等）。

使用 AskUserQuestion："是否要配置 MCP 服务器以增强能力？（Context7、Exa 搜索、GitHub 等）"

如果是，调用 mcp-setup 技能：
```
/oh-my-claudecode:mcp-setup
```

如果否，跳到下一步。

## 步骤 3.3：配置代理团队（可选）

代理团队是一项实验性的 Claude Code 功能，让你生成 N 个协同工作的代理，它们在共享任务列表上工作并支持代理间消息传递。**团队默认禁用**，需要通过 `settings.json` 启用。

参考：https://code.claude.com/docs/en/agent-teams

使用 AskUserQuestion：

**问题：** "是否要启用代理团队？团队让你可以生成互相协同的代理（例如 `/team 3:executor 'fix all errors'`）。这是 Claude Code 的一项实验性功能。"

**选项：**
1. **是，启用团队（推荐）** - 启用该实验性功能并配置默认值
2. **否，跳过** - 保持团队禁用（之后可启用）

### 如果用户选择**是**：

#### 3.3.1：在 settings.json 中启用代理团队

**关键**：代理团队要求在 `~/.claude/settings.json` 中设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`。必须谨慎操作以保留既有的用户设置。

首先，读取当前的 settings.json：

```bash
SETTINGS_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

if [ -f "$SETTINGS_FILE" ]; then
  echo "已找到当前的 settings.json"
  cat "$SETTINGS_FILE"
else
  echo "未找到 settings.json - 将新建一个"
fi
```

然后使用 Read 工具读取 `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json`（如果存在）。使用 Edit 工具合并团队配置，同时保留**全部**既有设置。

使用 jq 安全地合并，而不覆盖既有设置：

```bash
SETTINGS_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "错误：安全更新 $SETTINGS_FILE 需要 jq。"
  echo "请安装 jq 后重新运行设置。现有设置未被修改。"
  exit 1
fi

if [ -f "$SETTINGS_FILE" ]; then
  TEMP_FILE=$(mktemp "${SETTINGS_FILE}.tmp.XXXXXX")
  trap 'rm -f "$TEMP_FILE"' EXIT
  if jq '.env = (.env // {} | . + {"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"})' "$SETTINGS_FILE" > "$TEMP_FILE"; then
    mv "$TEMP_FILE" "$SETTINGS_FILE"
  else
    echo "错误：更新 $SETTINGS_FILE 失败。现有设置未被修改。"
    exit 1
  fi
  trap - EXIT
  echo "已将 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 添加到现有的 settings.json"
else
  mkdir -p "$(dirname "$SETTINGS_FILE")"
  cat > "$SETTINGS_FILE" << 'SETTINGS_EOF'
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
SETTINGS_EOF
  echo "已创建 settings.json 并启用团队"
fi
```

**重要**：在可能的情况下，修改 settings.json 优先使用 Edit 工具，因为它保留格式和注释。上面的 jq 方式是当文件需要结构化合并时的回退方案。

#### 3.3.2：配置队友显示模式

使用 AskUserQuestion：

**问题：** "队友应该如何显示？"

**选项：**
1. **自动（推荐）** - 在 tmux 中使用分屏，否则使用进程内。最适合大多数用户。
2. **进程内** - 所有队友都在你的主终端中。用 Shift+Up/Down 选择。各处可用。
3. **分屏（tmux）** - 每个队友在各自的 pane 中。需要 tmux 或 iTerm2。

如果用户选择的不是 "Auto"，则向 settings.json 添加 `teammateMode`：

```bash
SETTINGS_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "错误：安全更新 $SETTINGS_FILE 需要 jq。"
  echo "请安装 jq 后重新运行设置。现有设置未被修改。"
  exit 1
fi

# 根据用户的选择，TEAMMATE_MODE 为 "in-process" 或 "tmux"
# 如果用户选择了 "Auto"（即默认值），则跳过此项
TEMP_FILE=$(mktemp "${SETTINGS_FILE}.tmp.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT
if jq --arg mode "TEAMMATE_MODE" '. + {teammateMode: $mode}' "$SETTINGS_FILE" > "$TEMP_FILE"; then
  mv "$TEMP_FILE" "$SETTINGS_FILE"
else
  echo "错误：更新 $SETTINGS_FILE 失败。现有设置未被修改。"
  exit 1
fi
trap - EXIT
echo "队友显示模式已设置为：TEAMMATE_MODE"
```

#### 3.3.3：在 omc-config 中配置团队默认值

使用带多个问题的 AskUserQuestion：

**问题 1：** "团队默认应该生成多少个代理？"

**选项：**
1. **3 个代理（推荐）** - 速度与资源占用的良好平衡
2. **5 个代理（最大）** - 大型任务的最大并行度
3. **2 个代理** - 保守选择，适用于较小项目

**问题 2：** "队友默认应该使用哪个 CLI 提供方？"

**选项：**
1. **claude（推荐）** - 默认提供方，兼容性最广
2. **codex** - 已安装时默认使用 Codex CLI 工作进程
3. **gemini** - 已安装时默认使用 Gemini CLI 工作进程（企业/API 密钥档）
4. **antigravity** - 已安装时默认使用 Antigravity CLI（`agy`）工作进程；Google 对 Gemini CLI 的继任者（按[官方说明](https://antigravity.google) 安装）

把团队配置存储到 `~/.claude/.omc-config.json`：

```bash
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"
mkdir -p "$(dirname "$CONFIG_FILE")"

if ! command -v jq >/dev/null 2>&1; then
  echo "错误：安全更新 $CONFIG_FILE 需要 jq。"
  echo "请安装 jq 后重新运行设置。现有配置未被修改。"
  exit 1
fi

if [ -f "$CONFIG_FILE" ]; then
  EXISTING=$(cat "$CONFIG_FILE")
else
  EXISTING='{}'
fi

# 把 MAX_AGENTS、AGENT_TYPE 替换为用户的选择
TEMP_FILE=$(mktemp "${CONFIG_FILE}.tmp.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT
if printf '%s\n' "$EXISTING" | jq \
  --argjson maxAgents MAX_AGENTS \
  --arg agentType "AGENT_TYPE" \
  '. + {team: {ops: {maxAgents: $maxAgents, defaultAgentType: $agentType, monitorIntervalMs: 30000, shutdownTimeoutMs: 15000}}}' > "$TEMP_FILE"; then
  mv "$TEMP_FILE" "$CONFIG_FILE"
else
  echo "错误：更新 $CONFIG_FILE 失败。现有配置未被修改。"
  exit 1
fi
trap - EXIT

echo "团队配置已保存："
echo "  最大代理数：MAX_AGENTS"
echo "  默认提供方：AGENT_TYPE"
echo "  模型：队友继承你的会话模型"
```

**注意：** 队友没有单独的模型默认值。每个队友都是一个完整的 Claude Code 会话，继承你所配置的模型。由队友生成的子代理可使用任何模型等级。

#### 验证 settings.json 完整性

所有修改之后，验证 settings.json 是合法 JSON 并包含预期的键：

```bash
SETTINGS_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"

if jq empty "$SETTINGS_FILE" 2>/dev/null; then
  echo "settings.json：JSON 合法"
else
  echo "错误：settings.json 不是合法的 JSON！正在从备份恢复..."
  exit 1
fi

if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" > /dev/null 2>&1; then
  echo "代理团队：已启用"
else
  echo "警告：在 settings.json 中未找到代理团队的环境变量"
fi

echo ""
echo "最终的 settings.json："
jq '.' "$SETTINGS_FILE"
```

### 如果用户选择**否**：

跳过本步骤。代理团队将保持禁用。用户之后可通过向 `~/.claude/settings.json` 添加以下内容来启用：
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

或运行 `/oh-my-claudecode:omc-setup --force` 并选择启用团队。

## 保存进度

```bash
CONFIG_TYPE=$(jq -r '.configType // "unknown"' ".omc/state/setup-state.json" 2>/dev/null || echo "unknown")
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" save 6 "$CONFIG_TYPE"
```
