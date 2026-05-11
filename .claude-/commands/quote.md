Fetch a work item and display it as a formatted quote block. Usage: `/quote <work-item-id>`

Parse `$ARGUMENTS` to extract the work item ID. Accept formats like `AB#1234`, `#1234`, or just `1234`.

## Step 1: Fetch the Work Item

Read the work item from Azure DevOps using the project from the current repo's CLAUDE.md configuration. Expand with `relations` to include child items and links.

If the work item is not found, report the error and stop.

## Step 2: Display the Quote

Format the work item as a quote block:

```
> **AB#{id}: {title}**
> **Type:** {type} | **State:** {state} | **Assigned To:** {assignedTo}
>
> {description text, stripped of HTML tags, truncated to ~500 chars if long}
>
> **Acceptance Criteria:**
> {acceptance criteria, stripped of HTML tags, truncated to ~500 chars if long}
```

- Strip all HTML tags from description and acceptance criteria fields, preserving line breaks as `> ` prefixed lines
- If description or acceptance criteria is empty, omit that section
- If the work item has child items, append:

```
>
> **Child Items:** {count}
> | ID | Title | State |
> |----|-------|-------|
> | AB#{id} | {title} | {state} |
```

- If the work item has tags, include them: `> **Tags:** {comma-separated tags}`

That's it — just display the quote. Do not modify anything.
