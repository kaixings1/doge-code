---
description: "命令管道 — | <命令> 将上一条命令的输出作为当前命令的输入"
argument-hint: "<命令>"
---

# | — 命令管道

在项目上下文中执行快速管道操作，将上一步的结果传递给当前命令处理。

## 用法

```
| <处理命令>       → 在项目代码库上执行管道操作
```

## 支持的操作

| 命令 | 说明 | 示例 |
|------|------|------|
| `grep <模式>` | 在代码库中搜索模式 | `| grep "useState"` |
| `files` | 列出项目文件结构 | `| files` |
| `deps` | 分析依赖关系 | `| deps` |
| `errors` | 收集错误和异常 | `| errors` |
| `stats` | 代码统计信息 | `| stats` |
| `imports <文件>` | 分析文件导入 | `| imports src/main.ts` |

## 执行方式

1. 解析 `$ARGUMENTS` 获取管道命令
2. 在项目上下文中执行对应操作
3. 返回结构化结果

## 示例

```
| grep "async function"           → 搜索所有异步函数
| files src/                      → 列出 src/ 目录结构
| errors                           → 收集所有 try-catch 中的错误处理
| imports src/auth/login.ts        → 分析登录模块的依赖导入
```
