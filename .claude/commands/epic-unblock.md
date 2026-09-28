---
description: 清理被阻止的 epic issues，并重新打开所有依赖项已关闭的 issues。
---

# /epic-unblock

Sweep blocked epics whose declared dependencies are complete.

```bash
node scripts/github-coordination.js unblock --repo <owner/repo>
```

What this does:

1. Scans epic issues in the repository.
2. Checks each blocked epic's dependency list.
3. Moves fully unblocked epics to ready.
4. Updates labels, comments, and local snapshots.

Compatibility aliases:

- `/loop-status`
