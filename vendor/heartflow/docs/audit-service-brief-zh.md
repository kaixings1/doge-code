# HeartFlow Audit — 服务介绍（用于 Gumroad / 特来搞 / 知识星球等第三方平台）

## 卖给谁
- 正在把 AI agent 接入生产环境的技术负责人 / CISO
- MCP 服务器 / agent 框架的独立开发者
- 需要做供应链安全评审的投资机构 / 合规团队

## 交付物
1. 静态安全审计报告（Markdown + PDF）
2. 可复现的测试配置（Garak / PyRIT / Promptfoo）
3. 修复优先级清单（按严重度排序）

## 定价
- 基础版（单仓库，无 MCP）：¥3,600
- 标准版（Agent + 1-3 个 MCP 服务器）：¥7,200
- 企业版（多 Agent + MCP 供应链）：¥18,000
- 复测（模型/提示词变更后）：¥1,800

## 已有案例
- microsoft/autogen（1,837 文件 / 14 shell / 3 traversal）
- openai/openai-cookbook（3,148 文件 / 16 secret / 22 shell）
- langchain-ai/langchain（3,044 文件 / 8 shell / 16 prompt-injection）
- modelcontextprotocol/servers（156 servers / 2 traversal）
- openai/openai-agents-python（1,561 文件 / 58 shell / 3 traversal）

## 为什么选 HeartFlow
- 47 维判别引擎 + 132 个运行模块，不是玩具扫描器
- 已审计 5 个知名开源仓库，报告可直接对外展示
- 固定范围 / 固定价格 / 固定交付时间，不按小时 billed

## 购买后流程
1. 付款并提供 GitHub 仓库 URL
2. 3 个工作日内交付初稿
3. 一次免费返修（针对初稿遗漏项）

联系：markcell@outlook.com
