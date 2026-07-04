---
name: bats-testing-patterns
description: "掌握 Bash 自动化测试系统 (Bats) 进行全面的 shell 脚本测试。适用于为 shell 脚本编写测试、CI/CD 流水线或需要对 shell 工具进行测试驱动开发。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# Bats /u6d4b/u8bd5/u6a21/u5f0f

Comprehensive guidance for writing comprehensive unit tests for shell scripts using Bats (Bash Automated Testing System), including test patterns, fixtures, and best practices for production-grade shell testing.

## 使用此技能的场景

- Writing unit tests for shell scripts
- Implementing TDD for scripts
- Setting up automated testing in CI/CD pipelines
- Testing edge cases and error conditions
- Validating behavior across shell environments

## 不要使用此技能的场景

- The project does not use shell scripts
- You need integration tests beyond shell behavior
- The goal is only linting or formatting

## 使用说明

- Confirm shell dialects and supported environments.
- Set up a test structure with helpers and fixtures.
- Write tests for exit codes, output, and side effects.
- Add setup/teardown and run tests in CI.
- If detailed examples are required, open `resources/implementation-playbook.md`.

## 资源

- `resources/implementation-playbook.md` for detailed patterns and examples.

## /u9650/u5236
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
