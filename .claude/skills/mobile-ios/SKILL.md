---
name: iOS 移动安全
description: "用于 iOS 应用白盒安全审计的技能。涵盖 IPA 分析、Swift/Objective-C 漏洞模式和安全最佳实践。"
version: 1.0.0
---

# iOS 移动安全审计

## When this skill applies

The user is reviewing an iOS target. Signals to look for:

- The target directory has an `Info.plist`, `*.swift`, `*.m`, `*.mm`, or `*.xcodeproj`.
- The conversation mentions WKWebView, NSURLSession, Keychain, ATS, KeychainAccess, ObjC runtime.
- A previous run produced `.claude/findings.json` entries whose `type` starts with `ios-*`.

## Triage anchors

| Type | What to verify |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  22 HOURS 33 MINUTES 14 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE