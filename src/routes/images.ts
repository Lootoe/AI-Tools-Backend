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

// ============ 统一资产设计稿生成 ============

// 资产设计稿生成请求验证
const assetDesignSchema = z.object({
    assetId: z.string().min(1, '资产ID不能为空'),
    scriptId: z.string().min(1, '剧本ID不能为空'),
    description: z.string().min(1, '资产描述不能为空'),
    model: z.string().default('nano-banana-2'),
    referenceImageUrls: z.array(z.string()).optional(), // 参考图URL数组
    aspectRatio: z.enum(['1:1', '4:3', '16:9']).default('16:9'),
    imageSize: z.enum(['1K', '2K']).default('1K'), // 图片质量
});

// 统一资产设计稿生成接口
imagesRouter.post('/asset-design', async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { assetId, description, model, referenceImageUrls, aspectRatio, imageSize } = assetDesignSchema.parse(req.body);

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, '生成资产设计稿');
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 更新资产状态为 generating
        await prisma.asset.update({
            where: { id: assetId },
            data: { status: 'generating' },
        });

        // 直接使用用户输入的描述
        const fullPrompt = description.trim();

        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: fullPrompt,
            response_format: 'url',
        };

        // 添加参考图（如果有）
        if (referenceImageUrls && referenceImageUrls.length > 0) {
            aiRequestParams.image = referenceImageUrls;
        }

        // 根据模型设置清晰度和比例参数
        if (model.includes('nano-banana-2')) {
            aiRequestParams.image_size = imageSize; // 使用前端传入的图片质量
            aiRequestParams.aspect_ratio = aspectRatio;
        } else if (model.includes('doubao')) {
            // 豆包模型使用 size 参数，根据 imageSize 调整分辨率
            const sizeMap: Record<string, Record<string, string>> = {
                '1K': { '16:9': '1280x720', '1:1': '1024x1024', '4:3': '1024x768' },
                '2K': { '16:9': '1920x1080', '1:1': '2048x2048', '4:3': '2048x1536' },
            };
            aiRequestParams.size = sizeMap[imageSize]?.[aspectRatio] || sizeMap['1K'][aspectRatio];
        }

        console.log(`\n========== 资产设计稿生成请求 ==========`);
        console.log('资产ID:', assetId);
        console.log('资产描述:', description);
        console.log('参考图数量:', referenceImageUrls?.length || 0);
        console.log('使用模型:', model);
        console.log('比例:', aspectRatio);
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
                await refundBalance(userId, tokenCost, '资产设计稿生成失败，代币已返还');
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
            await refundBalance(userId, tokenCost, '资产设计稿生成失败，代币已返还');
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
            aiRequestParams.image_size = '1K';
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


// ============ 分镜图生成接口 ============

// 分镜图生成请求验证
const storyboardImageSchema = z.object({
    variantId: z.string().min(1, '副本ID不能为空'),
    scriptId: z.string().min(1, '剧本ID不能为空'),
    description: z.string().min(1, '分镜描述不能为空'),
    model: z.string().default('nano-banana-2'),
    referenceImageUrls: z.array(z.string()).optional(),
    aspectRatio: z.enum(['16:9', '1:1', '4:3']).default('16:9'),
    imageSize: z.enum(['1K', '2K']).default('1K'), // 图片质量
});

// 分镜图生成接口
imagesRouter.post('/storyboard-image', async (req: AuthRequest, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const userId = req.userId!;
    let tokenCost = 0;
    let deducted = false;

    try {
        const { variantId, description, model, referenceImageUrls, aspectRatio, imageSize } = storyboardImageSchema.parse(req.body);

        // 计算代币消耗并扣除
        tokenCost = getImageTokenCost(model);
        const deductResult = await deductBalance(userId, tokenCost, '生成分镜图');
        if (!deductResult.success) {
            return res.status(400).json({ error: deductResult.error });
        }
        deducted = true;

        // 更新副本状态为 generating
        await prisma.imageVariant.update({
            where: { id: variantId },
            data: { status: 'generating', model, userId, tokenCost, startedAt: new Date() },
        });

        // 直接使用用户输入的描述
        const fullPrompt = description.trim();

        // 构建 AI 请求参数
        const aiRequestParams: Record<string, unknown> = {
            model,
            prompt: fullPrompt,
            response_format: 'url',
        };

        // 添加参考图（如果有）
        if (referenceImageUrls && referenceImageUrls.length > 0) {
            aiRequestParams.image = referenceImageUrls;
        }

        // 根据模型设置尺寸参数
        if (model.includes('nano-banana-2')) {
            aiRequestParams.image_size = imageSize; // 使用前端传入的图片质量
            aiRequestParams.aspect_ratio = aspectRatio;
        } else if (model.includes('doubao')) {
            // 豆包模型使用 size 参数，根据 imageSize 调整分辨率
            const sizeMap: Record<string, Record<string, string>> = {
                '1K': { '16:9': '1280x720', '1:1': '1024x1024', '4:3': '1024x768' },
                '2K': { '16:9': '1920x1080', '1:1': '2048x2048', '4:3': '2048x1536' },
            };
            aiRequestParams.size = sizeMap[imageSize]?.[aspectRatio] || sizeMap['1K'][aspectRatio];
        }

        console.log(`\n========== 分镜图生成请求 ==========`);
        console.log('副本ID:', variantId);
        console.log('分镜描述:', description);
        console.log('参考图数量:', referenceImageUrls?.length || 0);
        console.log('使用模型:', model);
        console.log('比例:', aspectRatio);
        console.log('AI请求参数:', JSON.stringify(aiRequestParams, null, 2));

        // @ts-expect-error - 自定义API参数
        const response = await openai.images.generate(aiRequestParams);

        console.log('AI响应:', JSON.stringify(response, null, 2));

        const duration = Date.now() - startTime;
        console.log(`响应耗时: ${duration}ms`);
        console.log('=====================================\n');

        // 生成成功，更新数据库
        const imageUrl = response.data?.[0]?.url;
        if (imageUrl) {
            await prisma.imageVariant.update({
                where: { id: variantId },
                data: {
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    status: 'completed',
                    progress: '100',
                    finishedAt: new Date(),
                },
            });
        } else {
            // 没有返回图片，标记失败并返还代币
            await prisma.imageVariant.update({
                where: { id: variantId },
                data: { status: 'failed', finishedAt: new Date() },
            });
            if (deducted) {
                await refundBalance(userId, tokenCost, '分镜图生成失败，代币已返还');
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
        const { variantId } = req.body || {};
        if (variantId) {
            await prisma.imageVariant.update({
                where: { id: variantId },
                data: { status: 'failed', finishedAt: new Date() },
            }).catch(() => { }); // 忽略更新失败
        }
        if (deducted) {
            await refundBalance(userId, tokenCost, '分镜图生成失败，代币已返还');
        }

        const duration = Date.now() - startTime;
        console.error(`\n========== 分镜图生成错误 (${duration}ms) ==========`);
        console.error('错误信息:', error);
        console.error('=================================================\n');
        next(error);
    }
});
