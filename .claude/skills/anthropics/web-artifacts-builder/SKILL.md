---
name: Web工件构建器
description: "用于创建复杂的多组件 claude.ai HTML 工件的工具套件，使用现代前端 Web 技术（React、Tailwind CSS、shadcn/ui）。适用于需要状态管理、路由或 shadcn/ui 组件的复杂工件场景，而不适用于简单的单文件 HTML/JSX 工件。"
license: Complete terms in LICENSE.txt
---

# Web工件构建器

构建功能强大的前端 claude.ai 工件时，请遵循以下步骤：
1. 使用 `scripts/init-artifact.sh` 初始化前端仓库
2. 通过编辑生成的代码来开发你的工件
3. 使用 `scripts/bundle-artifact.sh` 将所有代码捆绑到单个 HTML 文件中
4. 向用户展示工件
5. （可选）测试该工件

**技术栈**：React 18 + TypeScript + Vite + Parcel（打包）+ Tailwind CSS + shadcn/ui

## 设计与风格指南

非常重要：为了避免所谓的"AI 风格行货"，避免使用过多的居中布局、紫色渐变、统一的圆角和 Inter 字体。

## 快速开始

### 第 1 步：初始化项目

运行初始化脚本来创建一个新的 React 项目：
```bash
bash scripts/init-artifact.sh <project-name>
cd <project-name>
```

This creates a fully configured project with:
- ✅ React + TypeScript (via Vite)
- ✅ Tailwind CSS 3.4.1 with shadcn/ui theming system
- ✅ Path aliases (`@/`) configured
- ✅ 40+ shadcn/ui components pre-installed
- ✅ All Radix UI dependencies included
- ✅ Parcel configured for bundling (via .parcelrc)
- ✅ Node 18+ compatibility (auto-detects and pins Vite version)

### 步骤 2: Develop Your Artifact

To build the artifact, edit the generated files. See **Common Development Tasks** below for guidance.

### 步骤 3: Bundle to Single HTML File

To bundle the React app into a single HTML artifact:
```bash
bash scripts/bundle-artifact.sh
```

This creates `bundle.html` - a self-contained artifact with all JavaScript, CSS, and dependencies inlined. This file can be directly shared in Claude conversations as an artifact.

**Requirements**: Your project must have an `index.html` in the root directory.

**What the script does**:
- Installs bundling dependencies (parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline)
- Creates `.parcelrc` config with path alias support
- Builds with Parcel (no source maps)
- Inlines all assets into single HTML using html-inline

### 步骤 4: Share Artifact with User

Finally, share the bundled HTML file in conversation with the user so they can view it as an artifact.

### 步骤 5: Testing/Visualizing the Artifact (Optional)

Note: This is a completely optional step. Only perform if necessary or requested.

To test/visualize the artifact, use available tools (including other Skills or built-in tools like Playwright or Puppeteer). In general, avoid testing the artifact upfront as it adds latency between the request and when the finished artifact can be seen. Test later, after presenting the artifact, if requested or if issues arise.

## Reference

- **shadcn/ui components**: https://ui.shadcn.com/docs/components