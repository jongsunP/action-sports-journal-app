import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  type SessionVideoAsset,
} from '../../services/ai';
import {
  createMomentFromSourceVideo,
  hasConfiguredSupabaseMoments,
} from '../../services/moments';
import {
  createSessionVideoThumbnail,
  hasConfiguredVideoThumbnailEndpoint,
} from '../../services/video/createSessionVideoThumbnail';

import type { Session } from '../../types';
import type { AppTabId } from './sessionComponents';

type ExtractEvidenceOptions = {
  openSheet?: boolean;
  videoOverride?: SessionVideoAsset;
  momentIdOverride?: string;
};

type UseUploadMomentParams = {
  activityGroupId?: string;
  extractEvidence: (
    session: Session,
    options?: ExtractEvidenceOptions,
  ) => Promise<void>;
  setActiveTab: (tabId: AppTabId) => void;
  setRemoteMomentIdForSession: (
    sessionId: string,
    remoteMomentId: string,
  ) => void;
  setSessions: Dispatch<SetStateAction<Session[]>>;
  setThumbnailForSession: (sessionId: string, thumbnailUri: string) => void;
  setVideoForSession: (sessionId: string, video: SessionVideoAsset) => void;
  updateLocalMomentStatus: (
    sessionId: string,
    momentStatus: Session['momentStatus'],
  ) => void;
};

export function useUploadMoment({
  activityGroupId,
  extractEvidence,
  setActiveTab,
  setRemoteMomentIdForSession,
  setSessions,
  setThumbnailForSession,
  setVideoForSession,
  updateLocalMomentStatus,
}: UseUploadMomentParams) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isUploadingSession, setIsUploadingSession] = useState(false);
  const isUploadingSessionRef = useRef(false);
  const uploadThumbnailRequestIdRef = useRef(0);
  const selectedVideoThumbnailUriRef = useRef<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SessionVideoAsset | null>(
    null,
  );
  const [selectedVideoThumbnailUri, setSelectedVideoThumbnailUri] = useState<
    string | null
  >(null);
  const [
    isPreparingSelectedVideoThumbnail,
    setIsPreparingSelectedVideoThumbnail,
  ] = useState(false);

  const canCreateVideoThumbnail = hasConfiguredVideoThumbnailEndpoint();
  const canUploadSession = useMemo(
    () =>
      Boolean(selectedVideo) &&
      !isUploadingSession &&
      !isPreparingSelectedVideoThumbnail,
    [isPreparingSelectedVideoThumbnail, isUploadingSession, selectedVideo],
  );

  const closeUploadSheet = () => {
    if (isUploadingSession) {
      return;
    }

    setIsComposerOpen(false);
    setSelectedVideo(null);
    selectedVideoThumbnailUriRef.current = null;
    setSelectedVideoThumbnailUri(null);
    setIsPreparingSelectedVideoThumbnail(false);
  };

  const createThumbnailForSession = async (
    sessionId: string,
    video: SessionVideoAsset,
  ) => {
    if (!canCreateVideoThumbnail) {
      return;
    }

    try {
      const imageUri = await createSessionVideoThumbnail(video);

      setThumbnailForSession(sessionId, imageUri);
    } catch {
      // Thumbnail generation is best-effort. The feed keeps its visual fallback.
    }
  };

  const prepareSelectedVideoThumbnail = async (video: SessionVideoAsset) => {
    const requestId = uploadThumbnailRequestIdRef.current + 1;
    uploadThumbnailRequestIdRef.current = requestId;
    selectedVideoThumbnailUriRef.current = null;
    setSelectedVideoThumbnailUri(null);
    setIsPreparingSelectedVideoThumbnail(true);

    try {
      const imageUri = await createSessionVideoThumbnail(video, {
        allowRemoteFallback: false,
        timeoutMs: 1800,
      });

      if (uploadThumbnailRequestIdRef.current !== requestId) {
        return;
      }

      selectedVideoThumbnailUriRef.current = imageUri;
      setSelectedVideoThumbnailUri(imageUri);
    } catch (error) {
      if (uploadThumbnailRequestIdRef.current !== requestId) {
        return;
      }

      console.warn(
        'Selected video thumbnail preparation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      selectedVideoThumbnailUriRef.current = null;
      setSelectedVideoThumbnailUri(null);
    } finally {
      if (uploadThumbnailRequestIdRef.current === requestId) {
        setIsPreparingSelectedVideoThumbnail(false);
      }
    }
  };

  const handlePickVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        '사진 접근 권한이 필요합니다',
        '라이딩 영상을 선택하려면 사진 보관함 접근을 허용해주세요.',
      );
      return false;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });

    if (result.canceled) {
      return false;
    }

    const asset = result.assets[0];

    if (!asset || asset.type !== 'video') {
      Alert.alert('영상이 필요합니다', '분석할 영상을 선택해주세요.');
      return false;
    }

    const nextVideo = {
      uri: asset.uri,
      fileName: asset.fileName,
      fileSize: asset.fileSize,
      mimeType: asset.mimeType,
      duration: asset.duration,
    };

    setSelectedVideo(nextVideo);
    void prepareSelectedVideoThumbnail(nextVideo);

    return true;
  };

  const handleOpenUploadSheet = async () => {
    if (isUploadingSession) {
      return;
    }

    const didPickVideo = await handlePickVideo();

    if (didPickVideo) {
      setIsComposerOpen(true);
    }
  };

  const handleAddSession = () => {
    if (
      !activityGroupId ||
      !selectedVideo ||
      isUploadingSession ||
      isPreparingSelectedVideoThumbnail ||
      isUploadingSessionRef.current
    ) {
      return;
    }

    isUploadingSessionRef.current = true;
    setIsUploadingSession(true);

    const videoForUpload = selectedVideo;
    const now = new Date().toISOString();
    const nextSession: Session = {
      id: createLocalSessionId(),
      activityGroupId,
      occurredAt: now,
      videoUri: videoForUpload.uri,
      momentStatus: 'uploading',
      shareResultIds: [],
      createdAt: now,
      updatedAt: now,
    };

    setSessions((current) => [nextSession, ...current]);

    setVideoForSession(nextSession.id, videoForUpload);
    const preparedThumbnailUri =
      selectedVideoThumbnailUriRef.current ?? selectedVideoThumbnailUri;

    if (preparedThumbnailUri) {
      setThumbnailForSession(nextSession.id, preparedThumbnailUri);
    } else {
      createThumbnailForSession(nextSession.id, videoForUpload);
    }
    setActiveTab('video');
    setSelectedVideo(null);
    selectedVideoThumbnailUriRef.current = null;
    setSelectedVideoThumbnailUri(null);

    void (async () => {
      let uploadStartedAt: number | undefined;

      try {
        if (!hasConfiguredSupabaseMoments()) {
          await extractEvidence(nextSession, {
            openSheet: false,
            videoOverride: videoForUpload,
          });
          return;
        }

        uploadStartedAt = Date.now();

        console.info('[upload_timing]', {
          event: 'upload_start',
          fileSize: videoForUpload.fileSize,
          localSessionId: nextSession.id,
        });

        const storedMoment = await createMomentFromSourceVideo(
          nextSession,
          videoForUpload,
        );

        if (!storedMoment) {
          console.info('[upload_timing]', {
            elapsedMs: Date.now() - uploadStartedAt,
            event: 'upload_failure',
            localSessionId: nextSession.id,
            reason: 'no_stored_moment',
          });
          updateLocalMomentStatus(nextSession.id, 'upload_failed');
          Alert.alert(
            '영상 업로드에 실패했습니다',
            '분석을 시작하려면 원본 영상을 서버에 먼저 업로드해야 합니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
          );
          return;
        }

        setRemoteMomentIdForSession(nextSession.id, storedMoment.momentId);

        const nextMomentStatus =
          storedMoment.analysisJobStatus === 'processing' ||
          storedMoment.analysisStarted
            ? 'processing'
            : 'queued';

        console.info('[upload_timing]', {
          elapsedMs: Date.now() - uploadStartedAt,
          event: 'upload_success',
          localSessionId: nextSession.id,
          momentId: storedMoment.momentId,
          nextMomentStatus,
        });

        updateLocalMomentStatus(nextSession.id, nextMomentStatus);
        setIsComposerOpen(false);
      } catch (error) {
        console.info('[upload_timing]', {
          elapsedMs:
            typeof uploadStartedAt === 'number'
              ? Date.now() - uploadStartedAt
              : undefined,
          event: 'upload_failure',
          localSessionId: nextSession.id,
          reason: error instanceof Error ? error.message : 'unknown',
        });
        updateLocalMomentStatus(nextSession.id, 'upload_failed');
        setIsComposerOpen(false);
        console.warn(
          'Stored Moment source upload failed:',
          error instanceof Error ? error.message : 'Unknown error',
        );
        Alert.alert(
          '영상 업로드에 실패했습니다',
          '업로드가 완료되지 않아 분석을 시작하지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.',
        );
      } finally {
        isUploadingSessionRef.current = false;
        setIsUploadingSession(false);
      }
    })();
  };

  return {
    canUploadSession,
    closeUploadSheet,
    handleAddSession,
    handleOpenUploadSheet,
    handlePickVideo,
    isComposerOpen,
    isPreparingSelectedVideoThumbnail,
    isUploadingSession,
    selectedVideo,
  };
}

function createLocalSessionId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  const randomHex = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);

  return [
    `${randomHex()}${randomHex()}`,
    randomHex(),
    `4${randomHex().slice(1)}`,
    `${(8 + Math.floor(Math.random() * 4)).toString(16)}${randomHex().slice(1)}`,
    `${randomHex()}${randomHex()}${randomHex()}`,
  ].join('-');
}
