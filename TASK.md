# TASK.md — 当前任务追踪

## 进行中

_无_

## 已完成

_无_

## 待开始（按优先级）

### 🔴 Phase 1: 核心功能补全
- [x] 1.1 实现 code-search 命令（3-4h）— CodeSearchTool + 单元测试
- [x] 1.2 实现 pair 命令（4-5h）
- [x] 1.3 完善 diagram 命令（1-2h）— 静态模板 → 动态代码分析

### 🟡 Phase 2: 测试覆盖提升
- [x] 2.1 命令层单元测试（8-10h）— 9 个文件 / 177 tests 全部通过 ✓
  - [x] cost.test.ts — formatCost / renderBar / parseArgs
  - [x] memorySearch.test.ts — search / stats 分组逻辑
  - [x] healthScore.test.ts — gradeFromScore / computeCategoryScore / 安全规则
  - [x] refactor.test.ts — parseArgs / formatRefactorResult / renderHelp
  - [x] complete.test.ts — renderBar / completeFiles 过滤 / AI suggestions
  - [x] memory.test.ts — parseSubcommand / formatBytes / getTypeLabel
  - [x] diagram.test.ts — collectSourceFiles / extractImports / 格式生成器输出
  - [x] apiDoc.test.ts — 已有（apimake 集成）
  - [x] apiTest.test.ts — 已有（api 测试框架）
- [x] 2.2 集成测试（2-3h）— 3 个文件 / 15 tests 全部通过 ✓
  - [x] integration/command-workflow.test.ts — 5 个关键工作流
- [x] 2.3 E2E 测试（2-3h）— 2 个文件 / 16 tests 全部通过 ✓
  - [x] e2e/workflow.test.ts — 已有
  - [x] e2e/cli-commands.test.ts — 5 个 CLI 端到端行为

### 🟡 Phase 3: 代码质量提升
- [x] 3.1 清理 console.log（2-3h）— 审计结果：src/ 中 0 个 console.log ✓
- [x] 3.2 消除空 catch（1-2h）— 审计结果：src/ 中 0 个空 catch 块（{}) ✓
- [x] 3.3 减少 TODO/FIXME（2-3h）— 审计结果：src/ 中 0 个 TODO/FIXME ✓

### 🟢 Phase 4: 性能优化
- [x] 4.1 消除重复扫描（1-2h）— 创建 scanCache.ts + 应用到 3 个命令 ✓
  - complete/index.ts — 文件路径补全缓存
  - backfill-sessions/index.ts — 会话目录扫描缓存（6 次 → 1 次）
  - diagram/index.ts — 项目目录扫描缓存
- [x] 4.2 异步 I/O（2-3h）— CLI 命令为单次执行模型，同步 I/O 无并发压力，skip
- [x] 4.3 正则优化（1h）— 审计结果：batch-han 循环中 RegExp 为翻译必要行为，无需优化 ✓

### 🔵 Phase 5: 新特性吸收
- [ ] 5.1 实时协作编辑（5-6h）
- [ ] 5.2 智能代码解释（3-4h）
- [ ] 5.3 自动化重构建议（3-4h）
- [ ] 5.4 上下文感知搜索（2-3h）
- [ ] 5.5 智能错误修复（2-3h）

**总计**: 41-58 小时

## 参考文档

- `TODO_feature_absorption_plan_v2.md` — 详细计划
- `TODO_feature_absorption_plan.md` — 历史计划（Phase 1-2 已完成）
