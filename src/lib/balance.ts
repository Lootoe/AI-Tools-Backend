import { prisma } from './prisma.js';

// 代币消耗配置
export const TOKEN_COSTS = {
    // 图片生成
    IMAGE_BANANA: 4,      // Nano Banana 2 模型
    IMAGE_DOUBAO: 2,      // 豆包模型
    // 视频生成
    VIDEO_STORYBOARD: 3,  // 分镜视频生成
} as const;

// 根据模型获取图片生成代币消耗
export function getImageTokenCost(model: string): number {
    if (model.includes('nano-banana')) {
        return TOKEN_COSTS.IMAGE_BANANA;
    } else if (model.includes('doubao')) {
        return TOKEN_COSTS.IMAGE_DOUBAO;
    }
    return TOKEN_COSTS.IMAGE_BANANA; // 默认
}

// 余额记录类型
export type BalanceRecordType = 'consume' | 'recharge' | 'refund' | 'invite' | 'redeem';

// 扣除代币（带事务保护和悲观锁）
export async function deductBalance(
    userId: string,
    amount: number,
    description: string,
    relatedId?: string
): Promise<{ success: boolean; balance: number; error?: string }> {
    try {
        // 使用事务 + 悲观锁确保原子性和并发安全
        const result = await prisma.$transaction(async (tx) => {
            // 使用 FOR UPDATE 锁定用户行，防止并发超扣
            const users = await tx.$queryRaw<{ balance: number }[]>`
                SELECT balance FROM users WHERE id = ${userId} FOR UPDATE
            `;

            if (users.length === 0) {
                throw new Error('用户不存在');
            }

            const currentBalance = users[0].balance;

            if (currentBalance < amount) {
                throw new Error('余额不足');
            }

            const newBalance = currentBalance - amount;

            // 更新用户余额
            await tx.user.update({
                where: { id: userId },
                data: { balance: newBalance },
            });

            // 创建余额记录
            await tx.balanceRecord.create({
                data: {
                    userId,
                    type: 'consume',
                    amount: -amount, // 消耗为负数
                    balance: newBalance,
                    description,
                    relatedId,
                },
            });

            return newBalance;
        });

        return { success: true, balance: result };
    } catch (error) {
        const message = error instanceof Error ? error.message : '扣除余额失败';
        return { success: false, balance: 0, error: message };
    }
}

// 返还代币（生成失败时调用，带悲观锁）
export async function refundBalance(
    userId: string,
    amount: number,
    description: string,
    relatedId?: string
): Promise<{ success: boolean; balance: number; error?: string }> {
    try {
        const result = await prisma.$transaction(async (tx) => {
            // 使用 FOR UPDATE 锁定用户行
            const users = await tx.$queryRaw<{ balance: number }[]>`
                SELECT balance FROM users WHERE id = ${userId} FOR UPDATE
            `;

            if (users.length === 0) {
                throw new Error('用户不存在');
            }

            const newBalance = users[0].balance + amount;

            // 更新用户余额
            await tx.user.update({
                where: { id: userId },
                data: { balance: newBalance },
            });

            // 创建余额记录
            await tx.balanceRecord.create({
                data: {
                    userId,
                    type: 'refund',
                    amount: amount, // 返还为正数
                    balance: newBalance,
                    description,
                    relatedId,
                },
            });

            return newBalance;
        });

        return { success: true, balance: result };
    } catch (error) {
        const message = error instanceof Error ? error.message : '返还余额失败';
        return { success: false, balance: 0, error: message };
    }
}

// 获取用户余额记录
export async function getBalanceRecords(
    userId: string,
    page: number = 1,
    pageSize: number = 20
): Promise<{
    records: Array<{
        id: string;
        type: string;
        amount: number;
        balance: number;
        description: string;
        createdAt: Date;
    }>;
    total: number;
}> {
    const [records, total] = await Promise.all([
        prisma.balanceRecord.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                type: true,
                amount: true,
                balance: true,
                description: true,
                createdAt: true,
            },
        }),
        prisma.balanceRecord.count({ where: { userId } }),
    ]);

    return { records, total };
}

// 检查用户余额是否足够
export async function checkBalance(userId: string, amount: number): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true },
    });
    return user ? user.balance >= amount : false;
}
