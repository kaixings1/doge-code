Deploy release to the next environment. Usage: `/deploy-release <release-number> [environment]`

Parse `$ARGUMENTS` to extract:
- **Release number**: required (e.g., "23" or "#23")
- **Target environment**: optional — if not provided, auto-detect the next environment in the promotion flow

## Step 1: Read the Release

Query Azure DevOps for all work items tagged with `release-{N}` or assigned to the `Release #{N}` iteration using `search_workitem` or `wit_get_work_items_for_iteration`.

Present the release contents:

```
## Release #{N} — Deploy to {environment}

| ID | Type | Title | State | Branch |
|----|------|-------|-------|--------|
| AB#1234 | User Story | Add payment export | Ready for Testing | story/AB#1234-add-payment-export |
| AB#1235 | Bug | Fix login redirect | Ready for Testing | bugfix/AB#1235-fix-login-redirect |

{count} work items in this release.
```

If no work items are found, STOP and report the error.

## Step 2: Determine Target Environment

If the user specified an environment, use it. Otherwise, auto-detect by checking which environment the work items are currently in:

| Current State | Next Environment |
|---|---|
| Work items merged to `develop` | Deploy to **staging** |
| Work items merged to `staging` | Deploy to **production** |

Check which environment branches contain the commits for these work items using `repo_search_commits` with `includeWorkItems: true`.

**Validation:** Verify all work items in the release have commits on the same source branch. If they are inconsistent (e.g., AB#1234 is on `develop` but AB#1235 has no commits), present a warning listing which work items are on which branches and ask the user to confirm the target environment explicitly.

Confirm with the user:

```
Deploy Release #{N} ({count} work items) to {environment}?

This will:
1. Create a release branch: release/{N}-to-{environment}
2. Cherry-pick all commits for the {count} work items
3. Create a PR targeting the {environment} branch

Proceed? (yes/no)
```

Wait for confirmation.

## Step 3: Create Release Branch

Determine the target environment branch. Do NOT hardcode branch names — check the project's CLAUDE.md or use the branch-to-environment mapping:

```bash
# Switch to the target environment branch and pull latest
git checkout <target-environment-branch>
git pull origin <target-environment-branch>

# Create the release branch
git checkout -b release/{N}-to-<environment>
```

## Step 4: Cherry-Pick Work Item Commits

For each work item in the release:

1. Find the associated commits using `repo_search_commits` with `includeWorkItems: true`, or by searching for `AB#{id}` in commit messages
2. Cherry-pick each commit in chronological order:
   ```bash
   git cherry-pick <commit-hash>
   ```
3. If conflicts arise, STOP and report them. Do not resolve automatically. Present recovery options:

```
CONFLICT while cherry-picking AB#1236 (commit ghi9012)

Conflicting files:
- src/API/Controllers/HistoryController.cs

Options:
1. Skip this work item and continue with the rest
2. Abort the entire release deploy and clean up
3. I will resolve the conflict manually — wait for me

Which option? (1 / 2 / 3)
```

- **Option 1:** Run `git cherry-pick --skip` and continue. Note the skipped item in the summary.
- **Option 2:** Run `git cherry-pick --abort`, delete the release branch, switch back. Report which items were NOT deployed.
- **Option 3:** Wait for the user to resolve and run `git cherry-pick --continue`, then proceed.

Track progress as you go:

```
Cherry-picking commits for Release #{N}:
[x] AB#1234: Add payment export (3 commits)
[x] AB#1235: Fix login redirect (1 commit)
[ ] AB#1236: View history (2 commits) — CONFLICT
```

## Step 5: Push and Create PR

1. Push the release branch: `git push -u origin HEAD`
2. Create a PR via Azure DevOps MCP:
   - **sourceRefName**: `refs/heads/release/{N}-to-<environment>`
   - **targetRefName**: `refs/heads/<target-environment-branch>`
   - **title**: `Release #{N} → {Environment}`
   - **description**: List all work items included with their IDs and titles
3. Link all work items to the PR via `wit_link_work_item_to_pull_request`

## Step 6: Present Summary

```
Release #{N} PR created for {environment}.

PR: {pr-url}
Branch: release/{N}-to-{environment} → {target-branch}

Work items included:
- AB#1234: Add payment export
- AB#1235: Fix login redirect
- AB#1236: View history

Next steps:
- Review and approve the PR
- Merge triggers the CD pipeline for {environment}
- Update work item states in Azure DevOps after merge
```

Do NOT trigger the CD pipeline — it triggers automatically on PR merge.

## Step 7: Notify Team (if Teams MCP is configured)

Send a notification to the project's Teams channel via the Microsoft Teams MCP server:

```
🚀 Release #{N} PR created for {environment}
PR: {pr-url}
Work items: AB#1234, AB#1235, AB#1236
Awaiting review and merge.
```

If the Teams MCP server is not configured, skip this step silently.
