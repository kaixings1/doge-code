# 阶段 1：安装 CLAUDE.md

## 确定配置目标

如果传入了 `--local` 标志，设置 `CONFIG_TARGET=local`。
如果传入了 `--global` 标志，设置 `CONFIG_TARGET=global`。

否则（初始设置向导），使用 AskUserQuestion 提示：

**问题：** "oh-my-claudecode 应该配置在哪里？"

**选项：**
1. **本地（当前项目）** - 在当前项目目录中创建 `.claude/CLAUDE.md`。最适合项目特定的配置。
2. **全局（所有项目）** - 为所有 Claude Code 会话创建 `~/.claude/CLAUDE.md`。最适合在任何地方保持一致的行为。

根据用户的选择将 `CONFIG_TARGET` 设置为 `local` 或 `global`。

如果 `CONFIG_TARGET=global` 且 `~/.claude/CLAUDE.md` 已存在但没有 OMC 标记，在运行设置之前先询问第二个明确的问题：

**问题：** "全局设置将更改您的基础 Claude 配置。您想要哪种行为？"

**选项（默认第一个）：**
1. **覆盖基础 CLAUDE.md（推荐）** - 普通的 `claude` 和 `omc` 都全局使用 OMC。
2. **保留基础 CLAUDE.md；仅通过 `omc` 使用 OMC** - 保留用户的基础文件，将 OMC 安装到 `CLAUDE-omc.md` 中，并在启动时由 `omc` 强制加载该伴随配置。

根据用户的选择将 `GLOBAL_INSTALL_STYLE` 设置为 `overwrite` 或 `preserve`。如果您没有询问此问题，则默认 `GLOBAL_INSTALL_STYLE=overwrite`。

## 通过插件本地协调器安装 CLAUDE.md

**必须执行**：始终运行此命令。不要跳过。不要使用 Write 工具。该脚本是唯一的插件缓存解析器，它会调用所选插件根目录的 `bridge/claude-md-coordinator.cjs`，并附带一个版本化的 JSON 请求。当必需的插件资源、规范源握手、协调器响应验证或协调器退出/`ok` 协议失败时，它会安全失败。

```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-claude-md.sh" <CONFIG_TARGET> [GLOBAL_INSTALL_STYLE]
```

将 `<CONFIG_TARGET>` 替换为 `local` 或 `global`。对于本地安装，省略可选的样式参数。对于全局安装，当您知道用户的选择时传递 `overwrite` 或 `preserve`；否则让脚本默认使用 `overwrite`。

协调器专门执行所有 `CLAUDE.md`、`CLAUDE-omc.md`、托管导入、孤立清理、备份和回滚变更。**不要**手动编写、总结、部分重构、下载或修复任一配置文件。它仅报告协调器创建的精确备份、失败和回滚路径。

本地或全局覆盖安装成功后，验证目标文件是否包含两个标记。在全局保留模式下，验证 `CLAUDE-omc.md` 是否包含两个标记，并且基础 `CLAUDE.md` 是否恰好包含一个托管导入块。停止并报告协调器失败；切勿尝试 shell、下载源或回退变更。

对于 git 仓库内的 `local` 安装，该脚本还会向 `.git/info/exclude` 添加 OMC 块，该块重新包含 `.omc/`，默认忽略本地 `.omc/*` 产物，并保留您打算提交的项目技能的 `.omc/skills/`。

**注意**：设置永远不会在 shell 中下载或合并 CLAUDE.md。它仅使用与完整活动插件根目录捆绑的握手验证规范源。

**注意**：保留模式将 OMC 安装到一个伴随的 `CLAUDE-omc.md` 中，其中包含一个小的托管导入块，而 `omc` 启动时会强制加载该伴随配置，而不会更改普通的 `claude`。

## 报告成功

如果 `CONFIG_TARGET` 是 `local`：
```
OMC 项目配置完成
- CLAUDE.md：由活动插件的协调器在 ./.claude/CLAUDE.md 更新
- Git 排除：将本地 `.omc/*` 忽略规则添加到 `.git/info/exclude`（保留可跟踪的 `.omc/skills/` 用于提交的项目技能）
- 备份：仅当之前的目标需要变更时，协调器报告字节相同的备份
- 范围：项目级 - 仅应用于此项目
- Hooks：由插件提供（无需手动安装）
- Agents：28+ 可用（基础 + 分层变体）
- 模型路由：基于任务复杂度的 Haiku/Sonnet/Opus

注意：此配置是项目特定的，不会影响其他项目或全局设置。
```

如果 `CONFIG_TARGET` 是 `global`：
```
OMC 全局配置完成
- CLAUDE.md：在 ~/.claude/CLAUDE.md 更新，或在显式保留模式下保留
- 伴随文件：在保留模式下可选择安装 ~/.claude/CLAUDE-omc.md
- 备份：仅当全局文件需要变更时，协调器报告字节相同的备份
- 范围：全局级 - 应用于所有 Claude Code 会话
- Hooks：由插件提供（无需手动安装）
- Agents：28+ 可用（基础 + 分层变体）
- 模型路由：基于任务复杂度的 Haiku/Sonnet/Opus

注意：Hooks 现在由插件系统自动管理。无需手动安装 hooks。
```

## 保存进度

```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" save 2 <CONFIG_TARGET>
```

## 标志模式的提前退出

如果使用了 `--local` 或 `--global` 标志，清除状态并**在此停止**：
```bash
bash "${OMC_SETUP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}}/scripts/setup-progress.sh" clear
```
不要继续到阶段 2 或其他阶段。
