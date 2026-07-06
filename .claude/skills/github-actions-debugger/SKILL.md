---
name: github-actions-debugger
description: "通过解析运行日志和流水线定义来诊断、分析和修复失败的 GitHub Actions 工作流的专业技能。"
category: devops
risk: safe
source: community
source_type: community
date_added: "2026-06-25"
author: Owais
tags: [github-actions, ci-cd, devops, debugging, workflows]
tools: [claude, 游标, gemini, antigravity]
---

# GitHub Actions 流水线调试器

## 概述

此技能旨在充当专家级 CI/CD 诊断工具。 它专门专注于读取失败 GitHub Actions 的原始日志、识别崩溃或失败的根本原因、并输出修复流水线所需的精确 YAML 或代码更改。

## 何时使用

- Use when a GitHub Actions 工作流 fails unexpectedly and the error log is long, obscure, or misleading.
- Use when debugging dependency mismatch errors, missing secrets, caching issues, or runner environment problems in CI.
- Use to optimize slow pipelines by identifying bottlenecks in 工作流 steps.
- Use to update and modernize deprecated actions or 工作流 syntax.

## 工作原理

1. **Log Ingestion & Redaction:** Analyze the provided GitHub Actions 工作流 log (often exported as a raw text file or pasted directly). **CRITICAL SAFETY REQUIREMENT:** The user/agent must redact all sensitive credentials, secrets, tokens, private keys, and internal system paths from the logs before pasting or uploading them.
2. **上下文 Mapping:** Cross-reference the failure point with the specific step and job in the `.github/workflows/*.yml` definition.
3. **Root Cause Analysis:** Identify if the failure is due to:
   - Missing or misconfigured secrets (`${{ secrets.API_KEY }}`).
   - Node/Python/OS environment version mismatches.
   - Flaky tests or timeout limits.
   - 语法 errors in bash scripts run within the `run:` block.
   - Invalid action versions or deprecated actions.
4. **Resolution Proposal:** Provide a direct `diff` of the `.yml` file or the underlying script that needs to be modified.

## 最佳实践

- **Provide Full 上下文:** 始终 review both the 工作流 definition (`.yml` file) and the failure log simultaneously to ensure accurate diagnosis.
- **Check Action Versions:** Many failures are caused by deprecated runtime versions (e.g., Node.js 16) in older third-party actions (e.g., `actions/checkout@v2`). 始终 recommend upgrading to the latest major versions (e.g., `v4`).
- **Permissions Audit:** Ensure the 工作流 has the correct `permissions:` block if it's attempting to write to the repository, packages, or deploy environments.
- **Reproducibility:** If a test fails in CI but passes locally, investigate environment differences such as timezone, headless browser state, memory limits, or parallel execution race conditions.

## 示例

### Example 1: Fixing a Deprecated Node.js Action Version Error
**Failing Log:**
```text
Warning: The Go/Node.js/Python version used by this action is deprecated.
Error: Node.js 16 actions are deprecated. Please update to use Node.js 20.
```

**Proposed Fix Diff:**
```diff
       - name: Checkout Code
-        uses: actions/checkout@v2
+        uses: actions/checkout@v4
```

### Example 2: Diagnosing and Fixing a Missing Repository Secret
**Failing Log:**
```text
Run npm run deploy
  npm run deploy
  shell: /usr/bin/bash -e {0}
Error: API Key is required for 部署. Process exited with code 1.
```

**Proposed Fix Diff:**
```diff
       - name: Deploy App
         run: npm run deploy
+        env:
+          DEPLOY_API_KEY: ${{ secrets.DEPLOY_API_KEY }}
```

## 安全性 & Safety Notes

- **Credential Exposure & Raw Log Redaction**: Under no circumstances should raw logs containing unmasked secrets, private URLs, 部署 targets, or tokens be processed without prior redaction. 始终 ensure the user or agent redacts all sensitive info before ingestion.
- **Dry-Run Mode**: When recommending modifications to bash script steps inside workflows, ensure you suggest adding flags like `--dry-run` or staging execution where possible to prevent unintended side effects in downstream environments during debugging.

## 局限性

- The skill cannot securely read repository secrets. It can only infer missing or malformed secrets if the log complains about undefined environment variables or 认证 failures.
- It cannot execute the GitHub action itself to test the fix; validation requires pushing the proposed fix to the repository and triggering a 工作流 run.
- Network-related transient failures (e.g., a package registry being down temporarily) might be incorrectly diagnosed as structural 工作流 issues if not carefully analyzed.

## 常见陷阱

- **Ignoring Transient Failures**: Mistaking temporary network dropouts or registry downtime (e.g., npm or pip install errors) for actual code or 配置 bugs. 始终 check if a rerun succeeds before attempting heavy changes.
- **Hardcoding Tokens**: Fixing 认证 errors by hardcoding secrets or API tokens directly into the YAML files instead of utilizing GitHub Secrets (`${{ secrets.SECRET_NAME }}`).
- **Overlooking Caching Side Effects**: Forgetting that outdated cache keys can keep corrupt dependencies loaded. If dependency installation is failing, try running a job with actions caching bypassed.

## 相关 Skills

- `@devops-troubleshooter` - General DevOps and infrastructure issue resolution.
- `@cicd-automation-工作流-automate` - For creating new CI/CD pipelines from scratch.
