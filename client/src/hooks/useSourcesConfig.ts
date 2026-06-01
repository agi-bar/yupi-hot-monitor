import { useState, useEffect } from 'react';
import { fetchSourcesConfig, type SourceConfig } from '../services/sourcesConfig';

export function useSourcesConfig() {
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  async function loadSources() {
    try {
      setLoading(true);
      const data = await fetchSourcesConfig(true);
      setSources(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
      console.error('Failed to load sources config:', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    sources,
    loading,
    error,
    refetch: loadSources,
  };
}

export function useSourceOptions() {
  const { sources, loading } = useSourcesConfig();

  const sourceOptions = sources.map(source => ({
    value: source.id,
    label: source.name,
    type: source.type || 'social',
    priority: source.priority,
  }));

  return {
    options: [{ value: '', label: '全部来源' }, ...sourceOptions] as Array<{
      value: string;
      label: string;
      type?: string;
      priority?: number;
    }>,
    rawSources: sources,
    loading,
  };
}
