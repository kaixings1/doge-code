---
name: Next.js + Turbopack 开发指南
description: Next.js + Turbopack 开发指南
---

# Next.js 和 Turbopack
Next.js 16+ 默认使用 Turbopack 进行本地开发：一个用 Rust 编写的增量打包器，显著加快开发启动和热更新速度。
## 使用时机
- **Turbopack（默认开发模式）**：用于日常开发。更快的冷启动和 HMR。
- **Webpack（传统开发模式）**：仅当你遇到 Turbopack 错误时使用。
- **生产模式**：取决于 Next.js 版本。
## 工作原理
- **Turbopack**：增量打包器，使用文件系统缓存，重启速度更快。
- **默认**：从 Next.js 16 开始，next dev 默认使用 Turbopack。
- **包分析器**：Next.js 16.1+ 的实验性 Bundle Analyzer。
## 示例
```bash
next dev
next build
next start
```
## 最佳实践
- 保持使用最新的 Next.js 16.x。
- 如果开发缓慢，确保使用的是 Turbopack。
- 使用官方 Next.js 包分析工具。