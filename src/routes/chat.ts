import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createChatCompletionStream, createChatCompletion, ChatMessage, ChatOptions, ChatMessageWithImages } from '../lib/ai.js';

// 将前端消息格式转换为 OpenAI 多模态格式
function convertToOpenAIMessages(messages: Array<{ role: string; content: string; images?: { url: string }[] }>): ChatMessage[] {
  return messages.map(msg => {
    if (msg.images && msg.images.length > 0) {
      // 有图片时，使用多模态格式
      const content: ChatMessageWithImages['content'] = [];
      
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      
      for (const img of msg.images) {
        content.push({ type: 'image_url', image_url: { url: img.url } });
      }
      
      return { role: msg.role, content } as ChatMessage;
    }
    
    // 无图片时，使用普通文本格式
    return { role: msg.role, content: msg.content } as ChatMessage;
  });
}

export const chatRouter = Router();

const completionSchema = z.object({
  model: z.string().min(1, '模型不能为空'),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
    images: z.array(z.object({
      url: z.string(),
    })).optional(),
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

    const openAIMessages = convertToOpenAIMessages(messages);
    const response = await createChatCompletion(openAIMessages, chatOptions);
    
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
      const openAIMessages = convertToOpenAIMessages(messages);
      const stream = createChatCompletionStream(openAIMessages, chatOptions);

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
