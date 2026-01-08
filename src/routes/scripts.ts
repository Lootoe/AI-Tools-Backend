import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

export const scriptsRouter = Router();

// ============ 剧本 CRUD ============

// 获取所有剧本
scriptsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const scripts = await prisma.script.findMany({
      include: {
        episodes: {
          include: {
            storyboards: {
              include: { variants: { orderBy: { createdAt: 'asc' } } },
              orderBy: { sceneNumber: 'asc' },
            },
          },
          orderBy: { episodeNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 迁移旧数据：将分镜的 videoUrl 等迁移到 variants
    for (const script of scripts) {
      for (const episode of script.episodes) {
        for (const storyboard of episode.storyboards) {
          // 如果分镜有 videoUrl 但没有 variants，创建一个副本
          if (storyboard.videoUrl && storyboard.variants.length === 0) {
            const variant = await prisma.storyboardVariant.create({
              data: {
                storyboardId: storyboard.id,
                videoUrl: storyboard.videoUrl,
                thumbnailUrl: storyboard.thumbnailUrl,
                taskId: storyboard.taskId,
                progress: storyboard.progress,
                status: storyboard.status,
              },
            });
            // 设置为当前选中
            await prisma.storyboard.update({
              where: { id: storyboard.id },
              data: { activeVariantId: variant.id },
            });
            // 更新内存中的数据
            storyboard.variants.push(variant);
            storyboard.activeVariantId = variant.id;
          }
        }
      }
    }

    res.json({ success: true, data: scripts });
  } catch (error) {
    next(error);
  }
});

// 获取单个剧本
scriptsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const script = await prisma.script.findUnique({
      where: { id },
      include: {
        episodes: {
          include: {
            storyboards: {
              include: { variants: { orderBy: { createdAt: 'asc' } } },
              orderBy: { sceneNumber: 'asc' },
            },
          },
          orderBy: { episodeNumber: 'asc' },
        },
      },
    });
    if (!script) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    // 迁移旧数据：将分镜的 videoUrl 等迁移到 variants
    for (const episode of script.episodes) {
      for (const storyboard of episode.storyboards) {
        if (storyboard.videoUrl && storyboard.variants.length === 0) {
          const variant = await prisma.storyboardVariant.create({
            data: {
              storyboardId: storyboard.id,
              videoUrl: storyboard.videoUrl,
              thumbnailUrl: storyboard.thumbnailUrl,
              taskId: storyboard.taskId,
              progress: storyboard.progress,
              status: storyboard.status,
            },
          });
          await prisma.storyboard.update({
            where: { id: storyboard.id },
            data: { activeVariantId: variant.id },
          });
          storyboard.variants.push(variant);
          storyboard.activeVariantId = variant.id;
        }
      }
    }

    res.json({ success: true, data: script });
  } catch (error) {
    next(error);
  }
});

// 创建剧本
const createScriptSchema = z.object({
  title: z.string().min(1, '标题不能为空').default('新剧本'),
  prompt: z.string().optional(),
  content: z.string().optional(),
});

scriptsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createScriptSchema.parse(req.body);
    const script = await prisma.script.create({
      data,
      include: {
        episodes: { include: { storyboards: true } },
      },
    });
    res.json({ success: true, data: script });
  } catch (error) {
    next(error);
  }
});

// 更新剧本
const updateScriptSchema = z.object({
  title: z.string().min(1).optional(),
  prompt: z.string().optional(),
  content: z.string().optional(),
  currentPhase: z.enum(['storyboard', 'video']).optional(),
});

scriptsRouter.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = updateScriptSchema.parse(req.body);
    const script = await prisma.script.update({
      where: { id },
      data,
      include: {
        episodes: { include: { storyboards: true } },
      },
    });
    res.json({ success: true, data: script });
  } catch (error) {
    next(error);
  }
});

// 删除剧本
scriptsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.script.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 批量删除剧本
const batchDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, '至少选择一个剧本'),
});

scriptsRouter.post('/batch-delete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = batchDeleteSchema.parse(req.body);
    await prisma.script.deleteMany({ where: { id: { in: ids } } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============ 剧集 CRUD ============

// 添加剧集
const createEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  title: z.string().min(1, '标题不能为空'),
  content: z.string().default(''),
});

scriptsRouter.post('/:scriptId/episodes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    const data = createEpisodeSchema.parse(req.body);
    const episode = await prisma.episode.create({
      data: { ...data, scriptId },
      include: { storyboards: true },
    });
    res.json({ success: true, data: episode });
  } catch (error) {
    next(error);
  }
});

// 更新剧集
const updateEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId } = req.params;
    const data = updateEpisodeSchema.parse(req.body);
    const episode = await prisma.episode.update({
      where: { id: episodeId },
      data,
      include: { storyboards: true },
    });
    res.json({ success: true, data: episode });
  } catch (error) {
    next(error);
  }
});

// 删除剧集
scriptsRouter.delete('/:scriptId/episodes/:episodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId } = req.params;
    await prisma.episode.delete({ where: { id: episodeId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============ 分镜 CRUD ============

// 添加分镜
const createStoryboardSchema = z.object({
  sceneNumber: z.number().int().positive(),
  description: z.string().default(''),
  referenceImageUrls: z.array(z.string()).default([]),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  duration: z.enum(['10', '15']).default('10'),
});

scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId } = req.params;
    const data = createStoryboardSchema.parse(req.body);
    const storyboard = await prisma.storyboard.create({
      data: { ...data, episodeId },
      include: { variants: true },
    });
    res.json({ success: true, data: storyboard });
  } catch (error) {
    next(error);
  }
});

// 更新分镜
const updateStoryboardSchema = z.object({
  sceneNumber: z.number().int().positive().optional(),
  description: z.string().optional(),
  referenceImageUrls: z.array(z.string()).optional(),
  videoUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  aspectRatio: z.enum(['16:9', '9:16']).optional(),
  duration: z.enum(['10', '15']).optional(),
  status: z.enum(['pending', 'queued', 'generating', 'completed', 'failed']).optional(),
  activeVariantId: z.string().nullable().optional(),
  // 关联资产ID数组
  linkedCharacterIds: z.array(z.string()).optional(),
  linkedSceneIds: z.array(z.string()).optional(),
  linkedPropIds: z.array(z.string()).optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards/:storyboardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId } = req.params;
    const data = updateStoryboardSchema.parse(req.body);
    const storyboard = await prisma.storyboard.update({
      where: { id: storyboardId },
      data,
      include: { variants: true },
    });
    res.json({ success: true, data: storyboard });
  } catch (error) {
    next(error);
  }
});

// 删除分镜
scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboards/:storyboardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId } = req.params;
    await prisma.storyboard.delete({ where: { id: storyboardId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 清空剧集的所有分镜
scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId } = req.params;
    await prisma.storyboard.deleteMany({ where: { episodeId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 重排分镜顺序
const reorderStoryboardsSchema = z.object({
  storyboardIds: z.array(z.string()),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards-reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardIds } = reorderStoryboardsSchema.parse(req.body);

    // 批量更新 sceneNumber
    await Promise.all(
      storyboardIds.map((id, index) =>
        prisma.storyboard.update({
          where: { id },
          data: { sceneNumber: index + 1 },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


// ============ 分镜副本 CRUD ============

// 获取单个分镜副本
scriptsRouter.get('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantId } = req.params;
    const variant = await prisma.storyboardVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      return res.status(404).json({ success: false, error: '副本不存在' });
    }
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

// 创建分镜副本
scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId } = req.params;
    const variant = await prisma.storyboardVariant.create({
      data: { storyboardId },
    });

    // 如果是第一个副本，自动设为当前选中
    const storyboard = await prisma.storyboard.findUnique({
      where: { id: storyboardId },
      include: { variants: true },
    });
    if (storyboard && storyboard.variants.length === 1) {
      await prisma.storyboard.update({
        where: { id: storyboardId },
        data: { activeVariantId: variant.id },
      });
    }

    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

// 更新分镜副本
const updateVariantSchema = z.object({
  videoUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  status: z.enum(['pending', 'queued', 'generating', 'completed', 'failed']).optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantId } = req.params;
    const data = updateVariantSchema.parse(req.body);
    const variant = await prisma.storyboardVariant.update({
      where: { id: variantId },
      data,
    });
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

// 删除分镜副本
scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId, variantId } = req.params;
    await prisma.storyboardVariant.delete({ where: { id: variantId } });

    // 如果删除的是当前选中的副本，自动选择第一个
    const storyboard = await prisma.storyboard.findUnique({
      where: { id: storyboardId },
      include: { variants: { orderBy: { createdAt: 'asc' } } },
    });
    if (storyboard && storyboard.activeVariantId === variantId) {
      await prisma.storyboard.update({
        where: { id: storyboardId },
        data: { activeVariantId: storyboard.variants[0]?.id || null },
      });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// 设置当前选中的副本
const setActiveVariantSchema = z.object({
  variantId: z.string(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/active-variant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId } = req.params;
    const { variantId } = setActiveVariantSchema.parse(req.body);
    await prisma.storyboard.update({
      where: { id: storyboardId },
      data: { activeVariantId: variantId },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


// ============ 角色 CRUD ============

// 获取剧本的所有角色
scriptsRouter.get('/:scriptId/characters', async (req: Request, res: Response, next: NextFunction) => {
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
  description: z.string().default(''),  // 允许空描述
});

scriptsRouter.post('/:scriptId/characters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;

    // 先验证剧本是否存在
    const script = await prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const data = createCharacterSchema.parse(req.body);
    const character = await prisma.character.create({
      data: { ...data, scriptId },
    });
    res.json({ success: true, data: character });
  } catch (error) {
    next(error);
  }
});

// 更新角色
const updateCharacterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  designImageUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
});

scriptsRouter.put('/:scriptId/characters/:characterId', async (req: Request, res: Response, next: NextFunction) => {
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
scriptsRouter.delete('/:scriptId/characters/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    await prisma.character.delete({ where: { id: characterId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============ 场景 CRUD ============

// 获取剧本的所有场景
scriptsRouter.get('/:scriptId/scenes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    const scenes = await prisma.scene.findMany({
      where: { scriptId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: scenes });
  } catch (error) {
    next(error);
  }
});

// 创建场景
const createSceneSchema = z.object({
  name: z.string().min(1, '场景名称不能为空'),
  description: z.string().default(''),
});

scriptsRouter.post('/:scriptId/scenes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;

    // 先验证剧本是否存在
    const script = await prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const data = createSceneSchema.parse(req.body);
    const scene = await prisma.scene.create({
      data: { ...data, scriptId },
    });
    res.json({ success: true, data: scene });
  } catch (error) {
    next(error);
  }
});

// 更新场景
const updateSceneSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  designImageUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
});

scriptsRouter.put('/:scriptId/scenes/:sceneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sceneId } = req.params;
    const data = updateSceneSchema.parse(req.body);
    const scene = await prisma.scene.update({
      where: { id: sceneId },
      data,
    });
    res.json({ success: true, data: scene });
  } catch (error) {
    next(error);
  }
});

// 删除场景
scriptsRouter.delete('/:scriptId/scenes/:sceneId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sceneId } = req.params;
    await prisma.scene.delete({ where: { id: sceneId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============ 物品 CRUD ============

// 获取剧本的所有物品
scriptsRouter.get('/:scriptId/props', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    const props = await prisma.prop.findMany({
      where: { scriptId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: props });
  } catch (error) {
    next(error);
  }
});

// 创建物品
const createPropSchema = z.object({
  name: z.string().min(1, '物品名称不能为空'),
  description: z.string().default(''),
});

scriptsRouter.post('/:scriptId/props', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;

    // 先验证剧本是否存在
    const script = await prisma.script.findUnique({ where: { id: scriptId } });
    if (!script) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const data = createPropSchema.parse(req.body);
    const prop = await prisma.prop.create({
      data: { ...data, scriptId },
    });
    res.json({ success: true, data: prop });
  } catch (error) {
    next(error);
  }
});

// 更新物品
const updatePropSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  designImageUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
});

scriptsRouter.put('/:scriptId/props/:propId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { propId } = req.params;
    const data = updatePropSchema.parse(req.body);
    const prop = await prisma.prop.update({
      where: { id: propId },
      data,
    });
    res.json({ success: true, data: prop });
  } catch (error) {
    next(error);
  }
});

// 删除物品
scriptsRouter.delete('/:scriptId/props/:propId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { propId } = req.params;
    await prisma.prop.delete({ where: { id: propId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
