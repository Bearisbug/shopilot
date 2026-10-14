# Shopilot 镜像：Web、Worker、数据库迁移共用一份，由 deploy/compose.yaml 的 command 区分角色。
# Worker 与迁移脚本用 tsx 直接跑 TypeScript，所以运行层保留完整依赖（含 devDependencies）。
FROM node:26-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
# 上传、发票、导出包放在挂载卷 /data；先建好目录，命名卷首次挂载时沿用这里的属主
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
# exec 形式直接起 node，Next 以 PID 1 收到 SIGTERM
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
