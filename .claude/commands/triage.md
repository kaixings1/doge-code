---
description: "分类和分流问题（Bug/改进），通过状态机进行管理，产生可操作的后续步骤"
---

# /triage

使用状态机对 GitHub Issues 进行分类和分流，生成年龄分布、优先级排序和后续操作建议。

## 工作流程

1. 读取 Issue 详情和评论
2. 确定问题类型（bug、feature、question、documentation）
3. 评估优先级（P0、P1、P2、P3）
4. 识别相关的代码区域和文件
5. 提出后续操作建议

## 后续操作

- bug：立即修复或分配给相关团队
- feature：添加到产品路线图
- question：回复用户并提供指导
- documentation：更新相关文档

## 输出格式

提供结构化的 triage 报告，包括：
- 问题摘要
- 类型和优先级
- 相关文件
- 建议的操作
