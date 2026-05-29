export interface ErrorLogOptions {
  context?: string;
  showToast?: boolean;
  toastMessage?: string;
}

export function logError(
  error: unknown,
  context: string,
  options: ErrorLogOptions = {}
): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  console.error(`[${context}]`, {
    message: errorMessage,
    stack: errorStack,
    timestamp: new Date().toISOString(),
  });

  if (options.showToast && options.toastMessage) {
    console.warn(`[${context}] Toast:`, options.toastMessage);
  }
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '操作失败，请稍后重试';
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('timeout')
    );
  }
  return false;
}

export function getUserFriendlyError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return '请求超时，请稍后重试';
    }
    if (error.message.includes('Network')) {
      return '网络连接失败，请检查网络';
    }
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      return '登录已过期，请重新登录';
    }
    if (error.message.includes('403') || error.message.includes('Forbidden')) {
      return '没有权限执行此操作';
    }
    if (error.message.includes('404') || error.message.includes('Not Found')) {
      return '请求的资源不存在';
    }
    if (error.message.includes('500')) {
      return '服务器错误，请稍后重试';
    }
    return error.message;
  }
  return '操作失败，请稍后重试';
}
