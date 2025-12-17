import { Router } from 'express';

export const modelRouter = Router();

// 默认模型列表
const defaultModels = [
  {
    id: 'gpt-5.1-thinking',
    name: 'GPT-5.1 Thinking',
    provider: 'openai',
    description: 'GPT-5.1 推理模型',
  },
  {
    id: 'claude-sonnet-4-5-20250929-thinking',
    name: 'Claude Sonnet 4.5 Thinking',
    provider: 'anthropic',
    description: 'Claude Sonnet 4.5 推理模型，支持扩展思考',
  },
  {
    id: 'deepseek-v3-1-250821-thinking',
    name: 'DeepSeek V3.1 Thinking',
    provider: 'custom',
    description: 'DeepSeek V3.1 推理模型',
  },
  {
    id: 'doubao-pro-32k',
    name: 'Doubao Pro 32K',
    provider: 'custom',
    description: '豆包 Pro 32K 模型',
  },
];

// 获取可用模型列表
modelRouter.get('/', (_req, res) => {
  res.json(defaultModels);
});
