const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('authToken');
  if (token) {
    return {
      'Authorization': `Bearer ${token}`
    };
  }
  return {};
}

export interface Keyword {
  id: string;
  text: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { hotspots: number };
}

export interface Hotspot {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  sourceId: string | null;
  sourceRecordId: string | null;
  sourceRecord?: {
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

export interface Stats {
  total: number;
  today: number;
  urgent: number;
  bySource: Record<string, number>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = getAuthHeaders();
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Keywords API
export const keywordsApi = {
  getAll: () => request<Keyword[]>('/keywords'),
  
  getById: (id: string) => request<Keyword>(`/keywords/${id}`),
  
  create: (data: { text: string; category?: string }) => 
    request<Keyword>('/keywords', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  
  update: (id: string, data: Partial<Keyword>) => 
    request<Keyword>(`/keywords/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  
  delete: (id: string) => 
    request<void>(`/keywords/${id}`, { method: 'DELETE' }),
  
  toggle: (id: string) => 
    request<Keyword>(`/keywords/${id}/toggle`, { method: 'PATCH' })
};

// Hotspots API
export const hotspotsApi = {
  getAll: (params?: { 
    page?: number; 
    limit?: number; 
    source?: string; 
    sourceRecordId?: string;
    importance?: string; 
    keywordId?: string;
    isReal?: string;
    timeRange?: string;
    timeFrom?: string;
    timeTo?: string;
    sortBy?: string;
    sortOrder?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') searchParams.append(key, String(value));
      });
    }
    return request<{ data: Hotspot[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/hotspots?${searchParams}`
    );
  },
  
  getStats: () => request<Stats>('/hotspots/stats'),
  
  getById: (id: string) => request<Hotspot>(`/hotspots/${id}`),
  
  search: (query: string, sources?: string[]) => 
    request<{ results: Hotspot[] }>('/hotspots/search', {
      method: 'POST',
      body: JSON.stringify({ query, sources })
    }),
  
  delete: (id: string) => 
    request<void>(`/hotspots/${id}`, { method: 'DELETE' }),
  
  batchDelete: (ids: string[]) =>
    request<{ message: string; count: number }>('/hotspots/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids, confirm: true })
    })
};

// Notifications API
export const notificationsApi = {
  getAll: (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.append(key, String(value));
      });
    }
    return request<{ data: Notification[]; unreadCount: number; pagination: PaginationMeta }>(
      `/notifications?${searchParams}`
    );
  },
  
  markAsRead: (id: string) => 
    request<Notification>(`/notifications/${id}/read`, { method: 'PATCH' }),
  
  markAllAsRead: () => 
    request<void>('/notifications/read-all', { method: 'PATCH' }),
  
  delete: (id: string) => 
    request<void>(`/notifications/${id}`, { method: 'DELETE' }),
  
  clear: () => 
    request<void>('/notifications', { 
      method: 'DELETE',
      body: JSON.stringify({ confirm: true })
    })
};

// Settings API
export const settingsApi = {
  getAll: () => request<Record<string, string>>('/settings'),
  
  update: (settings: Record<string, string>) => 
    request<void>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    })
};

// Manual trigger
export const triggerHotspotCheck = () => 
  request<{ message: string }>('/check-hotspots', { method: 'POST' });
