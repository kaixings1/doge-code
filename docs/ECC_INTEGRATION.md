# ECC (Everything Claude Code) 整合清单 整合日期：2026-06-24
来源：`D:/OpenSourceGit/everything-claude-code`
官方仓库：https://github.com/affaan-m/ECC ## 整合内容 ### Agents（智能体）
- **来源**: `ECC/agents/*.md` → `Doge/.claude/agents/`
- **原数量**: 17个（Doge原生）
- **新增**: 67个（ECC专有）
- **总数**: 85个
- **语言专项**: TypeScript, Python, Rust, Go, Java, Kotlin, Swift, C++, C#, Dart, Flutter, PHP, F#, Vue
- **框架专项**: React, Django, FastAPI, Spring Boot, PyTorch, Next.js, Kotlin Ktor/Exposed
- **领域专项**: 网络架构/安全, 数据库, DevOps, 无障碍(A11y), 医疗健康, HarmonyOS
- **AI/ML**: MLE Reviewer, ML Workflow, Gan Evaluator/Generator/Planner
- **工作流**: Architect, Planner, Chief of Staff, Spec Miner, Loop Operator, Harness Optimizer ### Skills（技能）
- **来源**: `ECC/.agents/skills/` → `Doge/.claude/skills/`
- **新增5个独有技能**: 1. `benchmark-methodology` — 竞品基准评分方法论 2. `brand-discovery` — 品牌身份发现（含8个参考文档） 3. `competitive-platform-analysis` — 竞争格局分析 4. `competitive-report-structure` — 竞争报告结构 5. `mle-workflow` — 机器学习工程工作流 ### Commands（命令）
- **来源**: `ECC/.claude/commands/` → `Doge/.claude/commands/`
- **新增**: `add-language-rules`, `database-migration`, `feature-development` ### Rules（规则）
- **来源**: `ECC/.claude/rules/` → `Doge/.claude/rules/`
- **新增**: `everything-claude-code-guardrails.md`, `node.md` ## 使用方式 agent和skill复制后即可使用。Doge会自动扫描 `.claude/agents/` 和 `.claude/skills/` 目录。 ## 后续可扩展 ECC还包含271个在agent.yaml中声明的技能（部分已通过`.claude/skills/`覆盖），以及92个命令shim。
