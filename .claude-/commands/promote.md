Promote all code from one environment to the next. Usage: `/promote [source] [target]`

Parse `$ARGUMENTS` to extract:
- **Source environment**: optional (e.g., "develop", "staging"). If omitted, auto-detect.
- **Target environment**: optional. If omitted, use the next environment in the promotion flow.

## Step 1: Determine Source and Target

If not specified, auto-detect based on the current branch:

| Current Branch | Source | Target |
|---|---|---|
| `develop` | develop | staging |
| `staging` | staging | production branch |

If both are specified (e.g., `/promote staging production`), use those directly.

Determine the actual branch names — do NOT hardcode. Check the project's CLAUDE.md or use `git branch -r` to find matching environment branches.

## Step 2: Show What Will Be Promoted

Compare the source and target branches to show what's new:

```bash
git log <target-branch>..<source-branch> --oneline
```

Present the changes:

```
## Promote {source} → {target}

Commits to promote:
| Commit | Message | Work Item |
|--------|---------|-----------|
| abc1234 | Add payment export | AB#1234 |
| def5678 | Fix login redirect | AB#1235 |
| ghi9012 | Update dashboard | AB#1236 |

{count} commits will be promoted from {source} to {target}.
Promote? (yes/no)
```

If there are no new commits, report that the environments are already in sync.

Wait for confirmation.

## Step 3: Create PR

Create a PR directly from the source branch to the target branch via Azure DevOps MCP:

- **sourceRefName**: `refs/heads/<source-branch>`
- **targetRefName**: `refs/heads/<target-branch>`
- **title**: `Promote {source} → {target}`
- **description**: List all commits and associated work items being promoted

Link any associated work items to the PR.

## Step 4: Present Summary

```
Promotion PR created: {source} → {target}

PR: {pr-url}

{count} commits included.
Merge the PR to trigger the CD pipeline for {target}.
Remember to update work item states in Azure DevOps after merge.
```

Do NOT merge the PR automatically — the user or a reviewer must approve and merge.
