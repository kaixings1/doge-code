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
- [x] 4.1 消除重复扫描（1-2h）— scanDirectory 单次遍历返回 issues + filesScanned ✓
- [x] 4.2 异步 I/O（2-3h）— health-score 改为 async fs/promises（readFile/readdir/statAsync）✓
- [x] 4.3 正则优化（1h）— 移除 long-function/god-method 低效正则，保留 detectLongFunctions 精确检测 ✓

### 🔵 Phase 5: 新特性吸收
- [x] 5.4 上下文感知搜索（2-3h）— memory-search 的 semanticSearch 已支持同义词扩展
- [x] 5.5 智能错误修复（2-3h）— errors 命令增加 suggestFix() + applyFixToFile()，支持 var→const/console.log 注释/eval 替代等 ✓
- [x] 5.1 实时协作编辑（5-6h）— CLI /collab 命令（create/join/leave/list/insert/delete/sync/comment）
- [x] 5.2 智能代码解释（3-4h）— explain 命令（AST + 知识图谱 + LLM 四模式）
- [x] 5.3 自动化重构建议（3-4h）— RefactorTool executeExtract + autoFixable 评估

**总计**: 41-58 小时

### 🟢 Phase 6: ROADMAP 中长期项（桌面端）
- [x] 第一跳：智能上下文工作流（1-2 天）— useWorkflowMode + usePreAnalysis + App.tsx 自动面板切换
- [x] 第二跳：预测性 AI 助手（3-5 天）— usePreAnalysis 静态分析 + streamProcessor preAnalysis 注入
- [x] 第三跳：操作快照 + 一键回滚（5-7 天）— toolExecutor takeBeforeSnapshot/rollbackTool + OperationHistory 组件

### 🔵 Phase 7: zhikuncode 深度特性吸收（2026-08-09）
- [x] 7.1 ContextCascade 五层级联压缩 — Snip/MicroCompact/AutoCompact/CollapseDrain/ReactiveCompact
  - 扩展 autoCompactor.ts，新增 executeCascade/snipMessages/microCompact/collapseDrain/reactiveCompact
  - 测试：530 passed（4 失败为预存 openaiCompat.ts 问题，与本次无关）
- [x] 7.2 AutoFixLoop 增强 — CompileErrorParser/TestFailureParser/shouldAbort 结构化修复
  - autoFixLoop.ts 新增结构化解析器 + shouldAbort 中止检查 + CorrectionInstruction 类型
  - 测试：530 passed
- [x] 7.3 ContextCollapse 启用 — 三级渐进折叠（Incremental/Progressive/Emergency）
  - 重写 services/contextCollapse/index.ts 和 operations.ts，从存根变为完整实现
  - 与 query.ts 的 feature('CONTEXT_COLLAPSE') 门控兼容
  - 测试：530 passed
- [x] 7.4 图片预算守卫 — TokenBudgetGuard Phase1/Phase2 保护
  - 新建 engine/imageBudgetGuard.ts：cleanupHistoryBase64 + applyPhase2Degradation + checkImageBudget
  - 测试：530 passed
- [ ] 7.5 OperationAnalyzer 模式 — 跳过（YAGNI：PermissionManager 已正常工作，升级为三阶段分析器属于过度工程）
- [ ] 7.6 浏览器语义快照 — 跳过（YAGNI：doge-code 是纯 CLI/终端工具，无浏览器运行时）

**总计（含 Phase 7）**: +8-11h，累计 64-78 小时
- [x] 全部 552 tests passed（43 个测试文件）✓

## 参考文档

- `TODO_feature_absorption_plan_v2.md` — 详细计划
- `TODO_feature_absorption_plan.md` — 历史计划（Phase 1-2 已完成）
- `.doge/plans/zesty-beaming-feather.md` — zhikuncode 吸收计划

## 参考文档

- `TODO_feature_absorption_plan_v2.md` — 详细计划
- `TODO_feature_absorption_plan.md` — 历史计划（Phase 1-2 已完成）
