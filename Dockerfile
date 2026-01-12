# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

# 生成 Prisma Client
RUN npx prisma generate

RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 安装 ffmpeg（用于视频截屏功能）
RUN apk add --no-cache ffmpeg

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

USER expressjs

EXPOSE 3000

# 启动时自动执行数据库迁移
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
