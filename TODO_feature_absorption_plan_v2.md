# Doge Code 新特性吸收计划 v2.0

> 基于 2025-2026 年顶级编程代理研究 + 代码库深度审计
> 创建时间: 2026-08-09
> 状态: 🚀 执行中

---

## 📊 代码库现状评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | 6/10 | 11/13 核心命令已实现，2 个为空目录 |
| 实现质量 | 7/10 | 大部分功能完整，但存在模拟实现 |
| 测试覆盖 | 2/10 | 32 个测试文件，但命令层几乎无覆盖 |
| 性能 | 5/10 | 存在重复扫描、同步 I/O、正则性能问题 |
| 代码质量 | 4/10 | 198 TODO、730 console.log、44 空 catch |
| 文档 | 5/10 | 项目级完整，命令级不足 |

**关键问题**：
1. ❌ `code-search` 和 `pair` 命令为空目录
2. ⚠️ `plugin-market` 是模拟实现（硬编码数据）
3. ⚠️ `diagram` 的 c4/sequence/class 模式返回静态模板
4. ❌ 命令层测试覆盖率 < 5%
5. ⚠️ 大量 console.log 和空 catch 影响可维护性

---

## 🎯 执行计划（按优先级）

### 🔴 Phase 1: 核心功能补全（预计 8-12 小时）

#### 1.1 实现 code-search 命令
- **来源**: Bloop、Tabby、Continue.dev
- **目标**: 完成 `src/commands/code-search/` 的实现
- **功能**: regex/semantic/hybrid/symbol 四模式搜索，30+ 语言过滤
- **复用**: 已有 `src/utils/codeIndexing.ts`、`src/utils/semanticSearch.ts`
- **状态**: ⏳ 待开始

#### 1.2 实现 pair 命令
- **来源**: GitHub Copilot Workspace、OpenHands
- **目标**: 完成 `src/commands/pair/` 的实现
- **功能**: 双 Agent 协作模式（review/coauthor/debug/deep）
- **复用**: 已有 `src/engine/subagent/` 框架
- **状态**: ⏳ 待开始

#### 1.3 完善 diagram 命令
- **目标**: 将 c4/sequence/class 模式从静态模板改为动态生成
- **改进**:
  - c4: 基于 AST 分析生成真实的 C4 容器图
  - sequence: 基于函数调用链生成时序图
  - class: 基于类定义生成类图
- **状态**: ⏳ 待开始

---

### 🟡 Phase 2: 测试覆盖提升（预计 12-16 小时）

#### 2.1 命令层单元测试
- **目标**: 为核心命令添加单元测试
- **优先级**: cost > memory > api-debug > health-score > refactor
- **目标覆盖率**: 命令层 > 60%
- **状态**: ⏳ 待开始

#### 2.2 集成测试
- **目标**: 为关键工作流添加集成测试
- **场景**: code-review → fix → commit 完整流程
- **状态**: ⏳ 待开始

#### 2.3 E2E 测试
- **目标**: 为高频命令添加 E2E 测试
- **场景**: /cost、/memory、/code-review-assistant
- **状态**: ⏳ 待开始

---

### 🟡 Phase 3: 代码质量提升（预计 6-8 小时）

#### 3.1 清理 console.log
- **目标**: 将生产代码中的 console.log 替换为结构化日志
- **范围**: src/main.tsx (97处)、src/cli/handlers/mcp.tsx (25处)
- **状态**: ⏳ 待开始

#### 3.2 消除空 catch
- **目标**: 为所有空 catch 块添加错误日志
- **范围**: 44 处空 catch
- **状态**: ⏳ 待开始

#### 3.3 减少 TODO/FIXME
- **目标**: 解决或移除 198 个 TODO/FIXME
- **优先级**: src/commands/ 目录下的 TODO
- **状态**: ⏳ 待开始

---

### 🟢 Phase 4: 性能优化（预计 4-6 小时）

#### 4.1 消除重复扫描
- **目标**: 优化 health-score 的 scanDirectory（避免两次遍历）
- **预期提升**: 大项目扫描速度提升 50%
- **状态**: ⏳ 待开始

#### 4.2 异步 I/O
- **目标**: 将同步文件操作改为异步
- **范围**: diagram、health-score、database 命令
- **状态**: ⏳ 待开始

#### 4.3 正则性能优化
- **目标**: 优化 health-score 中的正则规则
- **改进**: 使用非贪婪匹配、预编译正则
- **状态**: ⏳ 待开始

---

### 🔵 Phase 5: 新特性吸收（预计 15-20 小时）

#### 5.1 实时协作编辑
- **来源**: Cursor、Windsurf、VS Code Live Share
- **功能**: 多人实时编辑同一文件，光标位置同步
- **技术**: WebSocket + CRDT
- **状态**: ⏳ 待研究

#### 5.2 智能代码解释
- **来源**: GitHub Copilot、Amazon Q Developer
- **功能**: 选中代码 → AI 生成自然语言解释
- **触发**: 右键菜单或快捷键
- **状态**: ⏳ 待研究

#### 5.3 自动化重构建议
- **来源**: Cursor、Qodo
- **功能**: 实时检测代码异味，提供一键重构
- **集成**: 与现有 refactor 命令结合
- **状态**: ⏳ 待研究

#### 5.4 上下文感知的代码搜索
- **来源**: Bloop、Tabby
- **功能**: 基于当前编辑文件的上下文进行语义搜索
- **改进**: 自动推断用户意图，无需手动输入查询
- **状态**: ⏳ 待研究

#### 5.5 智能错误修复
- **来源**: GitHub Copilot、Amazon Q
- **功能**: 编译错误/运行时错误 → 自动分析 → 提供修复建议
- **集成**: 与现有 errors 命令结合
- **状态**: ⏳ 待研究

---

## 📋 执行状态追踪

| Phase | 任务 | 预计工时 | 状态 | 备注 |
|-------|------|----------|------|------|
| **Phase 1** | 1.1 code-search 命令 | 3-4h | ✅ 已完成 | 复用已有 codeIndexing |
| | 1.2 pair 命令 | 4-5h | ✅ 已完成 | 复用 subagent 框架 |
| | 1.3 diagram 完善 | 1-2h | ✅ 已完成 | AST 动态生成 |
| **Phase 2** | 2.1 命令层单元测试 | 8-10h | ✅ 已完成 | 9 文件 / 177 tests |
| | 2.2 集成测试 | 2-3h | ✅ 已完成 | 3 文件 / 15 tests |
| | 2.3 E2E 测试 | 2-3h | ✅ 已完成 | 2 文件 / 16 tests |
| **Phase 3** | 3.1 清理 console.log | 2-3h | ✅ 已完成 | src/ 中 0 个 |
| | 3.2 消除空 catch | 1-2h | ✅ 已完成 | src/ 中 0 个 |
| | 3.3 减少 TODO | 2-3h | ✅ 已完成 | src/ 中 0 个 |
| **Phase 4** | 4.1 消除重复扫描 | 1-2h | ✅ 已完成 | health-score |
| | 4.2 异步 I/O | 2-3h | ✅ 已完成 | diagram/health-score |
| | 4.3 正则优化 | 1h | ✅ 已完成 | health-score |
| **Phase 5** | 5.1 实时协作 | 5-6h | ✅ 已完成 | CRDT + Lamport 时钟 |
| | 5.2 智能代码解释 | 3-4h | ✅ 已完成 | AST + 知识图谱 + LLM |
| | 5.3 自动化重构建议 | 3-4h | ✅ 已完成 | executeExtract + autoFixable |
| | 5.4 上下文感知搜索 | 2-3h | ✅ 已完成 | 语义搜索增强 |
| | 5.5 智能错误修复 | 2-3h | ✅ 已完成 | suggestFix + applyFixToFile |
| **Phase 7** | 7.1 ContextCascade | 2-3h | ✅ 已完成 | 五层级联压缩 |
| | 7.2 AutoFixLoop | 2-3h | ✅ 已完成 | 结构化修复解析器 |
| | 7.3 ContextCollapse | 2-3h | ✅ 已完成 | 三级渐进折叠 |
| | 7.4 图片预算守卫 | 1-2h | ✅ 已完成 | TokenBudgetGuard |
| **Phase 8** | 8.1 Issue 命令增强 | 1-2h | ✅ 已完成 | fetch/list/fix + loop 引擎集成 |

**总计**: 41-58 小时

---

## 🔄 更新日志

- 2026-08-09: 基于代码库深度审计创建 v2.0 计划
- 2026-08-09: Phase 1-5 全部完成（代码搜索、pair 命令、测试 566 passed、性能优化、新特性吸收）
- 2026-08-09: Phase 7 zhikuncode 深度特性吸收完成（ContextCascade/AutoFixLoop/ContextCollapse/图片预算守卫）
- 2026-08-09: Phase 8 Issue 命令增强完成（fetch/list/fix + loop 引擎 + SWE-agent 策略集成）
