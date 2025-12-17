import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createChatCompletionStream, createChatCompletion, ChatMessage, ChatOptions } from '../lib/ai.js';

export const chatRouter = Router();

const completionSchema = z.object({
  model: z.string().min(1, '模型不能为空'),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).min(1, '消息不能为空'),
  parameters: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
  }).optional(),
});

// 非流式聊天
chatRouter.post('/completions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model, messages, parameters } = completionSchema.parse(req.body);

    const chatOptions: ChatOptions = {
      model,
      temperature: parameters?.temperature,
      topP: parameters?.topP,
      frequencyPenalty: parameters?.frequencyPenalty,
      presencePenalty: parameters?.presencePenalty,
    };

    const response = await createChatCompletion(messages as ChatMessage[], chatOptions);
    
    res.json({
      id: response.id,
      content: response.choices[0]?.message?.content || '',
      model: response.model,
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    });
  } catch (error) {
    next(error);
  }
});

// 流式聊天
chatRouter.post('/completions/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model, messages, parameters } = completionSchema.parse(req.body);

    const chatOptions: ChatOptions = {
      model,
      temperature: parameters?.temperature,
      topP: parameters?.topP,
      frequencyPenalty: parameters?.frequencyPenalty,
      presencePenalty: parameters?.presencePenalty,
    };

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullContent = '';

    try {
      const stream = createChatCompletionStream(messages as ChatMessage[], chatOptions);

      for await (const chunk of stream) {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'done', content: fullContent })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : '生成失败' })}\n\n`);
    }

    res.end();
  } catch (error) {
    next(error);
  }
});
