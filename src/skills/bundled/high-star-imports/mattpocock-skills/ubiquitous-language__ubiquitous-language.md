---
name: ubiquitous-language
description: 从当前对话中提取 DDD 风格的统一语言术语表，标记歧义并提出规范术语。保存到 UBIQUITOUS_LANGUAGE.md。当用户想要定义领域术语、构建术语表、强化术语、创建统一语言，或提到"领域模型"或"DDD"时使用。
disable-model-invocation: true
---

# 统一语言

从当前对话中提取并规范化领域术语，形成一份一致的术语表，保存到本地文件。

## 流程

1. **扫描对话**，找出与领域相关的名词、动词和概念
2. **识别问题**：
   - 同一个词被用于不同概念（歧义）
   - 不同的词被用于同一个概念（同义词）
   - 模糊或含义过载的术语
3. **提出一份带明确倾向的规范术语表**
4. **使用下面的格式写入工作目录中的 `UBIQUITOUS_LANGUAGE.md`**
5. **在对话中内联输出摘要**

## 输出格式

按以下结构编写一个 `UBIQUITOUS_LANGUAGE.md` 文件：

```md
# Ubiquitous Language

## Order lifecycle

| Term        | Definition                                              | Aliases to avoid      |
| ----------- | ------------------------------------------------------- | --------------------- |
| **Order**   | A customer's request to purchase one or more items      | Purchase, transaction |
| **Invoice** | A request for payment sent to a customer after delivery | Bill, payment request |

## People

| Term         | Definition                                  | Aliases to avoid       |
| ------------ | ------------------------------------------- | ---------------------- |
| **Customer** | A person or organization that places orders | Client, buyer, account |
| **User**     | An authentication identity in the system    | Login, account         |

## Relationships

- An **Invoice** belongs to exactly one **Customer**
- An **Order** produces one or more **Invoices**

## Example dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is only generated once a **Fulfillment** is confirmed. A single **Order** can produce multiple **Invoices** if items ship in separate **Shipments**."
> **Dev:** "So if a **Shipment** is cancelled before dispatch, no **Invoice** exists for it?"
> **Domain expert:** "Exactly. The **Invoice** lifecycle is tied to the **Fulfillment**, not the **Order**."

## Flagged ambiguities

- "account" was used to mean both **Customer** and **User** — these are distinct concepts: a **Customer** places orders, while a **User** is an authentication identity that may or may not represent a **Customer**.
```

## 规则

- **要有明确倾向。** 当同一个概念存在多个词时，选出最好的一个，其余列为应避免的别名。
- **明确标记冲突。** 如果某个术语在对话中被歧义使用，在"标记的歧义"部分指出并给出清晰的推荐。
- **只包含与领域专家相关的术语。** 跳过模块或类名，除非它们在领域语言中有意义。
- **定义要精炼。** 最多一句话。定义它"是什么"，而不是它"做什么"。
- **展示关系。** 使用加粗的术语名称，并在关系显而易见时表达基数关系。
- **只包含领域术语。** 跳过通用编程概念（array、function、endpoint），除非它们有领域特定含义。
- **按自然聚类将术语分组到多个表格中**（例如按子域、生命周期或参与者）。每个分组使用自己的标题和表格。如果所有术语都属于同一个内聚的领域，用一个表格即可——不要强行分组。
- **编写示例对话。** 一段开发者与领域专家之间的简短对话（3-5 轮），展示这些术语如何自然地交互。对话应澄清相关概念之间的边界，并展示术语的精确用法。

<example>

## Example dialogue

> **Dev:** "How do I test the **sync service** without Docker?"

> **Domain expert:** "Provide the **filesystem layer** instead of the **Docker layer**. It implements the same **Sandbox service** interface but uses a local directory as the **sandbox**."

> **Dev:** "So **sync-in** still creates a **bundle** and unpacks it?"

> **Domain expert:** "Exactly. The **sync service** doesn't know which layer it's talking to. It calls `exec` and `copyIn` — the **filesystem layer** just runs those as local shell commands."

</example>

## 重复运行

在同一对话中再次调用时：

1. 读取已有的 `UBIQUITOUS_LANGUAGE.md`
2. 合并后续讨论中出现的新术语
3. 如果理解有所演进，更新定义
4. 重新标记任何新的歧义
5. 重写示例对话以纳入新术语