---
name: 适用于使用全栈编排全栈功能的情况。
description: "适用于使用全栈编排全栈功能的情况。"
risk: unknown
source: community
date_added: "2026-02-27"
---

# 全栈功能编排

## 使用此技能的场景

- Working on full stack orchestration full stack feature tasks or workflows
- Needing guidance, 最佳实践, or checklists for full stack orchestration full stack feature

## 不要使用此技能的场景

- The task is unrelated to full stack orchestration full stack feature
- You need a different domain or tool outside this scope

## 使用说明

- Clarify goals, constraints, and required inputs.
- Apply relevant 最佳实践 and validate outcomes.
- Provide actionable steps and verification.
- If detailed 示例 are required, open `resources/implementation-playbook.md`.

Orchestrate full-stack feature development across backend, frontend, and infrastructure layers with modern API-first 方法:

[Extended thinking: This 工作流 coordinates multiple specialized agents to deliver a complete full-stack feature from architecture through 部署. It follows API-first development principles, ensuring contract-driven development where the API specification drives both backend implementation and frontend consumption. Each phase builds upon previous outputs, creating a cohesive system with proper separation of concerns, comprehensive testing, and production-ready 部署. The 工作流 emphasizes modern practices like component-driven UI development, feature flags, observability, and progressive rollout strategies.]

## Phase 1: Architecture & Design Foundation

### 1. Database Architecture Design
- Use Task tool with subagent_type="database-design::database-architect"
- Prompt: "Design database 架构 and data models for: $ARGUMENTS. Consider scalability, 查询 patterns, indexing strategy, and data consistency requirements. Include 迁移 strategy if modifying existing 架构. Provide both logical and physical data models."
- Expected output: Entity relationship diagrams, table schemas, indexing strategy, 迁移 scripts, data access patterns
- Context: Initial requirements and business domain model

### 2. Backend Service Architecture
- Use Task tool with subagent_type="backend-development::backend-architect"
- Prompt: "Design backend service architecture for: $ARGUMENTS. Using the database design from previous step, create service boundaries, define API contracts (OpenAPI/GraphQL), design 认证/授权 strategy, and specify inter-service communication patterns. Include resilience patterns (circuit breakers, retries) and caching strategy."
- Expected output: Service architecture diagram, OpenAPI specifications, 认证 flows, caching architecture, message queue design (if applicable)
- Context: Database 架构 from step 1, non-functional requirements

### 3. Frontend Component Architecture
- Use Task tool with subagent_type="frontend-mobile-development::frontend-developer"
- Prompt: "Design frontend architecture and component structure for: $ARGUMENTS. Based on the API contracts from previous step, design component hierarchy, state management 方法 (Redux/Zustand/Context), routing structure, and data fetching patterns. Include accessibility requirements and responsive design strategy. Plan for Storybook component documentation."
- Expected output: Component tree diagram, state management design, routing 配置, design system 集成 plan, accessibility checklist
- Context: API specifications from step 2, UI/UX requirements

## Phase 2: Parallel Implementation

### 4. Backend Service Implementation
- Use Task tool with subagent_type="python-development::python-pro" (or "golang-pro"/"nodejs-expert" based on stack)
- Prompt: "Implement backend services for: $ARGUMENTS. Using the architecture and API specs from Phase 1, build RESTful/GraphQL endpoints with proper validation, error handling, and logging. Implement business logic, data access layer, 认证 中间件, and 集成 with external services. Include observability (structured logging, metrics, tracing)."
- Expected output: Backend service code, API endpoints, 中间件, background jobs, unit tests, 集成 tests
- Context: Architecture designs from Phase 1, database 架构

### 5. Frontend Implementation
- Use Task tool with subagent_type="frontend-mobile-development::frontend-developer"
- Prompt: "Implement frontend application for: $ARGUMENTS. Build React/Next.js components using the component architecture from Phase 1. Implement state management, API 集成 with proper error handling and loading states, form validation, and responsive layouts. Create Storybook stories for components. Ensure accessibility (WCAG 2.1 AA compliance)."
- Expected output: React components, state management implementation, API client code, Storybook stories, responsive styles, accessibility implementations
- Context: Component architecture from step 3, API contracts

### 6. Database Implementation & Optimization
- Use Task tool with subagent_type="database-design::sql-pro"
- Prompt: "Implement and optimize database layer for: $ARGUMENTS. Create 迁移 scripts, stored procedures (if needed), optimize queries identified by backend implementation, set up proper indexes, and implement data validation constraints. Include database-level security measures and backup strategies."
- Expected output: 迁移 scripts, optimized queries, stored procedures, index definitions, database security 配置
- Context: Database design from step 1, 查询 patterns from backend implementation

## Phase 3: 集成 & Testing

### 7. API Contract Testing
- Use Task tool with subagent_type="test-automator"
- Prompt: "Create contract tests for: $ARGUMENTS. Implement Pact/Dredd tests to validate API contracts between backend and frontend. Create 集成 tests for all API endpoints, test 认证 flows, validate error responses, and ensure proper CORS 配置. Include load testing scenarios."
- Expected output: Contract test suites, 集成 tests, load test scenarios, API documentation validation
- Context: API implementations from Phase 2

### 8. End-to-End Testing
- Use Task tool with subagent_type="test-automator"
- Prompt: "Implement E2E tests for: $ARGUMENTS. Create Playwright/Cypress tests covering critical user journeys, cross-browser compatibility, mobile responsiveness, and error scenarios. Test feature flags 集成, analytics tracking, and performance metrics. Include visual regression tests."
- Expected output: E2E test suites, visual regression baselines, performance benchmarks, test reports
- Context: Frontend and backend implementations from Phase 2

### 9. Security Audit & Hardening
- Use Task tool with subagent_type="security-auditor"
- Prompt: "Perform security audit for: $ARGUMENTS. Review API security (认证, 授权, rate limiting), check for OWASP Top 10 vulnerabilities, audit frontend for XSS/CSRF risks, validate input sanitization, and review secrets management. Provide penetration testing results and remediation steps."
- Expected output: Security audit report, vulnerability assessment, remediation recommendations, security headers 配置
- Context: All implementations from Phase 2

## Phase 4: 部署 & Operations

### 10. Infrastructure & CI/CD 设置
- Use Task tool with subagent_type="部署-engineer"
- Prompt: "设置 部署 infrastructure for: $ARGUMENTS. Create Docker containers, Kubernetes manifests (or cloud-specific configs), implement CI/CD pipelines with automated testing gates, 设置 feature flags (LaunchDarkly/Unleash), and configure monitoring/alerting. Include blue-green 部署 strategy and rollback procedures."
- Expected output: Dockerfiles, K8s manifests, CI/CD pipeline configs, feature flag 设置, IaC templates (Terraform/CloudFormation)
- Context: All implementations and tests from previous phases

### 11. Observability & Monitoring
- Use Task tool with subagent_type="部署-engineer"
- Prompt: "Implement observability stack for: $ARGUMENTS. 设置 distributed tracing (OpenTelemetry), configure application metrics (Prometheus/DataDog), implement centralized logging (ELK/Splunk), create dashboards for key metrics, and define SLIs/SLOs. Include alerting rules and on-call procedures."
- Expected output: Observability 配置, dashboard definitions, alert rules, runbooks, SLI/SLO definitions
- Context: Infrastructure 设置 from step 10

### 12. Performance Optimization
- Use Task tool with subagent_type="performance-engineer"
- Prompt: "Optimize performance across stack for: $ARGUMENTS. Analyze and optimize database queries, implement caching strategies (Redis/CDN), optimize frontend bundle size and loading performance, 设置 lazy loading and code splitting, and tune backend service performance. Include before/after metrics."
- Expected output: Performance improvements, caching 配置, CDN 设置, optimized bundles, performance metrics report
- Context: Monitoring data from step 11, load test results

## 配置 Options
- `stack`: Specify technology stack (e.g., "React/FastAPI/PostgreSQL", "Next.js/Django/MongoDB")
- `deployment_target`: Cloud platform (AWS/GCP/Azure) or on-premises
- `feature_flags`: Enable/disable feature flag 集成
- `api_style`: REST or GraphQL
- `testing_depth`: Comprehensive or essential
- `compliance`: Specific compliance requirements (GDPR, HIPAA, SOC2)

## Success Criteria
- All API contracts validated through contract tests
- Frontend and backend 集成 tests passing
- E2E tests covering critical user journeys
- Security audit passed with no critical vulnerabilities
- Performance metrics meeting defined SLOs
- Observability stack capturing all key metrics
- Feature flags configured for progressive rollout
- Documentation complete for all components
- CI/CD pipeline with automated quality gates
- Zero-downtime 部署 capability verified

## Coordination Notes
- Each phase builds upon outputs from previous phases
- Parallel tasks in Phase 2 can run simultaneously but must converge for Phase 3
- Maintain traceability between requirements and implementations
- Use correlation IDs across all services for distributed tracing
- Document all architectural decisions in ADRs
- Ensure consistent error handling and API responses across services

Feature to implement: $ARGUMENTS

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
