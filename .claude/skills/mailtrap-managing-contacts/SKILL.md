---
name: mailtrap-managing-contacts
description: 通过 UI 或 API 管理 Mailtrap 联系人、列表、细分、自定义字段、导入、CRM 同步和营销活动受众。
risk: critical
source: community
date_added: "2026-06-19"
---

# Managing Mailtrap contacts

## Overview

**Before generating API request bodies:** check the [Contacts OpenAPI spec](https://github.com/mailtrap/mailtrap-openapi/blob/main/specs/contacts.openapi.yml) for current field names, required parameters, and nested structures.

**Contacts** are the marketing database: lists, segments, custom fields, and imports for **campaign audiences** and related workflows. The **Contacts API** automates create/update and can feed **CRM or CDP sync** (your code, or tools like Zapier, Make, n8n — see [Import contacts](https://docs.mailtrap.io/email-marketing/contacts/import-contacts.md)).

**Suppressions** (hard bounces, spam complaints, unsubscribes on the **sending** side) live in the sending product and **block delivery** for those addresses on your streams. That is applied separately from **marketing** filters (segments, list membership, consent flags) that decide who is eligible for campaigns. For sending-side blocks, see [Suppressions](https://docs.mailtrap.io/developers/email-sending/suppressions.md) and `mailtrap-sending-emails`.

**Related skills:** `mailtrap-sending-emails` (live send paths).

## When to use

- Programmatic contact management (create, update, [bulk import](https://docs.mailtrap.io/developers/promotional/contacts/bulk-import.md))
- Sync with CRMs or data warehouses
- Contact list cleanup and CSV import
- Updating contacts with **custom fields** or firing **custom events** for [automations](https://docs.mailtrap.io/email-marketing/automations.md)
- Segments and [custom fields](https://docs.mailtrap.io/email-marketing/contacts/custom-fields.md) for audience building

## Authorization

All endpoints below need `Authorization: Bearer $MAILTRAP_API_TOKEN` and an `$MAILTRAP_ACCOUNT_ID` in the path. Resolve `$MAILTRAP_ACCOUNT_ID` from `GET https://mailtrap.io/api/accounts`, and store tokens in environment variables or a secrets manager.

## Endpoints (replace placeholders)

| Action                                 | Method  | URL                                                                                       | Reference                                                                                      |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 31 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE