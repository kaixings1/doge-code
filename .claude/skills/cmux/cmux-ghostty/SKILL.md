---
name: cmux-ghostty
description: "cmux 的 Ghostty 子模块与 GhosttyKit 工作流规则。在修改 ghostty 子模块、重新构建 GhosttyKit.xcframework、更新父仓库的子模块指针，或记录 fork 冲突备注时使用。"
---

# cmux Ghostty

## GhosttyKit 构建

始终以 Release 优化重新构建 xcframework：

```bash
cd ghostty && zig build -Demit-xcframework=true -Dxcframework-target=universal -Doptimize=ReleaseFast
```

## 子模块工作流

Ghostty 的改动在 `ghostty` 子模块中提交，并推送到 `manaflow-ai/ghostty` fork。要用 fork 改动和冲突备注保持 `docs/ghostty-fork.md` 为最新。

始终先运行 `git remote -v`，然后推送到那个指向 `manaflow-ai/ghostty` 的 remote。`.gitmodules` 把子模块 URL 设为该 fork，所以在正常的检出中它就是 `origin`；较旧的配置会把上游当作 `origin`，并把该 fork 添加为 `manaflow`。下面请替换成正确的名字。

```bash
cd ghostty
git remote -v                  # 找到指向 manaflow-ai/ghostty 的 remote（通常是 origin）
git checkout -b <branch>
git add <files>
git commit -m "..."
git push origin <branch>
```

要从上游 `ghostty-org/ghostty` 拉取改动，先把它添加为一个显式 remote，因为默认没有任何检出会带上它：

```bash
cd ghostty
git remote add upstream https://github.com/ghostty-org/ghostty.git   # 只做一次
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

然后在父仓库中记录新的 SHA：

```bash
cd ..
git add ghostty
git commit -m "更新 ghostty 子模块"
```

## 子模块安全

对于任何子模块（ghostty、`vendor/bonsplit`、`homebrew-cmux`），都要**先把子模块提交推送到它的远端分支**，然后在父仓库中提交更新后的指针。绝不要在分离头指针或临时分支上提交：那样父仓库会指向一个从任何远端分支都不可达的 SHA，之后的检出或 CI 任务就会拉取失败。

用你刚推送到的那个 remote，验证该提交从指针应当跟踪的分支上是可达的：

```bash
cd ghostty && git fetch origin main && git merge-base --is-ancestor HEAD origin/main
```

## 详细参考

- [references/submodule-safety.md](references/submodule-safety.md)：有序的安全操作步骤，以及对 fork 文档的期望。
