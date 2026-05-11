Rework work item AB#$ARGUMENTS based on feedback received after the last pull request. Follow this workflow:

## Step 1: Find the Latest Pull Request

Handle `$ARGUMENTS` as either `1234` or `AB#1234` — strip the `AB#` prefix when calling the MCP API.

Find the most recent PR linked to this work item:

1. Read the work item via MCP and note its **relations** — look for pull request artifact links
2. For each linked PR, fetch its details via `repo_get_pull_request_by_id` and record the **creationDate**
3. Identify the **most recent PR** by creation date — this is the baseline for detecting new feedback

Save the PR's `creationDate` as `LAST_PR_DATE` — everything after this timestamp is new feedback.

## Step 2: Gather Rework Feedback

### New Comments

Read the work item comments via `wit_list_work_item_comments`. Filter to only comments created **after** `LAST_PR_DATE`. These contain the rework feedback.

For each new comment, check for embedded images (`<img>` tags with `src` URLs pointing to Azure DevOps attachments). **Download and view every embedded image** using WebFetch — they often contain screenshots of bugs, visual issues, or annotated UI showing what needs to change.

### Description & Acceptance Criteria Changes

Read the work item revisions via `wit_list_work_item_revisions`. Check if the **description** or **acceptance criteria** fields were modified **after** `LAST_PR_DATE`.

- If changed: extract the **current** description and acceptance criteria, and note what was added or modified
- If unchanged: still read the current description and acceptance criteria — a comment may reference something that was in the original requirements but missing from the implementation

### Always Re-read Requirements

Regardless of whether description/acceptance criteria changed, **always read the full current description and acceptance criteria**. Rework comments often say things like "the original requirement for X is missing" without the description itself changing. You need the full context to understand what the feedback is referring to.

## Step 3: Summarize Rework and Confirm

Present a summary of the rework feedback to the user:

```
## Rework for AB#{id}: {title}

**Last PR:** #{pr_id} (created {date})
**New comments:** {count}

### Rework Feedback
{summarized feedback from new comments — numbered list}

### Requirement Changes (if any)
{description/acceptance criteria changes since last PR, or "No changes to description or acceptance criteria since last PR"}

### Current Acceptance Criteria
{full acceptance criteria — numbered list, highlight any that the feedback suggests are not yet met}

Does this capture the rework correctly? Do you have any additional context?
```

**Wait for the user to respond.** Do NOT proceed until the user confirms or provides additional context. If they add context, incorporate it into the plan.

## Step 4: Explore & Plan

1. **Explore** the codebase to map relevant files — focus on files changed in the last PR and any new areas needed
2. **Plan** the rework approach

Present the plan to the user:

```
## Rework Plan for AB#{id}

### Approach
{brief description of what needs to change to address the feedback}

### Files to Create
- `path/to/new/file.cs` — {purpose}
- `path/to/new/file.tsx` — {purpose}

### Files to Modify
- `path/to/existing/file.cs` — {what changes and why}
- `path/to/existing/file.tsx` — {what changes and why}

### Files to Delete (if any)
- `path/to/old/file.cs` — {why it's being removed}

### Agents
- **backend**: {what it will do}
- **frontend**: {what it will do}

### Risks / Considerations
- {any potential issues or trade-offs}

Approve this plan? (yes / no / suggest changes)
```

**Wait for the user to approve the plan.** Do NOT start implementation until the user approves. If they suggest changes, revise the plan and present it again.

## Step 5: Switch to Existing Branch

The work item already has a branch from the previous PR. Switch to it:

1. Get the source branch name from the most recent PR
2. Switch to that branch: `git checkout <branch-name>`
3. Pull the latest: `git pull`

If the PR was completed/merged and the branch was deleted, create a new branch from the PR's target branch following the same naming convention as `/implement` Step 4.

## Step 6: Implement

1. **Implement** the rework using backend and/or frontend agents according to the approved plan
2. **Generate mockup** if there are UI changes

## Step 7: Build Validation

Run a build check **before** any other quality checks. Use the `build-validator` agent to verify that all projects compile successfully.

- If the build fails, **fix the errors immediately** and re-run until the build passes
- Do NOT proceed to review, tests, or lint until the build is clean

## Step 8: Quality Checks

1. **Review** code for quality, security, and Clean Architecture compliance
2. **Run tests** — unit, integration, and build validation
3. **Run lint** — ESLint and dotnet format

## Step 9: UAT Gate

### If Hot Fix:
Skip manual UAT. Present an abbreviated confirmation:

```
Rework complete. All automated checks passed.

Push changes? (yes/no)
```

Wait for confirmation before proceeding.

### If Feature, User Story, Bug, or other:
Generate a UAT checklist from the acceptance criteria and present:

```
Automated checks passed and the UAT checklist is ready.

## UAT Checklist
[generated checklist here — highlight items specific to the rework feedback]

Please manually test the rework using the checklist above.

Did manual testing pass?
- If YES → reply "testing passed" and I will push the changes
- If NO  → describe what failed or what behaved unexpectedly
           and I will investigate and fix before asking you again
```

Wait for the user's response before proceeding. Do NOT push until confirmed.

## Step 10: Push and Update

1. Push the changes: `git push`
2. Add a comment on the existing PR summarizing what was changed in the rework
3. Update the work item status in Azure DevOps if needed
