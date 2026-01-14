# AI-Tools-Backend 项目上下文文档

> **重要提示**：此文档是 AI 助手理解项目的核心参考。在进行任何开发任务时，AI 必须先阅读此文档，并在完成功能开发后更新相关章节。

---

## 一、产品需求概述

### 1.1 产品定位
"喵想"是一个面向创作者的 AI 视频创作平台，帮助用户通过 AI 技术快速将创意转化为动画视频。目标用户包括：
- 短视频创作者
- 动画爱好者
- 内容营销人员
- 独立创作者

### 1.2 核心价值主张
- **降低创作门槛**：无需专业动画技能，通过文字描述即可生成视频
- **提升创作效率**：AI 辅助生成分镜、图片、视频，大幅缩短制作周期
- **保持创作控制**：支持多版本生成、编辑修改，让用户掌控最终效果

### 1.3 核心功能模块

#### 1.3.1 用户系统
- **注册/登录**：邮箱验证码注册，JWT 认证
- **用户中心**：个人信息管理、余额查看、交易记录
- **邀请系统**：邀请码机制，邀请好友获得奖励
- **兑换码**：支持兑换码充值代币

#### 1.3.2 剧本管理
- **剧本**：创作项目的顶层容器，包含标题、提示词、内容
- **剧集**：剧本下的章节单元，支持多集创作
- **分镜**：剧集下的场景单元，是视频生成的基本单位

#### 1.3.3 分镜视频生成（核心功能）
- **分镜描述**：用户编写分镜脚本（文字描述场景内容）
- **参考图**：可上传参考图片引导视频风格
- **视频生成**：调用 Sora2 API 生成 10s/15s 视频
- **分镜池**：每个分镜支持生成多个视频版本（Variant）
- **版本管理**：选择激活版本、删除不满意的版本
- **视频编辑（Remix）**：基于已生成视频进行二次编辑

#### 1.3.4 分镜图生成
- **分镜图描述**：用户编写图片描述
- **参考图**：支持多张参考图
- **图片生成**：支持多种 AI 模型（Nano Banana 2、豆包）
- **图片池**：每个分镜图支持生成多个图片版本
- **比例选择**：支持 16:9、4:3、1:1 等比例

#### 1.3.5 资产管理
- **资产类型**：角色、场景、物品三类设计资产
- **设计稿生成**：AI 生成角色设计稿（多角度、表情、动作）
- **提示词模板**：内置角色/场景/物品专业提示词模板
- **参考图管理**：支持上传多张参考图
- **设计稿编辑**：基于已生成图片进行 AI 编辑修改

#### 1.3.6 Sora2角色视频生成
- **角色管理**：创建、编辑、删除角色
- **角色设定**：输入角色姓名、角色设定描述
- **参考图**：支持上传1张参考图或关联资产图片
- **视频生成**：调用 Sora2 API 生成角色动态视频
- **提示词模板**：内置角色视频专业提示词模板
- **视频预览**：实时预览生成的角色视频

> 更新于 2026-01-12：新增 Sora2 角色视频生成功能

#### 1.3.7 代币系统
- **代币消耗**：
  - 视频生成：3 代币/次
  - 图片生成（Nano Banana 2）：4 代币/次
  - 图片生成（豆包）：2 代币/次
- **余额管理**：实时扣除、失败退款
- **交易记录**：完整的消费/充值/退款记录

### 1.4 用户使用流程

```
1. 注册登录 → 获得初始代币
2. 创建剧本 → 设置剧本标题
3. 创建剧集 → 规划故事章节
4. 创建资产（可选）→ 生成角色/场景设计稿
5. 创建分镜 → 编写分镜脚本、上传参考图
6. 生成视频 → AI 生成分镜视频
7. 版本选择 → 从分镜池选择满意的版本
8. 视频编辑（可选）→ 对视频进行 Remix 修改
9. 批量下载 → 导出所有分镜视频
```

### 1.5 业务规则

#### 生成限制
- 视频时长：10 秒或 15 秒
- 视频比例：16:9（横版）或 9:16（竖版）
- 图片比例：1:1、4:3、16:9
- 验证码有效期：10 分钟
- 验证码发送间隔：60 秒

#### 状态流转
```
分镜/图片状态：pending → queued → generating → completed/failed
```

#### 并发控制
- 余额扣除使用悲观锁防止超扣
- 视频生成后端独立轮询，不依赖前端

---

## 二、技术架构

### 2.1 项目定位
这是"喵想"AI 视频创作平台的后端服务，提供：
- 用户认证与余额管理
- 剧本/剧集/分镜的完整 CRUD
- AI 图片生成（角色、场景、物品设计稿）
- AI 视频生成（Sora2 API 集成）
- 资产管理系统

### 2.2 技术栈
- **运行时**: Node.js 20+
- **框架**: Express 4
- **语言**: TypeScript 5
- **ORM**: Prisma + PostgreSQL
- **验证**: Zod
- **AI SDK**: OpenAI SDK（兼容 API）
- **认证**: JWT + bcryptjs

---

## 三、目录结构

```
AI-Tools-Backend/
├── src/
│   ├── index.ts              # 应用入口，路由注册
│   ├── config/               # 配置文件
│   │   └── prompts.ts        # 提示词模板配置
│   ├── routes/               # API 路由
│   │   ├── auth.ts           # 认证（注册/登录/验证码）
│   │   ├── config.ts         # 配置接口（提示词模板列表）
│   │   ├── scripts.ts        # 剧本/剧集/分镜/副本 CRUD
│   │   ├── images.ts         # 图片生成（资产设计稿、分镜图）
│   │   ├── videos.ts         # 视频生成（Sora2 API）
│   │   ├── assets.ts         # 资产管理
│   │   ├── characters.ts     # 角色管理
│   │   └── upload.ts         # 文件上传（ImgBB）
│   ├── lib/                  # 工具库
│   │   ├── prisma.ts         # Prisma 客户端
│   │   ├── ai.ts             # OpenAI SDK 封装
│   │   ├── balance.ts        # 余额扣除/退款（带事务锁）
│   │   ├── email.ts          # 邮件发送
│   │   ├── prompts.ts        # 提示词配置读取工具
│   │   └── videoStatusPoller.ts  # 视频状态轮询服务（支持分镜视频和角色视频）
│   └── middleware/           # 中间件
│       ├── auth.ts           # JWT 认证
│       ├── errorHandler.ts   # 错误处理
│       └── modelValidator.ts # AI 模型白名单
├── prisma/
│   ├── schema.prisma         # 数据库模型定义
│   └── seed-admin.ts         # 管理员种子数据
├── docker-compose.yml        # 生产环境 Docker
├── docker-compose.dev.yml    # 开发环境 Docker
└── package.json
```

---

## 四、数据库模型

### 4.1 核心模型关系
```
User (用户)
  └── BalanceRecord (余额记录)

Script (剧本)
  ├── Episode (剧集)
  │   ├── Storyboard (分镜-视频)
  │   │   └── StoryboardVariant (视频副本)
  │   └── StoryboardImage (分镜-图片)
  │       └── ImageVariant (图片副本)
  ├── Asset (资产：角色/场景/物品)
  └── Character (Sora2角色)

VerificationCode (邮箱验证码)
```

### 4.2 关键字段说明

**User**
- `balance`: 代币余额，用于消费 AI 生成服务

**Script**
- `currentPhase`: 当前阶段 (`storyboard` | `video`)

**Storyboard / StoryboardImage**
- `referenceImageUrls`: 参考图 URL 数组
- `activeVariantId`: 当前选中的副本 ID
- `status`: `pending` | `queued` | `generating` | `completed` | `failed`

**StoryboardVariant / ImageVariant**
- `taskId`: AI API 任务 ID，用于状态轮询
- `progress`: 生成进度百分比
- `startedAt`: 生成开始时间
- `finishedAt`: 生成结束时间（完成或失败）
- `videoUrl` / `imageUrl`: 生成结果 URL

> 更新于 2026-01-14：新增 startedAt、finishedAt 字段，记录生成任务的开始和结束时间

**Character**
- `name`: 角色姓名
- `description`: 角色设定描述
- `referenceImageUrl`: 参考图 URL（1张）
- `videoUrl`: 生成的角色视频 URL
- `taskId`: Sora2 任务 ID，用于状态轮询
- `status`: `pending` | `queued` | `generating` | `completed` | `failed`
- `soraCharacterId`: Sora2 角色 ID（ch_xxx），用于多视频角色一致性
- `soraUsername`: Sora2 用户名
- `soraPermalink`: Sora2 角色主页链接
- `soraProfilePicUrl`: Sora2 角色头像 URL

> 更新于 2026-01-13：新增 Sora2 角色注册字段，支持多视频角色一致性

---

## 五、API 端点清单

### 5.1 认证 `/api/auth`
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/send-code` | 发送邮箱验证码 | 否 |
| POST | `/register` | 用户注册 | 否 |
| POST | `/login` | 用户登录 | 否 |
| GET | `/me` | 获取当前用户信息 | 是 |
| GET | `/balance-records` | 获取余额变动记录 | 是 |

### 5.2 配置 `/api/config`
| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| GET | `/prompt-templates?category=video\|storyboardImage\|asset\|character` | 获取指定分类的提示词模板列表 | 否 |

> 更新于 2026-01-12：新增 character 分类

### 5.3 剧本 `/api/scripts`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有剧本 |
| GET | `/:id` | 获取单个剧本详情 |
| POST | `/` | 创建剧本 |
| PUT | `/:id` | 更新剧本 |
| DELETE | `/:id` | 删除剧本 |
| POST | `/batch-delete` | 批量删除剧本 |

### 5.4 剧集 `/api/scripts/:scriptId/episodes`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/` | 创建剧集 |
| PUT | `/:episodeId` | 更新剧集 |
| DELETE | `/:episodeId` | 删除剧集 |

### 5.5 分镜（视频）`/api/scripts/:scriptId/episodes/:episodeId/storyboards`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/` | 创建分镜 |
| PUT | `/:id` | 更新分镜 |
| DELETE | `/:id` | 删除分镜 |
| DELETE | `/` | 清空所有分镜 |
| PUT | `/../storyboards-reorder` | 重新排序 |

### 5.6 分镜副本（视频）`.../storyboards/:id/variants`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/:variantId` | 获取副本详情 |
| POST | `/` | 创建副本 |
| PUT | `/:variantId` | 更新副本 |
| DELETE | `/:variantId` | 删除副本 |
| PUT | `/../active-variant` | 设置激活副本 |

### 5.7 分镜图（图片）`/api/scripts/:scriptId/episodes/:episodeId/storyboard-images`
与分镜（视频）结构相同，路径替换为 `storyboard-images`

### 5.8 图片生成 `/api/images`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/asset-design` | 生成资产设计稿 |
| POST | `/storyboard-image` | 生成分镜图 |
| POST | `/edits` | 编辑现有图片 |

### 5.9 视频生成 `/api/videos`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/generations` | 生成视频 |
| GET | `/generations/:taskId` | 查询视频状态 |
| POST | `/storyboard-to-video` | 分镜生成视频 |
| POST | `/character-to-video` | 角色生成视频 |
| POST | `/register-sora-character` | 注册 Sora2 角色（用于多视频角色一致性） |
| POST | `/remix/:taskId` | 视频混剪 |
| POST | `/remix/:taskId/variant` | 混剪并创建副本 |
| GET | `/capture-frame` | 截取视频帧 |

> 更新于 2026-01-13：新增 `/register-sora-character` 角色注册接口

### 5.10 资产 `/api/scripts/:scriptId/assets`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有资产 |
| POST | `/` | 创建资产 |
| PATCH | `/:assetId` | 更新资产 |
| DELETE | `/:assetId` | 删除资产 |

### 5.11 角色 `/api/scripts/:scriptId/characters`
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 获取所有角色 |
| POST | `/` | 创建角色 |
| PATCH | `/:characterId` | 更新角色 |
| DELETE | `/:characterId` | 删除角色 |

> 更新于 2026-01-12：新增角色管理 API

### 5.12 上传 `/api/upload`
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/image` | 上传图片到 ImgBB |

---

## 六、核心业务逻辑

### 6.1 代币消耗规则
```typescript
TOKEN_COSTS = {
  IMAGE_BANANA: 4,      // Nano Banana 2 模型
  IMAGE_DOUBAO: 2,      // 豆包模型
  VIDEO_STORYBOARD: 3,  // 分镜视频生成
}
```

### 6.2 余额扣除流程
1. 使用 Prisma 事务 + `FOR UPDATE` 悲观锁
2. 检查余额是否充足
3. 扣除余额并创建 `BalanceRecord`
4. 如果生成失败，调用 `refundBalance` 退款

### 6.3 视频生成流程
```
1. 前端调用 POST /api/videos/storyboard-to-video
2. 后端扣除代币
3. 后端调用 Sora2 API，获取 taskId
4. 后端保存 taskId 到 StoryboardVariant
5. 后端启动轮询（videoStatusPoller.ts）
6. 轮询每 5 秒查询 Sora2 API 状态
7. 状态更新写入数据库
8. 完成后保存 videoUrl，停止轮询
```

### 6.4 角色视频生成流程
```
1. 前端调用 POST /api/videos/character-to-video
2. 后端扣除代币（3代币）
3. 后端调用 Sora2 API，获取 taskId
4. 后端保存 taskId 到 Character
5. 后端启动轮询（videoStatusPoller.ts，type='character'）
6. 轮询每 5 秒查询 Sora2 API 状态
7. 状态更新写入 Character 表
8. 完成后保存 videoUrl，停止轮询
```

### 6.5 Sora2 角色注册流程（多视频角色一致性）
```
1. 角色视频生成完成后，用户点击"注册角色"按钮
2. 弹出视频预览弹窗，用户选择角色出现的时间范围（1-3秒）
3. 前端调用 POST /api/videos/register-sora-character
4. 后端从 Character 获取 taskId
5. 后端调用 Sora2 API: POST /sora/v1/characters { from_task, timestamps }
6. 保存返回的 soraCharacterId、soraUsername、soraPermalink、soraProfilePicUrl
7. 注册成功后，角色卡片显示"已认证"状态
```

> 更新于 2026-01-13：新增 Sora2 角色注册流程

### 6.6 图片生成流程
```
1. 前端调用 POST /api/images/asset-design 或 /storyboard-image
2. 后端扣除代币
3. 后端根据 promptTemplate 拼接提示词
4. 后端调用 AI API 生成图片
5. 成功：保存 imageUrl；失败：退款
```

### 6.5 提示词配置
提示词模板已从代码中提取到独立配置文件 `src/config/prompts.json`，按功能分类：
- `video`: 分镜视频提示词模板
- `storyboardImage`: 分镜图提示词模板
- `asset`: 资产设计稿提示词模板

每个模板包含 `id`、`label`、`description`、`prompt` 字段。

前端通过 `GET /api/config/prompt-templates?category=xxx` 获取指定分类的模板列表，动态渲染下拉选项。

> 更新于 2026-01-11：提示词模板从代码硬编码改为 JSON 配置文件，按 video/storyboardImage/asset 分类

---

## 七、中间件说明

### 7.1 authMiddleware
- 验证 `Authorization: Bearer <token>` 头
- 解析 JWT，将 `userId` 注入 `req.userId`

### 7.2 errorHandler
- 捕获 Zod 验证错误，返回友好提示
- 捕获 Prisma 错误，返回通用错误
- 记录错误日志

### 7.3 modelValidator
- 验证请求中的 AI 模型是否在白名单内
- 防止使用未授权的模型

---

## 八、环境变量

```env
PORT=3000
DATABASE_URL=postgresql://...
AI_API_BASE_URL=https://...
AI_API_KEY=sk-...
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=your-secret-key
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=...
SMTP_PASS=...
IMGBB_API_KEY=...
VIDEO_POLL_INTERVAL=5000
VIDEO_MAX_POLL_DURATION=3600000
```

---

## 九、开发规范

### 9.1 路由规范
- 使用 RESTful 风格
- 使用 Zod 进行请求体验证
- 统一返回格式：`{ success: true, data: ... }` 或 `{ error: '...' }`

### 9.2 错误处理
- 业务错误使用 `res.status(400).json({ error: '...' })`
- 未知错误传递给 `next(error)`，由 errorHandler 处理

### 9.3 数据库操作
- 涉及余额的操作必须使用事务
- 级联删除使用 Prisma 的 `onDelete: Cascade`

---

## 十、AI 助手维护指南

### 10.1 文档更新时机
- **新增 API 端点**：更新第五章 API 端点清单
- **新增数据模型**：更新第四章数据库模型
- **修改业务逻辑**：更新第六章核心业务逻辑
- **新增环境变量**：更新第八章环境变量
- **新增中间件**：更新第七章中间件说明
- **新增产品功能**：更新第一章产品需求概述

### 10.2 更新格式
在更新时，请在相关章节末尾添加：
```
> 更新于 YYYY-MM-DD：简要说明变更内容
```

### 10.3 注意事项
- 保持文档与代码同步
- 使用中文编写
- 保持格式一致性
- 重要变更需要更新版本号

---

## 十一、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2026-01-11 | 初始版本，包含完整产品需求描述 |
| 1.0.1 | 2026-01-11 | 提示词模板从代码硬编码改为 JSON 配置文件，按 video/storyboardImage/asset 分类 |
| 1.0.2 | 2026-01-12 | 新增 Sora2 角色视频生成功能：Character 模型、角色 CRUD API、角色视频生成 API、character 提示词分类 |
| 1.0.3 | 2026-01-13 | 新增 Sora2 角色注册功能：Character 模型新增 sora* 字段、/register-sora-character API |
