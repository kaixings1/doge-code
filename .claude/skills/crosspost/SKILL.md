---
name: crosspost
description: 跨平台内容发布技能
---

# 跨平台发布

跨平台分发内容，而不将其变成同一虚假帖子的四种变体。

## 何时激活

- 用户想要在多个平台上发布相同的基本想法
- 发布、更新、发布或文章需要平台特定版本
- 用户说"交叉发布"、"到处发布这个"或"为X和LinkedIn适配这个"

## 核心规则

1. 不要在多个平台上发布完全相同的副本。
2. 在多个平台上保持作者的声音。
3. 为约束条件适配，而不是刻板印象。
4. 一个帖子仍然应该只关于一件事。
5. 如果来源没有赢得，不要发明行动号召、问题或道德寓意。

## 工作流

### 步骤 1：从主要版本开始

首先选择最强的来源版本：
- 原始的X帖子
- 原始文章
- 发布说明
- 主题串
- 备忘录或变更日志

如果来源仍然需要声音塑造，首先使用 `content-engine`。

### 步骤 2：捕获声音指纹

如果当前会话中尚未捕获来源声音，首先运行 `brand-voice`。

直接重用生成的 `VOICE PROFILE`。
除非用户明确希望为此活动进行新的覆盖，否则不要在这里构建第二个临时声音检查清单。

### 步骤 3：按平台约束适配

### X (Twitter)

- 保持简洁
- 以最尖锐的主张或成果开头
- 仅当单个帖子会使论点崩溃时才使用主题串
- 避免标签和通用填充内容

### LinkedIn

- 仅添加小众外人群所需的上下文
- 不要将其变成虚假的创始人反思帖子
- 不要仅仅因为它是LinkedIn就添加结束问题
- 如果作者天生更尖锐，不要强加"专业语气"

### Threads

- 保持可读性和直接性
- 不要写虚假的超随意创作者文案
- 不要粘贴LinkedIn版本并缩短它

### Bluesky

- 保持简洁
- 保持作者的节奏
- 不要依赖标签或动态游戏语言

## 发布顺序

默认：
1. 首先发布最强的原生版本
2. 为次要平台适配
3. 仅当用户需要排序帮助时才错开时间

除非有用，否则不要添加跨平台引用。大多数时候，帖子应该独立存在。

## 禁止模式

删除并重写以下任何内容：
- "兴奋地分享"
- "以下是我的收获"
- "你怎么看？"
- "个人简介中的链接"，除非这确实是事实
- 来源中不存在的通用"专业要点"段落

## 输出格式

返回：
- 主要平台版本
- 每个请求平台的适配变体
- a short note on what changed and why
- any publishing constraint the user still needs to resolve

## 质量关卡

Before delivering:
- each version reads like the same author under different constraints
- no platform version feels padded or sanitized
- no copy is duplicated verbatim across platforms
- any extra context added for LinkedIn or newsletter use is actually necessary

## 相关技能

- `brand-voice` for reusable source-derived voice capture
- `content-engine` for voice capture and source shaping
- `x-api` for X publishing workflows
