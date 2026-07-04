---
name: Android 移动安全
description: "用于 Android 应用白盒安全审计的技能。涵盖 APK 反编译分析、Android 漏洞模式和安全最佳实践。"
version: 1.0.0
---

# Android 移动安全审计

## When this skill applies

The user is reviewing a decompiled Android target. Signals to look for:

- The working directory or referenced target contains `jadx_out/`, `jadx_out2/`,
  `apktool_out/`, `AndroidManifest.xml`, `*.smali`, or jadx's signature
  `defpackage/*.java` files (obfuscated default-package classes).
- The user mentions an APK, xAPK, or an Android package name
  (`com.example.*`, `com.acme.app`, etc.).
- A previous run produced findings under `<target>/.claude/findings.json` whose
  `type` starts with `mobile-*`.

## Workflow: prefer `/vuln-scout:mobile-audit`

For Android targets, the regular `/vuln-scout:scan` only sees one of the two
decompilation trees (code OR resources). Use the unified driver instead:

```
/vuln-scout:mobile-audit <target-root>
```

The driver auto-discovers `jadx_out/sources` (or `jadx/sources`,
`decompiled/sources`, `android-decompiled/sources`, `src/main/java`) for code
findings and `apktool_out` (or `apktool`, `res`) for manifest + NSC findings,
runs the orchestrator on each, and merges the artifacts into a single
`<target>/.claude/findings.json`. Use the `--profile deep` flag when CodeQL /
Joern are installed (run `python3 vuln-scout/scripts/doctor.py` to confirm).

## High-signal detector cheatsheet

VulnScout ships dedicated mobile detectors. Each produces normalized findings
with the standard schema (`stable_key`, `kind`, `severity`, `type`, etc.).

| Detector | Type slug | What it finds |