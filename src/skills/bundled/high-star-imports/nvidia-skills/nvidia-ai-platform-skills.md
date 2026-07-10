---
name: NVIDIA AI 平台技能
description: NVIDIA 官方发布的 AI Agent 技能，用于高效使用 CUDA-X 库、AI Blueprints 和 NVIDIA 加速平台
risk: safe
source: nvidia-skills
--- # NVIDIA AI 平台技能 来自 [nvidia/skills](https://github.com/nvidia/skills) 官方的 AI 平台技能集合。 ## 概述 NVIDIA Skills 是可移植的指令集，教会 AI 代理如何优化使用 NVIDIA 软件，包括：
- CUDA-X 加速库
- AI Blueprints 蓝图
- NVIDIA AI 平台工具链 ## 技能领域 - **CUDA 编程与优化** — GPU 加速计算的最佳实践
- **AI Blueprints** — NVIDIA AI 蓝图部署与定制
- **NVIDIA 平台工具** — 各类 NVIDIA 开发工具的使用指南 ## 使用方法 每个技能以 SKILL.md 格式提供，兼容 Claude Code 和其他支持 Agent Skills 标准的 AI 编码代理。
ENDOFSKILL cat > /d/doge-code/src/skills/bundled/high-star-imports/clerk-skills/clerk-auth-skills.md << 'ENDOFSKILL'
---
name: Clerk 认证技能
description: Clerk 官方 Agent Skills，帮助 AI 编码代理在项目中集成 Clerk 用户认证与身份管理
risk: safe
source: clerk-skills
--- # Clerk 认证技能 来自 [clerk/skills](https://github.com/clerk/skills) 官方的认证集成技能。 ## 概述 Clerk Skills 帮助 AI 编码代理更有效地使用 Clerk 进行用户认证管理，包括：
- 用户注册与登录流程
- 身份管理与会话控制
- 组织与权限管理
- Clerk 组件集成指南 ## 安装方式 ```bash
npx skills add clerk/skills
``` 或直接复制 SKILL.md 到 `.claude/skills/` 目录下使用。
ENDOFSKILL cat > /d/doge-code/src/skills/bundled/high-star-imports/awesome-agent-skills/awesome-agent-skills-collection.md << 'ENDOFSKILL'
---
name: Awesome Agent Skills 合集
description: 社区整理的 Agent Skills 教程、指南和最佳实践合集，涵盖主流 AI 编程助手的技能开发
risk: safe
source: awesome-agent-skills
--- # Awesome Agent Skills 合集 来自 [heilcheng/awesome-agent-skills](https://github.com/heilcheng/awesome-agent-skills) 社区合集。 ## 概述 Agent Skills 是 AI 编程助手的"使用指南"。这个合集整理了各种技能的教程和使用方法，让 AI 能够按需学习新能力。 ## 覆盖范围 - Claude Code Skills 开发指南
- 技能最佳实践与模式
- 多 AI 代理的技能兼容性
- 社区贡献的技能模板 ## 相关资源 - [Agent Skills 规范](https://agentskills.io)
- [Anthropic 官方技能仓库](https://github.com/anthropics/skills)
- [Vercel Skills CLI](https://github.com/vercel-labs/skills)
ENDOFSKILL cat > /d/doge-code/src/skills/bundled/high-star-imports/ai-research-skills/ai-research-skills-library.md << 'ENDOFSKILL'
---
name: AI 研究技能库
description: Orchestra Research 的 AI 科研技能库，支持 AI 代理自主进行文献综述、实验设计到论文写作的全流程科研工作
risk: safe
source: ai-research-skills
--- # AI 研究技能库 来自 [orchestra-research/AI-research-SKILLs](https://github.com/orchestra-research/AI-research-SKILLs) 的科研技能集合。 ## 概述 使 AI 代理能够自主进行端到端的 AI 科研工作： 1. **文献综述 (Literature Survey)** — 系统化搜索和总结相关研究论文
2. **想法生成 (Idea Generation)** — 基于文献分析产生新的研究思路
3. **实验设计 (Experiment Design)** — 设计可执行的实验方案
4. **实验执行 (Experiment Execution)** — 自动化运行实验
5. **论文写作 (Paper Writing)** — 生成结构化的学术论文 ## 适用场景 - AI/ML 研究者的辅助工具
- 自动化科研流程
- 文献调研与综述撰写
- 实验方案设计与验证
ENDOFSKILL echo "ALL skill files created"
