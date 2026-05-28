export const NOTIFICATION_CONFIG = {
  EXPIRE_DAYS: 30,
  TITLE_MAX_LENGTH: 50,
  CONTENT_MAX_LENGTH: 100,
  PAGE_SIZE: 20,
  MAX_DISPLAY_COUNT: 9,
};

export const TIME_CONSTANTS = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;

export const IMPORTANCE_LEVELS = {
  HIGH: 'high',
  URGENT: 'urgent',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ImportanceLevel = typeof IMPORTANCE_LEVELS[keyof typeof IMPORTANCE_LEVELS];

export const NOTIFICATION_TYPES = {
  HOTSPOT: 'hotspot',
  KEYWORD: 'keyword',
  SYSTEM: 'system',
} as const;
