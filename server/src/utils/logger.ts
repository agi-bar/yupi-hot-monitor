const isProduction = process.env.NODE_ENV === 'production';

export function logError(context: string, error: unknown, additionalInfo?: Record<string, any>): void {
  if (isProduction) {
    // 生产环境：只记录错误消息，不记录堆栈
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR] ${context}: ${errorMessage}`);
    if (additionalInfo) {
      console.error('[ERROR] Additional info:', additionalInfo);
    }
  } else {
    // 开发环境：记录完整错误信息
    if (error instanceof Error) {
      console.error(`[ERROR] ${context}:`, error.message);
      if (additionalInfo) {
        console.error('[ERROR] Additional info:', additionalInfo);
      }
      console.error(error.stack);
    } else {
      console.error(`[ERROR] ${context}:`, error);
    }
  }
}

export function logInfo(context: string, message: string, data?: Record<string, any>): void {
  if (isProduction) {
    // 生产环境：只记录关键信息
    console.log(`[INFO] ${context}: ${message}`);
  } else {
    // 开发环境：记录详细信息
    console.log(`[INFO] ${context}: ${message}`, data || '');
  }
}

export function logWarning(context: string, message: string, data?: Record<string, any>): void {
  if (isProduction) {
    console.warn(`[WARN] ${context}: ${message}`);
  } else {
    console.warn(`[WARN] ${context}: ${message}`, data || '');
  }
}

export function logDebug(context: string, message: string, data?: Record<string, any>): void {
  if (process.env.DEBUG === 'true' && !isProduction) {
    console.log(`[DEBUG] ${context}: ${message}`, data || '');
  }
}
