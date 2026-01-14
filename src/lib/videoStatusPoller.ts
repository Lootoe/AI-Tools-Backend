/**
 * 视频状态轮询服务
 * 后端独立轮询 Sora2 API，更新数据库中的视频生成状态
 * 不依赖前端请求
 * 支持分镜视频和角色视频
 */

import prisma from './prisma.js';
import { refundBalance, TOKEN_COSTS } from './balance.js';

// Sora2 API 配置
const SORA2_API_BASE = process.env.AI_API_BASE_URL || '';
const POLL_INTERVAL = parseInt(process.env.VIDEO_POLL_INTERVAL || '5000'); // 默认 5 秒
const MAX_POLL_DURATION = parseInt(process.env.VIDEO_MAX_POLL_DURATION || '3600000'); // 默认 1 小时

// 状态映射：Sora2 API 状态 -> 数据库状态
const STATUS_MAP: Record<string, string> = {
    'NOT_START': 'queued',
    'IN_PROGRESS': 'generating',
    'SUCCESS': 'completed',
    'FAILURE': 'failed',
};

// 轮询类型
type PollType = 'variant' | 'character';

// 正在轮询的任务集合（避免重复轮询）
const pollingTasks = new Map<string, { startTime: number; intervalId: NodeJS.Timeout; targetId: string; type: PollType }>();

/**
 * 查询单个任务的状态
 */
async function fetchTaskStatus(taskId: string): Promise<{
    status: string;
    progress?: string;
    videoUrl?: string;
    thumbnailUrl?: string;
    failReason?: string;
} | null> {
    try {
        const response = await fetch(`${SORA2_API_BASE}/v2/videos/generations/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.AI_API_KEY}`,
            },
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as {
            status: string;
            progress?: string;
            data?: { output?: string; thumbnail?: string };
            fail_reason?: string;
        };
        return {
            status: data.status,
            progress: data.progress,
            videoUrl: data.data?.output,
            thumbnailUrl: data.data?.thumbnail,
            failReason: data.fail_reason,
        };
    } catch {
        return null;
    }
}

/**
 * 更新 variant 状态到数据库
 */
async function updateVariantStatus(
    variantId: string,
    status: string,
    progress?: string,
    videoUrl?: string,
    thumbnailUrl?: string,
    isFinished?: boolean,
    failReason?: string
): Promise<void> {
    try {
        await prisma.storyboardVariant.update({
            where: { id: variantId },
            data: {
                status,
                progress,
                ...(videoUrl && { videoUrl }),
                ...(thumbnailUrl && { thumbnailUrl }),
                ...(isFinished && { finishedAt: new Date() }),
                ...(failReason && { failReason }),
            },
        });
    } catch {
        // 静默失败
    }
}

/**
 * 更新 character 状态到数据库
 */
async function updateCharacterStatus(
    characterId: string,
    status: string,
    progress?: string,
    videoUrl?: string,
    thumbnailUrl?: string,
    failReason?: string
): Promise<void> {
    try {
        await prisma.character.update({
            where: { id: characterId },
            data: {
                status,
                progress,
                ...(videoUrl && { videoUrl }),
                ...(thumbnailUrl && { thumbnailUrl }),
                ...(failReason && { failReason }),
            },
        });
    } catch {
        // 静默失败
    }
}

/**
 * 生成失败时返还代币（分镜视频）
 */
async function refundVariantOnFailure(variantId: string, taskId: string): Promise<void> {
    try {
        const variant = await prisma.storyboardVariant.findUnique({
            where: { id: variantId },
            select: { userId: true, tokenCost: true },
        });

        if (variant?.userId && variant?.tokenCost) {
            await refundBalance(
                variant.userId,
                variant.tokenCost,
                '分镜视频生成失败，代币已返还',
                taskId
            );
            console.log(`已返还用户 ${variant.userId} 代币 ${variant.tokenCost}`);
        }
    } catch (error) {
        console.error('返还代币失败:', error);
    }
}

/**
 * 生成失败时返还代币（角色视频）
 */
async function refundCharacterOnFailure(characterId: string, taskId: string): Promise<void> {
    try {
        const character = await prisma.character.findUnique({
            where: { id: characterId },
            select: { userId: true, tokenCost: true },
        });

        if (character?.userId && character?.tokenCost) {
            await refundBalance(
                character.userId,
                character.tokenCost,
                '角色视频生成失败，代币已返还',
                taskId
            );
            console.log(`已返还用户 ${character.userId} 代币 ${character.tokenCost}`);
        }
    } catch (error) {
        console.error('返还代币失败:', error);
    }
}

/**
 * 停止轮询某个任务
 */
function stopPolling(taskId: string): void {
    const task = pollingTasks.get(taskId);
    if (task) {
        clearInterval(task.intervalId);
        pollingTasks.delete(taskId);
    }
}

/**
 * 开始轮询某个任务
 */
export function startPolling(taskId: string, targetId: string, type: PollType = 'variant'): void {
    // 如果已经在轮询，跳过
    if (pollingTasks.has(taskId)) {
        return;
    }

    const startTime = Date.now();

    const poll = async () => {
        // 检查是否超时
        if (Date.now() - startTime > MAX_POLL_DURATION) {
            if (type === 'variant') {
                await updateVariantStatus(targetId, 'failed', undefined, undefined, undefined, true);
                await refundVariantOnFailure(targetId, taskId);
            } else {
                await updateCharacterStatus(targetId, 'failed');
                await refundCharacterOnFailure(targetId, taskId);
            }
            stopPolling(taskId);
            return;
        }

        const result = await fetchTaskStatus(taskId);
        if (!result) return;

        const dbStatus = STATUS_MAP[result.status] || 'generating';
        const isFinished = result.status === 'SUCCESS' || result.status === 'FAILURE';

        if (type === 'variant') {
            await updateVariantStatus(
                targetId,
                dbStatus,
                result.progress,
                result.videoUrl,
                result.thumbnailUrl,
                isFinished,
                result.failReason
            );
        } else {
            await updateCharacterStatus(
                targetId,
                dbStatus,
                result.progress,
                result.videoUrl,
                result.thumbnailUrl,
                result.failReason
            );
        }

        // 如果任务完成或失败，停止轮询
        if (isFinished) {
            // 失败时返还代币
            if (result.status === 'FAILURE') {
                if (type === 'variant') {
                    await refundVariantOnFailure(targetId, taskId);
                } else {
                    await refundCharacterOnFailure(targetId, taskId);
                }
            }
            stopPolling(taskId);
        }
    };

    // 立即执行一次
    poll();

    // 设置定时轮询
    const intervalId = setInterval(poll, POLL_INTERVAL);
    pollingTasks.set(taskId, { startTime, intervalId, targetId, type });
}

/**
 * 启动时恢复未完成任务的轮询
 */
export async function resumePendingPolls(): Promise<void> {
    try {
        // 查找所有状态为 queued 或 generating 且有 taskId 的 variants
        const pendingVariants = await prisma.storyboardVariant.findMany({
            where: {
                status: { in: ['queued', 'generating'] },
                taskId: { not: null },
            },
        });

        for (const variant of pendingVariants) {
            if (variant.taskId) {
                startPolling(variant.taskId, variant.id, 'variant');
            }
        }

        // 查找所有状态为 queued 或 generating 且有 taskId 的 characters
        const pendingCharacters = await prisma.character.findMany({
            where: {
                status: { in: ['queued', 'generating'] },
                taskId: { not: null },
            },
        });

        for (const character of pendingCharacters) {
            if (character.taskId) {
                startPolling(character.taskId, character.id, 'character');
            }
        }
    } catch {
        // 静默失败
    }
}

/**
 * 获取当前轮询状态
 */
export function getPollingStatus(): { taskId: string; duration: number }[] {
    const now = Date.now();
    return Array.from(pollingTasks.entries()).map(([taskId, { startTime }]) => ({
        taskId,
        duration: now - startTime,
    }));
}

/**
 * 停止所有轮询（用于优雅关闭）
 */
export function stopAllPolling(): void {
    for (const taskId of pollingTasks.keys()) {
        stopPolling(taskId);
    }
}
