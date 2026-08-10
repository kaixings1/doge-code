# doge-code 命令模板吸收分析

> 分析时间: 2026-08-10
> 数据来源: D:\doge-code\.claude\commands\*.md
> 现有系统: D:\doge-code\src\commands\

## 一、分析概览

- 命令模板总数: ~338
- 已读取并分析: ~40 个核心命令
- 推荐吸收: 10 个
- 建议保留观察: 5 个
- 标记 YAGNI: 其余

## 二、评分维度说明

| 维度 | 权重 | 说明 |
|------|------|------|
| Novelty (新颖性) | 25% | 与现有 CLI 工具相比的独特性 |
| Practicality (实用性) | 30% | 日常开发中的实际价值 |
| Integrability (可集成性) | 25% | 与 doge-code 现有系统的兼容度 |
| Complexity (复杂度) | 20% | 实现和维护成本 |

评分: 1-5 分，5 分为最高

## 三、核心命令模板清单

| 命令 | 简短描述 | 新颖性 | 实用性 | 可集成性 | 复杂度 | 综合评分 | 建议 |
|------|----------|--------|--------|----------|--------|----------|------|
| cost-report | Generate cost report from ECC cost-tracker metrics log | 4 | 4 | 4 | 3 | **4.0** | 吸收 |
| ship | Complete PR workflow from commit to production | 3 | 5 | 4 | 4 | **4.1** | 吸收 |
| evolve | Analyze instincts and create evolved commands/skills/agents | 5 | 3 | 3 | 4 | **3.8** | 吸收 |
| auto | Intelligent command router based on keywords and priority | 4 | 4 | 4 | 3 | **3.9** | 吸收 |
| dedupe | Find duplicate GitHub issues using multi-agent search | 4 | 3 | 3 | 4 | **3.4** | 观察 |
| resume-session | Load and resume previous session with full context | 3 | 5 | 4 | 3 | **3.9** | 吸收 |
| ship-ci-review-loop | CI and review monitor loop with mandatory feedback addressing | 3 | 5 | 4 | 4 | **4.0** | 吸收 |
| perf | Performance investigation with baseline, profiling, and constraints | 4 | 4 | 4 | 3 | **3.9** | 吸收 |
| explain | Get work item and explain in plain language | 3 | 4 | 3 | 2 | **3.1** | 吸收 |
| compact | Prepare OMC context for manual Claude Code /compact | 3 | 3 | 3 | 2 | **2.8** | 观察 |

## 四、Top 10 最值得吸收的命令模板

### 1. cost-report

**核心功能:**
- 从 ECC cost-tracker 的 metrics log 生成 Claude Code 成本报告
- 按天、模型、会话汇总支出
- 支持 CSV 导出

**建议位置:**
- 现有: `D:\doge-code\src\commands\cost\`
- 扩展: 在现有 cost 命令下增加 `report` 子命令

**实现方案:**
- 读取 `~/.claude/metrics/costs.jsonl`
- 按 session_id 去重，取最新快照
- 聚合计算: 今日/昨日/总计、按模型分布、近7天趋势
- 输出: 终端报告 + CSV 导出选项

**技术栈:** Node.js (已有成本追踪基础设施)

---

### 2. ship (完整部署工作流)

**核心功能:**
- 端到端 PR 工作流: commit → PR → CI → review → merge → deploy → validate → production
- 自动适配 CI 平台、部署平台、分支策略
- 包含 Phase 4 强制 CI/Review Monitor Loop

**建议位置:**
- 现有: `D:\doge-code\src\commands\deploy\`
- 扩展: 新增 `ship` 命令作为 deploy 的超集

**实现方案:**
- 拆分为 ship 主命令 + ship-ci-review-loop + ship-deployment + ship-error-handling
- ship 主命令: 协调各阶段
- ship-ci-review-loop: 强制等待 3 分钟 + 循环检查 CI/review 评论
- ship-deployment: 多环境部署验证
- ship-error-handling: 回滚与错误恢复

**技术栈:** Bash + gh CLI + git

---

### 3. evo�lve (直觉进化系统)

**核心功能:**
- 分析项目中的直觉 (Instincts)
- 将相关直觉聚类为更高级别的结构
- 生成 Commands / Skills / Agents

**建议位置:**
- 新增: `D:\doge-code\src\commands\evolve\`
- 独立命令，不依赖现有系统

**实现方案:**
- 读取 `~/.claude/instincts/` 下的直觉文件
- 按触发器/领域模式分组
- 识别技能候选 (2+ 直觉的集群)
- 识别命令候选 (高置信度工作流)
- 识别代理候选 (大规模集群)
- 支持 `--generate` 参数生成文件

**技术栈:** Node.js + 聚类算法

---

### 4. auto (智能命令路由器)

**核心功能:**
- 根据用户输入自动选择最合适的命令
- 基于优先级和语义权重进行最佳匹配
- 透明展示选择逻辑

**建议位置:**
- 新增: `D:\doge-code\src\commands\auto\`
- 作为命令入口层，不替换现有命令

**实现方案:**
- 定义优先级规则表 (P0-P4)
- 关键词匹配 + 语义权重计算
- 冲突处理: 优先级优先 > 精确优先 > 上下文优先 > 询问确认
- 输出选择结果 + 备选命令
- 调用对应命令的完整流程

**技术栈:** TypeScript + 规则引擎

---

### 5. resume-session (会话恢复)

**核心功能:**
- 加载最近的会话文件并恢复工作
- 输出结构化简报: 项宮/当前状态/未尝试方案/下一步
- 支持日期/文件路径参数

**建议位置:**
- 现有: `D:\doge-code\src\commands\session-search.ts`
- 扩展: 新增 `resume` 子命令

**实现方案:**
- 读取 `~/.claude/session-data/*.tmp` 或 `~/.claude/sessions/`
- 解析会话文件，提取: 项目/状态/失败方案/下一步
- 输出固定格式简报
- 等待用户确认下一步操作

**技术栈:** TypeScript + 文件解析

---

### 6. ship-ci-review-loop (CI/Review Monitor Loop)

**核心功能:**
- 强制等待 3 分钟让 auto-reviewers 评论
- 循环检查 CI 状态 + PR 评论
- 分类处理: code_fix_required / style_suggestion / question / false_positive
- 迭代直到零未解决评论

**建议位置:**
- 作为 ship 的子模块
- 文件: `D:\doge-code\src\commands\ship\ci-review-loop.ts`

**实现方案:**
- gh API 查询 CI checks + review threads
- 分类 heuristics: 问题标记 / nit / 样式建议 / 误报
- 调用 ci-fixer agent 修复代码问题
- GraphQL mutation 解决评论线程
- 配置: MAX_ITERATIONS=10, INITIAL_WAIT=180s, ITERATION_WAIT=30s

**技术栈:** Bash + gh CLI + GraphQL

---

### 7. perf (性能调查工作流)

**核心功能:**
- 基线测量 + 性能断点识别
- 约束定义 + 假设检验
- 系统化性能优化流程

**建议位置:**
- 新增: `D:\doge-code\src\commands\perf\`

**实现方案:**
- Phase 1: 识别性能约束 (latency/throughput/memory)
- Phase 2: 建立基线 (benchmark)
- Phase 3: 识别瓶颈 (profiling)
- Phase 4: 优化假设 (hypothesis-driven)
- Phase 5: 验证改进 (before/after)
- 输出: 性能报告 + 优化建议

**技术栈:** TypeScript + 性能分析工具集成

---

### 8. explain (工作项通俗解释)

**核心功能:**
- 获取工作项 (GitHub Issue / Azure DevOps Work Item)
- 用 1-2 句通俗语言概括
- 将验收标准转化为具体行动列表
- 解释商业/用户价值
- 标记范围/风险

**建议位置:**
- 现有: `D:\doge-code\src\commands\issue\`
- 扩展: 新增 `explain` 子命令

**实现方案:**
- 解析 `$ARGUMENTS` 提取工作项 ID
- 调用 GitHub/Azure DevOps API 获取工作项详情
- 提取: 标题/描述/验收标准/子项/父项
- 生成通俗摘要 + 行动列表 + 价值解释 + 风险标记

**技术栈:** TypeScript + GitHub/Azure DevOps API

---

### 9. ship-error-handling (部署错误处理)

**核心功能:**
- 分类错误: GitHub CLI 不可用 / CI 失败 / 合并冲突 / 部署失败
- 自动恢复策略
- 生产环境失败自动回滚

**建议位置:**
- 作为 ship 的子模块
- 文件: `D:\doge-code\src\commands\ship\error-handling.ts`

**实现方案:**
- 错误类型枚举 + 恢复策略映射
- CI 失败: 自动修复 + 重跑
- 合并冲突: 提示手动解决或自动 rebase
- 部署失败: 自动回滚到上一个稳定版本
- 日志记录 + 通知

**技术栈:** TypeScript + 部署平台 API

---

### 10. ship-deployment (多环境部署)

**核心功能:**
- 自动检测部署平台 (Railway/Vercel/Netlify/GitHub Actions)
- 多环境部署: Development → Staging → Production
- 健康检查 + 冒烟测试
- 生产验证失败自动回滚

**建议位置:**
- 作为 ship 的子模块
- 文件: `D:\doge-code\src\commands\ship\deployment.ts`

**实现方案:**
- Phase 7: 部署到 Development
- Phase 8: 验证 Development (health check + smoke test)
- Phase 9: 部署到 Production
- Phase 10: 验证 Production (auto-rollback on failure)
- 平台适配器模式

**技术栈:** TypeScript + 部署平台 API

---

## 五、吸收原则与实现规范

### 1. YAGNI 原则

- 只吸收高频率使用、高价值的命令模板
- 避免过度设计，优先最小可行实现
- 保留扩展点，但不�现未来可能需要的功能

### 2. 最小改动原则

- 不替换现有代码，以配置开关或依赖注入方式集成
- 新增命令作为独立模块，不修改核心命令调度器
- 保留现有命令的完整功能，新功能以子命令形式添加

### 3. 实现规范

- 新命令文件: `D:\doge-code\src\commands\<command-name>\index.ts`
- 主逻辑: `D:\doge-code\src\commands\<command-name>\<command-name>.ts`
- 类型定义: `D:\doge-code\src\commands\<command-name>\types.ts` (如需要)
- 注册入口: `D:\doge-code\src\commands\<command-name>\register.ts` (如需要)

### 4. 测试要求

- 每个新命令必须有对应的测试文件
- 测试位置: `D:\doge-code\src\commands\<command-name>\<command-name>.test.ts`
- 覆盖核心流程 + 边界条件

## 六、观察保留命令

| 命令 | 原因 | 触发条件 |
|------|------|----------|
| dedupe | GitHub-specific, multi-agent complexity | 当 doge-code 添加 issue triage 系统时 |
| compact | OMC-specific, low standalone value | 当 doge-code 添加 context management 系统时 |
| audit-project | Multi-agent review, high complexity | 当 doge-code 添加 project review 系统时 |
| prp-implement | Legacy workflow, 被 plan/implement 覆盖 | 当 prp 系统重构时 |
| model-route | Multi-model routing, 被现有 model 命令覆盖 | 当 model 系统扩展时 |

## 七、排除命令 (YAGNI)

以下命令因以下原因被排除:

- **Legacy shims**: agent-sort, devfleet, context-budget (已被 skill 系统覆盖)
- **平台-specific**: ars-* (学术研究), cs-* (客服工程), bmad-* (BMAD 方法论)
- **过度设计**: weather-orchestrator, sciomc, karpathy-check
- **重复功能**: commit-and-pr, commit-push-pr, create-pr (已被 commit + pr 覆盖)
- **语言-specific**: cpp-build, go-build, rust-build (应通过 build-fix 统一处理)
- **框架-specific**: flutter-build, react-build, gan-build (应通过 build 统一处理)

## 八、实现优先级

| 优先级 | 命令 | 工作量 | 价值 |
|--------|------|--------|------|
| P0 | cost-report | 2 天 | 高 |
| P0 | resume-session | 2 天 | 高 |
| P1 | ship (主流程) | 5 天 | 高 |
| P1 | ship-ci-review-loop | 3 天 | 高 |
| P2 | auto | 4 天 | 中 |
| P2 | evolve | 5 天 | 中 |
| P2 | perf | 3 天 | 中 |
| P3 | explain | 2 天 | 中 |
| P3 | ship-deployment | 3 天 | 中 |
| P3 | ship-error-handling | 2 天 | 中 |

## 九、总结

推荐吸收 **10 个**命令模板，按优先级分为 P0/P1/P2/P3 四级实现。

核心吸收原则:
1. **不替换现有代码** - 以配置开关或依赖注入方式集成
2. **最小可行实现** - 遵循 YAGNI，优先核心流程
3. **保留扩展点** - 为未来功能预留接口，但不实现
4. **独立模块化** - 新命令作为独立模块，不修改核心调度器

最高优先级: **cost-report** + **resume-session** (2+2 天即可交付高价值功能)
