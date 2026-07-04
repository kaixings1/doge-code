---
name: mailtrap-setting-up-sending-domain
description: "Mailtrap Setting Up Sending Domain — Mailtrap Setting Up Sending Domain 相关功能和最佳实践"
risk: critical
source: community
date_added: "2026-06-19"
---

# 设置 Mailtrap 发送域名

## 概述

在开始实时发送之前，您必须添加并验证您控制的域名。Mailtrap 在 **UI** 中显示该域名所需的**每条 DNS 记录**：**按给定内容添加完整集合**（不要挑挑拣拣）。DNS 验证通过后，如果系统要求，完成**合规**步骤。

**子域名 vs 根域名：** 添加您在发件人地址中将使用的**确切**主机名。如果您从 `notifications.mycompany.com` 发送，请将该**子域名**添加为发送域名——而不仅仅是 `mycompany.com`，除非您确实从根域名发送。

如需常见主机上的分步点击操作，请打开 [Sending domain setup](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain.md)（Cloudflare、Route 53 等）上的匹配指南，并配合实时的 **UI** 值进行操作。

**相关技能：** `mailtrap-sending-emails`（域名就绪后使用）。

## 使用时机

- 新的**发送域名**设置、验证卡住或合规问题
- 在 Cloudflare、AWS、Google、Namecheap、GoDaddy、DigitalOcean 等平台配置 DNS

## 何时不使用

- 仅在没有自定义域名的情况下进行沙箱测试（请参阅 `mailtrap-testing-with-sandbox`）

## 授权

下面的发送域名 API 调用需要在路径中包含 `Authorization: Bearer $MAILTRAP_API_TOKEN` 和 `$MAILTRAP_ACCOUNT_ID`。从 `GET https://mailtrap.io/api/accounts` 解析 `$MAILTRAP_ACCOUNT_ID`，并将令牌存储在环境变量或机密管理器中。

## 自动化设置（API 和 DNS 提供商）

在构建脚本或 AI 辅助自动化时，首选此路径：

1. **通过 API 获取 DNS 记录和状态** — 使用发送域名 API：
   - `GET https://mailtrap.io/api/accounts/$MAILTRAP_ACCOUNT_ID/sending_domains` — 列出域名
   - `GET https://mailtrap.io/api/accounts/$MAILTRAP_ACCOUNT_ID/sending_domains/{sending_domain_id}` — 返回 `dns_records`（每个包含 `type`、`name`、`value` 和验证 `status`）和 `dns_verified`。发布 DNS 后进行轮询。
2. **通过 API 创建域名** —
   - `POST https://mailtrap.io/api/accounts/$MAILTRAP_ACCOUNT_ID/sending_domains` 使用 `domain_name` 当您的流程以编程方式预配域名时。
3. **以编程方式发布 DNS** —
   - 使用 DNS 主机的 API（例如 [Cloudflare API](https://developers.cloudflare.com/api/)、AWS Route 53、Google Cloud DNS）或 IaC 创建返回的记录。记录名称和值必须与 API 响应完全一致。

**人工备用方案：** 当 API 自动化不可用时，**发送域名** > **添加域名** > 将值复制到注册商 **UI** > **验证**。

## 工作流（摘要）

1. **发送域名** > **添加域名**并输入域名名称。
2. 从 **UI** 或发送域名 API 获取所需记录；在 DNS 主机上**完全按所示创建所有列出的记录**（名称、类型、值）。
3. 等待 DNS 传播。**如果验证仍处于待处理状态**，使用 `dig`、`nslookup` 或在线 DNS 查询确认每条记录公开可见，然后再点击**验证**。
4. 在提示时完成**合规**流程。

产品逐步说明：[Sending domain setup](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain.md)。

## DNS 提供商指南（文档）

Mailtrap 为常用提供商发布了点击路径指南。打开与用户 DNS 主机匹配的页面，并配合实时的 **UI** 记录进行操作：

- [Cloudflare](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/cloudflare.md)
- [AWS Route 53](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/aws-route-53.md)
- [Google Cloud DNS](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/google-cloud-dns.md)
- [Squarespace](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/squarespace.md)（在适用处包括前 Google Domains 迁移说明）
- [GoDaddy](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/godaddy.md)
- [Namecheap](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/namecheap.md)
- [DigitalOcean](https://docs.mailtrap.io/email-api-smtp/setup/sending-domain/digitalocean.md)

如果用户的提供商未列出，同样适用：**复制每条记录**从 Mailtrap 到承载 From 域名的 DNS 区域。

## 重要 DNS 说明（代理 DNS）

如果您的 DNS 提供商**代理**记录（Cloudflare 上的橙色云，其他地方的类似 CDN/代理模式），验证相关记录必须为**仅 DNS**（灰色云/非代理），除非 Mailtrap 文档明确允许代理——代理的 CNAME 等通常会破坏 SPF/DKIM 验证。相同的限制适用于任何在 DNS 前放置代理的主机。

## 限制

- DNS 和合规界面可能发生变化；在发布 DNS 之前，始终从 Mailtrap 复制当前的确切记录。
