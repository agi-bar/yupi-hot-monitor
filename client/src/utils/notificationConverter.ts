import type { Notification } from '../types/notification';

export function toNotification(data: unknown): Notification {
  const d = data as Notification;
  return {
    id: d.id,
    type: d.type || 'hotspot',
    title: d.title,
    content: d.content,
    isRead: d.isRead,
    createdAt: d.createdAt,
    hotspotId: d.hotspotId
  };
}
