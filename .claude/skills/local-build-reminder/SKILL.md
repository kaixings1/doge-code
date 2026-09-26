---
name: local-build-reminder
description: 在编辑 TypeScript 后从本地 fork 运行时提醒用户重新构建 OMC。
level: 1
---

# 本地构建提醒

**面向 OMC fork 开发的常驻提醒。** 当 OMC 以本地
模式运行时（HUD 显示带 `L` 后缀的 `[OMC#X.Y.ZL]`），Claude Code 加载的是
`dist/` 中编译好的 JavaScript —— 而不是 `src/` 中的 TypeScript 源码。对 `.ts`
文件的改动，在 `npm run build` 重新生成
`dist/` 之前，对正在运行的插件都是不可见的。

## 何时触发这一技能

只要出现**下列任一情况**，AI 就应当提到这条提醒：

1. 用户（或 AI 自己）刚刚编辑了本仓库中的 `src/**/*.ts`。
2. 用户在 TS 编辑之后问“为什么我的改动没生效？”/“我改了 X，但表现还是一样的”。
3. 用户即将重启 Claude Code，而工作区存在 TS 改动却没有重新构建。
4. 用户运行某条 OMC 命令，并期望看到与某处 TS 改动相关的新行为。

## 该说什么

给出一句明确的提示，紧接着给出准确的命令。不要每一轮都重复
这条提醒 —— 每“轮”TS 编辑提醒一次就够了。例如：

> 提醒一下：你改了 `src/...`。在重启
> Claude Code 之前先运行 `npm run build` —— 否则 `dist/` 不会反映这次改动。

如果一连编辑了多个 TS 文件，只在最后提醒一次即可。

## 何时不该提醒

- 用户只编辑了 `.mjs` / `.cjs` / `.md` / `.json` —— 这些直接从
  磁盘加载，不需要构建。
- 用户所在的 Claude Code 会话并没有在本地运行 OMC
  （HUD 中没有 `L`）。
- 后台已经在运行 `tsc --watch` / `npm run dev:full`
  —— 它们会在保存时自动重新构建。
- 用户只是问了一个不相关的问题；不要把这条提醒硬塞进
  偏离主题的回复里。

## 文件类型速查表

| 路径                           | 重启会读到改动吗？       | 需要构建吗？ |
| ------------------------------ | ---------------------- | ------------ |
| `src/**/*.ts`                  | 仅在构建之后           | **需要**     |
| `templates/hooks/**/*.mjs`     | 会                     | 不需要       |
| `scripts/**/*.mjs` / `*.cjs`   | 会                     | 不需要       |
| `skills/**/SKILL.md`           | 会                     | 不需要       |
| `agents/**/*.md`               | 会                     | 不需要       |
| `commands/**/*.md`             | 会                     | 不需要       |
| `.claude-plugin/plugin.json`   | 会（重启 Claude 时）   | 不需要       |
| `docs/**/*.md`                 | 仅影响外观             | 不需要       |

## 一条命令搞定免手动开发

如果用户反复迭代、又懒得记住构建这一步，可以建议：

```powershell
npm run dev:full
```

它会并行运行 `tsc --watch` 以及所有 bridge 构建器 —— 每次保存
都会在一秒内触发重新构建，所以之后只需要 `restart Claude Code`
就够了。

## 检测信号 —— AI 如何知道自己处于“本地模式”

HUD 的 `[OMC#X.Y.ZL]` 后缀就是可见的线索。在程序层面，
检测逻辑位于 `src/lib/version.ts::isRuntimePackageLocal()`，满足以下任一条件即触发：
包根目录存在 `.git/`、包根目录存在 `src/`、包是通过软链接/junction 引入，
或任一上级目录本身是软链接/junction。

在 OMC fork 仓库自身内部运行时，AI 按定义就处于
本地模式 —— 这条提醒始终适用。
