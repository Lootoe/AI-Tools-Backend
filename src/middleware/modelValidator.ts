import { Request, Response, NextFunction } from 'express';

// 允许的 AI 模型白名单
const ALLOWED_MODELS = new Set([
    // 图像生成模型
    'nano-banana-2',
    'doubao-image',
    // 视频生成模型
    'sora-2',
]);

// 模型前缀白名单（用于匹配 doubao 系列等）
const ALLOWED_MODEL_PREFIXES = [
    'doubao',
    'nano-banana',
];

/**
 * 检查模型是否在允许列表中
 */
function isModelAllowed(model: string): boolean {
    if (!model) return true; // 没有指定模型的请求放行（由各路由自行处理默认值）

    // 精确匹配
    if (ALLOWED_MODELS.has(model)) return true;

    // 前缀匹配
    return ALLOWED_MODEL_PREFIXES.some(prefix => model.startsWith(prefix));
}

/**
 * 模型验证中间件
 * 检查请求中的 model 参数是否在允许的白名单中
 */
export function modelValidator(req: Request, res: Response, next: NextFunction) {
    const model = req.body?.model || req.query?.model;

    if (model && !isModelAllowed(model)) {
        console.warn(`[ModelValidator] 拒绝非法模型请求: ${model}, IP: ${req.ip}, Path: ${req.path}`);
        return res.status(403).json({
            success: false,
            error: '不支持的模型',
            code: 'MODEL_NOT_ALLOWED',
        });
    }

    next();
}

export { ALLOWED_MODELS, ALLOWED_MODEL_PREFIXES, isModelAllowed };
