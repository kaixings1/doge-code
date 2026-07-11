---
name: 配置或排查 Mailtrap 实时邮件发送：Email API、SMTP、事务流、批量流或批次。
description: 配置或排查 Mailtrap 实时邮件发送：Email API、SMTP、事务流、批量流或批次。
risk: critical
source: community
date_added: "2026-06-19"
---

# 发送电子邮件 (Mailtrap)

## 概述

Mailtrap 通过 **Email API**（REST）或 **SMTP** 发送实时电子邮件。API/SMTP 有两种**流**：**事务流**（非推广性质、应用生成的）和**批量流**（**推广**/营销流量）。**批次**不是第三种流：它是在与内容匹配的任意流上**一次请求提交多条消息**的方式。**活动**是面向 **Mailtrap 联系人** 的推广邮件的独立产品路径。在构建或调试集成时（包括使用 AI 辅助编码），请将此表与[事务流](https://docs.mailtrap.io/developers/email-sending/transactional.md)/[批量流](https://docs.mailtrap.io/developers/email-sending/bulk.md)开发页面配合使用。

## 使用时机

在集成、配置或排查 Mailtrap 实时电子邮件发送时使用，包括 Email API、SMTP、事务流、批量流或批次请求。

## 如何集成（优先级顺序）

**优先顺序：**

1. **用户平台的插件或集成**（无代码或最小配置）_如果可用_
2. **官方 SDK**（如有适用于您的语言的版本）（已维护的客户端、类型化助手，减少 URL/认证错误空间）。
3. **HTTP Email API**（当没有 SDK 或 SDK 不适用时）（直接向 `/api/send` 或 `/api/batch` 发送 `POST` 请求，使用 JSON）。
4. **SMTP** 仅在**确实需要**时使用（遗留栈、仅支持 SMTP 的主机/平台，或排除 HTTP 的硬性约束）。

## 选择发送方式

| 方式 | 使用场景 |
|------|----------|