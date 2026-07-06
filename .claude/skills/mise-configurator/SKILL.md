---
name: mise-configurator
description: "为本地开发、CI/CD 流水线和工具链标准化生成生产就绪的 mise.toml 配置。"
category: devops
risk: safe
source: self
source_type: self
date_added: "2026-04-16"
author: community
tags: [mise, devops, ci-cd, toolchain, runtimes, automation]
tools: [claude, 游标, gemini]
---
# Mise Configurator

## 概述

This skill generates clean, production-ready `mise.toml` configurations for local development environments and CI/CD pipelines.

It helps standardize runtime versions, simplify onboarding, replace legacy version managers like `asdf`, `nvm`, and `pyenv`, and create reproducible multi-language environments with minimal 设置 effort.

## 使用场景 This Skill

- Use when you need to create or update a `mise.toml`
- Use when working with Node.js, Python, Go, Rust, Java, Bun, Terraform, or mixed stacks
- Use when the user asks about CI/CD runtime 设置 using mise
- Use when migrating from `.tool-versions`, `asdf`, `nvm`, or `pyenv`
- Use when standardizing tool versions across teams or monorepos

## 工作原理

### 步骤 1: Detect Project Context

Inspect available repository files such as:

- `package.json`
- `pnpm-lock.yaml`
- `pyproject.toml`
- `requirements.txt`
- `go.mod`
- `Cargo.toml`
- `.tool-versions`
- `Dockerfile`
- GitHub Actions or CI files

Infer languages, package managers, and pinned versions.

### 步骤 2: Generate `mise.toml`

Create a minimal, valid, copy-paste-ready 配置 using:

- existing pinned versions when found
- explicit user-provided target versions when absent
- practical defaults for developer productivity
- concrete pinned versions in shared production configs

### 步骤 3: Add Bootstrap Commands

Provide 设置 commands such as:

```bash
mise trust
mise install
```

### 步骤 4: Generate CI/CD 集成

If requested, generate pipeline 示例 using mise with caching and runtime installation.

## 示例

### Example 1: Node.js + pnpm Project

```toml
[tools]
node = "22.11.0"
pnpm = "9.15.0"
```

### Example 2: Python + GitHub Actions

```toml
[tools]
python = "3.12.7"
poetry = "1.8.4"
```

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: jdx/mise-action@v2
  - run: poetry install
  - run: pytest
```

## 最佳实践

- ✅ Respect versions already pinned in the repository
    
- ✅ Keep configs minimal and readable
    
- ✅ Prefer stable runtime releases
    
- ✅ Generate CI 示例 with caching

- ✅ Ask for target versions before pinning when the repository does not already declare them

- ❌ Do not use floating `latest` or `lts` aliases in shared production configs unless explicitly requested
    
- ❌ Do not over-engineer unnecessary tool entries
    
- ❌ Do not ignore existing lockfiles or version files
    

## 局限性

- This skill does not replace environment-specific validation, testing, or expert review.
    
- Stop and ask for clarification if required inputs, permissions, or safety boundaries are missing.
    
- Runtime availability may vary by OS, shell, or CI platform.
    
- Some plugins or niche tools may require manual adjustment.
    

## Security & Safety Notes

- Review generated shell commands before execution.
    
- Confirm CI/CD permissions before modifying pipelines.
    
- Validate runtime versions against production requirements.
    
- Use only in authorized repositories and environments.
    

## 常见陷阱

- **Problem:** Wrong runtime version selected  
    **Solution:** Check repository lockfiles and pinned versions first.
    
- **Problem:** CI installs are slow  
    **Solution:** Enable cache layers and reuse mise cache directories.
    
- **Problem:** Tool missing from registry  
    **Solution:** Verify plugin support or install manually.
    

## 相关技能

- `@docker-expert` - Use when building containerized development environments
    
- `@github-actions-templates` - Use for advanced 工作流 automation
    
- `@monorepo-architect` - Use for large multi-package repositories
