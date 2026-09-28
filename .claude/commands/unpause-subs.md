---
description: 暂停后重新启用技能总线。恢复订阅处理。
---

# Resume Skill Bus

**Announce:** "[skill-bus] Resuming."

## Process

### Step 1: Check Current State

Read both config files. Identify which level(s) are paused.

### Step 2: Resume

If only one level is paused, resume it automatically.

If both levels are paused, ask:
**"Both global and project are paused. Resume which?"**
- **Both**
- **Global only**
- **Project only**

Set `settings.enabled` to `true` in the appropriate file(s).

If the project config file only contains `{"settings": {"enabled": false}}` and nothing else, delete it entirely (clean state).

### Step 3: Confirm

Show: "Skill bus resumed at [scope] level. Subscriptions are active again."
