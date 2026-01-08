import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { startPolling } from '../lib/videoStatusPoller.js';

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
    const { prompt, model, aspect_ratio, duration, private: isPrivate, reference_image } = videoGenerationSchema.parse(req.body);

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

// 关联资产信息
const linkedAssetSchema = z.object({
  name: z.string(),
  imageUrl: z.string(),
});

const linkedAssetsSchema = z.object({
  characters: z.array(linkedAssetSchema).default([]),
  scenes: z.array(linkedAssetSchema).default([]),
  props: z.array(linkedAssetSchema).default([]),
});

// 分镜生成视频请求验证
const storyboardToVideoSchema = z.object({
  prompt: z.string().min(1, '分镜脚本不能为空'),
  model: z.literal('sora-2').default('sora-2'),
  aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'),
  duration: z.enum(['10', '15']).default('15'),
  private: z.boolean().default(false),
  reference_images: z.array(z.string()).optional(), // 参考图URL数组
  linked_assets: linkedAssetsSchema.optional(), // 关联资产信息
  variantId: z.string().optional(), // 分镜副本ID，用于后端轮询更新状态
});

// 构建参考图映射表文案
function buildReferenceMapPrompt(linkedAssets: z.infer<typeof linkedAssetsSchema>, startIndex: number): string {
  const characterMap: Record<string, string> = {};
  const sceneMap: Record<string, string> = {};
  const propMap: Record<string, string> = {};

  let currentIndex = startIndex;

  // 按角色、场景、物品的顺序处理
  linkedAssets.characters.forEach((asset) => {
    characterMap[asset.name] = `第${currentIndex}张参考图`;
    currentIndex++;
  });

  linkedAssets.scenes.forEach((asset) => {
    sceneMap[asset.name] = `第${currentIndex}张参考图`;
    currentIndex++;
  });

  linkedAssets.props.forEach((asset) => {
    propMap[asset.name] = `第${currentIndex}张参考图`;
    currentIndex++;
  });

  // 构建映射表字符串
  const mapParts: string[] = [];

  if (Object.keys(characterMap).length > 0) {
    const charEntries = Object.entries(characterMap).map(([name, ref]) => `${name}:${ref}`).join(',');
    mapParts.push(`角色设计:{${charEntries}}`);
  }

  if (Object.keys(sceneMap).length > 0) {
    const sceneEntries = Object.entries(sceneMap).map(([name, ref]) => `${name}:${ref}`).join(',');
    mapParts.push(`场景设计:{${sceneEntries}}`);
  }

  if (Object.keys(propMap).length > 0) {
    const propEntries = Object.entries(propMap).map(([name, ref]) => `${name}:${ref}`).join(',');
    mapParts.push(`物品设计:{${propEntries}}`);
  }

  if (mapParts.length === 0) {
    return '';
  }

  return `视频中涉及的角色、场景、物品，请参考参考图映射表。参考图映射表：[${mapParts.join(',')}]\n\n`;
}

// 分镜生成视频
videosRouter.post('/storyboard-to-video', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { prompt, model, aspect_ratio, duration, private: isPrivate, reference_images, linked_assets, variantId } = storyboardToVideoSchema.parse(req.body);

    // 构建最终的 images 数组：按角色、场景、物品的顺序添加关联资产图片
    const finalImages: string[] = [];

    // 先添加原有的参考图
    if (reference_images && reference_images.length > 0) {
      finalImages.push(...reference_images);
    }

    // 按角色、场景、物品的顺序添加关联资产图片
    if (linked_assets) {
      linked_assets.characters.forEach((asset) => {
        if (asset.imageUrl) finalImages.push(asset.imageUrl);
      });
      linked_assets.scenes.forEach((asset) => {
        if (asset.imageUrl) finalImages.push(asset.imageUrl);
      });
      linked_assets.props.forEach((asset) => {
        if (asset.imageUrl) finalImages.push(asset.imageUrl);
      });
    }

    // 构建最终的 prompt：如果有关联资产，在开头添加参考图映射表文案
    let finalPrompt = prompt;
    if (linked_assets && (linked_assets.characters.length > 0 || linked_assets.scenes.length > 0 || linked_assets.props.length > 0)) {
      // 关联资产图片的起始索引（从原有参考图之后开始）
      const assetStartIndex = (reference_images?.length || 0) + 1;
      const referenceMapPrompt = buildReferenceMapPrompt(linked_assets, assetStartIndex);
      finalPrompt = referenceMapPrompt + prompt;
    }

    const requestBody: Record<string, unknown> = {
      prompt: finalPrompt,
      model,
      aspect_ratio,
      duration,
      private: isPrivate,
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
      throw new Error(`分镜生成视频 API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    const duration_ms = Date.now() - startTime;
    console.log(`响应耗时: ${duration_ms}ms`);
    console.log('响应结果:', JSON.stringify(data, null, 2));
    console.log('==================================\n');

    // 如果有 variantId 且获取到 taskId，启动后端轮询
    const taskId = data.task_id || data.id;
    if (variantId && taskId) {
      startPolling(taskId, variantId);
    }

    res.json({
      success: true,
      data,
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
