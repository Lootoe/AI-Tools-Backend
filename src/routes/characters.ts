import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';

export const charactersRouter = Router({ mergeParams: true });

// 获取剧本下所有角色
charactersRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { scriptId } = req.params;
        const characters = await prisma.character.findMany({
            where: { scriptId },
            orderBy: { createdAt: 'asc' },
        });
        res.json({ success: true, data: characters });
    } catch (error) {
        next(error);
    }
});

// 创建角色
const createCharacterSchema = z.object({
    name: z.string().min(1, '角色名称不能为空'),
    description: z.string().default(''),
});

charactersRouter.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { scriptId } = req.params;
        const { name, description } = createCharacterSchema.parse(req.body);

        const character = await prisma.character.create({
            data: { scriptId, name, description },
        });
        res.json({ success: true, data: character });
    } catch (error) {
        next(error);
    }
});

// 更新角色
const updateCharacterSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    referenceImageUrl: z.string().nullable().optional(),
    videoUrl: z.string().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    taskId: z.string().nullable().optional(),
    progress: z.string().nullable().optional(),
    status: z.string().optional(),
});

charactersRouter.patch('/:characterId', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { characterId } = req.params;
        const data = updateCharacterSchema.parse(req.body);

        const character = await prisma.character.update({
            where: { id: characterId },
            data,
        });
        res.json({ success: true, data: character });
    } catch (error) {
        next(error);
    }
});

// 删除角色
charactersRouter.delete('/:characterId', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { characterId } = req.params;
        await prisma.character.delete({ where: { id: characterId } });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});
