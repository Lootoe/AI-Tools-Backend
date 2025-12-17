import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from 'openai/resources/chat/completions';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_API_BASE_URL + '/v1',
});

// 多模态消息内容类型（用于前端转换）
export interface ChatMessageWithImages {
  role: 'system' | 'user' | 'assistant';
  content: ChatCompletionContentPart[];
}

// 使用 OpenAI SDK 的消息类型
export type ChatMessage = ChatCompletionMessageParam;

export interface ChatOptions {
  model: string;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatOptions
) {
  return openai.chat.completions.create({
    model: options.model,
    messages,
    temperature: options.temperature ?? 0.7,
    top_p: options.topP ?? 1,
    frequency_penalty: options.frequencyPenalty ?? 0,
    presence_penalty: options.presencePenalty ?? 0,
    stream: false,
  });
}

export async function* createChatCompletionStream(
  messages: ChatMessage[],
  options: ChatOptions
) {
  const stream = await openai.chat.completions.create({
    model: options.model,
    messages,
    temperature: options.temperature ?? 0.7,
    top_p: options.topP ?? 1,
    frequency_penalty: options.frequencyPenalty ?? 0,
    presence_penalty: options.presencePenalty ?? 0,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

export { openai };
