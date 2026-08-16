# Phase 17: 高星项目功能吸收（续）

> 2026-08-16 | 来源: .github/ 目录分析 + TODO_feature_absorption_plan.md

## 目标
从 .github/ 高星项目中吸收剩余未实现的高价值功能，优先中文版，英文版改写为 TS。

## 来源项目分析

### 未吸收功能清单

| 项目 | Stars | 功能 | 状态 |
|------|-------|------|------|
| PR-Agent | 9k | CI/CD工作流集成 | 待实现 |
| GenericAgent | 13k | 自进化技能树 | 待实现 |
| oh-my-pi | 18k | /advisor 顾问模式 | 待实现 |
| oh-my-pi | 18k | /recall 回忆历史对话 | 待实现 |
| oh-my-pi | 18k | Hash-anchored edits | 待评估 |
| Browser-Use | 16k | Self-healing harness 增强 | 已有基础，可增强 |

## 执行计划

### 17.1 /advisor 顾问模式（2h）
- **来源**: can1357/oh-my-pi (⭐18k)
- **功能**: 内建顾问，提供代码改进建议、最佳实践推荐
- **复用**: 已有 advisor 工具 + cost-tracker + health-score
- **实现**:
  - `src/commands/advisor/index.ts` — 命令定义
  - `src/commands/advisor/advisor.ts` — `call()` 实现
  - 参数: `--focus <area>` 指定领域（code/architecture/performance/security）
  - 输出: 建议列表 + 优先级 + 改进方向
- **测试**: advisor.test.ts

### 17.2 /recall 回忆历史对话（1.5h）
- **来源**: can1357/oh-my-pi (⭐18k)
- **功能**: 从历史会话中搜索和回忆相关对话
- **复用**: memory-search 已有跨会话搜索 + session-search 工具
- **实现**:
  - `src/commands/recall/index.ts` — 命令定义
  - `src/commands/recall/recall.ts` — `call()` 实现
  - 参数: `--query <text>` 搜索关键词；`--session <id>` 指定会话
  - 输出: 匹配的对话片段 + 上下文
- **测试**: recall.test.ts

### 17.3 CI/CD 工作流集成（2h）
- **来源**: Codium-ai/pr-agent (⭐9k)
- **功能**: PR 自动触发代码审查 + CI 状态监控
- **复用**: ship 命令已有 CI 监控 + code-review-assistant 已有审查能力
- **实现**:
  - 增强 `src/commands/ship/ship-ci-review-loop.ts`
  - 新增: `/ship pr-review <pr-number>` — 自动审查 PR
  - 新增: `/ship ci-status` — 监控 CI 状态
- **测试**: 集成到 ship-ci-review-loop.test.ts

## 验证
- 每项完成后运行相关测试
- 最终编译验证: `npx tsc --noEmit --skipLibCheck`
- 更新 TASK.md

## 执行顺序
1. 17.1 /advisor（2h）
2. 17.2 /recall（1.5h）
3. 17.3 CI/CD 集成（2h）

**总计**: ~5.5h
