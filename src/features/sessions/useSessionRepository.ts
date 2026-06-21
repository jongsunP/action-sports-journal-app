import { useCallback, useState } from 'react';

import type { SessionVideoAsset } from '../../services/ai';
import type { AnalysisResult, GeminiEvidenceResult, Session } from '../../types';
import { mockSessions } from './mockSessions';

export function useSessionRepository() {
  const [sessions, setSessions] = useState<Session[]>(mockSessions);
  const [videosBySessionId, setVideosBySessionId] = useState<
    Record<string, SessionVideoAsset>
  >({});
  const [analysisBySessionId, setAnalysisBySessionId] = useState<
    Record<string, AnalysisResult>
  >({});
  const [openAiBenchmarkBySessionId, setOpenAiBenchmarkBySessionId] = useState<
    Record<string, AnalysisResult>
  >({});
  const [geminiEvidenceBySessionId, setGeminiEvidenceBySessionId] = useState<
    Record<string, GeminiEvidenceResult>
  >({});
  const [userConfirmedTrickBySessionId, setUserConfirmedTrickBySessionId] =
    useState<Record<string, string>>({});
  const [thumbnailsBySessionId, setThumbnailsBySessionId] = useState<
    Record<string, string>
  >({});
  const [remoteMomentIdsBySessionId, setRemoteMomentIdsBySessionId] = useState<
    Record<string, string>
  >({});

  const updateSession = useCallback(
    (sessionId: string, patch: Partial<Session>) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                ...patch,
              }
            : session,
        ),
      );
    },
    [],
  );

  const removeSessionLocally = useCallback((sessionId: string) => {
    setSessions((current) => current.filter((item) => item.id !== sessionId));
    setVideosBySessionId((current) => removeRecordKey(current, sessionId));
    setAnalysisBySessionId((current) => removeRecordKey(current, sessionId));
    setGeminiEvidenceBySessionId((current) => removeRecordKey(current, sessionId));
    setUserConfirmedTrickBySessionId((current) => removeRecordKey(current, sessionId));
    setOpenAiBenchmarkBySessionId((current) => removeRecordKey(current, sessionId));
    setThumbnailsBySessionId((current) => removeRecordKey(current, sessionId));
    setRemoteMomentIdsBySessionId((current) => removeRecordKey(current, sessionId));
  }, []);

  const setVideoForSession = useCallback(
    (sessionId: string, video: SessionVideoAsset) => {
      setVideosBySessionId((current) => ({
        ...current,
        [sessionId]: video,
      }));
    },
    [],
  );

  const setThumbnailForSession = useCallback(
    (sessionId: string, thumbnailUri: string) => {
      setThumbnailsBySessionId((current) => ({
        ...current,
        [sessionId]: thumbnailUri,
      }));
    },
    [],
  );

  const setRemoteMomentIdForSession = useCallback(
    (sessionId: string, remoteMomentId: string) => {
      setRemoteMomentIdsBySessionId((current) => ({
        ...current,
        [sessionId]: remoteMomentId,
      }));
    },
    [],
  );

  return {
    analysisBySessionId,
    geminiEvidenceBySessionId,
    openAiBenchmarkBySessionId,
    remoteMomentIdsBySessionId,
    removeSessionLocally,
    sessions,
    setAnalysisBySessionId,
    setGeminiEvidenceBySessionId,
    setOpenAiBenchmarkBySessionId,
    setRemoteMomentIdForSession,
    setRemoteMomentIdsBySessionId,
    setSessionVideo: setVideoForSession,
    setSessions,
    setThumbnailForSession,
    setThumbnailsBySessionId,
    setUserConfirmedTrickBySessionId,
    setVideoForSession,
    setVideosBySessionId,
    thumbnailsBySessionId,
    updateSession,
    userConfirmedTrickBySessionId,
    videosBySessionId,
  };
}

function removeRecordKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...remaining } = record;

  return remaining;
}
