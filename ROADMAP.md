# Doge Code 产品进化计划

> 从"能用"到"不可或缺"——三步走战略
>
> 创建日期: 2026-07-30

---

## 当前势能盘点

### 已验证能力
- 核心引擎：QueryEngine + 适配工具 + SSE 流式响应（稳定）
- 消息渲染：虚拟滚动 + 增强 Markdown（表格/代码高亮已修复）
- 面板生态：MonacoEditor / GitDiff / ToolPanel / Terminal / Debugger 等 32 个组件

### 未被释放的势能
- 各面板**独立运作**，缺乏工作流串联
- AI **被动响应**，不感知项目状态
- 信息**平面展示**，没有上下文优先级

---

## 第一跳：智能上下文工作流

### 目标
让 Doge Code 从"聊天工具"变成"编程工作台"——根据当前工作状态自动调整界面。

### 核心洞察
用户的使用场景不是"聊天"，而是**"编码 → 测试 → 提交 → 部署"的闭环**。当前各面板是孤立的功能，需要让它们根据**当前工作状态自动串联**。

### 具体方案

| 模式 | 触发条件 | 自动调整 |
|------|----------|----------|
| **编码模式** | 选择 `.ts`/`.py` 文件 | 打开 MonacoEditor + ToolPanel，底栏显示 Terminal |
| **调试模式** | 检测到 `Error:`/`Traceback:` | 右侧切换 Debugger + Terminal |
| **审查模式** | 检测到 Git changes | 右侧切换 GitDiff + ReviewPanel |
| **项目管理** | 检测到 `TODO`/任务描述 | 右侧切换 Kanban + TimeTracker |

### 实施路径
1. 在 `App.tsx` 新增 `useWorkflowMode` hook
2. 监听 `selectedFile`、`lastAssistantMessage`、`gitStatus` 变化
3. 根据模式自动 `setShowXxxPanel(true/false)`
4. 用户可手动锁定模式（避免自动切换干扰）

### 预期效果
- 用户打开项目 → 自动进入"编码模式"
- 测试失败 → 自动进入"调试模式"
- 无需手动切换面板，**工作流自然流动**

### 工作量评估
- **文件改动**: `desktop/src/renderer/App.tsx` (新增 hook), `desktop/src/renderer/hooks/useWorkflowMode.ts` (新建)
- **预计工时**: 1-2 天
- **风险**: 低（纯前端逻辑，不涉及核心引擎）

---

## 第二跳：预测性 AI 助手

### 目标
让 AI 从"问答式"变成"伙伴式"——在用户需要之前就准备好信息。

### 核心洞察
优秀的编程助手应该是**"结对编程伙伴"**，而非"搜索引擎"。AI 应该在用户表达需求之前，就基于上下文提供建议。

### 具体方案

| 预测场景 | 触发信号 | 自动准备 |
|-----------|-----------|-----------|
| **预读文件** | 用户 hover 消息中的文件路径 | 后台读取，点击时立即展示 |
| **测试建议** | 检测到新函数/类 | 提示"是否生成测试？" |
| **重构机会** | 检测到重复代码 (> 3 次) | 在消息流中插入重构建议 |
| **依赖警告** | 检测到 outdated package | 消息流中插入更新提示 |
| **性能瓶颈** | 检测到 O(n²) 循环 | 提示"考虑使用 Map 优化" |

### 实施路径
1. 在 `streamProcessor` 新增 `preAnalysis` 阶段
2. AI 流式输出前，先执行轻量静态分析
3. 分析结果作为"系统提示"注入消息流
4. 用户可以一键采纳（自动执行工具调用）

### 预期效果
- AI 变成"结对编程伙伴"，而非"搜索引擎"
- 减少用户的"我该问什么"的认知负担

### 工作量评估
- **文件改动**: `src/engine/streamProcessor.ts` (新增 preAnalysis), `desktop/src/renderer/components/InlineSuggestion.tsx` (新建)
- **预计工时**: 3-5 天
- **风险**: 中（需要改造流式处理逻辑）

---

## 第三跳：操作快照 + 一键回滚

### 目标
让用户敢于执行高风险操作——所有操作都有"安全网"。

### 核心洞察
编程的常态是"试错"，当前工具执行失败时只能"重新执行"。如果所有操作都有**快照 + 回滚**能力，用户可以大胆尝试。

### 具体方案

| 操作类型 | 快照内容 | 回滚能力 |
|-----------|-----------|-----------|
| **文件编辑** | 编辑前版本 | 一键恢复原文件 |
| **Bash 命令** | 当前目录状态 | 撤销 git checkout |
| **重构** | 修改前 AST | 自动还原所有更改 |

### 实施路径
1. 在 `toolExecutor.ts` 新增 `beforeSnapshot` / `afterSnapshot` 机制
2. 文件操作：保存前 5 个版本（git diff 格式）
3. Bash 操作：执行前 `git stash --include-untracked`
4. 在消息流中插入"操作历史"卡片（类似 VS Code 的 Local History）

### 预期效果
- 用户敢于执行高风险操作（批量重构、删除文件）
- 工具执行失败不再是"灾难"，而是"可恢复的事件"

### 工作量评估
- **文件改动**: `desktop/src/main/toolExecutor.ts` (新增 snapshot), `desktop/src/renderer/components/OperationHistory.tsx` (新建)
- **预计工时**: 5-7 天
- **风险**: 中高（需要 git 集成和版本管理）

---

## 竞品分析

> 基于 2026 年 10 大编程 AI Agent 深度调研（详见 gnreport.txt）

### 横向对比矩阵

| 特性 | Claude Code | Copilot | Cursor | Replit | Devin | Windsurf | Aider | OpenHands | SWE-agent | Cline | OpenCode | Bolt.new | v0.dev | Amazon Q | Doge Code |
|------|:-----------:|:-------:|:------:|:------:|:-----:|:--------:|:-----:|:---------:|:---------:|:-----:|:--------:|:--------:|:------:|:--------:|:---------:|
| 自主性 | 高 | 中 | 高 | 高 | 极高 | 高 | 高 | 高 | 中高 | 高 | 中 | 中 | 中 | 中 | 高（目标） |
| 上下文深度 | 全仓库 | 代码库索引 | 全仓库 | 项目级 | 全仓库 | 全仓库 | 全仓库 | 全仓库 | 全仓库 | 代码库 | 项目级 | 单项目 | 单文件 | 代码库 | 全仓库 |
| 支持 IDE | CLI | 全主流 | Cursor | 浏览器 | 网页 | Windsurf | CLI | 网页/CLI | CLI | VS Code | CLI | 浏览器 | 网页 | 全主流 | CLI + Electron GUI |
| 多模型支持 | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 开源 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ MIT | ✅ MIT | ✅ MIT | ✅ 开源 | ✅ 开源 | ❌ | ❌ | ❌ | 目标 ✅ |
| 离线使用 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 企业部署 | 自托管 | ✅ | ✅ | ✅ | ✅ | ✅ | 自部署 | ✅ | 自部署 | ✅ | 自部署 | ✅ | ❌ | ✅ | 自托管 |
| 定价最低 | API 计费 | $10/月 | 免费 | 免费 | 企业级 | $15/月 | 免费 | 免费 | 免费 | 免费 | 免费 | 免费 | 免费 | 免费 | API 计费 |
| Git 集成 | ✅ 原生 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 深度 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ 原生 |
| Web 部署 | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |

### 关键趋势洞察

1. **自主性竞赛**：Devin > OpenHands ≈ Cursor Agent ≈ Claude Code ≈ Windsurf Cascade > Aider/Cline > Copilot
2. **开源替代已成熟**：OpenHands 和 SWE-agent 在 SWE-bench 上已接近商业级（Devin ~53%），Cline 成为 VS Code 用户零成本首选
3. **定价策略分化**：Windsurf 主打"免费补全 + 低价 Agent"；Cursor 走"AI-native IDE"订阅；Copilot 走 GitHub 生态绑定
4. **架构趋势**：从"代码补全" → "对话式编程" → "自主 Agent 循环" → "多 Agent 并行协作"
5. **隐私与合规**：Windsurf（零数据留存）、Aider/OpenHands（完全离线/自托管）、Amazon Q（VPC 部署）在企业市场各有优势
6. **生态锁定**：GitHub（Copilot）、AWS（Amazon Q）、Vercel（v0.dev）通过 AI 工具加深生态绑定

### 开源工具深度对比

| 工具 | 定位 | SWE-bench | 上手难度 | 适合人群 |
|------|------|-----------|----------|----------|
| OpenHands | 开源版 Devin | ~50% | 中 | 开发者/研究者 |
| SWE-agent | 学术标杆 | ~50% | 低 | 学术研究 |
| Cline | VS Code Agent | 未公开 | 极低 | VS Code 用户 |
| Aider | Git 中心 CLI | ~38% | 中 | 高级开发者 |
| OpenCode | 轻量 Claude Code 替代 | 未公开 | 低 | CLI 爱好者 |
| Agentless | 无 Agent 批量修复 | ~33% | 低 | 大规模修复 |

### Doge Code 差异化定位

| 维度 | 竞品现状 | Doge Code 定位 |
|------|----------|----------------|
| 运行形式 | CLI-only (Claude Code/Aider) 或 IDE-only (Cursor/Copilot) | **终端 + Electron GUI 双形态**，兼顾效率与可视化 |
| 自主性 | Devin 最强但仅网页端 | 终端原生自主 Agent + 桌面可视化控制 |
| 模型支持 | 多数绑定单一/少数模型 | **多模型热切换**（Claude/GPT/Gemini/DeepSeek/Qwen） |
| 开源 | OpenHands/Cline/Aider 等已成熟（MIT） | **开源优先**，核心引擎透明可审计，Electron GUI 增强体验 |
| 中文优化 | 无竞品深度支持 | **中文场景深度优化**（编码规范、注释生成、文档翻译） |
| 生态锁定 | GitHub/AWS/Vercel 深度绑定 | **生态中立**，不绑定任何云平台 |
| 离线能力 | 仅 Aider/Claude Code | **离线模式**：本地 LSP + 本地模型（Ollama） |
| 定价 | 订阅制 $10-40/月 | **API 按量计费 + 开源免费自托管** |

---

### 关键结论

1. **开源替代已经成熟**：OpenHands 和 SWE-agent 在 SWE-bench 上已经接近商业级（Devin）
2. **自主性分层**：Devin > OpenHands ≈ Cursor Agent > Claude Code ≈ Aider > Copilot
3. **隐私/合规需求选开源**：OpenHands + 本地模型（Ollama/Llama）可实现完全离线
4. **学术研究选 SWE-agent**：可复现、轻量、benchmark 标准化
5. **VS Code 用户选 Cline**：零成本、功能全、社区活跃

---

## 边界条件与配置架构

### 上下文窗口管理

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 上下文窗口上限 | 200K tokens | 与 Claude Code 持平，超过时自动摘要 |
| 单文件最大读取 | 100KB | 超大文件自动截断，提示用户分段 |
| 代码库索引深度 | 项目根目录下 3 层 | 可配置 include/exclude 规则 |
| 上下文刷新策略 | 每次用户消息全量注入 | 关键系统提示持久化，对话历史滑动窗口 |

### 多文件编辑能力

| 能力 | 实现方式 | 边界条件 |
|------|----------|----------|
| 单文件编辑 | Monaco executeEdits | 原子操作，失败自动回滚 |
| 多文件协调 | Agent 循环 + FileWriteTool | 每文件独立原子操作，全部成功才提交 |
| 并发编辑冲突 | 乐观锁（文件 mtime 检测） | 检测到冲突时提示用户选择 |
| 批量重构 | 先分析 AST，再批量修改 | 支持 dry-run 预览 + 确认执行 |

### 自定义模型支持

| 配置层级 | 可配置项 | 说明 |
|----------|----------|------|
| 全局预设 | 默认模型、API key、代理设置 | `~/.doge/config.json` |
| 项目覆盖 | 项目级模型、系统提示词 | `.doge/config.json`（git 忽略） |
| 任务级别 | 单次对话指定模型 | 命令行 `--model` 参数 |

**内置 Preset 系统**：
- `claude-default`：Sonnet 4.5，平衡速度与质量
- `claude-power`：Opus 4，最高质量（复杂任务）
- `fast-cheap`：Haiku / GPT-4o-mini，快速轻量任务
- `local-ollama`：本地 Ollama 模型，完全离线

### 数据隐私承诺

| 模式 | 数据流向 | 适用场景 |
|------|----------|----------|
| 在线模式 | 代码片段 → API → AI → 返回 | 常规开发 |
| 离线模式 | 本地 LSP + Ollama | 敏感代码/无网络 |
| 混合模式 | 元数据上云 + 代码本地 | 企业部署 |

**隐私策略**：
- 不存储用户代码内容（仅存储匿名使用统计）
- 支持完全离线使用（Aider 级别的离线能力）
- 企业部署支持 VPC / 私有网络
- 所有 API 通信 HTTPS 加密

### 技术规格边界

| 维度 | 支持范围 | 说明 |
|------|----------|------|
| 支持语言 | Python, JS/TS, Go, Rust, Java, C/C++, Ruby, PHP, Shell, SQL 等 | 基于 LLM 能力，理论上支持所有主流语言 |
| IDE 类型 | 终端 CLI + Electron GUI | 中期考虑 VS Code 插件扩展 |
| 操作系统 | Windows, macOS, Linux | Electron 跨平台 + CLI 原生 |
| 最低硬件 | 4GB RAM, 2 核 CPU | Electron GUI 模式；CLI 模式 2GB 即可 |
| 网络要求 | 在线模式需互联网 | 离线模式仅需本地 Ollama |

### 定价策略

| 方案 | 价格 | 包含内容 |
|------|------|----------|
| 开源自托管 | 免费 | 完整功能，仅支付 API 费用 |
| 在线使用 | API 按量计费 | $3-15/M tokens（取决于模型） |
| 企业部署 | 定制报价 | 私有部署 +  SLA + 技术支持 |

## 推荐执行顺序

```
现在 → 第一跳：智能上下文工作流 (1-2 天)
      ↓
2 周 → 第二跳：预测性 AI 助手 (3-5 天)
      ↓
1 个月 → 第三跳：操作快照 + 回滚 (5-7 天)
      ↓
长期 → 插件市场 + 工作流模板 (生态)
```

**竞品对标节奏**：
- Phase 1 对标 Cursor（工作流自动切换 + Tab 补全 + 内联编辑）✅ 进行中
- Phase 2 对标 Claude Code（自主 Agent 循环 + 代码库深度理解）
- Phase 3 对标 Devin（端到端自主开发 + 测试闭环）

---

## 决策点

- [x] **确认优先级**：三跳并行实施（P0-1 Tab补全、P0-2 内联编辑、P0-3 Agent编排层）
- [x] **确认范围**：MVP 优先，核心功能先行
- [ ] **确认开源策略**：核心引擎 MIT 开源，Electron GUI 闭源
- [ ] **确认模型策略**：多模型热切换 vs 绑定单一模型
- [ ] **确认时间线**：第一跳 MVP 7 月底完成；第二跳 8 月中旬；第三跳 8 月底

---

## 后续行动

1. **完成第一跳 MVP**：Tab 补全 + 内联编辑 + Agent 编排层（进行中）
2. **创建竞品对标分支**：每个 Phase 独立 Git 分支
3. **每个 MVP** 包含：核心功能 + 最小测试 + 文档更新
4. **收集用户反馈**后迭代：每个 Phase 完成后收集 1 周反馈再推进下一 Phase
5. **竞品监控**：每月更新 gnreport.txt，跟踪竞品新功能

---

## 备注

- 本计划基于 2026-07-30 的项目状态
- 所有工作量评估均为初步估算，实际开发中可能需要调整
- 建议每个方向完成 MVP 后，先收集用户反馈再继续迭代
- 竞品分析详见 gnreport.txt（2026 年 10 大编程 AI Agent 详细对比）

