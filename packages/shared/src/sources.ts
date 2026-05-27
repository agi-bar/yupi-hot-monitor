export const SOURCE_TYPE_OPTIONS = [
  'twitter',
  'weibo', 
  'bing',
  'google',
  'baidu',
  'douyin',
  'xiaohongshu',
  'video-source'
] as const;

export type SourceType = typeof SOURCE_TYPE_OPTIONS[number];

export const SOURCE_STATUS_OPTIONS = ['active', 'paused', 'error'] as const;
export type SourceStatus = typeof SOURCE_STATUS_OPTIONS[number];

export const SOURCE_CATEGORY_OPTIONS = ['social', 'search', 'news', 'video'] as const;
export type SourceCategory = typeof SOURCE_CATEGORY_OPTIONS[number];

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  category: SourceCategory | null;
  status: SourceStatus;
  priority: number;
  description: string | null;
  config: unknown | null;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  lastUsedAt: string | null;
  isPublic: boolean;
  hotspotCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceWithDetails extends Source {
  importanceStats?: Array<{
    importance: string;
    _count: number;
  }>;
  hotspots?: Array<{
    id: string;
    title: string;
    createdAt: string;
    importance: string;
  }>;
}

export interface SourceStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  successRate?: string;
}

export interface SourceReport {
  period: '1d' | '7d' | '30d';
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

export interface SourceCreateInput {
  name: string;
  type: SourceType;
  category?: SourceCategory | null;
  description?: string | null;
  config?: unknown | null;
  priority?: number;
  isPublic?: boolean;
  allowedRoles?: string[] | null;
}

export interface SourceUpdateInput extends Partial<Omit<SourceCreateInput, 'type'>> {
  type?: SourceType;
  status?: SourceStatus;
}

export interface SourceFilters {
  type?: SourceType | '';
  category?: SourceCategory | '';
  status?: SourceStatus | '';
  search?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SourceListResponse {
  data: Source[];
  stats: SourceStats;
  pagination: PaginationMeta;
}

export interface BatchDeleteRequest {
  ids: string[];
  confirm: boolean;
}

export interface BatchDeleteResponse {
  message: string;
  count: number;
}

export interface ImportSourcesRequest {
  sources: Array<SourceCreateInput>;
  apiKey?: string;
}

export interface ImportSourcesResponse {
  success: number;
  failed: number;
  errors: string[];
}

export const SOURCE_ERROR_CODES = {
  SOURCE_NOT_FOUND: 'SRC001',
  SOURCE_NAME_DUPLICATE: 'SRC002',
  INVALID_SOURCE_TYPE: 'SRC003',
  INVALID_STATUS: 'SRC004',
  PERMISSION_DENIED: 'SRC005',
  VALIDATION_ERROR: 'SRC006',
  INTERNAL_ERROR: 'SRC007'
} as const;

export type SourceErrorCode = typeof SOURCE_ERROR_CODES[keyof typeof SOURCE_ERROR_CODES];

export interface ApiErrorResponse {
  error: string;
  code?: SourceErrorCode;
  message?: string;
  details?: unknown;
  validTypes?: readonly string[];
}
