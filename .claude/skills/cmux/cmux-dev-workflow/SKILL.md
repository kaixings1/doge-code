---
name: cmux-dev-workflow
description: "面向 cmux 贡献者的工作流规则：仓库初始化、Xcode 工程归一化、带 tag 的侧边栏 ExtensionKit 开发，以及开发构建。在初始化 cmux 仓库、改动 Xcode 工程文件、添加侧边栏扩展，或使用带 tag 的调试构建时用。"
---

# cmux 开发工作流

## 初始安装

`./scripts/setup.sh` 会初始化子模块、构建 GhosttyKit，并安装 pbxproj 归一化 pre-commit 钩子。

## 带 tag 的本地开发

每次改完代码都要构建 Debug app：

```bash
./scripts/reload.sh --tag <short-tag>
```

它只构建、不启动；只有确实需要把 app 打开时才传 `--launch`。绝不要直接运行裸的 `xcodebuild`，也不要打开未打 tag 的 `cmux DEV.app`：未打 tag 的构建会与其他 agent 共用默认的调试 socket 和 bundle ID，导致冲突并抢走焦点。

要对带 tag 的 Debug app 做 CLI 或 socket 内部试用：

```bash
CMUX_TAG=<tag> scripts/cmux-debug-cli.sh list-workspaces
```

不要把 `/tmp/cmux-cli` 用于带 tag 的内部试用；那个符号链接指向最近一次重新加载的构建。参见 [references/tagged-builds.md](references/tagged-builds.md)。

## Xcode 工具链

团队锁定在 Xcode 26.x。`.xcode-version` 是主版本号的唯一事实来源；`cmux.xcodeproj/project.pbxproj` 中带的是 `objectVersion = 60`，即 Xcode 26 的默认写入值。（`objectVersion = 77` 保留给同步文件夹分组，cmux 并不使用。）

`scripts/setup.sh` 会安装纳入版本管理的 `scripts/git-hooks/pre-commit`，它会对任何已暂存的 `project.pbxproj` 运行 `scripts/normalize-pbxproj.py`，这样 Xcode 不确定性的重排就永远不会进入提交。该钩子是幂等的。CI 会运行 `scripts/check-pbxproj.sh`，同时强制 `objectVersion` 的锁定值和归一化，所以跳过钩子会得到一个明确的 PR 失败。提升该锁定值是需要团队刻意决策的事：参见 [references/xcode-project-normalization.md](references/xcode-project-normalization.md)。

## 侧边栏扩展点（开发期打 tag）

每个带 tag 的开发构建都有自己专属的 ExtensionKit 侧边栏扩展点，这样并发的开发构建就不会互相撞车。有三个构建设置驱动它：

- `CMUX_SIDEBAR_EXTENSION_POINT_ID`（默认 `com.cmuxterm.app.cmux.sidebar`）：构建时写进 Info.plist 的扩展点标识符。
- `CMUX_BUNDLE_ID_SUFFIX`（默认空）：插入 app 与 appex 的 bundle id，使带 tag 的扩展获得一个 pkd 会单独记录的不同身份。
- `CMUX_DISPLAY_NAME_SUFFIX`（默认空）：追加到 appex 的 `CFBundleDisplayName`。操作系统按显示名称对侧边栏扩展分组，以得出宿主读取的启用/停用与可用数量，所以两个同名的 appex 并排安装时会被当成同一个逻辑扩展，切换其中一个会扰动另一个。

宿主在运行时通过 `CmuxSidebarExtensionPoint.identifier(in:)` 从 Info.plist 键 `CMUXSidebarExtensionPointIdentifier` 解析自己的扩展点 id。`./scripts/reload.sh --tag <tag>` 会把宿主扩展点限定为 `com.cmuxterm.app.debug.<tag>.cmux.sidebar`。用下面的命令构建一个匹配的、按 tag 限定的示例扩展：

```bash
./scripts/reload-extension.sh --tag <tag> [--host-bundle-id <id>] [--example sample|tabs|both]
```

关于它传入的设置、禁止重新签名的规则，以及编写新的、可用于 tag 的示例扩展的检查清单，参见 [references/sidebar-extension-tagging.md](references/sidebar-extension-tagging.md)。
