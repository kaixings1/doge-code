---
name: permission-tuner
description: "Pro Workflow\Skills\Permission Tuner — Pro Workflow\Skills\Permission Tuner 相关功能和最佳实践"
---

# Permission Tuner

Reduce permission prompt fatigue by analyzing denial patterns and suggesting targeted rules.

## Trigger

Use when:
- Permission prompts interrupt flow repeatedly
- Starting a new project and want to configure permissions
- After a session with many manual approvals

## 工作流

1. Scan recent session data for permission patterns
2. Identify frequently-approved tools and patterns
3. Generate safe `alwaysAllow` rules
4. Present rules for approval before applying

## Analysis

### 步骤 1: Gather Permission Data

Check current permission rules:
```bash
cat .claude/settings.json 2>/dev/null | grep -A 20 "permissions"
cat ~/.claude/settings.json 2>/dev/null | grep -A 20 "permissions"
```

### 步骤 2: Identify Safe Patterns

**Allow-list candidates** (low risk):
- `Read` — all file reads (read-only, no side effects)
- `Glob` — file pattern matching (read-only)
- `Grep` — content search (read-only)
- `Bash(git status)` — read-only git commands
- `Bash(git diff*)` — read-only git commands
- `Bash(git log*)` — read-only git commands
- `Bash(npm test*)` — test execution
- `Bash(npm run lint*)` — linting
- `Bash(npm run typecheck*)` — type checking

**Ask candidates** (medium risk — prompt user every time):
- `Edit` — file modifications
- `Write` — new file creation
- `Bash(git add*)` — staging changes
- `Bash(git commit*)` — creating commits
- `Bash(npm install*)` — dependency changes

**Deny-list candidates** (high risk):
- `Bash(git push*)` — affects remote
- `Bash(git reset --hard*)` — destructive
- `Bash(rm -rf*)` — destructive
- `Bash(curl*POST*)` — external API calls
- Any command with `--force` or `--no-verify`

### 步骤 3: Generate Rules

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(git status)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(npm test*)",
      "Bash(npm run lint*)",
      "Bash(npm run typecheck*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git reset --hard*)"
    ]
  }
}
```

## 输出

```text
PERMISSION TUNER REPORT

Current rules: [X] allow, [Y] deny, [Z] ask

Recommendations:
  Auto-approve (safe, read-only):
    + Read, Glob, Grep
    + Bash(git status), Bash(git diff*), Bash(git log*)

  Auto-approve (medium risk, frequently used):
    + Edit (approved X times this session)
    + Bash(npm test*) (approved X times)

  Keep asking:
    ~ Bash(git commit*) — verify commit messages
    ~ Write — verify new file creation

  Auto-deny (dangerous):
    - Bash(rm -rf *)
    - Bash(git push --force*)

Estimated prompts saved per session: ~[N]
```

## 规则

- Destructive operations must stay in the deny list
- Always present rules for user approval before applying
- Group rules by risk level (safe/medium/dangerous)
- Include estimated prompt savings
