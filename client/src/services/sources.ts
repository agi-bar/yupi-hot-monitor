const API_BASE = '/api';

export interface Source {
  id: string;
  name: string;
  type: string;
  category: string | null;
  status: 'active' | 'paused' | 'error';
  priority: number;
  description: string | null;
  config: Record<string, unknown> | null;
  credentials: string | null;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  lastUsedAt: string | null;
  isPublic: boolean;
  allowedRoles: string | null;
  hotspotCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
}

export interface SourceReport {
  period: string;
  dateFrom: string;
  dateTo: string;
  summary: {
    totalHotspots: number;
    avgPerDay: string;
  };
  timeline: Array<{
    date: string;
    total: number;
    byImportance: Record<string, number>;
  }>;
  importanceDistribution: Record<string, number>;
  topHotspots: unknown[];
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
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

export const sourcesApi = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    category?: string;
    status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          searchParams.append(key, String(value));
        }
      });
    }
    return request<{
      data: Source[];
      stats: SourceStats;
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/sources?${searchParams}`);
  },

  getById: (id: string) =>
    request<Source>(`/sources/${id}`),

  create: (data: {
    name: string;
    type: string;
    category?: string;
    description?: string;
    config?: Record<string, unknown>;
    priority?: number;
    isPublic?: boolean;
    allowedRoles?: string[];
  }) =>
    request<Source>('/sources', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: (id: string, data: Partial<Source>) =>
    request<Source>(`/sources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  delete: (id: string) =>
    request<void>(`/sources/${id}`, { method: 'DELETE' }),

  batchDelete: (ids: string[]) =>
    request<{ message: string; count: number }>('/sources/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),

  export: () =>
    request<Source[]>('/sources/export'),

  import: (sources: Partial<Source>[]) =>
    request<{ success: number; failed: number; errors: string[] }>('/sources/import', {
      method: 'POST',
      body: JSON.stringify({ sources })
    }),

  updateStats: (id: string, type: 'request' | 'success' | 'error', increment?: number) =>
    request<SourceStats>(`/sources/${id}/stats`, {
      method: 'POST',
      body: JSON.stringify({ type, increment: increment || 1 })
    }),

  getReport: (id: string, period?: '1d' | '7d' | '30d') =>
    request<SourceReport>(`/sources/${id}/report?period=${period || '7d'}`)
};
