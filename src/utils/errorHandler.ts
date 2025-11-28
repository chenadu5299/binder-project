/**
 * 统一错误处理工具
 */

export const handleError = (error: unknown, context?: string): string => {
  const message = error instanceof Error ? error.message : '未知错误';
  const errorContext = context || 'Unknown';
  
  console.error(`[${errorContext}]`, error);
  
  // 返回用户友好的错误消息
  return message;
};

/**
 * 显示错误提示
 */
export const showError = (message: string, context?: string) => {
  console.error(`[${context || 'Error'}]`, message);
  // 动态导入 toast 避免循环依赖
  import('../components/Common/Toast').then(({ toast }) => {
    toast.error(message);
  });
};

/**
 * 显示成功提示
 */
export const showSuccess = (message: string) => {
  console.log('[Success]', message);
  import('../components/Common/Toast').then(({ toast }) => {
    toast.success(message);
  });
};

/**
 * 显示警告提示
 */
export const showWarning = (message: string) => {
  console.warn('[Warning]', message);
  import('../components/Common/Toast').then(({ toast }) => {
    toast.warning(message);
  });
};

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NetworkError = '网络错误',
  FileNotFound = '文件未找到',
  PermissionDenied = '权限不足',
  InvalidInput = '输入无效',
  Unknown = '未知错误',
}

/**
 * 根据错误类型返回用户友好的消息
 */
export const getErrorMessage = (error: unknown, type?: ErrorType): string => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return type || ErrorType.NetworkError;
    }
    
    if (message.includes('not found') || message.includes('不存在')) {
      return type || ErrorType.FileNotFound;
    }
    
    if (message.includes('permission') || message.includes('权限')) {
      return type || ErrorType.PermissionDenied;
    }
    
    return error.message;
  }
  
  return type || ErrorType.Unknown;
};

