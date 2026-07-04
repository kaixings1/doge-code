---
name: figma-generate-library
description: "Figma Generate Library — Figma Generate Library 相关功能和最佳实践"
  从代码库构建或更新 Figma 中的专业级设计系统库。用于保持 Figma 真实来源与已发布组件同步。
triggers:
  - "figma library"
  - "design system library"
  - "figma from codebase"
  - "sync figma"
od:
  mode: design-system
  category: figma
  upstream: "https://github.com/figma/skills"
---

# figma-generate-library

> 整理自 Figma 的 MCP 服务器指南。

## 功能说明

从代码库构建或更新 Figma 中的专业级设计系统库。用于保持 Figma 真实来源与已发布组件同步。

## 来源

- 上游：https://github.com/figma/skills
- 分类：`figma`

## 使用方法

此目录项在 Open Design 中宣传技能，以便代理在规划期间发现它。要运行包含原始资源、脚本和参考的完整上游工作流，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 检查上游 README 获取确切路径
open https://github.com/figma/skills
```

然后让代理通过技能名称（`figma-generate-library`）或此技能 frontmatter 中列出的触发短语之一来调用此技能。
