Add work items to an existing release. Usage: `/add-to-release <release-number> <work-item-ids>`

Parse `$ARGUMENTS` to extract:
- **Release number**: required (e.g., "24")
- **Work item IDs**: one or more IDs (e.g., "AB#4599 AB#4600")

## Step 1: Verify the Release Exists

Query Azure DevOps for the `Release #{N}` iteration via `work_list_iterations`. If it doesn't exist, STOP and report: "Release #{N} does not exist. Use /create-release {N} to create it."

## Step 2: Show Current Release Contents

Query work items currently in the release (tagged `release-{N}` or in the `Release #{N}` iteration).

## Step 3: Fetch New Work Items

Read each specified work item from Azure DevOps. Present the combined list:

```
## Release #{N} — Adding Work Items

### Currently in Release #{N}:
| ID | Type | Title | State |
|----|------|-------|-------|
| AB#4521 | User Story | Add payment export | Ready for Testing |
| AB#4522 | User Story | Bulk approval workflow | Ready for Testing |

### Adding:
| ID | Type | Title | State |
|----|------|-------|-------|
| AB#4599 | Bug | Fix export column alignment | Ready for Testing |
| AB#4600 | User Story | Add export date filter | Ready for Testing |

Add 2 work items to Release #{N}? (yes/no)
```

Wait for confirmation.

## Step 4: Assign and Tag

Use `wit_update_work_items_batch` to:
1. Set the Iteration Path to `{project}\Release #{N}` on each new work item
2. Append `release-{N}` to each work item's tags

## Step 5: Confirm

```
2 work items added to Release #{N}.

Release #{N} now contains 4 work items:
- AB#4521: Add payment export
- AB#4522: Bulk approval workflow
- AB#4599: Fix export column alignment (added)
- AB#4600: Add export date filter (added)
```
