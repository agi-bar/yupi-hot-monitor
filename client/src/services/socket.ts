import { io, Socket } from 'socket.io-client';
import type { NotificationPayload } from '../types/notification';

let socket: Socket | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

interface SocketState {
  status: ConnectionState;
  attempts: number;
  lastConnected: Date | null;
}

const socketState: SocketState = {
  status: 'disconnected',
  attempts: 0,
  lastConnected: null
};

let subscribedKeywords: string[] = [];
const connectionListeners: Set<(state: SocketState) => void> = new Set();
const reconnectListeners: Set<() => void> = new Set();

function notifyListeners() {
  connectionListeners.forEach(listener => listener({ ...socketState }));
}

export function onConnectionChange(callback: (state: SocketState) => void): () => void {
  connectionListeners.add(callback);
  callback({ ...socketState });
  return () => connectionListeners.delete(callback);
}

export function getSocketState(): SocketState {
  return { ...socketState };
}

export function getSocket(): Socket {
  if (!socket) {
    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    
    socket = io(wsUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: BASE_RECONNECT_DELAY,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      timeout: 20000
    });

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket?.id);
      socketState.status = 'connected';
      socketState.lastConnected = new Date();
      socketState.attempts = 0;
      notifyListeners();
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      socketState.status = 'disconnected';
      notifyListeners();
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error.message);
      socketState.status = 'reconnecting';
      socketState.attempts += 1;
      notifyListeners();
      
      if (socketState.attempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('🔌 Max reconnection attempts reached');
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔌 Socket reconnected after', attemptNumber, 'attempts');
      socketState.status = 'connected';
      socketState.lastConnected = new Date();
      socketState.attempts = 0;
      notifyListeners();

      if (subscribedKeywords.length > 0) {
        console.log('🔌 Re-subscribing to keywords after reconnection:', subscribedKeywords);
        socket?.emit('subscribe', subscribedKeywords);
      }

      reconnectListeners.forEach(callback => callback());
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔌 Reconnection attempt:', attemptNumber);
      socketState.status = 'reconnecting';
      socketState.attempts = attemptNumber;
      notifyListeners();
    });

    socket.on('reconnect_error', (error) => {
      console.warn('🔌 Socket reconnection error:', error.message);
    });

    socket.on('reconnect_failed', () => {
      console.error('🔌 Socket reconnection failed after max attempts');
      socketState.status = 'disconnected';
      notifyListeners();
    });
  }

  return socket;
}

export function subscribeToKeywords(keywords: string[]): void {
  const s = getSocket();
  s.emit('subscribe', keywords);
  subscribedKeywords = [...new Set([...subscribedKeywords, ...keywords])];
}

export function unsubscribeFromKeywords(keywords: string[]): void {
  const s = getSocket();
  s.emit('unsubscribe', keywords);
  subscribedKeywords = subscribedKeywords.filter(k => !keywords.includes(k));
}

export function onReconnect(callback: () => void): () => void {
  reconnectListeners.add(callback);
  return () => reconnectListeners.delete(callback);
}

export function clearSubscribedKeywords(): void {
  subscribedKeywords = [];
}

export interface HotspotEvent {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  sourceId: string | null;
  sourceRecordId: string | null;
  sourceRecord: {
    id: string;
    name: string;
    type: string;
    category: string | null;
  } | null;
  isReal: boolean;
  relevance: number;
  relevanceReason: string | null;
  keywordMentioned: boolean | null;
  importance: 'low' | 'medium' | 'high' | 'urgent';
  summary: string | null;
  viewCount: number | null;
  likeCount: number | null;
  retweetCount: number | null;
  replyCount: number | null;
  commentCount: number | null;
  quoteCount: number | null;
  danmakuCount: number | null;
  authorName: string | null;
  authorUsername: string | null;
  authorAvatar: string | null;
  authorFollowers: number | null;
  authorVerified: boolean | null;
  publishedAt: string | null;
  createdAt: string;
  keyword: { id: string; text: string; category: string | null } | null;
}

export function onNewHotspot(callback: (hotspot: HotspotEvent) => void): () => void {
  const s = getSocket();
  s.on('hotspot:new', callback);
  return () => s.off('hotspot:new', callback);
}

export function onNotification(callback: (notification: NotificationPayload) => void): () => void {
  const s = getSocket();
  s.on('notification', callback);
  return () => s.off('notification', callback);
}

export function reconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketState.status = 'reconnecting';
    socketState.attempts = 0;
    notifyListeners();
    getSocket();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketState.status = 'disconnected';
    socketState.attempts = 0;
    notifyListeners();
  }
}
