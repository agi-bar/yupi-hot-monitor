const API_BASE = '/api';

export interface SourceConfig {
  id: string;
  name: string;
  type: 'social' | 'search' | 'news' | 'video';
  icon?: string;
  enabled: boolean;
  priority: number;
  description?: string;
}

export interface SourceTypeConfig {
  social: string;
  search: string;
  news: string;
  video: string;
}

export interface SourceConfigResponse {
  success: boolean;
  data: SourceConfig[];
  meta?: {
    total: number;
    types: SourceTypeConfig;
  };
}

export async function fetchSourcesConfig(enabled?: boolean): Promise<SourceConfig[]> {
  const endpoint = enabled ? '/sources/config?enabled=true' : '/sources/config';
  const response = await fetch(`${API_BASE}${endpoint}`);

  if (!response.ok) {
    throw new Error('Failed to fetch sources config');
  }

  const result: SourceConfigResponse = await response.json();
  return result.data;
}

export async function fetchSourceTypes(): Promise<SourceTypeConfig> {
  const response = await fetch(`${API_BASE}/sources/types`);

  if (!response.ok) {
    throw new Error('Failed to fetch source types');
  }

  const result = await response.json();
  return result.data;
}

export async function fetchSourcesByType(type: string): Promise<SourceConfig[]> {
  const response = await fetch(`${API_BASE}/sources/config?type=${type}`);

  if (!response.ok) {
    throw new Error('Failed to fetch sources by type');
  }

  const result: SourceConfigResponse = await response.json();
  return result.data;
}
