---
name: ubiquitous-language
description: 从当前对话中提取 DDD 风格的通用语言词汇表，标记歧义并提议标准术语。保存到 UBIQUITOUS_LANGUAGE.md。当用户想要定义领域术语、构建词汇表、强化术语、创建通用语言，或提到 "domain model" 或 "DDD" 时使用。
disable-model-invocation: true
---

# 通用语言（Ubiquitous Language）

从当前对话中提取并完善领域术语，保存为一致的词汇表。

## 流程

1. **扫描对话**中的领域相关名词、动词和概念
2. **识别问题**：
   - 同一个词用于不同概念（歧义）
   - 不同词用于同一个概念（同义词）
   - 模糊或过度使用的术语
3. **提议一个标准词汇表**，带有确定性的术语选择
4. **使用以下格式写入** `UBIQUITOUS_LANGUAGE.md`
5. **在对话中输出摘要**

## 输出格式

使用以下结构写入 `UBIQUITOUS_LANGUAGE.md`：

```md
# Ubiquitous Language

## Order lifecycle

| Term        | Definition                                              | Aliases to avoid      |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 42 MINUTES 57 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE