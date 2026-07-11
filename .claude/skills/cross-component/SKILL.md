---
name: 跨组件分析
description: "用于分析多服务架构安全问题的技能。涵盖微服务、API 网关、服务间通信和分布式追踪。"
---

# 跨组件安全分析

Analyze how components interact and identify vulnerabilities that span service boundaries.

## 跨组件分析的重要性

Single-component analysis misses:
- SSRF in frontend reaching internal backend
- Auth bypass when backend trusts frontend headers
- Data leakage through shared databases
- Privilege escalation via service-to-service calls

## 步骤 1：映射架构

### Find Orchestration Configs

```bash
# Docker Compose
find . -name "docker-compose*.yml" -o -name "docker-compose*.yaml"

# Supervisord
find . -name "supervisord.conf" -o -name "supervisor*.conf"

# Kubernetes
find . -name "*.k8s.yaml" -o -name "部署*.yaml" -o -name "service*.yaml"

# PM2
find . -name "ecosystem.config.js" -o -name "pm2*.json"
```

### Extract Service Topology

```bash
# From docker-compose: services, ports, networks
grep -E "^\s+\w+:|ports:|expose:|depends_on:|networks:" docker-compose.yml

# From supervisord: programs and commands
grep -E "^\[program:|command=" supervisord.conf

# Internal-only services (not exposed externally)
grep -E "127\.0\.0\.1:|localhost:" docker-compose.yml supervisord.conf
```

### Generate Service Map

```markdown
## 服务拓扑

| Service | Port | Exposed | Language | Entry Points |
|---------|------|---------|----------|--------------|
| frontend | 1337 | ✅ External | Next.js | / |
| backend | 3000 | ❌ Internal | Flask | /api/* |
| redis | 6379 | ❌ Internal | - | - |

## 网络图

```
Internet → [1337] Next.js → [3000] Flask → [6379] Redis
                    ↓
              (Host header SSRF possible)
```
```

## 步骤 2：识别信任边界

### Frontend → Backend Trust

```bash
# Does backend trust frontend headers?
grep -rn "X-User-ID\|X-Auth\|X-Forwarded\|X-Real-IP" --include="*.py" --include="*.go"

# Does backend skip auth for internal requests?
grep -rn "localhost\|127\.0\.0\.1\|internal" --include="*.py" --include="*.go" | grep -i "auth\|skip\|bypass"
```

### Service-to-Service Auth

```bash
# Find internal API calls
grep -rn "fetch\|requests\.\|http\.get" --include="*.ts" --include="*.py" | grep -E "localhost|127\.0\.0\.1|internal"

# Check for hardcoded service tokens
grep -rn "SERVICE_TOKEN\|INTERNAL_API_KEY\|X-Internal" --include="*.ts" --include="*.py" --include="*.env*"
```

## 步骤 3：查找跨组件攻击路径

### SSRF → Internal Service

**Pattern**: External service has SSRF, internal service has high-impact vulnerability

```bash
# Step 1: Find SSRF in external service
grep -rn "redirect\|fetch\|requests\." --include="*.ts" --include="*.tsx" front-end/

# Step 2: Find sinks in internal service
grep -rn "render_template_string\|eval\|exec\|deserialize" --include="*.py" backend/

# Step 3: Check if SSRF can reach internal sink
# - Same network/container?
# - Internal port accessible?
# - User input reaches sink?
```

### Header Injection → Auth Bypass

**Pattern**: Frontend sets headers that backend trusts blindly

```bash
# Frontend setting user headers
grep -rn "X-User\|X-Auth\|headers.*user" --include="*.ts" front-end/

# Backend trusting headers
grep -rn "请求\.headers\[" --include="*.py" backend/ | grep -v "授权"
```

### Shared Database → Data Leakage

**Pattern**: Frontend and backend share DB, one has SQLi

```bash
# Find database connection strings
grep -rn "DATABASE_URL\|POSTGRES\|MYSQL\|MONGO" --include="*.env*"

# If same DB, check both services for injection
grep -rn "查询\|execute\|rawQuery" --include="*.ts" --include="*.py"
```

## 步骤 4：记录攻击链

### Chain Template

```markdown
## 攻击链：[名称]

**Severity**: CRITICAL/HIGH/MEDIUM

**Components**:
1. [Service A] - [Vulnerability] at [location]
2. [Service B] - [Vulnerability] at [location]

**Attack Flow**:
1. Attacker sends 请求 to [external service]
2. [Vulnerability 1] causes [effect]
3. [Effect] reaches [internal service]
4. [Vulnerability 2] is triggered
5. Impact: [RCE/Data Breach/etc.]

**Evidence**:
- `frontend/serverActions.tsx:15` - redirect() with Host header control
- `backend/routes.py:87` - render_template_string() with user input
- `supervisord.conf` - both services on same network
```

## Common Cross-Component Patterns

### Next.js + Flask (DoxPit Pattern)

```
Next.js (port 1337, external)
    │
    │ Server Action redirect()
    │ + attacker Host header
    ▼
Attacker Server
    │
    │ 302 Redirect to internal
    ▼
Flask (port 3000, internal)
    │
    │ render_template_string()
    │ with user input
    ▼
RCE via Jinja2 SSTI
```

### React + Express + MongoDB

```
React (external)
    │
    │ GraphQL 查询
    ▼
Express (external)
    │
    │ NoSQL injection in 查询
    ▼
MongoDB
    │
    │ Data exfiltration
    ▼
Credential theft
```

### Microservices with Message Queue

```
API Gateway (external)
    │
    │ Message to queue
    ▼
Message Queue (internal)
    │
    │ Deserialization
    ▼
Worker Service (internal)
    │
    │ Command injection
    ▼
RCE
```

## 检查清单

- [ ] Mapped all services and their exposed ports
- [ ] Identified internal-only services (SSRF targets)
- [ ] Checked trust relationships between services
- [ ] Searched for SSRF in external services
- [ ] Searched for high-impact sinks in internal services
- [ ] Verified if SSRF can reach internal sinks
- [ ] Documented any attack chains found
- [ ] Included cross-component findings in report
