// 提示词模板接口
export interface PromptTemplate {
    id: string;
    label: string;
    description: string;
    prompt: string;
}

// 提示词配置
export const promptsConfig = {
    video: [
        {
            id: 'video-default',
            label: '通用视频模板',
            description: '适用于大多数分镜视频生成场景',
            prompt: '以第1张参考图为本视频的首帧，角色、场景、景别、镜头、构图、色彩必须完全一致。',
        },
        {
            id: 'video-none',
            label: '无模板',
            description: '直接使用用户输入的脚本',
            prompt: '',
        },
    ],
    storyboardImage: [
        {
            id: 'image-9grid',
            label: '9宫格分镜',
            description: '生成3x3九宫格动漫分镜设计稿',
            prompt: '【任务：请按照用户要求，多图生成9宫格动漫分镜设计稿】1.布局结构：9宫格，3行×3列。画面整体为标准分镜稿格式，每个宫格独立为一个镜头，宫格之间有清晰的白色分隔线。2.右上角预留镜头顺序编号区域（格式：No.1/No.2…）。3.所有分镜稿的宫格布局、风格、分辨率、标注区域格式完全统一，支持后续自动化拼接为长漫剧分镜序列。4.优化指令：优先保证分镜的功能性，其次提升画面的美观度，弱化非必要的背景细节，突出主体和镜头信息。5.镜头连贯，运镜丝滑。6.用气泡展示对话。如果对话过长，将其分割到若干分镜中。7.用户要求 = [',
        },
        {
            id: 'image-none',
            label: '无模板',
            description: '直接使用用户输入的描述',
            prompt: '',
        },
    ],
    asset: [
        {
            id: 'asset-character',
            label: '通用角色提示词',
            description: '生成多角度、多表情、多姿势的角色设计图',
            prompt: '请根据以下角色信息，生成一份完整的角色设计参考图，包含以下模块：\n1. 【配色】：列出角色主色调。\n2. 【多角度视图】：正面、侧面、背面的全身展示。\n3. 【细节】列出至少3个角色设计细节（如：服饰、配饰、物品）。\n4. 【动作姿势】：至少3个动态动作（如跑、跳、坐）。\n5. 【表情集合】：至少5种不同情绪的面部表情（如开心、害羞、生气）。\n\n角色信息：',
        },
        {
            id: 'asset-scene',
            label: '通用场景提示词',
            description: '生成多视角、场景细节元素的设计图',
            prompt: '请根据以下场景核心设定，生成一份场景设计参考图，包含以下模块：\n1. 【场景基础信息】：明确场景类型 + 核心氛围 + 主色调组合。\n2. 【多视角视图】：整体俯瞰视角、核心区域近景视角、细节角落特写。\n3. 【场景细节元素】：贴合风格的场景细节元素。\n\n场景核心设定：',
        },
        {
            id: 'asset-prop',
            label: '通用物品提示词',
            description: '生成多视角、材质细节的物品设计图',
            prompt: '请根据关联的角色/场景信息，生成该物品的设计参考图，包含以下模块：\n1. 【材质信息】色调+材质\n2. 【多视角展示】：正面、侧面、细节特写\n3. 【细节】：至少2处细节\n\n物品关联信息：',
        },
        {
            id: 'asset-none',
            label: '无模板',
            description: '直接使用资产设定作为提示词',
            prompt: '',
        },
    ],
} as const;

export type PromptCategory = keyof typeof promptsConfig;
