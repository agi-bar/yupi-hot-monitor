export type TimeRangeValue = '1h' | 'today' | '7d' | '30d' | '';

export interface FilterState {
  source: string;
  sourceRecordId: string;
  importance: string;
  keywordId: string;
  timeRange: TimeRangeValue;
  isReal: string;
  sortBy: string;
  sortOrder: string;
}

export const defaultFilterState: FilterState = {
  source: '',
  sourceRecordId: '',
  importance: '',
  keywordId: '',
  timeRange: '',
  isReal: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};
