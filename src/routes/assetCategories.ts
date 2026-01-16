import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

export const assetCategoriesRouter = Router({ mergeParams: true });

// ============ 工具函数 ============

async function validateScriptExists(scriptId: string): Promise<boolean> {
  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  return !!script;
}

async function validateCategoryExists(scriptId: string, categoryId: string): Promise<boolean> {
  const category = await prisma.assetCategory.findFirst({
    where: { id: categoryId, scriptId },
  });
  return !!category;
}

// ============ 分类 API ============

// GET /api/scripts/:scriptId/asset-categories - 获取分类列表
assetCategoriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const categories = await prisma.assetCategory.findMany({
      where: { scriptId },
      include: {
        savedAssets: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ success: true, data: { categories } });
  } catch (error) {
    next(error);
  }
});

// POST /api/scripts/:scriptId/asset-categories - 创建分类
const createCategorySchema = z.object({
  name: z.string().min(1, '分类名称不能为空'),
  sortOrder: z.number().int().optional(),
});

assetCategoriesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const data = createCategorySchema.parse(req.body);

    // 获取当前最大 sortOrder
    const maxSortOrder = await prisma.assetCategory.aggregate({
      where: { scriptId },
      _max: { sortOrder: true },
    });

    const category = await prisma.assetCategory.create({
      data: {
        scriptId,
        name: data.name,
        sortOrder: data.sortOrder ?? (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
    });

    res.json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scripts/:scriptId/asset-categories/:categoryId - 删除分类
assetCategoriesRouter.delete('/:categoryId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, categoryId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCategoryExists(scriptId, categoryId))) {
      return res.status(404).json({ success: false, error: '分类不存在' });
    }

    // 删除分类（关联的资产会通过 onDelete: Cascade 自动删除）
    await prisma.assetCategory.delete({ where: { id: categoryId } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============ 分类下的资产 API ============

// GET /api/scripts/:scriptId/asset-categories/:categoryId/assets - 获取分类下资产
assetCategoriesRouter.get('/:categoryId/assets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, categoryId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCategoryExists(scriptId, categoryId))) {
      return res.status(404).json({ success: false, error: '分类不存在' });
    }

    const assets = await prisma.savedAsset.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: { assets } });
  } catch (error) {
    next(error);
  }
});

// POST /api/scripts/:scriptId/asset-categories/:categoryId/assets - 保存资产
const saveAssetSchema = z.object({
  imageUrl: z.string().url('图片URL格式不正确'),
  thumbnailUrl: z.string().url().optional(),
  name: z.string().optional(),
  sourceNodeId: z.string().optional(),
});

assetCategoriesRouter.post('/:categoryId/assets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, categoryId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCategoryExists(scriptId, categoryId))) {
      return res.status(404).json({ success: false, error: '分类不存在' });
    }

    const data = saveAssetSchema.parse(req.body);

    const asset = await prisma.savedAsset.create({
      data: {
        categoryId,
        imageUrl: data.imageUrl,
        thumbnailUrl: data.thumbnailUrl,
        name: data.name,
        sourceNodeId: data.sourceNodeId,
      },
    });

    res.json({ success: true, data: asset });
  } catch (error) {
    next(error);
  }
});

// ============ 已保存资产 API ============

// DELETE /api/scripts/:scriptId/saved-assets/:assetId - 删除资产
export const savedAssetsRouter = Router({ mergeParams: true });

savedAssetsRouter.delete('/:assetId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, assetId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    // 验证资产存在且属于该剧本
    const asset = await prisma.savedAsset.findUnique({
      where: { id: assetId },
      include: { category: true },
    });

    if (!asset) {
      return res.status(404).json({ success: false, error: '资产不存在' });
    }

    if (asset.category.scriptId !== scriptId) {
      return res.status(403).json({ success: false, error: '无权删除该资产' });
    }

    await prisma.savedAsset.delete({ where: { id: assetId } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
