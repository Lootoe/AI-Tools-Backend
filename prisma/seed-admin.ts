import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.development' });

const prisma = new PrismaClient();

async function main() {
    const email = '12345@admin.com';
    const password = '1004';
    const balance = 999;

    // 检查用户是否已存在
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        // 更新现有用户
        const hashedPassword = await bcrypt.hash(password, 10);
        const updatedUser = await prisma.user.update({
            where: { email },
            data: {
                password: hashedPassword,
                balance,
            },
        });

        // 创建充值记录
        await prisma.balanceRecord.create({
            data: {
                userId: updatedUser.id,
                type: 'recharge',
                amount: balance - existingUser.balance,
                balance: balance,
                description: '管理员充值',
            },
        });

        console.log('管理员账号已更新:', updatedUser.email, '余额:', balance);
    } else {
        // 创建新用户
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                nickname: 'Admin',
                balance,
            },
        });

        // 创建初始余额记录
        await prisma.balanceRecord.create({
            data: {
                userId: user.id,
                type: 'recharge',
                amount: balance,
                balance: balance,
                description: '初始余额',
            },
        });

        console.log('管理员账号已创建:', user.email, '余额:', balance);
    }
}

main()
    .catch((e) => {
        console.error('创建管理员失败:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
