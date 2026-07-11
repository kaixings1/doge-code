---
name: netresearch-agents-skill
description: | Netresearch 的 Agent 规则技能（agent-rules）。用于创建/更新 AGENTS.md、 .github/copilot-instructions.md 等 AI Agent 规则文件，将 AI Agent 接入项目、 标准化 Agent 文档。当提及 AGENTS.md、agent rules、项目接入或代码库文档时使用。
license: MIT AND CC-BY-SA-4.0
source: https://github.com/netresearch/agent-rules-skill
version: "3.13.1"
compatibility: 需要 bash 4.3+, jq 1.7+, git 2.0+
allowed-tools: Bash(git:*) Bash(jq:*) Bash(grep:*) Bash(find:*) Bash(bash:*) Read Glob Grep
--- # AGENTS.md 生成器技能（Netresearch agent-rules） 按照 [agents.md 约定](https://agents.md/) 生成并维护 AGENTS.md 文件。AGENTS.md 是给
**Agent** 看的，不是给人看的。 ## 何时使用 - 为新/已有项目创建或更新 AGENTS.md
- **脚手架新仓库** —— 在初始提交就附带 AGENTS.md；事后补需要做完整复验
- 跨仓库标准化 Agent 文档
- 代码变更后检查 AGENTS.md 是否过期
- 将 AI Agent 接入陌生代码库 ## 脚本 | 脚本 | 用途 |
|------|------|
| `scripts/generate-agents.sh PATH` | 生成 AGENTS.md 文件 |
| `scripts/validate-structure.sh PATH` | 校验结构合规 |
| `scripts/check-freshness.sh PATH` | 检查文件是否过时 |
| `scripts/verify-content.sh PATH` | 核实文档内容与代码库一致 |
| `scripts/verify-commands.sh PATH` | 核实文档命令可执行 |
| `scripts/score-agents.sh PATH` | 对 AGENTS.md 质量评分（由差到好） |
| `scripts/detect-project.sh PATH` | 探测语言、版本、构建工具 |
| `scripts/detect-scopes.sh PATH` | 识别需要 scoped 文件的目录 |
| `scripts/extract-commands.sh PATH` | 从构建配置提取命令 |
| `scripts/extract-ci-rules.sh PATH` | 提取 CI 质量门与版本矩阵 |
| `scripts/extract-architecture-rules.sh PATH` | 提取模块边界 |
| `scripts/extract-adrs.sh PATH` | 提取架构决策记录（ADR） |
| `scripts/extract-github-rulesets.sh PATH` | 提取 GitHub rulesets 与合并规则 | 完整选项见 `references/scripts-guide.md`。 ## 工作流 1. **探测**：`detect-project.sh` + `detect-scopes.sh` 识别技术栈与子系统
2. **提取**：`extract-commands.sh`、`extract-ci-rules.sh` 等收集事实
3. **生成**：`generate-agents.sh --style=thin`（默认）或 `--verbose`
4. **验证**：`verify-content.sh` + `verify-commands.sh` —— 完成前**必须**执行 使用 `--update` 保留 `<!-- GENERATED -->` 标记之外的人工整理内容。 ## 核心原则 - **结构化优于散文** —— 表格比段落解析更快
- **绝不编造** —— 只记录存在的内容；逐条核实命令与路径
- **指针原则** —— 指向文件，不重复内容
- **自动符号链接** —— 默认建立 CLAUDE.md/GEMINI.md 符号链接 ## 参考文档 `references/` 下含：verification-guide（验证步骤/反膨胀）、scripts-guide（脚本选项）、
quality-rubric（质量评分标准）、ai-tool-compatibility（16 种 Agent 兼容矩阵）、
output-structure（根/作用域章节）、git-hooks-setup（钩子框架）、examples/（完整示例）、
ai-contribution-guidelines（AI 贡献的"3 Cs"框架）、directory-coverage（scoped 文件覆盖理由）。 ## 模板 根：默认 `assets/root-thin.md` 或 `root-verbose.md`。作用域：`assets/scoped/`，每种技术栈一个
（Go/PHP/Python/TYPO3/Symfony/Oro/CLI/TS/skill-repo）。 ## 支持的项目 Go、PHP（Composer/Laravel/Symfony/TYPO3/Oro）、TypeScript（React/Next/Vue/Node）、
Python（pip/poetry/ruff/mypy）、Skill 仓库、混合（自动作用域）。 ## 相关 - [agent-harness-skill](https://github.com/netresearch/agent-harness-skill) —— Agent 就绪测试框架（CI 强制）
- [skill-repo-skill](https://github.com/netresearch/skill-repo-skill) —— skill 仓库结构（plugin.json、许可、发布） > 来源：https://github.com/netresearch/agent-rules-skill （v3.13.1，MIT AND CC-BY-SA-4.0）
