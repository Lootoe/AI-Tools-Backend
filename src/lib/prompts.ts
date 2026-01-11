import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 提示词模板接口
export interface PromptTemplate {
    id: string;
    label: string;
    description: string;
    prompt: string;
}

// 提示词分类
export type PromptCategory = 'video' | 'storyboardImage' | 'asset';

// 提示词配置接口
interface PromptsConfig {
    video: PromptTemplate[];
    storyboardImage: PromptTemplate[];
    asset: PromptTemplate[];
}

// 获取配置文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsConfigPath = join(__dirname, '../config/prompts.json');

// 加载提示词配置
const loadPromptsConfig = (): PromptsConfig => {
    const content = readFileSync(promptsConfigPath, 'utf-8');
    return JSON.parse(content);
};

// 获取指定分类的提示词模板列表
export const getPromptTemplates = (category: PromptCategory): PromptTemplate[] => {
    const config = loadPromptsConfig();
    return config[category] || [];
};

// 根据分类和ID获取提示词
export const getPromptById = (category: PromptCategory, id: string): string => {
    const templates = getPromptTemplates(category);
    const template = templates.find(t => t.id === id);
    return template?.prompt || '';
};

// 根据分类和ID获取模板名称
export const getPromptLabelById = (category: PromptCategory, id: string): string => {
    const templates = getPromptTemplates(category);
    const template = templates.find(t => t.id === id);
    return template?.label || '';
};
