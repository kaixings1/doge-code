
---
description: 创建工作树（worktree）并启动实施会话执行计划
---

2. 设置实施工作树：
2a. 读取 `hack/create_worktree.sh` 并使用 Linear 分支名称创建新工作树：`./hack/create_worktree.sh ENG-XXXX BRANCH_NAME`

3. 确定所需数据：

- 分支名称
- 计划文件路径（仅使用相对路径）
- 启动提示
- 要运行的命令

**重要路径使用说明：**
- thoughts/ 目录在主仓库和工作树之间同步
- 始终仅使用以 `thoughts/shared/...` 开头的相对路径，不要添加目录前缀
- 示例：`thoughts/shared/plans/fix-mcp-keepalive-proper.md`（不是完整绝对路径）
- 这有效是因为 thoughts 已同步且可从工作树访问

3a. 通过向用户发送消息来确认

```
根据输入，我计划创建具有以下详细信息的工作树：

工作树路径：~/wt/humanlayer/ENG-XXXX
分支名称：BRANCH_NAME
计划文件路径：$FILEPATH
启动提示：

    /implement_plan at $FILEPATH 实施完成后并且所有测试通过后，读取 ./claude/commands/commit.md 并创建提交，然后读取 ./claude/commands/describe_pr.md 并创建 PR，然后在 Linear 工单中添加 PR 链接的评论

要运行的命令：

    humanlayer launch --model opus -w ~/wt/humanlayer/ENG-XXXX "/implement_plan at $FILEPATH 实施完成后并且所有测试通过后，读取 ./claude/commands/commit.md 并创建提交，然后读取 ./claude/commands/describe_pr.md 并创建 PR，然后在 Linear 工单中添加 PR 链接的评论"
```

整合任何用户反馈然后：

4. 启动实施会话：`humanlayer launch --model opus -w ~/wt/humanlayer/ENG-XXXX "/implement_plan at $FILEPATH 实施完成后并且所有测试通过后，读取 ./claude/commands/commit.md 并创建提交，然后读取 ./claude/commands/describe_pr.md 并创建 PR，然后在 Linear 工单中添加 PR 链接的评论"`
