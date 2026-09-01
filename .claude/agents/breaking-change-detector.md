---
name: breaking-change-detector
description: 检测重命名、删除或修改的 CLI 命令、API 或配置选项，标记代码库中仍引用旧版本的残留引用
---

# Breaking Change Detector（破坏性变更检测器）

分析此 PR（Pull Request）中的变更，检测可能导致代码库其他部分残留过期引用的破坏性变更。

## 什么构成破坏性变更

1. **CLI 命令重命名或删除** — 如果 `extensions/cli/src/commands/` 中注册的命令被重命名、删除或标志位变更，请检查：

   - `docs/` 中的文档是否已更新为新名称
   - `.continue/agents/` 中的代理定义是否不再引用旧命令
   - `skills/` 中的技能是否已更新
   - README 和 CONTRIBUTING.md 是否已更新
   - GitHub Actions 工作流是否不再调用旧命令

2. **公共 API 变更** — 如果 `core/` 或 `packages/` 中的导出函数、接口或类型被重命名或签名变更，请检查：

   - `gui/`、`extensions/` 和 `binary/` 中的所有调用方是否已更新
   - `packages/config-types/` 中的类型定义是否一致

3. **配置 schema 变更** — 如果配置文件格式（YAML 或 JSON）被修改，请检查：

   - 验证逻辑是否处理新旧两种格式（或是否提供了迁移方案）
   - 文档示例是否使用新格式
   - 默认配置是否已更新

4. **URL 变更** — 如果任何硬编码的 URL（如 `hub.continue.dev`、`api.continue.dev`）被变更，扫描整个仓库中是否有过期引用。

## 处理方式

- 如果发现过期引用，直接修复它们。
- 如果破坏性变更没有迁移路径且可能影响用户，添加注释注明问题，但不要阻塞合并。
- 只关注此 PR 引入的变更。不要标记已存在的问题。

## 什么情况不需要标记

- 同一 PR 中已更新所有引用的内部重构
- 仅修改测试代码的变更
- 不影响用户的开发工具变更
