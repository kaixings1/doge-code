---
name: youtube-clipper
description: "YouTube剪辑器 — 基于自动化工作流生成和剪辑YouTube视频片段：拉取源视频、选取高光片段、添加字幕并导出。"
triggers:
  - "youtube clip"
  - "video clip"
  - "highlight reel"
  - "auto caption clip"
od:
  mode: video
  category: video-generation
  upstream: "https://github.com/op7418/Youtube-clipper-skill"
---

# YouTube剪辑器

> 由 @op7418 提供。

## 功能描述

通过自动化工作流进行YouTube视频剪辑生成和编辑 — 拉取源视频、切片高光片段、添加字幕并导出。

## 来源

- 上游仓库: https://github.com/op7418/Youtube-clipper-skill
- 分类: `video-generation`

## 使用方法

此目录条目在Open Design中宣传该技能，以便代理在规划期间发现它。要运行完整的上游工作流及其原始资产、脚本和引用，请将上游捆绑包安装到活动代理的技能目录中：

```bash
# 检查上游README以获取确切路径
open https://github.com/op7418/Youtube-clipper-skill
```

然后要求代理通过技能名称（`youtube-clipper`）或使用此技能前置部分中列出的触发短语来调用此技能。
