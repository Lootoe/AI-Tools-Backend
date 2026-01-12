import { Router, Request, Response } from 'express';
import { getPromptTemplates, PromptCategory } from '../lib/prompts.js';

export const configRouter = Router();

// 获取提示词模板列表
// GET /api/config/prompt-templates?category=video|storyboardImage|asset
configRouter.get('/prompt-templates', (req: Request, res: Response) => {
    try {
        const category = req.query.category as PromptCategory;

        if (!category || !['video', 'storyboardImage', 'asset', 'character'].includes(category)) {
            return res.status(400).json({ error: '请指定有效的 category 参数：video, storyboardImage, asset, character' });
        }

        const templates = getPromptTemplates(category);
        // 只返回 id, label, description，不暴露 prompt 内容
        const data = templates.map(t => ({
            id: t.id,
            label: t.label,
            description: t.description,
        }));

        res.json({ success: true, data });
    } catch (error) {
        console.error('加载提示词配置失败:', error);
        res.status(500).json({ error: '加载配置失败' });
    }
});
