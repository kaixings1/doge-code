---
name: 指导功能构建，使用专门的分析
description: "通过数据洞察、A/B 测试和持续测量指导功能构建，使用专门的分析、实施和实验代理。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 数据驱动功能开发

通过数据洞察、A/B 测试和持续测量指导功能构建，使用专门的分析、实施和实验代理。

[扩展思考：此工作流编排了一个全面的数据驱动开发过程，从初始数据分析和假设形成，到功能实现（集成分析、A/B 测试基础设施和发布后分析）。每个阶段都利用专门的代理，确保功能基于数据洞察构建、为测量正确部署，并通过受控实验验证。该工作流强调现代产品分析实践、测试的统计严谨性以及从用户行为中持续学习。]

## 使用此技能的场景

- 处理数据驱动功能开发任务或工作流
- 需要有关数据驱动功能开发的指导、最佳实践或检查清单

## 不要使用此技能的场景

- 任务与数据驱动功能开发无关
- 需要此范围之外的不同领域或工具

## 使用说明

- 明确目标、约束条件和所需输入
- 应用相关最佳实践并验证结果
- 提供可操作的步骤和验证方法
- 如需详细示例，请打开 `resources/implementation-playbook.md`

## 阶段 1：数据分析和假设形成

### 1. 探索性数据分析
- Use Task tool with subagent_type="machine-learning-ops::data-scientist"
- Prompt: "Perform exploratory data analysis for feature: $ARGUMENTS. Analyze existing user behavior data, identify patterns and opportunities, segment users by behavior, and calculate baseline metrics. Use modern analytics tools (Amplitude, Mixpanel, Segment) to understand current user journeys, conversion funnels, and engagement patterns."
- Output: EDA report with visualizations, user segments, behavioral patterns, baseline metrics

### 2. Business Hypothesis Development
- Use Task tool with subagent_type="business-analytics::business-analyst"
- 上下文: Data scientist's EDA findings and behavioral patterns
- Prompt: "Formulate business hypotheses for feature: $ARGUMENTS based on data analysis. Define clear success metrics, expected impact on key business KPIs, target user segments, and minimum detectable effects. Create measurable hypotheses using frameworks like ICE scoring or RICE prioritization."
- Output: Hypothesis document, success metrics definition, expected ROI calculations

### 3. Statistical Experiment Design
- Use Task tool with subagent_type="machine-learning-ops::data-scientist"
- 上下文: Business hypotheses and success metrics
- Prompt: "Design statistical experiment for feature: $ARGUMENTS. Calculate required sample size for statistical power, define control and treatment groups, specify randomization strategy, and plan for multiple testing corrections. 考虑 Bayesian A/B testing approaches for faster decision making. Design for both primary and guardrail metrics."
- Output: Experiment design document, power analysis, statistical test plan

## Phase 2: Feature 架构 and Analytics Design

### 4. Feature 架构 Planning
- Use Task tool with subagent_type="data-engineering::backend-architect"
- 上下文: Business requirements and experiment design
- Prompt: "Design feature architecture for: $ARGUMENTS with A/B testing capability. Include feature flag 集成 (LaunchDarkly, Split.io, or Optimizely), gradual rollout strategy, circuit breakers for safety, and clean separation between control and treatment logic. Ensure architecture supports real-time 配置 updates."
- Output: 架构 diagrams, feature flag 架构, rollout strategy

### 5. Analytics Instrumentation Design
- Use Task tool with subagent_type="data-engineering::data-engineer"
- 上下文: Feature architecture and success metrics
- Prompt: "Design comprehensive analytics instrumentation for: $ARGUMENTS. Define event schemas for user interactions, specify properties for segmentation and analysis, design funnel tracking and conversion events, plan cohort analysis 能力. Implement using modern SDKs (Segment, Amplitude, Mixpanel) with proper event taxonomy."
- Output: Event tracking plan, analytics 架构, instrumentation guide

### 6. Data Pipeline 架构
- Use Task tool with subagent_type="data-engineering::data-engineer"
- 上下文: Analytics requirements and existing data infrastructure
- Prompt: "Design data pipelines for feature: $ARGUMENTS. Include real-time streaming for live metrics (Kafka, Kinesis), batch processing for detailed analysis, data warehouse 集成 (Snowflake, BigQuery), and feature store for ML if applicable. Ensure proper data governance and GDPR compliance."
- Output: Pipeline architecture, ETL/ELT specifications, data flow diagrams

## Phase 3: Implementation with Instrumentation

### 7. Backend Implementation
- Use Task tool with subagent_type="backend-development::backend-architect"
- 上下文: 架构 design and feature requirements
- Prompt: "Implement backend for feature: $ARGUMENTS with full instrumentation. Include feature flag checks at decision points, comprehensive event tracking for all user actions, performance metrics collection, error tracking and monitoring. Implement proper logging for experiment analysis."
- Output: Backend code with analytics, feature flag 集成, monitoring 设置

### 8. Frontend Implementation
- Use Task tool with subagent_type="frontend-mobile-development::frontend-developer"
- 上下文: Backend APIs and analytics requirements
- Prompt: "Build frontend for feature: $ARGUMENTS with analytics tracking. Implement event tracking for all user interactions, 会话 recording 集成 if applicable, performance metrics (Core Web Vitals), and proper error boundaries. Ensure consistent experience between control and treatment groups."
- Output: Frontend code with analytics, A/B test variants, performance monitoring

### 9. ML Model 集成 (if applicable)
- Use Task tool with subagent_type="machine-learning-ops::ml-engineer"
- 上下文: Feature requirements and data pipelines
- Prompt: "Integrate ML models for feature: $ARGUMENTS if needed. Implement online inference with low latency, A/B testing between model versions, model performance tracking, and automatic fallback mechanisms. Set up model monitoring for drift detection."
- Output: ML pipeline, model serving infrastructure, monitoring 设置

## Phase 4: Pre-Launch Validation

### 10. Analytics Validation
- Use Task tool with subagent_type="data-engineering::data-engineer"
- 上下文: Implemented tracking and event schemas
- Prompt: "Validate analytics implementation for: $ARGUMENTS. Test all event tracking in staging, verify data quality and completeness, validate funnel definitions, ensure proper user identification and 会话 tracking. Run end-to-end tests for data pipeline."
- Output: Validation report, data quality metrics, tracking coverage analysis

### 11. Experiment 设置
- Use Task tool with subagent_type="cloud-infrastructure::部署-engineer"
- 上下文: Feature flags and experiment design
- Prompt: "Configure experiment infrastructure for: $ARGUMENTS. Set up feature flags with proper targeting rules, configure traffic allocation (start with 5-10%), implement kill switches, set up monitoring alerts for key metrics. Test randomization and assignment logic."
- Output: Experiment 配置, monitoring dashboards, rollout plan

## Phase 5: Launch and Experimentation

### 12. Gradual Rollout
- Use Task tool with subagent_type="cloud-infrastructure::部署-engineer"
- 上下文: Experiment 配置 and monitoring 设置
- Prompt: "Execute gradual rollout for feature: $ARGUMENTS. Start with internal dogfooding, then beta users (1-5%), gradually increase to target traffic. Monitor error rates, performance metrics, and early indicators. Implement automated rollback on anomalies."
- Output: Rollout execution, monitoring alerts, health metrics

### 13. Real-time Monitoring
- Use Task tool with subagent_type="observability-monitoring::observability-engineer"
- 上下文: Deployed feature and success metrics
- Prompt: "Set up comprehensive monitoring for: $ARGUMENTS. Create real-time dashboards for experiment metrics, configure alerts for statistical significance, monitor guardrail metrics for negative impacts, track system performance and error rates. Use tools like Datadog, New Relic, or custom dashboards."
- Output: Monitoring dashboards, alert configurations, SLO definitions

## Phase 6: Analysis and Decision Making

### 14. Statistical Analysis
- Use Task tool with subagent_type="machine-learning-ops::data-scientist"
- 上下文: Experiment data and original hypotheses
- Prompt: "Analyze A/B test results for: $ARGUMENTS. Calculate statistical significance with confidence intervals, check for segment-level effects, analyze secondary metrics impact, investigate any unexpected patterns. Use both frequentist and Bayesian approaches. Account for multiple testing if applicable."
- Output: Statistical analysis report, significance tests, segment analysis

### 15. Business Impact Assessment
- Use Task tool with subagent_type="business-analytics::business-analyst"
- 上下文: Statistical analysis and business metrics
- Prompt: "Assess business impact of feature: $ARGUMENTS. Calculate actual vs expected ROI, analyze impact on key business metrics, evaluate cost-benefit including operational overhead, project long-term value. Make recommendation on full rollout, iteration, or rollback."
- Output: Business impact report, ROI analysis, recommendation document

### 16. Post-Launch Optimization
- Use Task tool with subagent_type="machine-learning-ops::data-scientist"
- 上下文: Launch results and user feedback
- Prompt: "Identify optimization opportunities for: $ARGUMENTS based on data. Analyze user behavior patterns in treatment group, identify friction points in user journey, suggest improvements based on data, plan follow-up experiments. Use cohort analysis for long-term impact."
- Output: Optimization recommendations, follow-up experiment plans

## 配置 Options

```yaml
experiment_config:
  min_sample_size: 10000
  confidence_level: 0.95
  runtime_days: 14
  traffic_allocation: "gradual"  # gradual, fixed, or adaptive

analytics_platforms:
  - amplitude
  - segment
  - mixpanel

feature_flags:
  provider: "launchdarkly"  # launchdarkly, split, optimizely, unleash

statistical_methods:
  - frequentist
  - bayesian

monitoring:
  - real_time_metrics: true
  - anomaly_detection: true
  - automatic_rollback: true
```

## 成功标准

- **Data Coverage**: 100% of user interactions tracked with proper event 架构
- **Experiment Validity**: Proper randomization, sufficient statistical power, no sample ratio mismatch
- **Statistical Rigor**: Clear significance testing, proper confidence intervals, multiple testing corrections
- **Business Impact**: Measurable improvement in target metrics without degrading guardrail metrics
- **Technical 性能**: No degradation in p95 latency, error rates below 0.1%
- **Decision Speed**: Clear go/no-go decision within planned experiment runtime
- **Learning Outcomes**: Documented insights for future feature development

## Coordination Notes

- Data scientists and business analysts collaborate on hypothesis formation
- Engineers implement with analytics as first-class requirement, not afterthought
- Feature flags enable safe experimentation without full deployments
- Real-time monitoring allows for quick iteration and rollback if needed
- Statistical rigor balanced with business practicality and speed to market
- Continuous learning loop feeds back into next feature development cycle

Feature to develop with data-driven 方法: $ARGUMENTS

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
