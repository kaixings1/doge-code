# 更新代码映射 (Update Codemaps)

分析代码库结构并生成 Token 精简（token-lean）的架构文档。

## 第 1 步：扫描项目结构 (Scan Project Structure)

1. 识别项目类型（单体仓库 monorepo、单个应用 single app、库 library、微服务 microservice）
2. 查找所有源代码目录 (src/、lib/、app/、packages/)
3. 映射入口点 (main.ts、index.ts、app.py、main.go 等)

## 第 2 步：生成代码映射 (Generate Codemaps)

在 `docs/CODEMAPS/`（或 `.reports/codemaps/`）中创建或更新代码映射：

| 文件 | 内容 |
|------|----------|
| `architecture.md` | 高层系统图、服务边界、数据流 |
| `backend.md` | API 路由、中间件链、服务 → 仓库 (repository) 映射 |
| `frontend.md` | 页面树、组件层级、状态管理流 |
| `data.md` | 数据库表、关系、迁移历史 |
| `dependencies.md` | 外部服务、第三方集成、共享库 |

### 代码映射格式 (Codemap Format)

每个代码映射都应该是 Token 精简的 —— 针对 AI 上下文 (Context) 消耗进行了优化：

```markdown
# 后端架构 (Backend Architecture)

## 路由 (Routes)
POST /api/users → UserController.create → UserService.create → UserRepo.insert
GET  /api/users/:id → UserController.get → UserService.findById → UserRepo.findById

## 核心文件 (Key Files)
src/services/user.ts (业务逻辑, 120 行)
src/repos/user.ts (数据库访问, 80 行)

## 依赖项 (Dependencies)
- PostgreSQL (主数据存储)
- Redis (会话缓存, 速率限制)
- Stripe (支付处理)
```

## 第 3 步：差异检测 (Diff Detection)

1. 如果之前已存在代码映射，计算差异百分比
2. 如果变更 > 30%，在覆盖前显示差异并请求用户批准
3. 如果变更 <= 30%，则进行原地更新

## 第 4 步：添加元数据 (Add Metadata)

为每个代码映射添加一个新鲜度标头：

```markdown
<!-- Generated: 2026-02-11 | Files scanned: 142 | Token estimate: ~800 -->
```

## 第 5 步：保存分析报告 (Save Analysis Report)

将摘要写入 `.reports/codemap-diff.txt`：
- 自上次扫描以来添加/删除/修改的文件
- 检测到的新依赖项
- 架构变更（新路由、新服务等）
- 针对 90 天以上未更新文档的陈旧警告

## 提示 (Tips)

- 关注 **高层结构 (high-level structure)**，而非实现细节
- 优先使用 **文件路径和函数签名**，而非完整的代码块
- 将每个代码映射保持在 **1000 Tokens** 以内，以实现高效的上下文加载
- 使用 ASCII 图表表示数据流，而非冗长的文字描述
- 在重大功能添加或重构会话后运行
