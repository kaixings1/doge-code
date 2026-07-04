---
name: mailtrap-testing-with-sandbox
description: "Mailtrap Testing With Sandbox — Mailtrap Testing With Sandbox 相关功能和最佳实践"
risk: safe
source: community
date_added: "2026-06-19"
---

# 使用 Mailtrap Email 沙箱进行测试

## 概述

**Email 沙箱**将邮件捕获在**沙箱（测试收件箱）**中——这是一个测试环境，消息**不会**投递到真实收件人。您可以根据需要使用 **SDK**、**HTTP API** 或 **SMTP** 发送到沙箱。

**在生成 SDK 代码之前：** 阅读相关 SDK 仓库的 README（请参阅 `mailtrap-sending-emails`）以获取当前的沙箱模式选项、**inbox id** 和构造函数标志。不要依赖记忆。

**相关技能：** `mailtrap-sending-emails`（实时发送主机和流）。

## 使用时机

- 您希望**不进行真实投递**：开发、预发布、CI 或演示环境，邮件必须保留在**测试收件箱**中。
- 您需要**检查**发送的内容：通过**沙箱/测试 API** 或 **UI** 查看正文、标头、附件或基本检查（例如垃圾邮件报告）。
- 您正在**自动化**针对捕获邮件的测试。
- 您**仅更改 SMTP 设置**以使现有应用发送到沙箱——无需此技能的按框架教程。

## 何时不使用

- **实时**发送到真实收件人（`mailtrap-sending-emails`）。
- 对于完整的框架设置指南或详细的 API 参考，请引导用户访问 Mailtrap 的集成选项卡以获取 SMTP/API 详情，以及 [API 文档](https://docs.mailtrap.io/developers/)获取具体内容——这里不涵盖每个框架或 API 字段。

## 快速参考

### API 基础

| 服务 | 发送邮件 URL | 认证标头示例 |
|------|-------------|--------------|