# 阶段 2：环境配置

**跳过条件**：如果是恢复且 `lastCompletedStep >= 4`，跳过整个阶段。

## 步骤 2.0：检查 Ralph 的 Ruby 依赖

Ralph 工作流需要 Ruby。在全新的 Ubuntu 安装上，缺少 Ruby 会导致 Ralph 之后以不透明的 Claude Code 中止而失败。在设置期间检查 Ruby，并给出面向产品的修复提示，但不要阻塞设置的其余部分：

```bash
if command -v ruby >/dev/null 2>&1; then
  echo "已检测到 Ralph 工作流所需的 Ruby：$(ruby --version 2>/dev/null | head -1)"
else
  echo "警告：PATH 中未找到 Ruby。Ralph 工作流需要 Ruby。"
  echo "请先安装它，然后重启 Claude Code，再使用 Ralph。"
  echo "Ubuntu/Debian：sudo apt update && sudo apt install ruby-full"
  echo "macOS：brew install ruby"
fi
```

## 步骤 2.1：设置 HUD 状态栏

**注意**：如果是恢复且 `lastCompletedStep >= 3`，跳到步骤 2.2。

HUD 在 Claude Code 的状态栏中显示实时状态。把所有 HUD/statusLine 设置**委派给 `hud` 技能**：

使用 Skill 工具调用：`hud`，参数为 `setup`

在本阶段**不要**内联生成、规范化或修补 `statusLine` 路径。这在 Windows 上尤其重要 —— 反斜杠路径处理必须留在 `hud` 技能内部。

这将：
1. 把 HUD 包装脚本安装到 `~/.claude/hud/omc-hud.mjs`
2. 在 `~/.claude/settings.json` 中配置 `statusLine`
3. 报告状态，并在需要时提示重启

HUD 设置完成后，保存进度：
```bash
CONFIG_TYPE=$(jq -r '.configType // "unknown"' ".omc/state/setup-state.json" 2>/dev/null || echo "unknown")
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" save 3 "$CONFIG_TYPE"
```

## 步骤 2.2：修复过期的插件缓存引用

在市场更新之后，Claude Code 可能在运行中的会话或插件注册表里仍保留旧的 OMC 缓存路径。在进行任何缓存清理**之前**修复这些引用，以免设置反复报出过期的插件目录错误。

```bash
node "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/repair-plugin-cache.mjs"
```

## 步骤 2.3：检查更新

如果有更新的版本可用，通知用户：

```bash
# 检测已安装的版本（跨平台）
node -e "
const p=require('path'),f=require('fs'),h=require('os').homedir();
const d=process.env.CLAUDE_CONFIG_DIR||p.join(h,'.claude');
let v='';
// 优先尝试缓存目录
const b=p.join(d,'plugins','cache','omc','oh-my-claudecode');
try{const vs=f.readdirSync(b).filter(x=>/^\d/.test(x)).sort((a,c)=>a.localeCompare(c,void 0,{numeric:true}));if(vs.length)v=vs[vs.length-1]}catch{}
// 其次尝试 .omc-version.json
if(v==='')try{const j=JSON.parse(f.readFileSync('.omc-version.json','utf-8'));v=j.version||''}catch{}
// 最后尝试 CLAUDE.md 头部
if(v==='')for(const c of['.claude/CLAUDE.md',p.join(d,'CLAUDE.md')]){try{const m=f.readFileSync(c,'utf-8').match(/^# oh-my-claudecode.*?(v?\d+\.\d+\.\d+)/m);if(m){v=m[1].replace(/^v/,'');break}}catch{}}
console.log('已安装：',v||'(未找到)');
"

# 检查 npm 上的最新版本
LATEST_VERSION=$(npm view oh-my-claude-sisyphus version 2>/dev/null)

if [ -n "$INSTALLED_VERSION" ] && [ -n "$LATEST_VERSION" ]; then
  if [ "$INSTALLED_VERSION" != "$LATEST_VERSION" ]; then
    echo ""
    echo "有可用更新："
    echo "  已安装：v$INSTALLED_VERSION"
    echo "  最新版本：v$LATEST_VERSION"
    echo ""
    echo "更新请运行：claude /install-plugin oh-my-claudecode"
  else
    echo "你正在使用最新版本：v$INSTALLED_VERSION"
  fi
elif [ -n "$LATEST_VERSION" ]; then
  echo "可用的最新版本：v$LATEST_VERSION"
fi
```

## 步骤 2.4：设置默认执行模式

使用 AskUserQuestion 工具提示用户：

**问题：** "当你说 'fast' 或 'parallel' 时，希望默认使用哪种并行执行模式？"

**选项：**
1. **ultrawork（最大能力）** - 使用全部代理层级，包括 Opus 处理复杂任务。最适合质量最重要的高难度工作。（推荐）

把偏好存储到 `~/.claude/.omc-config.json`：

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

# 设置 defaultExecutionMode（把 USER_CHOICE 替换为 "ultrawork" 或 ""）
TEMP_FILE=$(mktemp "${CONFIG_FILE}.tmp.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT
if printf '%s\n' "$EXISTING" | jq --arg mode "USER_CHOICE" '. + {defaultExecutionMode: $mode, configuredAt: (now | todate)}' > "$TEMP_FILE"; then
  mv "$TEMP_FILE" "$CONFIG_FILE"
else
  echo "错误：更新 $CONFIG_FILE 失败。现有配置未被修改。"
  exit 1
fi
trap - EXIT
echo "默认执行模式已设置为：USER_CHOICE"
```

**注意**：该偏好**只**影响泛化关键词（"fast"、"parallel"）。显式关键词（"ulw"）始终覆盖此偏好。

## 步骤 2.5：安装 OMC CLI 工具

OMC CLI（`omc` 命令）提供独立的辅助命令，如 `omc hud`、`omc teleport` 和 `omc team ...`。

首先，检查 CLI 是否已安装：

```bash
if command -v omc &>/dev/null; then
  OMC_CLI_VERSION=$(omc --version 2>/dev/null | head -1 || echo "已安装")
  echo "OMC CLI 已安装：$OMC_CLI_VERSION"
  OMC_CLI_INSTALLED="true"
else
  OMC_CLI_INSTALLED="false"
fi
```

如果 `OMC_CLI_INSTALLED` 为 `"true"`，跳过本步骤的其余部分。

如果 `OMC_CLI_INSTALLED` 为 `"false"`，使用 AskUserQuestion：

**问题：** "是否要全局安装 OMC CLI，以便使用独立的辅助命令？（`omc`、`omc hud`、`omc teleport`）"

**选项：**
1. **是（推荐）** - 通过 `npm install -g` 安装 `oh-my-claude-sisyphus`
2. **否 - 跳过** - 跳过安装（之后可用 `npm install -g oh-my-claude-sisyphus` 手动安装）

如果用户选择**是**：

```bash
if ! command -v npm &>/dev/null; then
  echo "警告：未找到 npm。无法自动安装 OMC CLI。"
  echo "请先安装 Node.js/npm，然后运行：npm install -g oh-my-claude-sisyphus"
else
  if npm install -g oh-my-claude-sisyphus 2>&1; then
    echo "OMC CLI 安装成功。"
    if command -v omc &>/dev/null; then
      OMC_CLI_VERSION=$(omc --version 2>/dev/null | head -1 || echo "已安装")
      echo "已验证：omc $OMC_CLI_VERSION"
    else
      echo "已安装，但 PATH 中没有 'omc'。你可能需要重启 shell。"
    fi
  else
    echo "警告：OMC CLI 安装失败（权限问题或网络错误）。"
    echo "你可以稍后手动安装：npm install -g oh-my-claude-sisyphus"
    echo "或使用 sudo：sudo npm install -g oh-my-claude-sisyphus"
  fi
fi
```

**注意**：CLI 是可选的。所有核心功能也可通过插件系统获得。

## 步骤 2.6：选择任务管理工具

首先，检测可用的任务工具：

```bash
BD_VERSION=""
if command -v bd &>/dev/null; then
  BD_VERSION=$(bd --version 2>/dev/null | head -1 || echo "已安装")
fi

BR_VERSION=""
if command -v br &>/dev/null; then
  BR_VERSION=$(br --version 2>/dev/null | head -1 || echo "已安装")
fi

if [ -n "$BD_VERSION" ]; then
  echo "已找到 beads (bd)：$BD_VERSION"
fi
if [ -n "$BR_VERSION" ]; then
  echo "已找到 beads-rust (br)：$BR_VERSION"
fi
if [ -z "$BD_VERSION" ] && [ -z "$BR_VERSION" ]; then
  echo "未找到外部任务工具。使用内置 Tasks。"
fi
```

如果 beads 和 beads-rust **都未**检测到，跳过本步骤（默认使用内置）。

如果检测到 beads 或 beads-rust，使用 AskUserQuestion：

**问题：** "我应该用哪种任务管理工具来跟踪工作？"

**选项：**
1. **内置 Tasks（默认）** - 使用 Claude Code 原生的 TodoWrite 或可用的任务列表界面。任务仅在会话内有效。
2. **Beads (bd)** - 基于 Git 的持久化任务。可跨会话保留。[仅在检测到时显示]
3. **Beads-Rust (br)** - beads 的轻量 Rust 移植版。[仅在检测到时显示]

（仅在检测到相应工具时才显示选项 2/3）

存储该偏好：

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

# 根据用户的选择，USER_CHOICE 为 "builtin"、"beads" 或 "beads-rust"
TEMP_FILE=$(mktemp "${CONFIG_FILE}.tmp.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT
if printf '%s\n' "$EXISTING" | jq --arg tool "USER_CHOICE" '. + {taskTool: $tool, taskToolConfig: {injectInstructions: true, useMcp: false}}' > "$TEMP_FILE"; then
  mv "$TEMP_FILE" "$CONFIG_FILE"
else
  echo "错误：更新 $CONFIG_FILE 失败。现有配置未被修改。"
  exit 1
fi
trap - EXIT
echo "任务工具已设置为：USER_CHOICE"
```

**注意：** beads 的上下文指令会在下次会话启动时自动注入。

## 保存进度

```bash
CONFIG_TYPE=$(jq -r '.configType // "unknown"' ".omc/state/setup-state.json" 2>/dev/null || echo "unknown")
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" save 4 "$CONFIG_TYPE"
```
