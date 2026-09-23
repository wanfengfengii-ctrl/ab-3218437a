# 单镜像双用途：
#   - 默认命令：托管已构建的 dist/ 静态站点（带 /health）
#   - verify 服务：覆盖命令为 scripts/verify.sh，跑测试/类型检查/构建/冒烟后退出
FROM node:22-alpine

WORKDIR /app

# 先装依赖，利用层缓存
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 源码与构建
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4173
EXPOSE 4173

# 容器级健康检查（Compose 亦引用）
HEALTHCHECK --interval=10s --timeout=4s --start-period=6s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "scripts/serve.mjs"]
