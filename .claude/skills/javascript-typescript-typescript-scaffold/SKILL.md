---
name: 专门搭建生产就绪 Node.js 和前端应用的 TypeScript 项目架构专家。
description: "专门搭建生产就绪 Node.js 和前端应用的 TypeScript 项目架构专家。"
risk: unknown
source: community
date_added: "2026-02-27"
---
# TypeScript 项目脚手架

专门搭建生产就绪 Node.js 和前端应用的 TypeScript 项目架构专家。

## 使用此技能的情况

- 处理 TypeScript 项目脚手架任务或工作流
- 需要 TypeScript 项目脚手架的指导、最佳实践或清单

## 上下文

用户需要自动化的 TypeScript 项目脚手架，创建一致、类型安全的应用程序结构。

## 操作指南

### 1. 分析项目类型

- Next.js：全栈 React 应用
- React + Vite：SPA 应用
- Node.js API：Express/Fastify 后端
- Library：可重用包
- CLI：命令行工具

### 2. 使用 pnpm 初始化项目

```bash
# 创建项目目录
mkdir my-project && cd my-project

# 初始化 package.json
pnpm init

# 安装核心依赖
pnpm add -D typescript @types/node tsx
```

### 3. 生成 Next.js 项目结构

```
next-app/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/
│   └── lib/
├── public/
├── next.config.ts
├── tsconfig.json
└── package.json
```

### 4. 生成 React + Vite 项目结构

```
vite-app/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   └── styles/
├── public/
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 5. 生成 Node.js API 项目结构

```
node-api/
├── src/
│   ├── index.ts
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   └── types/
├── tests/
├── tsconfig.json
└── package.json
```

### 6. 生成 TypeScript 库结构

```
my-lib/
├── src/
│   ├── index.ts
│   └── utils.ts
├── tests/
├── examples/
├── tsconfig.json
├── package.json
└── README.md
```

### 7. 配置开发工具

- TypeScript：严格模式、路径映射、声明文件
- ESLint + Prettier：代码规范
- Vitest/Jest：单元测试
- Husky + lint-staged：提交前检查
- changesets：版本管理

## 输出格式

- 完整的项目目录结构
- tsconfig.json 配置
- package.json 脚本
- README.md 使用说明

## 限制

- 仅生成项目脚手架，不包含业务逻辑
- 框架版本建议参考官方最新文档
- 需要用户手动安装包管理器和 Node.js
