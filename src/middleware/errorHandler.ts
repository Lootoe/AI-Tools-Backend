import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  // Zod 验证错误
  if (err instanceof ZodError) {
    const firstError = err.errors[0];
    return res.status(400).json({
      success: false,
      error: firstError?.message || '参数验证失败',
    });
  }

  // 自定义应用错误
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Prisma 错误处理
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as { code?: string; meta?: { field_name?: string } };
    if (prismaErr.code === 'P2003') {
      return res.status(400).json({
        success: false,
        error: '关联数据不存在',
      });
    }
    if (prismaErr.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: '数据不存在',
      });
    }
  }

  console.error('Unexpected error:', err);

  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? '服务器内部错误' 
      : err.message,
  });
}
