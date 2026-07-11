---
name: Mailtrap 联系人管理
description: 通过 UI 或 API 管理 Mailtrap 联系人、列表、细分、自定义字段、导入、CRM 同步和营销活动受众。
risk: critical
source: community
date_added: "2026-06-19"
---

# 管理 Mailtrap 联系人

## 概述

**生成 API 请求体之前：** 查看 [Contacts OpenAPI 规范](https://github.com/mailtrap/mailtrap-openapi/blob/main/specs/contacts.openapi.yml) 以获取当前字段名称、必需参数和嵌套结构。

**联系人**是营销数据库：用于**营销活动受众**和相关工作流的列表、细分、自定义字段和导入。**Contacts API** 可自动化创建/更新操作，并能输入 **CRM 或 CDP 同步**（您的代码，或 Zapier、Make、n8n 等工具——请参阅[导入联系人](https://docs.mailtrap.io/email-marketing/contacts/import-contacts.md)）。

**抑制**（硬退回、垃圾邮件投诉、**发送**侧的退订）存在于发送产品中，并**阻止投递**到您流中的这些地址。这与决定谁有资格参与活动的**营销**过滤器（细分、列表成员资格、同意标记）是分开应用的。有关发送侧阻止，请参阅[抑制](https://docs.mailtrap.io/developers/email-sending/suppressions.md)和 `mailtrap-sending-emails`。

**相关技能：** `mailtrap-sending-emails`（实时发送路径）。

## 使用时机

- 编程式联系人管理（创建、更新、[批量导入](https://docs.mailtrap.io/developers/promotional/contacts/bulk-import.md)）
- 与 CRM 或数据仓库同步
- 联系列表清理和 CSV 导入
- 使用**自定义字段**更新联系人，或为[自动化](https://docs.mailtrap.io/email-marketing/automations.md)触发**自定义事件**
- 用于受众构建的细分和[自定义字段](https://docs.mailtrap.io/email-marketing/contacts/custom-fields.md)

## 授权

以下所有端点都需要在路径中包含 `授权: Bearer $MAILTRAP_API_TOKEN` 和 `$MAILTRAP_ACCOUNT_ID`。从 `GET https://mailtrap.io/api/accounts` 解析 `$MAILTRAP_ACCOUNT_ID`，并将令牌存储在环境变量或机密管理器中。

## 端点（替换占位符）

| 操作 | 方法 | URL | 参考 |
|------|------|-----|------|