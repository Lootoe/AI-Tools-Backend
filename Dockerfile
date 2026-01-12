# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache openssl openssl-dev

COPY package*.json ./

RUN npm ci

COPY . .

# 生成 Prisma Client（包含正确的二进制文件）
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x
RUN npx prisma generate

RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 安装运行时依赖
RUN apk add --no-cache ffmpeg openssl

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# 复制 node_modules（包含 Prisma Client 和引擎）
COPY --from=builder /app/node_modules ./node_modules

# 设置目录权限
RUN chmod -R 755 /app/node_modules/.prisma

EXPOSE 3000

CMD ["node", "dist/index.js"]
