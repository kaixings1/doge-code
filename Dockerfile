# ==========================================
# 多阶段构建 - doge-code CLI
# ==========================================

# ---- 阶段 1: 依赖安装 ----
FROM oven/bun:1.3.5 AS deps
WORKDIR /app

# 复制依赖文件
COPY package.json bun.lock bunfig.toml ./

# 安装生产依赖
RUN bun install --frozen-lockfile --production

# ---- 阶段 2: 构建 ----
FROM oven/bun:1.3.5 AS builder
WORKDIR /app

# 复制所有文件
COPY . .

# 安装全部依赖（包括 dev）
RUN bun install --frozen-lockfile

# 执行构建
RUN bun run build

# ---- 阶段 3: 生产镜像 ----
FROM oven/bun:1.3.5-slim AS runner
WORKDIR /app

# 安全：创建非 root 用户
RUN addgroup --system --gid 1001 doge && \
    adduser --system --uid 1001 dogeuser

# 从 deps 阶段复制生产依赖
COPY --from=deps /app/node_modules ./node_modules

# 从 builder 阶段复制构建产物
COPY --from=builder /app/doge ./doge
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/shims ./shims
COPY --from=builder /app/package.json ./package.json

# 设置权限
RUN chown -R dogeuser:doge /app

# 切换到非 root 用户
USER dogeuser

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ./doge --version || exit 1

# 入口点
ENTRYPOINT ["./doge"]
CMD ["--help"]
