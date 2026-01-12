import { promptsConfig, PromptTemplate, PromptCategory } from '../config/prompts.js';

export type { PromptTemplate, PromptCategory };

// 获取指定分类的提示词模板列表
export const getPromptTemplates = (category: PromptCategory): PromptTemplate[] => {
    return [...promptsConfig[category]];
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
