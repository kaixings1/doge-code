---
name: 日志记录缺陷
description: "用于审计日志记录实现的技能。检测日志注入、日志泄露、日志伪造和审计日志不完整等问题。"
version: 1.0.0
---

# 日志与告警缺陷 (OWASP A09)

## Purpose

Provide detection patterns for logging vulnerabilities including log injection, insufficient logging of security events, secrets in logs, and log tampering vulnerabilities.

## OWASP Top 10 Mapping

**Category**: A09 - Security Logging & Alerting Failures

**CWEs**:
- CWE-117: Improper Output Neutralization for Logs
- CWE-223: Omission of Security-Relevant Information
- CWE-532: Insertion of Sensitive Information into Log File
- CWE-778: Insufficient Logging

## When to Use

Activate this skill when:
- Reviewing logging implementations
- Checking for log injection vulnerabilities
- Auditing security event logging
- Looking for secrets exposed in logs
- Verifying audit trail completeness

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 35 MINUTES 00 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE