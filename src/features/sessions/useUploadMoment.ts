import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
import {
  finalizeUploadedDraftSource,
  uploadDraftSourceVideoDirectly,
} from './uploadDraftDirectUpload';
import {
  clearUploadDraft,
  createUploadDraftFromVideo,
  getVideoFromUploadDraft,
  loadUploadDraft,
  saveUploadDraft,
  updateUploadDraft,
  type UploadDraft,
  type UploadDraftStatus,
} from './uploadDraftStorage';

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
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
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
      Boolean(selectedVideo ?? uploadDraft) &&
      !isUploadingSession &&
      !isPreparingSelectedVideoThumbnail,
    [isPreparingSelectedVideoThumbnail, isUploadingSession, selectedVideo, uploadDraft],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const storedDraft = await loadUploadDraft();

      if (!isMounted || !storedDraft) {
        return;
      }

      Alert.alert(
        '이전 업로드를 이어서 하시겠습니까?',
        '아직 업로드하지 않은 영상 초안이 있습니다.',
        [
          {
            text: '새로 시작하기',
            style: 'destructive',
            onPress: () => {
              void clearUploadDraft();
              if (!isMounted) {
                return;
              }
              setUploadDraft(null);
              setSelectedVideo(null);
              selectedVideoThumbnailUriRef.current = null;
              setSelectedVideoThumbnailUri(null);
              setIsComposerOpen(false);
            },
          },
          {
            text: '이어서 하기',
            onPress: () => {
              if (!isMounted) {
                return;
              }
              const restoredVideo = getVideoFromUploadDraft(storedDraft);
              setUploadDraft(storedDraft);
              setSelectedVideo(restoredVideo);
              selectedVideoThumbnailUriRef.current =
                storedDraft.localThumbnailUri ?? null;
              setSelectedVideoThumbnailUri(
                storedDraft.localThumbnailUri ?? null,
              );
              setIsComposerOpen(true);
            },
          },
        ],
      );
    })();

    return () => {
      isMounted = false;
    };
  }, []);

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

  const prepareSelectedVideoThumbnail = async (
    video: SessionVideoAsset,
    draftId?: string,
  ) => {
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

      if (draftId) {
        setUploadDraft((currentDraft) =>
          currentDraft?.draftId === draftId
            ? {
                ...currentDraft,
                localThumbnailUri: imageUri,
                updatedAt: new Date().toISOString(),
              }
            : currentDraft,
        );
        void updateUploadDraft((currentDraft) =>
          currentDraft.draftId === draftId
            ? {
                ...currentDraft,
                localThumbnailUri: imageUri,
              }
            : currentDraft,
        );
      }
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
    const nextDraft = createUploadDraftFromVideo(nextVideo);

    setSelectedVideo(nextVideo);
    setUploadDraft(nextDraft);
    void saveUploadDraft(nextDraft);
    void prepareSelectedVideoThumbnail(nextVideo, nextDraft.draftId);

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

  const persistUploadDraftStatus = async (status: UploadDraftStatus) => {
    setUploadDraft((currentDraft) =>
      currentDraft
        ? {
            ...currentDraft,
            status,
            updatedAt: new Date().toISOString(),
          }
        : currentDraft,
    );
    await updateUploadDraft({ status });
  };

  const handleAddSession = () => {
    const videoForUpload = selectedVideo ?? draftVideoFromUploadDraft(uploadDraft);

    if (
      !activityGroupId ||
      !videoForUpload ||
      isUploadingSession ||
      isPreparingSelectedVideoThumbnail ||
      isUploadingSessionRef.current
    ) {
      return;
    }

    isUploadingSessionRef.current = true;
    setIsUploadingSession(true);

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
    void (async () => {
      let uploadStartedAt: number | undefined;
      let usedUploadFallback = false;

      try {
        await persistUploadDraftStatus('uploading');

        if (!hasConfiguredSupabaseMoments()) {
          await extractEvidence(nextSession, {
            openSheet: false,
            videoOverride: videoForUpload,
          });
          await clearUploadDraft();
          setUploadDraft(null);
          setSelectedVideo(null);
          selectedVideoThumbnailUriRef.current = null;
          setSelectedVideoThumbnailUri(null);
          setIsComposerOpen(false);
          return;
        }

        uploadStartedAt = Date.now();

        console.info('[upload_timing]', {
          event: 'upload_start',
          fileSize: videoForUpload.fileSize,
          localSessionId: nextSession.id,
        });

        let storedMoment = await createMomentFromDirectUpload({
          draft: uploadDraft,
          session: nextSession,
        });

        if (!storedMoment) {
          usedUploadFallback = true;
          storedMoment = await createMomentFromSourceVideo(
            nextSession,
            videoForUpload,
          );
        }

        if (!storedMoment) {
          console.info('[upload_timing]', {
            elapsedMs: Date.now() - uploadStartedAt,
            event: 'upload_failure',
            localSessionId: nextSession.id,
            reason: 'no_stored_moment',
          });
          setSessions((current) =>
            current.filter((session) => session.id !== nextSession.id),
          );
          await persistUploadDraftStatus('upload_failed');
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
          uploadPath: usedUploadFallback ? 'multipart_fallback' : 'direct',
        });

        updateLocalMomentStatus(nextSession.id, nextMomentStatus);
        await clearUploadDraft();
        setUploadDraft(null);
        setSelectedVideo(null);
        selectedVideoThumbnailUriRef.current = null;
        setSelectedVideoThumbnailUri(null);
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
        setSessions((current) =>
          current.filter((session) => session.id !== nextSession.id),
        );
        await persistUploadDraftStatus('upload_failed');
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
    uploadDraft,
  };
}

function draftVideoFromUploadDraft(draft: UploadDraft | null) {
  return draft ? getVideoFromUploadDraft(draft) : null;
}

async function createMomentFromDirectUpload({
  draft,
  session,
}: {
  draft: UploadDraft | null;
  session: Session;
}) {
  if (!draft) {
    return undefined;
  }

  try {
    const uploadTarget = await uploadDraftSourceVideoDirectly(draft);

    if (!uploadTarget) {
      return undefined;
    }

    const uploadedDraft: UploadDraft = {
      ...draft,
      status: 'uploaded',
      uploadedAt: new Date().toISOString(),
      uploadId: uploadTarget.uploadId,
      storageProvider: uploadTarget.provider,
      storageBucket: uploadTarget.bucket,
      storagePath: uploadTarget.storagePath,
    };

    return await finalizeUploadedDraftSource(uploadedDraft, session);
  } catch (error) {
    console.warn(
      'Direct upload finalize path failed; falling back to multipart upload:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return undefined;
  }
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
