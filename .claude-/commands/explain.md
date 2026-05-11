Fetch a work item, summarize it, and explain it in plain language. Usage: `/explain <work-item-id>`

Parse `$ARGUMENTS` to extract the work item ID. Accept formats like `AB#1234`, `#1234`, or just `1234`.

## Step 1: Fetch the Work Item

Read the work item from Azure DevOps using the project from the current repo's CLAUDE.md configuration. Expand with `relations` to include child items and links.

If the work item is not found, report the error and stop.

## Step 2: Gather Context

Collect these fields from the work item:
- Title, type, state, assigned to
- Description
- Acceptance criteria
- Tags
- Child work items (if any — fetch their titles and states)
- Parent work item (if any — fetch its title)
- Linked PRs (if any)

## Step 3: Present the Explanation

Output the following sections:

### Summary
A 1–2 sentence plain-language summary of what this work item is about. Avoid jargon — explain it as if to someone unfamiliar with the codebase.

### What needs to happen
A bullet list translating the acceptance criteria and description into concrete actions. If acceptance criteria are vague, interpret them based on the description and title. If there are child work items, use them to inform this list.

### Why it matters
A short explanation of the business or user value — why this work item exists. Infer this from the description, parent work item context, and tags.

### Current Status
- **State:** {state}
- **Assigned To:** {assignedTo or "Unassigned"}
- **Parent:** {parent title or "None"}
- **Child Items:** {count completed}/{count total} complete
- **PRs:** {list of linked PR numbers and their status, or "None yet"}

### Scope & Risks
Flag anything that looks ambiguous, missing, or potentially risky:
- Vague acceptance criteria that may need clarification
- No acceptance criteria at all
- Large scope (many child items or broad description)
- Dependencies on other work items

If nothing stands out, say "No concerns — scope looks clear."
