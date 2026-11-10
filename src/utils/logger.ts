type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (__DEV__) {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
    console[level](`[pdf-vault] ${message}${suffix}`);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
