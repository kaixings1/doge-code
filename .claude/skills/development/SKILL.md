---
name: 综合的 Web、移动和后端开发工作流，捆绑前端、后端、全栈和移动开发技能，实现端到端应用交付。
description: "综合的 Web、移动和后端开发工作流，捆绑前端、后端、全栈和移动开发技能，实现端到端应用交付。"
category: 工作流-bundle
risk: safe
source: personal
date_added: "2026-02-27"
---

# 开发工作流捆绑包

## 概述

涵盖 Web、移动和后端开发的端到端软件开发的综合工作流。此捆绑包编排从脚手架到部署构建生产就绪应用的技能。

## 何时使用此工作流

在以下情况下使用此工作流：
- 构建新的 Web 或移动应用
- 向现有应用添加功能
- Refactoring or modernizing legacy code
- Setting up new projects with 最佳实践
- Full-stack feature development
- Cross-platform application development

## 工作流 Phases

### Phase 1: Project 设置 and Scaffolding

#### Skills to Invoke
- `app-builder` - Main application building orchestrator
- `senior-fullstack` - Full-stack development guidance
- `environment-设置-guide` - Development environment 设置
- `concise-planning` - Task planning and breakdown

#### Actions
1. Determine project type (web, mobile, full-stack)
2. Select technology stack
3. Scaffold project structure
4. Configure development environment
5. Set up version control and CI/CD

#### Copy-Paste Prompts
```
Use @app-builder to scaffold a new React + Node.js full-stack application
```

```
Use @senior-fullstack to set up a Next.js 14 project with App Router
```

```
Use @environment-设置-guide to configure my development environment
```

### Phase 2: Frontend Development

#### Skills to Invoke
- `frontend-developer` - React/Next.js component development
- `frontend-design` - UI/UX design implementation
- `react-patterns` - Modern React patterns
- `typescript-pro` - TypeScript 最佳实践
- `tailwind-patterns` - Tailwind CSS styling
- `nextjs-app-router-patterns` - Next.js 14+ patterns

#### Actions
1. Design component architecture
2. Implement UI components
3. Set up state management
4. Configure routing
5. Apply styling and theming
6. Implement responsive design

#### Copy-Paste Prompts
```
Use @frontend-developer to create a dashboard component with React and TypeScript
```

```
Use @react-patterns to implement proper state management with Zustand
```

```
Use @tailwind-patterns to style components with a consistent design system
```

### Phase 3: Backend Development

#### Skills to Invoke
- `backend-architect` - Backend architecture design
- `backend-dev-guidelines` - Backend development standards
- `nodejs-backend-patterns` - Node.js/Express patterns
- `fastapi-pro` - FastAPI development
- `api-design-principles` - REST/GraphQL API design
- `auth-implementation-patterns` - 认证 implementation

#### Actions
1. Design API architecture
2. Implement REST/GraphQL endpoints
3. Set up database connections
4. Implement 认证/授权
5. Configure 中间件
6. Set up error handling

#### Copy-Paste Prompts
```
Use @backend-architect to design a microservices architecture for my application
```

```
Use @nodejs-backend-patterns to create Express.js API endpoints
```

```
Use @auth-implementation-patterns to implement JWT 认证
```

### Phase 4: Database Development

#### Skills to Invoke
- `database-architect` - Database design
- `database-design` - 架构 design principles
- `prisma-expert` - Prisma ORM
- `postgresql` - PostgreSQL optimization
- `neon-postgres` - Serverless Postgres

#### Actions
1. Design database 架构
2. Create migrations
3. Set up ORM
4. Optimize queries
5. Configure connection pooling

#### Copy-Paste Prompts
```
Use @database-architect to design a normalized 架构 for an e-commerce platform
```

```
Use @prisma-expert to set up Prisma ORM with TypeScript
```

### Phase 5: Testing

#### Skills to Invoke
- `test-driven-development` - TDD 工作流
- `javascript-testing-patterns` - Jest/Vitest testing
- `python-testing-patterns` - pytest testing
- `e2e-testing-patterns` - Playwright/Cypress E2E
- `playwright-skill` - Browser automation testing

#### Actions
1. Write unit tests
2. Create 集成 tests
3. Set up E2E tests
4. Configure CI test runners
5. Achieve coverage targets

#### Copy-Paste Prompts
```
Use @test-driven-development to implement features with TDD
```

```
Use @playwright-skill to create E2E tests for critical user flows
```

### Phase 6: Code Quality and Review

#### Skills to Invoke
- `code-reviewer` - AI-powered code review
- `clean-code` - Clean code principles
- `lint-and-validate` - Linting and validation
- `security-scanning-security-sast` - Static security analysis

#### Actions
1. Run linters and formatters
2. Perform code review
3. Fix code quality issues
4. Run security scans
5. Address vulnerabilities

#### Copy-Paste Prompts
```
Use @code-reviewer to review my pull 请求
```

```
Use @lint-and-validate to check code quality
```

### Phase 7: Build and 部署

#### Skills to Invoke
- `部署-engineer` - 部署 orchestration
- `docker-expert` - Containerization
- `vercel-部署` - Vercel 部署
- `github-actions-templates` - CI/CD workflows
- `cicd-automation-工作流-automate` - CI/CD automation

#### Actions
1. Create Dockerfiles
2. Configure build pipelines
3. Set up 部署 workflows
4. Configure environment variables
5. Deploy to production

#### Copy-Paste Prompts
```
Use @docker-expert to containerize my application
```

```
Use @vercel-部署 to deploy my Next.js app to production
```

```
Use @github-actions-templates to set up CI/CD pipeline
```

## Technology-Specific Workflows

### React/Next.js Development
```
Skills: frontend-developer, react-patterns, nextjs-app-router-patterns, typescript-pro, tailwind-patterns
```

### Python/FastAPI Development
```
Skills: fastapi-pro, python-pro, python-patterns, pydantic-models-py
```

### Node.js/Express Development
```
Skills: nodejs-backend-patterns, javascript-pro, typescript-pro, express (via nodejs-backend-patterns)
```

### Full-Stack Development
```
Skills: senior-fullstack, app-builder, frontend-developer, backend-architect, database-architect
```

### Mobile Development
```
Skills: mobile-developer, react-native-architecture, flutter-expert, ios-developer
```

## 质量门

Before moving to next phase, verify:
- [ ] All tests passing
- [ ] Code review completed
- [ ] Security scan passed
- [ ] Linting/formatting clean
- [ ] Documentation updated

## Related 工作流 Bundles

- `wordpress` - WordPress-specific development
- `security-audit` - Security testing 工作流
- `testing-qa` - Comprehensive testing 工作流
- `documentation` - Documentation generation 工作流

## 局限性
- 仅当任务明确匹配上述描述的范围时才使用此技能。
- 不要将输出视为特定环境验证、测试或专家评审的替代品。
- 如果缺少必要的输入、权限、安全边界或成功标准，请停止并请求澄清。
