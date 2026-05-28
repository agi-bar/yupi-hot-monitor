export interface FilterState {
  source: string;
  sourceRecordId: string;
  importance: string;
  keywordId: string;
  timeRange: string;
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
