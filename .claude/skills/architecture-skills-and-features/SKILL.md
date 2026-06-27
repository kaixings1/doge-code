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

Doge Code 内置 **140+** 斜杠命令，按功能分类如下：

### 会话管理
| 命令 | 描述 |
|------|------|
| `/clear` | 清除对话历史并释放上下文 |
| `/backup` | 备份当前会话数据到本地文件 |
| `/resume` | 恢复之前的对话 |
| `/rename` | 重命名当前对话 |
| `/rewind` | 将代码和/或对话恢复到先前的状态 |
| `/compact` | 紧凑对话上下文 |
| `/context` | 以彩色网格可视化当前上下文使用情况 |
| `/context-collapse` | 折叠/展开对话上下文中的非关键部分 |
| `/session` | 显示远程会话 URL 和二维码 |
| `/focus` | 切换焦点模式 |
| `/summary` | 总结当前会话 |
| `/tag` | 为当前会话切换可搜索标签 |
| `/branch` | 在当前位置创建对话分支 |
| `/diff` | 查看未提交的更改和差异 |
| `/files` | 列出当前上下文中的所有文件 |
| `/copy` | 复制内容 |
| `/copy-page` | 将当前页面复制为 Markdown |
| `/export` | 将对话导出到文件或剪贴板 |
| `/share` | 分享会话到团队 |
| `/color` | 设置会话提示栏颜色 |
| `/theme` | 更改主题 |
| `/workspace` | 保存/恢复工作上下文 |

### 模型/API 配置
| 命令 | 描述 |
|------|------|
| `/model` | 切换 AI 模型 |
| `/effort` | 设置努力级别 |
| `/add-model` | 添加自定义模型 |
| `/remove-model` | 移除自定义模型 |
| `/login` / `/logout` | 登录/退出账户 |
| `/bridge` | 连接远程控制会话 |
| `/remote-env` | 配置默认远程环境 |
| `/config` | 打开配置面板 |
| `/permissions` | 管理工具权限规则 |
| `/privacy-settings` | 查看和更新隐私设置 |
| `/upgrade` | 升级到 Max |

### 分析/统计/监控
| 命令 | 描述 |
|------|------|
| `/insights` | 生成会话模式分析报告 |
| `/stats` | 使用统计和活动 |
| `/cost` | 会话总成本和持续时间 |
| `/usage` | 计划用量限制 |
| `/metrics` | 系统性能指标 |
| `/monitor` | 实时监控界面 |
| `/logger` | 查看和配置日志级别 |
| `/cache` | 缓存操作 |
| `/doctor` | 诊断安装和设置 |
| `/rstk` | 重置 token 统计数据 |

### 代码审查/质量
| 命令 | 描述 |
|------|------|
| `/review` | 审查拉取请求 |
| `/ultrareview` | 深度 bug 查找和验证 |
| `/security-review` | 安全审查待提交更改 |
| `/diagnose` | 诊断编译/测试错误 |
| `/refactor` | 智能代码重构 |
| `/test-gen` | 自动生成测试用例 |
| `/compare` | 比较文件/分支/会话差异 |
| `/deps-viz` | 分析依赖关系生成依赖图 |
| `/init-verifiers` | 创建验证器技能 |

### Git 操作
| 命令 | 描述 |
|------|------|
| `/commit` | 创建 git 提交 |
| `/commit-push-pr` | 提交、推送并创建 PR |
| `/branch` | 创建对话分支 |

### 内置工具命令
| 命令 | 描述 |
|------|------|
| `/docker` | Docker 容器管理 |
| `/k8s` | Kubernetes 集群管理 |
| `/nginx` | Nginx 管理 |
| `/redis` | Redis 缓存操作 |
| `/pdf` | PDF 文件读取 |
| `/excel` | Excel 读取与转换 |
| `/diagram` | Mermaid 图表生成 |
| `/image` | 图片信息管理 |
| `/api-doc` | API 文档生成 |
| `/deploy` | SSH/SCP/PM2 部署 |
| `/rag` | RAG 本地知识库 |
| `/stock` | 股票行情 |
| `/database` | 数据库操作 |
| `/graphql` | GraphQL 查询 |
| `/http` | HTTP 请求 |
| `/shell` | Shell 执行 |
| `/websocket` | WebSocket 通信 |
| `/event-stream` | SSE 事件流 |
| `/queue` | 消息队列管理 |
| `/schedule` | 定时调度 |
| `/cron` | Cron 任务 |
| `/file-watcher` | 文件变化监听 |

### 插件/MCP/技能
| 命令 | 描述 |
|------|------|
| `/mcp` | 管理 MCP 服务器 |
| `/mcp-tool-search` | 搜索 MCP 工具 |
| `/plugin` | 管理插件 |
| `/reload-plugins` | 激活待处理的插件更改 |
| `/skills` | 列出可用技能 |
| `/add-dir` | 添加工作目录 |
| `/hooks` | 查看工具事件挂钩 |

### 任务/代理/工作流
| 命令 | 描述 |
|------|------|
| `/tasks` | 管理后台任务 |
| `/task-create` | 创建子任务 |
| `/plan` | 计划模式 |
| `/plan-mode` | 切换计划模式 |
| `/agents` | 管理代理配置 |
| `/advisor` | 配置 advisor 模型 |
| `/proactive` | 自动重复执行任务 |
| `/buddy` | 编程伙伴 |

### 开发/编辑器
| 命令 | 描述 |
|------|------|
| `/help` | 显示帮助 |
| `/init` | 初始化项目 |
| `/ide` | 管理 IDE 集成 |
| `/keybindings` | 按键绑定配置 |
| `/vim` | 切换 Vim 模式 |
| `/tui` | 全屏终端界面 |
| `/powerup` | 学习新功能 |
| `/getting-started` | 快速入门指南 |
| `/changelog` | 查看更新日志 |
| `/desktop` | 在 Claude Desktop 继续 |
| `/mobile` | 下载移动应用 |

### 系统/管理
| 命令 | 描述 |
|------|------|
| `/exit` | 退出 REPL |
| `/fuck` | 清除所有配置和会话 |
| `/feedback` | 提交反馈 |
| `/btw` | 快速侧面问题 |
| `/batch-han` | 批量汉化 TS 文件 |
| `/i18n-extract` | 国际化提取 |
| `/memory` | 编辑记忆文件 |
| `/version` | 显示版本号 |

### 工作流命令（来自 .claude/commands/）
| 命令 | 场景 |
|------|------|
| `/code-review` | 代码审查工作流 |
| `/design-review` | 设计审查工作流 |
| `/security-review` | 安全审查工作流 |
| `/instinct-export` | 直觉导出 |

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
| 我要开发一个新的 C++ 项目 | cpp-pro + cpp-build + /plan + cpp-reviewer 代理 |
| 我要审查一段代码 | 对应的语言reviewer代理 + code-review-and-quality 技能 + /review + /compare |
| 我要部署上线 | /deploy + shipping-and-launch 技能 + /docker + /k8s + /nginx |
| 我要监控系统状态 | /metrics + /monitor + /cost + /stats + monitoring-observability 技能 |
| 我要优化数据库性能 | database-optimization + postgres-optimization + redis-patterns + /database |
| 我要确保系统安全 | security-hardening + authentication-patterns + security-reviewer 代理 + /security-review |
| 我要创建 CI/CD | ci-cd-pipelines + devops-automation + /deploy + /schedule + /cron |
| 我要学习新框架 | 对应的语言最佳实践技能 + 对应reviewer代理 + /getting-started + /powerup |
| 我要设计 API | api-and-interface-design + api-design-patterns + graphql-design + /api-doc + /http |
| 我的 UE5 项目需要帮助 | unreal-best-practices + unreal-gas + unreal-claude |
| 我要批量处理任务 | /task-create + /tasks + /plan + /schedule + /cron |
| 我要调试错误 | /diagnose + /doctor + debugging-and-error-recovery 技能 + cpp-debug + /logger |
| 我要管理容器/集群 | /docker + /k8s + /nginx + /redis + docker-best-practices |
| 我要进行 API 开发 | /http + /graphql + /websocket + /database + api-and-interface-design |
| 我要重构代码 | /refactor + /compare + /test-gen + code-simplification 技能 + /diagnose |
| 我要管理会话 | /resume + /backup + /compact + /context + /summary + /tag + /branch |
| 我要查看分析数据 | /insights + /stats + /cost + /usage + /metrics + /monitor |
| 我要管理 MCP 插件 | /mcp + /mcp-tool-search + /plugin + /reload-plugins + mcp-development 技能 |
| 我要设置模型/API | /model + /effort + /config + /add-model + /login + /bridge |
| 我是团队管理员 | /team + /team-onboarding + /project-purge + /privacy-settings + /permissions |
| 我要进行代码提交 | /commit + /diff + /review + /commit-push-pr |
| 我要使用 Git 工作流 | /branch + /diff + /commit + /review + /commit-push-pr + git-advanced 技能 |
| 我要文件/数据处理 | /pdf + /excel + /image + /diagram + /rag + /stock |
| 我要做国际化 | /batch-han + /i18n-extract + /memory |
| 我要做安全审计 | /security-review + /permissions + security-auditor 代理 + security-hardening 技能 |
