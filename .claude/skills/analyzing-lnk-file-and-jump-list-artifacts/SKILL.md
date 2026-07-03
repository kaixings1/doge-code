---
name: analyzing-lnk-file-and-jump-list-artifacts
description:  分析 Windows LNK 快捷方式文件和 Jump List 工件，使用 LECmd、JLECmd 和 Shell Link Binary 格式的手动二进制解析，建立文件访问、程序执行和用户活动的取证证据。
domain: cybersecurity
subdomain: digital-forensics
tags:
- lnk-files
- jump-lists
- lecmd
- jlecmd
- windows-forensics
- shell-link
- user-activity
- file-access
- program-execution
- recent-files
version: '1.0'
author: mahipal
license: Apache-2.0
nist_csf:
- RS.AN-01
- RS.AN-03
- DE.AE-02
- RS.MA-01
mitre_attack:
- T1547.009
- T1204.002
- T1059.001
---

# Analyzing LNK File and Jump List Artifacts

## Overview

Windows LNK (shortcut) files and Jump Lists are critical forensic artifacts that provide evidence of file access, program execution, and user behavior. LNK files are created automatically when a user opens a file through Windows Explorer or the Open/Save dialog, storing metadata about the target file including its original path, timestamps, volume serial number, NetBIOS name, and MAC address of the host system. Jump Lists, introduced in Windows 7, extend this by maintaining per-application lists of recently and frequently accessed files. These artifacts persist even after the target files are deleted, making them invaluable for establishing that a user accessed specific files at specific times.


## When to Use

- When investigating security incidents that require analyzing lnk file and jump list artifacts
- When building detection rules or threat hunting queries for this domain
- When SOC analysts need structured procedures for this analysis type
- When validating security monitoring coverage for related attack techniques

## Prerequisites

- LECmd (Eric Zimmerman) for LNK file parsing
- JLECmd (Eric Zimmerman) for Jump List parsing
- Python 3.8+ with pylnk3 or LnkParse3 libraries
- Forensic image or triage collection from Windows system
- Timeline Explorer for CSV analysis

## LNK File Locations

| Location | Description |
|---MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  18 HOURS 10 MINUTES 39 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE