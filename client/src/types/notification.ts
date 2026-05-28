export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  hotspotId?: string;
}

export const NOTIFICATION_TYPES = {
  HOTSPOT: 'hotspot',
  KEYWORD: 'keyword',
  SYSTEM: 'system',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

export interface NotificationPayload {
  type: string;
  title: string;
  content: string;
  hotspotId?: string;
  importance?: string;
}

export const NOTIFICATION_MAX_DISPLAY_COUNT = 9;

export const NOTIFICATION_PAGE_SIZE = 20;

export const NOTIFICATION_EXPIRE_DAYS = 30;

export const NOTIFICATION_MAX_LENGTH = {
  TITLE: 50,
  CONTENT: 100,
};
