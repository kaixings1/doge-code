---
description: 为实验功能创建 Linear 工单和 PR
---

你正在开发一个实验性功能，没有设置适当的工单和 PR。

假设你刚刚做了一个提交，以下是后续步骤：

1. 获取你刚刚提交的 SHA（如果你没有提交，请读取 `.claude/commands/commit.md` 并创建一个）

2. 读取 `.claude/commands/linear.md` — 深入思考你刚刚实现的内容，然后为你所做的创建 Linear 工单，将其置于"开发中"状态——它应该有"要解决的问题"和"建议的解决方案"的 ### 标题
3. 获取工单以获取推荐的 git 分支名称
4. git checkout main
5. git checkout -b 'BRANCHNAME'
6. git cherry-pick 'COMMITHASH'
7. git push -u origin 'BRANCHNAME'
8. gh pr create --fill
9. 读取 `.claude/commands/describe_pr.md` 并按照说明操作
