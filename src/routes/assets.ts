import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';

export const assetsRouter = Router();

// 资产类型枚举
const AssetType = z.enum(['character', 'scene', 'prop']);

// 获取剧本下的所有资产
assetsRouter.get('/:scriptId/assets', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { scriptId } = req.params;
        const assets = await prisma.asset.findMany({
            where: { scriptId },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ assets });
    } catch (error) {
        next(error);
    }
});

// 创建资产
const createAssetSchema = z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    type: AssetType,
});

assetsRouter.post('/:scriptId/assets', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { scriptId } = req.params;
        const { name, description, type } = createAssetSchema.parse(req.body);

        const asset = await prisma.asset.create({
            data: { scriptId, name, description, type, status: 'pending' },
        });

        res.json({ asset });
    } catch (error) {
        next(error);
    }
});

// 更新资产
const updateAssetSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    type: AssetType.optional(),
    designImageUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    referenceImageUrls: z.array(z.string()).optional(),
    status: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
});

assetsRouter.patch('/:scriptId/assets/:assetId', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { assetId } = req.params;
        const updates = updateAssetSchema.parse(req.body);

        const asset = await prisma.asset.update({
            where: { id: assetId },
            data: updates,
        });

        res.json({ asset });
    } catch (error) {
        next(error);
    }
});

// 删除资产
assetsRouter.delete('/:scriptId/assets/:assetId', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { assetId } = req.params;
        await prisma.asset.delete({ where: { id: assetId } });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});
