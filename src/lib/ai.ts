import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_API_BASE_URL + '/v1',
  timeout: 120000, // 120秒超时（默认是60秒）
  maxRetries: 2, // 失败后重试2次
});

export { openai };
