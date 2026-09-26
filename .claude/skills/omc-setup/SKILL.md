---
name: omc-setup
description: 按规范设置流程为 plugin、npm 和 local-dev 安装方式安装或刷新 oh-my-claudecode。
level: 2
---

# OMC 设置

这是**你唯一需要学会的命令**。运行它之后，其余一切都自动完成。

**此技能被调用时，立即执行下面的工作流。不要只把本指令复述或总结给用户。**

注意：当设置了 `CLAUDE_CONFIG_DIR` 环境变量时，本指南中所有 `~/.claude/...` 路径都遵循该变量。

## 最适用场景

当用户想要**安装、刷新或修复 OMC 本身**时，选择此设置流程。

- 市场/插件安装用户应在 `/plugin install oh-my-claudecode` 之后落到这里
- npm 用户应在 `npm i -g oh-my-claude-sisyphus@latest` 之后落到这里
- local-dev 与 worktree 用户应在更新检出的仓库并重跑设置之后落到这里

## 标志解析

检查用户调用中的标志：
- `--help` → 显示帮助文本（见下）并停止
- `--local` → 仅阶段 1（target=local），然后停止
- `--global` → 仅阶段 1（target=global），然后停止
- `--force` → 跳过设置前检查，运行完整设置（阶段 1 → 2 → 3 → 4）
- 无标志 → 运行设置前检查，必要时再执行完整设置

## 帮助文本

当用户带 `--help` 运行时，显示以下内容并停止：

```
OMC 设置 - 配置 oh-my-claudecode

用法：
  /oh-my-claudecode:omc-setup           运行初始设置向导（若已配置则执行更新）
  /oh-my-claudecode:omc-setup --local   配置项目本地设置（.claude/CLAUDE.md）
  /oh-my-claudecode:omc-setup --global  配置全局设置（~/.claude/CLAUDE.md）
  /oh-my-claudecode:omc-setup --force   即使已经配置过，也强制执行完整设置向导
  /oh-my-claudecode:omc-setup --help    显示本帮助

模式：
  初始设置（不带标志）
    - 首次设置时使用的交互式向导
    - 配置 CLAUDE.md（本地或全局）
    - 设置 HUD 状态栏
    - 检查更新
    - 提供 MCP 服务器配置
    - 配置团队模式的默认值（代理数量、类型、模型）
    - 若已配置过，则提供快速更新选项

  本地配置（--local）
    - 通过 `scripts/setup-claude-md.sh` 调用插件本地协调器；在任何安装后工作之前，shell 都会校验协调器的响应及其退出状态
    - 仅对需要变更的文件，报告协调器创建的字节一致的备份
    - 项目专属设置
    - 在 OMC 升级之后用它更新项目配置

  全局配置（--global）
    - 通过 `scripts/setup-claude-md.sh` 调用插件本地协调器；在任何安装后工作之前，shell 都会校验协调器的响应及其退出状态
    - 仅对发生变更的全局文件，报告协调器创建的字节一致的备份
    - 默认：显式覆盖 ~/.claude/CLAUDE.md，让普通的 `claude` 也使用 OMC
    - 可选的保留模式会保留用户的基础 `CLAUDE.md`，并把 OMC 安装到 `CLAUDE-omc.md` 中供 `omc` 启动时使用
    - 应用于所有 Claude Code 会话
    - 保留同名的历史 hook 文件，除非其确切的历史内容已被独立验证
    - 在 OMC 升级之后用它更新全局配置

  强制执行完整设置（--force）
    - 跳过"已配置"这一检查
    - 从头运行完整的设置向导
    - 当你想要重新配置偏好时使用

示例：
  /oh-my-claudecode:omc-setup           # 首次设置（若已配置则更新 CLAUDE.md）
  /oh-my-claudecode:omc-setup --local   # 更新本项目
  /oh-my-claudecode:omc-setup --global  # 更新所有项目
  /oh-my-claudecode:omc-setup --force   # 重新运行完整设置向导

更多信息：https://github.com/Yeachan-Heo/oh-my-claudecode
```


## 设置调用

在本技能中**不要**自行扫描插件缓存目录或挑选插件根目录。请从运行中的插件环境所提供的插件根目录调用设置脚本：

```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" <local|global> [overwrite|preserve]
```

该脚本是唯一的缓存解析器。它只接受完整的插件根目录（规范的 `docs/CLAUDE.md`、协调器工件和 `omc-reference` 技能），选择严格的完整 SemVer 缓存版本，校验已编译源码的握手，并在协调器协议或状态不一致时以失败关闭。不要在该协调器之外下载配置或修改 `CLAUDE.md`。

## 设置前检查：是否已配置？

**关键**：在做任何其他事之前，先检查设置是否已经完成。这可避免用户在每次更新后都不得不重跑完整的设置向导。

```bash
# 检查设置是否已经完成
CONFIG_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.omc-config.json"

if [ -f "$CONFIG_FILE" ]; then
  SETUP_COMPLETED=$(jq -r '.setupCompleted // empty' "$CONFIG_FILE" 2>/dev/null)
  SETUP_VERSION=$(jq -r '.setupVersion // empty' "$CONFIG_FILE" 2>/dev/null)

  if [ -n "$SETUP_COMPLETED" ] && [ "$SETUP_COMPLETED" != "null" ]; then
    echo "OMC 设置已完成，完成时间：$SETUP_COMPLETED"
    [ -n "$SETUP_VERSION" ] && echo "设置版本：$SETUP_VERSION"
    ALREADY_CONFIGURED="true"
  fi
fi
```

### 如果已配置（且没有 --force 标志）

如果 `ALREADY_CONFIGURED` 为 true **且**用户**没有**传 `--force`、`--local` 或 `--global` 标志：

使用 AskUserQuestion 提示：

**问题：** "OMC 已经配置过了。你想怎么做？"

**选项：**
1. **仅更新 CLAUDE.md** —— 安装当前活动插件的规范 CLAUDE.md，不重跑完整设置
2. **再次运行完整设置** —— 走完整的设置向导
3. **取消** —— 不做任何更改退出

**如果用户选择"仅更新 CLAUDE.md"：**
- 检测存在的是本地（.claude/CLAUDE.md）还是全局（~/.claude/CLAUDE.md）配置
- 如果存在本地配置，运行：`bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" local`
- 如果只有全局配置，运行：`bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" global`
- 跳过所有其他步骤
- 报告成功并退出

**如果用户选择"再次运行完整设置"：**
- 继续下面的恢复检测

**如果用户选择"取消"：**
- 不做任何更改退出

### Force 标志覆盖

如果用户传了 `--force` 标志，跳过此检查并直接进入设置。

## 恢复检测

在开始任何阶段之前，检查是否存在既有状态：

```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" resume
```

如果状态存在（输出不是 "fresh"），使用 AskUserQuestion 提示：

**问题：** "发现有之前的设置会话。你想恢复继续，还是重新开始？"

**选项：**
1. **从步骤 $LAST_STEP 恢复** —— 从你中断的地方继续
2. **从头开始** —— 从头启动（清除已保存状态）

如果用户选择"从头开始"：
```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" clear
```

## 阶段执行

### 对于 `--local` 或 `--global` 标志：
阅读 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/01-install-claude-md.md` 处的文件并遵循其指令。
（该阶段文件会处理标志模式的提前退出。）

### 对于完整设置（默认或 --force）：
按顺序执行各阶段。对每个阶段，阅读对应文件并遵循其指令：

1. **阶段 1 —— 安装 CLAUDE.md**：阅读 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/01-install-claude-md.md` 并遵循其指令。

2. **阶段 2 —— 环境配置**：阅读 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/02-configure.md` 并遵循其指令。阶段 2 **必须**把 HUD/statusLine 设置委派给 `hud` 技能；不要在此处内联生成或修补 `statusLine` 路径。

3. **阶段 3 —— 集成设置**：阅读 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/03-integrations.md` 并遵循其指令。

4. **阶段 4 —— 完成**：阅读 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/skills/omc-setup/phases/04-welcome.md` 并遵循其指令。

## 优雅中断处理

**重要**：本设置流程通过 `${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh` 在每个阶段之后保存进度。如果被中断（Ctrl+C 或连接丢失），设置可从中断处恢复。

## 保持最新

安装 oh-my-claudecode 更新之后（通过 npm 或插件更新）：

**自动方式**：只需运行 `/oh-my-claudecode:omc-setup` —— 它会检测到你已配置，并提供一个跳过完整向导的快捷"仅更新 CLAUDE.md"选项。

**手动选项**：
- `/oh-my-claudecode:omc-setup --local` 仅更新项目配置
- `/oh-my-claudecode:omc-setup --global` 仅更新全局配置
- `/oh-my-claudecode:omc-setup --force` 重跑完整向导（重新配置偏好）

这确保你获得最新功能与代理配置，而无需承担重复完整设置所带来的 token 开销。
