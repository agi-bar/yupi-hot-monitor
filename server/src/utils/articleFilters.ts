import type { SearchResult } from '../types.js';

const MAX_ARTICLE_AGE_DAYS = 30;

export function isRecentArticle(publishedAt: Date | undefined): boolean {
  if (!publishedAt) {
    return true;
  }
  
  const now = new Date();
  const diffTime = now.getTime() - publishedAt.getTime();
  
  if (diffTime < 0) {
    console.warn(`Article has future date: ${publishedAt.toISOString()}, filtering out`);
    return false;
  }
  
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays <= MAX_ARTICLE_AGE_DAYS;
}

export function filterRecentArticles(results: SearchResult[]): SearchResult[] {
  const filtered = results.filter(result => isRecentArticle(result.publishedAt));
  
  if (filtered.length < results.length) {
    console.log(`Filtered out ${results.length - filtered.length} old articles (older than ${MAX_ARTICLE_AGE_DAYS} days)`);
  }
  
  return filtered;
}
