根据最近提交自动生成发版说明并创建带标签的版本。

## 步骤

1. 运行 `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD` 列出自上一个标签以来的提交。
2. Determine the next version number:
   - If `--major`, `--minor`, or `--patch` is specified, use that increment.
   - Otherwise, infer from commit types: `feat` = minor, `fix` = patch, breaking changes = major.
3. Group commits by type (features, fixes, chores, etc.) for the release notes.
4. Check for a `package.json`, `pyproject.toml`, or `Cargo.toml` and update the version field if present.
5. Stage version file changes and commit with `chore: bump version to vX.Y.Z`.
6. Create an annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
7. If `gh` CLI is available, create a GitHub release: `gh release create vX.Y.Z --generate-notes`.
8. Push the tag and commit: `git push origin HEAD --follow-tags`.

## Format

```
## vX.Y.Z (YYYY-MM-DD)

### Features
- feat(scope): description

### Bug Fixes
- fix(scope): description

### Other Changes
- chore/refactor/docs entries
```

## Rules

- Never create a release on a dirty working tree; abort if uncommitted changes exist.
- Always use semantic versioning (semver).
- Confirm the version bump with the user before tagging.
- Do not include merge commits or CI-only changes in release notes.
