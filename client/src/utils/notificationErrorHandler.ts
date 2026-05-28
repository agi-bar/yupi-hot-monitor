export class NotificationError extends Error {
  code: string;
  statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function handleNotificationError(error: unknown, context: string): NotificationError {
  if (error instanceof NotificationError) {
    return error;
  }

  if (error instanceof Error) {
    console.error(`Notification error in ${context}:`, error);
    return new NotificationError(
      error.message,
      'UNKNOWN_ERROR'
    );
  }

  console.error(`Unknown error in ${context}:`, error);
  return new NotificationError(
    'An unknown error occurred',
    'UNKNOWN_ERROR'
  );
}

export function isNotificationError(error: unknown): error is NotificationError {
  return error instanceof NotificationError;
}

export const NOTIFICATION_ERROR_CODES = {
  FETCH_FAILED: 'FETCH_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_ID: 'INVALID_ID',
  NOT_FOUND: 'NOT_FOUND',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;
