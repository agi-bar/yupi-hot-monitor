export interface SourceRecord {
  id: string;
  name: string;
  type: string;
  category: string | null;
}

export interface Keyword {
  id: string;
  text: string;
  category: string | null;
}

export interface Hotspot {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  sourceId: string | null;
  sourceRecordId: string | null;
  sourceRecord: SourceRecord | null;
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
  keyword: Keyword | null;
}

export type ImportanceLevel = Hotspot['importance'];

export interface HotspotEvent extends Hotspot {
  hotspotId?: string;
}
