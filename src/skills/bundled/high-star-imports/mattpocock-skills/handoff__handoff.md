---
name: handoff
description: 将当前对话压缩为交接文档，供另一个 Agent 接手继续工作。
argument-hint: "下一个会话将用于做什么？"
disable-model-invocation: true
---

编写一份交接文档，总结当前对话内容，让一个全新的 Agent 能够继续这项工作。文档保存到用户操作系统的临时目录——而不是当前工作区。

在文档中包含一个 "suggested skills"（建议技能）章节，列出该 Agent 应当调用的技能。

不要重复已在其他产物（spec、计划、ADR、issue、commit、diff）中记录的内容，改为通过路径或 URL 引用它们。

对任何敏感信息（如 API 密钥、密码或个人可识别信息）进行脱敏处理。

如果用户传入了参数，将其视为对下一个会话重点方向的描述，并据此调整文档内容。