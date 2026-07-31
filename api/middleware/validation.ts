import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { Logger } from '../services/LoggerService.js';

// 日志中需要脱敏的字段，避免密码、token、cookie 等敏感信息落入日志
const SENSITIVE_FIELDS = new Set([
    'password', 'oldPassword', 'newPassword', 'token', 'sseToken', 'sse_token',
    'authorization', 'cookie', 'cookies', 'creator_cookies', 'main_site_cookies',
    'web_session', 'websectoken'
]);

/**
 * 统一格式化 Zod 校验错误
 */
function formatZodIssues(error: any) {
    const errorObj = error as any;
    const issues = errorObj.issues || errorObj.errors || [];
    return issues.map((issue: any) => ({
        path: issue.path.join('.'),
        message: issue.message,
    }));
}

/**
 * 功能描述：对日志对象中的敏感字段进行脱敏
 *
 * 参数说明：
 * - value: [any] 任意对象/值
 *
 * 返回说明：
 * - [any] 脱敏后的副本，敏感字段替换为 "***"
 */
function sanitizeForLog(value: any): any {
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeForLog);
    }
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_FIELDS.has(key)) {
            result[key] = '***';
        } else if (typeof val === 'object' && val !== null) {
            result[key] = sanitizeForLog(val);
        } else {
            result[key] = val;
        }
    }
    return result;
}

/**
 * 功能描述：校验错误对象，统一交给全局错误处理器渲染
 *
 * 设计思路：
 * 通过 next(error) 把错误抛给 errorHandler，避免中间件自己构造响应，
 * 确保所有客户端错误都使用统一的 { success, code, title, message, suggestion } 格式。
 */
class ValidationError extends Error {
    public statusCode = 400;
    public code = 'VALIDATION_ERROR';
    public details: Array<{ path: string; message: string }>;

    constructor(details: Array<{ path: string; message: string }>) {
        super('请求参数校验失败');
        this.name = 'ValidationError';
        this.details = details;
    }
}

/**
 * 创建校验中间件
 */
function createValidator(source: 'body' | 'query' | 'params') {
    return (schema: ZodSchema) => {
        return (req: Request, _res: Response, next: NextFunction) => {
            try {
                const result = schema.safeParse(req[source]);

                if (!result.success) {
                    const errorMessages = formatZodIssues(result.error);

                    Logger.warn('Validation', `Request ${source} validation failed`, {
                        path: req.path,
                        errors: errorMessages,
                        [source]: sanitizeForLog(req[source])
                    });

                    return next(new ValidationError(errorMessages));
                }

                // 用解析后的值替换原始值（支持类型转换和清理）
                (req as any)[source] = result.data;
                next();

            } catch (error) {
                Logger.error('Validation', 'Unexpected validation error', error);
                next(error);
            }
        };
    };
}

export const validateBody = createValidator('body');
export const validateQuery = createValidator('query');
export const validateParams = createValidator('params');
