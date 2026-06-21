import { useSyncExternalStore } from 'react';

import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, Session } from '../../types';

type HomeScreenStyles = Record<string, any>;

export type MomentDetailRuntimeState = {
  canRequestGeminiEvidence: boolean;
  debugEndpoint?: string;
  deletingSessionIds: Record<string, boolean>;
  extractingEvidenceBySessionId: Record<string, boolean>;
  geminiEvidenceBySessionId: Record<string, GeminiEvidenceResult>;
  handleDeleteSession: (session: Session) => void;
  handleExtractEvidence: (
    session: Session,
    options?: {
      openSheet?: boolean;
      videoOverride?: SessionVideoAsset;
      momentIdOverride?: string;
    },
  ) => void | Promise<void>;
  isReady: boolean;
  sessions: Session[];
  styles: HomeScreenStyles;
  thumbnailsBySessionId: Record<string, string>;
  videosBySessionId: Record<string, SessionVideoAsset>;
};

const emptyStyles: HomeScreenStyles = {};

let currentState: MomentDetailRuntimeState = {
  canRequestGeminiEvidence: false,
  deletingSessionIds: {},
  extractingEvidenceBySessionId: {},
  geminiEvidenceBySessionId: {},
  handleDeleteSession: () => {},
  handleExtractEvidence: () => {},
  isReady: false,
  sessions: [],
  styles: emptyStyles,
  thumbnailsBySessionId: {},
  videosBySessionId: {},
};

const listeners = new Set<() => void>();

export function setMomentDetailRuntimeState(nextState: MomentDetailRuntimeState) {
  currentState = nextState;
  listeners.forEach((listener) => listener());
}

export function useMomentDetailRuntimeState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentState;
}
