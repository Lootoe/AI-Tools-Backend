# AI Tools Backend

AI 工具平台后端 API 服务 - 轻量版

## 技术栈

- Node.js + Express
- TypeScript
- OpenAI SDK (兼容 API)

## 项目结构

```
src/
├── index.ts          # 入口文件
├── lib/
│   └── ai.ts         # AI 服务封装
├── middleware/
│   └── errorHandler.ts
└── routes/
    ├── chat.ts       # AI 聊天（流式/非流式）
    └── models.ts     # 模型列表
```

## 快速开始

### 1. 安装依赖

```bash
cd AI-Tools-Backend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 AI API 密钥：
```
AI_API_KEY=你的API密钥
AI_API_BASE_URL=https://api.openai.com
```

### 3. 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 或生产模式
npm run build
npm start
```

服务启动后访问 http://localhost:3000/health 验证

## API 接口

### 聊天
- `POST /api/chat/completions` - 非流式聊天
- `POST /api/chat/completions/stream` - 流式聊天 (SSE)

### 模型
- `GET /api/models` - 获取可用模型列表

## 请求示例

### 非流式聊天

```bash
curl -X POST http://localhost:3000/api/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

### 流式聊天

```bash
curl -X POST http://localhost:3000/api/chat/completions/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

## Docker 部署

```bash
docker-compose up -d
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 3000 |
| NODE_ENV | 环境 | development |
| AI_API_BASE_URL | AI API 地址 | - |
| AI_API_KEY | AI API 密钥 | - |
| CORS_ORIGIN | 允许的前端域名 | http://localhost:5173 |
| RATE_LIMIT_WINDOW_MS | 限流窗口(ms) | 60000 |
| RATE_LIMIT_MAX_REQUESTS | 窗口内最大请求数 | 100 |
