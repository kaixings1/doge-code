---
name: deepinit
description: 深度代码库初始化，生成分层的 AGENTS.md 文档。
level: 4
---

# Deep Init 技能

在整个代码库中创建全面、分层的 AGENTS.md 文档。

## 核心概念

AGENTS.md 文件充当 **AI 可读的文档**，帮助代理理解：
- 每个目录包含什么
- 各组件之间如何关联
- 在该区域工作的特殊说明
- 依赖关系与关联关系

## 分层标签系统

每个 AGENTS.md（根目录除外）都包含一个父引用标签：

```markdown
<!-- Parent: ../AGENTS.md -->
```

这创建出一个可导航的层级结构：
```
/AGENTS.md                          ← 根目录（无父标签）
├── src/AGENTS.md                   ← <!-- Parent: ../AGENTS.md -->
│   ├── src/components/AGENTS.md    ← <!-- Parent: ../AGENTS.md -->
│   └── src/utils/AGENTS.md         ← <!-- Parent: ../AGENTS.md -->
└── docs/AGENTS.md                  ← <!-- Parent: ../AGENTS.md -->
```

## AGENTS.md 模板

```markdown
<!-- Parent: {relative_path_to_parent}/AGENTS.md -->
<!-- Generated: {timestamp} | Updated: {timestamp} -->

# {目录名称}

## 用途
{一段话说明该目录包含什么以及它的作用}

## 关键文件
{列出每个重要文件，各配一行说明}

| 文件 | 说明 |
|------|-------------|
| `file.ts` | 用途简述 |

## 子目录
{列出每个子目录及其简要用途}

| 目录 | 用途 |
|-----------|---------|
| `subdir/` | 其中包含什么（见 `subdir/AGENTS.md`） |

## 面向 AI 代理

### 在该目录中工作
{供在此修改文件的 AI 代理遵循的特殊说明}

### 测试要求
{如何测试该目录中的改动}

### 常见模式
{此处使用的代码模式或约定}

## 依赖关系

### 内部
{所依赖的代码库其它部分}

### 外部
{使用的主要外部包/库}

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
```

## 执行工作流

### 步骤 1：映射目录结构

```
Task(subagent_type="explore", model="haiku",
  prompt="递归列出所有目录。排除：node_modules, .git, dist, build, __pycache__, .venv, coverage, .next, .nuxt")
```

### 步骤 2：创建工作计划

为每个目录生成 todo 项，按层级深度组织：

```
层级 0: / (根目录)
层级 1: /src, /docs, /tests
层级 2: /src/components, /src/utils, /docs/api
...
```

### 步骤 3：逐层生成

**重要**：先生成父层级，再生成子层级，以确保父引用有效。

对每个目录：
1. 读取该目录中的所有文件
2. 分析用途与关联关系
3. 生成 AGENTS.md 内容
4. 以正确的父引用写入文件

### 步骤 4：比较并更新（如已存在）

当 AGENTS.md 已存在时：

1. **读取现有内容**
2. **识别章节**：
   - 自动生成章节（可更新）
   - 手动章节（`<!-- MANUAL -->` 予以保留）
3. **比较**：
   - 是否新增了文件？
   - 是否删除了文件？
   - 结构是否变化？
4. **合并**：
   - 更新自动生成的内容
   - 保留手动批注
   - 更新时间戳

### 步骤 5：验证层级结构

生成之后，运行验证检查：

| 检查项 | 如何验证 | 纠正动作 |
|-------|--------------|-------------------|
| 父引用可解析 | 读取每个 AGENTS.md，检查 `<!-- Parent: -->` 路径是否存在 | 修正路径或移除孤儿文件 |
| 无孤立 AGENTS.md | 把 AGENTS.md 位置与目录结构对比 | 删除孤立文件 |
| 完整性 | 列出所有目录，检查是否有 AGENTS.md | 生成缺失的文件 |
| 时间戳最新 | 检查 `<!-- Generated: -->` 日期 | 重新生成过期文件 |

验证脚本模式：
```bash
# 查找所有 AGENTS.md 文件
find . -name "AGENTS.md" -type f

# 检查父引用
grep -r "<!-- Parent:" --include="AGENTS.md" .
```

## 智能委派

| 任务 | 代理 |
|------|-------|
| 目录映射 | `explore` |
| 文件分析 | `architect` |
| 内容生成 | `writer` |
| AGENTS.md 写入 | `writer` |

## 空目录处理

当遇到空的或近乎空的目录时：

| 条件 | 动作 |
|-----------|--------|
| 无文件、无子目录 | **跳过** —— 不创建 AGENTS.md |
| 无文件、有子目录 | 创建仅含子目录列表的最小化 AGENTS.md |
| 只有生成文件（*.min.js、*.map） | 跳过或创建最小化 AGENTS.md |
| 只有配置文件 | 创建描述配置用途的 AGENTS.md |

仅含目录的容器的最小化 AGENTS.md 示例：
```markdown
<!-- Parent: ../AGENTS.md -->
# {目录名称}

## 用途
用于组织相关模块的容器目录。

## 子目录
| 目录 | 用途 |
|-----------|---------|
| `subdir/` | 说明（见 `subdir/AGENTS.md`） |
```

## 并行化规则

1. **同层目录**：并行处理
2. **不同层级**：顺序处理（父级优先）
3. **大型目录**：为每个目录生成专用代理
4. **小型目录**：把多个批量交给一个代理

## 质量标准

### 必须包含
- [ ] 准确的文件描述
- [ ] 正确的父引用
- [ ] 子目录链接
- [ ] 面向 AI 代理的指令

### 必须避免
- [ ] 泛泛的样板文字
- [ ] 错误的文件名
- [ ] 断裂的父引用
- [ ] 遗漏重要文件

## 输出示例

### 根 AGENTS.md
```markdown
<!-- Generated: 2024-01-15 | Updated: 2024-01-15 -->

# my-project

## 用途
一个用于管理用户任务、支持实时协作的 Web 应用。

## 关键文件
| 文件 | 说明 |
|------|-------------|
| `package.json` | 项目依赖与脚本 |
| `tsconfig.json` | TypeScript 配置 |
| `.env.example` | 环境变量模板 |

## 子目录
| 目录 | 用途 |
|-----------|---------|
| `src/` | 应用源代码（见 `src/AGENTS.md`） |
| `docs/` | 文档（见 `docs/AGENTS.md`） |
| `tests/` | 测试套件（见 `tests/AGENTS.md`） |

## 面向 AI 代理

### 在该目录中工作
- 修改项目清单文件后始终安装依赖
- 使用 TypeScript 严格模式
- 遵循 ESLint 规则

### 测试要求
- 提交前运行测试
- 确保覆盖率 >80%

### 常见模式
- 使用桶文件导出（index.ts）
- 优先使用函数式组件

## 依赖关系

### 外部
- React 18.x - UI 框架
- TypeScript 5.x - 类型安全
- Vite - 构建工具

<!-- MANUAL: Custom project notes can be added below -->
```

### 嵌套的 AGENTS.md
```markdown
<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2024-01-15 | Updated: 2024-01-15 -->

# components

## 用途
按功能与复杂度组织的可复用 React 组件。

## 关键文件
| 文件 | 说明 |
|------|-------------|
| `index.ts` | 所有组件的桶文件导出 |
| `Button.tsx` | 主按钮组件 |
| `Modal.tsx` | 模态对话框组件 |

## 子目录
| 目录 | 用途 |
|-----------|---------|
| `forms/` | 表单相关组件（见 `forms/AGENTS.md`） |
| `layout/` | 布局组件（见 `layout/AGENTS.md`） |

## 面向 AI 代理

### 在该目录中工作
- 每个组件各占一个文件
- 使用 CSS modules 处理样式
- 通过 index.ts 导出

### 测试要求
- 单元测试放在 `__tests__/` 子目录
- 使用 React Testing Library

### 常见模式
- Props 接口定义在组件上方
- 暴露 DOM 的组件使用 forwardRef

## 依赖关系

### 内部
- `src/hooks/` - 组件使用的自定义 hooks
- `src/utils/` - 工具函数

### 外部
- `clsx` - 条件类名
- `lucide-react` - 图标

<!-- MANUAL: -->
```

## 触发更新模式

在已有 AGENTS.md 文件的既有代码库上运行时：

1. 先检测既有文件
2. 读取并解析既有内容
3. 分析当前目录状态
4. 生成既有内容与当前状态之间的差异
5. 应用更新，同时保留手动章节

## 性能考虑

- **缓存目录列表** —— 不要重复扫描同一目录
- **批量处理小目录** —— 一次处理多个
- **跳过未变更项** —— 如果目录未变化，跳过重新生成
- **并行写入** —— 多个代理同时写入不同文件
