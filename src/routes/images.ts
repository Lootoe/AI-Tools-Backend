import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { openai } from '../lib/ai.js';

export const imagesRouter = Router();

// ============ 角色设计稿生成 ============

// 角色设计稿提示词模板（存储在后端，不暴露给前端）
const CHARACTER_DESIGN_PROMPT_TEMPLATE = `请根据以下角色信息，生成一份完整的角色设计参考图，包含以下模块：
1. 【配色】：列出角色主色调。
2. 【多角度视图】：正面、侧面、背面的全身展示。
3. 【细节】列出至少3个角色设计细节（如：服饰、配饰、物品）。
4. 【动作姿势】：至少3个动态动作（如跑、跳、坐）。
5. 【表情集合】：至少5种不同情绪的面部表情（如开心、害羞、生气）。

角色信息：`;

// 角色设计稿生成请求验证
const characterDesignSchema = z.object({
  description: z.string().min(1, '角色描述不能为空'),
  model: z.string().default('nano-banana-2'),
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
      prompt: fullPrompt,  // 直接传字符串，不要JSON.stringify
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
    console.log('完整提示词:', fullPrompt);
    console.log('AI请求参数:', JSON.stringify(aiRequestParams, null, 2));

    // @ts-expect-error - 自定义API参数
    const response = await openai.images.generate(aiRequestParams);

    console.log('AI响应:', JSON.stringify(response, null, 2));

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
