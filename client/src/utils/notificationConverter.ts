import type { Notification } from '../types/notification';
import { generateNotificationId } from './idGenerator';

export function toNotification(data: unknown): Notification {
  if (!data || typeof data !== 'object') {
    console.warn('Invalid notification data: not an object');
    return createDefaultNotification();
  }

  const d = data as Record<string, unknown>;

  const id = typeof d.id === 'string' && d.id.length > 0 ? d.id : generateNotificationId();
  const type = typeof d.type === 'string' ? d.type : 'hotspot';
  const title = typeof d.title === 'string' ? d.title : '';
  const content = typeof d.content === 'string' ? d.content : '';
  const isRead = typeof d.isRead === 'boolean' ? d.isRead : false;
  const createdAt = typeof d.createdAt === 'string' ? d.createdAt : new Date().toISOString();
  const hotspotId = typeof d.hotspotId === 'string' ? d.hotspotId : undefined;

  return {
    id,
    type,
    title,
    content,
    isRead,
    createdAt,
    hotspotId
  };
}

function createDefaultNotification(): Notification {
  return {
    id: generateNotificationId(),
    type: 'hotspot',
    title: '',
    content: '',
    isRead: false,
    createdAt: new Date().toISOString(),
    hotspotId: undefined
  };
}
