---
name: version-manager
description: |
  管理项目版本号（读取/升级 major/minor/patch/pre）。
  使用场景：发布新版本前升级版本号、查看当前版本、创建预发布版本。
  触发词：版本管理、version、bump version、升级版本、major、minor、patch、pre-release。
Keywords: version, bump, release, 版本, 升级, 发布
---

# Version Manager

项目版本号管理工具，基于 `scripts/version.ts`。

## 查看当前版本

```bash
bun run scripts/version.ts
```

输出当前 `package.json` 中的版本号。

## 升级版本

```bash
# 主版本升级 (x.0.0)
bun run scripts/version.ts major

# 次版本升级 (x.y.0)
bun run scripts/version.ts minor

# 补丁版本升级 (x.y.z)
bun run scripts/version.ts patch

# 预发布版本 (x.y.z-alpha.1)
bun run scripts/version.ts pre
```

## 版本规则

- **major**: 不兼容的 API 变更
- **minor**: 向后兼容的功能新增
- **patch**: 向后兼容的问题修复
- **pre**: 预发布版本（默认 alpha，可自定义标识符）

## 预发布版本

```bash
# 默认 alpha 预发布
bun run scripts/version.ts pre

# 自定义预发布标识
bun run scripts/version.ts pre beta
# 输出: x.y.z-beta.1
```

## 输出示例

```
当前版本: 1.2.3
新版本: 1.3.0

变更:
- 次版本升级

💡 下一步:
- git add package.json
- git commit -m "chore: bump version to 1.3.0"
- git tag v1.3.0
- git push && git push --tags
```

## 安全特性

- 版本号仅写入 `package.json`
- 不修改其他文件
- 不执行 git 操作（需手动提交）
