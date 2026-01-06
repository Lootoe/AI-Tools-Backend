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
        characters: true,
        episodes: {
          include: {
            storyboards: {
              orderBy: { sceneNumber: 'asc' },
            },
          },
          orderBy: { episodeNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
        characters: true,
        episodes: {
          include: {
            storyboards: {
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
        characters: true,
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
        characters: true,
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

// ============ 角色 CRUD ============

// 添加角色
const createCharacterSchema = z.object({
  name: z.string().min(1, '角色名不能为空'),
  description: z.string().default(''),
  videoUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  taskId: z.string().optional(),
  characterId: z.string().optional(),
  username: z.string().optional(),
  permalink: z.string().optional(),
  profilePictureUrl: z.string().optional(),
});

scriptsRouter.post('/:scriptId/characters', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
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
  name: z.string().optional(),
  description: z.string().optional(),
  videoUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  status: z.enum(['pending', 'generating', 'completed', 'failed']).optional(),
  characterId: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
  profilePictureUrl: z.string().nullable().optional(),
  isCreatingCharacter: z.boolean().optional(),
});

scriptsRouter.put('/:scriptId/characters/:characterId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    console.log('更新角色请求:', { characterId, body: req.body });
    const data = updateCharacterSchema.parse(req.body);
    console.log('解析后的数据:', data);
    const character = await prisma.character.update({
      where: { id: characterId },
      data,
    });
    console.log('更新后的角色:', character);
    res.json({ success: true, data: character });
  } catch (error) {
    console.error('更新角色失败:', error);
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
  characterIds: z.array(z.string()).default([]),
  referenceImageUrls: z.array(z.string()).default([]),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  duration: z.enum(['10', '15']).default('10'),
  mode: z.enum(['normal', 'remix']).default('normal'),
});

scriptsRouter.post('/:scriptId/episodes/:episodeId/storyboards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { episodeId } = req.params;
    const data = createStoryboardSchema.parse(req.body);
    const storyboard = await prisma.storyboard.create({
      data: { ...data, episodeId },
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
  characterIds: z.array(z.string()).optional(),
  referenceImageUrls: z.array(z.string()).optional(),
  videoUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  progress: z.string().nullable().optional(),
  aspectRatio: z.enum(['16:9', '9:16']).optional(),
  duration: z.enum(['10', '15']).optional(),
  mode: z.enum(['normal', 'remix']).optional(),
  status: z.enum(['pending', 'queued', 'generating', 'completed', 'failed']).optional(),
});

scriptsRouter.put('/:scriptId/episodes/:episodeId/storyboards/:storyboardId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storyboardId } = req.params;
    const data = updateStoryboardSchema.parse(req.body);
    const storyboard = await prisma.storyboard.update({
      where: { id: storyboardId },
      data,
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
