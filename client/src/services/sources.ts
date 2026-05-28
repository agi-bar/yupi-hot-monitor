const API_BASE = '/api';

export interface Source {
  id: string;
  name: string;
  type: string;
  dataSourceId?: string | null;
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

interface ApiError {
  error?: string;
  message?: string;
  details?: string;
  code?: string;
  validTypes?: string[];
  duplicateTypes?: string[];
  errors?: string[];
}

function formatApiError(status: number, errorData: ApiError): string {
  let message = errorData.error || errorData.message || `请求失败 (${status})`;
  
  if (errorData.code) {
    message = `[${errorData.code}] ${message}`;
  }
  
  if (errorData.details) {
    message = `${message}: ${errorData.details}`;
  }
  
  if (errorData.validTypes && errorData.validTypes.length > 0) {
    message = `${message}，可用类型: ${errorData.validTypes.join(', ')}`;
  }
  
  if (errorData.duplicateTypes && errorData.duplicateTypes.length > 0) {
    message = `${message}，重复类型: ${errorData.duplicateTypes.join(', ')}`;
  }
  
  if (errorData.errors && errorData.errors.length > 0) {
    message = `${message}，详情: ${errorData.errors.join('; ')}`;
  }
  
  return message;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let errorMessage = `请求失败 (${response.status})`;
    
    try {
      const errorData: ApiError = await response.json();
      errorMessage = formatApiError(response.status, errorData);
    } catch {
      // 如果解析失败，使用默认错误消息
    }
    
    throw new Error(errorMessage);
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

  getStats: (id: string) =>
    request<SourceStats>(`/sources/${id}/stats`),

  export: () =>
    request<{ data: Source[] }>('/sources/export'),

  import: (sources: Array<{
    name: string;
    type: string;
    category?: string;
    description?: string;
  }>) =>
    request<{ success: number; failed: number; errors: string[] }>('/sources/import', {
      method: 'POST',
      body: JSON.stringify({ sources })
    }),
};
