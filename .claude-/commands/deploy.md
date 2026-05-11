Commit, push, and deploy the current changes. Usage: `/deploy [message]`

`$ARGUMENTS` is an optional commit message. If not provided, auto-generate one from the changes.

## Step 1: Pre-flight Checks

1. Run `dotnet build` on any modified .NET projects
2. If frontend files changed, run `npx tsc --noEmit` in the relevant client directory
3. If either fails, STOP and report the errors — do not deploy broken code

## Step 2: Review Changes

```bash
git status --short
git diff --stat
```

Present the changes:

```
## Changes to Deploy

| Status | File |
|--------|------|
| M | src/API/Controllers/PaymentController.cs |
| M | src/Application/Payments/ExportHandler.cs |
| A | src/Domain/Payments/ExportResult.cs |

{count} files changed. Deploy? (yes/no)
```

Wait for confirmation.

## Step 3: Commit

1. Stage only the relevant files (never use `git add -A`)
2. Never stage `.env`, `appsettings.*.json` with real secrets, or `node_modules`
3. Commit with the provided message or auto-generated one
4. Always end with: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
5. Use HEREDOC format for the commit message

## Step 4: Push

```bash
git push -u origin HEAD
```

Push only the current branch. Do NOT cross-push to other branches.

## Step 5: Pipeline (Conditional)

Check if the current branch is an environment branch (a branch that a CD pipeline watches):

- **On an environment branch**: Trigger the appropriate CD pipeline via Azure DevOps MCP. Monitor the build and report status.
- **On a feature/work branch**: Do NOT trigger. Report that the pipeline will trigger on PR merge.

## Step 6: Report

```
Deployed successfully.

Branch: {branch}
Commit: {hash} - {message}
Pipeline: {triggered | will trigger on PR merge}
```
