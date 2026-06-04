import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connectionListeners: ((connected: boolean) => void)[] = [];

export function getSocket(): Socket {
  if (!socket) {
    const socketUrl = import.meta.env.DEV 
      ? 'http://localhost:3001'  // 开发环境：直接连接后端
      : window.location.origin;   // 生产环境：使用同源
    
    socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
      connectionListeners.forEach(listener => listener(true));
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      connectionListeners.forEach(listener => listener(false));
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error);
      connectionListeners.forEach(listener => listener(false));
    });
  }

  return socket;
}

// 获取连接状态
export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// 监听连接状态变化
export function onConnectionChange(callback: (connected: boolean) => void): () => void {
  connectionListeners.push(callback);
  // 立即通知当前连接状态
  if (socket?.connected) {
    callback(true);
  }
  return () => {
    connectionListeners = connectionListeners.filter(l => l !== callback);
  };
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
  if (socket) {
    socket.disconnect();
    // 清空所有连接状态监听器，防止内存泄漏
    connectionListeners = [];
    socket = null;
  }
}

// 重置连接状态监听器（用于完全重新初始化 socket）
function resetConnectionListeners(): void {
  connectionListeners = [];
}

export { resetConnectionListeners };
