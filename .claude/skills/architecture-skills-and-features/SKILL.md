---
name: architecture-skills-and-features
description: Doge Code 系统能力全景指南，涵盖所有技能、命令、代理工作流
---
# Doge Code 能力全景指南

## 一、技能（Skills）
### C++ 全栈

| 技能 | 何时使用 |
|------|--------|
| cpp-pro | ⭐任何C++项目：架构/实现/审查/构建/调试/优化，含63个参考文件 |
| cpp-modern | 现代C++特性：lambda/移动语义/concepts/ranges/coroutines |
| cpp-build | C++构建系统：CMake/xmake/Conan/vcpkg |
| cpp-debug | 调试诊断：编译错误/段错误/内存泄漏/GDB/Lldb |
| cpp-performance | 性能优化：SIMD/缓存友好/并行计算/Profiling |
| unreal-best-practices | UE5最佳实践：GAS/Enhanced Input/StateTree |
| unreal-gas | UE5 Gameplay Ability System C++开发 |
| unreal-blueprint-codegen | 程序化生成蓝图和Widget .uasset |
| unreal-pcg-python | UE5 PCG Python脚本 |
| unreal-thirdparty | UE5第三方C++库集成 |
| unreal-claude | UE5编辑器AI辅助：MCP协议集成 |
| llama-cpp | C/C++本地LLM推理：llama.h/GGUF/量化 |

### 前端/UI/UX

| 技能 | 何时使用 |
|------|--------|
| ui-ux-pro-max | ⭐96k★：50+样式/161色彩/57字体，全栈UI设计 |
| frontend-design | 构建新UI或重塑现有UI时 |
| frontend-patterns | 前端开发模式参考 |
| frontend-excellence | 前端性能/可访问性/SEO优化 |
| frontend-ui-engineering | 可维护高性能UI组件构建 |
| nextjs-mastery | Next.js 14+ App Router/RSC/ISR/SSR |
| react-patterns | React 19: Server Components/Actions/Suspense |
| styleseed | 从零构建设计系统/调色板生成 |
| api-and-interface-design | API/模块边界/公共接口设计 |
| graphql-design | GraphQL schema/N+1问题/订阅 |
| canvas-design | Canvas绘图设计 |
| theme-factory | 创建修改UI主题 |

### DevOps/云原生

| 技能 | 何时使用 |
|------|--------|
| docker-best-practices | Docker镜像优化/多阶段构建/Compose编排 |
| kubernetes-operations | K8s运维：部署/Helm/服务网格/监控 |
| aws-cloud-patterns | AWS云架构：Lambda/ECS/S3/DynamoDB |
| ci-cd-pipelines | CI/CD流水线：GitHub Actions/GitLab CI |
| devops-automation | CI/CD+Docker+K8s全自动化 |
| monitoring-observability | 监控：指标/日志/追踪/告警 |
| observability-and-instrumentation | 代码可观测性：分布式追踪 |
| mcp-development | MCP服务器开发：工具/资源/提示 |
| microservices-design | 微服务：拆分/API网关/事件驱动 |
| websocket-realtime | WebSocket实时通信：连接/重连/扩展 |

### 后端/语言

| 技能 | 何时使用 |
|------|--------|
| python-best-practices | Python类型提示/异步/测试/包管理 |
| golang-idioms | Go接口设计/错误处理/goroutine并发 |
| rust-systems | Rust所有权/生命周期/不安全代码/FFI |
| typescript-advanced | TS泛型/条件类型/映射类型/声明文件 |
| springboot-patterns | Spring Boot: DI/REST/数据访问/安全 |
| django-patterns | Django: DRF/ORM优化/架构 |
| database-optimization | SQL查询优化/索引策略 |
| postgres-optimization | PostgreSQL：查询计划/分区/VACUUM |
| redis-patterns | 缓存/会话/消息队列/限流 |
| authentication-patterns | OAuth2/JWT/RBAC/MFA认证 |
| security-hardening | XSS/SQL注入/CSRF防护 |
| code-review-and-quality | 多轴代码审查：正确性/安全/性能 |
| code-simplification | 降低复杂度/提高可读性 |
| testing-strategies | 测试策略选型：单元/集成/E2E |
| tdd-mastery | 红绿重构循环TDD |
| debugging-and-error-recovery | 系统诊断Bug/错误恢复 |
| deprecation-and-migration | 废弃/迁移/升级/重命名 |

### 工作流/方法论

| 技能 | 何时使用 |
|------|--------|
| context-engineering | 会话切换/跨文件上下文保持 |
| doubt-driven-development | 编码前快速验证关键假设 |
| source-driven-development | 从官方文档生成代码确保一致性 |
| spec-driven-development | 先写规范再编码确保匹配 |
| incremental-implementation | 大功能拆解为小步骤安全实现 |
| planning-and-task-breakdown | 模糊需求转化为可执行任务 |
| continuous-learning | 从编码历史提取模式优化工作流 |
| git-advanced | 交互式变基/二分查找/子模块 |
| git-workflow-and-versioning | 分支策略/发布管理 |
| shipping-and-launch | 发布检查清单/回滚/蓝绿部署 |
| idea-refine | 精炼想法定义范围 |
| using-agent-skills | 了解技能触发使用方式 |

## 二、命令（Commands）

| 命令 | 场景 | 执行内容 |
|------|------|--------|
| /plan-zh | 复杂任务 | 创建task_plan.md/findings.md/progress.md规划文件 |
| /plan-cpp-win | C++项目 | Windows C++项目骨架生成，600+决策项选择 |
| /plan-loop | 自动执行 | 自动tick检查计划状态并推进 |
| /plan-goal | 持续工作 | 桥接/goal直到计划完成 |
| /plan-attest | 安全锁定 | SHA-256验证锁定计划文件防篡改 |
| /plan-status | 进度查看 | 查看当前计划执行状态 |
| /commit-and-pr | 代码提交 | 运行测试+类型检查+格式化后提交PR |
| /review | PR审查 | 自动审查PR并输出审查意见 |
| /deploy | 部署上线 | 构建验证后部署到目标环境 |
| /feature-development | 功能开发 | 需求→设计→编码→测试→PR→部署全流程 |
| /database-migration | 数据库迁移 | 迁移文件生成→审查→部署→回滚预案 |
| /triage | 问题分类 | 状态机驱动Bug/改进分类分流 |
| /writing-beats | 写作 | 文章节拍规划/碎片管理/形状定义 |
| /workspace | 环境切换 | 保存恢复工作上下文 |

## 三、代理（Agents）

| 分类 | 代理 | 作用 |
|------|------|------|
| 审查 | typescript-reviewer | TypeScript代码审查 |
| 审查 | react-reviewer | React代码审查 |
| 审查 | vue-reviewer | Vue代码审查 |
| 审查 | flutter-reviewer | Flutter代码审查 |
| 审查 | cpp-reviewer | C++代码审查 |
| 审查 | java-reviewer | Java代码审查 |
| 审查 | python-reviewer | Python代码审查 |
| 审查 | rust-reviewer | Rust代码审查 |
| 审查 | go-reviewer | Go代码审查 |
| 审查 | security-reviewer | 安全审查 |
| 构建 | cpp-build-resolver | C++构建/编译问题解决 |
| 构建 | rust-build-resolver | Rust构建问题解决 |
| 构建 | go-build-resolver | Go构建问题解决 |
| 架构 | architect | 软件架构决策 |
| 架构 | code-architect | 代码架构分析改进 |
| 架构 | project-scaffold-wizard | 从零搭建项目骨架 |
| 架构 | website-developer | 全栈网站开发 |
| 管理 | chief-of-staff | 幕僚长：项目状态团队协调 |
| 管理 | planner | 规划代理 |
| 工具 | weather-agent | 天气获取 |
| 工具 | time-agent | 时间显示 |
| 工具 | security-auditor | 安全审计 |
| 工具 | test-engineer | 测试工程师 |
| 工具 | web-performance-auditor | Web性能审计 |

## 四、使用场景速查

| 场景 | 推荐使用的工具组合 |
|------|------------------|
| 我要开发一个新的 C++ 项目 | cpp-pro + cpp-build + /plan-cpp-win + cpp-reviewer 代理 |
| 我要审查一段代码 | 对应的语言reviewer代理 + code-review-and-quality 技能 |
| 我要部署上线 | /deploy + shipping-and-launch 技能 + deployer 代理 |
| 我需要做深度研究 | deep-research 技能 + deep-dive 技能 |
| 我要优化数据库性能 | database-optimization + postgres-optimization + redis-patterns |
| 我要确保系统安全 | security-hardening + authentication-patterns + security-reviewer 代理 |
| 我要创建 CI/CD | ci-cd-pipelines + devops-automation + /deploy-release |
| 我要学习新框架 | 对应的语言最佳实践技能 + 对应reviewer代理 |
| 我要写技术文章 | article-writing + writing-beats/fragments/shape |
| 我要设计 API | api-and-interface-design + api-design-patterns + graphql-design |
| 我的 UE5 项目需要帮助 | unreal-best-practices + unreal-gas + unreal-claude |
| 我要批量处理任务 | /task-create + batch 技能 + /plan-zh + /plan-loop |
