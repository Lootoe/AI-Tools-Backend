import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { sendVerificationEmail } from '../lib/email.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 验证 schema
const sendCodeSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  type: z.enum(['register', 'reset_password']).default('register'),
});

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少6位'),
  code: z.string().length(6, '验证码为6位'),
  nickname: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
});

// 发送验证码
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const { email, type } = sendCodeSchema.parse(req.body);

    // 注册时检查邮箱是否已存在
    if (type === 'register') {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(400).json({ error: '该邮箱已注册' });
      }
    }

    // 重置密码时检查邮箱是否存在
    if (type === 'reset_password') {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) {
        return res.status(400).json({ error: '该邮箱未注册' });
      }
    }

    // 检查是否频繁发送（1分钟内只能发一次）
    const recentCode = await prisma.verificationCode.findFirst({
      where: {
        email,
        type,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });
    if (recentCode) {
      return res.status(400).json({ error: '发送太频繁，请稍后再试' });
    }

    // 生成6位验证码
    const code = Math.random().toString().slice(2, 8);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟有效

    await prisma.verificationCode.create({
      data: { email, code, type, expiresAt },
    });

    await sendVerificationEmail(email, code);
    res.json({ success: true, message: '验证码已发送' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('发送验证码失败:', error);
    res.status(500).json({ error: '发送验证码失败，请稍后再试' });
  }
});

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, code, nickname } = registerSchema.parse(req.body);

    // 检查邮箱是否已注册
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: '该邮箱已注册' });
    }

    // 验证验证码
    const verification = await prisma.verificationCode.findFirst({
      where: {
        email,
        code,
        type: 'register',
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      return res.status(400).json({ error: '验证码无效或已过期' });
    }

    // 创建用户
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        nickname: nickname || email.split('@')[0],
      },
    });

    // 标记验证码已使用
    await prisma.verificationCode.update({
      where: { id: verification.id },
      data: { used: true },
    });

    // 生成 token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        balance: user.balance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('注册失败:', error);
    res.status(500).json({ error: '注册失败，请稍后再试' });
  }
});

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        balance: user.balance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('登录失败:', error);
    res.status(500).json({ error: '登录失败，请稍后再试' });
  }
});

// 获取当前用户信息
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未登录' });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, nickname: true, avatar: true, balance: true },
    });

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
});

export { router as authRouter };
