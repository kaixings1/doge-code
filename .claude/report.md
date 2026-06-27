# Doge Code 系统能力全景报告

> 生成于 2026-06-27 · 涵盖所有技能、斜杠命令、代理工作流

---

## 一、斜杠命令（Commands）

Doge Code 内置 **300+** 斜杠命令，分为以下类别：

### 🌐 会话管理
| 命令 | 描述 |
|------|------|
| `/clear` | 清除对话历史并释放上下文 |
| `/backup` | 备份当前会话数据到本地文件 |
| `/resume` | 恢复之前的对话 |
| `/rename` | 重命名当前对话 |
| `/rewind` | 将代码和/或对话恢复到先前的状态 |
| `/compact` | 紧凑对话上下文 |
| `/context` | 以彩色网格可视化当前上下文使用情况 |
| `/context-collapse` | 折叠/展开对话上下文中的非关键部分以释放空间 |
| `/ctx_viz` | 对话上下文可视化 |
| `/session` | 显示远程会话 URL 和二维码 |
| `/focus` | 切换焦点模式 — 仅显示最终回复，隐藏中间工具调用过程 |
| `/fast` | 快速模式切换 |
| `/summary` | 总结当前会话 |
| `/tag` | 为当前会话切换可搜索标签 |
| `/branch` | 在当前位置创建对话分支 |
| `/diff` | 查看未提交的更改和每次对话的差异 |
| `/files` | 列出当前上下文中的所有文件 |
| `/copy` | 复制内容 |
| `/copy-page` | 将当前页面或选中的内容复制为 Markdown 格式 |
| `/export` | 将当前对话导出到文件或剪贴板 |
| `/share` | 分享当前会话到团队 |
| `/color` | 设置此会话的提示栏颜色 |
| `/theme` | 更改主题 |
| `/workspace` | 保存/恢复工作上下文（分支、diff、修改的文件） |

### 🤖 模型/API 配置
| 命令 | 描述 |
|------|------|
| `/model` | 切换 AI 模型 |
| `/effort` | 设置模型使用时的努力级别 |
| `/add-model` | 将自定义模型添加到已保存的模型列表 |
| `/remove-model` | 从已保存的模型列表中移除自定义模型 |
| `/login` | 登录 Anthropic 账户 |
| `/logout` | 退出您的 Anthropic 账户 |
| `/bridge` | 连接此终端以进行远程控制会话 |
| `/remote-env` | 配置远程会话的默认远程环境 |
| `/passes` | 管理 Passes |
| `/config` | 打开配置面板 |
| `/rate-limit-options` | 显示达到速率限制时的选项 |
| `/less-permission-prompts` | 扫描会话，生成权限白名单 |
| `/permissions` | 管理允许和拒绝工具权限规则 |
| `/privacy-settings` | 查看和更新您的隐私设置 |
| `/output-style` | （已弃用）使用 /config 更改输出样式 |
| `/upgrade` | 升级到 Max 以获得更高的速率限制和更多 Opus |

### 📊 分析/统计/监控
| 命令 | 描述 |
|------|------|
| `/insights` | 生成分析你的 Claude Code 会话模式的报告 |
| `/stats` | 显示您的 Claude Code 使用统计和活动 |
| `/cost` | 显示当前会话的总成本和持续时间 |
| `/usage` | 显示计划用量限制 |
| `/extra-usage` | 配置额外用量以在达到限制时继续工作 |
| `/metrics` | 显示系统性能指标和统计数据 |
| `/monitor` | 启动实时监控界面 |
| `/logger` | 查看和配置日志记录级别 |
| `/cache` | 缓存操作 |
| `/debug-tool-call` | 调试工具调用 |
| `/prompt-diff` | 显示系统提示词变更差异（设置修改前后的对比） |
| `/heap-dump` | 将 JS 堆转储到桌面 |
| `/sandbox-toggle` | 切换沙箱模式 |
| `/doctor` | 诊断并验证您的 Claude Code 安装和设置 |
| `/rstk` | 重置 token 统计数据 |
| `/version` | 显示当前运行的版本号 |

### 📝 代码审查/质量
| 命令 | 描述 |
|------|------|
| `/review` | 审查拉取请求 |
| `/ultrareview` | 约 10–20 分钟 · 查找并验证你分支中的 bug |
| `/security-review` | 对当前分支的待提交更改进行安全审查 |
| `/pr-comments` | 获取 GitHub 拉取请求的评论 |
| `/diagnose` | 诊断编译/测试错误并给出修复方案 |
| `/refactor` | 智能代码重构：提取/重命名/拆分/性能优化 |
| `/test-gen` | 为代码自动生成测试用例并运行验证，失败则自动修复 |
| `/init-verifiers` | 创建用于自动化验证代码变更的验证器技能 |
| `/compare` | 比较不同文件、分支或会话之间的差异 |
| `/deps-viz` | 分析代码库依赖关系和文件拓扑结构，生成依赖图 |

### 🔧 内置工具命令
| 命令 | 描述 |
|------|------|
| `/docker` | Docker 容器管理：ps/logs/start/stop/build/images/exec |
| `/k8s` | Kubernetes 集群管理：pods/deploy/svc/get/describe/logs |
| `/nginx` | Nginx 管理：status/start/stop/reload/test/sites/logs/config |
| `/redis` | Redis 缓存操作：get/set/del/keys/ping/info/flush |
| `/pdf` | PDF 文件读取与信息查看：read/info |
| `/excel` | Excel 文件读取与转换：read/info/sheets/csv |
| `/diagram` | Mermaid 图表模板生成：template/mermaid |
| `/image` | 图片信息查看与管理：info/ls/convert |
| `/api-doc` | API 文档生成器：gen/scan |
| `/deploy` | 部署工具：ssh/scp/pm2 管理 |
| `/rag` | RAG 本地知识库 — 索引文件夹和搜索 |
| `/stock` | 股票行情和财务数据 |
| `/database` | 查看和操作数据库中存储的数据 |
| `/graphql` | 执行 GraphQL 查询 |
| `/http` | 发送 HTTP 请求并查看响应结果 |
| `/shell` | 在一个新的 shell 中执行命令 |
| `/websocket` | 通过 WebSocket 连接与服务器实时通信 |
| `/event-stream` | 连接并接收 Server-Sent Events (SSE) 事件流 |
| `/queue` | 管理消息队列 |
| `/schedule` | 管理定时调度任务 |
| `/cron` | 管理 cron 定时任务 |
| `/file-watcher` | 监听文件变化并执行相应操作 |

### 🧩 插件/MCP/技能
| 命令 | 描述 |
|------|------|
| `/mcp` | 管理 MCP 服务器 |
| `/mcp-tool-search` | 搜索 MCP 工具 |
| `/plugin` | 管理 Claude Code 插件 |
| `/reload-plugins` | 在当前会话中激活待处理的插件更改 |
| `/skills` | 列出可用的技能 |
| `/add-dir` | 添加新的工作目录 |
| `/hooks` | 查看工具事件挂钩配置 |

### 🎯 任务/代理/工作流
| 命令 | 描述 |
|------|------|
| `/tasks` | 列出和管理后台任务 |
| `/task-create` | 创建一个新的子任务用于并行执行 |
| `/plan` | 启用计划模式或查看当前会话计划 |
| `/plan-mode` | 切换计划模式，在生成前先制定详细计划 |
| `/agents` | 管理代理配置 |
| `/advisor` | 配置 advisor 模型 |
| `/proactive` | （/loop 别名）自动重复执行任务 |
| `/buddy` | 孵化编程伙伴 · pet 抚摸，off 静音 |
| `/torch` | Torch 模式（预留） |
| `/fork` | Fork 子代理（存根） |
| `/workflows` | Workflow scripts（存根） |
| `/peers` | Peer sessions（存根） |

### 🔄 Git 操作
| 命令 | 描述 |
|------|------|
| `/commit` | 创建 git 提交 |
| `/commit-push-pr` | 提交、推送并创建拉取请求 |
| `/branch` | 在当前位置创建对话分支 |
| `/diff` | 查看未提交的更改和每次对话的差异 |

### 🛠 开发/编辑器
| 命令 | 描述 |
|------|------|
| `/help` | 显示帮助和可用命令 |
| `/init` | 初始化项目 |
| `/ide` | 管理 IDE 集成并显示状态 |
| `/keybindings` | 打开或创建按键绑定配置文件 |
| `/vim` | 在 Vim 和普通编辑模式之间切换 |
| `/tui` | 切换到闪烁免模式的全屏终端界面 |
| `/powerup` | 与 Claude Code 交互式学习新功能 |
| `/getting-started` | 快速入门 Claude Code 的交互式指南 |
| `/changelog` | 查看 Claude Code 最新的更新和变更 |
| `/release-notes` | 查看发布说明 |
| `/documentation-index` | 获取 Claude Code 文档索引，发现所有可用页面 |
| `/desktop` | 在 Claude Desktop 中继续当前会话 |
| `/mobile` | 显示二维码以下载 Claude 移动应用 |
| `/chrome` | Claude in Chrome（测试版）设置 |

### 🧹 系统/管理
| 命令 | 描述 |
|------|------|
| `/exit` | 退出 REPL |
| `/fuck` | 清除本地认证、自定义 API 配置和会话历史 |
| `/feedback` | 提交关于 Claude Code 的反馈 |
| `/game` | 玩一个简单的猜数字游戏 |
| `/btw` | 询问快速侧面问题，不中断主对话 |
| `/stickers` | 订购 Claude Code 贴纸 |
| `/thinkback` | 您的 2025 Claude Code 年度回顾 |
| `/thinkback-play` | 播放 thinkback 动画 |
| `/batch-han` | 批量汉化 TypeScript 文件 |
| `/i18n-extract` | 国际化支持：提取硬编码字符串，生成翻译文件 |
| `/install-github-app` | 为仓库设置 Claude GitHub Actions |
| `/install-slack-app` | 安装 Claude Slack 应用 |
| `/team` | 团队管理命令 |
| `/team-onboarding` | 为团队成员生成 Claude Code 快速上手指南 |
| `/project-purge` | 删除项目的所有 Claude Code 状态 |
| `/memory` | 编辑 Claude 记忆文件 |
| `/terminal-setup` | 终端设置 |
| `/oauth-refresh` | 刷新 OAuth 令牌 |
| `/status` | 显示状态 |
| `/statusline` | 设置 Claude Code 的状态栏 UI |
| `/env` | 环境变量管理 |
| `/brief` | 切换仅简要模式 |
| `/voice` | 切换语音模式 |
| `/ant-trace` | 追踪（内部） |
| `/perf-issue` | 性能问题报告（内部） |
| `/backfill-sessions` | 回填历史会话数据（内部） |
| `/break-cache` | 刷新提示缓存（内部） |
| `/bughunter` | Bug 猎人模式（内部） |
| `/good-claude` | 给 Claude 发送正面反馈（内部） |
| `/issue` | 问题管理（内部） |
| `/autofix-pr` | 自动修复 PR（内部） |
| `/mock-limits` | 模拟限制模式（内部） |
| `/bridge-kick` | 注入桥接失败状态（内部） |
| `/onboarding` | 引导流程（内部） |
| `/teleport` | 传送（内部） |
| `/init-verifiers` | 创建验证器技能 |
| `/ultraplan` | 约 10–30 分钟 · 起草高级计划（条件启用） |

---

## 二、技能（Skills）

### C++ 全栈
| 技能 | 用途 |
|------|------|
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
| 技能 | 用途 |
|------|------|
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
| 技能 | 用途 |
|------|------|
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
| 技能 | 用途 |
|------|------|
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
| 技能 | 用途 |
|------|------|
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

---

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

---

## 四、使用场景速查

| 场景 | 推荐使用的工具组合 |
|------|------------------|
| 我要开发一个新的 C++ 项目 | cpp-pro + cpp-build + /plan + cpp-reviewer 代理 |
| 我要审查一段代码 | 对应的语言reviewer代理 + code-review-and-quality 技能 + /review |
| 我要部署上线 | /deploy + shipping-and-launch 技能 + /docker + /k8s |
| 我要监控系统状态 | /metrics + /monitor + /cost + /stats + monitoring-observability 技能 |
| 我要优化数据库性能 | database-optimization + postgres-optimization + redis-patterns + /database |
| 我要确保系统安全 | security-hardening + authentication-patterns + security-reviewer 代理 + /security-review |
| 我要创建 CI/CD | ci-cd-pipelines + devops-automation + /deploy |
| 我要学习新框架 | 对应的语言最佳实践技能 + 对应reviewer代理 + /getting-started |
| 我要设计 API | api-and-interface-design + api-design-patterns + graphql-design + /api-doc |
| 我的 UE5 项目需要帮助 | unreal-best-practices + unreal-gas + unreal-claude |
| 我要批量处理任务 | /task-create + /tasks + /plan + /schedule + /cron |
| 我要调试错误 | /diagnose + /doctor + debugging-and-error-recovery 技能 + cpp-debug |
| 我要管理容器/集群 | /docker + /k8s + /nginx + /redis + docker-best-practices |
| 我要进行 API 开发 | /http + /graphql + /websocket + /database + api-and-interface-design |
| 我要重构代码 | /refactor + /compare + /test-gen + code-simplification 技能 + /diagnose |
| 我要管理会话 | /resume + /backup + /compact + /context + /summary + /tag |
| 我要查看分析数据 | /insights + /stats + /cost + /usage + /metrics |
| 我要管理 MCP 插件 | /mcp + /mcp-tool-search + /plugin + /reload-plugins + mcp-development 技能 |
| 我要设置模型/API | /model + /effort + /config + /add-model + /login + /bridge |
| 我是团队管理员 | /team + /team-onboarding + /project-purge + /privacy-settings + /permissions |

---

## 五、缺失的流行资源（已集成 — 4 轮共 +500 文件）

以下资源已从社区流行项目集成到 `.claude/` 目录中，共 4 轮提交：

### ✅ 第 1 轮：基础技术栈补齐（1757ce0, +52 文件）

| 类别 | 数量 | 内容 |
|------|------|------|
| 技能 | 25 | Prometheus/Grafana、gRPC、Kafka、MongoDB、Elasticsearch、Terraform、.NET、Deno、SvelteKit、Nuxt 3、语义发布、Nx、Turborepo、SonarQube、C4 架构、DDD、CQRS/ES、混沌工程、LLMOps、Redis 高级、Rust 高级、属性测试、Android、Serverless、Istio |
| 命令 | 12 | `/prometheus` `/grafana` `/grpc` `/kafka` `/terraform` `/semantic-release` `/sonarqube` `/chaos` `/llmops` `/ddd` `/c4-model` `/sentry-error` |
| 代理 | 15 | 各领域专家（Prometheus/Kafka/Terraform/MongoDB/gRPC/.NET/SvelteKit/Nuxt/Android/C4/LLMOps/混沌/SonarQube/安全/Serverless） |

### ✅ 第 2 轮：知名工作流仓库骨架 + 官方插件（f7d1512, +210 文件）

| 仓库 | 内容 |
|------|------|
| **obra/superpowers** (239k★) | 本地缓存提取 14 个技能 + 3 个命令 + 1 个代理 |
| **gsd-build/get-shit-done** (64k★) | 4 个 GSD 命令（init/task/session/review） |
| **garrytan/gstack** (116k★) | 3 个 GStack 命令（init/gen/deploy） |
| **bmad-code-org/BMAD-METHOD** (49k★) | 3 个 BMAD 命令（init/prd/sprint） |
| **Yeachan-Heo/oh-my-claudecode** (37k★) | 4 个 OMC 技能（React/Python/Go/Rust） |
| **humanlayer** (11k★) | 2 个技能 + 1 个代理 |
| **Fission-AI/OpenSpec** (56k★) | 3 个 opsx 命令 |
| **EveryInc/compound-engineering** (22k★) | 3 个技能 |
| **github/spec-kit** (115k★) | 3 个 speckit 命令 |
| **官方插件市场提取** | 20+ 命令/技能/代理 |

### ✅ 第 3 轮：mattpocock/skills 完整集成（05ebde5, +55 文件）

| 命名空间 | 29 个新技能 |
|----------|------------|
| 工程实践 | ask-matt, codebase-design, diagnosing-bugs, domain-modeling, grill-with-docs, implement, improve-codebase-architecture, prototype, resolving-merge-conflicts, setup-matt-pocock-skills, tdd, to-issues, to-prd, triage |
| 方法论 | decision-mapping, loop-me, review, writing-beats, writing-fragments, writing-shape |
| Git 工具 | git-guardrails-claude-code, migrate-to-shoehorn, scaffold-exercises, setup-pre-commit |
| 效率 | edit-article, obsidian-vault, grill-me, grilling, handoff, teach, writing-great-skills |

### ✅ 第 4 轮：通过 gh API 真实拉取 7 个仓库（0008c72, +715 文件）

| 仓库 | Stars | 获取内容 |
|------|-------|---------|
| **gsd-build/get-shit-done** | 64k★ | **67** 个 GSD 命令（add-tests, audit, autonomous, capture, cleanup, code-review, config, debug, deploy, explore, ship 等）+ **33** 个代理 |
| **Yeachan-Heo/oh-my-claudecode** | 37k★ | **129** 个文件（完整命令/代理/技能/hooks） |
| **humanlayer** | 11k★ | **29** 个命令（ci_commit, commit, create_plan, debug, describe_pr, implement_plan 等）+ **6** 个代理 |
| **EveryInc/compound-engineering** | 22k★ | **61** 个文件（命令/代理/技能） |
| **garrytan/gstack** | 116k★ | 代理 + browser-skills |
| **Fission-AI/OpenSpec** | 56k★ | 27 份文档 |
| **github/spec-kit** | 115k★ | templates/commands 目录 |

### 项目总规模增长

| 指标 | 集成前 | 集成后 | 增长 |
|------|--------|--------|------|
| 技能 (SKILL.md) | **302** | **454** | **+152** |
| 命令 (.md) | **129** | **300** | **+171** |
| 代理 (.md) | **230** | **309** | **+79** |
| **总文件** | **~670** | **~1,170** | **~+500** |

以下资源已从社区流行项目中集成到 `.claude/` 目录中：

### ✅ 新增技能（25 个）
| 分类 | 技能 | 描述 |
|------|------|------|
| 可观测性 | prometheus-grafana | Prometheus 监控 + Grafana 可视化 |
| 可观测性 | elasticsearch-search | Elasticsearch 搜索与分析 |
| 消息系统 | grpc-development | gRPC 开发 — Protobuf/流式 RPC/拦截器 |
| 消息系统 | kafka-streaming | Apache Kafka 流处理 |
| 数据库 | mongodb-patterns | MongoDB 数据建模与索引 |
| 云原生 | terraform-iac | Terraform 基础设施即代码 |
| 云原生 | istio-service-mesh | Istio 服务网格 |
| 云原生 | serverless-arch | Serverless 架构 |
| 语言框架 | dotnet-development | .NET 全栈开发 |
| 语言框架 | deno-runtime | Deno 运行时 |
| 语言框架 | sveltekit-framework | SvelteKit 全栈框架 |
| 语言框架 | nuxt-framework | Nuxt 3 全栈框架 |
| 语言框架 | android-development | Android Jetpack Compose 开发 |
| 语言高级 | rust-advanced | Rust 高级编程 |
| 语言高级 | redis-advanced | Redis 高级模式 |
| 工具链 | semantic-release | 语义化版本发布 |
| 工具链 | nx-monorepo | Nx 单体仓库 |
| 工具链 | turborepo | Turborepo 单体仓库 |
| 工具链 | sonarqube-quality | SonarQube 代码质量 |
| 架构 | c4-architecture | C4 架构模型 |
| 架构 | ddd-patterns | 领域驱动设计 |
| 架构 | cqrs-es | CQRS + 事件溯源 |
| 测试 | chaos-engineering | 混沌工程 |
| 测试 | testing-property | 属性基测试 |
| AI/ML | llmops | LLMOps 运维管理 |

### ✅ 新增命令（12 个）
| 命令 | 描述 |
|------|------|
| `/prometheus` | Prometheus 监控运维 — 查询/告警/目标管理 |
| `/grafana` | Grafana 仪表盘管理 — 创建/导出/导入 |
| `/grpc` | gRPC 开发 — proto 编译/服务调用 |
| `/kafka` | Kafka 管理 — 主题/消费者组/消息 |
| `/terraform` | Terraform IaC — plan/apply/state |
| `/semantic-release` | 语义化版本发布 — 自动发布/日志 |
| `/sonarqube` | SonarQube 质量扫描 — 报告/门禁/问题 |
| `/chaos` | 混沌工程实验 — 故障注入/实验设计 |
| `/llmops` | LLMOps 运维 — 评估/追踪/成本 |
| `/ddd` | DDD 领域分析 — 上下文地图/聚合 |
| `/c4-model` | C4 架构模型生成 — Structurizr DSL |
| `/sentry-error` | Sentry 错误追踪 — 错误/性能/发布 |

### ✅ 新增代理（15 个）
| 代理 | 角色 |
|------|------|
| prometheus-engineer | Prometheus 监控专家 |
| kafka-engineer | Kafka 流处理专家 |
| terraform-engineer | Terraform IaC 专家 |
| mongodb-dba | MongoDB 数据库专家 |
| grpc-developer | gRPC 开发专家 |
| dotnet-architect | .NET 架构师 |
| sveltekit-developer | SvelteKit 全栈开发者 |
| nuxt-developer | Nuxt 3 全栈开发者 |
| android-developer | Android 开发专家 |
| c4-architect | C4 架构师 |
| llmops-engineer | LLMOps 工程师 |
| chaos-engineer | 混沌工程专家 |
| sonarqube-admin | SonarQube 质量管理员 |
| security-architect | 安全架构师 |
| serverless-developer | Serverless 开发者 |

---

## 六、仍缺失的流行资源（下一批待集成）

以下为社区流行的资源，尚未集成（推荐下一轮进行）：

| 领域 | 缺失项目 | 优先级 |
|------|---------|--------|
| 工作流仓库 | `mattpocock/skills` `garrytan/gstack` `gsd-build/get-shit-done` `bmad-code-org/BMAD-METHOD` `Yeachan-Heo/oh-my-claudecode` `humanlayer/humanlayer` `EveryInc/compound-engineering-plugin` `Fission-AI/OpenSpec` `github/spec-kit` | 🔴 高 |
| 消息系统 | RabbitMQ, NATS, Apache Thrift | 🟡 中 |
| 数据库 | Cassandra, Neo4j, ScyllaDB, CockroachDB, TimescaleDB | 🟡 中 |
| 语言框架 | Kotlin Multiplatform, .NET MAUI/Blazor, Solid.js, Remix, Qwik | 🟡 中 |
| 开发工具链 | Husky, lint-staged, Renovate/Dependabot, Changesets, pnpm workspace | 🟡 中 |
| 监控告警 | Datadog, New Relic, OpenTelemetry (高级), Loki, Tempo | 🟡 中 |
| 云原生 | Pulumi, Crossplane, AWS VPC/IAM/Route53/EKS/Fargate/CDK | 🟡 中 |
| 代码质量 | ESLint 共享配置集 (antfu/standard/airbnb) | 🟢 低 |
| 架构 | Event Storming, Hexagonal Architecture (详细版) | 🟢 低 |
| 测试 | Visual Regression (Percy/Chromatic), Playwright 高级 | 🟢 低 |

---

## 七、架构概览

基于社区高频生态扫描（302 技能 / 129 命令 / 230 代理 / 130 插件 均已覆盖的基线之上），以下为建议新增的资源方向：

### 高优先级（知名工作流仓库）

| 仓库 | Stars | 资源类型 | 缺失内容 |
|------|-------|---------|---------|
| `mattpocock/skills` | ~4k | 技能合集 | TypeScript 深度技能系列 |
| `garrytan/gstack` | ~3k | 工作流 | 全栈开发工作流 |
| `gsd-build/get-shit-done` | ~2k | 工作流 | 专注执行工作流 |
| `bmad-code-org/BMAD-METHOD` | ~2k | 方法论 | PRD-史诗-故事-实施管线 |
| `Yeachan-Heo/oh-my-claudecode` | ~1k | 技能合集 | 多语言技能包 |
| `humanlayer/humanlayer` | ~1k | 工作流 | 人工审批网关 |
| `EveryInc/compound-engineering-plugin` | ~1k | 插件 | 复合工程工作流 |
| `Fission-AI/OpenSpec` | ~1k | 工作流 | Agentic Spec 驱动开发 |
| `github/spec-kit` | ~1k | 命令集 | 规范编写命令包 |

### 高优先级（技术栈补全）

| 领域 | 缺失项目 | 建议类型 | 原因 |
|------|---------|---------|------|
| 可观测性 | Prometheus, Grafana, OpenTelemetry, Sentry, ELK, Loki, Tempo | 技能+命令 | 生产环境标配 |
| 消息系统 | gRPC, Kafka, RabbitMQ, NATS | 技能+代理 | 云原生通信核心 |
| 云原生 | Terraform, Pulumi, Serverless, EKS, Istio, Crossplane | 技能+命令 | IaC 主导工具 |
| 数据库 | MongoDB, Elasticsearch, Cassandra, Neo4j | 技能+命令 | NoSQL 四巨头 |
| 语言运行时 | Deno, Kotlin Multiplatform, .NET MAUI, SvelteKit, Nuxt 3, Solid.js | 技能+代理 | 主流框架 |
| 开发工具链 | semantic-release, NX, Turborepo, Changesets, Husky, Renovate | 命令 | 日常开发必备 |
| 代码质量 | SonarQube, SonarCloud | 技能+命令 | 持续质量保障 |
| 架构设计 | C4 Model, Event Storming, DDD, CQRS, Event Sourcing | 技能 | 架构文档标准 |
| 测试 | Chaos Mesh, Visual Regression(Percy/Chromatic), Playwright 高级 | 技能+命令 | 高级测试自动化 |

### 集成优先级建议

1. **第一阶段**：8 个缺失的高星工作流仓库（获取完整的 `.claude/` 目录结构）
2. **第二阶段**：可观测性 + 消息系统技能（Prometheus/gRPC/Kafka 等）
3. **第三阶段**：云原生 IaC / 数据库技能
4. **第四阶段**：语言框架 + 开发工具链

---

## 六、架构概览

```
bootstrap-entry.ts          # 读取 .doge/api.json → 设置环境变量 → 导入 CLI 入口
    ↓
entrypoints/cli.tsx         # 解析 CLI 参数 → 启动 Ink TUI 应用
    ↓
main.tsx (4395 行)          # init() → 初始化 GrowthBook/遥测/策略限制 → 启动 QueryEngine
    ↓
query.ts (1503 行)          # 主消息循环：user message → tool calls → tool results → continue/recover/crash
    ↓
QueryEngine.ts (1254 行)    # 子代理查询执行引擎
```

### 关键注册文件
| 文件 | 行数 | 职责 |
|------|------|------|
| `src/commands.ts` | 823 | 命令注册中心（140+ 斜杠命令），memoize 懒加载 |
| `src/tools.ts` | 442 | 工具注册中心（84 个工具），每目录独立实现 |
| `src/core.ts` | 1236 | 核心逻辑 |
| `src/context.ts` | 220 | 全局上下文聚合（Git 状态/系统上下文/用户上下文） |
| `src/Tool.ts` | ~700 | 工具接口定义 + 生命周期 |

### 特性标记系统（编译时死代码消除）
| 标记 | 作用 |
|------|------|
| `BRIDGE_MODE` | OpenAI ↔ Anthropic 桥接模式 |
| `PROACTIVE` / `KAIROS` | 主动功能 / 高级 AI 功能 |
| `AGENT_TRIGGERS` | 定时任务触发器 |
| `VOICE_MODE` | 语音模式 |
| `ULTRAPLAN` | 高级计划模式 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 |
| `CONTEXT_COLLAPSE` | 上下文折叠 |
| `FORK_SUBAGENT` | Fork 子代理 |

---

## 附：免费 Token / 反代资源报告

> 📋 详见项目根目录 [`免费token.md`](../免费token.md)

该报告通过 **GitHub API 实时搜索**（11 组关键词，1,500+ 项目）整理，包含：
- **官方免费 API Token 来源** — 12 家平台（DeepSeek/智谱/Anthropic/OpenAI 等）
- **GitHub TOP 30 反代项目排行** — 含 Stars、分类、核心功能描述
- **自建反代方案 TOP 9** — One API（35k★）/ LiteLLM（51k★）/ CCX / claude-code-proxy 等
- **Doge Code 7 种配置方案** — DeepSeek / One API / CCX / LiteLLM / 免费 API 等
- **Cloudflare Workers 可直接部署的反代代码**
- **社区活跃讨论渠道** — Hostloc / V2EX / 52破解 / B站 / 抖音 等

> ⚠️ 免费 Token 和反代地址时效性极高，请以 `免费token.md` 中的实时数据为准，定期更新。
