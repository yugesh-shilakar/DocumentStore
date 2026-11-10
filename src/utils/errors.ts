export class AppError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function toUserMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function isRetryable(error: unknown): boolean {
  return error instanceof AppError && error.retryable;
}
