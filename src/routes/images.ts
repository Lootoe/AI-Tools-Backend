import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { openai } from '../lib/ai.js';
import { prisma } from '../lib/prisma.js';
import { deductBalance, refundBalance, getImageTokenCost } from '../lib/balance.js';
import { AuthRequest } from '../middleware/auth.js';

export const imagesRouter = Router();

// 配置 multer 用于处理图片上传
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ============ 提示词模板 ============

// 提示词模板类型
type PromptTemplateType = 'none' | 'character' | 'scene' | 'prop';

// 通用角色提示词模板
const CHARACTER_PROMPT_TEMPLATE = `请根据以下角色信息，生成一份完整的角色设计参考图，包含以下模块：
1. 【配色】：列出角色主色调。
2. 【多角度视图】：正面、侧面、背面的全身展示。
3. 【细节】列出至少3个角色设计细节（如：服饰、配饰、物品）。
4. 【动作姿势】：至少3个动态动作（如跑、跳、坐）。
5. 【表情集合】：至少5种不同情绪的面部表情（如开心、害羞、生气）。

角色信息：`;

// 通用场景提示词模板
const SCENE_PROMPT_TEMPLATE = `请根据以下场景核心设定，生成一份场景设计参考图，包含以下模块：
1. 【场景基础信息】：明确场景类型 + 核心氛围 + 主色调组合。
2. 【多视角视图】：整体俯瞰视角、核心区域近景视角、细节角落特写。
3. 【场景细节元素】：贴合风格的场景细节元素。

场景核心设定：`;

// 通用物品提示词模板
const PROP_PROMPT_TEMPLATE = `请根据关联的角色/场景信息，生成该物品的设计参考图，包含以下模块：
1. 【材质信息】色调+材质
2. 【多视角展示】：正面、侧面、细节特写
3. 【细节】：至少2处细节

物品关联信息：`;

// 根据模板类型获取提示词模板
const getPromptTemplate = (templateType: PromptTemplateType): string => {
    switch (templateType) {
        case 'character': return CHARACTER_PROMPT_TEMPLATE;
        case 'scene': return SCENE_PROMPT_TEMPLATE;
        case 'prop': return PROP_PROMPT_TEMPLATE;
        case 'none':
        default: return '';
    }
};

// 根据模板类型获取描述名称
const getTemplateName = (templateType: PromptTemplateType): string => {
    switch (templateType) {
        case 'character': return '角色';
        case 'scene': return '场景';
        case 'prop': return '物品';
        case 'none':
        default: return '资产';
    }
};

// ============ 统一资产设计稿生成 ============

// 资产设计稿生成请求验证
const assetDesignSchema = z.object({
    assetId: z.string().min(1, '资产ID不能为空'),
    scriptId: z.string().min(1, '剧本ID不能为空'),
    description: z.string().min(1, '资产描述不能为空'),
    promptTemplate: z.enum(['none', 'character', 'scene', 'prop']).default('none'),
    model: z.string().default('nano-banana-2'),
    referenceImageUrls: z.array(z.string()).optional(), // 参考图URL数组
});

// 统一资产设计稿生成接口
imagesRouter.post('/asset-design', async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { assetId, scriptId, description, promptTemplate, model, referenceImageUrls } = assetDesignSchema.parse(req.body);
        const templateName = getTemplateName(promptTemplate);

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, `生成${templateName}设计稿`);
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 更新资产状态为 generating
        await prisma.asset.update({
            where: { id: assetId },
            data: { status: 'generating' },
        });

        // 根据模板类型获取提示词模板并拼接
        const template = getPromptTemplate(promptTemplate);
        const fullPrompt = template ? `${template}[${description.trim()}]` : description.trim();

        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: fullPrompt,
            aspect_ratio: '16:9',
            response_format: 'url',
        };

        // 添加参考图（如果有）
        if (referenceImageUrls && referenceImageUrls.length > 0) {
            aiRequestParams.image = referenceImageUrls;
        }

        // 根据模型设置清晰度参数
        if (model.includes('nano-banana-2')) {
            aiRequestParams.image_size = '2K';
        } else if (model.includes('doubao')) {
            aiRequestParams.size = '1024x1024';
        }

        console.log(`\n========== ${templateName}设计稿生成请求 ==========`);
        console.log('资产ID:', assetId);
        console.log('提示词模板:', promptTemplate);
        console.log('资产描述:', description);
        console.log('参考图数量:', referenceImageUrls?.length || 0);
        console.log('使用模型:', model);
        console.log('完整提示词:', fullPrompt);
        console.log('AI请求参数:', JSON.stringify(aiRequestParams, null, 2));

        // @ts-expect-error - 自定义API参数
        const response = await openai.images.generate(aiRequestParams);

        console.log('AI响应:', JSON.stringify(response, null, 2));

        const duration = Date.now() - startTime;
        console.log(`响应耗时: ${duration}ms`);
        console.log('==========================================\n');

        // 生成成功，更新数据库
        const imageUrl = response.data?.[0]?.url;
        if (imageUrl) {
            await prisma.asset.update({
                where: { id: assetId },
                data: {
                    designImageUrl: imageUrl,
                    thumbnailUrl: imageUrl,
                    status: 'completed',
                },
            });
        } else {
            // 没有返回图片，标记失败并返还代币
            await prisma.asset.update({
                where: { id: assetId },
                data: { status: 'failed' },
            });
            if (deducted) {
                await refundBalance(userId, tokenCost, `${typeName}设计稿生成失败，代币已返还`);
            }
        }

        res.json({
            success: !!imageUrl,
            images: (response.data || []).map(img => ({
                url: img.url,
                revisedPrompt: img.revised_prompt,
            })),
            balance: deductResult.balance,
        });
    } catch (error) {
        // 生成失败，更新数据库状态并返还代币
        const { assetId } = req.body || {};
        if (assetId) {
            await prisma.asset.update({
                where: { id: assetId },
                data: { status: 'failed' },
            }).catch(() => { }); // 忽略更新失败
        }
        if (deducted) {
            const templateName = getTemplateName(req.body?.promptTemplate || 'none');
            await refundBalance(userId, tokenCost, `${templateName}设计稿生成失败，代币已返还`);
        }

        const duration = Date.now() - startTime;
        console.error(`\n========== 资产设计稿生成错误 (${duration}ms) ==========`);
        console.error('错误信息:', error);
        console.error('====================================================\n');
        next(error);
    }
});

// ============ 图片编辑接口 ============

// 图片编辑接口 - 基于现有图片进行编辑
imagesRouter.post('/edits', upload.single('image'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { prompt, model = 'nano-banana-2' } = req.body;
        const imageFile = req.file;

        if (!imageFile) {
            return res.status(400).json({ error: '请上传图片' });
        }

        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return res.status(400).json({ error: '请输入编辑提示词' });
        }

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, '编辑设计稿');
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 将图片转换为 base64
        const base64Image = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString('base64')}`;

        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: prompt.trim(),
            image: [base64Image],
            aspect_ratio: '16:9',
            response_format: 'url',
        };

        // 根据模型设置清晰度参数
        if (model.includes('nano-banana-2')) {
            aiRequestParams.image_size = '2K';
        } else if (model.includes('doubao')) {
            aiRequestParams.size = '1024x1024';
        }

        console.log(`\n========== 图片编辑请求 ==========`);
        console.log('使用模型:', model);
        console.log('编辑提示词:', prompt);
        console.log('图片大小:', imageFile.size, 'bytes');
        console.log('图片类型:', imageFile.mimetype);

        // @ts-expect-error - 自定义API参数
        const response = await openai.images.generate(aiRequestParams);

        console.log('AI响应:', JSON.stringify(response, null, 2));

        const duration = Date.now() - startTime;
        console.log(`响应耗时: ${duration}ms`);
        console.log('==================================\n');

        const imageUrl = response.data?.[0]?.url;

        res.json({
            success: !!imageUrl,
            images: (response.data || []).map(img => ({
                url: img.url,
                revisedPrompt: img.revised_prompt,
            })),
            balance: deductResult.balance,
        });
    } catch (error) {
        // 编辑失败，返还代币
        if (deducted) {
            await refundBalance(userId, tokenCost, '图片编辑失败，代币已返还');
        }

        const duration = Date.now() - startTime;
        console.error(`\n========== 图片编辑错误 (${duration}ms) ==========`);
        console.error('错误信息:', error);
        console.error('================================================\n');
        next(error);
    }
});
