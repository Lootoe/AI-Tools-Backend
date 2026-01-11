import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { spawn } from 'child_process';
import { startPolling } from '../lib/videoStatusPoller.js';
import { deductBalance, refundBalance, TOKEN_COSTS } from '../lib/balance.js';
import { AuthRequest } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getPromptById } from '../lib/prompts.js';

export const videosRouter = Router();

// Sora2 API 配置
const SORA2_API_BASE = process.env.AI_API_BASE_URL || '';

// 视频生成请求验证
const videoGenerationSchema = z.object({
  prompt: z.string().min(1, '提示词不能为空'),
  model: z.literal('sora-2').default('sora-2'),
  aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'),
  duration: z.enum(['10', '15']).default('10'),
  private: z.boolean().default(false),
  reference_image: z.string().optional(), // 参考图 URL
});

// Sora2 视频生成
videosRouter.post('/generations', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { prompt, model, aspect_ratio, duration, reference_image } = videoGenerationSchema.parse(req.body);

    // 构建请求体（强制 private 为 false）
    const requestBody: Record<string, unknown> = {
      prompt,
      model,
      aspect_ratio,
      duration,
      private: false,
    };

    // 如果有参考图，添加到请求中
    if (reference_image) {
      requestBody.reference_image = reference_image;
    }

    console.log('\n========== Sora2 视频生成 ==========');
    console.log('发送请求体:', JSON.stringify(requestBody, null, 2));

    // 调用 Sora2 API
    const response = await fetch(`${SORA2_API_BASE}/v2/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Sora2 API 错误:', errorText);
      throw new Error(`Sora2 API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    const duration_ms = Date.now() - startTime;
    console.log(`响应耗时: ${duration_ms}ms`);
    console.log('响应结果:', JSON.stringify(data, null, 2));
    console.log('====================================\n');

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`\n========== Sora2 视频生成错误 (${duration_ms}ms) ==========`);
    console.error('错误信息:', error);
    console.error('====================================================\n');
    next(error);
  }
});

// 查询视频生成状态（前端轮询用，不触发后端轮询）
// GET /v2/videos/generations/{task_id}
// status 枚举: NOT_START | IN_PROGRESS | SUCCESS | FAILURE
videosRouter.get('/generations/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;

    const response = await fetch(`${SORA2_API_BASE}/v2/videos/generations/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('查询状态失败:', errorText);
      throw new Error(`查询状态失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// 分镜生成视频请求验证
const storyboardToVideoSchema = z.object({
  prompt: z.string().min(1, '分镜脚本不能为空'),
  promptTemplateId: z.string().default('video-none'),
  model: z.literal('sora-2').default('sora-2'),
  aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'),
  duration: z.enum(['10', '15']).default('15'),
  private: z.boolean().default(false),
  reference_images: z.array(z.string()).optional(), // 参考图URL数组
  first_frame_url: z.string().optional(),           // 首帧图片URL
  variantId: z.string().optional(), // 分镜副本ID，用于后端轮询更新状态
});

// 分镜生成视频
videosRouter.post('/storyboard-to-video', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const userId = req.userId!;
  const tokenCost = TOKEN_COSTS.VIDEO_STORYBOARD;

  try {
    const { prompt, promptTemplateId, model, aspect_ratio, duration, reference_images, first_frame_url, variantId } = storyboardToVideoSchema.parse(req.body);

    // 扣除代币
    const deductResult = await deductBalance(userId, tokenCost, '生成分镜视频');
    if (!deductResult.success) {
      return res.status(400).json({ error: deductResult.error });
    }

    // 如果有 variantId，更新 variant 状态为 generating，并记录用户ID和代币消耗（用于失败时返还）
    if (variantId) {
      await prisma.storyboardVariant.update({
        where: { id: variantId },
        data: { userId, tokenCost, status: 'generating', progress: '0' },
      }).catch(() => { /* 静默失败 */ });
    }

    // 构建最终的 images 数组：首帧放第0位，然后是参考图
    const finalImages: string[] = [];

    // 首帧图片放在第0位
    if (first_frame_url) {
      finalImages.push(first_frame_url);
    }

    // 添加原有的参考图
    if (reference_images && reference_images.length > 0) {
      finalImages.push(...reference_images);
    }

    // 构建最终的 prompt
    let finalPrompt = prompt;

    // 如果有首帧图片且选择了视频模板，在提示词最开头添加首帧说明
    if (first_frame_url && promptTemplateId !== 'video-none') {
      const videoTemplate = getPromptById('video', promptTemplateId);
      if (videoTemplate) {
        finalPrompt = videoTemplate + '\n\n' + prompt;
      }
    }

    const requestBody: Record<string, unknown> = {
      prompt: finalPrompt,
      model,
      aspect_ratio,
      duration,
      private: false, // 强制为 false
    };

    // 如果有参考图，添加到请求中（Sora2 API 使用 images 字段）
    if (finalImages.length > 0) {
      requestBody.images = finalImages;
    }

    console.log('\n========== 分镜生成视频 ==========');
    console.log('发送请求体:', JSON.stringify(requestBody, null, 2));

    // 调用 Sora2 API
    const response = await fetch(`${SORA2_API_BASE}/v2/videos/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('分镜生成视频 API 错误:', errorText);
      // API 调用失败，返还代币
      await refundBalance(userId, tokenCost, '分镜视频生成失败，代币已返还');
      throw new Error(`分镜生成视频 API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { task_id?: string; id?: string;[key: string]: unknown };

    const duration_ms = Date.now() - startTime;
    console.log(`响应耗时: ${duration_ms}ms`);
    console.log('响应结果:', JSON.stringify(data, null, 2));
    console.log('==================================\n');

    // 如果有 variantId 且获取到 taskId，保存 taskId 到数据库并启动后端轮询
    const taskId = data.task_id || data.id;
    if (variantId && taskId) {
      // 先保存 taskId 到数据库，避免前端刷新导致 taskId 丢失
      try {
        await prisma.storyboardVariant.update({
          where: { id: variantId },
          data: { taskId },
        });
        console.log(`已保存 taskId ${taskId} 到 variant ${variantId}`);
      } catch (err) {
        console.error('保存 taskId 失败:', err);
      }
      startPolling(taskId, variantId);
    }

    res.json({
      success: true,
      data,
      balance: deductResult.balance,
    });
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`\n========== 分镜生成视频错误 (${duration_ms}ms) ==========`);
    console.error('错误信息:', error);
    console.error('====================================================\n');
    next(error);
  }
});

// 获取当前轮询状态（调试用）
import { getPollingStatus } from '../lib/videoStatusPoller.js';

videosRouter.get('/polling/status', async (_req: Request, res: Response) => {
  const status = getPollingStatus();
  res.json({
    success: true,
    data: {
      activePolls: status.length,
      tasks: status,
    },
  });
});

// 视频 Remix 请求验证
const videoRemixSchema = z.object({
  prompt: z.string().min(1, '编辑脚本不能为空'),
});

// 视频 Remix - 基于已生成的视频进行编辑，生成新副本
// POST /v1/videos/{task_id}/remix
videosRouter.post('/remix/:taskId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const userId = req.userId!;
  const tokenCost = TOKEN_COSTS.VIDEO_STORYBOARD;

  try {
    const { taskId } = req.params;
    const { prompt } = videoRemixSchema.parse(req.body);

    // 扣除代币
    const deductResult = await deductBalance(userId, tokenCost, '编辑分镜视频');
    if (!deductResult.success) {
      return res.status(400).json({ error: deductResult.error });
    }

    console.log('\n========== 视频 Remix ==========');
    console.log('原任务ID:', taskId);
    console.log('编辑脚本:', prompt);

    // 调用 Sora2 Remix API
    const response = await fetch(`${SORA2_API_BASE}/v1/videos/${taskId}/remix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('视频 Remix API 错误:', errorText);
      // API 调用失败，返还代币
      await refundBalance(userId, tokenCost, '视频编辑失败，代币已返还');
      throw new Error(`视频 Remix API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { task_id?: string; id?: string;[key: string]: unknown };

    const duration_ms = Date.now() - startTime;
    console.log(`响应耗时: ${duration_ms}ms`);
    console.log('响应结果:', JSON.stringify(data, null, 2));
    console.log('================================\n');

    res.json({
      success: true,
      data,
      balance: deductResult.balance,
    });
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`\n========== 视频 Remix 错误 (${duration_ms}ms) ==========`);
    console.error('错误信息:', error);
    console.error('================================================\n');
    next(error);
  }
});

// 视频 Remix 并创建新副本
// POST /remix/:taskId/variant
videosRouter.post('/remix/:taskId/variant', async (req: AuthRequest, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const userId = req.userId!;
  const tokenCost = TOKEN_COSTS.VIDEO_STORYBOARD;

  try {
    const { taskId } = req.params;
    const { prompt, variantId } = z.object({
      prompt: z.string().min(1, '编辑脚本不能为空'),
      variantId: z.string().min(1, '副本ID不能为空'),
    }).parse(req.body);

    // 扣除代币
    const deductResult = await deductBalance(userId, tokenCost, '编辑分镜视频');
    if (!deductResult.success) {
      return res.status(400).json({ error: deductResult.error });
    }

    // 更新 variant 状态为 generating
    if (variantId) {
      await prisma.storyboardVariant.update({
        where: { id: variantId },
        data: { userId, tokenCost, status: 'generating', progress: '0' },
      }).catch(() => { /* 静默失败 */ });
    }

    console.log('\n========== 视频 Remix (创建副本) ==========');
    console.log('原任务ID:', taskId);
    console.log('编辑脚本:', prompt);
    console.log('新副本ID:', variantId);

    // 调用 Sora2 Remix API
    const response = await fetch(`${SORA2_API_BASE}/v1/videos/${taskId}/remix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('视频 Remix API 错误:', errorText);
      // API 调用失败，返还代币
      await refundBalance(userId, tokenCost, '视频编辑失败，代币已返还');
      // 更新 variant 状态为失败
      if (variantId) {
        await prisma.storyboardVariant.update({
          where: { id: variantId },
          data: { status: 'failed' },
        }).catch(() => { /* 静默失败 */ });
      }
      throw new Error(`视频 Remix API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json() as { task_id?: string; id?: string;[key: string]: unknown };

    const duration_ms = Date.now() - startTime;
    console.log(`响应耗时: ${duration_ms}ms`);
    console.log('响应结果:', JSON.stringify(data, null, 2));
    console.log('==========================================\n');

    // 如果获取到新的 taskId，保存并启动轮询
    const newTaskId = data.task_id || data.id;
    if (variantId && newTaskId) {
      try {
        await prisma.storyboardVariant.update({
          where: { id: variantId },
          data: { taskId: newTaskId },
        });
        console.log(`已保存新 taskId ${newTaskId} 到 variant ${variantId}`);
      } catch (err) {
        console.error('保存 taskId 失败:', err);
      }
      startPolling(newTaskId, variantId);
    }

    res.json({
      success: true,
      data,
      balance: deductResult.balance,
    });
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`\n========== 视频 Remix 错误 (${duration_ms}ms) ==========`);
    console.error('错误信息:', error);
    console.error('================================================\n');
    next(error);
  }
});


// 视频截屏 - 使用 ffmpeg 提取指定时间点的帧，直接返回图片文件流
videosRouter.get('/capture-frame', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const videoUrl = req.query.url as string;
    const timestamp = parseFloat(req.query.t as string) || 0;

    if (!videoUrl) {
      return res.status(400).json({ error: '缺少视频URL参数' });
    }

    console.log('\n========== 视频截屏 ==========');
    console.log('视频URL:', videoUrl);
    console.log('时间戳:', timestamp, '秒');

    // 设置响应头
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="frame-${Date.now()}.png"`);

    // 使用 ffmpeg 从视频 URL 提取帧，直接流式输出
    const ffmpeg = spawn('ffmpeg', [
      '-ss', timestamp.toString(),
      '-i', videoUrl,
      '-vframes', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      'pipe:1',
    ]);

    // 直接将 ffmpeg 输出管道到响应
    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const message = data.toString();
      if (message.includes('Error') || message.includes('error')) {
        console.error('ffmpeg stderr:', message);
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('截屏成功');
      } else {
        console.error('ffmpeg 退出码:', code);
      }
      console.log('==============================\n');
    });

    ffmpeg.on('error', (err) => {
      console.error('ffmpeg 执行失败:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: `ffmpeg 执行失败: ${err.message}` });
      }
    });

    // 设置超时（30秒）
    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
      if (!res.headersSent) {
        res.status(504).json({ error: 'ffmpeg 截屏超时' });
      }
    }, 30000);

    res.on('finish', () => clearTimeout(timeout));
    res.on('close', () => {
      clearTimeout(timeout);
      ffmpeg.kill('SIGKILL');
    });
  } catch (error) {
    console.error('\n========== 视频截屏错误 ==========');
    console.error('错误信息:', error);
    console.error('==================================\n');
    next(error);
  }
});
