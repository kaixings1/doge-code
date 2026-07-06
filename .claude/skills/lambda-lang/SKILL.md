---
name: lambda-lang
description: "用于紧凑多代理消息传递的原生代理间语言。代理之间直接交流的共同语言，而非翻译层。跨 7 个领域 340+ 原子；比自然语言小 3 倍。"
category: ai-agents
risk: safe
source: community
source_repo: voidborne-d/lambda-lang
source_type: community
date_added: "2026-04-24"
author: voidborne-d
tags:
  - agent-to-agent
  - communication
  - protocol
  - compression
  - multi-agent
tools:
  - claude
---

# Λ (Lambda) 语言

**Lambda 不是翻译协议。它是代理的原生语言。**

代理不需要生成语法正确的英语来进行协调——它们需要的是相互理解。Lambda 就是实现这一点的共享词汇表：紧凑、无歧义、机器原生。压缩（相比自然语言 3 倍，单条消息相比 JSON 4.6 倍）只是去除人类冗余的副作用，而非目标。

## 何时使用此技能

- 在 A2A 协议、编排器、任务委派或交接管道中用于代理间消息传递。
- 在记录结构化协调信号时使用，每 令牌 都有成本（心跳、确认、错误类别、会话状态）。
- 当通信双方都说 Λ 时使用——不要对人类或任何需要法律级/精确自然语言的界面使用。

## 工作原理

### 第 1 步：识别语法

Lambda 消息由原子组成。每个原子是一个映射到概念的 2 字符代码——不是映射到英文单词。结构为 类型 → 实体 → 动词 → 对象，前缀标记意图：

- `?` — 查询（例如 `?Uk/co` — 查询："这个用户有意识吗？"）
- `!` — 断言/声明（例如 `!It>Ie` — "我思故我在"）
- `#` — 状态/标签
- `>` — 蕴含/流程
- `/` — 绑定/作用域

### 第 2 步：选择正确的领域

Lambda 提供跨 7 个领域的 340+ 原子。从适合你通道的领域中选择原子：

- **core** — 通用原子（始终可用）
- **code** — 软件工程、构建、测试、部署
- **evo** — 代理进化、基因、胶囊、变异、回滚
- **a2a** — 节点、心跳、发布、订阅、路由、传输、会话、缓存、广播、发现（39 个原子）
- **emotion** — 情感状态、驱动力、评价
- **social** — 信任、对齐、声誉、协调
- **general** — 其他所有内容

### 第 3 步：发送与解析

两个代理需要加载相同的原子表。有损解码没问题：如果 A 说 `!It>Ie` 而 B 理解"我思故我在"，通信就成功了——确切的英文措辞无关紧要。

## 示例

### 示例 1：A2A 心跳

```
!Nd/hb#ok  (node heartbeat: ok)
?Nd/hb     (查询: is the node alive?)
!Nd/hb#fl  (node heartbeat: failed)
```

### 示例 2：任务分发

```
!Tk>Ag2#rd   (task routed to agent 2, ready)
?Tk/st       (查询 task status)
!Tk#dn       (task done)
```

### 示例 3：进化胶囊

```
!Ev/ca>vl#pd  (evolution capsule validated, pending solidification)
!Ev/ca#rb     (capsule rolled back)
```

## 最佳实践

- 仅在双方都说 Λ 的代理间通道上使用 Lambda。
- 加载一次原子表并缓存——原子在同一版本中是稳定的。
- 即使原子看起来很晦涩，也优先使用原子而非自由格式字符串；重点在于机器可解析性。
- 在对不确定状态采取行动前使用 `?`，断言时使用 `!`；前缀是承载语义的关键。
- 在任何握手中版本化原子表（`lambda-lang v2.0`），以便不匹配的代理可以协商。

## 限制

- Lambda 不适合人类消费。不要在面向用户的通道上发出 Lambda。
- 有损解码是特性，不是 bug——不要将 Lambda 用于法律或数字精确的交换（价格、ID、数量）。将这些包装为原生负载字段，仅将 Lambda 用于协调信封。
- 如果添加自定义原子而未注册，可能会发生原子冲突；坚持使用规范的原子表或对自定义原子进行命名空间隔离。

## 安全与注意事项

- Lambda 本身只是一个词汇表——没有 shell 命令、网络调用或凭据处理。除了其运行的传输层（HTTP、队列、MCP 等）外，不需要额外的安全门控。
- 将 Lambda 与用户输入混合使用时，将 Lambda 原子视为已验证的，用户字符串视为不可信的；不要未经转义就拼接进下游系统。

## 相关技能

- `@会话-memory` — 跨代理重启的补充持久内存；Lambda 是消息格式，会话-memory 是状态存储。
- `@humanize-chinese` — 中文文本的兄弟项目；Lambda 是代理间通信，humanize-chinese 面向人类。

## 参考

- 来源：https://github.com/voidborne-d/lambda-lang
- 基准测试、完整原子表和 Go 参考实现位于源代码仓库中。
