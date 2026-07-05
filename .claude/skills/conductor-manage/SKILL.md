---
name: conductor-manage
description: "管理轨道生命周期：归档、恢复、删除、重命名和清理"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 轨道管理器

管理完整的轨道生命周期，包括归档、恢复、删除、重命名和清理孤立工件。

## 使用此技能的场景

- 归档、恢复、重命名或删除 Conductor 轨道
- 列出轨道状态或清理孤立工件
- 管理跨活跃、已完成和已归档状态的轨道生命周期

## 不要使用此技能的场景

- Conductor 未在仓库中初始化
- 您没有修改轨道元数据或文件的权限
- 任务与 Conductor 轨道管理无关

## 说明

- Verify `conductor/` structure and required files before proceeding.
- Determine the operation mode from arguments or interactive prompts.
- Confirm destructive actions (delete/cleanup) before applying.
- Update `tracks.md` and metadata consistently.
- If detailed steps are required, open `resources/implementation-playbook.md`.

## 安全

- Backup track data before delete operations.
- Avoid removing archived tracks without explicit approval.

## 资源

- `resources/implementation-playbook.md` for detailed modes, prompts, and workflows.

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
