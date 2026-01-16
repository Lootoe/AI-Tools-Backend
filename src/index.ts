import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler.js';
import { modelValidator } from './middleware/modelValidator.js';
import { authMiddleware } from './middleware/auth.js';
import { uploadRouter } from './routes/upload.js';
import { imagesRouter } from './routes/images.js';
import { videosRouter } from './routes/videos.js';
import { scriptsRouter } from './routes/scripts.js';
import { authRouter } from './routes/auth.js';
import { assetsRouter } from './routes/assets.js';
import { charactersRouter } from './routes/characters.js';
import { canvasRouter } from './routes/canvas.js';
import { assetCategoriesRouter, savedAssetsRouter } from './routes/assetCategories.js';
import { resumePendingPolls, stopAllPolling } from './lib/videoStatusPoller.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS 配置：支持多个来源（逗号分隔）
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(o => o.trim());
app.use(cors({
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging - disabled
// if (process.env.NODE_ENV !== 'test') {
//   app.use(morgan('combined'));
// }

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 模型验证中间件（全局）
app.use('/api', modelValidator);

// API routes
// 认证路由不需要鉴权
app.use('/api/auth', authRouter);

// 以下路由需要鉴权
app.use('/api/upload', authMiddleware, uploadRouter);
app.use('/api/images', authMiddleware, imagesRouter);
app.use('/api/videos', authMiddleware, videosRouter);
app.use('/api/scripts', authMiddleware, scriptsRouter);
app.use('/api/scripts', authMiddleware, assetsRouter);
app.use('/api/scripts/:scriptId/characters', authMiddleware, charactersRouter);
app.use('/api/scripts/:scriptId/canvases', authMiddleware, canvasRouter);
app.use('/api/scripts/:scriptId/asset-categories', authMiddleware, assetCategoriesRouter);
app.use('/api/scripts/:scriptId/saved-assets', authMiddleware, savedAssetsRouter);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((_, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);

  // 启动时恢复未完成的视频轮询任务
  resumePendingPolls();
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在关闭...');
  stopAllPolling();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，正在关闭...');
  stopAllPolling();
  process.exit(0);
});

export default app;
