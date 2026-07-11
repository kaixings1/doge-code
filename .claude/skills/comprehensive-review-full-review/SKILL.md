---
name: 适用于working with comprehensive review full review
description: "适用于working with comprehensive review full review的情况。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 全面审查

## 使用此技能的场景

- 处理全面审查完整检查任务或工作流时
- 需要全面审查完整检查的指导、最佳实践或检查清单时

## 不要使用此技能的场景

- 任务与全面审查完整检查无关时
- 需要此范围之外的领域或工具时

## 说明

- 明确目标、约束和所需输入。
- 应用相关最佳实践并验证结果。
- 提供可操作的步骤和验证方法。
- 如需详细示例，请打开 `resources/implementation-playbook.md`。

使用专门的审查代理编排全面的多维代码审查。

[扩展思考：此工作流通过按顺序阶段编排多个专门代理来执行详尽的代码审查。每个阶段基于先前的发现构建，创建涵盖代码质量、安全、性能、测试、文档和最佳实践的全面审查。该工作流集成现代 AI 辅助审阅工具、静态分析、安全扫描和自动化质量指标。结果整合为可操作的反馈，附带明确的优先级和修复指导。分阶段方法确保全面覆盖，同时在适当时通过并行代理执行保持效率。]

## 审查配置选项

- **--security-focus**: 优先处理安全漏洞和 OWASP 合规性
- **--performance-critical**: 侧重性能瓶颈和可扩展性问题
- **--tdd-review**: 包括 TDD 合规性和测试优先验证
- **--ai-assisted**: 启用 AI 支持的审查工具（Copilot、Codium、Bito）
- **--strict-mode**: 发现任何关键问题时审查失败
- **--metrics-report**: 生成详细的质量指标仪表盘
- **--framework [名称]**: 应用框架特定的最佳实践（React、Spring、Django 等）

## 阶段 1：代码质量与架构审查

使用 Task 工具编排质量和架构代理并行执行：

### 1A. 代码质量分析
- 使用 subagent_type="code-reviewer" 的 Task 工具
- 提示："对以下内容执行全面代码质量审查：$ARGUMENTS。分析代码复杂度、可维护性指数、技术债务、代码重复、命名约定和 Clean Code 原则遵从性。集成 SonarQube、CodeQL 和 Semgrep 进行静态分析。检查代码坏味、反模式和 SOLID 原则违规。生成圈复杂度指标并识别重构机会。"
- 预期输出：质量指标、代码坏味清单、重构建议
- 上下文：初始代码库分析，不依赖其他阶段

### 1B. 架构与设计审查
- 使用 subagent_type="architect-review" 的 Task 工具
- 提示："审查以下内容的架构设计模式和结构完整性：$ARGUMENTS。评估微服务边界、API 设计、数据库架构、依赖管理和领域驱动设计原则遵从性。检查循环依赖、不恰当的耦合、缺失的抽象和架构漂移。验证是否遵从企业架构标准和云原生模式。"
- 预期输出：架构评估、设计模式分析、结构建议
- 上下文：与代码质量分析并行运行

## 阶段 2：安全与性能审查

使用安全与性能代理，结合阶段 1 的发现：

### 2A. 安全漏洞评估
- 使用 subagent_type="security-auditor" 的 Task 工具
- 提示："对以下内容执行全面安全审计：$ARGUMENTS。执行 OWASP Top 10 分析、使用 Snyk/Trivy 的依赖漏洞扫描、使用 GitLeaks 的密钥检测、输入验证审查、认证/授权评估和加密实现审查。包含阶段 1 架构审查的发现：{phase1_architecture_context}。检查 SQL 注入、XSS、CSRF、不安全的反序列化和配置安全问题。"
- 预期输出：漏洞报告、CVE 清单、安全风险矩阵、修复步骤
- 上下文：纳入阶段 1B 中识别的架构漏洞

### 2B. 性能与可扩展性分析
- 使用 subagent_type="application-performance::performance-engineer" 的 Task 工具
- 提示："对以下内容进行性能分析和可扩展性评估：$ARGUMENTS。分析代码的 CPU/内存热点、检查数据库查询性能、审查缓存策略、识别 N+1 问题、评估连接池和异步处理模式。考虑阶段 1 的架构发现：{phase1_architecture_context}。检查内存泄漏、资源争用和负载下的瓶颈。"
- 预期输出：性能指标、瓶颈分析、优化建议
- 上下文：利用架构洞察识别系统性性能问题

## 阶段 3：测试与文档审查

使用 Task 工具进行测试和文档质量评估：

### 3A. 测试覆盖与质量分析
- 使用 subagent_type="unit-testing::test-automator" 的 Task 工具
- 提示："评估以下内容的测试策略和实现：$ARGUMENTS。分析单元测试覆盖率、集成测试完整性、端到端测试场景、测试金字塔遵从性和测试可维护性。检查测试质量指标，包括断言密度、测试隔离、mock 使用和脆弱性。考虑阶段 2 的安全和性能测试要求：{phase2_security_context}、{phase2_performance_context}。如果设置了 --tdd-review 标志，验证 TDD 实践。"
- 预期输出：覆盖率报告、测试质量指标、测试差距分析
- 上下文：纳入阶段 2 的安全和性能测试要求

### 3B. 文档与 API 规范审查
- 使用 subagent_type="code-documentation::docs-architect" 的 Task 工具
- 提示："审查以下内容的文档完整性和质量：$ARGUMENTS。评估内联代码文档、API 文档（OpenAPI/Swagger）、架构决策记录（ADR）、README 完整性、部署指南和操作手册。验证文档是否反映基于所有先前阶段发现的实际实现：{phase1_context}、{phase2_context}。检查过时的文档、缺失的示例和不清晰的解释。"
- 预期输出：文档覆盖率报告、不一致清单、改进建议
- 上下文：交叉引用所有先前发现以确保文档准确性

## 阶段 4：最佳实践与标准合规

使用 Task 工具验证框架特定和行业最佳实践：

### 4A. 框架与语言最佳实践
- 使用 subagent_type="framework-迁移::legacy-modernizer" 的 Task 工具
- 提示："验证以下内容的框架和语言最佳实践遵从性：$ARGUMENTS。检查现代 JavaScript/TypeScript 模式、React hooks 最佳实践、Python PEP 合规性、Java 企业模式、Go 惯用代码或框架特定约定（基于 --framework 标志）。审查包管理、构建配置、环境处理和部署实践。包含所有前阶段的质问题：{all_previous_contexts}。"
- 预期输出：最佳实践合规报告、现代化建议
- 上下文：综合所有先前发现以提供框架特定指导

### 4B. CI/CD 与 DevOps 实践审查
- 使用 subagent_type="cicd-automation::部署-engineer" 的 Task 工具
- 提示："审查以下内容的 CI/CD 管道和 DevOps 实践：$ARGUMENTS。评估构建自动化、测试自动化集成、部署策略（蓝绿、金丝雀）、基础设施即代码、监控/可观测性设置和事件响应流程。评估管道安全、制品管理和回滚能力。考虑先前阶段中识别的影响部署的所有问题：{all_critical_issues}。"
- 预期输出：管道评估、DevOps 成熟度评估、自动化建议
- 上下文：侧重于将识别的所有问题的修复付诸实施

## 综合报告生成

将所有阶段输出编译为综合审查报告：

### 关键问题（P0 - 必须立即修复）
- CVSS > 7.0 的安全漏洞
- 数据丢失或损坏风险
- 认证/授权绕过
- 生产稳定性威胁
- 合规违规（GDPR、PCI DSS、SOC2）

### 高优先级（P1 - 下一个发布前修复）
- 影响用户体验的性能瓶颈
- 缺失关键测试覆盖率
- 导致技术债务的架构反模式
- 存在已知漏洞的过时依赖
- 影响可维护性的代码质量问题

### 中优先级（P2 - 规划到下一个迭代）
- 非关键性性能优化
- 文档差距和不一致
- 代码重构机会
- 测试质量改进
- DevOps 自动化增强

### 低优先级（P3 - 跟踪到待办列表）
- 风格指南违反
- 轻微代码坏味问题
- 锦上添花的文档更新
- 外观改进

## 成功标准

Review is considered successful when:
- All critical security vulnerabilities are identified and documented
- Performance bottlenecks are profiled with remediation paths
- Test coverage gaps are mapped with priority recommendations
- Architecture risks are assessed with mitigation strategies
- Documentation reflects actual implementation state
- Framework best practices compliance is verified
- CI/CD pipeline supports safe 部署 of reviewed code
- Clear, actionable feedback is provided for all findings
- Metrics dashboard shows improvement trends
- Team has clear prioritized action plan for remediation

Target: $ARGUMENTS

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
