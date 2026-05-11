Create a new release. Follow this workflow:

## Step 1: Determine Release Number

Check existing iterations in the project via Azure DevOps MCP (`work_list_iterations`) to find iterations that follow the `Release #N` naming pattern. The new release number is the next sequential number.

If `$ARGUMENTS` is provided, use it as the release name (e.g., `$ARGUMENTS` = "24" creates "Release #24").

## Step 2: Gather Work Items for the Release

Ask the user which work items to include. They may provide:
- A list of work item IDs (e.g., "AB#1234, AB#1235, AB#1236")
- A query (e.g., "all completed user stories in the current sprint")
- A state filter (e.g., "all items in Ready for Testing")

Use the Azure DevOps MCP to search/query for the specified work items. Present the list for confirmation:

```
## Release #{N}

| ID | Type | Title | State |
|----|------|-------|-------|
| AB#1234 | User Story | Add payment export | Ready for Testing |
| AB#1235 | Bug | Fix login redirect | Ready for Testing |
| AB#1236 | User Story | View history | Ready for Testing |

Create this release with {count} work items? (yes/no)
```

Wait for confirmation before proceeding.

## Step 3: Create the Release Iteration

Create a new iteration in Azure DevOps via `work_create_iterations`:
- **Name**: `Release #{N}`
- **Start date**: today
- No finish date (set when deployed to production)

## Step 4: Assign Work Items to the Release

Use `wit_update_work_items_batch` to set the Iteration Path on each work item to the new release iteration:
- **path**: `/fields/System.IterationPath`
- **value**: `{project}\Release #{N}`

## Step 5: Tag Work Items

Use `wit_update_work_items_batch` to add a release tag to each work item:
- **path**: `/fields/System.Tags`
- **value**: append `release-{N}` to existing tags

## Step 6: Confirm

Present the final summary:

```
Release #{N} created with {count} work items.

Work items assigned:
- AB#1234: Add payment export
- AB#1235: Fix login redirect
- AB#1236: View history

To deploy this release to staging:  /deploy-release {N} staging
To deploy this release to production: /deploy-release {N} production
```
