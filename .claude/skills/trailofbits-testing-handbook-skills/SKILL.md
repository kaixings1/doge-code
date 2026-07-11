---
name: 测试手册技能生成器
description: 从 Trail of Bits 应用安全测试手册生成 Claude Code 技能的元技能。
---

# Testing Handbook Skills

Meta-skill that generates Claude Code skills from the [Trail of Bits Application Security Testing Handbook](https://appsec.guide).

## 概述

This plugin provides a skill generator that:

1. Analyzes the Testing Handbook structure
2. Identifies skill candidates (tools, techniques, domains)
3. Generates skills using appropriate templates
4. Validates generated skills

## 安装

Add to your Claude Code skills 配置:

```bash
# From the skills marketplace
claude skills install testing-handbook-skills

# Or manually add to .claude/settings.json
{
  "plugins": [
    "./plugins/testing-handbook-skills"
  ]
}
```

## 用法

### Generate All Skills

```
Generate skills from the testing handbook
```

This will:
1. Locate the handbook (check common locations, ask user, or clone)
2. Scan the handbook structure
3. Present a plan of skills to generate
4. On approval, generate skills as siblings to `testing-handbook-generator/`

### Generate Specific Skill

```
Create a skill for the libFuzzer section of the testing handbook
```

## Structure

```
plugins/testing-handbook-skills/
├── .claude-plugin/
│   └── plugin.json
├── scripts/
│   └── validate-skills.py        # Skill validation tool
├── skills/
│   ├── testing-handbook-generator/
│   │   ├── SKILL.md              # Main skill entry point
│   │   ├── discovery.md          # Handbook analysis methodology
│   │   ├── testing.md            # Validation strategy
│   │   ├── agent-prompt.md       # Agent prompt template for generation
│   │   └── templates/            # Skill generation templates
│   │       ├── tool-skill.md     # Semgrep, CodeQL
│   │       ├── fuzzer-skill.md   # libFuzzer, AFL++, cargo-fuzz
│   │       ├── technique-skill.md # Harness writing, coverage
│   │       └── domain-skill.md   # Crypto testing, web security
│   ├── [generated-skill]/        # Generated skills (siblings to generator)
│   │   └── SKILL.md
│   └── ...
└── README.md
```

### Scripts

| Script | 目的 |
