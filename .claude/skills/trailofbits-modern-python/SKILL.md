---
name: Modern Python 工具链
description: 现代 Python 工具链和最佳实践，使用 uv、ruff、ty 和 pytest。
---

# Modern Python

Modern Python tooling and 最佳实践 using uv, ruff, ty, and pytest. Based on patterns from [trailofbits/cookiecutter-python](https://github.com/trailofbits/cookiecutter-python).

**Author:** William Tan

## 使用场景

- Setting up a new Python project with modern, fast tooling
- Replacing pip/virtualenv with uv for faster dependency management
- Replacing flake8/black/isort with ruff for unified linting and formatting
- Replacing mypy with ty for faster type checking
- Adding pre-commit hooks and security scanning to an existing project

## What It Covers

**Core Tools:**
- **uv** - Package/dependency management (replaces pip, virtualenv, pip-tools, pipx, pyenv)
- **ruff** - Linting and formatting (replaces flake8, black, isort, pyupgrade)
- **ty** - Type checking (replaces mypy, pyright)
- **pytest** - Testing with coverage enforcement
- **prek** - Pre-commit hooks (replaces pre-commit)

**Security Tools:**
- **shellcheck** - Shell script linting
- **detect-secrets** - Secret detection in commits
- **actionlint** - GitHub Actions syntax validation
- **zizmor** - GitHub Actions security audit
- **pip-audit** - Dependency vulnerability scanning
- **Dependabot** - Automated dependency updates with supply chain protection

**Standards:**
- **pyproject.toml** - Single 配置 file with dependency groups (PEP 735)
- **PEP 723** - Inline script metadata for single-file scripts
- **src/ layout** - Standard package structure
- **Python 3.11+** - Minimum version requirement

## Hook: Legacy Command Interception

This plugin includes a `SessionStart` hook that prepends PATH shims for `python`, `pip`, `pipx`, and `uv`. When Claude runs a bare `python`, `pip`, or `pipx` command, the shell resolves to the shim, which prints an error with the correct `uv` alternative and exits non-zero. `uv run` is unaffected because it prepends its managed virtualenv's `bin/` to PATH, shadowing the shims.

| Intercepted Command | Suggested Alternative |
