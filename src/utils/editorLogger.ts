/**
 * 编辑器日志工具
 * 用于测试方案中的日志校对，便于排查问题
 *
 * 使用方式：
 * - 开发/测试时：localStorage.setItem('binder_editor_log', 'debug') 后刷新
 * - 默认级别：info（生产环境可关闭 debug）
 */

const PREFIX = '[Binder:Editor]';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getLogLevel(): LogLevel {
  if (typeof localStorage === 'undefined') return 'info';
  const stored = localStorage.getItem('binder_editor_log') as LogLevel | null;
  if (stored && LEVEL_PRIORITY[stored] !== undefined) return stored;
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV ? 'info' : 'info';
}

function shouldLog(level: LogLevel): boolean {
  const current = getLogLevel();
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[current];
}

export const editorLog = {
  debug: (msg: string, data?: object) => {
    if (shouldLog('debug')) {
      console.log(PREFIX, '[DEBUG]', msg, data ?? '');
    }
  },
  info: (msg: string, data?: object) => {
    if (shouldLog('info')) {
      console.log(PREFIX, msg, data ?? '');
    }
  },
  warn: (msg: string, data?: object) => {
    if (shouldLog('warn')) {
      console.warn(PREFIX, msg, data ?? '');
    }
  },
  error: (msg: string, data?: object) => {
    if (shouldLog('error')) {
      console.error(PREFIX, msg, data ?? '');
    }
  },
};
