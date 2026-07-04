---
name: git-pushing
description: "暂存所有更改、创建约定式提交并推送到远程分支。当明确要求推送更改（"推送这个"、"提交并推送"）、提到将工作保存到远程（"保存到 GitHub"、"推送到远程"）或完成功能并想分享时使用。"
risk: critical
source: community
date_added: "2026-02-27"
---

# Git 推送工作流

暂存所有更改、创建约定式提交并推送到远程分支。

## 何时使用
在以下情况下自动激活：

- 明确要求推送更改 ("push this", "commit and push")
- 提到将工作保存到远程 ("save to github", "push to remote")
- 完成功能并想分享时
- Says phrases like "let's push this up" or "commit these changes"

## 工作流

**ALWAYS use the script** - do NOT use manual git commands:

```bash
bash skills/git-pushing/scripts/smart_commit.sh
```

With custom message:

```bash
bash skills/git-pushing/scripts/smart_commit.sh "feat: add feature"
```

Script handles: staging, conventional commit message, Claude footer, push with -u flag.

## 局限性
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
