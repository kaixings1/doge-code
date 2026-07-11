---
name: Firebase APK 安全扫描器
description: 扫描 Android APK 的 Firebase 安全错误配置，包括开放数据库、暴露的存储桶和认证绕过。
---

# Firebase APK Security Scanner

Scan Android APKs for Firebase security misconfigurations including open databases, exposed storage buckets, and 认证 bypasses.

## 使用场景

当您需要以下操作时使用此技能：
- 审计 Android 应用的 Firebase 配置错误
- 测试从 APK 提取的 Firebase 端点（实时数据库、Firestore、存储）
- 检查认证安全性（开放注册、匿名认证、邮箱枚举）
- 枚举云函数并测试未认证访问
- 执行涉及 Firebase 后端的移动应用安全评估

## 不适用场景

- Scanning apps you do not have explicit 授权 to test
- Testing production Firebase projects without written permission
- When you only need to extract Firebase config without testing (use manual grep/strings instead)
- For non-Android targets (iOS, web apps) - this skill is APK-specific
- When the target app does not use Firebase

## 功能说明

This skill automates Firebase security testing for Android applications. When invoked, Claude will:

- **Decompile** the APK using apktool
- **Extract** Firebase 配置 from all sources (google-services.json, XML resources, assets, smali code, DEX strings)
- **Test** 认证 endpoints for misconfigurations
- **Probe** Realtime Database and Firestore for open read/write access
- **Check** Storage buckets for public listing and upload vulnerabilities
- **Enumerate** Cloud Functions and test accessibility
- **Generate** detailed reports with findings and remediation guidance

## Key Features

- Supports native Android, React Native, Flutter, and Cordova apps
- Extracts config from 7+ sources including raw DEX binary strings
- Tests 14 distinct vulnerability categories
- Automatic cleanup of test data created during scans
- Detailed vulnerability reference documentation included

## 安装

```
/plugin install trailofbits/skills/plugins/firebase-apk-scanner
```

## 前提条件

Install required dependencies before use:

**macOS:**
```bash
brew install apktool curl jq binutils
```

**Ubuntu/Debian:**
```bash
sudo apt install apktool curl jq unzip binutils
```

## 用法

```
/firebase-scan ./app.apk
/firebase-scan ./apks/
```

Or run the standalone script directly:

```bash
./scanner.sh app.apk
./scanner.sh ./apks/ --no-cleanup
```

## Vulnerability Categories

| Category | Tests | Severity |
