---
name: build-helper
description: |
  构建项目并自动处理 Bun 到 Node.js 的兼容性补丁。
  使用场景：开发后构建、发布前打包、CI/CD 流水线。
  触发词：构建、build、bundle、打包、发布、deploy。
Keywords: build, bun, bundle, deploy, 构建, 打包, 发布
---

# Build Helper

项目构建工具，基于 `scripts/build.ts`。

## 构建命令

```bash
# 默认构建到 dist/ 目录
bun run scripts/build.ts

# 自定义输出目录
CLAUDE_CODE_BUILD_OUTDIR=custom-dist bun run scripts/build.ts
```

## 构建流程

1. **清理输出目录** — 删除 `dist/`（或自定义目录）的所有内容
2. **Bun 打包** — 使用 `Bun.build()` 编译 `src/entrypoints/cli.tsx`
   - 目标：`bun`
   - 开启代码分割（`splitting: true`）
   - 自动收集 `FEATURE_*` 环境变量作为构建特性标志
3. **Node.js 兼容补丁** — 替换 Bun-only 的 `import.meta.require` 为兼容写法

## 特性标志

构建时自动收集环境变量中的 `FEATURE_*` 前缀变量：

```bash
# 默认启用
FEATURE_BUDDY=1  # Buddy 集成
```

```typescript
// 自动收集的 features:
const defaultFeatures = ['BUDDY'];
const envFeatures = Object.keys(process.env)
  .filter(k => k.startsWith('FEATURE_'))
  .map(k => k.replace('FEATURE_', ''));
const features = [...new Set([...defaultFeatures, ...envFeatures])];
```

## 兼容性补丁

构建后的文件会自动替换：

```javascript
// 替换前（Bun-only）
var __require = import.meta.require;

// 替换后（Node.js 兼容）
var __require = typeof import.meta.require === "function"
  ? import.meta.require
  : (await import("module")).createRequire(import.meta.url);
```

## 输出示例

```
Bundled 15 files to dist/ (patched 15 for Node.js compat)
```

## 前置条件

- Bun 运行时（用于构建）
- 输出目录可写

## 发布流程

```bash
# 1. 构建
bun run scripts/build.ts

# 2. 验证
ls dist/

# 3. 版本升级（可选）
bun run scripts/version.ts minor

# 4. 提交
git add package.json dist/
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push && git push --tags
```
