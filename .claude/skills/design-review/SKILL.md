---
name: 设计审查相关功能和最佳实践
description: "Design Review — 设计审查相关功能和最佳实践"
  会编码的设计师：视觉审计，然后通过原子提交和前后截图进行修复。适用于在发布前收紧已交付的 UI。
triggers:
  - "design review"
  - "visual audit"
  - "before after"
  - "pre launch design check"
od:
  mode: design-system
  category: creative-direction
  upstream: "https://github.com/garrytan/gstack"
---

# 设计审查

> 来自 Garry Tan (gstack) 的精选。

## 功能

会编码的设计师：视觉审计，然后通过原子提交和前后截图进行修复。适用于在发布前收紧已交付的 UI。

## 来源

- Upstream: https://github.com/garrytan/gstack
- Category: `creative-direction`

## 使用方法

This catalogue entry advertises the skill in Open Design so the agent
discovers it during planning. To run the full upstream 工作流 with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/garrytan/gstack
```

Then ask the agent to invoke this skill by name (`design-review`) or with
one of the trigger phrases listed in this skill's frontmatter.
