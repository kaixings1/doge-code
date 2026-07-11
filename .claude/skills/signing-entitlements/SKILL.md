---
name: macOS代码签名和授权指南
description: macOS代码签名和授权指南
---

# 代码签名与授权 (Signing & Entitlements)

## 快速入门

当失败看起来像是代码签名问题而非编译问题时使用此技能：启动拒绝、缺少授权、签名无效、沙箱不匹配、强化运行时混淆或信任策略拒绝。

## 工作流

1. **检查包或二进制文件** — 定位 `.app` 或可执行文件，识别 `Contents/MacOS/` 中的主二进制文件
2. **读取签名详情** — 使用 `codesign -dvvv`、`spctl -a -vv`、`plutil -p` 等
3. **分类失败类型** — 未签名/临时签名、身份错误、授权不匹配、强化运行时问题、App Sandbox 问题等

4. Explain the minimum fix path.
   - Say exactly what is wrong.
   - Show the shortest set of validation or repair commands.
   - Distinguish local development problems from distribution problems.

## 常用命令

- `codesign -dvvv --entitlements :- <app-or-binary>`
- `spctl -a -vv <app-or-binary>`
- `security find-identity -p codesigning -v`
- `plutil -p <path-to-entitlements-or-plist>`

## 防护措施

- Never invent missing entitlements.
- Do not conflate notarization with local debug signing.
- If the real issue is a build setting or provisioning profile, say so directly.

## 输出预期

Provide:
- what artifact was inspected
- what signing state it is in
- the exact failure class
- the minimum fix or validation sequence
