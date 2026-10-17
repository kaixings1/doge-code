---
name: resolving-merge-conflicts
description: "当你需要解决进行中的 git merge/rebase 冲突时使用。"
---

1. **查看 merge/rebase 的当前状态。** 查看 git 历史，以及存在冲突的文件。

2. **为每个冲突找到原始出处。** 深入理解每处更改为何做出、其原始意图是什么。阅读 commit 消息，查看相关的 PR、原始 issue/ticket。

3. **解决每个 hunk。** 尽可能同时保留双方的意图。当二者不兼容时，选择与本次 merge 声明目标一致的一方，并注明取舍。**不要**凭空发明新行为。务必完成解决，绝不使用 `--abort`。

4. 了解项目的**自动化检查**并运行它们——通常先 typecheck，再 tests，再 format。修复 merge 破坏的一切问题。

5. **完成 merge/rebase。** 将所有更改加入暂存区并提交。如果是在 rebase，则继续 rebase 流程，直到所有 commit 都完成 rebase。