/**
 * Unified error handler middleware.
 * Wraps all Express errors into a consistent format before sending to the client.
 * Never exposes internal error details (stack traces, file paths, SQL queries).
 */
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../services/LoggerService.js';

export interface ApiError {
    statusCode: number;
    code: string;
    title: string;
    message: string;
    suggestion?: string;
}

/**
 * Map known error types to user-friendly ApiError objects.
 * Unknown errors (e.g. unhandled exceptions) get a generic "Internal Server Error" response.
 */
function toApiError(err: any): ApiError {
    // 参数校验错误：使用中间件提供的 details，帮助前端定位具体字段
    if (err.code === 'VALIDATION_ERROR' || err.name === 'ValidationError' || err.name === 'ZodError') {
        return {
            statusCode: err.statusCode || 400,
            code: 'VALIDATION_ERROR',
            title: '参数校验失败',
            message: err.message || '请求参数不符合要求',
            suggestion: '请检查输入参数'
        };
    }

    // Known application errors (thrown intentionally)
    if (err.code === 'TASK_NOT_FOUND') {
        return { statusCode: 404, code: 'TASK_NOT_FOUND', title: '任务不存在', message: '该任务可能已被删除或已完成', suggestion: '请刷新页面查看最新任务列表' };
    }
    if (err.message?.includes('blocked by Compliance')) {
        return { statusCode: 400, code: 'COMPLIANCE_BLOCKED', title: '内容合规检查未通过', message: err.message, suggestion: '请修改内容后重试' };
    }
    if (err.message?.includes('Daily publish limit')) {
        return { statusCode: 429, code: 'PUBLISH_LIMIT', title: '今日发布已达上限', message: err.message, suggestion: '请明天再试或更换账号' };
    }
    if (err.message?.includes('Invalid credentials')) {
        return { statusCode: 401, code: 'INVALID_CREDENTIALS', title: '登录失败', message: '用户名或密码错误', suggestion: '请检查输入后重试' };
    }
    if (err.message?.includes('Invalid token')) {
        return { statusCode: 403, code: 'INVALID_TOKEN', title: '认证已过期', message: '登录状态已失效,请重新登录', suggestion: '请重新登录' };
    }
    if (err.message?.includes('No token provided')) {
        return { statusCode: 401, code: 'NO_TOKEN', title: '未登录', message: '请先登录后再访问', suggestion: '请前往登录页面' };
    }
    if (err.message?.includes('not found') || err.message?.includes('不存在')) {
        return { statusCode: 404, code: 'NOT_FOUND', title: '资源不存在', message: err.message, suggestion: '请检查请求的资源是否存在' };
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return { statusCode: 403, code: 'TOKEN_ERROR', title: '认证异常', message: '登录状态异常,请重新登录', suggestion: '请重新登录' };
    }

    // Rate limit errors
    if (err.statusCode === 429) {
        return { statusCode: 429, code: 'RATE_LIMITED', title: '请求过于频繁', message: '请稍后再试', suggestion: '等待一分钟后重试' };
    }

    // Fallback: never expose internal details to the client
    return {
        statusCode: err.statusCode || err.status || 500,
        code: 'INTERNAL_ERROR',
        title: '服务器内部错误',
        message: process.env.NODE_ENV === 'production' ? '请稍后再试' : (err.message || '未知错误'),
        suggestion: '如果问题持续,请联系管理员'
    };
}

/**
 * Express error-handling middleware (4 parameters).
 * Catches all errors thrown in route handlers and returns a consistent JSON response.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
    // Log the full error server-side
    Logger.error('API', err.message || 'Unknown error', {
        path: req.path,
        method: req.method,
        statusCode: err.statusCode || 500,
        stack: err.stack?.split('\n').slice(0, 3).join('\n'),
    });

    const apiError = toApiError(err);
    const response: Record<string, any> = {
        success: false,
        error: apiError.message,
        code: apiError.code,
        title: apiError.title,
        suggestion: apiError.suggestion,
    };

    // 校验错误额外返回 details，方便前端做字段级提示
    if (apiError.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        response.details = err.details;
    }

    res.status(apiError.statusCode).json(response);
}

/**
 * Wrap an async route handler so that errors are caught and forwarded to the error handler.
 * Usage: router.get('/path', asyncHandler((req, res) => { ... }))
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}