---
name: 日志记录缺陷
description: "用于审计日志记录实现的技能。检测日志注入、日志泄露、日志伪造和审计日志不完整等问题。"
version: 1.0.0
---

# 日志与告警缺陷 (OWASP A09)

## 目的

提供日志漏洞的检测模式，包括日志注入、安全事件记录不足、日志中的密钥以及日志篡改漏洞。

## OWASP Top 10 映射

**分类**：A09 - 安全日志记录与告警失败

**CWEs**：
- CWE-117：日志输出中和不当
- CWE-223：遗漏安全相关信息
- CWE-532：敏感信息插入日志文件
- CWE-778：日志记录不足

## 何时使用

在以下情况下激活此技能：
- 审查日志记录实现
- 检查日志注入漏洞
- 审计安全事件日志记录
- 查找日志中暴露的密钥
- 验证审计跟踪完整性

---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 35 MINUTES 00 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE