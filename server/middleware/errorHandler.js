/**
 * 统一错误类型与错误处理中间件。
 * 业务层只抛 AppError，HTTP 状态码由这里统一映射，避免控制器里散落 res.status(xxx)。
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const notFound = (message = '资源不存在') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message) => new AppError(409, 'CONFLICT', message);
export const upstreamError = (message) => new AppError(502, 'UPSTREAM_ERROR', message);

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // 数据库唯一约束冲突（幂等令牌重复等）
  if (err && err.code && String(err.code).startsWith('SQLITE_CONSTRAINT')) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: '数据约束冲突，请检查提交内容' },
    });
  }

  console.error('[UnhandledError]', err);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  });
}

/** 兜底：未匹配路由 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `接口不存在: ${req.method} ${req.originalUrl}` },
  });
}
