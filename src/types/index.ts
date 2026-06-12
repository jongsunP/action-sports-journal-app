export type ID = string;
export type ISODateString = string;

export type ActivityGroup = {
  id: ID;
  name: string;
  description?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type Session = {
  id: ID;
  activityGroupId: ID;
  title: string;
  notes?: string;
  occurredAt: ISODateString;
  videoUri?: string;
  analysisResultId?: ID;
  shareResultIds: ID[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
};

export type AnalysisStatus = 'idle' | 'running' | 'completed' | 'failed';

export type HighlightScene = {
  id: ID;
  timestampLabel: string;
  title: string;
  description: string;
  imageUri?: string;
};

export type AnalysisResult = {
  id: ID;
  sessionId: ID;
  status: AnalysisStatus;
  summary: string;
  highlights: string[];
  highlightScenes?: HighlightScene[];
  suggestions: string[];
  createdAt: ISODateString;
};

export type ShareResult = {
  id: ID;
  sessionId: ID;
  kind: 'growth-card' | 'highlight-card';
  title: string;
  imageUri?: string;
  createdAt: ISODateString;
};
