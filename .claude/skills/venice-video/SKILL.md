---
name: Venice 视频
description: "Venice 视频 — 通过 Venice.ai API 进行视频生成和转录工作流。"
triggers:
  - "venice video"
  - "venice video gen"
  - "venice transcribe"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/veniceai/skills"
---

# Venice 视频

> 精选自 Venice.ai 团队。

## 功能

通过 Venice.ai API 进行视频生成和转录工作流。

## 来源

- 上游：https://github.com/veniceai/skills
- 分类：`video-generation`

## 使用方法

此目录条目在 Open Design 中发布技能信息，以便代理在规划期间发现它。要运行完整的上游工作流及其原始资源、脚本和参考文件，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 查看上游 README 了解确切路径
open https://github.com/veniceai/skills
```

然后要求代理通过名称（`venice-video`）或此技能 frontmatter 中列出的触发短语之一调用此技能。
