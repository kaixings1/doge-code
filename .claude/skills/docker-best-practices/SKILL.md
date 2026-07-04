---
name: docker-best-practices
description: Docker最佳实践 — 包括多阶段构建、Compose优化、层缓存和安全扫描。
---

# Docker /u6700/u4f73/u5b9e/u8df5

## /u591a/u9636/u6bb5/u6784/u5efa

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]
```

Separate dependency installation from build steps. Final stage contains only runtime artifacts.

## Python /u591a/u9636/u6bb5

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
RUN useradd --create-home appuser
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY . .
USER appuser
CMD ["gunicorn", "app:create_app()", "-b", "0.0.0.0:8000", "-w", "4"]
```

## Docker Compose

```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/app
      - REDIS_URL=redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 512M

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d app"]
      interval: 5s
      timeout: 3s
      retries: 5

  cache:
    image: redis:7-alpine
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru

volumes:
  pgdata:
```

## .dockerignore

```
node_modules
.git
.env*
*.md
docker-compose*.yml
.github
coverage
dist
```

始终 include a `.dockerignore` to reduce build context size and prevent leaking secrets.

## /u955c/u50cf/u4f18/u5316/u6280/u5de7

```bash
# Check image size breakdown
docker history --human --no-trunc <image>

# Use dive for layer analysis
dive <image>

# Multi-arch build
docker buildx build --platform linux/amd64,linux/arm64 -t registry/app:1.0 --push .
```

Combine `RUN` commands to reduce layers. Order instructions from least to most frequently changing for cache efficiency.

## /u53cd/u6a21/u5f0f

- Running as root inside containers
- Using `ADD` when `COPY` suffices (ADD auto-extracts tarballs, pulls URLs)
- Storing secrets in environment variables in Dockerfiles
- Not pinning base image versions (`FROM node:latest`)
- Missing `.dockerignore` causing large build contexts
- Installing dev dependencies in production images

## /u6e05/u5355

- [ ] Multi-stage build separates build and runtime stages
- [ ] Non-root user created and used with `USER` directive
- [ ] Base images pinned to specific versions (e.g., `node:22-alpine`)
- [ ] `.dockerignore` excludes `.git`, `node_modules`, `.env`
- [ ] `HEALTHCHECK` instruction defined
- [ ] Production image contains no build tools or dev dependencies
- [ ] `docker-compose` uses `depends_on` with health conditions
- [ ] Secrets passed via build secrets or runtime mounts, not `ENV` in Dockerfile
