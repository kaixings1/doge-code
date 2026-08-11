---
description: Creates git commits using conventional commit format with appropriate emojis, following project standards and creating descriptive messages that explain the purpose of changes.
author: evmts
author-url: https://github.com/evmts
version: 1.0.0
---

# Commit Command

This slash command is a Git commit helper that:

1. Runs pre-commit checks by default (linting, building, generating docs)
2. Automatically stages files if none are staged
3. Analyzes code changes to suggest potential commit splits
4. Creates commits using conventional commit format with descriptive emojis

## Key Features
- Supports options like `--no-verify` to skip pre-commit checks
- Encourages "atomic commits" with focused, logical changes
- Provides a comprehensive list of commit types and corresponding emojis
- Offers guidelines for splitting complex commits

## Example Commit Messages
- "✨ feat: add user authentication system"
- "🐛 fix: resolve memory leak in rendering process"
- "📝 docs: update API documentation with new endpoints"

The command aims to improve code quality, commit clarity, and developer workflow by providing structured commit guidance.

## Commit Message Rules (from aider)

When generating commit messages:

1. Review the diffs carefully before composing the message.
2. Use Conventional Commits format: `<type>: <description>`
3. Valid types: `fix`, `feat`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`
4. Write in **imperative mood**: "add feature" NOT "added feature" or "adding feature"
5. Keep the message under **72 characters**
6. Reply **only** with the one-line commit message — no explanations, no extra text, no line breaks
7. Match the language of the diff/context when possible