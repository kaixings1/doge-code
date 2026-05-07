# Skill 技能清单

## 技能分类

### 1. 开发任务技能（Rigids）

#### 1.1 开发任务技能
- **dedupe** — 发现重复的 GitHub Issues
- **triage-issue** — 通过分析和应用标签来分派 GitHub Issues
- **agent-sdk-dev:new-sdk-app** — 创建和设置新的 Claude Agent SDK 应用程序
- **code-review** — 审查拉取请求
- **update-config** — 使用 settings.json 配置 Claude Code harness
- **playground** — 创建交互式 HTML 游乐场
- **simplify** — 审查更改后的代码以提高复用性、质量和效率
- **commit-push-pr** — Commit, push 和打开 PR

#### 1.2 技能开发技能
- **superpowers-developing-for-claude-code:developing-claude-code-plugins** — 构建、修改、测试和发布 Claude Code 插件
- **superpowers-developing-for-claude-code:working-with-claude-code** — 使用 Claude Code CLI、插件、钩子、MCP 服务器、技能和配置
- **agentforce-adlc:developing-agentforce** — 构建、修改、调试和部署 Agents 的 Agentforce Agent Script
- **agentforce-adlc:testing-agentforce** — 编写、运行和审查结构化测试套件
- **agentforce-adlc:observing-agentforce** — 使用会话记录和 Data Cloud 分析生产 Agentforce 行为

#### 1.3 调试技能
- **debugging** — 调试问题并修复错误

### 2. 领域技能（Flexible）

#### 2.1 Qt/C++开发技能
- **qt-development-skills:qt-cpp-docs** — 生成任何 Qt/C++ 源文件的独立 Markdown 参考文档
- **qt-development-skills:qt-qml-docs** — 生成 QML 组件和应用程序的独立 Markdown 参考文档
- **qt-development-skills:qt-cpp-review** — 审查 Qt6 C++ 代码（运行 60+ lint 规则）
- **qt-development-skills:qt-qml-review** — 审查 Qt6 QML 代码（运行 47+ lint 规则）
- **qt-development-skills:qt-qml** — 应用 QML 最佳实践来创建或处理 QML 源代码

### 3. 流程技能（Flexible）

#### 3.1 工作流技能
- **episodic-memory** — 记住对话和过往工作（Episodic Memory）

#### 3.2 高级浏览技能
- **superpowers-chrome:browsing** — 使用 Chrome DevTools Protocol 控制现有浏览器会话

## 技能选择指南

### 何时使用哪个技能？

**开发任务技能（Rigid）** — 当任务明确属于以下类别时：
- 代码审查（code-review）
- 调试问题（debugging）
- 创建 Agent SDK 应用（new-sdk-app）
- 发现重复 Issues（dedupe）
- 分派 Issues（triage-issue）
- 提交代码（commit-push-pr）

**领域技能（Flexible）** — 当任务涉及特定技术领域时：
- Qt/C++ 代码开发或审查 → qt-cpp-docs / qt-cpp-review / qt-cpp
- QML 组件开发或审查 → qt-qml-docs / qt-qml-review / qt-qml

**流程技能（Flexible）** — 当任务涉及工作流程或记忆时：
- 记住对话或过往工作 → episodic-memory
- 需要浏览器控制 → superpowers-chrome:browsing

## 技能优先级

当多个技能可能适用时：

1. **Rigid 技能优先** — 如果任务明确属于某个 Rigid 技能类别，使用该技能
2. **领域技能优先** — 如果任务涉及特定技术领域，使用该领域的技能
3. **流程技能最后** — 如果任务主要是关于工作流程或记忆，使用流程技能

## 技能使用示例

### 示例 1：审查 C++ 代码
用户："请审查这段代码"
→ 使用 **qt-cpp-review** 技能

### 示例 2：调试问题
用户："我的程序出现这个错误"
→ 使用 **debugging** 技能

### 示例 3：创建 Agent SDK 应用
用户："我想创建一个新的 Agent 应用"
→ 使用 **agent-sdk-dev:new-sdk-app** 技能

### 示例 4：记住对话
用户："我想记住关于这个问题的讨论"
→ 使用 **episodic-memory** 技能

### 示例 5：创建交互式游乐场
用户："我需要创建一个可以交互式配置的页面"
→ 使用 **playground** 技能

## 技能使用注意事项

- 在开始任何开发任务之前，检查是否有相关的开发任务技能
- 如果任务涉及特定技术领域，优先考虑领域技能
- 如果任务主要是关于工作流程或记忆，使用流程技能
- 如果不确定哪个技能最合适，可以询问用户或根据任务类型做出最佳判断
