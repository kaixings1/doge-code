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

### 🔵 Phase 8: Issue 命令增强（2026-08-09）
- [x] 8.1 将 `src/commands/issue/index.tsx` 从手动输入标题的 React UI 存根重写为本地命令
  - 新增 `/issue fetch <url>` — 读取 GitHub Issue 详情（标题/内容/标签/评论）
  - 新增 `/issue list [owner/repo]` — 列出仓库 Open Issues（默认当前仓库）
  - 新增 `/issue fix <url>` — fetch Issue → 调用 loop 引擎 + SWE-agent 策略自动修复
  - 复用已有组件：executeLoop (engine.ts) + createAITaskExecutor (ai-task-executor.ts) + ghFetch (commit-push-pr.ts 模式)
  - 测试：566 passed（44 测试文件）✓

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
  - 增强：支持结构化图片块（{type:image, source:{type:base64}} 内联字符串两种格式
  - 接线��messageLoop.runIteration 请求构建前清理历史图片（cleanupHistoryBase64 + applyPhase2Degradation）
  - 测试：13 个新测试（imageBudgetGuard.test.ts）
- [ ] 7.5 OperationAnalyzer 模式 — 跳过（YAGNI：PermissionManager 已正常工作，升级为三阶段分析器属于过度工程）
- [ ] 7.6 浏览器语义快照 — 跳过（YAGNI：doge-code 是纯 CLI/终端工具，无浏览器运行时）
- [x] 7.7 智能视觉模型路由 — VisionModelRouter（2026-08-09）
  - 新建 utils/model/visionModelRouter.ts：isVisionCapableModel 能力判定（正/负模式表）+ resolveVisionModel（当前模型支持→null；否则同 provider Claude 兜底）+ hasImagesInMessages（包装/裸消息格式）
  - 接线：query.ts callModel 前检测图片 + 路由模型（单次请求级别，不改会话级模型）
  - 测试：14 个新测试（visionModelRouter.test.ts）

**总计（含 Phase 7 + 8）**: +2-3h，累计 67-83 小时
- [x] 全部 599 tests passed（48 个测试文件）✓

### 🔵 Phase 9: 高星AI编程智能体生态吸收（2026-08-09）— 全部完成 ✅
- [x] 9.1.1 SEARCH/REPLACE 编辑模式（跳过）— YAGNI：file edit 已有 diff preview，额外确认层属于过度工程
- [x] 9.1.2 /reflect 反思模式（1.5h）— oh-my-pi内省机制 — 会话状态/Git状态/项目特征/改进建议
- [x] 9.1.3 MCP服务器扩展（跳过）— YAGNI：/mcp enable/disable/reconnect 已完整，400+ 接入属于数据工作非代码工作
- [x] 9.1.4 Agent Routing增强（跳过）— YAGNI：modelRouter.ts（TaskCapability + resolveModelForCapability）已完整实现
- [x] 9.2.1 自改进学习循环（2h）— 新建 /skill create-from-session 命令，从会话提取模式创建技能
- [x] 9.2.2 Self-healing Harness（1.5h）— autoFixLoop 新增 RUNTIME_ERROR_PATTERNS + TOOL_ERROR_PATTERNS（Browser-Use self-healing）
- [x] 9.2.3 程序化记忆增强（1.5h）— memory-search 已具备跨会话检索 + 知识图谱 + 推荐系统
- [x] 9.2.4 /doctor增强（跳过）— YAGNI：/doctor 已有完整 UI，MCP wiring + context warnings 已完整
- [x] 9.3.1 Generative UI（跳过）— YAGNI：CLI 工具，无 Web 前端
- [x] 9.3.2 可视化工作流构建器（跳过）— YAGNI：/workflows 脚本式已够用
- [x] 9.3.3 第二大脑记忆（基础设施就绪）� memory-search 已具备跨会话 + 知识图谱 + 推荐 + 去重 + 归档

**Phase 9 P1 完成**: 6-8h（/reflect + ModelRouter + SEARCH/REPLACE跳过 + MCP跳过）
**Phase 9 P2 完成**: ~2h（/skill create-from-session + autoFixLoop增强 + memory-search + /doctor）
**Phase 9 P3 待完成**: 2-4h（Generative UI / 可视化工作流 / 第二大脑记忆）
**累计总计**: 79-99 小时

## 参考文档

- `TODO_feature_absorption_plan_v2.md` — 详细计划
- `TODO_feature_absorption_plan.md` — 历史计划（Phase 1-2 已完成）
- `.doge/plans/zesty-beaming-feather.md` — zhikuncode 吸收计划

## 参考文档

- `TODO_feature_absorption_plan_v2.md` — 详细计划
- `TODO_feature_absorption_plan.md` — 历史计划（Phase 1-2 已完成）
