# Git 设置

在 Vault 中初始化 Git 以获取完整历史记录并防止错误写入。

---

## 初始化

```bash
cd "$VAULT_PATH"
git init
git add -A
git commit -m "初始 Vault 搭建"
```

---

## .gitignore

此仓库根目录的 `.gitignore` 已包含正确的排除项：

```
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.smart-connections/
.obsidian-git-data
.trash/
.DS_Store
```

`workspace.json` 在移动面板时会不断变化，排除它可以保持差异清晰。

---

## Obsidian Git 插件

安装插件后（参见 `plugins.md`）：

设置 > Obsidian Git：
- 自动备份间隔：**15 分钟**
- 文件更改后自动备份：开启
- 备份时推送：开启（如果有远程仓库）
- 提交信息：`vault: auto backup {{date}}`

这在后台静默运行。无需思考即可获得每条笔记的完整历史记录。

---

## 远程仓库（可选）

要备份到 GitHub：

```bash
git remote add origin https://github.com/你的用户名/你的-vault
git push -u origin main
```

如果 Vault 包含个人笔记，请保持仓库私有。
