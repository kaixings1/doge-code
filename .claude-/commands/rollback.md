Roll back a deployment in an environment. Usage: `/rollback <work-item-ids-or-commit> <environment>`

Parse `$ARGUMENTS` to extract:
- **What to revert**: work item IDs (e.g., "AB#1234") or commit hashes, or "last" for the most recent deployment
- **Target environment**: the environment to roll back (e.g., "staging", "production")

## Step 1: Identify What to Revert

Determine the target environment branch. Do NOT hardcode branch names.

If the user specified:
- **Work item IDs**: Find the associated commits on the environment branch using `repo_search_commits` with `includeWorkItems: true`
- **Commit hashes**: Use those directly
- **"last"**: Find the most recent merge commit on the environment branch via `git log --merges -1 <branch>`

Present the revert plan:

```
## Rollback on {environment}

Commits to revert:
| Commit | Message | Work Item |
|--------|---------|-----------|
| abc1234 | Add payment export | AB#1234 |
| def5678 | Fix login redirect | AB#1235 |

This will revert {count} commit(s) on {environment}. Proceed? (yes/no)
```

Wait for confirmation.

## Step 2: Create Revert Branch

```bash
git checkout <target-environment-branch>
git pull origin <target-environment-branch>
git checkout -b revert/<date>-on-<environment>
```

## Step 3: Revert Commits

Revert each commit in reverse chronological order (newest first):

```bash
git revert --no-commit <commit-hash>
```

After all reverts are staged, create a single commit:

```bash
git commit -m "$(cat <<'EOF'
Revert AB#1234, AB#1235 on {environment}

Reverted commits:
- abc1234: Add payment export
- def5678: Fix login redirect

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

## Step 4: Verify

Run pre-flight checks on the reverted code:
1. `dotnet build` on any .NET projects
2. `npx tsc --noEmit` on any frontend projects
3. If either fails, STOP and report — the revert may have introduced inconsistencies

## Step 5: Push and Create PR

1. Push: `git push -u origin HEAD`
2. Create a PR via Azure DevOps MCP:
   - **sourceRefName**: `refs/heads/revert/<date>-on-<environment>`
   - **targetRefName**: `refs/heads/<target-environment-branch>`
   - **title**: `Rollback: Revert AB#1234, AB#1235 on {Environment}`
   - **description**: List reverted commits and reason
3. Link work items to the PR

## Step 6: Present Summary

```
Rollback PR created for {environment}.

PR: {pr-url}
Reverted:
- AB#1234: Add payment export
- AB#1235: Fix login redirect

Merge the PR to trigger the CD pipeline and deploy the rollback.
```

For production rollbacks, flag urgency to the user.

## Step 7: Notify Team (if Teams MCP is configured)

Send a notification to the project's Teams channel via the Microsoft Teams MCP server:

```
⚠️ Rollback PR created for {environment}
PR: {pr-url}
Reverting: AB#1234, AB#1235
Awaiting review and merge.
```

For production rollbacks, mark the message as urgent. If the Teams MCP server is not configured, skip this step silently.
