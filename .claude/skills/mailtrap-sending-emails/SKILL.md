---
name: mailtrap-sending-emails
description: 配置或排查 Mailtrap 实时邮件发送：Email API、SMTP、事务流、批量流或批次。
risk: critical
source: community
date_added: "2026-06-19"
---

# Sending emails (Mailtrap)

## Overview

Mailtrap sends live email over **Email API** (REST) or **SMTP**. Two **streams** apply for API/SMTP: **Transactional** (non-promotional, app-generated) and **Bulk** (**promotional** / marketing volume). **Batch** is not a third stream: it is how you submit **many messages in one request** on whichever stream matches the content. **Campaigns** are a separate product path for promotional mail to **Mailtrap contacts**. Pair this sheet with the [Transactional](https://docs.mailtrap.io/developers/email-sending/transactional.md) / [Bulk](https://docs.mailtrap.io/developers/email-sending/bulk.md) developer pages when building or debugging integrations (including with AI-assisted coding).

## When to Use

Use when integrating, configuring, or troubleshooting Mailtrap live email sending with Email API, SMTP, transactional streams, bulk streams, or batch requests.

## How to integrate (preference order)

**Preferred order:**

1. **Plugin or integration for the user's platform** (no-code or minimal-config) _where available_
2. **Official SDK** for your language when one exists (maintained clients, typed helpers, less room for URL/auth mistakes).
3. **HTTP Email API** when there is no SDK or the SDK does not fit (direct `POST` to `/api/send` or `/api/batch` with JSON).
4. **SMTP** only when you **really need it** (legacy stack, host/platform that only speaks SMTP, or hard constraints that rule out HTTP).

## Choosing how to send

| Approach                          | Use when                                                                                                                                                                                                                                                                                                                  |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 29 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE