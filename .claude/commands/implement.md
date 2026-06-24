Implement work item AB#$ARGUMENTS. Follow this workflow:

## Step 1: Read the Work Item

Read the work item from Azure DevOps via MCP. Extract:
- **System.WorkItemType** — determines branch prefix
- **System.Title** — determines branch suffix
- **Acceptance criteria / description** — needed for implementation

Handle `$ARGUMENTS` as either `1234` or `AB#1234` — strip the `AB#` prefix when calling the MCP API.

### Embedded Images

The description and acceptance criteria fields may contain embedded images (screenshots, mockups, diagrams). These are typically `<img>` tags with `src` URLs pointing to Azure DevOps attachments. **Download and view every embedded image** using WebFetch — they often contain critical visual requirements (UI layouts, expected behavior, error states) that are not described in the text.

### Comments

Read the work item comments via `wit_list_work_item_comments`. Comments often contain clarifications, scope changes, or additional requirements added after the work item was created. Incorporate any relevant information from comments into your understanding of the work item.

## Step 2: Summarize and Confirm

Present a summary of the work item to the user:

```
## AB#{id}: {title}

**Type:** {work item type}
**State:** {state}
**Assigned To:** {assigned to}

### Description
{description summary}

### Acceptance Criteria
{acceptance criteria — numbered list}

Does this look correct? Do you have any additional context or requirements?
```

**Wait for the user to respond.** Do NOT proceed until the user confirms or provides additional context. If they add context, incorporate it into the plan.

## Step 3: Explore & Plan

1. **Explore** the codebase to map relevant files
2. **Plan** the implementation approach

Present the plan to the user:

```
## Implementation Plan for AB#{id}

### Approach
{brief description of how you will implement this}

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

## Step 4: Create Feature Branch

Only create the branch after the plan is approved.

Capture the current branch as the PR target — do NOT hardcode any branch name:

```bash
BASE_BRANCH=$(git symbolic-ref --short HEAD)
```

Determine the branch prefix from the work item type:

| Work Item Type | Branch Prefix |
|---|---|
| Feature | `feature/` |
| User Story | `story/` |
| Bug | `bugfix/` |
| Hot Fix | `hotfix/` |
| (anything else) | `work/` |

Construct the branch name as `{prefix}AB#{id}-{sanitized-title}`:
- Sanitize the title: lowercase, replace non-alphanumeric characters (except hyphens) with hyphens, collapse consecutive hyphens, truncate to 50 characters, trim leading/trailing hyphens
- Example: Feature AB#1234 "Add Payment History Export" → `feature/AB#1234-add-payment-history-export`

Create and switch to the branch:
```bash
git checkout -b <branch-name>
```

If the branch already exists, switch to it with `git checkout <branch-name>` instead of failing.

Remember the `BASE_BRANCH` — you will need it for the PR step.

## Step 5: Implement

1. **Implement** using backend and/or frontend agents according to the approved plan
2. **Generate mockup** if there are UI changes

## Step 6: Build Validation

Run a build check **before** any other quality checks. Use the `build-validator` agent to verify that all projects compile successfully.

- If the build fails, **fix the errors immediately** and re-run until the build passes
- Do NOT proceed to review, tests, or lint until the build is clean

## Step 7: Quality Checks

1. **Review** code for quality, security, and Clean Architecture compliance
2. **Run tests** — unit, integration, and build validation
3. **Run lint** — ESLint and dotnet format

## Step 8: UAT Gate

### If Hot Fix:
Skip manual UAT. Present an abbreviated confirmation:

```
Hot Fix ready. All automated checks passed.

Create PR? (yes/no)
```

Wait for confirmation before proceeding.

### If Feature, User Story, Bug, or other:
Generate a UAT checklist from the acceptance criteria and present:

```
Automated checks passed and the UAT checklist is ready.

## UAT Checklist
[generated checklist here]

Please manually test the feature using the checklist above.

Did manual testing pass?
- If YES → reply "testing passed" and I will create the PR
- If NO  → describe what failed or what behaved unexpectedly
           and I will investigate and fix before asking you again
```

Wait for the user's response before proceeding. Do NOT create a PR until confirmed.

## Step 9: Push, Create PR, and Update Work Item

1. Push the branch: `git push -u origin HEAD`
2. Create a PR via Azure DevOps MCP:
   - **sourceRefName**: `refs/heads/{branch-name}`
   - **targetRefName**: `refs/heads/{BASE_BRANCH}` (the branch captured in Step 4)
   - **title**: `AB#{id}: {work item title}`
   - **labels**: `["hotfix"]` if the work item type is Hot Fix
3. Link the PR to the work item via `wit_link_work_item_to_pull_request`
4. Update the work item status in Azure DevOps
