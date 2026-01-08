import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { openai } from '../lib/ai.js';

export const imagesRouter = Router();

// 支持的宽高比
const ASPECT_RATIOS = ['4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '1:1', '4:5', '5:4', '21:9'] as const;

// 支持的清晰度（仅 nano-banana-2 系列）
const IMAGE_SIZES = ['1K', '2K', '4K'] as const;

// 文生图请求验证
const textToImageSchema = z.object({
  model: z.string().default('nano-banana-2-4k'),
  prompt: z.string(),
  positiveTags: z.array(z.string()).default([]),
  negativeTags: z.array(z.string()).default([]),
  aspect_ratio: z.enum(ASPECT_RATIOS).default('1:1'),
  image_size: z.enum(IMAGE_SIZES).optional(),
  response_format: z.enum(['url', 'b64_json']).default('url'),
});

// 图生图请求验证
const imageToImageSchema = z.object({
  model: z.string().default('nano-banana-2-4k'),
  prompt: z.string(),
  positiveTags: z.array(z.string()).default([]),
  negativeTags: z.array(z.string()).default([]),
  image: z.array(z.string()).min(1, '参考图不能为空'),
  aspect_ratio: z.enum(ASPECT_RATIOS).default('1:1'),
  image_size: z.enum(IMAGE_SIZES).optional(),
  response_format: z.enum(['url', 'b64_json']).default('url'),
});

// 组合提示词为JSON格式字符串
function buildPrompt(prompt: string, positiveTags: string[], negativeTags: string[]): string {
  const promptObj: Record<string, string | string[]> = {};
  
  if (prompt.trim()) {
    promptObj.prompt = prompt.trim();
  }
  if (positiveTags.length > 0) {
    promptObj.positiveTags = positiveTags;
  }
  if (negativeTags.length > 0) {
    promptObj.negativeTags = negativeTags;
  }
  
  return JSON.stringify(promptObj);
}

// 文生图
imagesRouter.post('/generations', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { model, prompt, positiveTags, negativeTags, aspect_ratio, image_size, response_format } = textToImageSchema.parse(req.body);
    const fullPrompt = buildPrompt(prompt, positiveTags, negativeTags);

    if (!fullPrompt) {
      return res.status(400).json({ success: false, error: '请输入提示词或选择标签' });
    }

    const aiRequestParams: Record<string, unknown> = {
      model,
      prompt: fullPrompt,
      aspect_ratio,
      response_format,
    };

    if (image_size) {
      if (model.includes('nano-banana-2')) {
        aiRequestParams.image_size = image_size;
      } else if (model.includes('doubao')) {
        aiRequestParams.size = image_size;
      }
    }

    console.log('\n========== 文生图请求 ==========');
    console.log('发送给AI的参数:', JSON.stringify(aiRequestParams, null, 2));

    // @ts-expect-error - 自定义API参数
    const response = await openai.images.generate(aiRequestParams);

    const duration = Date.now() - startTime;
    console.log(`响应耗时: ${duration}ms`);
    console.log('================================\n');

    res.json({
      success: true,
      images: (response.data || []).map(img => ({
        url: img.url,
        b64_json: img.b64_json,
        revisedPrompt: img.revised_prompt,
      })),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n========== 文生图错误 (${duration}ms) ==========`);
    console.error('错误信息:', error);
    console.error('============================================\n');
    next(error);
  }
});


// 图生图
imagesRouter.post('/edits', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { model, prompt, positiveTags, negativeTags, image, aspect_ratio, image_size, response_format } = imageToImageSchema.parse(req.body);
    const fullPrompt = buildPrompt(prompt, positiveTags, negativeTags);

    if (!fullPrompt) {
      return res.status(400).json({ success: false, error: '请输入提示词或选择标签' });
    }

    const aiRequestParams: Record<string, unknown> = {
      model,
      prompt: fullPrompt,
      aspect_ratio,
      response_format,
    };

    if (model.includes('doubao')) {
      aiRequestParams.image = image[0];
    } else {
      aiRequestParams.image = image;
    }

    if (image_size) {
      if (model.includes('nano-banana-2')) {
        aiRequestParams.image_size = image_size;
      } else if (model.includes('doubao')) {
        aiRequestParams.size = image_size;
      }
    }

    console.log('\n========== 图生图请求 ==========');
    console.log('发送给AI的参数:', JSON.stringify(aiRequestParams, null, 2));

    // @ts-expect-error - 自定义API参数
    const response = await openai.images.edit(aiRequestParams);

    const duration = Date.now() - startTime;
    console.log(`响应耗时: ${duration}ms`);
    console.log('================================\n');

    res.json({
      success: true,
      images: (response.data || []).map(img => ({
        url: img.url,
        b64_json: img.b64_json,
        revisedPrompt: img.revised_prompt,
      })),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n========== 图生图错误 (${duration}ms) ==========`);
    console.error('错误信息:', error);
    console.error('============================================\n');
    next(error);
  }
});

// ============ 角色设计稿生成 ============

// 角色设计稿提示词模板（存储在后端，不暴露给前端）
const CHARACTER_DESIGN_PROMPT_TEMPLATE = `请根据以下角色信息，生成一份完整的角色设计参考图（类似手绘网格纸风格），包含以下模块：
1. 【配色】：列出角色主色调。
2. 【多角度视图】：正面、侧面、背面的全身展示。
3. 【细节】列出至少3个角色设计细节（如：服饰、配饰、物品）。
4. 【动作姿势】：至少3个动态动作（如跑、跳、坐）。
5. 【表情集合】：至少5种不同情绪的面部表情（如开心、害羞、生气）。

角色信息：`;

// 角色设计稿生成请求验证
const characterDesignSchema = z.object({
  description: z.string().min(1, '角色描述不能为空'),
  model: z.string().default('nano-banana-2-4k'),
});

// 角色设计稿生成
imagesRouter.post('/character-design', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { description, model } = characterDesignSchema.parse(req.body);
    
    // 拼接提示词模板和用户描述
    const fullPrompt = `${CHARACTER_DESIGN_PROMPT_TEMPLATE}[${description.trim()}]`;

    const aiRequestParams: Record<string, unknown> = {
      model,
      prompt: JSON.stringify({ prompt: fullPrompt }),
      aspect_ratio: '1:1',
      response_format: 'url',
    };

    // 根据模型设置清晰度参数
    if (model.includes('nano-banana-2')) {
      aiRequestParams.image_size = '2K';
    } else if (model.includes('doubao')) {
      aiRequestParams.size = '1024x1024';
    }

    console.log('\n========== 角色设计稿生成请求 ==========');
    console.log('角色描述:', description);
    console.log('使用模型:', model);

    // @ts-expect-error - 自定义API参数
    const response = await openai.images.generate(aiRequestParams);

    const duration = Date.now() - startTime;
    console.log(`响应耗时: ${duration}ms`);
    console.log('==========================================\n');

    res.json({
      success: true,
      images: (response.data || []).map(img => ({
        url: img.url,
        revisedPrompt: img.revised_prompt,
      })),
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n========== 角色设计稿生成错误 (${duration}ms) ==========`);
    console.error('错误信息:', error);
    console.error('====================================================\n');
    next(error);
  }
});
