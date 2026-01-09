import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = '12345@admin.com';
    const password = '1004';
    const balance = 100;

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
        console.log('管理员账号已更新:', updatedUser.email);
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
        console.log('管理员账号已创建:', user.email);
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
