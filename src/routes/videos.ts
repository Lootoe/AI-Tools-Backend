import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

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

// 分镜生成视频请求验证
const storyboardToVideoSchema = z.object({
  prompt: z.string().min(1, '分镜脚本不能为空'),
  model: z.literal('sora-2').default('sora-2'),
  aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'),
  duration: z.enum(['10', '15']).default('15'),
  private: z.boolean().default(false),
  characterIds: z.array(z.string()).optional(), // 关联的角色ID数组
});

// 分镜生成视频
videosRouter.post('/storyboard-to-video', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { prompt, model, aspect_ratio, duration, private: isPrivate, characterIds } = storyboardToVideoSchema.parse(req.body);

    console.log('\n========== 分镜生成视频请求 ==========');
    console.log('请求参数:', JSON.stringify({ prompt, model, aspect_ratio, duration, private: isPrivate, characterIds }, null, 2));

    // 处理角色标记替换：将 <角色名> 替换为 <角色名>(@username) 
    let processedPrompt = prompt;
    
    if (characterIds && characterIds.length > 0) {
      // 查询关联的角色信息
      const characters = await prisma.character.findMany({
        where: {
          id: { in: characterIds },
          username: { not: null }, // 只查询已注册的角色
        },
        select: {
          name: true,
          username: true,
        },
      });

      console.log('关联角色:', JSON.stringify(characters, null, 2));

      // 遍历每个角色，替换脚本中的角色标记
      for (const char of characters) {
        if (char.username) {
          // 匹配 <角色名> 并替换为 <角色名@username >（@username和空格在尖括号内）
          const pattern = new RegExp(`<${char.name}>`, 'g');
          processedPrompt = processedPrompt.replace(pattern, `<${char.name}@${char.username} >`);
        }
      }

      console.log('处理后的 prompt:', processedPrompt);
    }

    const requestBody = {
      prompt: processedPrompt,
      model,
      aspect_ratio,
      duration,
      private: isPrivate,
    };

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
    console.log('==========================================\n');

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

// Remix 视频请求验证
const remixVideoSchema = z.object({
  prompt: z.string().min(1, '提示词不能为空'),
  model: z.literal('sora-2').default('sora-2'),
  aspect_ratio: z.enum(['16:9', '9:16']).default('9:16'),
  duration: z.enum(['10', '15']).default('15'),
  private: z.boolean().default(false),
  characterIds: z.array(z.string()).optional(),
});

// Remix 视频（基于已有视频生成后续内容）
// POST /v1/videos/{task_id}/remix
videosRouter.post('/remix/:taskId', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { taskId } = req.params;
    const { prompt, model, aspect_ratio, duration, private: isPrivate, characterIds } = remixVideoSchema.parse(req.body);

    console.log('\n========== Remix 视频请求 ==========');
    console.log('基于任务ID:', taskId);
    console.log('请求参数:', JSON.stringify({ prompt, model, aspect_ratio, duration, private: isPrivate, characterIds }, null, 2));

    // 处理角色标记替换
    let processedPrompt = prompt;
    
    if (characterIds && characterIds.length > 0) {
      const characters = await prisma.character.findMany({
        where: {
          id: { in: characterIds },
          username: { not: null },
        },
        select: {
          name: true,
          username: true,
        },
      });

      console.log('关联角色:', JSON.stringify(characters, null, 2));

      for (const char of characters) {
        if (char.username) {
          const pattern = new RegExp(`<${char.name}>`, 'g');
          processedPrompt = processedPrompt.replace(pattern, `<${char.name}@${char.username} >`);
        }
      }

      console.log('处理后的 prompt:', processedPrompt);
    }

    const requestBody = {
      prompt: processedPrompt,
      model,
      aspect_ratio,
      duration: parseInt(duration, 10), // remix API 需要整数类型
      private: isPrivate,
    };

    // 调用 Sora2 Remix API
    const response = await fetch(`${SORA2_API_BASE}/v1/videos/${taskId}/remix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Remix API 错误:', errorText);
      throw new Error(`Remix API 调用失败: ${response.status} ${errorText}`);
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
    console.error(`\n========== Remix 视频错误 (${duration_ms}ms) ==========`);
    console.error('错误信息:', error);
    console.error('====================================================\n');
    next(error);
  }
});

// 创建角色请求验证
const createCharacterSchema = z.object({
  characterId: z.string().min(1, '角色ID不能为空'), // 数据库中的角色ID
  timestamps: z.string().min(1, '时间戳不能为空'), // 例如 '1,2' 表示视频的1～2秒
  url: z.string().optional(), // 视频URL
  from_task: z.string().optional(), // 任务ID
}).refine(
  (data) => data.url || data.from_task,
  { message: 'url 和 from_task 必须提供其中一个' }
);

// Sora2 创建角色（注册角色）
// POST /sora/v1/characters
// 调用 Sora2 API 后自动更新数据库中的角色状态
videosRouter.post('/characters', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { characterId, timestamps, url, from_task } = createCharacterSchema.parse(req.body);
  
  try {
    console.log('\n========== Sora2 创建角色请求 ==========');
    console.log('请求参数:', JSON.stringify({ characterId, timestamps, url, from_task }, null, 2));

    // 先更新数据库状态为"正在创建"
    await prisma.character.update({
      where: { id: characterId },
      data: { isCreatingCharacter: true },
    });

    // 构建 Sora2 API 请求体
    const requestBody: Record<string, unknown> = { timestamps };
    if (url) requestBody.url = url;
    if (from_task) requestBody.from_task = from_task;

    // 调用 Sora2 API
    const response = await fetch(`${SORA2_API_BASE}/sora/v1/characters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Sora2 创建角色 API 错误:', errorText);
      
      // API 失败，重置状态
      await prisma.character.update({
        where: { id: characterId },
        data: { isCreatingCharacter: false },
      });
      
      throw new Error(`Sora2 创建角色 API 调用失败: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      id: string;
      username: string;
      permalink: string;
      profile_picture_url: string;
    };

    const duration_ms = Date.now() - startTime;
    console.log(`响应耗时: ${duration_ms}ms`);
    console.log('响应结果:', JSON.stringify(data, null, 2));
    console.log('==========================================\n');

    // Sora2 返回成功，更新数据库中的角色信息
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        characterId: data.id, // Sora2 角色ID
        username: data.username,
        permalink: data.permalink,
        profilePictureUrl: data.profile_picture_url,
        isCreatingCharacter: false, // 创建完成
      },
    });

    console.log('数据库角色已更新:', updatedCharacter);

    res.json({
      success: true,
      data: updatedCharacter,
    });
  } catch (error) {
    const duration_ms = Date.now() - startTime;
    console.error(`\n========== Sora2 创建角色错误 (${duration_ms}ms) ==========`);
    console.error('错误信息:', error);
    console.error('====================================================\n');
    
    // 确保失败时重置状态
    try {
      await prisma.character.update({
        where: { id: characterId },
        data: { isCreatingCharacter: false },
      });
    } catch (e) {
      console.error('重置角色状态失败:', e);
    }
    
    next(error);
  }
});
