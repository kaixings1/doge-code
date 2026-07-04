---
name: venice-audio-music
description: "Venice Audio Music — Venice Audio Music 相关功能和最佳实践"
  Music generation queueing, retrieval, and completion endpoints via Venice.ai. Suited for jingles, background loops, and prototype scoring.
triggers:
  - "venice music"
  - "music gen"
  - "jingle"
  - "background loop"
  - "score"
od:
  mode: audio
  category: audio-music
  upstream: "https://github.com/veniceai/skills"
---

# Venice 音频音乐

> 精选自 Venice.ai 团队。

## 功能

通过 Venice.ai 进行音乐生成排队、检索和完成端点。适用于广告曲、背景循环和原型配乐。

## 来源

- 上游：https://github.com/veniceai/skills
- 分类：`audio-music`

## 使用方法

此目录条目在 Open Design 中发布技能信息，以便代理在规划期间发现它。要运行完整的上游工作流及其原始资源、脚本和参考文件，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 查看上游 README 了解确切路径
open https://github.com/veniceai/skills
```

然后要求代理通过名称（`venice-audio-music`）或此技能 frontmatter 中列出的触发短语之一调用此技能。
