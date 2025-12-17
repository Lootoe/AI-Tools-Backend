import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_API_BASE_URL + '/v1',
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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
