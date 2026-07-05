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
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
