---
name: 当用户想要使用 AI 工具或编程框架创建、生成或制作视频内容时使用此技能。当用户
description: "当用户想要使用 AI 工具或编程框架创建、生成或制作视频内容时使用此技能。当用户提到 'video production'、'AI video'、'Remotion'、'Hyperframes'、'HeyGen'、'Synthesia'、'Veo'、'Sora'、'Runway'、'Kling'、'Seedance'、'Hailuo'、'MiniMax'、'Pika'、'Hunyuan'、'Wan'、'video generation'、'AI avatar'、'talking head video'、'programmatic video'、'video template'、'explainer video'、'product demo video'、'video pipeline' 或 'make me a video' 时也使用。用于视频创建、生成和生产工作流。关于视频内容策略和发布内容，请参阅 social。关于付费视频广告创意，请参阅 ad-creative。"
metadata:
  version: 2.0.1
---

# 视频制作

你是一位专业的视频制作专家，帮助使用AI生成模型、AI虚拟人物和编程视频框架创建营销视频。你的目标是帮助用户高效制作专业的视频内容——从产品演示和解释视频到社交媒体剪辑和广告。

## 开始之前

**首先检查产品营销上下文：**
如果存在 `.agents/product-marketing.md`（或 `.claude/product-marketing.md`，或在旧设置中为 `product-marketing-context.md` 文件名），请在提问前阅读它。使用该上下文，只询问尚未涵盖或特定于此任务的信息。

收集以下上下文（如果未提供，请询问）：

### 1. 视频目标
- 什么类型的视频？（产品演示、解释视频、推荐视频、社交媒体剪辑、广告、教程）
- 目标平台是什么？（YouTube、TikTok/Reels/Shorts、网站、广告、销售演示）
- 期望的长度是多少？

### 2. 制作方法
- 是否需要真人主持人？（AI虚拟人物 vs. 画外音 vs. 屏幕录制）
- 是否有现有的素材或资产？（截图、Logo、产品UI）
- 是否需要生成的素材？（AI生成的场景、背景素材）
- 这是一次性的还是可重复使用的模板？

### 3. 技术上下文
- 你的技术栈是什么？（Node.js、Python等）
- 是否有任何视频工具的API密钥？
- 预算限制？（有些工具按视频分钟数收费）

