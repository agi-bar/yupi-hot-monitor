export function sanitizeSource(source: any): any {
  if (!source) return source;

  const sanitized = { ...source };

  // 删除敏感字段
  delete sanitized.config;
  delete sanitized.allowedRoles;

  return sanitized;
}

export function sanitizeSources(sources: any[]): any[] {
  return sources.map(sanitizeSource);
}

export function sanitizeDataSource(source: any): any {
  if (!source) return source;

  const sanitized = { ...source };

  // 删除敏感配置字段
  delete sanitized.config;
  delete sanitized.credentials;

  return sanitized;
}

export function sanitizeError(error: Error, isProduction = false): string {
  if (isProduction) {
    // 生产环境不返回详细错误信息
    return 'An error occurred. Please try again later.';
  }
  
  // 开发环境返回基本错误信息
  return error.message || 'Unknown error';
}
