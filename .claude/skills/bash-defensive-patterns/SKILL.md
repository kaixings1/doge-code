---
name: bash-defensive-patterns
description: "掌握防御性 Bash 编程技术以编写生产级脚本。适用于编写健壮的 shell 脚本、CI/CD 流水线或需要容错和安全性的系统工具。"
risk: safe
source: community
date_added: "2026-02-27"
---

# Bash /u9632/u5fa1/u6027/u6a21/u5f0f

Comprehensive guidance for writing production-ready Bash scripts using defensive programming techniques, error handling, and safety best practices to prevent common pitfalls and ensure reliability.

## 使用此技能的场景

- Writing production automation scripts
- Building CI/CD pipeline scripts
- Creating system administration utilities
- Developing error-resilient deployment automation
- Writing scripts that must handle edge cases safely
- Building maintainable shell script libraries
- Implementing comprehensive logging and monitoring
- Creating scripts that must work across different platforms

## 不要使用此技能的场景

- You need a single ad-hoc shell command, not a script
- The target environment requires strict POSIX sh only
- The task is unrelated to shell scripting or automation

## Instructions

1. Confirm the target shell, OS, and execution environment.
2. Enable strict mode and safe defaults from the start.
3. Validate inputs, quote variables, and handle files safely.
4. Add logging, error traps, and basic tests.

## Safety

- Avoid destructive commands without confirmation or dry-run flags.
- Do not run scripts as root unless strictly required.

Refer to `resources/implementation-playbook.md` for detailed patterns, checklists, and templates.

## Resources

- `resources/implementation-playbook.md` for detailed patterns, checklists, and templates.

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
