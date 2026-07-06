---
name: agentkit-seo
description: AgentKit SEO — 将宽泛或模糊的AgentKit SEO工作引导到正确的模块。
user-invocable: true
参数: The specific SEO optimization task or platform to focus on (e.g., GitHub, LinkedIn, CV, etc.)
---

# AgentKit SEO

## 概述

将此技能用作整个仓库的编排器。其主要工作是选择正确的模块技能，避免加载不相关的平台规则，并以合理的顺序安排跨平台工作。

## Routing 工作流

1. Identify the target surface from the 请求.
2. Load only the matching module skill unless the user explicitly asks for a cross-platform pass.
3. If the 请求 spans multiple surfaces, start with `agentkit-seo-agent-context-optimization` so the factual source of truth is stable before editing platform outputs.
4. If the 请求 involves technical issues with the skill system, consult the main repository documentation.

For broad requests with no clear surface:

- Active applications or job-description tailoring: route to `agentkit-seo-cv-ats`.
- Recruiter discovery or profile search: route to `agentkit-seo-linkedin`.
- Proof-of-work, repositories, or developer credibility: route to `agentkit-seo-github` or `agentkit-seo-web-portfolio`, based on the supplied asset.
- Audience building, posting strategy, or public conversation loops: route to `agentkit-seo-x-twitter`.
- Conflicting, scattered, or cross-platform facts: route to `agentkit-seo-agent-context-optimization` first.

## 令牌 discipline

- Route to one module by default.
- Load the agent context file before platform references only when facts, consistency, or cross-surface rewriting matter.
- Prefer public URL inspection, local search, or a compact pasted section over asking the user to dump every asset into the prompt.
- Summarize inspected inputs and ask for the smallest missing input set.
- Do not expand into algorithm explanation unless the user asks why.

## Intake 工作流

- If the user already has an agent context file, ask for or use its explicit path before rewriting platform assets.
- If the task spans multiple surfaces, or the user's facts are scattered, recommend creating or repairing the agent context file first.
- Do not block a narrow one-off edit on a full context file when the supplied material is already enough.
- For public URLs, fetch or inspect public material when tools allow it and cite which source was used.
- For private or login-gated surfaces, ask the user for pasted section text, screenshots, exports, or a local text file instead of guessing.
- If critical facts are missing, ask only for the minimum extra inputs needed to proceed.

## Module map

- LinkedIn work: `agentkit-seo-linkedin`
- GitHub work: `agentkit-seo-github`
- CV or ATS work: `agentkit-seo-cv-ats`
- Web portfolio work: `agentkit-seo-web-portfolio`
- X or Twitter work: `agentkit-seo-x-twitter`
- Personal source-of-truth context work: `agentkit-seo-agent-context-optimization`

## More Information

- **Main Repository**: [https://github.com/agentkit-seo/agentkit-seo](https://github.com/agentkit-seo/agentkit-seo)
- **Documentation**: [https://agentkit-seo.github.io/](https://agentkit-seo.github.io/)
- **Modules**: Includes specialized logic for GitHub, LinkedIn, CV/ATS, Portfolios, and X/Twitter.
