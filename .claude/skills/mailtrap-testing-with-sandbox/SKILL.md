---
name: mailtrap-testing-with-sandbox
description: "Mailtrap Testing With Sandbox — Mailtrap Testing With Sandbox 相关功能和最佳实践"
risk: safe
source: community
date_added: "2026-06-19"
---

# Testing with Mailtrap Email Sandbox

## Overview

**Email Sandbox** captures mail in **sandboxes (test inboxes)**—a test environment where messages are **not** delivered to real recipients. You can send to sandboxes using our **SDKs**, **HTTP API**, or **SMTP**, depending on your needs.

**Before generating SDK code:** read the README of the relevant SDK repository (see `mailtrap-sending-emails`) for current sandbox mode options, **inbox id**, and constructor flags. Do not rely on memory.

**Related skills:** `mailtrap-sending-emails` (live sending hosts and streams).

## When to use

- You want **no real delivery**: dev, staging, CI, or demos where mail must stay in a **test inbox**.
- You need to **inspect** what was sent: bodies, headers, attachments, or basic checks (e.g. spam report) via **Sandbox / Testing API** or the **UI**.
- You are **automating** tests against captured mail.
- You will **only change SMTP settings** so an existing app sends into a sandbox—no need for a framework-by-framework tutorial from this skill.

## When not to use

- **Live** sends to real recipients (`mailtrap-sending-emails`).
- For full framework setup guides or detailed API references, link users to Mailtrap's Integration tab for SMTP/API details and the [API docs](https://docs.mailtrap.io/developers/) for specifics—don't cover every framework or API field here.

## Quick reference

### API base

| Service                  | Send mail URL                                         | Auth header examples                              |
| ---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 34 MINUTES 28 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE