import { useCallback, useMemo, useState } from 'react';

import type { SessionVideoAsset } from '../../services/ai';
import type { GeminiEvidenceResult, Session } from '../../types';
import { getMomentStatus } from './momentStatus';
import { getVideoAssetFromSession } from './sessionFormatters';

type UseMomentDetailParams = {
  extractingEvidenceBySessionId: Record<string, boolean>;
  geminiEvidenceBySessionId: Record<string, GeminiEvidenceResult>;
  sessions: Session[];
  videosBySessionId: Record<string, SessionVideoAsset>;
};

export function useMomentDetail({
  extractingEvidenceBySessionId,
  geminiEvidenceBySessionId,
  sessions,
  videosBySessionId,
}: UseMomentDetailParams) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [playingVideoSessionId, setPlayingVideoSessionId] = useState<string | null>(
    null,
  );

  const selectedSession = useMemo(
    () =>
      selectedSessionId
        ? sessions.find((session) => session.id === selectedSessionId)
        : undefined,
    [selectedSessionId, sessions],
  );

  const selectedSessionVideo = useMemo(
    () =>
      selectedSession
        ? videosBySessionId[selectedSession.id] ?? getVideoAssetFromSession(selectedSession)
        : null,
    [selectedSession, videosBySessionId],
  );

  const selectedMomentStatus = useMemo(
    () =>
      selectedSession
        ? getMomentStatus({
            evidence: geminiEvidenceBySessionId[selectedSession.id],
            isProcessing: Boolean(extractingEvidenceBySessionId[selectedSession.id]),
            sessionStatus: selectedSession.momentStatus,
          })
        : undefined,
    [extractingEvidenceBySessionId, geminiEvidenceBySessionId, selectedSession],
  );

  const openMomentDetail = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setPlayingVideoSessionId(null);
  }, []);

  const selectMomentDetail = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  const closeMomentDetail = useCallback(() => {
    setSelectedSessionId(null);
    setPlayingVideoSessionId(null);
  }, []);

  const closeMomentDetailIfSelected = useCallback(
    (sessionId: string) => {
      if (selectedSessionId === sessionId) {
        closeMomentDetail();
      }
    },
    [closeMomentDetail, selectedSessionId],
  );

  return {
    closeMomentDetail,
    closeMomentDetailIfSelected,
    openMomentDetail,
    playingVideoSessionId,
    selectedMomentStatus,
    selectedSession,
    selectedSessionId,
    selectedSessionVideo,
    selectMomentDetail,
  };
}
