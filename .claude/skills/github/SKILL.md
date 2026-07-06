---
name: github
description: "使用 `gh` CLI 处理 Issues、Pull Requests、Actions 运行和 GitHub API 查询。"
risk: safe
source: "Dimillian/Skills (MIT)"
date_added: "2026-03-25"
---

# GitHub 技能

Use the `gh` CLI to interact with GitHub. 始终 specify `--repo owner/repo` when not in a git directory, or use URLs directly.

## 何时使用
- 当用户询问 GitHub issues、pull requests、工作流 runs 或 CI 失败时。
- When you need `gh issue`, `gh pr`, `gh run`, or `gh api` from the command line.

## 拉取请求

检查 PR 上的 CI 状态：
```bash
gh pr checks 55 --repo owner/repo
```

列出最近的工作流运行：
```bash
gh run list --repo owner/repo --limit 10
```

查看运行并查看哪些步骤失败：
```bash
gh run view <run-id> --repo owner/repo
```

仅查看失败步骤的日志：
```bash
gh run view <run-id> --repo owner/repo --log-failed
```

### 调试 CI 失败

按以下顺序调查失败的 CI 运行：

1. **Check PR status** — identify which checks are failing:
   ```bash
   gh pr checks 55 --repo owner/repo
   ```
2. **List recent runs** — find the relevant run ID:
   ```bash
   gh run list --repo owner/repo --limit 10
   ```
3. **View the failed run** — see which jobs and steps failed:
   ```bash
   gh run view <run-id> --repo owner/repo
   ```
4. **Fetch failure logs** — get the detailed output for failed steps:
   ```bash
   gh run view <run-id> --repo owner/repo --log-failed
   ```

## API 高级查询

The `gh api` command is useful for accessing data not available through other subcommands.

使用特定字段获取 PR：
```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON 输出

Most commands support `--json` for structured output.  You can use `--jq` to 过滤器:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
