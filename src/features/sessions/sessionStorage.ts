import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SessionVideoAsset } from '../../services/ai';
import type { AnalysisResult, GeminiEvidenceResult, Session } from '../../types';
import type { UploadReconciliationCandidate } from './sessionMerge';

export const SESSION_STORAGE_KEY = 'action-sports-journal:sessions:v1';

export type PersistedSessionState = {
  selectedGroupId?: string;
  sessions?: Session[];
  videosBySessionId?: Record<string, SessionVideoAsset>;
  analysisBySessionId?: Record<string, AnalysisResult>;
  openAiBenchmarkBySessionId?: Record<string, AnalysisResult>;
  geminiEvidenceBySessionId?: Record<string, GeminiEvidenceResult>;
  userConfirmedTrickBySessionId?: Record<string, string>;
  thumbnailsBySessionId?: Record<string, string>;
  remoteMomentIdsBySessionId?: Record<string, string>;
  uploadReconciliationCandidatesBySessionId?: Record<
    string,
    UploadReconciliationCandidate
  >;
};

export async function loadPersistedSessionState() {
  const rawValue = await AsyncStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawValue) {
    return undefined;
  }

  return JSON.parse(rawValue) as PersistedSessionState;
}

export function savePersistedSessionState(state: PersistedSessionState) {
  return AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
}
