# syntax=docker/dockerfile:1.7
# 多架构镜像：linux/amd64、linux/arm64（群晖 / 威联通 / 树莓派 / ARM VPS）
ARG NODE_VERSION=24

# ---------- 构建 ----------
FROM node:${NODE_VERSION}-alpine AS build
# better-sqlite3 在没有对应预编译包的架构上需要本地编译
RUN apk add --no-cache python3 make g++ \
 && npm install -g pnpm@11.25.0
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 # 按锁文件只导出服务端的生产依赖（含为当前架构构建好的原生模块）
 && pnpm --filter @invest-insight/server deploy --prod --legacy /out

# ---------- 运行 ----------
FROM node:${NODE_VERSION}-alpine
ARG APP_VERSION=dev
RUN apk add --no-cache tini su-exec tzdata

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data \
    STATIC_DIR=/app/public \
    MIGRATIONS_DIR=/app/drizzle \
    TZ=Asia/Shanghai \
    PUID=1000 \
    PGID=1000

WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/server/drizzle ./drizzle
COPY --from=build /src/apps/web/dist ./public
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/ii /usr/local/bin/ii
RUN chmod 755 /usr/local/bin/entrypoint.sh /usr/local/bin/ii

VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

LABEL org.opencontainers.image.title="Invest Insight" \
      org.opencontainers.image.description="自托管的个人资产配置、调整与追踪工具" \
      org.opencontainers.image.version="${APP_VERSION}"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "/app/dist/main.js"]
