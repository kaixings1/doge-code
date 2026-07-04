---
name: omc-setup
description: "Omc Setup — OMC 安装设置相关功能和最佳实践"
level: 2
---

# OMC 安装设置

这是您**唯一需要学习的命令**。运行此命令后，其他一切都将自动完成。

**当调用此技能时，立即执行下面的工作流。不要仅向用户重述或总结这些指令。**

注意：当设置了 `CLAUDE_CONFIG_DIR` 环境变量时，本指南中所有 `~/.claude/...` 路径均遵循该变量。

## 最佳使用场景

当用户想要**安装、刷新或修复 OMC 本身**时使用此设置流程。

- 市场/插件安装用户在 `/plugin install oh-my-claudecode` 后应进入此流程
- npm 用户在 `npm i -g oh-my-claude-sisyphus@latest` 后应进入此流程
- 本地开发和工作树用户在更新检出仓库并重新运行设置后应进入此流程

## 标志解析

检查用户调用中的标志：
- `--help` → 显示帮助文本（见下方）并停止
- `--local` → 仅阶段 1（目标=本地），然后停止
- `--global` → 仅阶段 1（目标=全局），然后停止
- `--force` → 跳过预设置检查，运行完整设置（阶段 1 → 2 → 3 → 4）
- 无标志 → 运行预设置检查，然后根据需要运行完整设置

## 帮助文本

当用户使用 `--help` 运行时，显示以下内容并停止：

```
OMC 设置 - 配置 oh-my-claudecode

用法：
  /oh-my-claudecode:omc-setup           运行初始设置向导（如果已配置则更新）
  /oh-my-claudecode:omc-setup --local   配置本地项目（.claude/CLAUDE.md）
  /oh-my-claudecode:omc-setup --global  配置全局设置（~/.claude/CLAUDE.md）
  /oh-my-claudecode:omc-setup --force   即使已配置也强制运行完整设置向导
  /oh-my-claudecode:omc-setup --help    显示此帮助

模式：
  初始设置（无标志）
    - 首次设置的交互式向导
    - 配置 CLAUDE.md（本地或全局）
    - 设置 HUD 状态栏
    - 检查更新
    - 提供 MCP 服务器配置
    - 配置团队模式默认值（代理数量、类型、模型）
    - 如果已配置，提供快速更新选项

  本地配置（--local）
    - 下载新的 CLAUDE.md 到 ./.claude/
    - 备份现有 CLAUDE.md 到 .claude/CLAUDE.md.backup.YYYY-MM-DD
    - 项目特定设置
    - 用于在 OMC 升级后更新项目配置

  全局配置（--global）
    - 下载新的 CLAUDE.md 到 ~/.claude/
    - 备份现有 CLAUDE.md 到 ~/.claude/CLAUDE.md.backup.YYYY-MM-DD
    - 默认：显式覆盖 ~/.claude/CLAUDE.md，使普通 `claude` 也使用 OMC
    - 可选保留模式保持用户的基础 `CLAUDE.md`，并将 OMC 安装到 `CLAUDE-omc.md` 供 `omc` 启动
    - 应用于所有 Claude Code 会话
    - 清理旧版钩子
    - 用于在 OMC 升级后更新全局配置

  强制完整设置（--force）
    - 绕过"已配置"检查
    - 从头开始运行完整的设置向导
    - 当您想要重新配置偏好时使用

示例：
  /oh-my-claudecode:omc-setup           # 首次设置（如果已配置则更新 CLAUDE.md）
  /oh-my-claudecode:omc-setup --local   # 更新此项目
  /oh-my-claudecode:omc-setup --global  # 更新所有项目
  /oh-my-claudecode:omc-setup --force   # 重新运行完整设置向导

更多信息：https://github.com/Yeachan-Heo/oh-my-claudecode
```


## Active Plugin Root Resolution

Before running setup shell commands or reading phase files, resolve the current OMC plugin root. This prevents an already-running Claude Code session from continuing to use a stale `CLAUDE_PLUGIN_ROOT` after `/plugin marketplace update omc` installs a newer cache version.

```bash
OMC_SETUP_PLUGIN_ROOT=$(node -e "const f=require('fs'),p=require('path'),h=require('os').homedir(),d=(process.env.CLAUDE_CONFIG_DIR||p.join(h,'.claude')).replace(/[\\/]+$/,''),b=p.join(d,'plugins','cache','omc','oh-my-claudecode'),valid=r=>f.existsSync(p.join(r,'skills','omc-setup','SKILL.md'))||f.existsSync(p.join(r,'hooks','hooks.json'))||f.existsSync(p.join(r,'docs','CLAUDE.md'));try{const vs=f.readdirSync(b,{withFileTypes:true}).filter(e=>(e.isDirectory()||e.isSymbolicLink())&&/^\d+\.\d+\.\d+/.test(e.name)).map(e=>e.name).sort((a,c)=>c.localeCompare(a,void 0,{numeric:true}));const hit=vs.map(v=>p.join(b,v)).find(valid);if(hit)console.log(hit);else if(process.env.CLAUDE_PLUGIN_ROOT)console.log(process.env.CLAUDE_PLUGIN_ROOT)}catch{if(process.env.CLAUDE_PLUGIN_ROOT)console.log(process.env.CLAUDE_PLUGIN_ROOT)}")
export OMC_SETUP_PLUGIN_ROOT
```

Use `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}` for all setup script and phase paths, then immediately repair stale cache references before any prompts or phase work:

```bash
node "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/repair-plugin-cache.mjs"
```

## 预设置检查：是否已配置？

**关键**：在做任何其他事情之前，检查设置是否已经完成。这可以防止用户在每次更新后重新运行完整的设置向导。

```bash
# 检查设置是否已完成
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"

if [ -f "$CONFIG_FILE" ]; then
  SETUP_COMPLETED=$(jq -r '.setupCompleted // empty' "$CONFIG_FILE" 2>/dev/null)
  SETUP_VERSION=$(jq -r '.setupVersion // empty' "$CONFIG_FILE" 2>/dev/null)

  if [ -n "$SETUP_COMPLETED" ] && [ "$SETUP_COMPLETED" != "null" ]; then
    echo "OMC 设置已于 $SETUP_COMPLETED 完成"
    [ -n "$SETUP_VERSION" ] && echo "设置版本: $SETUP_VERSION"
    ALREADY_CONFIGURED="true"
  fi
fi
```

### 如果已配置（且无 --force 标志）

如果 `ALREADY_CONFIGURED` 为 true 且用户没有传递 `--force`、`--local` 或 `--global` 标志：

使用 AskUserQuestion 提示：

**问题：** "OMC 已配置。您想做什么？"

**选项：**
1. **仅更新 CLAUDE.md** - 下载最新的 CLAUDE.md 而不重新运行完整设置
2. **重新运行完整设置** - 再次完成完整的设置向导
3. **取消** - 退出而不做任何更改

**如果用户选择"仅更新 CLAUDE.md"：**
- 检测是否存在本地（.claude/CLAUDE.md）或全局（~/.claude/CLAUDE.md）配置
- 如果存在本地配置，运行：`bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" local`
- 如果仅存在全局配置，运行：`bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" global`
- 跳过所有其他步骤
- 报告成功并退出

**如果用户选择"重新运行完整设置"：**
- 继续执行下面的恢复检测

**如果用户选择"取消"：**
- 退出而不做任何更改

### Force Flag Override

If user passes `--force` flag, skip this check and proceed directly to setup.

## 恢复检测

在开始任何阶段之前，检查现有状态：

```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" resume
```

如果存在状态（输出不是"fresh"），使用 AskUserQuestion 提示：

**问题：** "发现之前的设置会话。您想恢复还是重新开始？"

**选项：**
1. **从步骤 $LAST_STEP 恢复** - 从上次中断处继续
2. **重新开始** - 从头开始（清除已保存状态）

如果用户选择"重新开始"：
```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" clear
```

## 阶段执行

### 对于 `--local` 或 `--global` 标志：
读取 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/01-install-claude-md.md` 文件并遵循其说明。
（阶段文件处理标志模式的提前退出。）

### 对于完整设置（默认或 --force）：
按顺序执行阶段。对于每个阶段，读取相应的文件并遵循其说明：

1. **阶段 1 - 安装 CLAUDE.md**：读取 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/01-install-claude-md.md` 并遵循其说明。

2. **阶段 2 - 环境配置**：读取 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/02-configure.md` 并遵循其说明。阶段 2 必须将 HUD/statusLine 设置委托给 `hud` 技能；不要在此处内联生成或修补 `statusLine` 路径。

3. **阶段 3 - 集成设置**：读取 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/03-integrations.md` 并遵循其说明。

4. **阶段 4 - 完成**：读取 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/04-welcome.md` 并遵循其说明。

## 优雅中断处理

**重要**：此设置过程通过 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh` 在每个阶段后保存进度。如果中断（Ctrl+C 或连接丢失），设置可以从停止处恢复。

## 保持最新

安装 oh-my-claudecode 更新后（通过 npm 或插件更新）：

**自动方式**：只需运行 `/oh-my-claudecode:omc-setup` - 它会检测您已配置并提供跳过完整向导的"仅更新 CLAUDE.md"快速选项。

**手动选项**：
- `/oh-my-claudecode:omc-setup --local` 仅更新项目配置
- `/oh-my-claudecode:omc-setup --global` 仅更新全局配置
- `/oh-my-claudecode:omc-setup --force` 重新运行完整向导（重新配置偏好）

这确保您拥有最新的功能和代理配置，而无需重复完整设置的令牌成本。
