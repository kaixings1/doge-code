# 特性吸收集成计划

> 基于20个顶级本地编程代理软件的研究报告生成
> 创建时间: 2026-08-01
> 状态: 🚀 执行中

---

## 📊 研究背景

通过对20个最流行的本地编程代理软件的深度分析（Claude Code, Aider, OpenCode, Cursor, Windsurf, Copilot, Cline, Goose, OpenHands, Devin, Ampcode, Marvin, Bloop, Suzy AI, Amazon Q Developer, Gemini CLI, Codeium CLI, Tabby, Continue.dev, Qodo），提取各自动辄傲的功能特性，集成到本项目（@doge-code/cli）中。

**核心发现**:
- 本项目已具备业界最完整的MCP协议实现（7层配置作用域）
- 终端UI已现代化（React + Ink，流式Markdown，虚拟滚动）
- 桌面端已有Monaco Editor + LSP集成
- 主要改进空间：Diff可视化、块状输出、代码库语义搜索增强

---

## 🎯 执行计划（按优先级）

### 🔴 高优先级（建议立即集成）

#### 1. 并排Diff视图 (Side-by-Side Diff)
- **来源**: GitHub PR、Cursor、现代IDE
- **当前状态**: 本项目使用文本化unified diff
- **改进方向**: 实现side-by-side渲染（类似GitHub PR）
- **参考文件**: `src/desktop-electron/renderer/components/GitDiff.tsx`
- **优先级**: 🔴 P0
- **状态**: ⏳ 待开始
- **预估工时**: 4-6小时

#### 2. 块状结构化输出 (Block-based Output)
- **来源**: Warp
- **当前状态**: 工具输出混合在消息流中
- **改进方向**: 为Bash/Tool输出添加独立的框式边框和折叠按钮
- **参考**: Warp的块状输出设计
- **优先级**: 🔴 P0
- **状态**: ⏳ 待开始
- **预估工时**: 3-4小时

#### 3. Repo Map代码库结构映射
- **来源**: Aider
- **当前状态**: 已有全仓库索引，但缺少结构化映射
- **改进方向**: 实现代码库结构映射（类似tree --dirs-only但附带AI摘要）
- **参考**: Aider的Repo Map功能
- **优先级**: 🔴 P1
- **状态**: ⏳ 待开始
- **预估工时**: 6-8小时

#### 4. 流式渲染性能优化
- **来源**: Claude Code (本项目已有基础)
- **改进方向**: Token速度指示�ETA估算、更智能的增量渲染
- **参考**: `src/components/Spinner.tsx`已有token计数基础
- **优先级**: 🔴 P1
- **状态**: ⏳ 待开始
- **预估工时**: 2-3小时

#### 5. 多Tab/会话管理
- **来源**: OpenCode、现代终端
- **改进方向**: 类似tmux的标签页系统，支持会话切换快捷键
- **参考**: OpenCode的多Tab切换
- **优先级**: 🔴 P2
- **状态**: ⏳ 待开始
- **预估工时**: 8-10小时

---

### 🟡 中优先级（建议近期集成）

#### 6. 浏览器自动化能力
- **来源**: Cline、OpenHands
- **改进方向**: 集成Playwright，支持网页调试和E2E测试
- **参考**: Cline的Playwright集成
- **优先级**: 🟡 P1
- **状态**: ⏳ 待开始
- **预估工时**: 10-12小时

#### 7. DuckDB向量存储
- **来源**: Goose
- **改进方向**: 替代或增强现有的代码库索引，提供更快的语义搜索
- **参考**: Goose的DuckDB实现
- **优先级**: 🟡 P1
- **状态**: ⏳ 待开始
- **预估工时**: 8-10小时

#### 8. Git工作流深度集成
- **来源**: Aider
- **改进方向**: 自动commit（AI生成commit message）、自动测试、分支管理
- **参考**: Aider的`/commit`和`/test`命令
- **优先级**: 🟡 P2
- **状态**: ⏳ 待开始
- **预估工时**: 4-6小时

#### 9. 多模态支持（图片预览）
- **来源**: Claude Code（桌面端）、现代AI工具
- **改进方向**: 终端端通过iTerm2/Kitt�y inline image protocol支持
- **参考**: 桌面端已有Monaco Editor，可参考其图片展示
- **优先级**: 🟡 P2
- **状态**: ⏳ 待开始
- **预估工时**: 6-8小时

#### 10. 代码搜索增强
- **来源**: Bloop、Tabby
- **改进方向**: 语义搜索 + 正则组合，支持30+语言
- **参考**: Bloop的语义搜索 + Tabby的RAG补全
- **优先级**: 🟡 P2
- **状态**: ⏳ 待开始
- **预估工时**: 8-10小时

---

### 🟢 低优先级（建议远期规划）

#### 11. 超长上下文窗口支持
- **来源**: Gemini CLI（1M-2M tokens）
- **改进方向**: 支持Gemini 2.0 Flash/Pro模型
- **优先级**: 🟢 P3
- **状态**: ⏳ 待开始
- **预估工时**: 4-6小时

#### 12. Docker沙箱隔离
- **来源**: OpenHands、Devin
- **改进方向**: Agent运行在隔离容器内
- **优先级**: 🟢 P3
- **状态**: ⏳ 待开始
- **预估工时**: 12-15小时

#### 13. AI测试生成
- **来源**: Qodo
- **改进方向**: 自动生成单元测试、E2E测试
- **优先级**: 🟢 P3
- **状态**: ⏳ 待开始
- **预估工时**: 10-12小时

#### 14. 安全扫描
- **来源**: Amazon Q Developer
- **改进方向**: 检测注入漏洞、密钥泄露、依赖漏洞
- **优先级**: 🟢 P3
- **状态**: ⏳ 待开始
- **预估工时**: 8-10小时

#### 15. 多Agent协作
- **来源**: Devin、未来趋势
- **改进方向**: 多个专用Agent协作（规划 + 执行 + 审查）
- **优先级**: 🟢 P4
- **状态**: ⏳ 待开始
- **预估工时**: 15-20小时

---

## 📋 执行状态追踪

| 特性 | 优先级 | 状态 | 开始时间 | 完成时间 | 备注 |
|------|--------|------|----------|----------|------|
| 1. 并排Diff视图 | 🔴 P0 | ✅ 已完成 | - | - | SideBySideDiff.tsx + diff-mode命令 |
| 2. 块状结构化输出 | 🔴 P0 | ✅ 已完成 | - | - | ToolOutputBlock.tsx + block-mode命令 |
| 3. Repo Map | 🔴 P1 | ✅ 已完成 | - | - | createRepoMap + repo-map命令 + 符号分组显示 |
| 4. 流式渲染优化 | 🔴 P1 | ✅ 已完成 | - | - | streamingPerformance设置 + Spinner.tsx runtime toggle |
| 5. 多Tab管理 | 🔴 P2 | ✅ 已完成 | - | - | sessions命令 + 多会话切换 |
| 6. 浏览器自动化 | 🟡 P1 | ✅ 已完成 | - | - | Playwright集成 + browser命令 + 终端inline图片支持 |
| 7. 代码库向量存储 | 🟡 P1 | ✅ 已完成 | - | - | SQLite FTS5 + BM25 + vector-search命令 |
| 8. Git工作流集成 | 🟡 P2 | ✅ 已完成 | - | - | commit.ts + commit-push-pr.ts 已完整实现 |
| 9. 多模态支持 | 🟡 P2 | ✅ 已完成 | - | - | ImageDisplay.tsx + osc.ts image protocol + browser命令集成 |
| 10. 代码搜索增强 | 🟡 P2 | ✅ 已完成 | - | - | code-search命令：regex+semantic+hybrid+symbol模式，30+语言过滤 |
| 11. 超长上下文 | 🟢 P3 | ✅ 已完成 | - | - | Gemini 2.0 Flash(1M)/Pro(2M) 上下文窗口 + 模型名称显示 |
| 12. Docker沙箱 | 🟢 P3 | ✅ 已完成 | - | - | DockerSandboxManager 容器隔离 + 交互式管理 UI |
| 13. AI测试生成 | 🟢 P3 | ✅ 已完成 | - | - | test-gen命令 + 多框架支持(vitest/pytest/go/cargo) + 5轮修复循环 |
| 14. 安全扫描 | 🟢 P3 | ✅ 已完成 | - | - | security-audit命令 + secretScanner(25+ gitleaks规则) + 多规则检测 |
| 15. 多Agent协作 | 🟢 P4 | ✅ 已完成 | - | - | 6个内置Agent(plan/explore/verification/general/guide) + Coordinator模式 + AgentMemory + ForkSubagent |

**图例**:
- ⏳ 待开始
- 🔄 进行中
- ✅ 已完成
- ❌ 已取消
- 🚫 阻塞

---

## 🚀 下一步行动

1. **立即开始**: 特性1（并排Diff视图）- 视觉改进最明显，用户感知最强
2. **并行进行**: 特性2（块状输出）+ 特性4（流式渲染优化）- 都是UI改进
3. **随后进行**: 特性3（Repo Map）- 需要更多设计工作
4. **持续迭代**: 按优先级逐个完成剩余特性

---

## 📚 参考资料

- 20个工具详细分析报告：见对话历史
- MCP生态系统研究：见对话历史
- 终端UI设计分析：见对话历史
- 本项目代码库架构：见对话历史

---

## 🔄 更新日志

- 2026-08-01: 创建计划文件，基于20个顶级编程代理软件研究生成
