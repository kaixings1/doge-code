---
name: cmux-release
description: "cmux 发布流程、版本号提升、变更日志更新、pretag 守卫、发布标签以及发布产物的预期。在准备或排查 cmux 发布问题时使用。"
---

# cmux 发布

优先使用 `/release` 命令。它会确定新版本号（默认 minor）、收集上一个标签以来的提交、更新 `CHANGELOG.md`、运行 `./scripts/bump-version.sh`、提交、运行 `./scripts/release-pretag-guard.sh`，然后打标签并推送。

`web/app/[locale]/(landing)/docs/changelog/page.tsx` 处的文档变更日志页面由 `CHANGELOG.md` 渲染而来，因此没有单独的文档变更日志来源需要更新。

## 版本号提升

```bash
./scripts/bump-version.sh          # minor (0.15.0 -> 0.16.0)
./scripts/bump-version.sh patch    # 0.15.0 -> 0.15.1
./scripts/bump-version.sh major    # 0.15.0 -> 1.0.0
./scripts/bump-version.sh 1.0.0    # 显式版本号
```

它会更新 `MARKETING_VERSION` 与 `CURRENT_PROJECT_VERSION`。构建号会自动递增，并且必须递增，Sparkle 自动更新才能生效。除非明确要求其它方式，否则提升 minor 版本号。

## 打标签

```bash
./scripts/release-pretag-guard.sh
git tag vX.Y.Z
git push origin vX.Y.Z
gh run watch --repo manaflow-ai/cmux
```

如果 pretag 守卫失败，运行 `./scripts/bump-version.sh`，提交构建号的提升，然后重试。

## 发布产物与密钥

- 发布产物是 `cmux-macos.dmg`，附加在标签上。README 的下载按钮指向 `releases/latest/download/cmux-macos.dmg`。
- 签名与公证需要 GitHub 密钥 `APPLE_CERTIFICATE_BASE64`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。

## 详细参考

- [references/release-checklist.md](references/release-checklist.md)：变更日志的措辞风格、失败排查以及产物重命名带来的连带影响。
