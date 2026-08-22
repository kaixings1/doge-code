---
description: 管理项目版本号（读取/升级 major/minor/patch）
---

## 上下文

- 版本文件：`package.json`

## 用法

- `/version` — 显示当前版本
- `/version major` — 升级主版本 (x.0.0)
- `/version minor` — 升级次版本 (x.y.0)
- `/version patch` — 升级补丁版本 (x.y.z)
- `/version pre` — 创建预发布版本 (x.y.z-alpha.1)

## 任务

1. 读取 `package.json` 获取当前版本
2. 根据参数执行对应的版本操作
3. 显示新旧版本对比
4. 提供下一步建议（git commit, tag 等）

输出格式：
```
当前版本: {oldVersion}
新版本: {newVersion}

变更:
- {changeDescription}

💡 下一步:
- git add package.json
- git commit -m "chore: bump version to {newVersion}"
- git tag v{newVersion}
- git push && git push --tags
```
