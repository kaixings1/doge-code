---
description: 规划并执行完整的营销活动。接受产品简介并返回定位、落地页文案、邮件序列、社交帖子、广告变体、视频脚本和内容日历。也可审查现有文案的转化质量。
allowed_tools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch", "Write"]
---

# /marketing-campaign

从简介到完整内容套件，规划并执行营销活动。

## 用法

```
/marketing-campaign                          # Prompt for brief interactively
/marketing-campaign [product brief]          # Full campaign from inline brief
/marketing-campaign copy [type]              # Single deliverable only
/marketing-campaign review [file-or-brief]   # Copy audit for conversion and brand consistency
```

## 此命令做什么

1. **研究** —— 在动笔之前先勾勒目标受众画像并绘制竞品地图
2. **定位** —— 先锁定活动角度和语调画像
3. **文案产出** —— 按正确顺序生成完整内容套件（落地页 → 邮件 → 社交 → 广告 → 视频脚本 → 日历）
4. **审查** —— 所有输出都必须通过转化率和品牌一致性检查清单

## 模式

### 完整活动模式

提供包含以下内容的产品简介：
- 产品名称和描述
- 目标受众（具体，而非泛泛）
- 产品解决的核心问题
- 核心收益 / 成果
- 语调指引
- 所需渠道
- 发布目标或时间线

代理按顺序返回所有活动交付物，末尾附一份文案审查摘要。

### 单一交付物模式

```
/marketing-campaign copy landing-page
/marketing-campaign copy email-sequence
/marketing-campaign copy social-posts
/marketing-campaign copy ads
/marketing-campaign copy video-scripts
```

需要先定义定位。在请求单一交付物之前，先运行完整模式或提供角度。

### 文案审查模式

```
/marketing-campaign review path/to/copy.md
/marketing-campaign review "paste copy here"
```

返回针对以下方面的结构化审计：
- 5 秒清晰度测试（首屏文案）
- CTA 质量（具体、有说服力、每篇一个）
- 品牌语调一致性
- 主张的具体性与可支撑性
- 平台原生适配度
- 跨渠道一致性

## 简介模板

```markdown
Product: [name]
Description: [1-3 sentences on what it does]
Audience: [who, specifically]
Problem: [the specific pain the product solves]
Benefit: [the outcome the user gets]
Tone: [adjectives + what to avoid]
Channels: [landing page, email, LinkedIn, X, ads, video]
Goal: [launch, waitlist, signups, awareness — and timeline]
```

## 输出位置

保存活动资产时，约定为 `.claude/campaigns/{campaign-name}/`：

```
.claude/campaigns/product-launch/
├── positioning.md
├── landing-page.md
├── email-sequence.md
├── social-posts.md
├── ad-copy.md
├── video-scripts.md
└── content-calendar.md
```

写文件前先确认保存位置。

## 示例

```
/marketing-campaign Build a 7-day launch campaign for an AI career platform for UK university students.
```

```
/marketing-campaign copy landing-page
```

```
/marketing-campaign review .claude/campaigns/the-key/landing-page.md
```

## 代理委派

此命令调用：
- `marketing-agent` — 活动规划与文案产出
- `brand-voice` — 当语调需要在多个输出间锁定时进行语调捕捉
- `content-engine` — 平台原生的社交内容生产
- `crosspost` — 多平台分发
- `market-research` — 深度受众或竞品情报

## 相关命令

- `/plan` — 活动前的战略规划
- `/plan-prd` — 在向活动简报前先产出产品需求文档
- `/code-review` — 审查落地页实现背后的代码

---

*Part of [Everything Claude Code](https://github.com/affaan-m/everything-claude-code)*
