# AI Tools Backend

AI 视频创作工具平台后端 API 服务，提供剧本管理、图片生成、视频生成等功能。

## 技术栈

- Node.js 20+ / Express 4
- TypeScript 5
- Prisma ORM + PostgreSQL
- OpenAI SDK（兼容 API）
- Zod 数据验证

## 项目结构

```
src/
├── index.ts              # 入口文件
├── lib/
│   ├── ai.ts             # AI 服务封装
│   ├── prisma.ts         # Prisma 客户端
│   └── videoStatusPoller.ts  # 视频状态轮询
├── middleware/
│   ├── errorHandler.ts   # 错误处理
│   └── modelValidator.ts # 模型验证
└── routes/
    ├── scripts.ts        # 剧本/剧集/分镜/资产管理
    ├── images.ts         # 图片生成
    ├── videos.ts         # 视频生成
    └── upload.ts         # 文件上传
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 服务配置
PORT=3000
NODE_ENV=development

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/ai_tools

# AI API
AI_API_BASE_URL=https://api.openai.com
AI_API_KEY=your-api-key

# CORS
CORS_ORIGIN=http://localhost:5173

# 限流
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. 初始化数据库

```bash
npx prisma generate
npx prisma db push
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build && npm start
```

服务启动后访问 http://localhost:3000/health 验证

## API 接口

### 健康检查
- `GET /health` - 服务健康状态

### 剧本管理 `/api/scripts`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有剧本 |
| GET | `/:id` | 获取单个剧本详情 |
| POST | `/` | 创建剧本 |
| PUT | `/:id` | 更新剧本 |
| DELETE | `/:id` | 删除剧本 |
| POST | `/batch-delete` | 批量删除剧本 |

### 剧集管理 `/api/scripts/:scriptId/episodes`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/` | 创建剧集 |
| PUT | `/:episodeId` | 更新剧集 |
| DELETE | `/:episodeId` | 删除剧集 |

### 分镜管理 `/api/scripts/:scriptId/episodes/:episodeId/storyboards`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/` | 创建分镜 |
| PUT | `/:storyboardId` | 更新分镜 |
| DELETE | `/:storyboardId` | 删除分镜 |
| DELETE | `/` | 删除剧集所有分镜 |
| PUT | `-reorder` | 重排分镜顺序 |

### 分镜副本 `/api/scripts/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/:variantId` | 获取副本详情 |
| POST | `/` | 创建副本 |
| PUT | `/:variantId` | 更新副本 |
| DELETE | `/:variantId` | 删除副本 |
| PUT | `../active-variant` | 设置当前副本 |

### 资产管理
角色、场景、物品接口结构相同：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/:scriptId/characters` | 获取角色列表 |
| POST | `/:scriptId/characters` | 创建角色 |
| PUT | `/:scriptId/characters/:id` | 更新角色 |
| DELETE | `/:scriptId/characters/:id` | 删除角色 |

> 场景路径为 `/scenes`，物品路径为 `/props`

### 图片生成 `/api/images`
- `POST /generate` - 生成图片

### 视频生成 `/api/videos`
- `POST /generate` - 生成视频
- `GET /status/:taskId` - 查询任务状态

### 文件上传 `/api/upload`
- `POST /` - 上传文件

## Docker 部署

```bash
# 开发环境
docker-compose -f docker-compose.dev.yml up -d

# 生产环境
docker-compose up -d
```

## 数据模型

- **Script** - 剧本（包含多个剧集）
- **Episode** - 剧集（包含多个分镜）
- **Storyboard** - 分镜（包含多个副本）
- **StoryboardVariant** - 分镜副本（视频生成结果）
- **Character** - 角色资产
- **Scene** - 场景资产
- **Prop** - 物品资产

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 3000 |
| NODE_ENV | 环境 | development |
| DATABASE_URL | PostgreSQL 连接串 | - |
| AI_API_BASE_URL | AI API 地址 | - |
| AI_API_KEY | AI API 密钥 | - |
| CORS_ORIGIN | 允许的前端域名 | http://localhost:5173 |
| RATE_LIMIT_WINDOW_MS | 限流窗口(ms) | 60000 |
| RATE_LIMIT_MAX_REQUESTS | 窗口内最大请求数 | 100 |

## License

MIT
