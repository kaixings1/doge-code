# 构建与修复 (Build and Fix)

通过最小化、安全的改动，逐步修复构建（Build）和类型（Type）错误。

## 第 1 步：检测构建系统 (Detect Build System)

识别项目的构建工具并运行构建：

| 标识物 | 构建命令 (Build Command) |
|-----------|---------------|
| 带有 `build` 脚本的 `package.json` | `npm run build` 或 `pnpm build` |
| `tsconfig.json` (仅限 TypeScript) | `npx tsc --noEmit` |
| `Cargo.toml` | `cargo build 2>&1` |
| `pom.xml` | `mvn compile` |
| `build.gradle` | `./gradlew compileJava` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` | `python -m py_compile` 或 `mypy .` |

## 第 2 步：解析并分组错误 (Parse and Group Errors)

1. 运行构建命令并捕获标准错误输出（stderr）
2. 按文件路径对错误进行分组
3. 按依赖（Dependency）顺序排序（先修复导入/类型错误，再修复逻辑错误）
4. 统计错误总数以便跟踪进度

## 第 3 步：修复循环（每次修复一个错误）

对于每个错误：

1. **读取文件** — 使用读取工具查看错误上下文（错误周围的 10 行代码）
2. **诊断** — 确定根本原因（缺少导入、类型错误、语法错误等）
3. **最小化修复** — 使用编辑工具进行能解决错误的最细微改动
4. **重新运行构建** — 验证错误已消除且未引入新错误
5. **处理下一个** — 继续处理剩余错误

## 第 4 步：安全护栏 (Guardrails)

在以下情况停止操作并询问用户：
- 某次修复引入的**错误多于其解决的错误**
- **同一个错误在 3 次尝试后仍然存在**（可能是更深层次的问题）
- 修复方案需要**架构级改动**（而不仅仅是构建修复）
- 构建错误源于**缺失依赖**（需要执行 `npm install`、`cargo add` 等）

## 第 5 步：总结 (Summary)

显示结果：
- 已修复的错误（附带文件路径）
- 剩余错误（如有）
- 引入的新错误（应当为零）
- 针对未解决问题的后续建议步骤

## 恢复策略 (Recovery Strategies)

| 场景 | 行动 |
|-----------|--------|
| 缺少模块/导入 (Missing module/import) | 检查包是否已安装；建议安装命令 |
| 类型不匹配 (Type mismatch) | 读取两个类型的定义；修复更窄的类型 |
| 循环依赖 (Circular dependency) | 通过导入图识别循环；建议提取公共部分 |
| 版本冲突 (Version conflict) | 检查 `package.json` / `Cargo.toml` 中的版本约束 |
| 构建工具配置错误 (Build tool misconfiguration) | 读取配置文件；与正常工作的默认配置进行对比 |

为了安全起见，请逐一修复错误。优先选择最小化的差异（diffs）而非重构。
