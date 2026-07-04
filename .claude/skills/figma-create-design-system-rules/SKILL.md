---
name: figma-create-design-system-rules
description: "Figma Create Design System Rules — Figma Create Design System Rules 相关功能和最佳实践"
  为 Figma 到代码的工作流生成项目特定的设计系统规则。用于在一个源中捕获令牌、命名和代码检查规则。
triggers:
  - "figma rules"
  - "design system rules"
  - "figma to code rules"
  - "figma tokens"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-create-design-system-rules

> 整理自 Figma 的 MCP 服务器指南。

## 功能说明

为 Figma 到代码的工作流生成项目特定的设计系统规则。用于在一个源中捕获令牌、命名和代码检查规则。

## 来源

- 上游：https://github.com/figma/skills
- 分类：`figma`

## 使用方法

此目录项在 Open Design 中宣传技能，以便代理在规划期间发现它。要运行包含原始资源、脚本和参考的完整上游工作流，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 检查上游 README 获取确切路径
open https://github.com/figma/skills
```

然后让代理通过技能名称（`figma-create-design-system-rules`）或此技能 frontmatter 中列出的触发短语之一来调用此技能。
