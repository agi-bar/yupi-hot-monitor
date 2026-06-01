interface SanitizableSource {
  config?: unknown;
  allowedRoles?: unknown;
  credentials?: unknown;
  [key: string]: unknown;
}

export function sanitizeSource<T extends SanitizableSource>(source: T | null): T | null {
  if (!source) return source;

  const sanitized = { ...source };
  delete sanitized.config;
  delete sanitized.allowedRoles;

  return sanitized as T;
}

export function sanitizeSources<T extends SanitizableSource>(sources: T[]): T[] {
  return sources.map(s => sanitizeSource(s)) as T[];
}

export function sanitizeDataSource<T extends SanitizableSource>(source: T | null): T | null {
  if (!source) return source;

  const sanitized = { ...source };
  delete sanitized.config;
  delete sanitized.credentials;

  return sanitized as T;
}

export function sanitizeError(error: Error, isProduction = false): string {
  if (isProduction) {
    return 'An error occurred. Please try again later.';
  }
  
  return error.message || 'Unknown error';
}
