# Firebase APK Security Scanner

Scan Android APKs for Firebase security misconfigurations including open databases, exposed storage buckets, and authentication bypasses.

## When to Use

Use this skill when you need to:
- Audit Android applications for Firebase misconfigurations
- Test Firebase endpoints extracted from APKs (Realtime Database, Firestore, Storage)
- Check authentication security (open signup, anonymous auth, email enumeration)
- Enumerate Cloud Functions and test for unauthenticated access
- Perform mobile app security assessments involving Firebase backends

## When NOT to Use

- Scanning apps you do not have explicit authorization to test
- Testing production Firebase projects without written permission
- When you only need to extract Firebase config without testing (use manual grep/strings instead)
- For non-Android targets (iOS, web apps) - this skill is APK-specific
- When the target app does not use Firebase

## What It Does

This skill automates Firebase security testing for Android applications. When invoked, Claude will:

- **Decompile** the APK using apktool
- **Extract** Firebase configuration from all sources (google-services.json, XML resources, assets, smali code, DEX strings)
- **Test** authentication endpoints for misconfigurations
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

## Installation

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

## Usage

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
|------MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 43 MINUTES 29 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE