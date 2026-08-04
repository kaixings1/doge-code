# 下一步执行计划

> 创建时间: 2026-08-04
> 更新: 2026-08-04 15:55 (阶段 1 完成)

---

## ✅ 阶段 1: 修复 `command.load is not a function`（ISSUES.md）

**优先级: P0 - 阻断型 Bug** — **已完成 (commit 34d9dd4f)**

| 切片 | 描述 | 状态 |
|------|------|------|
| 1-4 | src 命令修复 (bookmark/workspace/wiki/blame) | ✅ 已完成 |
| 5 | desktop 命令修复 | ✅ 已完成 |
| 扩展 | 全量扫描发现 106 个命令缺 load，全部修复 | ✅ 已完成 |
| 额外 | api-debug/api-doc/docker-sandbox 错误 load 模式修复 | ✅ 已完成 |
| 6 | 审计与回归防护 | ⚠️ 脚本检查完成，lint 规则/CI 未做 |

**验证结果**: tsc 新增错误 0 / 消除 63；单元测试 3/3 通过

---

## 阶段 2: API 层实现（TODO.md P0）

**优先级: P0 - 基础架构** — **已完成并随阶段 1 提交**

| 模块 | 文件 | 状态 |
|------|------|------|
| ToolRegistry | `src/api/ToolRegistry.ts` | ✅ 已提交 |
| CommandRegistry | `src/api/CommandRegistry.ts` | ✅ 已提交 |
| ConfigManager | `src/api/ConfigManager.ts` | ✅ 已提交 |
| SessionManager | `src/api/SessionManager.ts` | ✅ 已提交 |
| hooks | `src/api/hooks.ts` | ✅ 已提交 |
| utils | `src/api/utils.ts` | ✅ 已提交 |
| types | `src/api/types.ts` | ✅ 已提交 |

---

## 阶段 3: 新工具集成（TODO.md P1）

**优先级: P1 - 功能增强**

| 工具 | 路径 | 状态 |
|------|------|------|
| AgentProxyTool | `desktop/src/tools/AgentProxyTool/` | ⚠️ 新建，需审查 |
| CtxInspectTool | `src/tools/CtxInspectTool/` | ❌ 未实现 |
| TerminalCaptureTool | `src/tools/TerminalCaptureTool/` | ❌ 未实现 |
| SubscribePRTool | `src/tools/SubscribePRTool/` | ❌ 未实现 |
| ListPeersTool | `src/tools/ListPeersTool/` | ❌ 未实现 |
| PushNotificationTool | `src/tools/PushNotificationTool/` | ❌ 未实现 |
| SendUserFileTool | `src/tools/SendUserFileTool/` | ❌ 未实现 |

---

## 阶段 4: 命令完善（TODO.md P2）

**优先级: P2 - 功能完善**

| 命令 | 子命令 | 状态 |
|------|--------|------|
| `/api-doc` | gen/md/html/openapi/all | ❌ 需完善 |
| `/api-test` | history/export/collection/compare/bench | ❌ 需完善 |

---

## 阶段 5: 清理工作

**优先级: P3 - 维护**

| 项目 | 文件 | 操作 |
|------|------|------|
| 临时文档 | `temp_*.md`, `temp_rebuild.md` | 删除 |
| 测试脚本 | `test_loop*.cjs`, `verify_loop.*`, `extract_*.cjs` | 评估后删除 |
| HTML 测试 | `hello*.html`, `index.html` | 删除 |
| OS 残留 | `nul` | 删除 |
| README 更新 | `README.md` | 同步最新状态 |
| 二进制文件 | `0` (20MB) | 加入 .gitignore |

---

## 建议执行顺序

```
Week 1: 阶段 1 (Bug 修复) → 阶段 2 (API 提交)
Week 2: 阶段 3 (新工具) → 阶段 4 (命令完善)
Week 3: 阶段 5 (清理) → 单元测试覆盖 → 发布
```