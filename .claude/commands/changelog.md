---
name: 变更日志
description: "从 Git 历史生成变更日志并校验 Conventional Commits。用法: /changelog <generate|lint> [options]"
argument-hint: "<generate|lint> [options]"
---

# /changelog

从 Git 历史生成符合 Keep a Changelog 格式的条目，并验证提交消息格式。

## 用法

```
/changelog generate [--from-tag <tag>] [--to-tag <tag>]    生成 changelog 条目
/changelog lint [--from-ref <ref>] [--to-ref <ref>]       检查提交消息格式
```

## 示例

```
/changelog generate --from-tag v2.0.0
/changelog lint --from-ref main --to-ref dev
/changelog generate --from-tag v2.0.0 --to-tag v2.1.0 --format markdown
```

## 脚本
- `engineering/skills/changelog-generator/scripts/generate_changelog.py` — 解析提交，渲染 changelog（`--from-tag`, `--to-tag`, `--from-ref`, `--to-ref`, `--format markdown|json`）
- `engineering/skills/changelog-generator/scripts/commit_linter.py` — 验证约定式提交格式（`--from-ref`, `--to-ref`, `--strict`, `--format text|json`）

## 技能参考
→ `engineering/skills/changelog-generator/SKILL.md`
