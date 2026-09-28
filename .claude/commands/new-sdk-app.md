---
description: 创建并设置新的 Claude Agent SDK 应用
argument-hint: [project-name]
---

你的任务是帮助用户创建新的 Claude Agent SDK 应用程序。请仔细遵循以下步骤：

## 参考文档

开始前先查阅官方文档，确保给出准确且最新的指导。用 WebFetch 阅读以下页面：

1. **先看总览**：https://docs.claude.com/en/api/agent-sdk/overview
2. **根据用户选择的语言，阅读相应的 SDK 参考**：
   - TypeScript：https://docs.claude.com/en/api/agent-sdk/typescript
   - Python：https://docs.claude.com/en/api/agent-sdk/python
3. **阅读总览中提到的相关指南**，例如：
   - Streaming vs Single Mode
   - Permissions
   - Custom Tools
   - MCP integration
   - Subagents
   - Sessions
   - 以及根据用户需求相关的其他指南

**重要**：始终检查并使用包的最新版本。安装前用 WebSearch 或 WebFetch 核实当前版本。

## 收集需求

重要：一次只问一个问题。等用户回答后再问下一个。这样用户更容易作答。

按以下顺序提问（用户已通过参数提供的项可跳过）：

1. **语言**（第一个问）：你想用 TypeScript 还是 Python？

   - 等待回答后再继续

2. **项目名称**（第二个问）：你想给项目起什么名字？

   - 若提供了 $ARGUMENTS，就用它作为项目名并跳过此问
   - 等待回答后再继续

3. **代理类型**（第三个问，若第 2 问回答已足够详细则跳过）：你在构建什么类型的代理？例如：

   - 编码代理（SRE、安全审查、代码审查）
   - 业务代理（客户支持、内容创作）
   - 自定义代理（描述你的用例）
   - 等待回答后再继续

4. **起点**（第四个问）：你希望：

   - 从一个最小的 Hello World 示例开始
   - 一个具备常用功能的基础代理
   - 基于你的用例的特定示例
   - 等待回答后再继续

5. **工具选择**（第五个问）：告知用户你将使用哪些工具，并与他们确认这些就是他们想用的工具（例如，他们可能更偏好 pnpm 或 bun 而非 npm）。执行需求时尊重用户的偏好。

所有问题回答完毕后，开始制定设置计划。

## 设置计划

根据用户的回答，制定包含以下内容的计划：

1. **项目初始化**：

   - 创建项目目录（若不存在）
   - 初始化包管理器：
     - TypeScript: `npm init -y` and setup `package.json` with type: "module" and scripts (include a "typecheck" script)
     - Python: Create `requirements.txt` or use `poetry init`
   - 添加必要的配置文件：
     - TypeScript：创建 `tsconfig.json`，为 SDK 设置合适配置
     - Python：如有需要可选择性创建配置文件

2. **检查最新版本**：

   - 安装前先用 WebSearch 或查看 npm/PyPI 找出最新版本
   - For TypeScript: Check https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
   - For Python: Check https://pypi.org/project/claude-agent-sdk/
   - 告知用户你正在安装哪个版本

3. **SDK 安装**：

   - TypeScript：`npm install @anthropic-ai/claude-agent-sdk@latest`（或指定最新版本）
   - Python：`pip install claude-agent-sdk`（pip 默认安装最新版）
   - 安装后校验已安装的版本：
     - TypeScript: Check package.json or run `npm list @anthropic-ai/claude-agent-sdk`
     - Python: Run `pip show claude-agent-sdk`

4. **创建起始文件**：

   - TypeScript：创建 `index.ts` 或 `src/index.ts`，包含一个基础 query 示例
   - Python：创建 `main.py`，包含一个基础 query 示例
   - 包含正确的导入和基础错误处理
   - 使用最新版 SDK 的现代语法与写法

5. **环境配置**：

   - 创建 `.env.example` 文件，内容为 `ANTHROPIC_API_KEY=your_api_key_here`
   - 把 `.env` 加入 `.gitignore`
   - 说明如何从 https://console.anthropic.com/ 获取 API key

6. **可选：创建 .claude 目录结构**：
   - 提议创建 `.claude/` 目录用于存放 agents、commands 和 settings
   - 询问是否需要示例 subagent 或斜杠命令

## 实施

收集完需求并获得用户对计划的确认后：

1. 用 WebSearch 或 WebFetch 检查包的最新版本
2. 执行设置步骤
3. 创建所有必要文件
4. 安装依赖（始终使用最新稳定版）
5. 校验已安装版本并告知用户
6. 根据他们的代理类型创建一个可运行的示例
7. 在代码中添加有用的注释，解释各部分作用
8. **结束前务必验证代码能跑通**：
   - TypeScript：
     - 运行 `npx tsc --noEmit` 检查类型错误
     - 修复所有类型错误，直到类型完全通过
     - 确保导入和类型正确
     - 只有在类型检查零错误时才继续
   - Python：
     - 校验导入正确
     - 检查基础语法错误
   - **在代码验证成功之前，不要认为设置已完成**

## 验证

所有文件创建完毕且依赖安装好后，使用相应的验证 agent 来确认 Agent SDK 应用已正确配置并可供使用：

1. **TypeScript 项目**：启动 **agent-sdk-verifier-ts** agent 验证设置
2. **Python 项目**：启动 **agent-sdk-verifier-py** agent 验证设置
3. 该 agent 会检查 SDK 用法、配置、功能以及对官方文档的遵循情况
4. 审阅验证报告并处理其中的问题

## 上手指南

设置完成并验证通过后，向用户提供：

1. **后续步骤**：

   - 如何设置他们的 API key
   - 如何运行他们的代理：
     - TypeScript: `npm start` or `node --loader ts-node/esm index.ts`
     - Python: `python main.py`

2. **有用的资源**：

   - TypeScript SDK 参考链接：https://docs.claude.com/en/api/agent-sdk/typescript
   - Python SDK 参考链接：https://docs.claude.com/en/api/agent-sdk/python
   - 解释关键概念：system prompts、permissions、tools、MCP servers

3. **常见后续步骤**：
   - 如何自定义 system prompt
   - 如何通过 MCP 添加自定义工具
   - 如何配置权限
   - 如何创建 subagent

## 重要提示

- **始终使用最新版本**：安装任何包之前，用 WebSearch 或直接查看 npm/PyPI 检查最新版本
- **验证代码能正确运行**：
  - TypeScript：运行 `npx tsc --noEmit`，结束前修复所有类型错误
  - Python：校验语法与导入正确
  - 在代码通过验证之前，不要认为任务已完成
- 安装后校验已安装版本并告知用户
- 查阅官方文档了解任何版本特定要求（Node.js 版本、Python 版本等）
- 创建目录/文件前始终先检查其是否已存在
- 使用用户偏好的包管理器（TypeScript 用 npm、yarn、pnpm；Python 用 pip、poetry）
- 确保所有代码示例可运行且包含正确的错误处理
- 使用与最新 SDK 版本兼容的现代语法与写法
- 让整个过程具备互动性和教学性
- **一次只问一个问题** — 不要在单次回复中抛出多个问题

开始时只问第一个需求问题。等用户回答后再继续下一个问题。
