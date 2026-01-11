import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

export const scriptsRouter = Router();

// ============ 工具函数 ============

/** 迁移旧数据：将分镜的 videoUrl 等迁移到 variants */
async function migrateStoryboardVariants(storyboards: any[]) {
  for (const storyboard of storyboards) {
    if (storyboard.videoUrl && (!storyboard.variants || storyboard.variants.length === 0)) {
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
      if (!storyboard.variants) storyboard.variants = [];
      storyboard.variants.push(variant);
      storyboard.activeVariantId = variant.id;
    }
  }
}

async function validateScriptExists(scriptId: string): Promise<boolean> {
  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  return !!script;
}

async function validateEpisodeExists(scriptId: string, episodeId: string): Promise<boolean> {
  const episode = await prisma.episode.findFirst({ where: { id: episodeId, scriptId } });
  return !!episode;
}

async function validateStoryboardExists(episodeId: string, storyboardId: string): Promise<boolean> {
  const storyboard = await prisma.storyboard.findFirst({ where: { id: storyboardId, episodeId } });
  return !!storyboard;
}

// ============ 剧本 CRUD ============

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
            storyboardImages: {
              include: { imageVariants: { orderBy: { createdAt: 'asc' } } },
              orderBy: { sceneNumber: 'asc' },
            },
          },
          orderBy: { episodeNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    for (const script of scripts) {
      for (const episode of script.episodes) {
        await migrateStoryboardVariants(episode.storyboards);
      }
    }
    res.json({ success: true, data: scripts });
  } catch (error) {
    next(error);
  }
});

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
            storyboardImages: {
              include: { imageVariants: { orderBy: { createdAt: 'asc' } } },
              orderBy: { sceneNumber: 'asc' },
            },
          },
          orderBy: { episodeNumber: 'asc' },
        },
      },
    });
    if (!script) return res.status(404).json({ success: false, error: '剧本不存在' });
    for (const episode of script.episodes) {
      await migrateStoryboardVariants(episode.storyboards);
    }
    res.json({ success: true, data: script });
  } catch (error) {
    next(error);
  }
});


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
      include: { episodes: { include: { storyboards: true } } },
    });
    res.json({ success: true, data: script });
  } catch (error) {
    next(error);
  }
});

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
      include: { episodes: { include: { storyboards: true } } },
    });
    res.json({ success: true, data: script });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await prisma.script.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

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

const createEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  title: z.string().min(1, '标题不能为空'),
  content: z.string().default(''),
});

scriptsRouter.post('/:scriptId/episodes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }
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

const updateEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
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

scriptsRouter.delete('/:scriptId/episodes/:episodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    await prisma.episode.delete({ where: { id: episodeId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


// ============ 分镜 CRUD ============

const createStoryboardSchema = z.object({
  sceneNumber: z.number().int().positive(),
  description: z.string().default(''),
  referenceImageUrls: z.array(z.string()).default([]),
});

scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
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

const updateStoryboardSchema = z.object({
  sceneNumber: z.number().int().positive().optional(),
  description: z.string().optional(),
  referenceImageUrls: z.array(z.string()).optional(),
  referenceImageUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  status: z.enum(['pending', 'queued', 'generating', 'completed', 'failed']).optional(),
  activeVariantId: z.string().nullable().optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards/:storyboardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId, storyboardId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    if (!(await validateStoryboardExists(episodeId, storyboardId))) {
      return res.status(404).json({ success: false, error: '分镜不存在' });
    }
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

scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboards/:storyboardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId, storyboardId } = req.params;
    if (!(await validateStoryboardExists(episodeId, storyboardId))) {
      return res.status(404).json({ success: false, error: '分镜不存在' });
    }
    await prisma.storyboard.delete({ where: { id: storyboardId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    await prisma.storyboard.deleteMany({ where: { episodeId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const reorderStoryboardsSchema = z.object({
  storyboardIds: z.array(z.string()),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards-reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    const { storyboardIds } = reorderStoryboardsSchema.parse(req.body);
    // 使用事务确保原子性
    await prisma.$transaction(
      storyboardIds.map((id, index) =>
        prisma.storyboard.update({ where: { id }, data: { sceneNumber: index + 1 } })
      )
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


// ============ 分镜副本 CRUD ============

scriptsRouter.get('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantId } = req.params;
    const variant = await prisma.storyboardVariant.findUnique({ where: { id: variantId } });
    if (!variant) return res.status(404).json({ success: false, error: '副本不存在' });
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId, storyboardId } = req.params;
    if (!(await validateStoryboardExists(episodeId, storyboardId))) {
      return res.status(404).json({ success: false, error: '分镜不存在' });
    }
    // 使用事务确保原子性
    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.storyboardVariant.create({ data: { storyboardId } });
      const variantCount = await tx.storyboardVariant.count({ where: { storyboardId } });
      if (variantCount === 1) {
        await tx.storyboard.update({
          where: { id: storyboardId },
          data: { activeVariantId: variant.id },
        });
      }
      return variant;
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

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
    const variant = await prisma.storyboardVariant.update({ where: { id: variantId }, data });
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboards/:storyboardId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId, variantId } = req.params;
    // 使用事务确保原子性
    await prisma.$transaction(async (tx) => {
      await tx.storyboardVariant.delete({ where: { id: variantId } });
      const storyboard = await tx.storyboard.findUnique({
        where: { id: storyboardId },
        include: { variants: { orderBy: { createdAt: 'asc' } } },
      });
      if (storyboard && storyboard.activeVariantId === variantId) {
        const newActiveId = storyboard.variants.length > 0 ? storyboard.variants[0].id : null;
        await tx.storyboard.update({
          where: { id: storyboardId },
          data: { activeVariantId: newActiveId },
        });
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const setActiveVariantSchema = z.object({ variantId: z.string() });

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


// ============ 分镜图 CRUD ============

async function validateStoryboardImageExists(episodeId: string, storyboardImageId: string): Promise<boolean> {
  const storyboardImage = await prisma.storyboardImage.findFirst({ where: { id: storyboardImageId, episodeId } });
  return !!storyboardImage;
}

const createStoryboardImageSchema = z.object({
  sceneNumber: z.number().int().positive(),
  description: z.string().default(''),
  referenceImageUrls: z.array(z.string()).default([]),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16'),
});

scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboard-images', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    const data = createStoryboardImageSchema.parse(req.body);
    const storyboardImage = await prisma.storyboardImage.create({
      data: { ...data, episodeId },
      include: { imageVariants: true },
    });
    res.json({ success: true, data: storyboardImage });
  } catch (error) {
    next(error);
  }
});

const updateStoryboardImageSchema = z.object({
  sceneNumber: z.number().int().positive().optional(),
  description: z.string().optional(),
  referenceImageUrls: z.array(z.string()).optional(),
  imageUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  aspectRatio: z.enum(['9:16', '16:9', '1:1']).optional(),
  status: z.enum(['pending', 'queued', 'generating', 'completed', 'failed']).optional(),
  progress: z.string().nullable().optional(),
  activeImageVariantId: z.string().nullable().optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId, storyboardImageId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    if (!(await validateStoryboardImageExists(episodeId, storyboardImageId))) {
      return res.status(404).json({ success: false, error: '分镜图不存在' });
    }
    const data = updateStoryboardImageSchema.parse(req.body);
    const storyboardImage = await prisma.storyboardImage.update({
      where: { id: storyboardImageId },
      data,
      include: { imageVariants: true },
    });
    res.json({ success: true, data: storyboardImage });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId, storyboardImageId } = req.params;
    if (!(await validateStoryboardImageExists(episodeId, storyboardImageId))) {
      return res.status(404).json({ success: false, error: '分镜图不存在' });
    }
    await prisma.storyboardImage.delete({ where: { id: storyboardImageId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboard-images', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    await prisma.storyboardImage.deleteMany({ where: { episodeId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const reorderStoryboardImagesSchema = z.object({
  storyboardImageIds: z.array(z.string()),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboard-images-reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, episodeId } = req.params;
    if (!(await validateEpisodeExists(scriptId, episodeId))) {
      return res.status(404).json({ success: false, error: '剧集不存在' });
    }
    const { storyboardImageIds } = reorderStoryboardImagesSchema.parse(req.body);
    await prisma.$transaction(
      storyboardImageIds.map((id, index) =>
        prisma.storyboardImage.update({ where: { id }, data: { sceneNumber: index + 1 } })
      )
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});


// ============ 分镜图副本 CRUD ============

scriptsRouter.get('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantId } = req.params;
    const variant = await prisma.imageVariant.findUnique({ where: { id: variantId } });
    if (!variant) return res.status(404).json({ success: false, error: '副本不存在' });
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId/variants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId, storyboardImageId } = req.params;
    if (!(await validateStoryboardImageExists(episodeId, storyboardImageId))) {
      return res.status(404).json({ success: false, error: '分镜图不存在' });
    }
    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.imageVariant.create({ data: { storyboardImageId } });
      const variantCount = await tx.imageVariant.count({ where: { storyboardImageId } });
      if (variantCount === 1) {
        await tx.storyboardImage.update({
          where: { id: storyboardImageId },
          data: { activeImageVariantId: variant.id },
        });
      }
      return variant;
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

const updateImageVariantSchema = z.object({
  imageUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  status: z.enum(['pending', 'queued', 'generating', 'completed', 'failed']).optional(),
  model: z.string().nullable().optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { variantId } = req.params;
    const data = updateImageVariantSchema.parse(req.body);
    const variant = await prisma.imageVariant.update({ where: { id: variantId }, data });
    res.json({ success: true, data: variant });
  } catch (error) {
    next(error);
  }
});

scriptsRouter.delete('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId/variants/:variantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardImageId, variantId } = req.params;
    await prisma.$transaction(async (tx) => {
      await tx.imageVariant.delete({ where: { id: variantId } });
      const storyboardImage = await tx.storyboardImage.findUnique({
        where: { id: storyboardImageId },
        include: { imageVariants: { orderBy: { createdAt: 'asc' } } },
      });
      if (storyboardImage && storyboardImage.activeImageVariantId === variantId) {
        const newActiveId = storyboardImage.imageVariants.length > 0 ? storyboardImage.imageVariants[0].id : null;
        await tx.storyboardImage.update({
          where: { id: storyboardImageId },
          data: { activeImageVariantId: newActiveId },
        });
      }
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

const setActiveImageVariantSchema = z.object({ variantId: z.string() });

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboard-images/:storyboardImageId/active-variant', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardImageId } = req.params;
    const { variantId } = setActiveImageVariantSchema.parse(req.body);
    await prisma.storyboardImage.update({
      where: { id: storyboardImageId },
      data: { activeImageVariantId: variantId },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
