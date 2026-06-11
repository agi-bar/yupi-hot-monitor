import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000]; // 渐进式重连延迟

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`🔌 Socket reconnection attempt #${attempt}`);
    });

    socket.on('reconnect', (attempt) => {
      console.log(`🔌 Socket reconnected after ${attempt} attempts`);
    });

    socket.on('reconnect_failed', () => {
      console.error('🔌 Socket reconnection failed, scheduling manual retry');
      // 备用定时重连（应对 Socket.IO 内部重连耗尽）
      const delay = RECONNECT_DELAYS[0] ?? 1000;
      reconnectTimer = setTimeout(() => {
        if (socket) {
          socket.connect();
        }
      }, delay);
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error.message);
    });
  }

  return socket;
}

export function subscribeToKeywords(keywords: string[]): void {
  const s = getSocket();
  s.emit('subscribe', keywords);
}

export function unsubscribeFromKeywords(keywords: string[]): void {
  const s = getSocket();
  s.emit('unsubscribe', keywords);
}

export interface HotspotEvent {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  importance: string;
  summary: string | null;
  keyword?: { text: string } | null;
}

export interface NotificationEvent {
  type: string;
  title: string;
  content: string;
  hotspotId?: string;
  importance?: string;
}

export function onNewHotspot(callback: (hotspot: HotspotEvent) => void): () => void {
  const s = getSocket();
  s.on('hotspot:new', callback);
  return () => s.off('hotspot:new', callback);
}

export function onNotification(callback: (notification: NotificationEvent) => void): () => void {
  const s = getSocket();
  s.on('notification', callback);
  return () => s.off('notification', callback);
}

export function disconnectSocket(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
