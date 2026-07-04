# fp-check 假阳性检查

A plugin that enforces systematic false positive verification when verifying suspected security bugs.

## 概述

When asked to verify suspected security bugs, this plugin activates a rigorous per-bug verification process. Bugs are routed through one of two paths:

- **Standard verification** — a linear single-pass checklist for straightforward bugs (clear claim, single component, well-understood bug class). No task creation overhead.
- **Deep verification** — full task-based orchestration with parallel sub-phases for complex bugs (cross-component, race conditions, ambiguous claims, logic bugs without spec).

Both paths end with six mandatory gate reviews. Each bug receives a **TRUE POSITIVE** or **FALSE POSITIVE** verdict with documented evidence.

## 安装

```
/plugin install fp-check
```

## Components

### Skills

| Skill | Description |