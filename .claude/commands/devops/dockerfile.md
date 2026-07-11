为当前项目生成优化后的 Dockerfile。

## 步骤

### 1. 检测项目类型
- 读取 package.json、pyproject.toml、go.mod、Cargo.toml 或等效文件以确定语言和框架。
- 识别构建命令和输出目录。
- 识别运行时依赖与仅构建依赖。

### 2. 选择基础镜像
- **Node.js**：运行时用 `node:22-alpine`，如果需要原生模块则用 `node:22` 构建。
- **Python**：运行时用 `python:3.12-slim`，如果需要编译则用完整镜像构建。
- **Go**：构建用 `golang:1.23-alpine`，运行时用 `gcr.io/distroless/static-debian12`。
- **Rust**：构建用 `rust:1.82-slim`，运行时用 `debian:bookworm-slim` 或 `scratch`。

### 3. 多阶段构建
```dockerfile
# 阶段 1：构建
FROM <build-image> AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# 阶段 2：运行时
FROM <runtime-image>
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
USER node
CMD ["node", "dist/index.js"]
```

### 4. 优化检查清单
- 先复制依赖文件，再复制源代码（层缓存）。
- 使用 `.dockerignore` 排除：`.git`、`node_modules`、`dist`、`.env`、测试、文档。
- 以非 root 用户运行。
- 设置 `NODE_ENV=production` 或等效设置。
- 添加健康检查：`HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1`。
- 使用摘要固定基础镜像版本以确保可重现性。
- 通过合并相关的 RUN 命令最小化层数。

### 5. 生成 .dockerignore
创建或更新 `.dockerignore`，为项目类型提供合理的默认值。

## 规则

- 始终使用多阶段构建以最小化镜像大小。
- 绝不将 `.env` 文件或密钥复制到镜像中。
- 在最终阶段以非 root 用户运行。
- 包含 HEALTHCHECK 指令。
- 对于典型的 Web 应用程序，保持最终镜像在 200MB 以下。
- 使用 `docker build -t app . && docker run -p 3000:3000 app` 在本地测试构建的镜像。
