---
name: git-clone-proxy
description: 克隆 GitHub 仓库时自动使用代理加速下载，成功后替换为原始 URL
triggers:
  - "clone"
  - "克隆仓库"
  - "git clone"
  - "使用代理克隆"
---
# Git Clone Proxy

## 概述

使用 gh-proxy.com 代理加速 GitHub 仓库克隆，克隆成功后自动将远程 URL 替换为原始地址。

## 核心规则

1. **自动代理**：所有 `git clone` 操作默认使用 `https://gh-proxy.com/` 前缀
2. **成功替换**：克隆完成后，立即将 remote URL 替换为原始地址
3. **递归支持**：自动处理子模块（如果仓库包含子模块）
4. **不保留代理**：最终只保留原始 `https://github.com/` URL

## 执行流程

### 步骤 1：解析仓库地址

从用户输入提取仓库信息：
- 支持格式：`https://github.com/owner/repo`、`git@github.com:owner/repo.git`、`owner/repo`
- 转换为 HTTPS 格式：`https://github.com/owner/repo`

### 步骤 2：构建代理 URL

在原始 URL 前添加代理前缀：
```
https://gh-proxy.com/https://github.com/owner/repo
```

### 步骤 3：执行克隆

使用代理 URL 执行克隆：
```bash
git clone https://gh-proxy.com/https://github.com/owner/repo [目录名]
```

可选参数：
- `--depth 1`：浅克隆（仅最新提交）
- `--branch <name>`：指定分支
- `--recurse-submodules`：递归克隆子模块

### 步骤 4：验证克隆成功

检查目录是否存在并包含 `.git`：
```bash
ls -la <目录名>/.git
```

### 步骤 5：替换远程 URL

进入仓库目录，替换 remote URL：
```bash
cd <目录名>
git remote set-url origin https://github.com/owner/repo
```

### 步骤 6：验证 URL

确认替换成功：
```bash
git remote -v
# 应显示: origin  https://github.com/owner/repo.git (fetch)
#          origin  https://github.com/owner/repo.git (push)
```

## 使用示例

### 示例 1：基本克隆

用户输入：
```
git clone https://github.com/facebook/react.git
```

实际执行：
```bash
git clone https://gh-proxy.com/https://github.com/facebook/react.git
cd react
git remote set-url origin https://github.com/facebook/react.git
git remote -v
```

### 示例 2：带目录名和浅克隆

用户输入：
```
git clone --depth 1 https://github.com/owner/repo.git mydir
```

实际执行：
```bash
git clone --depth 1 https://gh-proxy.com/https://github.com/owner/repo.git mydir
cd mydir
git remote set-url origin https://github.com/owner/repo.git
```

### 示例 3：带子模块

用户输入：
```
git clone --recurse-submodules https://github.com/owner/repo.git
```

实际执行：
```bash
git clone https://gh-proxy.com/https://github.com/owner/repo.git
cd repo
git submodule update --init --recursive
git remote set-url origin https://github.com/owner/repo.git
```

### 示例 4：指定分支

用户输入：
```
git clone -b develop https://github.com/owner/repo.git
```

实际执行：
```bash
git clone -b develop https://gh-proxy.com/https://github.com/owner/repo.git
cd repo
git remote set-url origin https://github.com/owner/repo.git
```

## 常见问题处理

### 克隆失败

如果代理地址不可用，回退到原始地址：
```bash
git clone https://github.com/owner/repo.git
```

### 子模块仍然指向代理

如果子模块 URL 未更新，手动同步：
```bash
git submodule sync --recursive
git submodule update --init --recursive
```

### 已克隆仓库的 URL 清理

对已克隆但未替换 URL 的仓库执行：
```bash
git remote set-url origin https://github.com/owner/repo
```

## 注意事项

- 仅在克隆时使用代理，克隆完成后**必须**替换为原始 URL
- 禁止在提交、推送、拉取等操作中使用代理地址
- 如果用户明确指定原始地址（不使用代理），尊重用户选择
- 代理仅用于加速下载，不用于后续的 Git 操作
