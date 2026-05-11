Cherry-pick specific work items to an environment. Usage: `/cherry-pick <work-item-ids> <environment>`

Parse `$ARGUMENTS` to extract:
- **Work item IDs**: one or more IDs (e.g., "AB#1234 AB#1235" or "1234, 1235")
- **Target environment**: the environment to deploy to (e.g., "staging", "production")

## Step 1: Read the Work Items

Fetch each work item from Azure DevOps via MCP. Present the list:

```
## Cherry-Pick to {environment}

| ID | Type | Title | State |
|----|------|-------|-------|
| AB#1234 | User Story | Add payment export | Ready for Testing |
| AB#1235 | Bug | Fix login redirect | Ready for Testing |

Cherry-pick {count} work items to {environment}? (yes/no)
```

Wait for confirmation.

## Step 2: Find Commits

For each work item, find associated commits using `repo_search_commits` with `includeWorkItems: true`, or by searching for `AB#{id}` in commit messages on the source branch.

If no commits are found for a work item, STOP and report which work item has no associated commits.

## Step 3: Create Cherry-Pick Branch

Determine the target environment branch. Do NOT hardcode branch names — check the project's CLAUDE.md or pipeline configuration.

```bash
git checkout <target-environment-branch>
git pull origin <target-environment-branch>
git checkout -b cherry-pick/<date>-to-<environment>
```

## Step 4: Cherry-Pick Commits

Cherry-pick commits for each work item in chronological order:

```bash
git cherry-pick <commit-hash>
```

If conflicts arise, STOP and report them. Do not resolve automatically. Present recovery options:

```
CONFLICT while cherry-picking AB#1235 (commit def5678)

Conflicting files:
- src/API/Controllers/PaymentController.cs

Options:
1. Skip this work item and continue with the rest
2. Abort the entire cherry-pick and clean up
3. I will resolve the conflict manually — wait for me

Which option? (1 / 2 / 3)
```

- **Option 1:** Run `git cherry-pick --skip` and continue with remaining work items. Note the skipped item in the summary.
- **Option 2:** Run `git cherry-pick --abort`, delete the cherry-pick branch, and switch back to the original branch.
- **Option 3:** Wait for the user to resolve conflicts and run `git cherry-pick --continue`, then proceed.

Track progress:
```
Cherry-picking:
[x] AB#1234: Add payment export (2 commits)
[ ] AB#1235: Fix login redirect (1 commit) — CONFLICT
```

## Step 5: Push and Create PR

1. Push: `git push -u origin HEAD`
2. Create a PR via Azure DevOps MCP:
   - **sourceRefName**: `refs/heads/cherry-pick/<date>-to-<environment>`
   - **targetRefName**: `refs/heads/<target-environment-branch>`
   - **title**: `Cherry-pick AB#1234, AB#1235 → {Environment}`
   - **description**: List all work items with IDs and titles
3. Link all work items to the PR via `wit_link_work_item_to_pull_request`

## Step 6: Present Summary

```
Cherry-pick PR created for {environment}.

PR: {pr-url}
Work items:
- AB#1234: Add payment export
- AB#1235: Fix login redirect

Merge the PR to trigger the CD pipeline for {environment}.
```
