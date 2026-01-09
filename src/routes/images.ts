import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { openai } from '../lib/ai.js';
import { deductBalance, refundBalance, getImageTokenCost } from '../lib/balance.js';
import { AuthRequest } from '../middleware/auth.js';

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

// 场景设计稿提示词模板（存储在后端，不暴露给前端）
const SCENE_DESIGN_PROMPT_TEMPLATE = `请根据以下场景核心设定，生成一份场景设计参考图，包含以下模块：
1. 【场景基础信息】：明确场景类型 + 核心氛围 + 主色调组合。
2. 【多视角视图】：整体俯瞰视角、核心区域近景视角、细节角落特写。
3. 【场景细节元素】：贴合风格的场景细节元素。

场景核心设定：`;

// 物品设计稿提示词模板（存储在后端，不暴露给前端）
const PROP_DESIGN_PROMPT_TEMPLATE = `请根据关联的角色/场景信息，生成该物品的设计参考图，包含以下模块：
1. 【材质信息】色调+材质
2. 【多视角展示】：正面、侧面、细节特写
3. 【细节】：至少2处细节

物品关联信息：`;

// 角色设计稿生成请求验证
const characterDesignSchema = z.object({
    description: z.string().min(1, '角色描述不能为空'),
    model: z.string().default('nano-banana-2'),
});

// 角色设计稿生成
imagesRouter.post('/character-design', async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { description, model } = characterDesignSchema.parse(req.body);

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, '生成角色设计稿');
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 拼接提示词模板和用户描述
        const fullPrompt = `${CHARACTER_DESIGN_PROMPT_TEMPLATE}[${description.trim()}]`;

        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: fullPrompt,  // 直接传字符串，不要JSON.stringify
            aspect_ratio: '16:9',
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
            balance: deductResult.balance,
        });
    } catch (error) {
        // 生成失败且已扣款，返还代币
        if (deducted) {
            await refundBalance(userId, tokenCost, '角色设计稿生成失败，代币已返还');
        }

        const duration = Date.now() - startTime;
        console.error(`\n========== 角色设计稿生成错误 (${duration}ms) ==========`);
        console.error('错误信息:', error);
        console.error('====================================================\n');
        next(error);
    }
});

// ============ 场景设计稿生成 ============

// 场景设计稿生成请求验证
const sceneDesignSchema = z.object({
    description: z.string().min(1, '场景描述不能为空'),
    model: z.string().default('nano-banana-2'),
});

// 场景设计稿生成
imagesRouter.post('/scene-design', async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { description, model } = sceneDesignSchema.parse(req.body);

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, '生成场景设计稿');
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 拼接提示词模板和用户描述
        const fullPrompt = `${SCENE_DESIGN_PROMPT_TEMPLATE}[${description.trim()}]`;

        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: fullPrompt,
            aspect_ratio: '16:9',
            response_format: 'url',
        };

        // 根据模型设置清晰度参数
        if (model.includes('nano-banana-2')) {
            aiRequestParams.image_size = '2K';
        } else if (model.includes('doubao')) {
            aiRequestParams.size = '1024x1024';
        }

        console.log('\n========== 场景设计稿生成请求 ==========');
        console.log('场景描述:', description);
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
            balance: deductResult.balance,
        });
    } catch (error) {
        // 生成失败且已扣款，返还代币
        if (deducted) {
            await refundBalance(userId, tokenCost, '场景设计稿生成失败，代币已返还');
        }

        const duration = Date.now() - startTime;
        console.error(`\n========== 场景设计稿生成错误 (${duration}ms) ==========`);
        console.error('错误信息:', error);
        console.error('====================================================\n');
        next(error);
    }
});

// ============ 物品设计稿生成 ============

// 物品设计稿生成请求验证
const propDesignSchema = z.object({
    description: z.string().min(1, '物品描述不能为空'),
    model: z.string().default('nano-banana-2'),
});

// 物品设计稿生成
imagesRouter.post('/prop-design', async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { description, model } = propDesignSchema.parse(req.body);

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, '生成物品设计稿');
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 拼接提示词模板和用户描述
        const fullPrompt = `${PROP_DESIGN_PROMPT_TEMPLATE}[${description.trim()}]`;

        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: fullPrompt,
            aspect_ratio: '16:9',
            response_format: 'url',
        };

        // 根据模型设置清晰度参数
        if (model.includes('nano-banana-2')) {
            aiRequestParams.image_size = '2K';
        } else if (model.includes('doubao')) {
            aiRequestParams.size = '1024x1024';
        }

        console.log('\n========== 物品设计稿生成请求 ==========');
        console.log('物品描述:', description);
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
            balance: deductResult.balance,
        });
    } catch (error) {
        // 生成失败且已扣款，返还代币
        if (deducted) {
            await refundBalance(userId, tokenCost, '物品设计稿生成失败，代币已返还');
        }

        const duration = Date.now() - startTime;
        console.error(`\n========== 物品设计稿生成错误 (${duration}ms) ==========`);
        console.error('错误信息:', error);
        console.error('====================================================\n');
        next(error);
    }
});
