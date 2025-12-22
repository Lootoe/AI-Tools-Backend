import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const videosRouter = Router();

// Sora2 API 配置
const SORA2_API_BASE = process.env.AI_API_BASE_URL || '';

// 视频生成请求验证
const videoGenerationSchema = z.object({
  prompt: z.string().min(1, '提示词不能为空'),
  model: z.literal('sora-2').default('sora-2'),
  aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'),
  duration: z.enum(['10', '15']).default('10'),
  private: z.boolean().default(true),
  reference_image: z.string().optional(), // 参考图 URL
});

// Sora2 视频生成
videosRouter.post('/generations', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { prompt, model, aspect_ratio, duration, private: isPrivate, reference_image } = videoGenerationSchema.parse(req.body);

    console.log('\n========== Sora2 视频生成请求 ==========');
    console.log('请求参数:', JSON.stringify({ prompt, model, aspect_ratio, duration, private: isPrivate, reference_image }, null, 2));

    // 构建请求体
    const requestBody: Record<string, unknown> = {
      prompt,
      model,
      aspect_ratio,
      duration,
      private: isPrivate,
    };

    // 如果有参考图，添加到请求中
    if (reference_image) {
      requestBody.reference_image = reference_image;
    }

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
    console.log('==========================================\n');

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

// 查询视频生成状态
// GET /v2/videos/generations/{task_id}
// status 枚举: NOT_START | IN_PROGRESS | SUCCESS | FAILURE
videosRouter.get('/generations/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { taskId } = req.params;

    console.log(`\n========== 查询视频任务状态: ${taskId} ==========`);

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
    console.log('任务状态:', JSON.stringify(data, null, 2));
    console.log('================================================\n');

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
