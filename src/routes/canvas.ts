import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';

export const canvasRouter = Router({ mergeParams: true });

// ============ 工具函数 ============

async function validateScriptExists(scriptId: string): Promise<boolean> {
  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  return !!script;
}

async function validateCanvasExists(scriptId: string, canvasId: string): Promise<boolean> {
  const canvas = await prisma.canvas.findFirst({
    where: { id: canvasId, scriptId },
  });
  return !!canvas;
}

// ============ 画布管理 API ============

// GET /api/scripts/:scriptId/canvases - 获取所有画布
canvasRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const canvases = await prisma.canvas.findMany({
      where: { scriptId },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
        edges: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: { canvases } });
  } catch (error) {
    next(error);
  }
});

// GET /api/scripts/:scriptId/canvases/:canvasId - 获取单个画布
canvasRouter.get('/:canvasId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const canvas = await prisma.canvas.findFirst({
      where: { id: canvasId, scriptId },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
        edges: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!canvas) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    res.json({ success: true, data: { canvas } });
  } catch (error) {
    next(error);
  }
});

// POST /api/scripts/:scriptId/canvases - 创建画布
const createCanvasSchema = z.object({
  name: z.string().min(1).max(100),
});

canvasRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    const { name } = createCanvasSchema.parse(req.body);

    const canvas = await prisma.canvas.create({
      data: {
        scriptId,
        name,
      },
      include: {
        nodes: { orderBy: { createdAt: 'asc' } },
        edges: { orderBy: { createdAt: 'asc' } },
      },
    });

    res.json({ success: true, data: { canvas } });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/scripts/:scriptId/canvases/:canvasId - 重命名画布
const renameCanvasSchema = z.object({
  name: z.string().min(1).max(100),
});

canvasRouter.patch('/:canvasId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const { name } = renameCanvasSchema.parse(req.body);

    const canvas = await prisma.canvas.update({
      where: { id: canvasId },
      data: { name },
    });

    res.json({ success: true, data: { canvas } });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scripts/:scriptId/canvases/:canvasId - 删除画布
canvasRouter.delete('/:canvasId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    // 检查是否至少保留一个画布
    const canvasCount = await prisma.canvas.count({ where: { scriptId } });
    if (canvasCount <= 1) {
      return res.status(400).json({ success: false, error: '至少需要保留一个画布' });
    }

    // 删除画布（关联的节点和边会通过 onDelete: Cascade 自动删除）
    await prisma.canvas.delete({ where: { id: canvasId } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// PUT /api/scripts/:scriptId/canvases/:canvasId/viewport - 更新视口
const updateViewportSchema = z.object({
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().min(0.1).max(3.0),
  }),
});

canvasRouter.put('/:canvasId/viewport', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const { viewport } = updateViewportSchema.parse(req.body);

    const updated = await prisma.canvas.update({
      where: { id: canvasId },
      data: { viewport },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

// ============ 节点 API ============

// POST /api/scripts/:scriptId/canvases/:canvasId/nodes - 创建节点
const createNodeSchema = z.object({
  type: z.enum(['generator', 'input']),
  positionX: z.number(),
  positionY: z.number(),
  label: z.string().optional(),
});

canvasRouter.post('/:canvasId/nodes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const data = createNodeSchema.parse(req.body);

    const node = await prisma.canvasNode.create({
      data: {
        canvasId,
        type: data.type,
        positionX: data.positionX,
        positionY: data.positionY,
        label: data.label,
      },
    });

    res.json({ success: true, data: node });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/scripts/:scriptId/canvases/:canvasId/nodes/:nodeId - 更新节点
const updateNodeSchema = z.object({
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  label: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  aspectRatio: z.string().nullable().optional(),
  imageSize: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  status: z.enum(['idle', 'generating', 'completed', 'failed']).optional(),
  progress: z.string().nullable().optional(),
  failReason: z.string().nullable().optional(),
});

canvasRouter.patch('/:canvasId/nodes/:nodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId, nodeId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const existingNode = await prisma.canvasNode.findFirst({
      where: { id: nodeId, canvasId },
    });

    if (!existingNode) {
      return res.status(404).json({ success: false, error: '节点不存在' });
    }

    const data = updateNodeSchema.parse(req.body);
    const node = await prisma.canvasNode.update({
      where: { id: nodeId },
      data,
    });

    res.json({ success: true, data: node });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scripts/:scriptId/canvases/:canvasId/nodes/:nodeId - 删除节点
canvasRouter.delete('/:canvasId/nodes/:nodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId, nodeId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const existingNode = await prisma.canvasNode.findFirst({
      where: { id: nodeId, canvasId },
    });

    if (!existingNode) {
      return res.status(404).json({ success: false, error: '节点不存在' });
    }

    // 使用事务删除节点（关联的边会通过 onDelete: Cascade 自动删除）
    await prisma.canvasNode.delete({ where: { id: nodeId } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============ 连接 API ============

// POST /api/scripts/:scriptId/canvases/:canvasId/edges - 创建连接
const createEdgeSchema = z.object({
  sourceNodeId: z.string(),
  targetNodeId: z.string(),
});

canvasRouter.post('/:canvasId/edges', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const { sourceNodeId, targetNodeId } = createEdgeSchema.parse(req.body);

    // 验证源节点和目标节点存在
    const [sourceNode, targetNode] = await Promise.all([
      prisma.canvasNode.findFirst({ where: { id: sourceNodeId, canvasId } }),
      prisma.canvasNode.findFirst({ where: { id: targetNodeId, canvasId } }),
    ]);

    if (!sourceNode) {
      return res.status(404).json({ success: false, error: '源节点不存在' });
    }
    if (!targetNode) {
      return res.status(404).json({ success: false, error: '目标节点不存在' });
    }

    // 检查是否已存在相同连接
    const existingEdge = await prisma.canvasEdge.findUnique({
      where: { sourceNodeId_targetNodeId: { sourceNodeId, targetNodeId } },
    });

    if (existingEdge) {
      return res.status(409).json({ success: false, error: '连接已存在' });
    }

    const edge = await prisma.canvasEdge.create({
      data: {
        canvasId,
        sourceNodeId,
        targetNodeId,
      },
    });

    res.json({ success: true, data: edge });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scripts/:scriptId/canvases/:canvasId/edges/:edgeId - 删除连接
canvasRouter.delete('/:canvasId/edges/:edgeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scriptId, canvasId, edgeId } = req.params;
    if (!(await validateScriptExists(scriptId))) {
      return res.status(404).json({ success: false, error: '剧本不存在' });
    }

    if (!(await validateCanvasExists(scriptId, canvasId))) {
      return res.status(404).json({ success: false, error: '画布不存在' });
    }

    const existingEdge = await prisma.canvasEdge.findFirst({
      where: { id: edgeId, canvasId },
    });

    if (!existingEdge) {
      return res.status(404).json({ success: false, error: '连接不存在' });
    }

    await prisma.canvasEdge.delete({ where: { id: edgeId } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
