Check the status of a release, pipeline, or work item. Usage: `/status <target>`

Parse `$ARGUMENTS` to determine what to check:
- **Release**: "release 24" or "r24" → show release status
- **Pipeline**: "pipeline" or "build" → show recent pipeline runs
- **Work item**: "AB#1234" or "1234" → show work item status
- **Environment**: "staging" or "production" → show what's deployed
- **No argument**: show an overview of everything

## If Release (e.g., `/status release 24`):

Query all work items tagged `release-{N}` or in the `Release #{N}` iteration.

```
## Release #24 Status

| ID | Type | Title | State | Environment |
|----|------|-------|-------|-------------|
| AB#4521 | User Story | Add payment export | Closed | Production |
| AB#4522 | User Story | Bulk approval workflow | Ready for Testing | Staging |
| AB#4530 | User Story | Dashboard trends | Ready for Testing | Staging |
| AB#4589 | Bug | Login plus sign fix | Closed | Production |

Deployed to:
- Dev: All 4 items
- Staging: All 4 items
- Production: 2 of 4 items (AB#4521, AB#4589)
```

## If Pipeline (e.g., `/status pipeline` or `/status build`):

Check the project's CLAUDE.md for pipeline configuration. Query recent builds for each pipeline.

```
## Recent Pipeline Runs

| Pipeline | Branch | Status | Time | Build # |
|----------|--------|--------|------|---------|
| Compass API | main | Succeeded | 2026-03-22 14:26 | 20260322.1 |
| Compass Client | main | Succeeded | 2026-03-22 14:27 | 20260322.1 |
| Compass API | develop | Succeeded | 2026-03-21 10:15 | 20260321.3 |
```

## If Work Item (e.g., `/status AB#4521`):

Read the work item from Azure DevOps and show its full status.

```
## AB#4521: Admin Can Export Payment History to CSV

**Type:** User Story
**State:** Ready for Testing
**Assigned To:** Chris Waters
**Release:** Release #24
**Branch:** story/AB#4521-admin-can-export-payment-history
**PR:** #287 (merged to develop)

### Linked PRs
- PR #287 → develop (merged 2026-03-20)
- PR #291 → staging (merged 2026-03-21)

### Child Tasks
| ID | Title | State |
|----|-------|-------|
| AB#4525 | Add export API endpoint | Closed |
| AB#4526 | Add CSV service | Closed |
| AB#4527 | Add export button UI | Closed |
```

## If Environment (e.g., `/status staging`):

Check the project's CLAUDE.md for the environment branch mapping. Show the last deployment and what's currently deployed.

```
## Staging Environment

**Branch:** staging
**Last deployment:** 2026-03-21 15:30 (Build #20260321.2)
**Pipeline:** Compass API — Succeeded

### Recent merges to staging:
| Commit | Message | Date |
|--------|---------|------|
| a1b2c3d | Release #24 → Staging | 2026-03-21 |
| d4e5f6a | Cherry-pick AB#4601 | 2026-03-22 |
```

## If No Argument (e.g., `/status`):

Show a high-level overview.

```
## Project Status

### Active Releases
| Release | Work Items | Latest Environment |
|---------|-----------|-------------------|
| Release #24 | 6 items | Staging |
| Release #23 | 4 items | Production |

### Recent Pipelines
| Pipeline | Last Run | Status |
|----------|----------|--------|
| Compass API | 20260322.1 | Succeeded |
| Compass Client | 20260322.1 | Succeeded |

### Open PRs
| PR # | Title | Target |
|------|-------|--------|
| #292 | AB#4601: Fix bulk approval | develop |
```
