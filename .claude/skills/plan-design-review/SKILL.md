---
name: 设计评审规划
description:  |
  资深设计师评审：对每个设计维度打分 0-10，解释 10 分标准是什么，并标记 AI 生成内容痕迹。适合在合并 UI 工作前作为关卡。
triggers:
  - "plan design review"
  - "senior designer review"
  - "design rating"
  - "ai slop check"
od:
  mode: design-system
  category: creative-direction
  upstream: "https://github.com/garrytan/gstack"
---

# 设计评审规划

> Curated from Garry Tan (gstack).

## 功能说明

资深设计师评审：对每个设计维度打分 0-10，解释满分标准，并标记 AI 生成痕迹。适合在合并 UI 工作前作为关卡。

## 来源

- 上游：https://github.com/garrytan/gstack
- 分类：`creative-direction`

## 使用方法

该目录条目在 Open Design 中宣传此技能，使代理在规划期间发现它。要运行完整的上游工作流及其原始资源、脚本和引用，请将上游 bundle 安装到你的活动代理的技能目录中：

```bash
# 检查上游 README 以了解确切的路径
open https://github.com/garrytan/gstack
```

然后要求代理按名称（`plan-design-review`）或使用此技能 frontmatter 中列出的触发短语之一来调用此技能。
