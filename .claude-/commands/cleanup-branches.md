Clean up merged branches. Usage: `/cleanup-branches [--dry-run]`

If `$ARGUMENTS` contains "dry-run" or "--dry-run", only list branches that would be deleted — do not delete them.

## Step 1: Find Merged Branches

Find all local and remote branches that have been fully merged into the current branch:

```bash
git branch --merged
git branch -r --merged
```

Exclude protected branches — never delete these:
- `main`, `master`, `develop`, `development`
- `staging`, `Staging`
- `Dev`, `QA`
- Any branch listed in the project's CLAUDE.md Pipeline Configuration table

## Step 2: Identify Candidates

Filter to only feature/work branches that follow our naming conventions or common patterns:

- `feature/*`, `story/*`, `bugfix/*`, `hotfix/*`, `work/*`
- `release/*-to-*`, `cherry-pick/*`, `revert/*`
- Task branches (e.g., `T3796`, `U3297`)

Present the list:

```
## Branch Cleanup

### Branches to delete ({count}):
| Branch | Last Commit | Merged Into |
|--------|-------------|-------------|
| story/AB#4521-admin-export | 2026-03-18 | develop |
| bugfix/AB#4589-login-plus-sign | 2026-03-19 | develop |
| release/24-to-staging | 2026-03-21 | staging |
| cherry-pick/2026-03-22-to-production | 2026-03-22 | main |

### Protected (will NOT be deleted):
- main, develop, staging

Delete {count} merged branches? (yes/no)
```

If `--dry-run`, show the list but do NOT ask for confirmation and do NOT delete.

Wait for confirmation before proceeding.

## Step 3: Delete

For each confirmed branch:

```bash
# Delete local branch
git branch -d <branch-name>

# Delete remote branch
git push origin --delete <branch-name>
```

Report results:

```
Cleaned up {count} branches.

Deleted:
- story/AB#4521-admin-export (local + remote)
- bugfix/AB#4589-login-plus-sign (local + remote)
- release/24-to-staging (remote only)
- cherry-pick/2026-03-22-to-production (remote only)
```
