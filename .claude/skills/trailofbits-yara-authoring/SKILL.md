---
name: YARA-X 规则编写插件
description: 行为驱动的 YARA-X 检测规则编写技能，教你像专家一样思考和编写 YARA 规则。
---

# YARA-X Authoring Plugin

A behavior-driven skill for authoring high-quality YARA-X detection rules, teaching you to think and act like an expert YARA author.

> **YARA-X Focus:** This skill targets [YARA-X](https://virustotal.github.io/yara-x/), the Rust-based successor to legacy YARA. YARA-X powers VirusTotal's Livehunt/Retrohunt production systems and is 5-10x faster for regex-heavy rules. Legacy YARA (C implementation) is in maintenance mode.

## Philosophy

This skill doesn't dump YARA syntax at you. Instead, it teaches:

- **Decision trees** for common judgment calls (Is this string good enough? When to abandon an 方法?)
- **Expert heuristics** (mutex names are gold, API names are garbage)
- **Rationalizations to reject** (the shortcuts that cause production failures)

An expert uses 5 tools: yarGen, FLOSS, `yr` CLI, signature-base, YARA-CI. Everything else is noise.

## 安装

### YARA-X CLI

```bash
# macOS
brew install yara-x

# Or from source
cargo install yara-x

# Verify installation
yr --version
```

### Python Package (for scripts)

```bash
pip install yara-x
# or with uv
uv pip install yara-x
```

### Plugin

Add this plugin to your Claude Code 配置:

```bash
claude mcp add-plugin /path/to/yara-authoring
```

## Skills

### yara-rule-authoring

Guides authoring of YARA-X rules for malware detection with expert judgment.

**Covers:**
- Decision trees for string quality, when to abandon approaches, debugging FPs
- Expert heuristics from experienced YARA authors
- Rationalizations to reject (common shortcuts that fail)
- Naming conventions (CATEGORY_PLATFORM_FAMILY_DATE format)
- Performance optimization (atom quality, short-circuit conditions)
- Testing 工作流 (goodware corpus validation)
- **YARA-X 迁移 guide** for converting legacy rules
- **Chrome extension analysis** with `crx` module
- **Android DEX analysis** with `dex` module

**Triggers:** YARA, YARA-X, malware detection, threat hunting, IOC, signature

## Scripts

The skill includes two Python scripts that require `uv` to run:

### yara_lint.py

Validates YARA-X rules for style, metadata, compatibility issues, and anti-patterns:

```bash
uv run yara_lint.py rule.yar
uv run yara_lint.py --json rules/
uv run yara_lint.py --strict rule.yar
```

### atom_analyzer.py

Evaluates string quality for efficient atom extraction:

```bash
uv run atom_analyzer.py rule.yar
uv run atom_analyzer.py --verbose rule.yar
```

## Reference Documentation

| Document | 目的 |
