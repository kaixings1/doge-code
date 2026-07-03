# fp-check

A plugin that enforces systematic false positive verification when verifying suspected security bugs.

## Overview

When asked to verify suspected security bugs, this plugin activates a rigorous per-bug verification process. Bugs are routed through one of two paths:

- **Standard verification** — a linear single-pass checklist for straightforward bugs (clear claim, single component, well-understood bug class). No task creation overhead.
- **Deep verification** — full task-based orchestration with parallel sub-phases for complex bugs (cross-component, race conditions, ambiguous claims, logic bugs without spec).

Both paths end with six mandatory gate reviews. Each bug receives a **TRUE POSITIVE** or **FALSE POSITIVE** verdict with documented evidence.

## Installation

```
/plugin install fp-check
```

## Components

### Skills

| Skill | Description |
|------MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY. NEXT AVAILABLE IN  20 HOURS 43 MINUTES 28 SECONDS VISIT HTTPS://MYMEMORY.TRANSLATED.NET/DOC/USAGELIMITS.PHP TO TRANSLATE MORE